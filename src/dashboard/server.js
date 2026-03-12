/**
 * 🦉 NightOwl - Web Dashboard Server
 * Real-time agent activity and task monitoring with streaming
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('../utils/logger');

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
  logger.info(`NightOwl Dashboard running on port ${PORT}`);
  logger.info(`Dashboard URL: http://localhost:${PORT}`);
});

module.exports = { app, server, io, addActivity };
