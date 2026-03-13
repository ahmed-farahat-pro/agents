/**
 * 🦉 Nigents - Planner Agent with MCP
 * Architecture & Planning - Creates implementation plans with codebase analysis
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const gitlab = require('../tools/gitlab');

class PlannerAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json').planner;
    super(config);
  }

  /**
   * Create an implementation plan for a task
   */
  async createPlan({ task, project, context = {} }) {
    this.setStatus('working', { task: 'creating_plan', description: task });
    this.currentTask = task;

    try {
      // Step 1: Analyze codebase if project is specified
      let codebaseAnalysis = '';
      if (project) {
        this.emit('progress', { stage: 'analyzing_codebase', message: `Reading ${project} repository...` });
        
        // Try MCP first, then fall back to GitLab API
        codebaseAnalysis = await this.analyzeCodebaseWithMCP(project, task);
      }

      // Step 2: Generate implementation plan using MCP tools
      this.emit('progress', { stage: 'generating_plan', message: 'Creating implementation plan...' });
      
      const plan = await this.generatePlanWithMCP(task, codebaseAnalysis, project);

      this.setStatus('done', { task: 'creating_plan' });
      this.emit('planReady', { plan });

      return {
        success: true,
        plan: plan,
        message: this.formatPlanForTelegram(plan),
      };
    } catch (error) {
      this.setStatus('error', { task: 'creating_plan', error: error.message });
      logger.error('[Planner] Error creating plan:', error);
      return {
        success: false,
        message: `Error creating plan: ${error.message}`,
      };
    }
  }

  /**
   * Analyze codebase using MCP filesystem and git tools
   */
  async analyzeCodebaseWithMCP(project, task) {
    try {
      const workspacePath = `/workspace/${project}`;
      
      // Use MCP to list and read files
      const analysis = {
        repoFiles: [],
        relevantFiles: [],
        fileContents: [],
      };

      // Try to get directory structure via MCP
      try {
        const dirResult = await this.mcpWrapper.quickTool('list_directory', {
          path: workspacePath,
        });
        analysis.repoFiles = this.parseDirectoryListing(dirResult);
      } catch (e) {
        logger.warn('[Planner] MCP directory listing failed, using GitLab API:', e.message);
        // Fall back to GitLab API
        const repoFiles = await gitlab.getRepositoryFiles(project, 50);
        analysis.repoFiles = repoFiles.map(f => f.path);
      }

      // Identify relevant files based on task keywords
      const taskKeywords = task.toLowerCase().split(' ');
      analysis.relevantFiles = analysis.repoFiles.filter(file => {
        const path = file.toLowerCase();
        return taskKeywords.some(keyword => 
          path.includes(keyword) && keyword.length > 3
        );
      }).slice(0, 10);

      // Read relevant file contents via MCP
      for (const filePath of analysis.relevantFiles.slice(0, 5)) {
        try {
          const fullPath = `${workspacePath}/${filePath}`;
          const content = await this.mcpWrapper.quickTool('read_file', {
            path: fullPath,
          });
          analysis.fileContents.push({
            path: filePath,
            content: typeof content === 'string' 
              ? content.substring(0, 2000) 
              : JSON.stringify(content).substring(0, 2000),
          });
        } catch (e) {
          logger.warn(`[Planner] Could not read ${filePath} via MCP:`, e.message);
        }
      }

      // Get git status via MCP
      try {
        const gitStatus = await this.mcpWrapper.quickTool('git_status', {
          repo_path: workspacePath,
        });
        analysis.gitStatus = gitStatus;
      } catch (e) {
        logger.warn('[Planner] Could not get git status via MCP:', e.message);
      }

      return analysis;
    } catch (error) {
      logger.warn('[Planner] MCP codebase analysis failed:', error.message);
      return this.analyzeCodebaseGitLab(project, task);
    }
  }

  /**
   * Parse MCP directory listing
   */
  parseDirectoryListing(result) {
    if (typeof result === 'string') {
      return result.split('\n').filter(line => line.trim());
    }
    if (Array.isArray(result)) {
      return result.map(item => typeof item === 'string' ? item : item.name || '');
    }
    return [];
  }

  /**
   * Fallback to GitLab API
   */
  async analyzeCodebaseGitLab(project, task) {
    const repoFiles = await gitlab.getRepositoryFiles(project, 50);
    
    const taskKeywords = task.toLowerCase().split(' ');
    const relevantFiles = repoFiles.filter(file => {
      const path = file.path.toLowerCase();
      return taskKeywords.some(keyword => 
        path.includes(keyword) && keyword.length > 3
      );
    }).slice(0, 10);

    const fileContents = [];
    for (const file of relevantFiles.slice(0, 5)) {
      try {
        const content = await gitlab.getFileContent(project, file.path);
        fileContents.push({
          path: file.path,
          content: content.substring(0, 2000),
        });
      } catch (e) {
        logger.warn(`[Planner] Could not read ${file.path}:`, e.message);
      }
    }

    return {
      repoFiles: repoFiles.map(f => f.path),
      relevantFiles: relevantFiles.map(f => f.path),
      fileContents,
    };
  }

  /**
   * Generate plan with MCP tool assistance
   */
  async generatePlanWithMCP(task, codebaseAnalysis, project) {
    const prompt = `
Create a detailed implementation plan for the following task:

TASK: ${task}
${project ? `PROJECT: ${project}` : ''}

${codebaseAnalysis.repoFiles ? `
REPOSITORY STRUCTURE:
${codebaseAnalysis.repoFiles.slice(0, 30).join('\n')}
` : ''}

${codebaseAnalysis.relevantFiles ? `
RELEVANT FILES IDENTIFIED:
${codebaseAnalysis.relevantFiles.join('\n')}
` : ''}

${codebaseAnalysis.fileContents ? `
KEY FILE CONTENTS:
${codebaseAnalysis.fileContents.map(f => `
--- ${f.path} ---
${f.content.substring(0, 1000)}
`).join('\n')}
` : ''}

Create a structured implementation plan with:
1. Title
2. Description
3. Step-by-step implementation steps
4. Files to modify/create
5. Complexity estimate (S/M/L)
6. Estimated time
7. Dependencies
8. Testing considerations

Respond with valid JSON in this format:
{
  "title": "Brief title",
  "description": "Detailed description",
  "complexity": "S|M|L",
  "estimatedHours": number,
  "steps": [
    {
      "order": 1,
      "description": "What to do",
      "files": ["file1.java", "file2.java"],
      "type": "create|modify|delete"
    }
  ],
  "filesToModify": ["path/to/file1", "path/to/file2"],
  "filesToCreate": ["path/to/newfile"],
  "dependencies": ["dep1", "dep2"],
  "testingNotes": "What needs to be tested",
  "branch": "nigents/task-{timestamp}"
}
`;

    // Use MCP enhanced execution for better research
    const result = await this.executeWithMCP(prompt, { 
      task: 'create_plan',
      project,
    });

    if (!result.success) {
      throw new Error('Failed to generate plan: ' + result.error);
    }

    // Extract JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse plan JSON from response');
    }

    const plan = JSON.parse(jsonMatch[0]);
    
    // Add metadata
    plan.id = `plan-${Date.now()}`;
    plan.createdAt = new Date().toISOString();
    plan.project = project;
    plan.originalTask = task;
    plan.branch = plan.branch || `nigents/task-${Date.now()}`;

    return plan;
  }

  /**
   * Format plan for Telegram display
   */
  formatPlanForTelegram(plan) {
    const complexityEmoji = {
      'S': '🟢',
      'M': '🟡',
      'L': '🔴',
    };

    let message = `📋 **Implementation Plan**\n\n`;
    message += `**${plan.title}**\n`;
    message += `${plan.description}\n\n`;
    message += `Complexity: ${complexityEmoji[plan.complexity] || '⚪'} ${plan.complexity}\n`;
    message += `Estimated: ${plan.estimatedHours} hours\n\n`;
    
    message += `**Steps:**\n`;
    plan.steps.forEach(step => {
      message += `${step.order}. ${step.description}\n`;
      if (step.files && step.files.length > 0) {
        message += `   📁 ${step.files.join(', ')}\n`;
      }
    });

    if (plan.filesToCreate && plan.filesToCreate.length > 0) {
      message += `\n**New Files:**\n`;
      plan.filesToCreate.forEach(f => message += `+ ${f}\n`);
    }

    message += `\nReply with **/approve** to queue this for implementation.`;

    return message;
  }

  /**
   * Search codebase using MCP
   */
  async searchCodebase(project, query) {
    try {
      const result = await this.mcpWrapper.quickTool('search_files', {
        path: `/workspace/${project}`,
        pattern: query,
      });
      return result;
    } catch (error) {
      logger.error('[Planner] Search failed:', error);
      return null;
    }
  }

  /**
   * Research best practices using web search
   */
  async researchBestPractices(topic) {
    try {
      const searchResult = await this.webSearch(`${topic} best practices 2024`);
      return searchResult;
    } catch (error) {
      logger.warn('[Planner] Web search failed:', error.message);
      return null;
    }
  }
}

module.exports = PlannerAgent;
