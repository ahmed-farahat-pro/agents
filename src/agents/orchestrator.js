/**
 * 🦉 Nigents - Orchestrator Agent
 * Team Lead & Router - Coordinates all other agents
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class OrchestratorAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json').orchestrator;
    super(config);
    
    this.agents = new Map();
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.completedTasks = [];
  }

  /**
   * Register an agent with the orchestrator
   */
  registerAgent(agent) {
    this.agents.set(agent.name, agent);
    logger.info(`[Orchestrator] Registered agent: ${agent.name}`);
    
    // Listen to agent events
    agent.on('statusChange', (data) => {
      this.emit('agentStatusChange', data);
    });
  }

  /**
   * Process a user command
   */
  async processCommand(command, context = {}) {
    const taskId = uuidv4();
    logger.info(`[Orchestrator] Processing command: ${command}`, { taskId, context });

    this.setStatus('working', { taskId, command });

    try {
      // Parse the command
      const parsed = await this.parseCommand(command, context);
      
      switch (parsed.type) {
        case 'plan':
          return await this.handlePlanTask(parsed, context, taskId);
        
        case 'ask':
          return await this.handleAskTask(parsed, context, taskId);
        
        case 'approve':
          return await this.handleApproveTask(parsed, context, taskId);
        
        case 'run':
          return await this.handleRunTasks(parsed, context, taskId);
        
        case 'status':
          return await this.handleStatusQuery(parsed, context, taskId);
        
        case 'standup':
          return await this.handleStandup(parsed, context, taskId);
        
        case 'meet':
          return await this.handleMeetAgent(parsed, context, taskId);
        
        case 'cancel':
          return await this.handleCancelTask(parsed, context, taskId);
        
        case 'stop':
          return await this.handleStopTask(parsed, context, taskId);
        
        case 'remove':
          return await this.handleRemoveTask(parsed, context, taskId);
        
        case 'clear':
          return await this.handleClearTasks(parsed, context, taskId);
        
        case 'queue':
          return await this.handleQueueList(parsed, context, taskId);
        
        default:
          return {
            success: false,
            message: 'Unknown command type. Try /start for available commands.',
          };
      }
    } catch (error) {
      logger.error(`[Orchestrator] Error processing command:`, error);
      this.setStatus('error', { taskId, error: error.message });
      return {
        success: false,
        message: `Error: ${error.message}`,
      };
    }
  }

  /**
   * Parse command to determine type and parameters
   */
  async parseCommand(command, context) {
    const lowerCmd = command.toLowerCase().trim();
    
    // Direct command patterns
    if (lowerCmd.startsWith('/plan ')) {
      return {
        type: 'plan',
        task: command.substring(6).trim(),
      };
    }
    
    if (lowerCmd.startsWith('/ask ')) {
      return {
        type: 'ask',
        question: command.substring(5).trim(),
      };
    }
    
    if (lowerCmd === '/approve') {
      return { type: 'approve' };
    }
    
    if (lowerCmd === '/run') {
      return { type: 'run' };
    }
    
    if (lowerCmd === '/status') {
      return { type: 'status' };
    }
    
    if (lowerCmd === '/standup') {
      return { type: 'standup' };
    }
    
    if (lowerCmd.startsWith('/meet ')) {
      return {
        type: 'meet',
        agentName: command.substring(6).trim(),
      };
    }
    
    if (lowerCmd.startsWith('/cancel ')) {
      return {
        type: 'cancel',
        taskId: command.substring(8).trim(),
      };
    }
    
    if (lowerCmd.startsWith('/stop ')) {
      return {
        type: 'stop',
        taskId: command.substring(6).trim(),
      };
    }
    
    if (lowerCmd.startsWith('/remove ')) {
      return {
        type: 'remove',
        taskId: command.substring(8).trim(),
      };
    }
    
    if (lowerCmd === '/clear') {
      return { type: 'clear' };
    }
    
    if (lowerCmd === '/queue') {
      return { type: 'queue' };
    }

    // Use Claude to understand natural language intent
    const prompt = `
Analyze this user message and determine the intent:
"${command}"

Available command types:
- plan: User wants to create an implementation plan for a task
- ask: User is asking a question about their code
- approve: User approves a plan to be implemented
- run: User wants to execute queued tasks
- status: User wants to see current status
- standup: User wants a daily standup report
- meet: User wants to talk to a specific agent
- cancel: User wants to cancel a task
- unknown: Cannot determine intent

Respond with JSON only:
{
  "type": "plan|ask|approve|run|status|standup|meet|cancel|unknown",
  "task": "the task description if plan",
  "question": "the question if ask",
  "agentName": "agent name if meet",
  "taskId": "task id if cancel"
}
`;

    const result = await this.callClaude(prompt, { temperature: 0.3 });
    
    if (result.success) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        logger.warn('[Orchestrator] Failed to parse command JSON:', e);
      }
    }

    return { type: 'unknown' };
  }

  /**
   * Handle plan task - delegate to Planner agent
   */
  async handlePlanTask(parsed, context, taskId) {
    const planner = this.agents.get('planner');
    if (!planner) {
      return { success: false, message: 'Planner agent not available' };
    }

    this.emit('taskStarted', { taskId, type: 'plan', task: parsed.task });
    
    // Set user's preferred AI provider if specified
    if (context.aiProvider) {
      planner.setAIProvider(context.aiProvider, context.aiModel);
    }

    const result = await planner.createPlan({
      task: parsed.task,
      project: context.project,
      context: context,
    });
    
    // Reset to default after task
    planner.resetAIProvider();

    if (result.success) {
      // Store the plan for potential approval
      const taskEntry = {
        id: taskId,
        type: 'implementation',
        plan: result.plan,
        status: 'pending_approval',
        createdAt: new Date(),
      };
      
      // Store userId if available for cross-referencing with persistent storage
      if (context.userId) {
        taskEntry.userId = context.userId.toString();
      }
      
      this.taskQueue.push(taskEntry);

      this.emit('taskCompleted', { taskId, type: 'plan', result });
    }

    return result;
  }

  /**
   * Handle ask task - answer questions about code
   */
  async handleAskTask(parsed, context, taskId) {
    // Get relevant context from GitLab if needed
    const gitlab = require('../tools/gitlab');
    
    let codeContext = '';
    try {
      if (context.project) {
        const repoFiles = await gitlab.getRepositoryFiles(context.project, 10);
        codeContext = `Repository files:\n${repoFiles.map(f => `- ${f.path}`).join('\n')}`;
      }
    } catch (e) {
      logger.warn('[Orchestrator] Could not fetch repo context:', e.message);
    }

    const prompt = `
User question: ${parsed.question}

${codeContext}

Provide a helpful answer. If the question is about specific code and you don't have the full context, suggest using /plan to analyze the codebase.
`;

    // Use user's preferred AI provider if available
    const provider = context.aiProvider || this.provider;
    const model = context.aiModel || this.model;
    
    logger.info(`[Orchestrator] /ask using provider: ${provider}${model ? ` (${model})` : ''}`);

    const result = await this.callAI(prompt, {
      provider: provider,
      model: model,
    });
    
    return {
      success: result.success,
      message: result.content,
      usage: result.usage,
    };
  }

  /**
   * Handle approve task - queue plan for implementation
   */
  async handleApproveTask(parsed, context, taskId) {
    // First check in-memory queue
    let pendingPlan = this.taskQueue.find(t => t.status === 'pending_approval');
    
    // If not found in memory, check persistent storage
    if (!pendingPlan && context.userId) {
      const userIdStr = context.userId.toString();
      const persistedPlan = this.chatStorage.getPendingPlan(userIdStr);
      
      if (persistedPlan) {
        logger.info(`[Orchestrator] Found persisted plan for user ${userIdStr}: ${persistedPlan.task}`);
        // Add to in-memory queue
        pendingPlan = {
          id: `plan-${Date.now()}`,
          type: 'implementation',
          plan: persistedPlan,
          status: 'pending_approval',
          createdAt: new Date(persistedPlan.createdAt || Date.now()),
          userId: userIdStr,
        };
        this.taskQueue.push(pendingPlan);
      }
    }
    
    if (!pendingPlan) {
      return {
        success: false,
        message: 'No pending plan to approve. Use /plan first to create a plan.\n\nIf you just created a plan, try using the approve button in the message.',
      };
    }

    pendingPlan.status = 'approved';
    pendingPlan.approvedAt = new Date();

    // Clean up the pending plan from persistent storage
    if (pendingPlan.userId) {
      this.chatStorage.deletePendingPlan(pendingPlan.userId);
      logger.info(`[Orchestrator] Deleted pending plan for user ${pendingPlan.userId} from storage`);
    }

    this.emit('planApproved', { taskId: pendingPlan.id, plan: pendingPlan.plan });

    return {
      success: true,
      message: `✅ Plan approved and queued for implementation.\n\nUse /run to start implementation now, or the agents will work on it overnight.`,
      taskId: pendingPlan.id,
    };
  }

  /**
   * Handle run task - execute all approved tasks
   */
  async handleRunTasks(parsed, context, taskId) {
    let approvedTasks = this.taskQueue.filter(t => t.status === 'approved');
    
    // If no approved tasks in memory, check for persisted pending plans and auto-approve
    if (approvedTasks.length === 0 && context.userId) {
      const userIdStr = context.userId.toString();
      const persistedPlan = this.chatStorage.getPendingPlan(userIdStr);
      
      if (persistedPlan) {
        logger.info(`[Orchestrator] Found persisted plan for user ${userIdStr}, auto-approving and running`);
        // Create and auto-approve the task
        const newTask = {
          id: `plan-${Date.now()}`,
          type: 'implementation',
          plan: persistedPlan,
          status: 'approved',
          createdAt: new Date(persistedPlan.createdAt || Date.now()),
          approvedAt: new Date(),
          userId: userIdStr,
        };
        this.taskQueue.push(newTask);
        approvedTasks = [newTask];
      }
    }
    
    if (approvedTasks.length === 0) {
      return {
        success: false,
        message: 'No approved tasks to run. Use /plan to create a plan, then /approve to queue it.',
      };
    }

    // Start implementation workflow
    this.executeImplementationWorkflow(approvedTasks[0]);

    return {
      success: true,
      message: `🚀 Starting implementation of ${approvedTasks.length} task(s). You'll receive updates as agents progress.`,
    };
  }

  /**
   * Execute the full implementation workflow
   */
  async executeImplementationWorkflow(task) {
    const reporter = this.agents.get('reporter');
    const backendDev = this.agents.get('backend-dev');
    const qaTester = this.agents.get('qa-tester');
    const codeReviewer = this.agents.get('code-reviewer');

    task.status = 'running';
    task.startedAt = new Date();

    this.emit('implementationStarted', { taskId: task.id });

    // Step 1: Backend Development
    if (reporter) {
      await reporter.sendProgress('⚙️ Backend Dev starting implementation...');
    }

    let implementationResult;
    if (backendDev) {
      implementationResult = await backendDev.implement(task.plan);
    }

    // Step 2: QA Testing
    if (reporter) {
      await reporter.sendProgress('🧪 QA Tester running tests...');
    }

    let testResult;
    if (qaTester) {
      testResult = await qaTester.runTests(task.plan);
    }

    // Step 3: Code Review
    if (reporter) {
      await reporter.sendProgress('🔍 Code Reviewer reviewing changes...');
    }

    let reviewResult;
    if (codeReviewer) {
      reviewResult = await codeReviewer.review(implementationResult);
    }

    // Step 4: Create MR if approved
    if (reviewResult?.approved) {
      if (reporter) {
        await reporter.sendProgress('✅ Creating Merge Request...');
      }
      
      const gitlab = require('../tools/gitlab');
      const mrResult = await gitlab.createMergeRequest({
        project: task.plan.project,
        title: task.plan.title,
        description: task.plan.description,
        branch: task.plan.branch,
      });

      task.status = 'completed';
      task.completedAt = new Date();
      task.mrUrl = mrResult.url;

      if (reporter) {
        await reporter.sendCompletionReport(task);
      }
    } else {
      task.status = 'needs_changes';
      if (reporter) {
        await reporter.sendProgress('❌ Code review requested changes. Manual intervention needed.');
      }
    }

    this.completedTasks.push(task);
    this.emit('implementationCompleted', { taskId: task.id, task });
  }

  /**
   * Handle status query
   */
  async handleStatusQuery(parsed, context, taskId) {
    const status = {
      queued: this.taskQueue.filter(t => t.status === 'approved').length,
      running: this.taskQueue.filter(t => t.status === 'running').length,
      completed: this.completedTasks.length,
      pendingApproval: this.taskQueue.filter(t => t.status === 'pending_approval').length,
    };

    return {
      success: true,
      message: `📊 Task Queue Status:
⏳ Queued: ${status.queued}
🔄 Running: ${status.running}
✅ Completed: ${status.completed}
📝 Pending Approval: ${status.pendingApproval}`,
      status,
    };
  }

  /**
   * Handle standup request
   */
  async handleStandup(parsed, context, taskId) {
    const reports = [];
    
    for (const [name, agent] of this.agents) {
      reports.push({
        agent: name,
        status: agent.status,
        info: agent.getInfo(),
      });
    }

    return {
      success: true,
      message: '🌅 Daily Standup:\n\n' + reports.map(r => 
        `${this.getAgentEmoji(r.agent)} ${r.agent}: ${r.status}`
      ).join('\n'),
      reports,
    };
  }

  /**
   * Handle meet agent request
   */
  async handleMeetAgent(parsed, context, taskId) {
    const agent = this.agents.get(parsed.agentName);
    
    if (!agent) {
      const availableAgents = Array.from(this.agents.keys()).join(', ');
      return {
        success: false,
        message: `Agent "${parsed.agentName}" not found. Available agents: ${availableAgents}`,
      };
    }

    return {
      success: true,
      message: `👋 You are now chatting with ${agent.name} (${agent.role}).\n\nWhat would you like to discuss?`,
      agentInfo: agent.getInfo(),
    };
  }

  /**
   * Handle queue list - show all tasks with their IDs
   */
  async handleQueueList(parsed, context, taskId) {
    if (this.taskQueue.length === 0 && this.completedTasks.length === 0) {
      return {
        success: true,
        message: '**Task Queue is empty**\n\nNo tasks pending or completed. Use /plan to create a new task.',
      };
    }

    let message = '**Task Queue**\n\n';

    // Pending Approval tasks
    const pendingApproval = this.taskQueue.filter(t => t.status === 'pending_approval');
    if (pendingApproval.length > 0) {
      message += '**📝 Pending Approval:**\n';
      pendingApproval.forEach(t => {
        const shortId = t.id.substring(0, 8);
        message += `• \`${shortId}\` - ${t.plan?.title || t.task || 'Unknown task'}\n`;
      });
      message += '\n';
    }

    // Approved/Queued tasks
    const queued = this.taskQueue.filter(t => t.status === 'approved');
    if (queued.length > 0) {
      message += '**⏳ Queued (Approved):**\n';
      queued.forEach(t => {
        const shortId = t.id.substring(0, 8);
        message += `• \`${shortId}\` - ${t.plan?.title || t.task || 'Unknown task'}\n`;
      });
      message += '\n';
    }

    // Running tasks
    const running = this.taskQueue.filter(t => t.status === 'running');
    if (running.length > 0) {
      message += '**🔄 Running:**\n';
      running.forEach(t => {
        const shortId = t.id.substring(0, 8);
        message += `• \`${shortId}\` - ${t.plan?.title || t.task || 'Unknown task'}\n`;
      });
      message += '\n';
    }

    // Completed tasks
    if (this.completedTasks.length > 0) {
      message += `**✅ Completed (${this.completedTasks.length}):**\n`;
      this.completedTasks.slice(-5).forEach(t => {
        const shortId = t.id.substring(0, 8);
        const status = t.status === 'completed' ? '✓' : '✗';
        message += `${status} \`${shortId}\` - ${t.plan?.title || t.task || 'Unknown task'}\n`;
      });
      message += '\n';
    }

    message += '**Commands:**\n';
    message += '`/cancel <id>` - Cancel queued/approved task\n';
    message += '`/stop <id>` - Stop running task\n';
    message += '`/remove <id>` - Remove pending plan\n';
    message += '`/clear` - Clear completed tasks';

    return {
      success: true,
      message,
      queue: {
        pendingApproval: pendingApproval.length,
        queued: queued.length,
        running: running.length,
        completed: this.completedTasks.length,
      },
    };
  }

  /**
   * Handle cancel task - cancel queued or approved tasks
   */
  async handleCancelTask(parsed, context, taskId) {
    const taskIndex = this.taskQueue.findIndex(t => t.id.startsWith(parsed.taskId) || t.id === parsed.taskId);
    
    if (taskIndex === -1) {
      return {
        success: false,
        message: `Task \`${parsed.taskId}\` not found. Use /queue to see all tasks with IDs.`,
      };
    }

    const task = this.taskQueue[taskIndex];
    
    if (task.status === 'running') {
      return {
        success: false,
        message: `Task \`${parsed.taskId}\` is currently running. Use /stop to stop it.`,
      };
    }

    // Move to completed with cancelled status
    task.status = 'cancelled';
    this.completedTasks.push(task);
    this.taskQueue.splice(taskIndex, 1);

    return {
      success: true,
      message: `✅ Task \`${parsed.taskId}\` has been cancelled.`,
    };
  }

  /**
   * Handle stop task - stop a running task
   */
  async handleStopTask(parsed, context, taskId) {
    const taskIndex = this.taskQueue.findIndex(t => t.id.startsWith(parsed.taskId) || t.id === parsed.taskId);
    
    if (taskIndex === -1) {
      return {
        success: false,
        message: `Task \`${parsed.taskId}\` not found. Use /queue to see all tasks with IDs.`,
      };
    }

    const task = this.taskQueue[taskIndex];
    
    if (task.status !== 'running') {
      return {
        success: false,
        message: `Task \`${parsed.taskId}\` is not running (status: ${task.status}). Use /cancel to remove it.`,
      };
    }

    // Signal the task to stop (best effort)
    task.status = 'stopped';
    task.stoppedAt = new Date().toISOString();
    
    // Move to completed
    this.completedTasks.push(task);
    this.taskQueue.splice(taskIndex, 1);

    // Emit stop event so agents can clean up
    this.emit('taskStopped', { taskId: task.id, task });

    return {
      success: true,
      message: `🛑 Task \`${parsed.taskId}\` has been stopped.`,
    };
  }

  /**
   * Handle remove task - remove a pending approval task
   */
  async handleRemoveTask(parsed, context, taskId) {
    const taskIndex = this.taskQueue.findIndex(t => t.id.startsWith(parsed.taskId) || t.id === parsed.taskId);
    
    if (taskIndex === -1) {
      return {
        success: false,
        message: `Task \`${parsed.taskId}\` not found. Use /queue to see all tasks with IDs.`,
      };
    }

    const task = this.taskQueue[taskIndex];
    
    if (task.status !== 'pending_approval') {
      return {
        success: false,
        message: `Task \`${parsed.taskId}\` is ${task.status}. Use /cancel or /stop instead.`,
      };
    }

    this.taskQueue.splice(taskIndex, 1);

    return {
      success: true,
      message: `🗑️ Pending plan \`${parsed.taskId}\` has been removed.`,
    };
  }

  /**
   * Handle clear tasks - clear completed and cancelled tasks
   */
  async handleClearTasks(parsed, context, taskId) {
    const beforeCount = this.completedTasks.length;
    
    // Keep only the last 10 completed tasks
    this.completedTasks = this.completedTasks.slice(-10);
    
    const clearedCount = beforeCount - this.completedTasks.length;

    return {
      success: true,
      message: `🧹 Cleared ${clearedCount} completed/cancelled tasks. Keeping last 10 for reference.`,
      cleared: clearedCount,
    };
  }

  getAgentEmoji(agentName) {
    const emojis = {
      'orchestrator': '🧠',
      'planner': '📋',
      'backend-dev': '⚙️',
      'frontend-dev': '🎨',
      'qa-tester': '🧪',
      'code-reviewer': '🔍',
      'reporter': '📊',
    };
    return emojis[agentName] || '🤖';
  }

  /**
   * Get full system status
   */
  getSystemStatus() {
    return {
      orchestrator: this.getInfo(),
      agents: Array.from(this.agents.values()).map(a => a.getInfo()),
      queue: {
        total: this.taskQueue.length,
        approved: this.taskQueue.filter(t => t.status === 'approved').length,
        running: this.taskQueue.filter(t => t.status === 'running').length,
        completed: this.completedTasks.length,
      },
    };
  }

  /**
   * Execute task - required by BaseAgent
   */
  async execute(task) {
    return this.processCommand(task.command, task.context);
  }
}

module.exports = OrchestratorAgent;
