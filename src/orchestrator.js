/**
 * 🦉 NightOwl - Orchestrator Agent
 * Team Lead & Router - Coordinates all other agents using AutoGen
 */

const BaseAgent = require('./agents/base-agent');
const logger = require('./utils/logger');
const { v4: uuidv4 } = require('uuid');
const { NightOwlGroupChat } = require('./autogen');

class OrchestratorAgent extends BaseAgent {
  constructor() {
    const config = require('../config/agents.json').orchestrator;
    super(config);
    
    this.agents = new Map();
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.completedTasks = [];
    
    // Initialize AutoGen group chat
    this.groupChat = new NightOwlGroupChat();
    this.setupGroupChatListeners();
  }

  /**
   * Set up listeners for AutoGen group chat events
   */
  setupGroupChatListeners() {
    this.groupChat.on('agentCommunication', (data) => {
      this.emit('agentCommunication', data);
    });

    this.groupChat.on('taskDelegated', (data) => {
      this.emit('taskDelegated', data);
      logger.info(`[Orchestrator] Task delegated: ${data.from} -> ${data.to}`);
    });

    this.groupChat.on('issueReported', (data) => {
      this.emit('issueReported', data);
      logger.warn(`[Orchestrator] Issue reported: ${data.from} -> ${data.to} (${data.severity})`);
      
      // Auto-handle critical issues
      if (data.severity === 'critical') {
        this.handleCriticalIssue(data);
      }
    });

    this.groupChat.on('helpRequested', (data) => {
      this.emit('helpRequested', data);
      logger.info(`[Orchestrator] Help requested: ${data.from} -> ${data.to}`);
    });

    this.groupChat.on('taskCompleted', (data) => {
      this.emit('taskCompleted', data);
      this.handleTaskCompletion(data);
    });
  }

  /**
   * Initialize the orchestrator and AutoGen
   */
  async initialize() {
    await this.groupChat.initialize();
    logger.info('[Orchestrator] AutoGen group chat initialized');
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

    agent.on('codeEdit', (data) => {
      this.emit('codeEdit', { agent: agent.name, ...data });
    });

    agent.on('progress', (data) => {
      this.emit('agentProgress', { agent: agent.name, ...data });
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
   * Handle plan task - delegate to Planner agent via AutoGen
   */
  async handlePlanTask(parsed, context, taskId) {
    this.emit('taskStarted', { taskId, type: 'plan', task: parsed.task });

    // Use AutoGen to coordinate with Planner
    const result = await this.groupChat.startTask(
      `Create implementation plan for: ${parsed.task}`,
      {
        project: context.project,
        type: 'planning',
        ...context,
      }
    );

    // Store the plan
    this.taskQueue.push({
      id: taskId,
      type: 'implementation',
      plan: result,
      status: 'pending_approval',
      createdAt: new Date(),
    });

    this.emit('taskCompleted', { taskId, type: 'plan', result });

    return {
      success: true,
      plan: result,
      message: this.formatPlanForTelegram(result),
    };
  }

  /**
   * Handle run task - execute with AutoGen coordination
   */
  async handleRunTasks(parsed, context, taskId) {
    const approvedTasks = this.taskQueue.filter(t => t.status === 'approved');
    
    if (approvedTasks.length === 0) {
      return {
        success: false,
        message: 'No approved tasks to run. Use /plan to create a plan, then /approve to queue it.',
      };
    }

    const task = approvedTasks[0];
    task.status = 'running';
    task.startedAt = new Date();

    // Start implementation with full AutoGen coordination
    this.executeWithAutoGen(task);

    return {
      success: true,
      message: `Starting implementation with AutoGen coordination. ${approvedTasks.length} task(s) in queue.`,
    };
  }

  /**
   * Execute task with AutoGen group chat coordination
   */
  async executeWithAutoGen(task) {
    this.emit('implementationStarted', { taskId: task.id });

    try {
      // Start the multi-agent workflow
      const result = await this.groupChat.startTask(
        task.plan.title || task.plan,
        {
          project: task.project,
          branch: task.plan.branch,
          plan: task.plan,
        }
      );

      // Update task status
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;

      this.completedTasks.push(task);
      this.emit('implementationCompleted', { taskId: task.id, task });

      // Create MR if successful
      if (result.success !== false) {
        await this.createMergeRequest(task);
      }

    } catch (error) {
      logger.error('[Orchestrator] AutoGen execution failed:', error);
      task.status = 'failed';
      task.error = error.message;
      
      // Try to recover or escalate
      await this.handleExecutionFailure(task, error);
    }
  }

  /**
   * Handle critical issue reported by agent
   */
  async handleCriticalIssue(data) {
    logger.error('[Orchestrator] Handling critical issue:', data);
    
    // Notify reporter to alert user
    const reporter = this.agents.get('reporter');
    if (reporter) {
      await reporter.sendMessage(
        `⚠️ CRITICAL ISSUE\n\n${data.from} reported to ${data.to}:\n${data.issue.description}\n\nAttempting auto-recovery...`
      );
    }

    // Attempt recovery based on issue type
    if (data.issue.type === 'test_failure') {
      // Re-run with backend dev fixing
      await this.groupChat.delegateTask(
        'orchestrator',
        'backend-dev',
        'Fix failing tests',
        { issue: data.issue }
      );
    } else if (data.issue.type === 'security') {
      // Escalate to reviewer
      await this.groupChat.reportIssue(
        'orchestrator',
        'code-reviewer',
        data.issue,
        'critical'
      );
    }
  }

  /**
   * Handle task completion
   */
  async handleTaskCompletion(data) {
    logger.info(`[Orchestrator] Task completed by ${data.agent}:`, data.task);

    // Determine next steps
    if (data.agent === 'backend-dev' || data.agent === 'frontend-dev') {
      // Route to QA
      await this.groupChat.delegateTask(
        'orchestrator',
        'qa-tester',
        `Test changes from ${data.agent}`,
        { previousTask: data.task }
      );
    } else if (data.agent === 'qa-tester' && data.result.success) {
      // Route to reviewer
      await this.groupChat.delegateTask(
        'orchestrator',
        'code-reviewer',
        'Review code changes',
        { testResults: data.result }
      );
    } else if (data.agent === 'code-reviewer' && data.result.approved) {
      // Create MR
      await this.createMergeRequest(data.result.task);
    }
  }

  /**
   * Handle execution failure
   */
  async handleExecutionFailure(task, error) {
    // Try to recover
    const reporter = this.agents.get('reporter');
    
    if (reporter) {
      await reporter.sendMessage(
        `❌ Task failed: ${task.plan.title}\nError: ${error.message}\n\nAttempting recovery...`
      );
    }

    // Retry with different approach
    await this.groupChat.requestHelp(
      'orchestrator',
      'planner',
      `Task failed with error: ${error.message}. Please review and suggest alternative approach.`
    );
  }

  /**
   * Create merge request via GitLab
   */
  async createMergeRequest(task) {
    const gitlab = require('./tools/gitlab');
    const reporter = this.agents.get('reporter');

    try {
      const mrResult = await gitlab.createMergeRequest({
        project: task.project,
        title: task.plan.title,
        description: task.plan.description,
        branch: task.plan.branch,
      });

      task.mrUrl = mrResult.url;

      if (reporter) {
        await reporter.sendCompletionReport(task);
      }

      return mrResult;
    } catch (error) {
      logger.error('[Orchestrator] Failed to create MR:', error);
      if (reporter) {
        await reporter.sendMessage(`❌ Failed to create MR: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Format plan for Telegram display
   */
  formatPlanForTelegram(plan) {
    const complexityEmoji = {
      'S': '[S]',
      'M': '[M]',
      'L': '[L]',
    };

    let message = `IMPLEMENTATION PLAN\n\n`;
    message += `${plan.title || 'New Task'}\n`;
    message += `${plan.description || ''}\n\n`;
    message += `Complexity: ${complexityEmoji[plan.complexity] || '[?]'} ${plan.complexity}\n`;
    message += `Estimated: ${plan.estimatedHours} hours\n\n`;
    
    if (plan.steps) {
      message += `Steps:\n`;
      plan.steps.forEach(step => {
        message += `${step.order}. ${step.description}\n`;
      });
    }

    message += `\nReply with /approve to queue this for implementation.`;

    return message;
  }

  // Other handlers remain similar but integrated with AutoGen...
  async handleAskTask(parsed, context, taskId) {
    // Use group chat for complex questions
    return this.groupChat.startTask(
      `Answer question: ${parsed.question}`,
      context
    );
  }

  async handleApproveTask(parsed, context, taskId) {
    const pendingPlan = this.taskQueue.find(t => t.status === 'pending_approval');
    
    if (!pendingPlan) {
      return {
        success: false,
        message: 'No pending plan to approve. Use /plan first.',
      };
    }

    pendingPlan.status = 'approved';
    pendingPlan.approvedAt = new Date();

    this.emit('planApproved', { taskId: pendingPlan.id, plan: pendingPlan.plan });

    return {
      success: true,
      message: `Plan approved and queued. Use /run to start immediately, or agents will work overnight.`,
    };
  }

  async handleStatusQuery(parsed, context, taskId) {
    const status = {
      queued: this.taskQueue.filter(t => t.status === 'approved').length,
      running: this.taskQueue.filter(t => t.status === 'running').length,
      completed: this.completedTasks.length,
      pendingApproval: this.taskQueue.filter(t => t.status === 'pending_approval').length,
    };

    return {
      success: true,
      message: `Task Queue Status:\nQueued: ${status.queued}\nRunning: ${status.running}\nCompleted: ${status.completed}\nPending: ${status.pendingApproval}`,
      status,
    };
  }

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
      message: `Daily Standup:\n\n` + reports.map(r => 
        `[${r.status.toUpperCase()}] ${r.agent}`
      ).join('\n'),
      reports,
    };
  }

  async handleMeetAgent(parsed, context, taskId) {
    const agent = this.agents.get(parsed.agentName);
    
    if (!agent) {
      const availableAgents = Array.from(this.agents.keys()).join(', ');
      return {
        success: false,
        message: `Agent "${parsed.agentName}" not found. Available: ${availableAgents}`,
      };
    }

    return {
      success: true,
      message: `Connected to ${agent.name}. What would you like to discuss?`,
      agentInfo: agent.getInfo(),
    };
  }

  async handleCancelTask(parsed, context, taskId) {
    const taskIndex = this.taskQueue.findIndex(t => t.id === parsed.taskId);
    
    if (taskIndex === -1) {
      return {
        success: false,
        message: `Task ${parsed.taskId} not found.`,
      };
    }

    const task = this.taskQueue[taskIndex];
    
    if (task.status === 'running') {
      return {
        success: false,
        message: `Task ${parsed.taskId} is currently running and cannot be cancelled.`,
      };
    }

    this.taskQueue.splice(taskIndex, 1);

    return {
      success: true,
      message: `Task ${parsed.taskId} has been cancelled.`,
    };
  }

  async parseCommand(command, context) {
    const lowerCmd = command.toLowerCase().trim();
    
    if (lowerCmd.startsWith('/plan ')) {
      return { type: 'plan', task: command.substring(6).trim() };
    }
    if (lowerCmd.startsWith('/ask ')) {
      return { type: 'ask', question: command.substring(5).trim() };
    }
    if (lowerCmd === '/approve') return { type: 'approve' };
    if (lowerCmd === '/run') return { type: 'run' };
    if (lowerCmd === '/status') return { type: 'status' };
    if (lowerCmd === '/standup') return { type: 'standup' };
    if (lowerCmd.startsWith('/meet ')) {
      return { type: 'meet', agentName: command.substring(6).trim() };
    }
    if (lowerCmd.startsWith('/cancel ')) {
      return { type: 'cancel', taskId: command.substring(8).trim() };
    }

    // Use Claude for natural language
    const result = await this.callClaude(`
Analyze this message and return JSON with "type" field:
"${command}"
Types: plan, ask, approve, run, status, standup, meet, cancel, unknown
`, { temperature: 0.3 });

    if (result.success) {
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
      } catch (e) {}
    }

    return { type: 'unknown' };
  }

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
      autogen: this.groupChat.isInitialized,
    };
  }
}

module.exports = OrchestratorAgent;
