/**
 * Repo context for implementation agents: repo tree + file contents from GitLab.
 * Used so the model sees full folder structure and current file contents for minimal edits.
 */

const gitlab = require('./gitlab');
const logger = require('../utils/logger');

const REPO_TREE_LIMIT = 150;
const REPO_TREE_MAX_CHARS = 4000;
const PER_FILE_MAX_CHARS = 10000;

/**
 * Get repo tree as a string (one path per line), capped for prompt size.
 * @param {string} projectPath - Project path or ID
 * @param {string} [ref] - Branch/tag ref (default branch if null)
 * @param {object} [gitlabClient] - Optional GitLab API client (for per-user)
 * @returns {Promise<string>}
 */
async function getRepoTree(projectPath, ref = null, gitlabClient = null) {
  const gl = gitlabClient || gitlab;
  if (!projectPath || !gl.isConfigured()) return '';
  try {
    const list = await gl.getRepositoryFiles(projectPath, REPO_TREE_LIMIT, ref || undefined);
    if (!list || list.length === 0) return '';
    const lines = list.map(item => item.path || item.name).filter(Boolean);
    let out = lines.join('\n');
    if (out.length > REPO_TREE_MAX_CHARS) {
      out = out.slice(0, REPO_TREE_MAX_CHARS) + '\n... (truncated)';
    }
    return out;
  } catch (e) {
    logger.warn('[repo-context] getRepoTree failed:', e.message);
    return '';
  }
}

/**
 * Get file contents for a single step (files to modify). Skips fetch for 'create' steps.
 * @param {Object} plan - Plan with project, projectId
 * @param {Object} step - Step with files[], type
 * @param {string} [ref] - Branch ref (default branch if null)
 * @param {object} [gitlabClient] - Optional GitLab API client (for per-user)
 * @returns {Promise<Array<{ path: string, content: string }>>}
 */
async function getStepFileContents(plan, step, ref = null, gitlabClient = null) {
  const gl = gitlabClient || gitlab;
  const project = plan?.project || plan?.projectId;
  if (!project || !gl.isConfigured()) return [];
  const files = Array.isArray(step?.files) ? step.files : [];
  if (files.length === 0) return [];
  const type = (step?.type || '').toLowerCase();
  if (type === 'create') return [];

  try {
    const resolvedRef = ref || await gl.getDefaultBranch(project);
    const results = await gl.getFilesContent(project, files, resolvedRef);
    const out = [];
    for (const r of results) {
      if (!r.success || r.content == null) continue;
      let content = typeof r.content === 'string' ? r.content : String(r.content);
      if (content.length > PER_FILE_MAX_CHARS) {
        content = content.slice(0, PER_FILE_MAX_CHARS) + '\n\n... (truncated; make minimal edit in the relevant section)';
      }
      out.push({ path: r.path, content });
    }
    return out;
  } catch (e) {
    logger.warn('[repo-context] getStepFileContents failed:', e.message);
    return [];
  }
}

/**
 * Get full repo context for a plan: repo tree + file contents per step (for modify steps).
 * @param {Object} plan - Plan with project, projectId, steps
 * @param {Object} [options] - { ref, gitlabClient }
 * @returns {Promise<{ repoTree: string, ref: string, fileContentsByStep: Object<number, Array<{ path, content }>> }>}
 */
async function getRepoContextForPlan(plan, options = {}) {
  const gl = options.gitlabClient || gitlab;
  const project = plan?.project || plan?.projectId;
  const fileContentsByStep = {};
  let repoTree = '';
  let ref = options.ref || null;

  if (!project || !gl.isConfigured()) {
    return { repoTree: '', ref: ref || 'main', fileContentsByStep };
  }

  try {
    ref = ref || await gl.getDefaultBranch(project);
    repoTree = await getRepoTree(project, ref, gl);
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    for (const step of steps) {
      const order = step.order != null ? step.order : steps.indexOf(step) + 1;
      const contents = await getStepFileContents(plan, step, ref, gl);
      if (contents.length > 0) {
        fileContentsByStep[order] = contents;
      }
    }
  } catch (e) {
    logger.warn('[repo-context] getRepoContextForPlan failed:', e.message);
  }

  return { repoTree, ref: ref || 'main', fileContentsByStep };
}

module.exports = {
  getRepoTree,
  getStepFileContents,
  getRepoContextForPlan,
  REPO_TREE_MAX_CHARS,
  PER_FILE_MAX_CHARS,
};
