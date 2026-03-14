/**
 * 🦉 Nigents - Web Dashboard Server
 * Real-time agent activity and task monitoring with streaming
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
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

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard state
const dashboardState = {
  agents: [],
  tasks: [],
  activities: [],
  codeEdits: [],
  agentCommunications: [],
  systemStatus: 'running',
  startTime: new Date(),
};

// ============================================================================
// API Routes
// ============================================================================

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

app.get('/logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

app.get('/logs.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: dashboardState.systemStatus,
    uptime: Date.now() - dashboardState.startTime,
    agents: dashboardState.agents.length,
    activeTasks: dashboardState.tasks.filter(t => t.status === 'running').length,
    queuedTasks: dashboardState.tasks.filter(t => t.status === 'queued').length,
    completedTasks: dashboardState.tasks.filter(t => t.status === 'completed').length,
  });
});

app.get('/api/agents', (req, res) => {
  res.json(dashboardState.agents);
});

app.get('/api/tasks', (req, res) => {
  res.json(dashboardState.tasks);
});

app.get('/api/activity', (req, res) => {
  res.json(dashboardState.activities.slice(-100));
});

// Update agent status with activity
app.post('/api/agents/:name/status', (req, res) => {
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
  }
  
  res.json({ success: true });
});

// Code edit streaming endpoint
app.post('/api/code-edit', (req, res) => {
  const { agent, file, code, action, lineNumbers } = req.body;
  
  const editData = {
    id: Date.now().toString(),
    agent,
    file,
    code,
    action,
    lineNumbers,
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

// Agent communication endpoint
app.post('/api/agent-communication', (req, res) => {
  const { from, to, message, type } = req.body;
  
  const commData = {
    id: Date.now().toString(),
    from,
    to,
    message,
    type,
    timestamp: new Date(),
  };
  
  dashboardState.agentCommunications.push(commData);
  io.emit('agentCommunication', commData);
  
  res.json({ success: true });
});

// Add task
app.post('/api/tasks', (req, res) => {
  const task = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date(),
  };
  
  dashboardState.tasks.push(task);
  io.emit('task', task);
  
  addActivity({
    type: 'system',
    agent: 'orchestrator',
    message: `Task created: ${task.title}`,
    timestamp: new Date(),
  });
  
  res.json({ success: true, task });
});

// Update task progress
app.put('/api/tasks/:id/progress', (req, res) => {
  const { id } = req.params;
  const { progress, status, message } = req.body;

  const task = dashboardState.tasks.find(t => t.id === id);
  if (task) {
    task.progress = progress;
    if (status) task.status = status;
    task.updatedAt = new Date();
    
    io.emit('task', task);
    
    if (message) {
      addActivity({
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
function addActivity(data) {
  dashboardState.activities.push(data);
  
  if (dashboardState.activities.length > 100) {
    dashboardState.activities = dashboardState.activities.slice(-100);
  }
  
  io.emit('activity', data);
}

// ============================================================================
// GitLab API Routes
// ============================================================================

// Get GitLab configuration status
app.get('/api/gitlab/config', (req, res) => {
  const hasToken = !!process.env.GITLAB_TOKEN;
  const hasNamespace = !!process.env.GITLAB_NAMESPACE;
  
  res.json({
    configured: hasToken && hasNamespace,
    hasToken,
    hasNamespace,
    namespace: process.env.GITLAB_NAMESPACE || null,
    url: process.env.GITLAB_URL || 'https://gitlab.com',
  });
});

// Fetch repositories from GitLab
app.get('/api/gitlab/repos', async (req, res) => {
  try {
    const token = process.env.GITLAB_TOKEN;
    const namespace = process.env.GITLAB_NAMESPACE;
    const baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
    
    logger.info('[Dashboard] Fetching GitLab repos...');
    logger.info(`[Dashboard] Namespace: ${namespace}`);
    logger.info(`[Dashboard] Token exists: ${!!token}`);
    logger.info(`[Dashboard] Base URL: ${baseUrl}`);
    
    if (!token) {
      logger.error('[Dashboard] GITLAB_TOKEN not configured');
      return res.status(400).json({ 
        success: false, 
        error: 'GITLAB_TOKEN not configured',
        message: 'Add GITLAB_TOKEN to your .env file'
      });
    }
    
    if (!namespace) {
      logger.error('[Dashboard] GITLAB_NAMESPACE not configured');
      return res.status(400).json({ 
        success: false, 
        error: 'GITLAB_NAMESPACE not configured',
        message: 'Add GITLAB_NAMESPACE to your .env file'
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
    const token = process.env.GITLAB_TOKEN;
    const baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
    
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
    
    // Debug: log env vars (masked)
    logger.info('[Dashboard] AI Provider env check:', {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET',
      ZHIPU_API_KEY: process.env.ZHIPU_API_KEY ? 'SET' : 'NOT SET',
      MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY ? 'SET' : 'NOT SET',
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? 'SET' : 'NOT SET',
    });
    
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

// Update API keys
app.post('/api/config/apikeys', (req, res) => {
  try {
    const { apiKeys } = req.body;
    const sharedConfig = require('../utils/shared-config');
    
    // Update the shared config
    sharedConfig.updateApiKeys(apiKeys);
    
    // Apply to environment
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

// Get shared config (sanitized)
app.get('/api/config', (req, res) => {
  try {
    const sharedConfig = require('../utils/shared-config');
    res.json({
      success: true,
      config: sharedConfig.getSanitizedConfig(),
    });
  } catch (error) {
    logger.error('[Dashboard] Failed to get config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
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
function createEmailTransporter() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  
  if (!gmailUser || !gmailPass) {
    logger.warn('[Email] GMAIL_USER or GMAIL_PASS not set, emails disabled');
    return null;
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
}

// Send roadmap email to subscriber
async function sendRoadmapEmail(subscriber, roadmap) {
  const transporter = createEmailTransporter();
  if (!transporter) return { success: false, error: 'Email not configured' };
  
  const { email, name } = subscriber;
  const displayName = name || 'there';
  const roadmapTitle = roadmap.charAt(0).toUpperCase() + roadmap.slice(1);
  const gmailUser = process.env.GMAIL_USER;
  
  const mailOptions = {
    from: `"Nigents" <${gmailUser}>`,
    to: email,
    subject: `🎓 Your ${roadmapTitle} Developer Roadmap`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">Nigents Learning</h1>
        </div>
        <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #10b981; margin-top: 0;">Hi ${displayName}! 👋</h2>
          <p>Thank you for subscribing! Here's your <strong>${roadmapTitle} Developer Roadmap</strong>.</p>
          
          <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0 0 15px 0; font-size: 16px;">📥 Download your PDF:</p>
            <a href="https://nigents.com/materials/${roadmap}-roadmap.pdf" 
               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
               Download ${roadmapTitle} Roadmap
            </a>
          </div>
          
          <p>This 30-day roadmap will guide you step-by-step to become a professional ${roadmapTitle} Developer.</p>
          
          <p style="margin-top: 30px;">Good luck on your learning journey!<br><strong>The Nigents Team</strong></p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            You're receiving this because you subscribed at <a href="https://nigents.com" style="color: #667eea;">nigents.com</a>.<br>
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
    logger.error(`[Email] Failed to send to ${email}:`, error.message);
    return { success: false, error: error.message };
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
  try {
    const { email, name, roadmap } = req.body;
    
    if (!email || !roadmap) {
      return res.status(400).json({
        success: false,
        error: 'Email and roadmap are required',
      });
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address',
      });
    }
    
    const subscribers = loadSubscribers();
    
    // Check if already subscribed
    if (subscribers[email]) {
      // Add roadmap to their list if not already there
      if (!subscribers[email].roadmaps.includes(roadmap)) {
        subscribers[email].roadmaps.push(roadmap);
        saveSubscribers(subscribers);
        
        // Send email for the new roadmap
        await sendRoadmapEmail(subscribers[email], roadmap);
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
    saveSubscribers(subscribers);
    
    logger.info(`[Dashboard] New subscriber: ${email} for ${roadmap}`);
    
    // Send welcome email with roadmap
    await sendRoadmapEmail(newSubscriber, roadmap);
    
    res.json({
      success: true,
      message: 'Thank you! Your roadmap is ready for download.',
      existing: false,
    });
  } catch (error) {
    logger.error('[Dashboard] Subscribe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process subscription',
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

// ============================================================================
// Socket.IO
// ============================================================================

io.on('connection', (socket) => {
  logger.info('Dashboard client connected:', socket.id);

  // Send current state
  socket.emit('init', dashboardState);

  // Request status update
  socket.on('requestStatus', () => {
    socket.emit('init', dashboardState);
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

  socket.on('disconnect', () => {
    logger.info('Dashboard client disconnected:', socket.id);
  });
});

// ============================================================================
// Start Server
// ============================================================================

server.listen(PORT, () => {
  logger.info(`Nigents Dashboard running on port ${PORT}`);
  logger.info(`Dashboard URL: http://localhost:${PORT}`);
});

module.exports = { app, server, io, addActivity };
