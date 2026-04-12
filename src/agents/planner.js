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
    this._requestContext = context;

    try {
      // Set user-preferred AI provider if specified
      const preferredProvider = context.aiProvider || context.preferredProvider || context.preferredAI;
      const preferredModel = context.aiModel || context.preferredModel;
      if (preferredProvider) {
        logger.info(`[Planner] Using AI provider: ${preferredProvider}${preferredModel ? ` (${preferredModel})` : ''}`);
        if (this.provider !== preferredProvider || this.model !== preferredModel) {
          this.setAIProvider(preferredProvider, preferredModel);
        }
      }

      // Step 1: Resolve project and analyze codebase
      let resolvedProject = project;
      let codebaseAnalysis = { repoFiles: [], relevantFiles: [], fileContents: [] };
      
      if (project) {
        this.emit('progress', { stage: 'resolving_project', message: `Looking up project: ${project}...` });
        
        // Try to resolve project name to actual project
        const projectInfo = await this.resolveProject(project);
        if (projectInfo) {
          resolvedProject = projectInfo.path || projectInfo.fullPath || project;
          logger.info(`[Planner] Resolved project: ${project} -> ${resolvedProject}`);
          
          this.emit('progress', { stage: 'analyzing_codebase', message: `Analyzing ${resolvedProject}...` });
          codebaseAnalysis = await this.analyzeCodebase(resolvedProject, task);
        } else {
          logger.warn(`[Planner] Could not resolve project: ${project}`);
          this.emit('progress', { stage: 'warning', message: `Project not found: ${project}. Creating plan without codebase context.` });
        }
      }

      // Step 2: Generate implementation plan
      this.emit('progress', { stage: 'generating_plan', message: 'Creating implementation plan...' });
      
      const plan = await this.generatePlanWithMCP(task, codebaseAnalysis, resolvedProject, preferredProvider, preferredModel);

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
    } finally {
      this._requestContext = null;
    }
  }

  /**
   * Resolve project name to actual project info
   */
  async resolveProject(projectName) {
    const gl = (this._requestContext && this._requestContext.gitlab) || gitlab;
    try {
      const directProject = await gl.getProject(projectName);
      if (directProject) {
        return directProject;
      }
      
      const searchResults = await gl.searchProjects(projectName, 5);
      if (searchResults.length > 0) {
        return searchResults[0];
      }
      const allProjects = await gl.listProjects(100);
      const lowerName = projectName.toLowerCase();
      
      // Try exact match first
      let match = allProjects.find(p => 
        p.path.toLowerCase() === lowerName ||
        p.name.toLowerCase() === lowerName ||
        p.fullPath.toLowerCase() === lowerName
      );
      
      // Try partial match
      if (!match) {
        match = allProjects.find(p =>
          p.path.toLowerCase().includes(lowerName) ||
          p.name.toLowerCase().includes(lowerName)
        );
      }
      
      return match || null;
    } catch (error) {
      logger.error('[Planner] Error resolving project:', error.message);
      return null;
    }
  }

  /**
   * Analyze codebase using MCP or GitLab API
   */
  async analyzeCodebase(project, task) {
    const analysis = {
      repoFiles: [],
      relevantFiles: [],
      fileContents: [],
      source: 'none',
    };

    // Try MCP filesystem first (if project is cloned locally)
    try {
      const workspacePath = `/workspace/repos/${project}`;
      
      if (this.mcpWrapper) {
        try {
          const dirResult = await this.mcpWrapper.quickTool('list_directory', {
            path: workspacePath,
          });
          analysis.repoFiles = this.parseDirectoryListing(dirResult);
          analysis.source = 'mcp_filesystem';
          logger.info(`[Planner] Found ${analysis.repoFiles.length} files via MCP filesystem`);
        } catch (e) {
          logger.debug('[Planner] MCP filesystem not available for this project');
        }
      }
    } catch (e) {
      logger.debug('[Planner] MCP filesystem error:', e.message);
    }

    const gl = (this._requestContext && this._requestContext.gitlab) || gitlab;
    if (analysis.repoFiles.length === 0) {
      try {
        const repoFiles = await gl.getRepositoryFiles(project, 100);
        if (repoFiles.length > 0) {
          analysis.repoFiles = repoFiles.map(f => f.path);
          analysis.source = 'gitlab_api';
          logger.info(`[Planner] Found ${analysis.repoFiles.length} files via GitLab API`);
        }
      } catch (gitlabErr) {
        logger.debug('[Planner] GitLab API failed:', gitlabErr.message);
      }
    }

    // Identify relevant files based on task keywords
    if (analysis.repoFiles.length > 0) {
      const taskKeywords = task.toLowerCase()
        .split(' ')
        .filter(word => word.length > 3)
        .map(word => word.replace(/[^a-z0-9]/g, ''));
      
      analysis.relevantFiles = analysis.repoFiles.filter(file => {
        const fileLower = file.toLowerCase();
        return taskKeywords.some(keyword => fileLower.includes(keyword));
      }).slice(0, 15);

      logger.info(`[Planner] Found ${analysis.relevantFiles.length} relevant files`);

      // Try to read relevant file contents
      for (const filePath of analysis.relevantFiles.slice(0, 5)) {
        try {
          let content;
          
          // Try MCP first if available
          if (analysis.source === 'mcp_filesystem' && this.mcpWrapper) {
            try {
              const fullPath = `/workspace/repos/${project}/${filePath}`;
              content = await this.mcpWrapper.quickTool('read_file', { path: fullPath });
            } catch (e) {
              // Fall back to GitLab API
            }
          }
          
          if (!content) {
            content = await gl.getFileContent(project, filePath);
          }
          
          if (content) {
            analysis.fileContents.push({
              path: filePath,
              content: typeof content === 'string' 
                ? content.substring(0, 3000) 
                : JSON.stringify(content).substring(0, 3000),
            });
          }
        } catch (e) {
          logger.debug(`[Planner] Could not read ${filePath}: ${e.message}`);
        }
      }
    }

    return analysis;
  }

  /**
   * Parse MCP directory listing
   */
  parseDirectoryListing(result) {
    if (typeof result === 'string') {
      return result.split('\n').filter(line => line.trim());
    }
    if (Array.isArray(result)) {
      return result.map(item => typeof item === 'string' ? item : item.name || item.path || '').filter(Boolean);
    }
    if (result && typeof result === 'object') {
      // Handle different MCP response formats
      if (result.files) return result.files;
      if (result.content) return this.parseDirectoryListing(result.content);
    }
    return [];
  }

  /**
   * Generate plan with AI
   */
  async generatePlanWithMCP(task, codebaseAnalysis, project, preferredProvider = null, preferredModel = null) {
    const timestamp = Date.now();
    
    const prompt = this.buildPlanPrompt(task, codebaseAnalysis, project, timestamp);

    // Try MCP first, fall back to direct AI call
    let result;
    try {
      result = await this.executeWithMCP(prompt, { 
        task: 'create_plan',
        project,
      });
    } catch (mcpError) {
      logger.warn('[Planner] MCP failed, falling back to direct AI:', mcpError.message);
      
      const aiResult = await this.callAI(prompt, {
        provider: this.provider,
        model: this.model,
        maxTokens: 4096,
      });
      
      if (!aiResult.success) {
        throw new Error('Failed to generate plan: ' + aiResult.error);
      }
      
      result = { success: true, content: aiResult.content };
    }

    if (!result.success) {
      throw new Error('Failed to generate plan: ' + result.error);
    }

    return this.parsePlanResponse(result.content, task, project, timestamp);
  }

  /**
   * Build the prompt for plan generation
   */
  buildPlanPrompt(task, codebaseAnalysis, project, timestamp) {
    return `You are an expert software architect. Create a detailed implementation plan.

TASK: ${task}
${project ? `PROJECT: ${project}` : 'Project: web application'}

${codebaseAnalysis.repoFiles.length > 0 ? `
REPOSITORY STRUCTURE (${codebaseAnalysis.repoFiles.length} files):
${codebaseAnalysis.repoFiles.slice(0, 40).join('\n')}
` : ''}

${codebaseAnalysis.relevantFiles.length > 0 ? `
RELEVANT FILES FOR THIS TASK:
${codebaseAnalysis.relevantFiles.join('\n')}
` : ''}

${codebaseAnalysis.fileContents.length > 0 ? `
FILE CONTENTS (truncated):
${codebaseAnalysis.fileContents.map(f => `
--- ${f.path} ---
${f.content.substring(0, 800)}
`).join('\n')}
` : ''}

CRITICAL INSTRUCTIONS:
1. Respond ONLY with valid JSON
2. Do NOT include markdown code blocks (no \`\`\`json)
3. Do NOT include any explanatory text before or after the JSON
4. The response must be parseable by JSON.parse()
5. Include at least 3-7 detailed steps for substantial tasks; for very small tasks (e.g. "change background color", "update logo", "change one CSS variable") use exactly one step and one or two files so implementation can make minimal edits without rewriting whole files
6. Each step must have: order, description, files array, and type (create/modify/delete/review)
7. Analyze the existing codebase structure and suggest files to modify/create accordingly
8. Consider the project's existing patterns and conventions
9. README / documentation tasks: use ONE step with files like ["README.md"] and a description asking for full documentation (overview, install, env, architecture, API, troubleshooting). Do not split README into multiple tiny steps.

REQUIRED JSON STRUCTURE:
{
  "title": "Brief task title",
  "description": "Detailed description of what needs to be implemented",
  "complexity": "S|M|L",
  "estimatedHours": number,
  "steps": [
    {
      "order": 1,
      "description": "What to do in this step",
      "files": ["path/to/file.js"],
      "type": "create|modify|delete|review"
    }
  ],
  "filesToModify": ["existing/file.js"],
  "filesToCreate": ["new/file.js"],
  "dependencies": ["package-name"],
  "testingNotes": "How to test this implementation",
  "branch": "nigents/task-${timestamp}"
}

EXAMPLE (substantial task):
{"title":"Add User Authentication","description":"Implement JWT-based user authentication with login/logout endpoints","complexity":"M","estimatedHours":4,"steps":[{"order":1,"description":"Analyze existing auth structure and user model","files":["src/models/"],"type":"review"},{"order":2,"description":"Create JWT authentication middleware","files":["src/middleware/auth.js"],"type":"create"},{"order":3,"description":"Add login and register endpoints","files":["src/routes/auth.js"],"type":"create"},{"order":4,"description":"Update user model with password hashing","files":["src/models/User.js"],"type":"modify"},{"order":5,"description":"Add auth tests","files":["src/routes/auth.test.js"],"type":"create"}],"filesToModify":["src/models/User.js"],"filesToCreate":["src/middleware/auth.js","src/routes/auth.js","src/routes/auth.test.js"],"dependencies":["jsonwebtoken","bcrypt"],"testingNotes":"Test login with valid/invalid credentials, token expiration","branch":"nigents/task-${timestamp}"}

EXAMPLE (minimal task — single step, one file):
{"title":"Change background color","description":"Update main container background to #f0f0f0","complexity":"S","estimatedHours":0.25,"steps":[{"order":1,"description":"Set background color in the main layout or theme file","files":["src/App.css"],"type":"modify"}],"filesToModify":["src/App.css"],"filesToCreate":[],"branch":"nigents/task-${timestamp}"}

NOW CREATE YOUR JSON RESPONSE FOR: ${task}`;
  }

  /**
   * Parse AI response into plan object
   */
  parsePlanResponse(content, task, project, timestamp) {
    logger.info(`[Planner] AI response length: ${content.length} chars`);

    // Try multiple parsing approaches
    let plan = null;
    const parseAttempts = [];
    
    // Attempt 1: Find JSON between triple backticks
    try {
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        plan = JSON.parse(codeBlockMatch[1].trim());
        parseAttempts.push('code block');
      }
    } catch (e) {
      logger.debug('[Planner] Code block parse failed:', e.message);
    }
    
    // Attempt 2: Find JSON between curly braces
    if (!plan) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
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
        plan = JSON.parse(content.trim());
        parseAttempts.push('full content');
      } catch (e) {
        logger.debug('[Planner] Full content parse failed:', e.message);
      }
    }

    // If all parsing failed, create fallback plan
    if (!plan) {
      logger.warn('[Planner] All JSON parsing failed, creating fallback plan');
      plan = this.createFallbackPlan(task, project);
    } else {
      logger.info(`[Planner] JSON parsed using: ${parseAttempts.join(', ')}`);
    }
    
    // Ensure required fields
    return this.normalizePlan(plan, task, project, timestamp);
  }

  /**
   * Normalize plan fields
   */
  normalizePlan(plan, task, project, timestamp) {
    const normalized = { ...plan };
    
    // Required string fields
    if (!normalized.title || typeof normalized.title !== 'string') {
      normalized.title = task.split(' ').slice(0, 6).join(' ');
    }
    if (!normalized.description || typeof normalized.description !== 'string') {
      normalized.description = `Implementation plan for: ${task}`;
    }
    if (!normalized.testingNotes || typeof normalized.testingNotes !== 'string') {
      normalized.testingNotes = 'Manual testing required';
    }
    
    // Complexity
    if (!normalized.complexity || !['S', 'M', 'L'].includes(normalized.complexity)) {
      normalized.complexity = 'M';
    }
    
    // Estimated hours
    if (!normalized.estimatedHours || typeof normalized.estimatedHours !== 'number') {
      normalized.estimatedHours = normalized.complexity === 'S' ? 2 : normalized.complexity === 'L' ? 8 : 4;
    }
    
    // Steps
    if (!normalized.steps || !Array.isArray(normalized.steps) || normalized.steps.length === 0) {
      normalized.steps = this.generateDefaultSteps(task);
    }
    
    // Ensure each step has required fields
    normalized.steps = normalized.steps.map((step, idx) => ({
      order: step.order || idx + 1,
      description: step.description || `Step ${idx + 1}`,
      files: Array.isArray(step.files) ? step.files : [],
      type: ['create', 'modify', 'delete', 'review'].includes(step.type) ? step.type : 'modify',
    }));
    
    // Arrays
    if (!normalized.filesToModify || !Array.isArray(normalized.filesToModify)) {
      normalized.filesToModify = [];
    }
    if (!normalized.filesToCreate || !Array.isArray(normalized.filesToCreate)) {
      normalized.filesToCreate = [];
    }
    if (!normalized.dependencies || !Array.isArray(normalized.dependencies)) {
      normalized.dependencies = [];
    }
    
    // Metadata
    normalized.id = `plan-${timestamp}`;
    normalized.createdAt = new Date().toISOString();
    normalized.project = project;
    normalized.originalTask = task;
    normalized.branch = normalized.branch || `nigents/task-${timestamp}`;

    // Infer primary stack from step files so implementation stays in-repo and on-type
    const frontendExt = /\.(jsx|tsx|css|scss|sass|less|vue|html)$/i;
    const backendExt = /\.(java|py|go|rb|php|kt|scala)(\.[a-z]+)?$/i;
    let hasFrontend = false;
    let hasBackend = false;
    for (const step of normalized.steps) {
      const files = step.files || [];
      for (const f of files) {
        if (frontendExt.test(f)) hasFrontend = true;
        if (backendExt.test(f)) hasBackend = true;
      }
    }
    if (hasBackend) {
      normalized.primaryStack = 'backend';
    } else if (hasFrontend && !hasBackend) {
      normalized.primaryStack = 'frontend';
    } else {
      normalized.primaryStack = 'fullstack';
    }

    return normalized;
  }

  /**
   * Generate default steps for fallback plan
   */
  generateDefaultSteps(task) {
    return [
      { order: 1, description: 'Analyze requirements and existing codebase structure', files: [], type: 'review' },
      { order: 2, description: `Implement core functionality: ${task}`, files: [], type: 'modify' },
      { order: 3, description: 'Add necessary tests and validation', files: [], type: 'create' },
      { order: 4, description: 'Code review and documentation', files: [], type: 'review' },
    ];
  }

  /**
   * Create a fallback plan when AI parsing fails
   */
  createFallbackPlan(task, project) {
    logger.info(`[Planner] Creating fallback plan for: ${task}`);
    
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
    } else if (taskLower.includes('page') || taskLower.includes('ui') || taskLower.includes('component')) {
      estimatedHours = 2;
      complexity = 'S';
    } else if (taskLower.includes('database') || taskLower.includes('migration') || taskLower.includes('model')) {
      estimatedHours = 3;
      complexity = 'M';
    } else if (taskLower.includes('microservice') || taskLower.includes('architecture') || taskLower.includes('refactor')) {
      estimatedHours = 8;
      complexity = 'L';
    }
    
    const timestamp = Date.now();
    
    const likelyFrontend = /\b(login|page|ui|ux|component|css|style|frontend|react|vue)\b/i.test(taskLower);
    return {
      title: title,
      description: `Implementation plan for: ${task}`,
      complexity: complexity,
      estimatedHours: estimatedHours,
      steps: this.generateDefaultSteps(task),
      filesToModify: [],
      filesToCreate: [],
      dependencies: [],
      testingNotes: 'Manual testing required',
      branch: `nigents/task-${timestamp}`,
      id: `plan-${timestamp}`,
      createdAt: new Date().toISOString(),
      project: project,
      originalTask: task,
      fallback: true,
      primaryStack: likelyFrontend ? 'frontend' : 'fullstack',
    };
  }

  /**
   * Infer which agent is responsible for a step (for "who does what")
   */
  getStepAssignee(step, index, totalSteps) {
    const files = step.files || [];
    const desc = (step.description || '').toLowerCase();
    const isFirstStep = index === 0;
    const isAnalysis = desc.includes('analyze') || desc.includes('review') || desc.includes('existing');

    if (step.type === 'review') {
      if (isFirstStep && isAnalysis) return 'Planner';
      return 'Code Reviewer';
    }
    const hasFiles = files.length > 0;
    const frontendExt = /\.(jsx|tsx|css|scss|vue|html|sass|less)$/i;
    const testPattern = /\.(test|spec)\.|__tests__|test\//i;
    const isTest = hasFiles && files.some(f => testPattern.test(f));
    const isFrontend = hasFiles && files.some(f => frontendExt.test(f));

    if (isTest) return 'QA Tester';
    if (isFrontend || (!hasFiles && (desc.includes('ui') || desc.includes('page') || desc.includes('component') || desc.includes('frontend')))) return 'Frontend Dev';
    return 'Backend Dev';
  }

  /**
   * Format plan for Telegram display – detailed implementation plan with who does what
   */
  formatPlanForTelegram(plan) {
    if (!plan) return 'No plan available';

    const complexityEmoji = { S: '🟢', M: '🟡', L: '🔴' };
    const typeEmoji = { create: '📝', modify: '🔧', delete: '🗑️', review: '👀' };
    const typeLabel = { create: 'Create', modify: 'Modify', delete: 'Delete', review: 'Review' };

    let message = '';
    message += `<b>📋 Implementation plan (details)</b>\n\n`;
    message += `<b>Task:</b> ${plan.title || plan.originalTask || 'Implementation'}\n`;
    message += `<i>${plan.description || ''}</i>\n\n`;
    message += `Complexity: ${complexityEmoji[plan.complexity] || '⚪'} ${plan.complexity}  ·  Estimated: ${plan.estimatedHours} hours\n`;
    message += `Branch: <code>${plan.branch}</code>\n\n`;

    message += `<b>Who does what</b>\n`;
    (plan.steps || []).forEach((step, idx) => {
      const assignee = this.getStepAssignee(step, idx, (plan.steps || []).length);
      const emoji = typeEmoji[step.type] || '⚪';
      message += `${emoji} Step ${step.order}: <b>${assignee}</b> — ${step.description}\n`;
    });

    message += `\n<b>Step details</b>\n`;
    (plan.steps || []).forEach((step) => {
      const emoji = typeEmoji[step.type] || '⚪';
      const typeStr = typeLabel[step.type] || step.type;
      message += `\n${emoji} <b>${step.order}. ${typeStr}</b>\n`;
      message += `   ${step.description}\n`;
      if (step.files && step.files.length > 0) {
        message += `   Files: <code>${step.files.join(', ')}</code>\n`;
      }
    });

    if (plan.filesToCreate && plan.filesToCreate.length > 0) {
      message += `\n<b>📝 Files to create</b>\n`;
      plan.filesToCreate.forEach(f => { message += `   • ${f}\n`; });
    }
    if (plan.filesToModify && plan.filesToModify.length > 0) {
      message += `\n<b>🔧 Files to modify</b>\n`;
      plan.filesToModify.forEach(f => { message += `   • ${f}\n`; });
    }
    if (plan.dependencies && plan.dependencies.length > 0) {
      message += `\n<b>📦 Dependencies</b>\n${plan.dependencies.map(d => `   • ${d}`).join('\n')}\n`;
    }
    if (plan.testingNotes) {
      message += `\n<b>🧪 Testing</b>\n${plan.testingNotes}\n`;
    }

    message += `\n✅ Reply with /approve to queue this for implementation.`;
    return message;
  }
}

module.exports = PlannerAgent;
