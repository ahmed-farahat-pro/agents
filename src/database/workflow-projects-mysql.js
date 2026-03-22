/**
 * Workflow Studio — persisted graphs in MySQL (fallback: JSON file in server.js)
 */

const fs = require('fs');
const db = require('./connection');
const logger = require('../utils/logger');

let tableReady = false;

function defaultNodesEdges() {
  const nodes = [
    { id: 'n1', agentType: 'orchestrator', note: 'Start', x: 40, y: 100 },
    { id: 'n2', agentType: 'planner', note: 'Plan', x: 220, y: 100 },
    { id: 'n3', agentType: 'backend-dev', note: 'Implement', x: 400, y: 100 },
    { id: 'n4', agentType: 'qa-tester', note: 'Test', x: 580, y: 100 },
    { id: 'n5', agentType: 'code-reviewer', note: 'Review', x: 760, y: 100 },
    { id: 'n6', agentType: 'reporter', note: 'Report', x: 940, y: 100 },
  ];
  const edges = [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4' },
    { from: 'n4', to: 'n5' },
    { from: 'n5', to: 'n6' },
  ];
  return { nodes, edges };
}

async function ensureTable() {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS workflow_projects (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      gitlab_path VARCHAR(512) NULL,
      gitlab_project_id VARCHAR(64) NOT NULL DEFAULT '',
      nodes_json LONGTEXT NOT NULL,
      edges_json LONGTEXT NOT NULL,
      meta_json LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_workflow_gitlab_path (gitlab_path(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tableReady = true;
  logger.info('[WorkflowProjects] MySQL table ready');
}

function rowToProject(row) {
  let nodes = [];
  let edges = [];
  try {
    nodes = JSON.parse(row.nodes_json || '[]');
  } catch (_) {}
  try {
    edges = JSON.parse(row.edges_json || '[]');
  } catch (_) {}
  let meta = {};
  try {
    meta = row.meta_json ? JSON.parse(row.meta_json) : {};
  } catch (_) {}
  return {
    id: row.id,
    name: row.name,
    gitlabPath: row.gitlab_path || '',
    gitlabProjectId: row.gitlab_project_id || '',
    nodes,
    edges,
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProjects() {
  await ensureTable();
  const rows = await db.query(
    `SELECT id, name, gitlab_path, gitlab_project_id, nodes_json, edges_json, meta_json, created_at, updated_at
     FROM workflow_projects ORDER BY updated_at DESC`
  );
  return rows.map(rowToProject);
}

async function getById(id) {
  await ensureTable();
  const rows = await db.query(
    `SELECT id, name, gitlab_path, gitlab_project_id, nodes_json, edges_json, meta_json, created_at, updated_at
     FROM workflow_projects WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length ? rowToProject(rows[0]) : null;
}

async function createProject(project) {
  await ensureTable();
  const nodesJson = JSON.stringify(project.nodes || []);
  const edgesJson = JSON.stringify(project.edges || []);
  const metaJson = project.meta ? JSON.stringify(project.meta) : null;
  await db.query(
    `INSERT INTO workflow_projects (id, name, gitlab_path, gitlab_project_id, nodes_json, edges_json, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.gitlabPath || null,
      project.gitlabProjectId || '',
      nodesJson,
      edgesJson,
      metaJson,
    ]
  );
  return getById(project.id);
}

async function updateProject(id, patch) {
  await ensureTable();
  const existing = await getById(id);
  if (!existing) return null;
  const name = patch.name != null ? String(patch.name).trim() : existing.name;
  const gitlabPath = patch.gitlabPath !== undefined ? String(patch.gitlabPath || '').trim() || null : existing.gitlabPath || null;
  const gitlabProjectId =
    patch.gitlabProjectId !== undefined ? String(patch.gitlabProjectId || '') : existing.gitlabProjectId || '';
  const nodes = Array.isArray(patch.nodes) ? patch.nodes : existing.nodes;
  const edges = Array.isArray(patch.edges) ? patch.edges : existing.edges;
  const meta = patch.meta !== undefined ? patch.meta : existing.meta;
  await db.query(
    `UPDATE workflow_projects SET name = ?, gitlab_path = ?, gitlab_project_id = ?, nodes_json = ?, edges_json = ?, meta_json = ?
     WHERE id = ?`,
    [
      name,
      gitlabPath,
      gitlabProjectId,
      JSON.stringify(nodes || []),
      JSON.stringify(edges || []),
      meta && Object.keys(meta).length ? JSON.stringify(meta) : null,
      id,
    ]
  );
  return getById(id);
}

async function deleteProject(id) {
  await ensureTable();
  const r = await db.query(`DELETE FROM workflow_projects WHERE id = ?`, [id]);
  const n = r && typeof r.affectedRows === 'number' ? r.affectedRows : 0;
  return n > 0;
}

/**
 * Insert a default graph for a GitLab repo if no row exists for this path.
 */
async function ensureDefaultForRepo(gitlabPath, gitlabProjectId, projectName) {
  await ensureTable();
  const path = String(gitlabPath || '').trim();
  if (!path) return null;
  const rows = await db.query(`SELECT id FROM workflow_projects WHERE gitlab_path = ? LIMIT 1`, [path]);
  if (rows.length) return rowToProject(await getById(rows[0].id));
  const { nodes, edges } = defaultNodesEdges();
  const id = `wp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const name = (projectName && String(projectName).trim()) || path.split('/').pop() || 'Workflow';
  await createProject({
    id,
    name,
    gitlabPath: path,
    gitlabProjectId: String(gitlabProjectId || ''),
    nodes,
    edges,
    meta: { seededFrom: 'gitlab-sync', seededAt: new Date().toISOString() },
  });
  logger.info(`[WorkflowProjects] Seeded default workflow for ${path}`);
  return getById(id);
}

/**
 * Import legacy JSON file once if table is empty.
 */
async function migrateFromJsonFile(filePath) {
  await ensureTable();
  const countRows = await db.query(`SELECT COUNT(*) AS c FROM workflow_projects`);
  const c = countRows[0] && countRows[0].c;
  if (c > 0) return 0;
  if (!fs.existsSync(filePath)) return 0;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    logger.warn('[WorkflowProjects] JSON migrate read failed:', e.message);
    return 0;
  }
  const projects = data.projects || [];
  let n = 0;
  for (const p of projects) {
    if (!p || !p.id) continue;
    try {
      const exists = await db.query(`SELECT id FROM workflow_projects WHERE id = ? LIMIT 1`, [p.id]);
      if (exists.length) continue;
      await createProject({
        id: p.id,
        name: p.name || 'Imported',
        gitlabPath: p.gitlabPath || null,
        gitlabProjectId: p.gitlabProjectId || '',
        nodes: p.nodes || [],
        edges: p.edges || [],
        meta: { migratedFrom: 'workflow-projects.json' },
      });
      n++;
    } catch (e) {
      logger.warn('[WorkflowProjects] Skip import row:', p.id, e.message);
    }
  }
  if (n) logger.info(`[WorkflowProjects] Migrated ${n} projects from JSON file`);
  return n;
}

/**
 * On dashboard startup: create default workflows for each GitLab project (env token).
 */
async function syncFromGitlabEnv() {
  const axios = require('axios');
  const token = process.env.GITLAB_TOKEN || '';
  const baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
  if (!token) {
    logger.info('[WorkflowProjects] GitLab sync skipped (no GITLAB_TOKEN)');
    return 0;
  }
  await ensureTable();
  try {
    const response = await axios.get(`${baseUrl}/api/v4/projects`, {
      headers: { 'PRIVATE-TOKEN': token },
      params: { membership: true, per_page: 100, order_by: 'last_activity_at', sort: 'desc' },
    });
    const list = response.data || [];
    let added = 0;
    for (const project of list) {
      const fullPath = project.path_with_namespace;
      const before = await db.query(`SELECT id FROM workflow_projects WHERE gitlab_path = ? LIMIT 1`, [fullPath]);
      if (before.length) continue;
      await ensureDefaultForRepo(fullPath, String(project.id), project.name);
      added++;
    }
    if (added) logger.info(`[WorkflowProjects] GitLab env sync: created ${added} default workflow(s)`);
    return added;
  } catch (e) {
    logger.warn('[WorkflowProjects] GitLab env sync failed:', e.message);
    return 0;
  }
}

module.exports = {
  ensureTable,
  listProjects,
  getById,
  createProject,
  updateProject,
  deleteProject,
  ensureDefaultForRepo,
  migrateFromJsonFile,
  syncFromGitlabEnv,
  defaultNodesEdges,
};
