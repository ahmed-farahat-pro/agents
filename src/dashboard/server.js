/**
 * 🦉 Nigents - Web Dashboard Server
 * Real-time agent activity and task monitoring with streaming
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const logger = require('../utils/logger');
const axios = require('axios');
const aiClient = require('../utils/ai-client');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.DASHBOARD_PORT || 4000;

// Admin credentials (env or defaults: admin / admin)
const ADMIN_USERNAME = (process.env.DASHBOARD_ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = (process.env.DASHBOARD_ADMIN_PASSWORD || 'admin').trim();
const SESSION_COOKIE_NAME = 'nigents_session';
/** @type {Map<string, { kind: string, username?: string, role?: string, accountId?: number, onboardingCompleted?: boolean, telegramUserId?: string|null }>} */
const sessions = new Map();

function createSession(payload) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, payload);
  return token;
}

function getSessionPayload(token) {
  if (!token) return null;
  return sessions.get(token) || null;
}

function getDashboardSession(req) {
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  return getSessionPayload(token);
}

function isValidSession(token) {
  return Boolean(token && sessions.has(token));
}

function deleteSession(token) {
  if (token) sessions.delete(token);
}

function sessionIsAdmin(s) {
  if (!s) return false;
  if (s.kind === 'env') return true;
  return s.kind === 'account' && s.role === 'admin';
}

function requireDashboardAdmin(req, res, next) {
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  if (!isValidSession(token)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const s = getDashboardSession(req);
  if (!sessionIsAdmin(s)) {
    return res.status(403).json({ success: false, error: 'Admin only' });
  }
  return next();
}

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// CORS: allow any origin for public materials API (subscribe / download) – no auth required
const materialsPublicPaths = ['/api/materials/subscribe', '/api/materials/download'];
function isMaterialsPublicPath(p) {
  const pathNorm = (p || '').trim().replace(/\/+$/, '') || '/';
  return materialsPublicPaths.some(publicPath =>
    pathNorm === publicPath || pathNorm.endsWith(publicPath));
}
app.use((req, res, next) => {
  if (!isMaterialsPublicPath(req.path)) return next();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth middleware: require valid session for /api/* except public routes (no login required)
const publicApiPaths = new Set([
  '/api/auth/login',
  '/api/auth/check',
  '/api/materials/subscribe',
  '/api/materials/download',
]);
function isPublicApiPath(p) {
  const raw = (p || '').trim();
  const pathNorm = raw.replace(/\/+$/, '') || '/';
  if (pathNorm.startsWith('/api/meeting/session/')) return true;
  if (publicApiPaths.has(pathNorm) || publicApiPaths.has(raw)) return true;
  if (pathNorm.endsWith('/api/materials/subscribe') || pathNorm.endsWith('/api/materials/download')) return true;
  if (raw.endsWith('/api/materials/subscribe') || raw.endsWith('/api/materials/download')) return true;
  // Allow any path that is the materials subscribe/download API (not /subscribers)
  if ((pathNorm.includes('/api/materials/subscribe') && !pathNorm.includes('subscribers')) ||
      pathNorm.includes('/api/materials/download')) return true;
  if (pathNorm.startsWith('/api/bonyad')) return true;
  return false;
}

/** Telegram bot (or other services) creates sessions on the dashboard host — no browser cookie. */
const meetingSessionsMod = require('../utils/meeting-sessions');
app.post('/api/meeting/sessions/internal', (req, res) => {
  try {
    const secret = process.env.MEETING_INTERNAL_SECRET;
    if (!secret || req.headers['x-meeting-secret'] !== secret) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const session = meetingSessionsMod.createSession({ telegramUserId: req.body && req.body.telegramUserId });
    const base = meetingSessionsMod.getPublicDashboardUrl();
    res.json({
      success: true,
      token: session.token,
      meetingRoomUrl: `${base}/meeting-room.html?token=${encodeURIComponent(session.token)}`,
      jitsiUrl: session.jitsiUrl,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    logger.error('[Meeting] internal session:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (isPublicApiPath(req.path)) return next();
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  if (isValidSession(token)) return next();
  res.status(401).json({ success: false, error: 'Unauthorized' });
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Dashboard state (fallback when no DB)
const dashboardState = {
  agents: [],
  tasks: [],
  activities: [],
  codeEdits: [],
  agentCommunications: [],
  systemStatus: 'running',
  startTime: new Date(),
};

// Database integration
const useDatabase = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;
let dbTaskQueue = null;
let dbChatStorage = null;

let userConfigModule = null;
let dashboardAccountsMod = null;
/** @type {import('../database/workflow-projects-mysql')|null} */
let wfMysql = null;
if (useDatabase) {
  try {
    dbTaskQueue = require('../database/task-queue-mysql');
    dbChatStorage = require('../database/chat-storage-mysql');
    userConfigModule = require('../database/user-config');
    dashboardAccountsMod = require('../database/dashboard-accounts');
    wfMysql = require('../database/workflow-projects-mysql');
    logger.info('[Dashboard] Database integration enabled (MySQL)');
  } catch (error) {
    logger.error('[Dashboard] Failed to load database modules:', error.message);
  }
}

/** Sanitize config for API response (hide secret values) */
function sanitizeConfig(config) {
  if (!config) return {};
  return {
    apiKeys: config.apiKeys ? Object.fromEntries(
      Object.entries(config.apiKeys).map(([k, v]) => [k, v ? 'SET' : ''])
    ) : {},
    customModels: config.customModels || {},
    gitlab: {
      token: config.gitlab?.token ? 'SET' : '',
      namespace: config.gitlab?.namespace || '',
      url: config.gitlab?.url || '',
    },
    telegram: config.telegram || {},
    updatedAt: config.updatedAt,
  };
}

/** GitLab credentials for current browser session (per-Telegram-user or env). */
async function getEffectiveGitlabForRequest(req) {
  const s = getDashboardSession(req);
  const baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
  const envTok = process.env.GITLAB_TOKEN || '';
  const envNs = process.env.GITLAB_NAMESPACE || '';
  if (s && s.kind === 'account' && s.telegramUserId && userConfigModule) {
    const full = await userConfigModule.getConfigForUser(s.telegramUserId);
    const g = full.gitlab || {};
    return {
      token: (g.token && String(g.token).trim()) || envTok,
      namespace: (g.namespace && String(g.namespace).trim()) || envNs,
      url: (g.url && String(g.url).trim()) || baseUrl,
      scope: 'user',
    };
  }
  return {
    token: envTok,
    namespace: envNs,
    url: baseUrl,
    scope: 'env',
  };
}

/** Resolve target Telegram user id for config writes (per-user row in user_config). */
function resolveConfigTargetUserId(req, bodyUserId) {
  const s = getDashboardSession(req);
  if (s && s.kind === 'account') {
    if (sessionIsAdmin(s)) {
      return bodyUserId ? String(bodyUserId).trim() : null;
    }
    if (!s.telegramUserId) {
      return { error: 'Complete onboarding (link your Telegram user ID) before saving keys.' };
    }
    if (bodyUserId && String(bodyUserId).trim() !== String(s.telegramUserId)) {
      return { error: 'Cannot set config for another user' };
    }
    return String(s.telegramUserId);
  }
  return bodyUserId ? String(bodyUserId).trim() : null;
}

/** Build state for dashboard: from MySQL when available, else in-memory */
async function getDashboardState() {
  if (dbTaskQueue) {
    try {
      const [tasks, activities, agents] = await Promise.all([
        dbTaskQueue.getAllTasks(200),
        dbTaskQueue.getActivities(100),
        dbTaskQueue.getAgents(),
      ]);
      return {
        ...dashboardState,
        tasks: tasks || [],
        activities: activities || [],
        agents: agents || [],
      };
    } catch (err) {
      logger.error('[Dashboard] Failed to load state from DB:', err.message);
    }
  }
  return dashboardState;
}

// ============================================================================
// API Routes
// ============================================================================

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || '').trim();
  const p = String(password || '');

  if (u === ADMIN_USERNAME && p === ADMIN_PASSWORD) {
    const token = createSession({ kind: 'env', username: ADMIN_USERNAME, role: 'admin' });
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      path: '/',
    });
    logger.info('[Dashboard] Env admin login success');
    return res.json({
      success: true,
      user: ADMIN_USERNAME,
      sessionType: 'env',
      role: 'admin',
      onboardingCompleted: true,
      needsOnboarding: false,
      telegramUserId: null,
    });
  }

  if (dashboardAccountsMod && useDatabase) {
    try {
      const acc = await dashboardAccountsMod.verifyLogin(u, p);
      if (acc) {
        const token = createSession({
          kind: 'account',
          accountId: acc.id,
          username: acc.username,
          role: acc.role,
          onboardingCompleted: !!acc.onboarding_completed,
          telegramUserId: acc.telegram_user_id || null,
        });
        res.cookie(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          maxAge: 7 * 24 * 60 * 60 * 1000,
          sameSite: 'lax',
          path: '/',
        });
        logger.info('[Dashboard] Account login success', acc.username);
        const needsOnboarding = acc.role !== 'admin' && !acc.onboarding_completed;
        return res.json({
          success: true,
          user: acc.username,
          sessionType: 'account',
          role: acc.role,
          onboardingCompleted: !!acc.onboarding_completed,
          needsOnboarding,
          telegramUserId: acc.telegram_user_id || null,
        });
      }
    } catch (e) {
      logger.error('[Dashboard] Account login error:', e.message);
    }
  }

  logger.warn('[Dashboard] Login failed');
  res.status(401).json({ success: false, error: 'Invalid username or password' });
});

app.get('/api/auth/check', (req, res) => {
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  const s = getSessionPayload(token);
  if (!s) {
    return res.status(401).json({ success: false });
  }
  if (s.kind === 'env') {
    return res.json({
      success: true,
      user: s.username,
      sessionType: 'env',
      role: 'admin',
      onboardingCompleted: true,
      needsOnboarding: false,
      telegramUserId: null,
    });
  }
  const needsOnboarding = s.role !== 'admin' && !s.onboardingCompleted;
  return res.json({
    success: true,
    user: s.username,
    sessionType: 'account',
    role: s.role,
    onboardingCompleted: !!s.onboardingCompleted,
    needsOnboarding,
    telegramUserId: s.telegramUserId || null,
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
  deleteSession(token);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

// First-time setup: link Telegram user id + GitLab (stored in user_config for bot + dashboard).
app.post('/api/me/onboarding', async (req, res) => {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
    const s = getSessionPayload(token);
    if (!isValidSession(token) || !s || s.kind !== 'account') {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!dashboardAccountsMod || !userConfigModule || !useDatabase) {
      return res.status(400).json({ success: false, error: 'Database not configured' });
    }
    const { telegramUserId, gitlab: gitlabPayload, apiKeys } = req.body || {};
    await dashboardAccountsMod.completeOnboarding(
      s.accountId,
      telegramUserId,
      { gitlab: gitlabPayload || {}, apiKeys: apiKeys || {} },
      userConfigModule
    );
    const tg = String(telegramUserId).trim();
    s.telegramUserId = tg;
    s.onboardingCompleted = true;
    sessions.set(token, s);
    res.json({
      success: true,
      telegramUserId: tg,
      message: 'Onboarding complete. Use /reload in Telegram if the bot is running.',
    });
  } catch (e) {
    logger.error('[Dashboard] onboarding:', e.message);
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/api/me/key-request', async (req, res) => {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
    const s = getSessionPayload(token);
    if (!isValidSession(token) || !s || s.kind !== 'account') {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!dashboardAccountsMod) {
      return res.status(400).json({ success: false, error: 'Database not configured' });
    }
    const { provider, notes } = req.body || {};
    const r = await dashboardAccountsMod.createKeyRequest(s.accountId, provider, notes);
    res.json({ success: true, request: r });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get('/api/me/key-requests', async (req, res) => {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE_NAME];
    const s = getSessionPayload(token);
    if (!isValidSession(token) || !s || s.kind !== 'account') {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    if (!dashboardAccountsMod) {
      return res.json({ success: true, requests: [] });
    }
    const requests = await dashboardAccountsMod.listKeyRequestsForAccount(s.accountId);
    res.json({ success: true, requests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/dashboard-accounts', requireDashboardAdmin, async (req, res) => {
  try {
    if (!dashboardAccountsMod) {
      return res.json({ success: true, accounts: [] });
    }
    const accounts = await dashboardAccountsMod.listAccounts();
    res.json({ success: true, accounts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/admin/dashboard-accounts', requireDashboardAdmin, async (req, res) => {
  try {
    if (!dashboardAccountsMod) {
      return res.status(400).json({ success: false, error: 'Database not configured' });
    }
    const { username, password, role, displayName } = req.body || {};
    const created = await dashboardAccountsMod.createAccount({ username, password, role, displayName });
    res.json({ success: true, account: created });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/dashboard-key-requests', requireDashboardAdmin, async (req, res) => {
  try {
    if (!dashboardAccountsMod) {
      return res.json({ success: true, requests: [] });
    }
    const status = req.query.status || null;
    const requests = await dashboardAccountsMod.listKeyRequests(status || undefined);
    res.json({ success: true, requests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/admin/dashboard-key-requests/:id/review', requireDashboardAdmin, async (req, res) => {
  try {
    if (!dashboardAccountsMod || !userConfigModule) {
      return res.status(400).json({ success: false, error: 'Database not configured' });
    }
    const { status, adminNote } = req.body || {};
    const result = await dashboardAccountsMod.reviewKeyRequest(
      req.params.id,
      status,
      adminNote,
      userConfigModule
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/overview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overview.html'));
});

app.get('/overview.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overview.html'));
});

app.get('/how-it-works', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'how-it-works.html'));
});

app.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

app.get('/logs.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

app.get('/api/status', async (req, res) => {
  try {
    let stats = {
      status: dashboardState.systemStatus,
      uptime: Date.now() - dashboardState.startTime,
    };
    
    if (dbTaskQueue) {
      const allTasks = await dbTaskQueue.getAllTasks(1000);
      stats.agents = (await dbTaskQueue.getAgents()).length;
      stats.activeTasks = allTasks.filter(t => t.status === 'running').length;
      stats.queuedTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'approved').length;
      stats.completedTasks = allTasks.filter(t => t.status === 'completed').length;
    } else {
      stats.agents = dashboardState.agents.length;
      stats.activeTasks = dashboardState.tasks.filter(t => t.status === 'running').length;
      stats.queuedTasks = dashboardState.tasks.filter(t => t.status === 'queued').length;
      stats.completedTasks = dashboardState.tasks.filter(t => t.status === 'completed').length;
    }
    
    // Add MCP and GitLab status
    try {
      const mcpClient = require('../mcp/mcp-client');
      stats.mcp = {
        initialized: mcpClient.isInitialized,
        connectedServers: mcpClient.clients?.size || 0,
        totalTools: mcpClient.tools?.length || 0,
      };
    } catch (e) {
      stats.mcp = { initialized: false, error: e.message };
    }
    
    try {
      const gitlab = require('../tools/gitlab');
      stats.gitlab = {
        configured: !!gitlab.token,
        namespace: gitlab.namespace || null,
        baseUrl: gitlab.baseUrl,
      };
    } catch (e) {
      stats.gitlab = { configured: false, error: e.message };
    }
    
    res.json(stats);
  } catch (error) {
    logger.error('[Dashboard] Failed to get status:', error);
    if (dbTaskQueue) {
      res.json({
        status: dashboardState.systemStatus,
        uptime: Date.now() - dashboardState.startTime,
        agents: 0,
        activeTasks: 0,
        queuedTasks: 0,
        completedTasks: 0,
      });
    } else {
      res.json({
        status: dashboardState.systemStatus,
        uptime: Date.now() - dashboardState.startTime,
        agents: dashboardState.agents.length,
        activeTasks: dashboardState.tasks.filter(t => t.status === 'running').length,
        queuedTasks: dashboardState.tasks.filter(t => t.status === 'queued').length,
        completedTasks: dashboardState.tasks.filter(t => t.status === 'completed').length,
      });
    }
  }
});

app.get('/api/agents', async (req, res) => {
  try {
    if (dbTaskQueue) {
      const agents = await dbTaskQueue.getAgents();
      res.json(agents);
    } else {
      res.json(dashboardState.agents);
    }
  } catch (error) {
    logger.error('[Dashboard] Failed to get agents:', error);
    res.json(dbTaskQueue ? [] : dashboardState.agents);
  }
});

// MCP Health Check Endpoint
app.get('/api/mcp/health', async (req, res) => {
  try {
    const mcpClient = require('../mcp/mcp-client');
    const config = require('../../config/mcp-servers.json');
    
    const health = {
      initialized: mcpClient.isInitialized,
      connectedServers: mcpClient.clients?.size || 0,
      totalTools: mcpClient.tools?.length || 0,
      servers: {},
    };
    
    // Check each configured server
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.enabled !== false) {
        const isConnected = mcpClient.clients?.has(name);
        const serverTools = mcpClient.clients?.get(name)?.tools || [];
        health.servers[name] = {
          enabled: true,
          connected: isConnected,
          tools: serverTools.map(t => t.name),
        };
      } else {
        health.servers[name] = { enabled: false };
      }
    }
    
    res.json(health);
  } catch (error) {
    logger.error('[Dashboard] MCP health check failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GitLab Test Endpoint
app.get('/api/gitlab/test', async (req, res) => {
  try {
    const gitlab = require('../tools/gitlab');
    
    if (!gitlab.token) {
      return res.status(400).json({ 
        configured: false, 
        error: 'GITLAB_TOKEN not set' 
      });
    }
    
    // Test connection by listing projects
    const projects = await gitlab.listProjects(5);
    
    res.json({
      configured: true,
      tokenSet: !!gitlab.token,
      namespace: gitlab.namespace,
      baseUrl: gitlab.baseUrl,
      accessibleProjects: projects.length,
      projects: projects.map(p => ({ name: p.name, fullPath: p.fullPath })),
    });
  } catch (error) {
    logger.error('[Dashboard] GitLab test failed:', error);
    res.status(500).json({ 
      configured: !!gitlab.token, 
      error: error.message 
    });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    if (dbTaskQueue) {
      const tasks = await dbTaskQueue.getAllTasks(100);
      res.json(tasks);
    } else {
      res.json(dashboardState.tasks);
    }
  } catch (error) {
    logger.error('[Dashboard] Failed to get tasks:', error);
    res.json(dbTaskQueue ? [] : dashboardState.tasks);
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    if (dbTaskQueue) {
      const activities = await dbTaskQueue.getActivities(100);
      res.json(activities);
    } else {
      res.json(dashboardState.activities.slice(-100));
    }
  } catch (error) {
    logger.error('[Dashboard] Failed to get activities:', error);
    res.json(dbTaskQueue ? [] : dashboardState.activities.slice(-100));
  }
});

// Update agent status with activity
app.post('/api/agents/:name/status', async (req, res) => {
  const { name } = req.params;
  const { status, activity, ...rest } = req.body;

  const agentIndex = dashboardState.agents.findIndex(a => a.name === name);
  if (agentIndex >= 0) {
    dashboardState.agents[agentIndex] = {
      ...dashboardState.agents[agentIndex],
      status,
      activity,
      lastUpdate: new Date(),
      ...rest,
    };
  } else {
    dashboardState.agents.push({
      name,
      status,
      activity,
      lastUpdate: new Date(),
      ...rest,
    });
  }
  
  // Also save to database if available
  if (dbTaskQueue) {
    try {
      await dbTaskQueue.registerAgent({
        id: name,
        name,
        displayName: rest.displayName || name,
        role: rest.role || 'agent',
        status,
        metadata: rest,
      });
      await dbTaskQueue.updateAgentStatus(name, status, activity, rest.taskId);
    } catch (error) {
      logger.error('[Dashboard] Failed to update agent in database:', error);
    }
  }

  io.emit('agentStatus', { name, status, activity });
  
  // Also emit as activity
  if (activity) {
    const activityData = {
      type: 'agent-message',
      agent: name,
      message: activity,
      timestamp: new Date(),
    };
    addActivity(activityData);
    
    // Save to database if available
    if (dbTaskQueue) {
      try {
        await dbTaskQueue.addActivity(activityData);
      } catch (error) {
        logger.error('[Dashboard] Failed to save activity:', error);
      }
    }
  }
  
  res.json({ success: true });
});

// Code edit streaming endpoint (optional: project / taskId / kind for Workflow Studio filtering)
app.post('/api/code-edit', (req, res) => {
  const { agent, file, code, action, lineNumbers, project, taskId, stream, kind } = req.body;

  const editData = {
    id: Date.now().toString(),
    agent,
    file,
    code,
    action,
    lineNumbers,
    project: project != null && String(project).trim() ? String(project).trim() : null,
    taskId: taskId != null ? String(taskId) : null,
    stream: stream != null ? String(stream) : null,
    kind: kind && String(kind).trim() ? String(kind).trim() : 'code',
    timestamp: new Date(),
  };
  
  dashboardState.codeEdits.push(editData);
  
  // Keep only last 50 edits
  if (dashboardState.codeEdits.length > 50) {
    dashboardState.codeEdits = dashboardState.codeEdits.slice(-50);
  }
  
  io.emit('codeEdit', editData);
  
  // Add activity
  addActivity({
    type: 'code-edit',
    agent,
    message: `${action} ${file}`,
    timestamp: new Date(),
  });
  
  res.json({ success: true });
});

// Agent communication endpoint (optional project / taskId for Workflow Studio)
app.post('/api/agent-communication', (req, res) => {
  const { from, to, message, type, project, taskId } = req.body;

  const commData = {
    id: Date.now().toString(),
    from,
    to,
    message,
    type,
    project: project != null && String(project).trim() ? String(project).trim() : null,
    taskId: taskId != null ? String(taskId) : null,
    timestamp: new Date(),
  };
  
  dashboardState.agentCommunications.push(commData);
  io.emit('agentCommunication', commData);
  
  res.json({ success: true });
});

// Add task
app.post('/api/tasks', async (req, res) => {
  const task = {
    id: req.body.id || Date.now().toString(),
    ...req.body,
    createdAt: new Date(),
  };

  if (dbTaskQueue) {
    try {
      await dbTaskQueue.createTask({
        id: task.id,
        userId: task.userId || task.user_id || 'dashboard',
        type: task.type || 'implementation',
        title: task.title || 'Untitled',
        description: task.description || '',
        status: task.status || 'pending',
        plan: task.plan || null,
      });
    } catch (error) {
      logger.error('[Dashboard] Failed to create task in database:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  dashboardState.tasks.push(task);
  io.emit('task', task);

  await addActivity({
    type: 'system',
    agent: 'orchestrator',
    message: `Task created: ${task.title}`,
    timestamp: new Date(),
  });

  res.json({ success: true, task });
});

// Update task progress
app.put('/api/tasks/:id/progress', async (req, res) => {
  const { id } = req.params;
  const { progress, status, message } = req.body;

  if (dbTaskQueue) {
    try {
      const existing = await dbTaskQueue.getTask(id);
      if (!existing) {
        const inMemory = dashboardState.tasks.find(t => t.id === id);
        if (inMemory) {
          inMemory.progress = progress;
          if (status) inMemory.status = status;
          inMemory.updatedAt = new Date();
          io.emit('task', inMemory);
          if (message) {
            await addActivity({ type: 'system', agent: inMemory.agent || 'orchestrator', message, timestamp: new Date() });
          }
          return res.json({ success: true });
        }
        return res.status(404).json({ success: false, error: 'Task not found' });
      }
      if (status) {
        await dbTaskQueue.updateTaskStatus(id, status, progress !== undefined ? { progress } : {});
      } else if (progress !== undefined) {
        await dbTaskQueue.updateTaskProgress(id, progress, message);
      }
      if (message) {
        await addActivity({ type: 'system', agent: existing.agent || 'orchestrator', message, timestamp: new Date() });
      }
      const updated = await dbTaskQueue.getTask(id);
      if (updated) io.emit('task', updated);
      return res.json({ success: true });
    } catch (error) {
      logger.error('[Dashboard] Failed to update task progress in database:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  const task = dashboardState.tasks.find(t => t.id === id);
  if (task) {
    task.progress = progress;
    if (status) task.status = status;
    task.updatedAt = new Date();
    io.emit('task', task);
    if (message) {
      await addActivity({
        type: 'system',
        agent: task.agent || 'orchestrator',
        message,
        timestamp: new Date(),
      });
    }
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Task not found' });
  }
});

// Add activity helper
async function addActivity(data) {
  dashboardState.activities.push(data);
  
  if (dashboardState.activities.length > 100) {
    dashboardState.activities = dashboardState.activities.slice(-100);
  }
  
  io.emit('activity', data);
  
  // Save to database if available
  if (dbTaskQueue) {
    try {
      await dbTaskQueue.addActivity(data);
    } catch (error) {
      logger.error('[Dashboard] Failed to save activity to database:', error);
    }
  }
}

// ============================================================================
// GitLab API Routes
// ============================================================================

// Get GitLab configuration status (env or logged-in user's user_config)
app.get('/api/gitlab/config', async (req, res) => {
  try {
    const g = await getEffectiveGitlabForRequest(req);
    const hasToken = Boolean(g.token);
    const hasNamespace = Boolean(g.namespace);
    res.json({
      configured: hasToken && hasNamespace,
      hasToken,
      hasNamespace,
      namespace: g.namespace || null,
      url: g.url || 'https://gitlab.com',
      scope: g.scope || 'env',
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Fetch repositories from GitLab
app.get('/api/gitlab/repos', async (req, res) => {
  try {
    const g = await getEffectiveGitlabForRequest(req);
    const token = g.token;
    const namespace = g.namespace;
    const baseUrl = g.url || 'https://gitlab.com';
    
    logger.info('[Dashboard] Fetching GitLab repos...');
    logger.info(`[Dashboard] Namespace: ${namespace}`);
    logger.info(`[Dashboard] Token exists: ${!!token}`);
    logger.info(`[Dashboard] Base URL: ${baseUrl}`);
    
    if (!token) {
      logger.error('[Dashboard] GitLab token not configured (env or your Settings / onboarding)');
      return res.status(400).json({ 
        success: false, 
        error: 'GITLAB_TOKEN not configured',
        message: 'Add a GitLab token in Settings (or complete onboarding), or set GITLAB_TOKEN in .env'
      });
    }
    
    if (!namespace) {
      logger.error('[Dashboard] GitLab namespace not configured');
      return res.status(400).json({ 
        success: false, 
        error: 'GITLAB_NAMESPACE not configured',
        message: 'Set default namespace in Settings / onboarding, or GITLAB_NAMESPACE in .env'
      });
    }
    
    // Fetch projects from GitLab API
    logger.info('[Dashboard] Calling GitLab API...');
    const response = await axios.get(
      `${baseUrl}/api/v4/projects`,
      {
        headers: {
          'PRIVATE-TOKEN': token,
        },
        params: {
          membership: true,
          per_page: 100,
          order_by: 'last_activity_at',
          sort: 'desc',
        },
      }
    );
    
    logger.info(`[Dashboard] GitLab API returned ${response.data.length} projects`);
    
    // Filter and format repos
    const repos = response.data.map(project => ({
      id: project.path,
      name: project.name,
      namespace: project.namespace.path,
      fullPath: project.path_with_namespace,
      url: project.web_url,
      sshUrl: project.ssh_url_to_repo,
      defaultBranch: project.default_branch || 'main',
      description: project.description,
      lastActivity: project.last_activity_at,
      stars: project.star_count,
      visibility: project.visibility,
    }));
    
    logger.info(`[Dashboard] Returning ${repos.length} repos`);
    
    res.json({
      success: true,
      count: repos.length,
      repos,
    });
    
  } catch (error) {
    logger.error('[Dashboard] Failed to fetch GitLab repos:', error.message);
    logger.error('[Dashboard] Error details:', error.response?.data || error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Invalid GitLab token',
        message: 'Your GITLAB_TOKEN is invalid or expired',
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch repositories',
      message: error.message,
    });
  }
});

// Get specific project details
app.get('/api/gitlab/repos/:projectPath', async (req, res) => {
  try {
    const { projectPath } = req.params;
    const g = await getEffectiveGitlabForRequest(req);
    const token = g.token;
    const baseUrl = g.url || 'https://gitlab.com';
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'GITLAB_TOKEN not configured' });
    }
    
    const encodedPath = encodeURIComponent(projectPath);
    const response = await axios.get(
      `${baseUrl}/api/v4/projects/${encodedPath}`,
      {
        headers: {
          'PRIVATE-TOKEN': token,
        },
      }
    );
    
    res.json({
      success: true,
      project: {
        id: response.data.path,
        name: response.data.name,
        namespace: response.data.namespace.path,
        fullPath: response.data.path_with_namespace,
        url: response.data.web_url,
        defaultBranch: response.data.default_branch || 'main',
        description: response.data.description,
      },
    });
    
  } catch (error) {
    logger.error('[Dashboard] Failed to fetch project:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch project',
      message: error.message,
    });
  }
});

// ============================================================================
// AI Provider Routes
// ============================================================================

// Get available AI providers
app.get('/api/ai/providers', (req, res) => {
  try {
    // Reload shared config to get latest API keys
    const sharedConfig = require('../utils/shared-config');
    sharedConfig.applyToEnv();
    
    const providers = aiClient.getAvailableProviders();
    res.json({
      success: true,
      defaultProvider: aiClient.defaultProvider,
      providers,
      config: sharedConfig.getSanitizedConfig(),
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get AI providers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Update API keys (optional userId for per-user config)
app.post('/api/config/apikeys', async (req, res) => {
  try {
    const { apiKeys, userId } = req.body;
    const sharedConfig = require('../utils/shared-config');
    const resolved = resolveConfigTargetUserId(req, userId);
    if (resolved && resolved.error) {
      return res.status(400).json({ success: false, error: resolved.error });
    }
    const targetUserId = resolved;
    if (targetUserId && userConfigModule) {
      const existing = await userConfigModule.getUserConfig(targetUserId) || {};
      const merged = { ...existing.apiKeys, ...apiKeys };
      await userConfigModule.setUserConfig(targetUserId, { ...existing, apiKeys: merged });
      const full = await userConfigModule.getConfigForUser(targetUserId);
      logger.info('[Dashboard] API keys updated for user', targetUserId);
      return res.json({
        success: true,
        message: 'API keys updated successfully',
        config: sanitizeConfig(full),
        userId: targetUserId,
      });
    }
    sharedConfig.updateApiKeys(apiKeys);
    sharedConfig.applyToEnv();
    logger.info('[Dashboard] API keys updated via dashboard');
    res.json({
      success: true,
      message: 'API keys updated successfully',
      config: sharedConfig.getSanitizedConfig(),
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to update API keys:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Update GitLab config (optional userId)
app.post('/api/config/gitlab', async (req, res) => {
  try {
    const { gitlab: gitlabPayload, userId } = req.body;
    const sharedConfig = require('../utils/shared-config');
    const resolved = resolveConfigTargetUserId(req, userId);
    if (resolved && resolved.error) {
      return res.status(400).json({ success: false, error: resolved.error });
    }
    const targetUserId = resolved;
    if (targetUserId && userConfigModule) {
      const existing = await userConfigModule.getUserConfig(targetUserId) || {};
      await userConfigModule.setUserConfig(targetUserId, {
        ...existing,
        gitlab: { ...(existing.gitlab || {}), ...gitlabPayload },
      });
      const full = await userConfigModule.getConfigForUser(targetUserId);
      logger.info('[Dashboard] GitLab config updated for user', targetUserId);
      return res.json({
        success: true,
        message: 'GitLab config updated',
        config: sanitizeConfig(full),
        userId: targetUserId,
      });
    }
    const config = sharedConfig.getFullConfig();
    config.gitlab = { ...config.gitlab, ...gitlabPayload };
    sharedConfig.saveConfig(config);
    sharedConfig.applyToEnv();
    res.json({
      success: true,
      message: 'GitLab config updated',
      config: sharedConfig.getSanitizedConfig(),
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to update GitLab config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update custom models (optional userId)
app.post('/api/config/custommodels', async (req, res) => {
  try {
    const { customModels, userId } = req.body;
    const sharedConfig = require('../utils/shared-config');
    const resolved = resolveConfigTargetUserId(req, userId);
    if (resolved && resolved.error) {
      return res.status(400).json({ success: false, error: resolved.error });
    }
    const targetUserId = resolved;
    if (targetUserId && userConfigModule) {
      await userConfigModule.setUserConfig(targetUserId, { customModels: customModels || {} });
      const full = await userConfigModule.getConfigForUser(targetUserId);
      logger.info('[Dashboard] Custom models updated for user', targetUserId);
      return res.json({
        success: true,
        message: 'Custom models updated',
        config: sanitizeConfig(full),
        userId: targetUserId,
      });
    }
    const config = sharedConfig.getFullConfig();
    config.customModels = customModels || config.customModels || {};
    sharedConfig.saveConfig(config);
    sharedConfig.applyToEnv();
    res.json({
      success: true,
      message: 'Custom models updated',
      config: sharedConfig.getSanitizedConfig(),
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to update custom models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get config (sanitized). Optional ?userId=X for per-user config (admin).
app.get('/api/config', async (req, res) => {
  try {
    const userId = req.query.userId;
    const sharedConfig = require('../utils/shared-config');
    const s = getDashboardSession(req);

    if (s && s.kind === 'account' && !sessionIsAdmin(s)) {
      if (!s.telegramUserId) {
        return res.json({
          success: true,
          config: sanitizeConfig({ apiKeys: {}, gitlab: {}, customModels: {} }),
          needsProfile: true,
          scope: 'account',
        });
      }
      if (userConfigModule) {
        const merged = await userConfigModule.getConfigForUser(s.telegramUserId);
        return res.json({
          success: true,
          config: sanitizeConfig(merged),
          userId: s.telegramUserId,
          scope: 'account',
        });
      }
    }

    if (userId && userConfigModule) {
      if (s && s.kind === 'account' && !sessionIsAdmin(s)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const merged = await userConfigModule.getConfigForUser(userId);
      res.json({
        success: true,
        config: sanitizeConfig(merged),
        userId,
      });
    } else {
      res.json({
        success: true,
        config: sharedConfig.getSanitizedConfig(),
      });
    }
  } catch (error) {
    logger.error('[Dashboard] Failed to get config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Admin: list all users (for admin dropdown)
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!useDatabase) {
      return res.json({ success: true, users: [] });
    }
    const db = require('../database/connection');
    const rows = await db.query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.last_active_at, u.created_at
       FROM users u
       ORDER BY u.last_active_at DESC, u.created_at DESC
       LIMIT 200`
    );
    const configUserIds = userConfigModule ? await userConfigModule.listUserIdsWithConfig() : [];
    const users = (rows || []).map((r) => ({
      id: r.id,
      username: r.username,
      firstName: r.first_name,
      lastName: r.last_name,
      lastActiveAt: r.last_active_at,
      createdAt: r.created_at,
      hasConfig: configUserIds.includes(r.id),
    }));
    res.json({ success: true, users });
  } catch (error) {
    logger.error('[Dashboard] Failed to list users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: create a new user (so admin can pre-create and assign config)
app.post('/api/admin/users', async (req, res) => {
  try {
    if (!useDatabase || !userConfigModule) {
      return res.status(400).json({ success: false, error: 'Database not configured' });
    }
    const { userId, displayName, firstName, lastName } = req.body || {};
    const id = (userId || '').toString().trim();
    if (!id) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    const db = require('../database/connection');
    const first = (firstName || displayName || '').toString().trim() || null;
    const last = (lastName || '').toString().trim() || null;
    await db.query(
      `INSERT INTO users (id, first_name, last_name, is_bot)
       VALUES (?, ?, ?, FALSE)
       ON DUPLICATE KEY UPDATE
         first_name = COALESCE(VALUES(first_name), first_name),
         last_name = COALESCE(VALUES(last_name), last_name),
         updated_at = CURRENT_TIMESTAMP`,
      [id, first, last]
    );
    await db.query('INSERT IGNORE INTO user_settings (user_id) VALUES (?)', [id]);
    logger.info('[Dashboard] Admin created/updated user', id);
    const usersRes = await db.query(
      `SELECT id, username, first_name, last_name, last_active_at, created_at FROM users WHERE id = ?`,
      [id]
    );
    const configUserIds = await userConfigModule.listUserIdsWithConfig();
    const u = usersRes && usersRes[0] ? usersRes[0] : { id, first_name: first, last_name: last };
    res.json({
      success: true,
      user: {
        id: u.id,
        username: u.username,
        firstName: u.first_name,
        lastName: u.last_name,
        lastActiveAt: u.last_active_at,
        createdAt: u.created_at,
        hasConfig: configUserIds.includes(u.id),
      },
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to create user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: copy one user's config (API keys, GitLab, custom models) to another user
app.post('/api/admin/copy-config', async (req, res) => {
  try {
    if (!userConfigModule) {
      return res.status(400).json({ success: false, error: 'Per-user config not available' });
    }
    const { fromUserId, toUserId } = req.body || {};
    const from = (fromUserId || '').toString().trim();
    const to = (toUserId || '').toString().trim();
    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'fromUserId and toUserId are required' });
    }
    if (from === to) {
      return res.status(400).json({ success: false, error: 'Source and target user must be different' });
    }
    if (useDatabase) {
      const db = require('../database/connection');
      const existing = await db.query('SELECT 1 FROM users WHERE id = ?', [to]);
      if (!existing || existing.length === 0) {
        await db.query(
          'INSERT INTO users (id, is_bot) VALUES (?, FALSE) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
          [to]
        );
        await db.query('INSERT IGNORE INTO user_settings (user_id) VALUES (?)', [to]);
      }
    }
    const sourceConfig = await userConfigModule.getConfigForUser(from);
    await userConfigModule.setUserConfig(to, {
      apiKeys: sourceConfig.apiKeys || {},
      gitlab: sourceConfig.gitlab || {},
      customModels: sourceConfig.customModels || {},
    });
    logger.info('[Dashboard] Admin copied config from', from, 'to', to);
    const full = await userConfigModule.getConfigForUser(to);
    res.json({
      success: true,
      message: `Config copied from ${from} to ${to}`,
      config: sanitizeConfig(full),
      toUserId: to,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to copy config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test AI provider
app.post('/api/ai/test', async (req, res) => {
  try {
    const { provider, message } = req.body;
    const testMessage = message || 'Hello, this is a test message. Please respond with "Test successful".';
    
    logger.info(`[Dashboard] Testing AI provider: ${provider}`);
    
    const result = await aiClient.call(testMessage, {
      provider,
      systemMessage: 'You are a helpful assistant.',
      maxTokens: 100,
    });

    res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      response: result.content,
      duration: result.duration,
      usage: result.usage,
    });
  } catch (error) {
    logger.error('[Dashboard] AI test failed:', error);
    res.status(500).json({
      success: false,
      provider: req.body.provider,
      error: error.message,
    });
  }
});

// Get AI request logs
app.get('/api/ai/logs', (req, res) => {
  try {
    const { limit = 100, provider } = req.query;
    const logs = aiClient.getLogs(parseInt(limit), provider);
    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get AI logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// System Logs API
// ============================================================================

// Get recent logs from log file
app.get('/api/logs', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const logDir = process.env.LOG_DIR || './logs';
    const logFile = path.join(logDir, 'nightowl.log');
    
    const { lines = 100, level } = req.query;
    const maxLines = Math.min(parseInt(lines), 1000);
    
    let content;
    try {
      content = await fs.readFile(logFile, 'utf8');
    } catch (err) {
      // If file doesn't exist, return empty
      return res.json({
        success: true,
        source: 'memory',
        logs: [],
      });
    }
    
    const allLogs = content.trim().split('\n').filter(Boolean);
    
    // Parse JSON logs
    let parsedLogs = allLogs.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line, timestamp: new Date().toISOString() };
      }
    });
    
    // Filter by level if specified
    if (level) {
      parsedLogs = parsedLogs.filter(log => log.level === level);
    }
    
    // Get last N lines
    const recentLogs = parsedLogs.slice(-maxLines);
    
    res.json({
      success: true,
      source: 'file',
      count: recentLogs.length,
      total: allLogs.length,
      logs: recentLogs,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get logs from PM2
app.get('/api/logs/pm2', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    const { lines = 100, process: processName } = req.query;
    const maxLines = Math.min(parseInt(lines), 1000);
    
    const processFilter = processName || 'all';
    const command = `pm2 logs ${processFilter} --lines ${maxLines} --nostream`;
    
    const { stdout } = await execAsync(command);
    
    res.json({
      success: true,
      process: processFilter,
      logs: stdout.split('\n').filter(Boolean),
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get PM2 logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      note: 'Make sure PM2 is installed and running',
    });
  }
});

// Stream logs via Socket.IO
app.post('/api/logs/stream', (req, res) => {
  const { enabled } = req.body;
  
  if (enabled) {
    // Set up log streaming
    const logStream = setInterval(() => {
      const recentLogs = aiClient.getLogs(10);
      io.emit('ai-logs', recentLogs);
    }, 5000);
    
    res.json({
      success: true,
      message: 'Log streaming enabled',
      interval: 5000,
    });
  } else {
    res.json({
      success: true,
      message: 'Log streaming disabled',
    });
  }
});

// ============================================================================
// Chat History API
// ============================================================================

const chatHistory = require('../utils/chat-history');

// Get all chat sessions
app.get('/api/chats/sessions', (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = chatHistory.getAllSessions(parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get chat sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get chat by session ID
app.get('/api/chats/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const chat = chatHistory.getChat(sessionId);
    
    if (!chat) {
      return res.status(404).json({
        success: false,
        error: 'Chat not found',
      });
    }
    
    res.json({
      success: true,
      chat,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get chat:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user sessions
app.get('/api/chats/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = chatHistory.getUserSessions(userId);
    
    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get user sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Search chats
app.get('/api/chats/search', (req, res) => {
  try {
    const { query, userId } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter required',
      });
    }
    
    const results = chatHistory.searchChats(query, userId);
    
    res.json({
      success: true,
      query,
      results,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to search chats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Export chat
app.get('/api/chats/:sessionId/export', (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = chatHistory.exportChat(sessionId);
    
    if (result.success) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="chat-${sessionId}.json"`);
      res.send(JSON.stringify(result.data, null, 2));
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    logger.error('[Dashboard] Failed to export chat:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get chat stats
app.get('/api/chats/stats', (req, res) => {
  try {
    const stats = chatHistory.getStats();
    
    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get chat stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// List all chat files
app.get('/api/chats/files/list', (req, res) => {
  try {
    const files = chatHistory.listChatFiles();
    
    res.json({
      success: true,
      files,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to list chat files:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// User Settings API
// ============================================================================

const chatStorage = require('../utils/chat-storage');

// Get all user settings
app.get('/api/settings/users', (req, res) => {
  try {
    const allSettings = chatStorage.getAllUserSettings ? chatStorage.getAllUserSettings() : {};
    
    res.json({
      success: true,
      users: allSettings,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get user settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user settings by ID
app.get('/api/settings/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const settings = chatStorage.getUserSettings(userId);
    
    res.json({
      success: true,
      userId,
      settings,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get user settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Update user settings
app.put('/api/settings/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const settings = req.body;
    
    chatStorage.setUserSettings(userId, settings);
    
    res.json({
      success: true,
      message: 'Settings updated',
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to update user settings:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Shared Config API
// ============================================================================

const sharedConfig = require('../utils/shared-config');

// Get shared config (without sensitive data)
app.get('/api/config/public', (req, res) => {
  try {
    const providers = sharedConfig.getCustomProviders();
    
    // Return only non-sensitive info
    const safeProviders = {};
    for (const [key, provider] of Object.entries(providers)) {
      safeProviders[key] = {
        name: provider.name,
        baseUrl: provider.baseUrl,
        model: provider.model,
        isCustom: provider.isCustom,
      };
    }
    
    res.json({
      success: true,
      customProviders: safeProviders,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get public config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get AI providers status
app.get('/api/ai/providers', (req, res) => {
  try {
    const aiClient = require('../utils/ai-client');
    const providers = aiClient.getAvailableProviders();
    
    res.json({
      success: true,
      providers,
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get AI providers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// AI Model Testing API
// ============================================================================

// Test an AI model with custom base URL
app.post('/api/ai/test', async (req, res) => {
  try {
    const { baseUrl, apiKey, model, message, systemMessage } = req.body;
    
    if (!baseUrl || !apiKey || !model) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: baseUrl, apiKey, model',
      });
    }

    const testMessage = message || 'Hello, this is a test message. Please respond with "Test successful".';
    const testSystem = systemMessage || 'You are a helpful assistant.';
    
    logger.info(`[Dashboard] Testing AI model: ${model} at ${baseUrl}`);
    
    const startTime = Date.now();
    
    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: model,
          messages: [
            { role: 'system', content: testSystem },
            { role: 'user', content: testMessage },
          ],
          temperature: 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );
      
      const duration = Date.now() - startTime;
      const content = response.data.choices?.[0]?.message?.content || 'No content';
      const usage = response.data.usage || {};
      
      logger.info(`[Dashboard] AI test successful: ${model}`, { duration });
      
      res.json({
        success: true,
        response: content,
        model: model,
        duration: duration,
        tokens: {
          prompt: usage.prompt_tokens || 0,
          completion: usage.completion_tokens || 0,
          total: usage.total_tokens || 0,
        },
        raw: response.data,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`[Dashboard] AI test failed:`, error.message);
      
      // Extract useful error info
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error?.message || error.message;
      
      res.status(200).json({
        success: false,
        error: errorMessage,
        statusCode: error.response?.status,
        duration: duration,
        details: errorData,
      });
    }
  } catch (error) {
    logger.error('[Dashboard] AI test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Fetch available models from OpenAI-compatible endpoint
app.post('/api/ai/models', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body;
    
    if (!baseUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: baseUrl, apiKey',
      });
    }
    
    logger.info(`[Dashboard] Fetching models from: ${baseUrl}`);
    
    const response = await axios.get(
      `${baseUrl}/models`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 10000,
      }
    );
    
    const models = response.data.data?.map(m => m.id) || [];
    
    res.json({
      success: true,
      models: models,
    });
  } catch (error) {
    logger.error('[Dashboard] Fetch models error:', error.message);
    res.status(200).json({
      success: false,
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

// ============================================================================
// Free Materials API
// ============================================================================

const MATERIALS_DATA_DIR = path.join(process.cwd(), 'data');
const SUBSCRIBERS_FILE = path.join(MATERIALS_DATA_DIR, 'subscribers.json');
const DOWNLOADS_FILE = path.join(MATERIALS_DATA_DIR, 'downloads.json');

// Ensure data directory exists
if (!fs.existsSync(MATERIALS_DATA_DIR)) {
  fs.mkdirSync(MATERIALS_DATA_DIR, { recursive: true });
}

// Create email transporter for sending roadmaps
// Option A: Set SMTP_HOST (and optionally SMTP_PORT, SMTP_USER, SMTP_PASS) to use your own relay
//   for better delivery to non-Gmail/own domain (e.g. Mailgun, SendGrid, or your mail server).
// Option B: Use Gmail via GMAIL_USER + GMAIL_PASS. Uses port 587 + STARTTLS for external domains.
//   Requires Gmail App Password when 2FA is on: https://myaccount.google.com/apppasswords
function createEmailTransporter() {
  const smtpHost = process.env.SMTP_HOST && process.env.SMTP_HOST.trim();
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;

  if (smtpHost) {
    if (!smtpUser || !smtpPass) {
      logger.warn('[Email] SMTP_HOST set but SMTP_USER/SMTP_PASS (or GMAIL_*) not set');
      return null;
    }
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort === 587,
      auth: { user: smtpUser, pass: smtpPass },
    });
    transporter.verify((err) => {
      if (err) logger.error('[Email] SMTP verify failed:', err.message);
      else logger.info('[Email] SMTP relay verified:', smtpHost);
    });
    return transporter;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  logger.info(`[Email] Config check - GMAIL_USER: ${gmailUser ? 'SET' : 'NOT SET'}, GMAIL_PASS: ${gmailPass ? 'SET' : 'NOT SET'}`);
  if (!gmailUser || !gmailPass) {
    logger.warn('[Email] GMAIL_USER or GMAIL_PASS not set, emails disabled');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: gmailUser, pass: gmailPass },
    tls: { rejectUnauthorized: true },
  });
  transporter.verify((err) => {
    if (err) logger.error('[Email] Gmail verify failed:', err.message);
    else logger.info('[Email] Gmail transporter verified');
  });
  return transporter;
}

// Send roadmap email to subscriber
async function sendRoadmapEmail(subscriber, roadmap) {
  const transporter = createEmailTransporter();
  if (!transporter) return { success: false, error: 'Email not configured' };
  
  const { email, name } = subscriber;
  const displayName = name || 'there';
  const roadmapTitle = roadmap.charAt(0).toUpperCase() + roadmap.slice(1);
  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;
  
  const mailOptions = {
    from: `"Nigents" <${fromAddress}>`,
    to: email,
    subject: `Your ${roadmapTitle} Developer Roadmap`,
    html: `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #141116; padding: 28px 30px; text-align: center; border-radius: 12px 12px 0 0; border: 1px solid #2a2a35; border-bottom: none;">
          <div style="display: inline-block; width: 44px; height: 44px; background: #ff570a; border-radius: 10px; line-height: 44px; font-size: 22px; font-weight: 700; color: #09080c;">N</div>
          <h1 style="color: #ffffff; margin: 12px 0 0 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Nigents</h1>
        </div>
        <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #09080c; margin-top: 0; font-size: 20px; font-weight: 700;">Hi ${displayName}!</h2>
          <p style="color: #333; font-size: 15px; line-height: 1.6;">Thank you for subscribing! Here's your <strong>${roadmapTitle} Developer Roadmap</strong>.</p>
          
          <div style="background: rgba(255, 87, 10, 0.08); padding: 24px; border-radius: 12px; margin: 24px 0; text-align: center; border: 1px solid rgba(255, 87, 10, 0.2);">
            <p style="margin: 0 0 16px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #ff570a; font-weight: 600;">Download your PDF</p>
            <a href="https://nigents.com/materials/${roadmap}-roadmap.pdf" 
               style="display: inline-block; background: #ff570a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
               Download ${roadmapTitle} Roadmap
            </a>
          </div>
          
          <p style="color: #333; font-size: 15px; line-height: 1.6;">This 30-day roadmap will guide you step-by-step to become a professional ${roadmapTitle} Developer.</p>
          
          <p style="margin-top: 28px; color: #333;">Good luck on your learning journey!<br><strong>The Nigents Team</strong></p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;">
          <p style="color: #666666; font-size: 12px;">
            You're receiving this because you subscribed at <a href="https://nigents.com" style="color: #ff570a;">nigents.com</a>.<br>
            To unsubscribe, reply with "UNSUBSCRIBE".
          </p>
        </div>
      </div>
    `,
    text: `Hi ${displayName}!\n\nThank you for subscribing! Here's your ${roadmapTitle} Developer Roadmap.\n\nDownload your PDF: https://nigents.com/materials/${roadmap}-roadmap.pdf\n\nThis 30-day roadmap will guide you step-by-step to become a professional ${roadmapTitle} Developer.\n\nGood luck on your learning journey!\nThe Nigents Team\n\n---\nYou're receiving this because you subscribed at nigents.com.\nTo unsubscribe, reply with "UNSUBSCRIBE".`,
  };
  
  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`[Email] Roadmap email sent to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    const errMsg = error.message || String(error);
    const errCode = error.code || error.responseCode;
    const errResponse = error.response;
    logger.error(`[Email] Failed to send to ${email}:`, errMsg, errCode ? `(code: ${errCode})` : '', errResponse ? `response: ${typeof errResponse === 'string' ? errResponse : JSON.stringify(errResponse)}` : '');
    return { success: false, error: errMsg };
  }
}

// Load subscribers
function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (error) {
    logger.error('[Dashboard] Error loading subscribers:', error);
  }
  return {};
}

// Save subscribers
function saveSubscribers(subscribers) {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
    return true;
  } catch (error) {
    logger.error('[Dashboard] Error saving subscribers:', error);
    return false;
  }
}

// Load downloads
function loadDownloads() {
  try {
    if (fs.existsSync(DOWNLOADS_FILE)) {
      return JSON.parse(fs.readFileSync(DOWNLOADS_FILE, 'utf8'));
    }
  } catch (error) {
    logger.error('[Dashboard] Error loading downloads:', error);
  }
  return [];
}

// Save download
function saveDownload(download) {
  try {
    const downloads = loadDownloads();
    downloads.push({
      ...download,
      timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify(downloads, null, 2));
    return true;
  } catch (error) {
    logger.error('[Dashboard] Error saving download:', error);
    return false;
  }
}

// Subscribe to free materials
app.post('/api/materials/subscribe', async (req, res) => {
  logger.info(`[Subscribe] Received request: ${JSON.stringify({ email: req.body?.email, roadmap: req.body?.roadmap })}`);
  
  try {
    const { email, name, roadmap } = req.body;
    
    if (!email || !roadmap) {
      logger.warn(`[Subscribe] Missing fields: email=${!!email}, roadmap=${!!roadmap}`);
      return res.status(400).json({
        success: false,
        error: 'Email and roadmap are required',
      });
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn(`[Subscribe] Invalid email: ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
      });
    }
    
    const subscribers = loadSubscribers();
    logger.info(`[Subscribe] Loaded ${Object.keys(subscribers).length} existing subscribers`);
    
    // Check if already subscribed
    if (subscribers[email]) {
      logger.info(`[Subscribe] Existing subscriber: ${email}`);
      
      // Add roadmap to their list if not already there
      if (!subscribers[email].roadmaps.includes(roadmap)) {
        subscribers[email].roadmaps.push(roadmap);
        saveSubscribers(subscribers);
        logger.info(`[Subscribe] Added new roadmap '${roadmap}' to existing subscriber ${email}`);
        
        // Send email for the new roadmap (don't block response)
        sendRoadmapEmail(subscribers[email], roadmap).then(result => {
          if (result.success) {
            logger.info(`[Subscribe] Email sent successfully to ${email}`);
          } else {
            logger.error(`[Subscribe] Email failed to ${email}:`, result.error);
          }
        }).catch(err => {
          logger.error(`[Subscribe] Email error for existing subscriber ${email}:`, err.message);
        });
      }
      
      return res.json({
        success: true,
        message: 'Welcome back! Download your roadmap below.',
        existing: true,
      });
    }
    
    // New subscriber
    const newSubscriber = {
      email,
      name: name || '',
      roadmaps: [roadmap],
      subscribedAt: new Date().toISOString(),
      updatesEnabled: true,
    };
    
    subscribers[email] = newSubscriber;
    const saved = saveSubscribers(subscribers);
    
    logger.info(`[Subscribe] New subscriber saved: ${email} for ${roadmap} (saved=${saved})`);
    
    // Send welcome email with roadmap (don't block response on email)
    sendRoadmapEmail(newSubscriber, roadmap).then(result => {
      if (result.success) {
        logger.info(`[Subscribe] Email sent successfully to ${email}, messageId: ${result.messageId}`);
      } else {
        logger.error(`[Subscribe] Email failed to ${email}:`, result.error);
      }
    }).catch(err => {
      logger.error(`[Subscribe] Email error for ${email}:`, err.message);
    });
    
    res.json({
      success: true,
      message: 'Thank you! Your roadmap is ready for download.',
      existing: false,
    });
  } catch (error) {
    logger.error('[Subscribe] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process subscription',
    });
  }
});

// Test email configuration
app.get('/api/materials/email-config', (req, res) => {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  
  res.json({
    success: true,
    configured: !!(gmailUser && gmailPass),
    user: gmailUser ? `${gmailUser.substring(0, 3)}***` : null,
    envLoaded: !!process.env.GMAIL_USER,
  });
});

// Test email sending - send a test email
app.post('/api/materials/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    
    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Email address required',
      });
    }
    
    logger.info(`[TestEmail] Sending test email to ${to}`);
    
    const transporter = createEmailTransporter();
    if (!transporter) {
      return res.status(500).json({
        success: false,
        error: 'Email not configured - GMAIL_USER or GMAIL_PASS missing',
        env: {
          GMAIL_USER: process.env.GMAIL_USER ? 'SET' : 'NOT SET',
          GMAIL_PASS: process.env.GMAIL_PASS ? 'SET' : 'NOT SET',
        },
      });
    }
    
    const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;
    const result = await transporter.sendMail({
      from: `"Nigents Test" <${fromAddress}>`,
      to: to,
      subject: 'Test Email from Nigents',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #6366f1;">Test Email</h2>
          <p>This is a test email from your Nigents server.</p>
          <p>If you're receiving this, email configuration is working correctly!</p>
          <p>Time sent: ${new Date().toISOString()}</p>
          <hr style="margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">Sent from Nigents Dashboard</p>
        </div>
      `,
      text: `Test Email\n\nThis is a test email from your Nigents server.\nIf you're receiving this, email configuration is working correctly!\n\nTime sent: ${new Date().toISOString()}`,
    });
    
    logger.info(`[TestEmail] Test email sent successfully to ${to}`);
    
    res.json({
      success: true,
      message: `Test email sent to ${to}`,
      messageId: result.messageId,
    });
    
  } catch (error) {
    logger.error('[TestEmail] Failed to send test email:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      response: error.response,
    });
  }
});

// List available PDF files
app.get('/api/materials/pdfs', (req, res) => {
  try {
    const materialsDir = path.join(__dirname, 'public', 'materials');
    logger.info(`[Materials] Checking PDFs in: ${materialsDir}`);
    
    if (!fs.existsSync(materialsDir)) {
      logger.error(`[Materials] Directory not found: ${materialsDir}`);
      return res.status(500).json({
        success: false,
        error: 'Materials directory not found',
      });
    }
    
    const files = fs.readdirSync(materialsDir);
    const pdfs = files.filter(f => f.endsWith('.pdf'));
    
    logger.info(`[Materials] Found ${pdfs.length} PDFs: ${pdfs.join(', ')}`);
    
    res.json({
      success: true,
      count: pdfs.length,
      files: pdfs,
      path: materialsDir,
    });
  } catch (error) {
    logger.error('[Materials] Error listing PDFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug email configuration
app.get('/api/materials/email-debug', (req, res) => {
  try {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;
    
    // Create transporter and verify
    if (!gmailUser || !gmailPass) {
      return res.json({
        success: false,
        error: 'Email not configured',
        env: {
          GMAIL_USER: gmailUser ? 'SET' : 'NOT SET',
          GMAIL_PASS: gmailPass ? 'SET' : 'NOT SET',
        },
      });
    }
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });
    
    transporter.verify((error, success) => {
      if (error) {
        res.json({
          success: false,
          verified: false,
          error: error.message,
          code: error.code,
          env: {
            GMAIL_USER: gmailUser.substring(0, 3) + '***',
            GMAIL_PASS_LENGTH: gmailPass ? gmailPass.length : 0,
          },
        });
      } else {
        res.json({
          success: true,
          verified: true,
          message: 'Email transporter verified successfully',
          env: {
            GMAIL_USER: gmailUser.substring(0, 3) + '***',
          },
        });
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Track download
app.post('/api/materials/download', (req, res) => {
  try {
    const { email, roadmap, filename } = req.body;
    
    saveDownload({
      email,
      roadmap,
      filename,
      ip: req.ip,
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('[Dashboard] Download tracking error:', error);
    res.status(500).json({ success: false });
  }
});

// Get subscribers count (admin)
app.get('/api/materials/stats', (req, res) => {
  try {
    const subscribers = loadSubscribers();
    const downloads = loadDownloads();
    
    res.json({
      success: true,
      totalSubscribers: Object.keys(subscribers).length,
      totalDownloads: downloads.length,
      roadmaps: {
        fullstack: downloads.filter(d => d.roadmap === 'fullstack').length,
        backend: downloads.filter(d => d.roadmap === 'backend').length,
        frontend: downloads.filter(d => d.roadmap === 'frontend').length,
        qa: downloads.filter(d => d.roadmap === 'qa').length,
      },
    });
  } catch (error) {
    logger.error('[Dashboard] Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all subscribers (admin - requires password)
app.get('/api/materials/subscribers', (req, res) => {
  try {
    const { password } = req.query;
    const adminPassword = process.env.DASHBOARD_PASSWORD || 'admin123';
    
    if (password !== adminPassword) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - invalid password',
      });
    }
    
    const subscribers = loadSubscribers();
    const subscriberList = Object.entries(subscribers).map(([email, data]) => ({
      email,
      name: data.name || '',
      roadmaps: data.roadmaps || [],
      subscribedAt: data.subscribedAt,
    }));
    
    res.json({
      success: true,
      count: subscriberList.length,
      subscribers: subscriberList,
    });
  } catch (error) {
    logger.error('[Dashboard] Get subscribers error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export subscribers to CSV (admin)
app.get('/api/materials/subscribers/export', (req, res) => {
  try {
    const { password, format = 'csv' } = req.query;
    const adminPassword = process.env.DASHBOARD_PASSWORD || 'admin123';
    
    if (password !== adminPassword) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - invalid password',
      });
    }
    
    const subscribers = loadSubscribers();
    const emails = Object.keys(subscribers);
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=subscribers.json');
      return res.json(subscribers);
    }
    
    // CSV format
    let csv = 'Email,Name,Roadmaps,Subscribed Date\n';
    emails.forEach(email => {
      const s = subscribers[email];
      const name = (s.name || '').replace(/"/g, '""');
      const roadmaps = (s.roadmaps || []).join(';');
      const date = s.subscribedAt ? new Date(s.subscribedAt).toISOString() : '';
      csv += `"${email}","${name}","${roadmaps}","${date}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscribers.csv');
    res.send(csv);
    
  } catch (error) {
    logger.error('[Dashboard] Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Workflow Projects (n8n-style canvas + GitLab link) & meeting transcript
// ============================================================================

const WORKFLOW_PROJECTS_FILE = path.join(MATERIALS_DATA_DIR, 'workflow-projects.json');

function loadWorkflowProjects() {
  try {
    if (fs.existsSync(WORKFLOW_PROJECTS_FILE)) {
      return JSON.parse(fs.readFileSync(WORKFLOW_PROJECTS_FILE, 'utf8'));
    }
  } catch (e) {
    logger.error('[Workflow] load error:', e.message);
  }
  return { projects: [] };
}

function saveWorkflowProjects(data) {
  fs.writeFileSync(WORKFLOW_PROJECTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function projectToClient(p) {
  if (!p) return p;
  return {
    id: p.id,
    name: p.name,
    gitlabPath: p.gitlabPath || '',
    gitlabProjectId: p.gitlabProjectId || '',
    nodes: p.nodes || [],
    edges: p.edges || [],
    meta: p.meta,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

app.get('/api/workflow-projects', async (req, res) => {
  try {
    if (wfMysql) {
      const projects = await wfMysql.listProjects();
      return res.json({ success: true, projects: projects.map(projectToClient), storage: 'mysql' });
    }
    const data = loadWorkflowProjects();
    res.json({ success: true, projects: data.projects || [], storage: 'file' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/workflow-projects', async (req, res) => {
  try {
    const name = (req.body.name || '').trim() || 'Untitled project';
    const gitlabPath = (req.body.gitlabPath || '').trim() || '';
    const gitlabProjectId = req.body.gitlabProjectId != null ? String(req.body.gitlabProjectId) : '';
    const id = `wp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const row = {
      id,
      name,
      gitlabPath: gitlabPath || null,
      gitlabProjectId,
      nodes: Array.isArray(req.body.nodes) ? req.body.nodes : [],
      edges: Array.isArray(req.body.edges) ? req.body.edges : [],
    };
    if (wfMysql) {
      await wfMysql.ensureTable();
      const created = await wfMysql.createProject({
        ...row,
        meta: { createdFrom: 'dashboard' },
      });
      return res.json({ success: true, project: projectToClient(created), storage: 'mysql' });
    }
    const data = loadWorkflowProjects();
    const project = {
      id,
      name,
      gitlabPath,
      gitlabProjectId,
      nodes: row.nodes,
      edges: row.edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.projects = data.projects || [];
    data.projects.push(project);
    saveWorkflowProjects(data);
    res.json({ success: true, project, storage: 'file' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/api/workflow-projects/:id', async (req, res) => {
  try {
    if (wfMysql) {
      const updated = await wfMysql.updateProject(req.params.id, {
        name: req.body.name,
        gitlabPath: req.body.gitlabPath,
        gitlabProjectId: req.body.gitlabProjectId,
        nodes: req.body.nodes,
        edges: req.body.edges,
        meta: req.body.meta,
      });
      if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
      return res.json({ success: true, project: projectToClient(updated), storage: 'mysql' });
    }
    const data = loadWorkflowProjects();
    const idx = (data.projects || []).findIndex(p => p.id === req.params.id);
    if (idx < 0) return res.status(404).json({ success: false, error: 'Project not found' });
    const p = data.projects[idx];
    if (req.body.name != null) p.name = String(req.body.name).trim() || p.name;
    if (req.body.gitlabPath !== undefined) p.gitlabPath = String(req.body.gitlabPath || '').trim();
    if (req.body.gitlabProjectId !== undefined) p.gitlabProjectId = String(req.body.gitlabProjectId || '');
    if (Array.isArray(req.body.nodes)) p.nodes = req.body.nodes;
    if (Array.isArray(req.body.edges)) p.edges = req.body.edges;
    p.updatedAt = new Date().toISOString();
    saveWorkflowProjects(data);
    res.json({ success: true, project: p, storage: 'file' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.delete('/api/workflow-projects/:id', async (req, res) => {
  try {
    if (wfMysql) {
      const ok = await wfMysql.deleteProject(req.params.id);
      if (!ok) return res.status(404).json({ success: false, error: 'Not found' });
      return res.json({ success: true, storage: 'mysql' });
    }
    const data = loadWorkflowProjects();
    const before = (data.projects || []).length;
    data.projects = (data.projects || []).filter(p => p.id !== req.params.id);
    if (data.projects.length === before) return res.status(404).json({ success: false, error: 'Not found' });
    saveWorkflowProjects(data);
    res.json({ success: true, storage: 'file' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Analyze a GitLab repo (file tree + README/package hints) and draft an n8n-style agent workflow with AI.
 */
app.post('/api/workflow-projects/draft-from-repo', async (req, res) => {
  try {
    const gitlabPath = (req.body.gitlabPath || '').trim();
    if (!gitlabPath) {
      return res.status(400).json({ success: false, error: 'gitlabPath required (e.g. group/repo)' });
    }
    const gitlab = require('../tools/gitlab');
    if (!gitlab.isConfigured()) {
      return res.status(400).json({ success: false, error: 'GitLab not configured (GITLAB_TOKEN)' });
    }

    const ref = await gitlab.getDefaultBranch(gitlabPath).catch(() => 'main');
    const files = await gitlab.getRepositoryFiles(gitlabPath, 200, ref);
    const treeLines = (files || []).map(f => f.path).filter(Boolean).join('\n') || '(empty tree)';

    let extra = '';
    const tryFiles = ['README.md', 'readme.md', 'package.json', 'pom.xml', 'go.mod', 'requirements.txt', 'Cargo.toml'];
    for (const fp of tryFiles) {
      try {
        const c = await gitlab.getFileContent(gitlabPath, fp, ref);
        if (c && typeof c === 'string' && c.length > 0) {
          extra += `\n\n--- ${fp} (excerpt) ---\n${c.slice(0, 2800)}`;
          if (extra.length > 6000) break;
        }
      } catch (_) {
        /* skip */
      }
    }

    const aiClient = require('../utils/ai-client');
    const { extractJsonFromAi, layoutWorkflowNodes } = require('../utils/workflow-draft');

    const systemMessage = `You are a senior software architect. Propose a multi-agent development workflow for the Nigents platform.

Available agent types (use these exact strings only): orchestrator, planner, backend-dev, frontend-dev, qa-tester, code-reviewer, reporter

Rules:
- Start with orchestrator; include planner early if the repo is large or unclear.
- Include qa-tester and code-reviewer before reporter when code changes are expected.
- Use reporter last for summaries / handoff.
- Use MULTIPLE nodes with the same agentType only when the repository structure clearly warrants it (e.g. separate services, monorepo packages, distinct frontend apps). Set duplicateReason on those nodes (short text). Otherwise one node per role is enough.
- Edges must reference node ids you define. Flow left-to-right conceptually: orchestration → planning → implementation → qa → review → report.

Respond with ONLY valid JSON (no markdown fences), shape:
{"summary":"string","stackHints":["string"],"rationale":"string","nodes":[{"id":"n1","agentType":"orchestrator","label":"short","duplicateReason":null}],"edges":[{"from":"n1","to":"n2"}]}`;

    const userPrompt = `Repository: ${gitlabPath} (branch ${ref})

FILE TREE (paths, truncated):
${treeLines.slice(0, 14000)}
${extra.slice(0, 8000)}

Design the agent workflow JSON as specified.`;

    const aiResult = await aiClient.call(userPrompt, {
      maxTokens: 4096,
      temperature: 0.25,
      systemMessage,
    });

    const raw = aiResult.content || '';
    let parsed;
    try {
      parsed = extractJsonFromAi(raw);
    } catch (parseErr) {
      logger.error('[Workflow] draft JSON parse failed:', parseErr.message);
      return res.status(422).json({
        success: false,
        error: 'AI did not return valid JSON. Try again or shorten repo.',
        raw: raw.slice(0, 2000),
      });
    }

    const { nodes: nodesLaid, edges: edgesOut } = layoutWorkflowNodes(parsed.nodes, parsed.edges);

    res.json({
      success: true,
      summary: parsed.summary || '',
      rationale: parsed.rationale || '',
      stackHints: Array.isArray(parsed.stackHints) ? parsed.stackHints : [],
      nodes: nodesLaid,
      edges: edgesOut,
      gitlabPath,
      ref,
      provider: aiResult.provider,
      model: aiResult.model,
    });
  } catch (e) {
    logger.error('[Workflow] draft-from-repo error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Voice / meeting transcript → agent-style text reply (Zoom: paste transcript here; future: webhooks) */
app.post('/api/meeting/transcript', async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text required' });
    const aiClient = require('../utils/ai-client');
    const context = (req.body.context || '').trim();
    const systemMessage = 'You are Nigents assistant. Summarize meeting notes, list action items, and suggest how the agent team (orchestrator, planner, backend-dev, frontend-dev, qa-tester, code-reviewer, reporter) should proceed. Respond in clear Markdown.';
    const userPrompt = `Summarize this meeting transcript and suggest next steps for the development agents.\n\nProject/context:\n${context || '(none)'}\n\n---\n\nTranscript:\n${text}`;
    const result = await aiClient.call(userPrompt, {
      maxTokens: 2048,
      temperature: 0.35,
      systemMessage,
    });
    res.json({
      success: true,
      reply: result.content,
      provider: result.provider,
      model: result.model,
    });
  } catch (e) {
    logger.error('[Meeting] transcript error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

const { runRoundtable } = require('../utils/meeting-roundtable');
const meetingRoomState = require('../utils/meeting-room-state');

/** Authenticated: generate shareable links from Workflow Studio */
app.post('/api/meeting/sessions', (req, res) => {
  try {
    const session = meetingSessionsMod.createSession({ source: 'dashboard' });
    const base = meetingSessionsMod.getPublicDashboardUrl();
    res.json({
      success: true,
      token: session.token,
      meetingRoomUrl: `${base}/meeting-room.html?token=${encodeURIComponent(session.token)}`,
      jitsiUrl: session.jitsiUrl,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    logger.error('[Meeting] dashboard session:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Public: validate token from Telegram / email link */
app.get('/api/meeting/session/:token', (req, res) => {
  try {
    const s = meetingSessionsMod.getSession(req.params.token);
    if (!s) {
      return res.status(404).json({ success: false, error: 'Invalid or expired session' });
    }
    const base = meetingSessionsMod.getPublicDashboardUrl();
    res.json({
      success: true,
      jitsiUrl: s.jitsiUrl,
      roomSlug: s.roomSlug,
      expiresAt: s.expiresAt,
      meetingRoomUrl: `${base}/meeting-room.html?token=${encodeURIComponent(s.token)}`,
    });
  } catch (e) {
    logger.error('[Meeting] session get:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Public: same roundtable as dashboard, but gated by session token (no login). */
app.post('/api/meeting/session/:token/roundtable', async (req, res) => {
  try {
    const s = meetingSessionsMod.getSession(req.params.token);
    if (!s) {
      return res.status(404).json({ success: false, error: 'Invalid or expired session' });
    }
    const out = await runRoundtable({
      message: req.body.message,
      context: req.body.context,
      agents: req.body.agents,
      history: Array.isArray(req.body.history) ? req.body.history : [],
    });
    res.json({
      success: true,
      turns: out.turns,
      agentsOrder: out.agentsOrder,
      provider: out.provider,
      model: out.model,
    });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ success: false, error: e.message });
    }
    if (e.code === 'PARSE') {
      logger.error('[Meeting] session roundtable parse:', e.message);
      return res.status(422).json({
        success: false,
        error: 'AI did not return valid JSON. Try again.',
        raw: (e.raw || '').toString().slice(0, 2000),
      });
    }
    logger.error('[Meeting] session roundtable:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Multi-agent roundtable: user message → agents reply in strict order (no cross-talk).
 * Body: { message, context?, agents?: string[], history?: { role, content, agentType? }[] }
 */
app.post('/api/meeting/roundtable', async (req, res) => {
  try {
    const out = await runRoundtable({
      message: req.body.message,
      context: req.body.context,
      agents: req.body.agents,
      history: Array.isArray(req.body.history) ? req.body.history : [],
    });
    res.json({
      success: true,
      turns: out.turns,
      agentsOrder: out.agentsOrder,
      provider: out.provider,
      model: out.model,
    });
  } catch (e) {
    if (e.code === 'VALIDATION') {
      return res.status(400).json({ success: false, error: e.message });
    }
    if (e.code === 'PARSE') {
      logger.error('[Meeting] roundtable parse:', e.message);
      return res.status(422).json({
        success: false,
        error: 'AI did not return valid JSON. Try again or shorten the message.',
        raw: (e.raw || '').toString().slice(0, 2000),
      });
    }
    logger.error('[Meeting] roundtable error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================================
// Socket.IO
// ============================================================================

io.on('connection', async (socket) => {
  logger.info('Dashboard client connected:', socket.id);

  /** Broadcast shared meeting state to everyone in the room (multi-tab / multi-user). */
  function emitMeetingSync(token) {
    io.to('meeting:' + token).emit('meeting-sync', {
      history: meetingRoomState.getHistory(token),
      processing: meetingRoomState.isProcessing(token),
    });
  }

  const state = await getDashboardState();
  socket.emit('init', state);

  socket.on('requestStatus', async () => {
    const freshState = await getDashboardState();
    socket.emit('init', freshState);
  });

  // Handle chat
  socket.on('chat', async (data) => {
    io.emit('chatMessage', {
      agent: data.agent,
      type: 'user',
      message: data.message,
      timestamp: new Date(),
    });
  });

  /** Multi-participant meeting room — shared AI chat (same token = same room) */
  socket.on('join-meeting', ({ token }) => {
    try {
      if (!token || !meetingSessionsMod.getSession(token)) {
        socket.emit('meeting-error', { error: 'Invalid or expired session' });
        return;
      }
      socket.join('meeting:' + token);
      socket.emit('meeting-sync', {
        history: meetingRoomState.getHistory(token),
        processing: meetingRoomState.isProcessing(token),
      });
    } catch (e) {
      logger.error('[Meeting] join-meeting:', e.message);
      socket.emit('meeting-error', { error: e.message });
    }
  });

  socket.on('leave-meeting', ({ token }) => {
    if (token) socket.leave('meeting:' + token);
  });

  socket.on('meeting-clear', ({ token }) => {
    try {
      if (!token || !meetingSessionsMod.getSession(token)) return;
      meetingRoomState.clearHistory(token);
      emitMeetingSync(token);
    } catch (e) {
      logger.error('[Meeting] meeting-clear:', e.message);
    }
  });

  socket.on('meeting-roundtable', async ({ token, message, context, agents, displayName }) => {
    const msg = (message || '').trim();
    if (!msg || !token) return;
    if (!meetingSessionsMod.getSession(token)) {
      socket.emit('meeting-error', { error: 'Invalid or expired session' });
      return;
    }
    if (meetingRoomState.isProcessing(token)) {
      socket.emit('meeting-error', { error: 'Agents are still replying — wait a moment.' });
      return;
    }
    try {
      meetingRoomState.setProcessing(token, true);
      const from = (displayName && String(displayName).trim().slice(0, 48)) || 'Guest';
      meetingRoomState.appendUserMessage(token, { content: msg, from });
      emitMeetingSync(token);

      const full = meetingRoomState.getHistory(token);
      const prior = meetingRoomState.historyForAi(full.slice(0, -1));

      const out = await runRoundtable({
        message: msg,
        context: (context || '').trim(),
        agents: Array.isArray(agents) && agents.length ? agents : ['orchestrator', 'planner', 'backend-dev'],
        history: prior,
      });

      meetingRoomState.appendAgentTurns(token, out.turns);
      meetingRoomState.setProcessing(token, false);

      emitMeetingSync(token);
      io.to('meeting:' + token).emit('meeting-roundtable-done', {
        requesterSocketId: socket.id,
        history: meetingRoomState.getHistory(token),
        turns: out.turns,
        error: null,
      });
    } catch (e) {
      meetingRoomState.setProcessing(token, false);
      meetingRoomState.popLastUserMessage(token);
      emitMeetingSync(token);
      const errMsg =
        e.code === 'PARSE' || (e.message && String(e.message).includes('JSON'))
          ? 'AI did not return valid JSON. Try again.'
          : e.message || 'Roundtable failed';
      socket.emit('meeting-error', { error: errMsg });
      logger.error('[Meeting] socket roundtable:', e.message);
    }
  });

  socket.on('disconnect', () => {
    logger.info('Dashboard client disconnected:', socket.id);
  });
});

// ============================================================================
// Bonyad fix briefs (MySQL-backed, public API; Nigents-themed UI)
// ============================================================================
if (useDatabase) {
  try {
    const bonyadApi = require('./bonyad-api');
    bonyadApi.registerBonyadRoutes(app);
    const bonyadExcel = require('./bonyad-excel-import');
    bonyadExcel.registerBonyadExcelRoutes(app);
    logger.info('[Bonyad] API routes registered (including Excel import)');
  } catch (e) {
    logger.error('[Bonyad] Register routes failed:', e.message);
  }
}
app.get('/bonyad', (req, res) => {
  res.redirect(301, '/bonyad/');
});

// ============================================================================
// SPA Catch-all (must be AFTER all API routes)
// ============================================================================

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  // Don't interfere with API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// Start Server
// ============================================================================

// ============================================================================
// Start Server
// ============================================================================

async function startDashboardServer() {
  if (useDatabase && dashboardAccountsMod) {
    try {
      await dashboardAccountsMod.ensureTables();
    } catch (e) {
      logger.error('[Dashboard] dashboard_accounts ensureTables:', e.message);
    }
  }

  if (useDatabase && wfMysql) {
    try {
      await wfMysql.ensureTable();
      await wfMysql.migrateFromJsonFile(WORKFLOW_PROJECTS_FILE);
      await wfMysql.syncFromGitlabEnv();
    } catch (e) {
      logger.error('[Dashboard] workflow_projects init:', e.message);
    }
  }

  if (useDatabase) {
    try {
      const bonyadApi = require('./bonyad-api');
      await bonyadApi.initBonyadData();
      if (!process.env.BONYAD_EDIT_SECRET) {
        logger.warn('[Bonyad] BONYAD_EDIT_SECRET is unset — issue/sheet mutations are open to anyone with network access to the API');
      }
    } catch (e) {
      logger.error('[Bonyad] init:', e.message);
    }
  }

  server.listen(PORT, () => {
    logger.info(`NIGENTS DASHBOARD v2 - Free Materials API Enabled`);
    logger.info(`Running on port ${PORT}`);
    logger.info(`Dashboard URL: http://localhost:${PORT}`);
    if (useDatabase && dashboardAccountsMod) {
      logger.info('[Dashboard] Multi-user accounts: enabled (MySQL). Create users from Admin → Dashboard logins.');
    }

    // Verify critical routes are loaded
    const routes = app._router?.stack || [];
    const hasSubscribeRoute = routes.some(r => r.route?.path === '/api/materials/subscribe');
    logger.info(`Subscribe API route loaded: ${hasSubscribeRoute}`);

    // Check email config
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_PASS;
    logger.info(`Email configured: ${!!(gmailUser && gmailPass)}`);

    // Check materials directory
    const materialsDir = path.join(__dirname, 'public', 'materials');
    if (fs.existsSync(materialsDir)) {
      const pdfs = fs.readdirSync(materialsDir).filter(f => f.endsWith('.pdf'));
      logger.info(`PDFs available: ${pdfs.length} (${pdfs.join(', ')})`);
    } else {
      logger.warn(`Materials directory not found: ${materialsDir}`);
    }
  });
}

startDashboardServer();

module.exports = { app, server, io, addActivity };
