/**
 * 🦉 Nigents - Base Agent Class
 * All agents extend this base class for common functionality
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');
const aiClient = require('../utils/ai-client');
const { AgentMCPWrapper } = require('../mcp');

class BaseAgent extends EventEmitter {
  constructor(config) {
    super();
    this.name = config.name;
    this.role = config.role;
    this.configProvider = config.provider || process.env.DEFAULT_AI_PROVIDER || 'anthropic';
    this.configModel = config.model || null;
    this.provider = this.configProvider;
    this.model = this.configModel;
    this.systemMessage = config.systemMessage || '';
    this.tools = config.tools || [];
    this.maxTokens = config.maxTokens || 4096;
    this.useMCP = config.useMCP !== false; // Default to using MCP
    
    this.conversationHistory = [];
    this.status = 'idle'; // idle, working, done, error
    this.currentTask = null;
    
    // Initialize MCP wrapper if enabled
    if (this.useMCP) {
      this.mcpWrapper = new AgentMCPWrapper(this, this.name);
    }
    
    logger.info(`[${this.name}] Agent initialized with provider: ${this.provider}`);
  }
  
  /**
   * Set AI provider and model for this task
   */
  setAIProvider(provider, model = null) {
    if (provider) {
      this.provider = provider;
      logger.info(`[${this.name}] AI provider set to: ${provider}`);
    }
    if (model) {
      this.model = model;
      logger.info(`[${this.name}] AI model set to: ${model}`);
    }
  }
  
  /**
   * Reset to default provider/model from config
   */
  resetAIProvider() {
    this.provider = this.configProvider;
    this.model = this.configModel;
    logger.info(`[${this.name}] AI provider reset to default: ${this.provider}`);
  }

  /**
   * Update agent status and emit event
   */
  setStatus(status, details = {}) {
    this.status = status;
    this.emit('statusChange', { agent: this.name, status, details, timestamp: new Date() });
    logger.info(`[${this.name}] Status: ${status}`, details);
  }

  /**
   * Call AI API with the agent's system message
   * Uses custom model (from dashboard). OpenAI used for voice only.
   */
  async callAI(prompt, options = {}) {
    const provider = options.provider || this.provider;
    const startTime = Date.now();
    
    try {
      this.setStatus('working', { task: 'calling_ai', provider });
      
      logger.info(`[${this.name}] Calling ${provider}:`, {
        promptLength: prompt.length,
        model: options.model || this.model || 'default',
      });

      const userConfig = options.userConfig || (this._requestContext && this._requestContext.userConfig);
      const response = await aiClient.call(prompt, {
        provider,
        model: options.model || this.model,
        systemMessage: this.systemMessage,
        maxTokens: options.maxTokens || this.maxTokens,
        temperature: options.temperature || 0.7,
        ...(userConfig ? { userConfig } : {}),
      });

      const duration = Date.now() - startTime;
      
      // Update conversation history
      this.conversationHistory.push(
        { role: 'user', content: prompt },
        { role: 'assistant', content: response.content }
      );

      // Trim history if too long
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      this.setStatus('done', { 
        task: 'calling_ai', 
        provider,
        duration,
        tokens: response.usage?.total_tokens,
      });
      
      return {
        success: true,
        content: response.content,
        provider: response.provider,
        model: response.model,
        usage: response.usage,
        duration: response.duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.setStatus('error', { task: 'calling_ai', provider, error: error.message, duration });
      logger.error(`[${this.name}] AI API error [${provider}]:`, error);
      return {
        success: false,
        error: error.message,
        provider,
      };
    }
  }

  /**
   * Legacy method - redirects to callAI
   * @deprecated Use callAI instead
   */
  async callClaude(prompt, options = {}) {
    logger.warn(`[${this.name}] callClaude() is deprecated, use callAI()`);
    return this.callAI(prompt, { ...options, provider: 'anthropic' });
  }

  /**
   * Execute with MCP tools
   */
  async executeWithMCP(task, context = {}) {
    if (!this.useMCP || !this.mcpWrapper) {
      logger.warn(`[${this.name}] MCP not enabled, falling back to regular execution`);
      return this.execute(task);
    }

    try {
      this.setStatus('working', { task: 'mcp_execution', mcp: true });
      
      const result = await this.mcpWrapper.executeWithTools(task, context);
      
      this.setStatus('done', { task: 'mcp_execution' });
      
      return {
        success: result.success,
        content: result.content,
        toolCalls: result.toolCalls,
        iterations: result.iterations,
      };
    } catch (error) {
      this.setStatus('error', { task: 'mcp_execution', error: error.message });
      logger.error(`[${this.name}] MCP execution error:`, error);
      
      // Fall back to regular execution
      return this.execute(task);
    }
  }

  /**
   * Execute a task - to be overridden by subclasses
   */
  async execute(task) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Get agent info
   */
  getInfo() {
    return {
      name: this.name,
      role: this.role,
      provider: this.provider,
      model: this.model,
      status: this.status,
      currentTask: this.currentTask,
      tools: this.tools.map(t => t.name),
      mcpEnabled: this.useMCP,
    };
  }

  /**
   * Reset agent state
   */
  reset() {
    this.conversationHistory = [];
    this.status = 'idle';
    this.currentTask = null;
    this.emit('reset', { agent: this.name, timestamp: new Date() });
  }

  // ============================================================================
  // MCP Helper Methods
  // ============================================================================

  /**
   * Read file via MCP
   */
  async readFile(path) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.readFile(path);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Write file via MCP
   */
  async writeFile(path, content) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.writeFile(path, content);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Search files via MCP
   */
  async searchFiles(path, pattern) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.searchFiles(path, pattern);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Git status via MCP
   */
  async gitStatus(repoPath) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.gitStatus(repoPath);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Git commit via MCP
   */
  async gitCommit(repoPath, message) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.gitCommit(repoPath, message);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Query database via MCP
   */
  async queryDatabase(query) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.queryDatabase(query);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Fetch web content via MCP
   */
  async fetchWeb(url) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.fetchWeb(url);
    }
    throw new Error('MCP not enabled');
  }

  /**
   * Web search via MCP (Brave)
   */
  async webSearch(query) {
    if (this.mcpWrapper) {
      return this.mcpWrapper.webSearch(query);
    }
    throw new Error('MCP not enabled');
  }
}

module.exports = BaseAgent;
