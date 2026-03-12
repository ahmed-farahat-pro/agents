/**
 * 🦉 NightOwl - AutoGen Group Chat System
 * Multi-agent communication using AutoGen framework
 */

const { ConversableAgent, GroupChat, GroupChatManager } = require('autogen');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class NightOwlGroupChat extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.groupChat = null;
    this.manager = null;
    this.isInitialized = false;
    this.messageHistory = [];
    this.taskQueue = [];
  }

  /**
   * Initialize AutoGen agents and group chat
   */
  async initialize() {
    logger.info('[AutoGen] Initializing group chat system...');

    // Create AutoGen agents for each NightOwl agent
    await this.createAgents();

    // Create group chat
    this.groupChat = new GroupChat(
      Array.from(this.agents.values()),
      {
        messages: [],
        maxRound: 50,
        speakerSelectionMethod: 'auto',
        allowRepeatSpeaker: false,
      }
    );

    // Create manager
    this.manager = new GroupChatManager({
      groupchat: this.groupChat,
      llmConfig: {
        configList: [{ model: 'claude-3-sonnet-20240229', apiKey: process.env.ANTHROPIC_API_KEY }],
        temperature: 0.7,
      },
    });

    // Set up message hooks
    this.setupMessageHooks();

    this.isInitialized = true;
    logger.info('[AutoGen] Group chat initialized with ' + this.agents.size + ' agents');
  }

  /**
   * Create AutoGen agents for each NightOwl agent
   */
  async createAgents() {
    const agentConfigs = require('../../config/agents.json');

    // Orchestrator - the leader
    this.agents.set('orchestrator', new ConversableAgent({
      name: 'orchestrator',
      systemMessage: `${agentConfigs.orchestrator.systemMessage}

You are the team lead. You can delegate tasks to other agents.
When you need help, mention the agent by name: @planner, @backend-dev, @frontend-dev, @qa-tester, @code-reviewer, @reporter

Always coordinate the team efficiently.`,
      llmConfig: {
        configList: [{ model: 'claude-3-sonnet-20240229', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));

    // Planner
    this.agents.set('planner', new ConversableAgent({
      name: 'planner',
      systemMessage: `${agentConfigs.planner.systemMessage}

You work with @backend-dev and @frontend-dev to create actionable plans.
When your plan is ready, notify @orchestrator for approval.`,
      llmConfig: {
        configList: [{ model: 'claude-3-sonnet-20240229', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));

    // Backend Dev
    this.agents.set('backend-dev', new ConversableAgent({
      name: 'backend-dev',
      systemMessage: `${agentConfigs['backend-dev'].systemMessage}

You implement code based on @planner's plans.
When done, notify @qa-tester to test your code and @code-reviewer to review.
If you need clarification, ask @planner.`,
      llmConfig: {
        configList: [{ model: 'claude-3-sonnet-20240229', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));

    // Frontend Dev
    this.agents.set('frontend-dev', new ConversableAgent({
      name: 'frontend-dev',
      systemMessage: `${agentConfigs['frontend-dev'].systemMessage}

You implement UI based on @planner's plans and integrate with @backend-dev's APIs.
When done, notify @qa-tester and @code-reviewer.`,
      llmConfig: {
        configList: [{ model: 'claude-3-haiku-20240307', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));

    // QA Tester
    this.agents.set('qa-tester', new ConversableAgent({
      name: 'qa-tester',
      systemMessage: `${agentConfigs['qa-tester'].systemMessage}

You test code from @backend-dev and @frontend-dev.
If tests pass, notify @code-reviewer.
If tests fail, notify the developer with specific issues.`,
      llmConfig: {
        configList: [{ model: 'claude-3-haiku-20240307', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));

    // Code Reviewer
    this.agents.set('code-reviewer', new ConversableAgent({
      name: 'code-reviewer',
      systemMessage: `${agentConfigs['code-reviewer'].systemMessage}

You review code from @backend-dev and @frontend-dev after @qa-tester passes.
If approved, notify @orchestrator to create MR.
If changes needed, notify the developer with specific feedback.`,
      llmConfig: {
        configList: [{ model: 'claude-3-sonnet-20240229', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));

    // Reporter
    this.agents.set('reporter', new ConversableAgent({
      name: 'reporter',
      systemMessage: `${agentConfigs.reporter.systemMessage}

You report progress to users via Telegram.
Monitor all agents and send status updates.`,
      llmConfig: {
        configList: [{ model: 'claude-3-haiku-20240307', apiKey: process.env.ANTHROPIC_API_KEY }],
      },
    }));
  }

  /**
   * Set up message hooks for monitoring
   */
  setupMessageHooks() {
    for (const [name, agent] of this.agents) {
      // Hook into agent's receive method
      const originalReceive = agent.receive.bind(agent);
      agent.receive = async (message, sender, requestReply, silent) => {
        // Log the message
        this.logMessage({
          from: sender ? sender.name : 'user',
          to: name,
          content: typeof message === 'string' ? message : message.content,
          timestamp: new Date(),
        });

        // Emit for dashboard
        this.emit('agentCommunication', {
          from: sender ? sender.name : 'user',
          to: name,
          message: typeof message === 'string' ? message : message.content,
          timestamp: new Date(),
        });

        return originalReceive(message, sender, requestReply, silent);
      };
    }
  }

  /**
   * Start a task with multi-agent collaboration
   */
  async startTask(task, context = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    logger.info('[AutoGen] Starting task:', task);

    const initialMessage = {
      role: 'user',
      content: `
New task from user: ${task}

Context:
- Project: ${context.project || 'Not specified'}
- Branch: ${context.branch || 'main'}
- Priority: ${context.priority || 'normal'}

Team, please coordinate to complete this task.
@orchestrator please delegate appropriately.
      `.trim(),
    };

    // Start the group chat
    const result = await this.manager.initiateChat(
      this.agents.get('orchestrator'),
      initialMessage
    );

    return result;
  }

  /**
   * Delegate task to specific agent
   */
  async delegateTask(fromAgent, toAgent, task, details = {}) {
    const sender = this.agents.get(fromAgent);
    const receiver = this.agents.get(toAgent);

    if (!sender || !receiver) {
      throw new Error(`Agent not found: ${fromAgent} or ${toAgent}`);
    }

    const message = `
@${toAgent} ${fromAgent} has delegated a task to you:

Task: ${task}
${details.plan ? `\nPlan: ${details.plan}` : ''}
${details.context ? `\nContext: ${JSON.stringify(details.context)}` : ''}

Please acknowledge and start working on this.
    `.trim();

    await sender.send(message, receiver);

    this.emit('taskDelegated', {
      from: fromAgent,
      to: toAgent,
      task,
      details,
      timestamp: new Date(),
    });
  }

  /**
   * Report issue to another agent
   */
  async reportIssue(fromAgent, toAgent, issue, severity = 'warning') {
    const sender = this.agents.get(fromAgent);
    const receiver = this.agents.get(toAgent);

    const message = `
@${toAgent} Issue reported by ${fromAgent}:

Severity: ${severity.toUpperCase()}
Issue: ${issue.description}
${issue.details ? `\nDetails: ${issue.details}` : ''}
${issue.suggestion ? `\nSuggestion: ${issue.suggestion}` : ''}

Please address this issue.
    `.trim();

    await sender.send(message, receiver);

    this.emit('issueReported', {
      from: fromAgent,
      to: toAgent,
      issue,
      severity,
      timestamp: new Date(),
    });
  }

  /**
   * Request help from another agent
   */
  async requestHelp(fromAgent, toAgent, helpRequest) {
    const sender = this.agents.get(fromAgent);
    const receiver = this.agents.get(toAgent);

    const message = `
@${toAgent} Help needed from ${fromAgent}:

${helpRequest}

Can you assist with this?
    `.trim();

    await sender.send(message, receiver);

    this.emit('helpRequested', {
      from: fromAgent,
      to: toAgent,
      request: helpRequest,
      timestamp: new Date(),
    });
  }

  /**
   * Report completion to orchestrator
   */
  async reportCompletion(agent, task, result) {
    const sender = this.agents.get(agent);
    const orchestrator = this.agents.get('orchestrator');

    const message = `
@orchestrator Task completed by ${agent}:

Task: ${task}
Status: ${result.success ? 'SUCCESS' : 'FAILED'}
${result.summary ? `\nSummary: ${result.summary}` : ''}
${result.nextSteps ? `\nNext Steps: ${result.nextSteps}` : ''}

Please review and determine next actions.
    `.trim();

    await sender.send(message, orchestrator);

    this.emit('taskCompleted', {
      agent,
      task,
      result,
      timestamp: new Date(),
    });
  }

  /**
   * Log message to history
   */
  logMessage(message) {
    this.messageHistory.push(message);
    
    // Keep last 1000 messages
    if (this.messageHistory.length > 1000) {
      this.messageHistory = this.messageHistory.slice(-1000);
    }

    logger.info(`[AutoGen] ${message.from} -> ${message.to}: ${message.content.substring(0, 100)}...`);
  }

  /**
   * Get conversation history between agents
   */
  getConversation(agent1, agent2, limit = 50) {
    return this.messageHistory
      .filter(m => 
        (m.from === agent1 && m.to === agent2) ||
        (m.from === agent2 && m.to === agent1)
      )
      .slice(-limit);
  }

  /**
   * Get agent status in group chat
   */
  getAgentStatus(agentName) {
    const agent = this.agents.get(agentName);
    if (!agent) return null;

    return {
      name: agentName,
      lastMessage: agent.lastMessage,
      messageCount: this.messageHistory.filter(m => 
        m.from === agentName || m.to === agentName
      ).length,
    };
  }

  /**
   * Shutdown group chat
   */
  async shutdown() {
    logger.info('[AutoGen] Shutting down group chat...');
    
    this.agents.clear();
    this.groupChat = null;
    this.manager = null;
    this.isInitialized = false;
    
    logger.info('[AutoGen] Group chat shut down');
  }
}

module.exports = NightOwlGroupChat;
