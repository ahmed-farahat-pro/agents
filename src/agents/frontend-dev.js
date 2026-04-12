/**
 * 🦉 Nigents - Frontend Developer Agent
 * Writes React/React Native code with RTL support. Fetches repo, edits on task branch, pushes to GitLab.
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const gitlab = require('../tools/gitlab');
const { cloneEditAndPush } = require('../tools/repo-clone-push');
const { getRepoTree, getStepFileContents } = require('../tools/repo-context');
const {
  parseGeneratedCodeToFiles: parseGeneratedFilesUtil,
  docGenerationInstructions,
  maxTokensForStepFiles,
} = require('../utils/ai-file-parse');

class FrontendDevAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['frontend-dev'];
    super(config);
  }

  parseGeneratedCodeToFiles(generatedCode) {
    return parseGeneratedFilesUtil(generatedCode);
  }

  /**
   * Implement frontend: generate code, then clone repo and push to plan.branch (task branch).
   * @param {Object} plan - Plan with steps, branch, project, title, description
   * @param {Object} [context] - Optional { reporter } for progress
   */
  async implement(plan, context = {}) {
    this.setStatus('working', { task: 'implementing_frontend', plan: plan.title });
    this.currentTask = plan;
    this._requestContext = context;
    const reporter = context.reporter;
    const gl = context.gitlab || gitlab;
    const branch = plan.branch || `nigents/task-${Date.now()}`;

    try {
      const frontendSteps = (plan.steps || []).filter(step =>
        (step.files || []).some(f =>
          /\.(jsx?|tsx?|css|scss|vue|html)$/i.test(f) ||
          f.includes('components/') ||
          f.includes('pages/')
        )
      );

      const results = [];
      for (const step of frontendSteps) {
        if (reporter && step.files && step.files.length > 0) {
          await reporter.sendProgress(`📝 Editing \`${step.files.join(', ')}\` on branch \`${branch}\``);
        }
        const result = await this.implementFrontendStep(step, plan);
        results.push({ ...result, files: step.files });
        this.emit('progress', {
          stage: 'frontend_coding',
          step: step.order,
          message: `Created ${(step.files || []).join(', ')}`,
        });
      }

      const generatedCode = results.filter(r => r.success && r.code).map(r => ({ code: r.code, files: r.files }));
      const generatedFiles = this.parseGeneratedCodeToFiles(generatedCode);

      let pushedToGit = false;
      let compileCheckPassed = true;
      if (generatedFiles.length > 0 && (plan.project || plan.projectId)) {
        try {
          const pushResult = await cloneEditAndPush(plan, generatedFiles, reporter, gl);
          pushedToGit = true;
          if (pushResult.compileCheckPassed === false) compileCheckPassed = false;
        } catch (pushErr) {
          logger.warn('[FrontendDev] Clone/edit/push failed:', pushErr.message);
        }
      }

      this.setStatus('done', { task: 'implementing_frontend', branch: plan.branch });
      const defaultBranch = await gl.getDefaultBranch(plan.project || plan.projectId).catch(() => 'main');

      return {
        success: true,
        branch: plan.branch,
        targetBranch: defaultBranch,
        projectId: plan.project || plan.projectId,
        fallbackMode: !pushedToGit && generatedFiles.length > 0,
        pushedToGit,
        compileCheckPassed,
        generatedFiles: pushedToGit ? [] : generatedFiles,
        componentsCreated: results.length,
        message: pushedToGit
          ? (compileCheckPassed ? `Frontend complete: repo fetched, edited, and pushed to branch \`${plan.branch}\`.` : `Frontend complete (compile check failed - review before merge). Branch: \`${plan.branch}\`.`)
          : `Frontend implementation complete. Branch: ${plan.branch}`,
      };
    } catch (error) {
      this.setStatus('error', { task: 'implementing_frontend', error: error.message });
      logger.error('[FrontendDev] Implement failed:', error);
      return {
        success: false,
        branch: plan.branch,
        projectId: plan.project || plan.projectId,
        compileCheckPassed: false,
        message: `Frontend implementation failed: ${error.message}`,
      };
    }
  }

  /**
   * Implement a single frontend step
   * @param {Object} step - Step with files, description
   * @param {Object} [plan] - Plan with project, projectId (for repo context)
   */
  async implementFrontendStep(step, plan = null) {
    const gl = (this._requestContext && this._requestContext.gitlab) || gitlab;
    let repoTree = '';
    let fileContentsSection = '';
    if (plan && (plan.project || plan.projectId)) {
      try {
        const project = plan.project || plan.projectId;
        const ref = await gl.getDefaultBranch(project).catch(() => 'main');
        repoTree = await getRepoTree(project, ref, gl);
        const stepContents = await getStepFileContents(plan, step, ref, gl);
        if (stepContents.length > 0) {
          fileContentsSection = `
CURRENT FILE CONTENTS (make minimal edits):
${stepContents.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}

MINIMAL EDIT: Make the smallest change that satisfies the step. For example, if the step is to change background color, only add or edit the relevant CSS variable or property; do not rewrite entire components or files. Preserve existing code and structure.
`;
        }
      } catch (e) {
        logger.warn('[FrontendDev] repo context failed:', e.message);
      }
    }

    const isReactNative = step.files && step.files.some(f => f.includes('.native.') || f.includes('mobile'));
    const isRTL = true; // Always assume RTL for Arabic support
    const files = step.files || [];
    const isDocStep = files.some(f => /\.md$/i.test(f) || /readme/i.test(String(f || '')));
    const hasCurrentContent = fileContentsSection.length > 0 && !isDocStep;

    const prompt = `
${repoTree ? `REPO STRUCTURE (full folder):\n${repoTree}\n\n` : ''}
Create/modify the following frontend files:
${files.join('\n')}

Description: ${step.description}
${isDocStep ? docGenerationInstructions(files) : ''}
${fileContentsSection}

${hasCurrentContent ? 'If the step is only a style/color change, only output the minimal CSS/JSX change. Output full file content for each modified file with only the minimal changes applied.' : ''}
${isDocStep ? 'Output using the FILE + <<<NIGENTS_FILE_START>>> format above. Write a long, complete README.' : ''}

${isReactNative ? 'PLATFORM: React Native' : 'PLATFORM: React Web'}
${isRTL ? 'RTL SUPPORT: Required (Arabic interface)' : ''}

Requirements:
${isReactNative ? `
- React Native best practices
- Use functional components with hooks
- Style with StyleSheet
- Support both iOS and Android
- Handle keyboard avoiding
` : `
- React functional components with hooks
- Responsive design
- Modern CSS (Flexbox/Grid)
`}

${isRTL ? `
RTL REQUIREMENTS:
- Use logical CSS properties (margin-inline-start instead of margin-left)
- Support text direction changes
- Mirror layouts for RTL
- Use appropriate Arabic fonts
- Test text rendering for Arabic
` : ''}

DARK MODE:
- Support dark/light theme switching
- Use CSS variables or theme context
- Ensure contrast ratios meet accessibility standards

Include PropTypes or TypeScript interfaces where relevant.
Add JSDoc comments for component documentation.
`;

    const result = await this.callClaude(prompt, {
      maxTokens: maxTokensForStepFiles(files),
      temperature: isDocStep ? 0.4 : 0.3,
    });
    
    return {
      step: step.order,
      files: step.files,
      code: result.content,
      success: result.success,
    };
  }

  /**
   * Create a React component with full RTL support
   */
  async createReactComponent({ name, props, rtl = true, darkMode = true }) {
    const prompt = `
Create a React component named "${name}".

Props: ${JSON.stringify(props)}
RTL Support: ${rtl}
Dark Mode: ${darkMode}

Generate the complete component file with:
1. Imports
2. PropTypes/TypeScript interfaces
3. Component implementation
4. Styling (CSS-in-JS or CSS modules)
5. Export

${rtl ? `
RTL Implementation:
- Use dir="auto" for text content
- Use CSS logical properties
- Consider RTL in layout calculations
` : ''}

${darkMode ? `
Dark Mode Implementation:
- Use CSS custom properties for colors
- Or use a theme context
- Support system preference detection
` : ''}
`;

    return this.callClaude(prompt);
  }

  /**
   * Create a React Native screen/component
   */
  async createReactNativeScreen({ name, navigation, rtl = true }) {
    const prompt = `
Create a React Native screen component named "${name}".

Navigation: ${navigation}
RTL Support: ${rtl}

Requirements:
- Use React Navigation
- SafeAreaView for notched devices
- ScrollView for scrollable content
- KeyboardAvoidingView for inputs
- Loading and error states
- Pull-to-refresh support

${rtl ? `
RTL Requirements:
- Support Arabic text direction
- Mirror icons that indicate direction (arrows)
- Use I18nManager for layout direction
- Test with Arabic text
` : ''}

Include proper styling with StyleSheet.
Add PropTypes validation.
`;

    return this.callClaude(prompt);
  }

  /**
   * Convert existing component to RTL
   */
  async convertToRTL(componentCode) {
    const prompt = `
Convert this component to fully support RTL (Right-to-Left) for Arabic:

${componentCode}

Changes needed:
1. Replace physical properties with logical ones:
   - margin-left/right → margin-inline-start/end
   - padding-left/right → padding-inline-start/end
   - border-left/right → border-inline-start/end
   - text-align: left → text-align: start
   
2. Add dir="auto" to text elements
3. Handle icon direction (arrows should flip)
4. Use flexbox with flex-start/flex-end instead of left/right

Return the complete updated code.
`;

    return this.callClaude(prompt);
  }

  /**
   * Execute task - required by BaseAgent
   */
  async execute(task) {
    const plan = task.plan || task;
    return this.implement(plan, task.reporter ? { reporter: task.reporter } : {});
  }
}

module.exports = FrontendDevAgent;
