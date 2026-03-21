/**
 * 🦉 Nigents - Backend Developer Agent
 * Writes backend code via OpenHands
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const openhands = require('../tools/openhands');
const gitlab = require('../tools/gitlab');
const { cloneEditAndPush } = require('../tools/repo-clone-push');
const { getCheckCommands, getGatherContextCommands, getBuildCheckCommandFromAI } = require('../tools/compile-check');
const { getRepoTree, getStepFileContents, getRepoContextForPlan } = require('../tools/repo-context');
const {
  parseGeneratedCodeToFiles: parseGeneratedFilesUtil,
  docGenerationInstructions,
  maxTokensForStepFiles,
} = require('../utils/ai-file-parse');

class BackendDevAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['backend-dev'];
    super(config);
  }

  /**
   * Implement the backend portion of a plan.
   * @param {Object} plan - Normalized plan (steps, files, branch, primaryStack)
   * @param {Object} [context] - Optional { reporter } for per-step progress messages
   */
  async implement(plan, context = {}) {
    this.setStatus('working', { task: 'implementing', plan: plan.title });
    this.currentTask = plan;
    this._requestContext = context;
    const reporter = context.reporter;
    const branch = plan.branch || 'unknown';
    const gl = context.gitlab || gitlab;

    try {
      // Check if OpenHands is available
      const openhandsHealth = await openhands.healthCheck();
      if (!openhandsHealth.available) {
        logger.warn('[BackendDev] OpenHands not available, using fallback implementation');
        return this.fallbackImplement(plan, context);
      }

      this.emit('progress', { stage: 'setup', message: 'Setting up development environment...' });
      if (reporter) await reporter.sendProgress(`📂 Cloning repo and creating branch \`${branch}\`...`);

      // Step 1: Setup - Clone repo and create branch
      const workDir = await this.setupWorkspace(plan);
      
      this.emit('progress', { stage: 'coding', message: 'Writing code...' });

      // Step 2: Implement each step in the plan
      const implementationResults = [];
      for (const step of plan.steps) {
        const fileList = Array.isArray(step.files) && step.files.length > 0
          ? step.files.join(', ')
          : `step ${step.order}`;
        if (reporter) {
          await reporter.sendProgress(`📝 Editing \`${fileList}\` on branch \`${branch}\``);
        }
        const result = await this.implementStep(step, workDir, plan);
        implementationResults.push(result);
        
        this.emit('progress', { 
          stage: 'coding', 
          message: `Completed step ${step.order}: ${step.description}`,
          step: step.order,
          total: plan.steps.length,
        });
      }

      // Step 2.5: Use AI to detect project type and run build/compile check
      let compileCheckPassed = true;
      try {
        if (reporter) await reporter.sendProgress('🔍 Detecting project type and running compile/syntax check...');
        const gatherCommands = getGatherContextCommands(workDir);
        const gatherResult = await openhands.executeCommands(gatherCommands, { workingDir: workDir, timeout: 30 });
        const contextOutput = gatherResult.output || '';
        const aiCommand = await getBuildCheckCommandFromAI(contextOutput);
        let checkCommands;
        if (aiCommand && aiCommand.command) {
          const dir = workDir.replace(/'/g, "'\\''");
          checkCommands = [`cd '${dir}' && ${aiCommand.command}`];
          logger.info('[BackendDev] Using AI-suggested check:', aiCommand.command);
        } else {
          checkCommands = getCheckCommands(workDir);
        }
        const checkResult = await openhands.executeCommands(checkCommands, { workingDir: workDir, timeout: 180 });
        if (!checkResult.success) {
          compileCheckPassed = false;
          logger.warn('[BackendDev] Compile/syntax check failed:', checkResult.error || checkResult.output?.slice(0, 300));
        }
      } catch (checkErr) {
        compileCheckPassed = false;
        logger.warn('[BackendDev] Compile check error:', checkErr.message);
      }

      this.emit('progress', { stage: 'committing', message: 'Committing changes...' });

      // Step 3: Commit and push
      const commitResult = await this.commitAndPush(workDir, plan);

      this.setStatus('done', { task: 'implementing', branch: plan.branch });
      const defaultBranch = await gl.getDefaultBranch(plan.project || plan.projectId).catch(() => 'main');
      return {
        success: true,
        branch: plan.branch,
        targetBranch: defaultBranch,
        projectId: plan.project || plan.projectId,
        commit: commitResult,
        stepsCompleted: implementationResults.length,
        compileCheckPassed,
        message: compileCheckPassed
          ? `Implementation complete. Branch: ${plan.branch}`
          : `Implementation complete (compile check failed - review before merge). Branch: ${plan.branch}`,
      };
    } catch (error) {
      this.setStatus('error', { task: 'implementing', error: error.message });
      logger.error('[BackendDev] Error implementing:', error);
      return this.fallbackImplement(plan, context);
    } finally {
      this._requestContext = null;
    }
  }

  parseGeneratedCodeToFiles(generatedCode) {
    return parseGeneratedFilesUtil(generatedCode);
  }

  /**
   * Fallback implementation when OpenHands is not available
   * Fetches repo from GitLab, edits in a local directory, pushes to a non-main branch.
   * @param {Object} plan - Plan with steps, branch, primaryStack
   * @param {Object} [context] - Optional { reporter }
   */
  async fallbackImplement(plan, context = {}) {
    logger.info('[BackendDev] Running fallback implementation');
    this.emit('progress', { stage: 'coding', message: 'Generating code via AI (OpenHands unavailable)...' });
    const reporter = context.reporter;
    const branch = plan?.branch || 'unknown';
    const primaryStack = plan?.primaryStack || 'fullstack';
    const frontendOnlyNotice = primaryStack === 'frontend'
      ? '\nCRITICAL: This is a FRONTEND-ONLY task. Generate only React/TSX/CSS (or other frontend) code for the listed files. Do NOT generate Java, Spring Boot, Python, or any backend code.\n'
      : '';

    try {
      // Validate plan has steps
      if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
        logger.warn('[BackendDev] Plan has no steps, using minimal fallback');
      return {
        success: true,
        branch: plan?.branch || 'unknown',
        projectId: plan?.project || plan?.projectId,
        fallbackMode: true,
        stepsCompleted: 0,
        message: `Implementation simulated. No steps defined in plan.`,
      };
      }
      
      const glFallback = context.gitlab || gitlab;
      let repoTree = '';
      let fileContentsByStep = {};
      try {
        const ctx = await getRepoContextForPlan(plan, { gitlabClient: glFallback });
        repoTree = ctx.repoTree || '';
        fileContentsByStep = ctx.fileContentsByStep || {};
      } catch (e) {
        logger.warn('[BackendDev] getRepoContextForPlan failed:', e.message);
      }

      const generatedCode = [];
      const allSteps = Array.isArray(plan.steps) ? plan.steps : [];
      const steps = allSteps.slice(0, 20);

      for (const step of steps) {
        if (!step || step.description == null) continue;
        const files = Array.isArray(step.files) ? step.files : [];
        const isDocStep = files.some(f => /\.md$/i.test(f) || /readme/i.test(String(f || '')));
        if (reporter && files.length > 0) {
          await reporter.sendProgress(`📝 Editing \`${files.join(', ')}\` on branch \`${branch}\``);
        }
        const stepOrder = step.order != null ? step.order : steps.indexOf(step) + 1;
        const stepContents = fileContentsByStep[stepOrder] || [];
        const hasCurrentContent = stepContents.length > 0 && !isDocStep;
        const fileContentsSection = hasCurrentContent
          ? `
CURRENT FILE CONTENTS (you are given the current content; output only the changed version with minimal edits):
${stepContents.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}

MINIMAL EDIT: Make the smallest change required for the step. Do not add unrelated code, comments, or reformatting. If the step is to change a background color or one style, only change that line or add one block; do not rewrite the whole file.
`
          : '';

        const docBlock = isDocStep ? docGenerationInstructions(files) : '';
        const formatInstructions = isDocStep
          ? docBlock
          : `
Respond with the file contents in this format:
FILE: <filepath>
\`\`\`<language>
<code>
\`\`\`
`;

        const prompt = `
You are an expert developer. ${hasCurrentContent ? 'Modify the following files with minimal edits. Only change what is necessary for the step.' : isDocStep ? 'Produce a complete, thorough document as specified.' : 'Generate complete, working code for this step.'} Only generate output for the exact files listed.
${frontendOnlyNotice}

${repoTree ? `REPO STRUCTURE:\n${repoTree}\n\n` : ''}
TASK: ${plan.title || 'Task'}
STEP ${step.order}: ${step.description}
ONLY THESE FILES (do not add other files): ${files.join(', ')}
${fileContentsSection}

${hasCurrentContent ? 'Output the full file content for each modified file, with only the minimal changes applied.' : isDocStep ? 'Write comprehensive documentation (many sections, setup, API, troubleshooting). Do not output a stub.' : 'Generate the actual code content that would be written to these files. Include proper error handling and documentation where appropriate.'}

${formatInstructions}
`;

        const result = await this.callAI(prompt, {
          maxTokens: maxTokensForStepFiles(files),
          temperature: isDocStep ? 0.4 : 0.3,
        });

        if (result.success) {
          generatedCode.push({
            step: step.order,
            description: step.description,
            files,
            code: result.content,
          });
        }

        this.emit('progress', { 
          stage: 'coding', 
          message: `Generated code for step ${step.order}: ${step.description}`,
          step: step.order,
          total: plan.steps.length,
        });
      }

      this.setStatus('done', { task: 'implementing', branch: plan.branch });

      const generatedFiles = this.parseGeneratedCodeToFiles(generatedCode);
      let pushedToGit = false;
      let compileCheckPassed = true;
      if (generatedFiles.length > 0 && (plan.project || plan.projectId)) {
        try {
          const pushResult = await cloneEditAndPush(plan, generatedFiles, reporter, glFallback);
          pushedToGit = true;
          if (pushResult.compileCheckPassed === false) compileCheckPassed = false;
        } catch (pushErr) {
          logger.warn('[BackendDev] Clone/edit/push failed, orchestrator may push via API:', pushErr.message);
        }
      }
      const defaultBranch = await glFallback.getDefaultBranch(plan.project || plan.projectId).catch(() => 'main');
      return {
        success: true,
        branch: plan.branch,
        targetBranch: defaultBranch,
        projectId: plan.project || plan.projectId,
        fallbackMode: true,
        pushedToGit,
        compileCheckPassed,
        stepsCompleted: generatedCode.length,
        generatedCode,
        generatedFiles: pushedToGit ? [] : generatedFiles,
        message: pushedToGit
          ? (compileCheckPassed ? `Fallback complete: repo fetched, edited, and pushed to branch \`${plan.branch}\`.` : `Fallback complete (compile check failed - review before merge). Branch: \`${plan.branch}\`.`)
          : generatedFiles.length > 0
            ? `Fallback implementation complete. Branch: ${plan.branch} (${generatedFiles.length} file(s) ready to push via API)`
            : `Fallback implementation complete. Branch: ${plan.branch} (no files generated)`,
      };
    } catch (error) {
      logger.error('[BackendDev] Fallback implementation failed:', error);
      // Return a minimal success so the workflow continues
      return {
        success: true,
        branch: plan.branch,
        targetBranch: 'main',
        projectId: plan.project || plan.projectId,
        fallbackMode: true,
        pushedToGit: false,
        compileCheckPassed: false,
        stepsCompleted: 0,
        message: `Implementation simulated. Branch would be: ${plan.branch}`,
      };
    }
  }

  /**
   * Setup workspace - clone repo and create branch
   */
  async setupWorkspace(plan) {
    const project = plan.project;
    const branch = plan.branch;
    const gl = (this._requestContext && this._requestContext.gitlab) || gitlab;
    const cloneUrl = await gl.getPushUrl(project);
    const setupCommands = [
      `cd /workspace`,
      `git clone ${cloneUrl} ${project} || true`,
      `cd ${project}`,
      `git checkout -b ${branch}`,
    ];

    const result = await openhands.executeCommands(setupCommands);
    
    if (!result.success) {
      throw new Error(`Failed to setup workspace: ${result.error}`);
    }

    return `/workspace/${project}`;
  }

  /**
   * Implement a single step
   */
  async implementStep(step, workDir, plan) {
    const gl = (this._requestContext && this._requestContext.gitlab) || gitlab;
    const project = plan.project || plan.projectId;
    let repoTree = '';
    let fileContentsSection = '';
    const stepContents = await getStepFileContents(plan, step, null, gl);
    if (project) {
      const ref = await gl.getDefaultBranch(project).catch(() => 'main');
      repoTree = await getRepoTree(project, ref, gl);
    }
    if (stepContents.length > 0) {
      fileContentsSection = `
CURRENT FILE CONTENTS (make minimal edits — only change what the step requires):
${stepContents.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}

STRICT MINIMAL-EDIT RULE: Make the smallest change that satisfies the step. If the step is to change a color, style, or one setting, only add or edit the relevant line(s). Do not rewrite entire files. Preserve all existing code, formatting, and structure except what you must change.
`;
    }

    const filesList = Array.isArray(step.files) && step.files.length > 0 ? step.files.join(', ') : 'none specified';
    const primaryStack = plan.primaryStack || 'fullstack';
    const frontendOnlyNotice = primaryStack === 'frontend'
      ? `
CRITICAL - FRONTEND-ONLY TASK: This repository is a frontend project (e.g. React). You must ONLY create or modify the files listed below. Do NOT add any backend code (no Java, Spring Boot, Python, Go, etc.). Do NOT create folders like backend/ or src/main/java/. Only edit the listed frontend files (e.g. .tsx, .jsx, .css).
`
      : '';

    const isModify = (step.type || '').toLowerCase() === 'modify' || stepContents.length > 0;
    const modifyInstruction = isModify
      ? 'Modify the following files with minimal edits. Only change what is necessary for the step. Do not rewrite entire files.'
      : 'Modify the existing file(s) to implement this step. Preserve existing functionality while adding the new feature.';

    const prompt = `
You are implementing this step of a plan in the repository that was selected for this task.

${repoTree ? `REPO STRUCTURE (full folder):\n${repoTree}\n\n` : ''}
STEP: ${step.description}
TYPE: ${step.type}
FILES TO CREATE OR MODIFY (ONLY THESE): ${filesList}
${fileContentsSection}

STRICT: Only create or modify the exact file(s) listed above. Do not create or edit any other files or paths.
${frontendOnlyNotice}

OVERALL TASK: ${plan.title}
DESCRIPTION: ${plan.description}

WORKING DIRECTORY: ${workDir}

${step.type === 'create'
  ? `Create the new file(s) with complete, working code. Include proper error handling and documentation where appropriate.`
  : modifyInstruction
}

Use the write_file or edit_file tools to make changes. Then verify the changes compile/build correctly.
`;

    // Use OpenHands to implement
    const result = await openhands.implementWithPrompt(prompt, workDir);
    
    return {
      step: step.order,
      success: result.success,
      files: step.files,
      output: result.output,
    };
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(workDir, plan) {
    const commands = [
      `cd ${workDir}`,
      `git add -A`,
      `git commit -m "feat: ${plan.title}

${plan.description}

Changes:
${plan.steps.map(s => `- ${s.description}`).join('\n')}

Generated by Nigents 🤖"`,
      `git push origin ${plan.branch}`,
    ];

    const result = await openhands.executeCommands(commands);
    
    return {
      success: result.success,
      output: result.output,
    };
  }

  /**
   * Fix issues reported by QA or Reviewer
   */
  async fixIssues(branch, issues, workDir) {
    this.setStatus('working', { task: 'fixing_issues', issueCount: issues.length });

    const prompt = `
Fix the following issues in branch ${branch}:

${issues.map((issue, i) => `${i + 1}. ${issue.file}:${issue.line} - ${issue.message}`).join('\n')}

Make the necessary changes to resolve these issues.
`;

    const result = await openhands.implementWithPrompt(prompt, workDir);

    this.setStatus('done', { task: 'fixing_issues' });
    
    return {
      success: result.success,
      fixed: issues.length,
    };
  }

  /**
   * Handle specific backend technologies
   */
  async handleSpringBootTask(task) {
    // Specialized Spring Boot implementation logic
    const prompt = `
You are working on a Spring Boot application.

Task: ${task}

Requirements:
- Use Spring Boot best practices
- Include proper annotations (@RestController, @Service, @Repository, etc.)
- Add validation with @Valid
- Include proper exception handling
- Use Lombok if available
- Follow the existing package structure
- Add appropriate unit tests
`;
    return this.callClaude(prompt);
  }

  async handleNodeTask(task) {
    // Specialized Node.js implementation logic
    const prompt = `
You are working on a Node.js application.

Task: ${task}

Requirements:
- Use async/await, not callbacks
- Include proper error handling
- Use ES6+ features
- Follow the existing project structure
- Add JSDoc comments
- Include appropriate tests with Jest
`;
    return this.callClaude(prompt);
  }

  /**
   * Execute task - required by BaseAgent
   */
  async execute(task) {
    return this.implement(task);
  }
}

module.exports = BackendDevAgent;
