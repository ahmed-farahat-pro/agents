/**
 * 🦉 Nigents - Planner Agent with MCP
 * Architecture & Planning - Creates implementation plans with codebase analysis
 * 
 * TEST: This is a test change for CodeRabbit review
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const gitlab = require('../tools/gitlab');

// TODO: Add better error handling for MCP failures
// FIXME: This needs refactoring for better testability

class PlannerAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json').planner;
    super(config);
    
    // Test property for CodeRabbit review
    this.tempApiKey = "sk-test-1234567890abcdef"; // FIXME: Remove hardcoded key
  }
  
  /**
   * Test helper function - CodeRabbit should review this
   * @param {string} input - User input
   * @returns {string} processed result
   */
  processInput(input) {
    // Security issue: No input validation
    eval(input); // DANGEROUS: Never use eval!
    
    // Performance issue: Inefficient string concatenation
    let result = "";
    for (let i = 0; i < input.length; i++) {
      result = result + input[i];
    }
    
    return result;
  }

  /**
   * Create an implementation plan for a task
   */
  async createPlan({ task, project, context = {} }) {
    this.setStatus('working', { task: 'creating_plan', description: task });
    this.currentTask = task;

    try {
      // Set user-preferred AI provider if specified in context (orchestrator may have already set it)
      const preferredProvider = context.aiProvider || context.preferredProvider || context.preferredAI;
      const preferredModel = context.aiModel || context.preferredModel;
      if (preferredProvider) {
        logger.info(`[Planner] Using user-preferred AI provider: ${preferredProvider}${preferredModel ? ` (${preferredModel})` : ''}`);
        // Only set if different from current to avoid redundant logging
        if (this.provider !== preferredProvider || this.model !== preferredModel) {
          this.setAIProvider(preferredProvider, preferredModel);
        }
      }

      // Step 1: Analyze codebase if project is specified
      let codebaseAnalysis = '';
      if (project) {
        this.emit('progress', { stage: 'analyzing_codebase', message: `Reading ${project} repository...` });
        
        // Try MCP first, then fall back to GitLab API
        codebaseAnalysis = await this.analyzeCodebaseWithMCP(project, task);
      }

      // Step 2: Generate implementation plan using MCP tools
      this.emit('progress', { stage: 'generating_plan', message: 'Creating implementation plan...' });
      
      const plan = await this.generatePlanWithMCP(task, codebaseAnalysis, project, preferredProvider, preferredModel);

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
    // Initialize with empty analysis - we'll populate if we can
    const analysis = {
      repoFiles: [],
      relevantFiles: [],
      fileContents: [],
    };

    try {
      const workspacePath = `/workspace/${project}`;

      // Try to get directory structure via MCP
      try {
        const dirResult = await this.mcpWrapper.quickTool('list_directory', {
          path: workspacePath,
        });
        analysis.repoFiles = this.parseDirectoryListing(dirResult);
      } catch (e) {
        logger.debug('[Planner] MCP directory listing failed, trying GitLab API...');
        // Fall back to GitLab API
        try {
          const repoFiles = await gitlab.getRepositoryFiles(project, 50);
          analysis.repoFiles = repoFiles.map(f => f.path);
        } catch (gitlabErr) {
          logger.debug('[Planner] GitLab API also failed - will create plan without codebase context');
        }
      }

      // Identify relevant files based on task keywords (only if we have repo files)
      if (analysis.repoFiles.length > 0) {
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
            logger.debug(`[Planner] Could not read ${filePath} via MCP`);
          }
        }

        // Get git status via MCP
        try {
          const gitStatus = await this.mcpWrapper.quickTool('git_status', {
            repo_path: workspacePath,
          });
          analysis.gitStatus = gitStatus;
        } catch (e) {
          // Silent fail - git status is optional
        }
      }

      return analysis;
    } catch (error) {
      logger.debug('[Planner] Codebase analysis not available:', error.message);
      return analysis; // Return empty analysis so plan can still be created
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
  async generatePlanWithMCP(task, codebaseAnalysis, project, preferredProvider = null, preferredModel = null) {
    const timestamp = Date.now();
    
    const prompt = `You are an expert software architect. Create a detailed implementation plan.

TASK: ${task}
${project ? `PROJECT: ${project}` : 'Project: web application'}

${codebaseAnalysis.repoFiles ? `
REPOSITORY STRUCTURE:
${codebaseAnalysis.repoFiles.slice(0, 30).join('\n')}
` : ''}

${codebaseAnalysis.relevantFiles ? `
RELEVANT FILES:
${codebaseAnalysis.relevantFiles.join('\n')}
` : ''}

CRITICAL INSTRUCTIONS:
1. Respond ONLY with valid JSON
2. Do NOT include markdown code blocks (no \`\`\`json)
3. Do NOT include any explanatory text
4. The response must be parseable by JSON.parse()
5. Include at least 3-5 detailed steps
6. Each step must have a clear description and relevant files

EXAMPLE RESPONSE:
{"title":"Implement User Login Page","description":"Create a responsive login page with form validation, error handling, and JWT token storage.","complexity":"M","estimatedHours":4,"steps":[{"order":1,"description":"Create LoginForm component with email/password inputs and validation","files":["src/components/LoginForm.jsx"],"type":"create"},{"order":2,"description":"Add login API service function to handle authentication requests","files":["src/services/auth.js"],"type":"create"},{"order":3,"description":"Implement form submission handler with error state management","files":["src/components/LoginForm.jsx"],"type":"modify"},{"order":4,"description":"Add CSS styling for responsive design and error messages","files":["src/styles/login.css"],"type":"create"},{"order":5,"description":"Write unit tests for form validation and API integration","files":["src/components/LoginForm.test.js"],"type":"create"}],"filesToModify":[],"filesToCreate":["src/components/LoginForm.jsx","src/services/auth.js","src/styles/login.css","src/components/LoginForm.test.js"],"dependencies":["react-hook-form","axios"],"testingNotes":"Test validation, API errors, and responsive layout","branch":"nigents/task-${timestamp}"}

NOW CREATE YOUR JSON RESPONSE FOR: ${task}`;

    // Try MCP first, fall back to direct AI call
    let result;
    try {
      result = await this.executeWithMCP(prompt, { 
        task: 'create_plan',
        project,
      });
    } catch (mcpError) {
      logger.warn('[Planner] MCP failed, falling back to direct AI call:', mcpError.message);
      
      // Fallback to direct AI call with user-preferred provider/model
      const aiResult = await this.callAI(prompt, {
        provider: this.provider,
        model: this.model,
        maxTokens: 4096,
      });
      
      if (!aiResult.success) {
        throw new Error('Failed to generate plan: ' + aiResult.error);
      }
      
      result = {
        success: true,
        content: aiResult.content,
      };
    }

    if (!result.success) {
      throw new Error('Failed to generate plan: ' + result.error);
    }

    // Log the raw response for debugging
    logger.info(`[Planner] AI response length: ${result.content.length} chars`);
    logger.debug(`[Planner] Raw AI response preview: ${result.content.substring(0, 200)}...`);

    // Extract JSON from response - try multiple approaches
    let plan = null;
    let parseAttempts = [];
    
    // Attempt 1: Try to find JSON between triple backticks
    try {
      const codeBlockMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        plan = JSON.parse(codeBlockMatch[1].trim());
        parseAttempts.push('code block');
      }
    } catch (e) {
      logger.debug('[Planner] Code block parse failed:', e.message);
    }
    
    // Attempt 2: Try to find JSON between curly braces (greedy)
    if (!plan) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[0]);
          parseAttempts.push('curly braces');
        }
      } catch (e) {
        logger.debug('[Planner] Curly braces parse failed:', e.message);
      }
    }
    
    // Attempt 3: Try the whole trimmed content
    if (!plan) {
      try {
        plan = JSON.parse(result.content.trim());
        parseAttempts.push('full content');
      } catch (e) {
        logger.debug('[Planner] Full content parse failed:', e.message);
      }
    }
    
    // If all parsing failed, create a fallback plan
    if (!plan) {
      logger.warn('[Planner] All JSON parsing attempts failed, creating fallback plan');
      logger.warn('[Planner] Raw response:', result.content.substring(0, 1000));
      
      // Create a fallback plan based on the task
      plan = this.createFallbackPlan(task, project);
    } else {
      logger.info(`[Planner] JSON parsed successfully using: ${parseAttempts.join(', ')}`);
    }
    
    // Ensure required fields exist with proper defaults
    if (!plan.title || typeof plan.title !== 'string') {
      plan.title = task.split(' ').slice(0, 6).join(' ') + '...';
    }
    if (!plan.description || typeof plan.description !== 'string') {
      plan.description = `Implementation plan for: ${task}`;
    }
    if (!plan.complexity || !['S', 'M', 'L'].includes(plan.complexity)) {
      plan.complexity = 'M';
    }
    if (!plan.estimatedHours || typeof plan.estimatedHours !== 'number') {
      plan.estimatedHours = 2;
    }
    if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      // Generate default steps if none provided
      plan.steps = [
        { order: 1, description: 'Analyze requirements and existing codebase', files: [], type: 'review' },
        { order: 2, description: 'Implement core functionality for: ' + task, files: [], type: 'modify' },
        { order: 3, description: 'Add tests and verify implementation', files: [], type: 'review' },
        { order: 4, description: 'Code review and final testing', files: [], type: 'review' }
      ];
    }
    if (!plan.filesToModify || !Array.isArray(plan.filesToModify)) plan.filesToModify = [];
    if (!plan.filesToCreate || !Array.isArray(plan.filesToCreate)) plan.filesToCreate = [];
    if (!plan.dependencies || !Array.isArray(plan.dependencies)) plan.dependencies = [];
    if (!plan.testingNotes || typeof plan.testingNotes !== 'string') plan.testingNotes = 'Manual testing required';
    
    // Add metadata
    plan.id = `plan-${Date.now()}`;
    plan.createdAt = new Date().toISOString();
    plan.project = project;
    plan.originalTask = task;
    plan.branch = plan.branch || `nigents/task-${Date.now()}`;

    return plan;
  }

  /**
   * Create a fallback plan when AI parsing fails
   */
  createFallbackPlan(task, project) {
    logger.info(`[Planner] Creating fallback plan for: ${task}`);
    
    // Extract key terms from task
    const taskLower = task.toLowerCase();
    let title = task.split(' ').slice(0, 5).join(' ');
    let estimatedHours = 2;
    let complexity = 'M';
    
    // Estimate complexity based on keywords
    if (taskLower.includes('login') || taskLower.includes('auth')) {
      estimatedHours = 4;
      complexity = 'M';
    } else if (taskLower.includes('api') || taskLower.includes('endpoint')) {
      estimatedHours = 3;
      complexity = 'M';
    } else if (taskLower.includes('page') || taskLower.includes('ui') || taskLower.includes('design')) {
      estimatedHours = 2;
      complexity = 'S';
    } else if (taskLower.includes('database') || taskLower.includes('migration')) {
      estimatedHours = 3;
      complexity = 'M';
    } else if (taskLower.includes('microservice') || taskLower.includes('architecture')) {
      estimatedHours = 8;
      complexity = 'L';
    }
    
    return {
      title: title,
      description: `Implementation of: ${task}. This plan was auto-generated based on the task description.`,
      complexity: complexity,
      estimatedHours: estimatedHours,
      steps: [
        { 
          order: 1, 
          description: 'Analyze requirements and review existing code structure', 
          files: [], 
          type: 'review' 
        },
        { 
          order: 2, 
          description: `Implement ${task}`, 
          files: [], 
          type: 'modify' 
        },
        { 
          order: 3, 
          description: 'Write unit tests for the implementation', 
          files: [], 
          type: 'create' 
        },
        { 
          order: 4, 
          description: 'Run tests and fix any issues', 
          files: [], 
          type: 'review' 
        },
        { 
          order: 5, 
          description: 'Code review and final verification', 
          files: [], 
          type: 'review' 
        }
      ],
      filesToModify: [],
      filesToCreate: [],
      dependencies: [],
      testingNotes: 'Test the implementation thoroughly before deployment',
      branch: `nigents/task-${Date.now()}`,
      _isFallback: true
    };
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
    message += `**${plan.title || 'Untitled Plan'}**\n`;
    message += `${plan.description || 'No description provided'}\n\n`;
    message += `Complexity: ${complexityEmoji[plan.complexity] || '⚪'} ${plan.complexity || 'Unknown'}\n`;
    message += `Estimated: ${plan.estimatedHours || '?'} hours\n\n`;
    
    if (plan.steps && Array.isArray(plan.steps) && plan.steps.length > 0) {
      message += `**Steps:**\n`;
      plan.steps.forEach(step => {
        message += `${step.order || 1}. ${step.description || 'No description'}\n`;
        if (step.files && step.files.length > 0) {
          message += `   📁 ${step.files.join(', ')}\n`;
        }
      });
    } else {
      message += `**Steps:** No steps defined\n`;
    }

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

  /**
   * Execute task - required by BaseAgent
   */
  async execute(task) {
    return this.createPlan(task);
  }
}

module.exports = PlannerAgent;
