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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
