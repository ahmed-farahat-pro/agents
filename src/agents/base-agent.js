/**
 * 🦉 Nigents - Base Agent Class
 * All agents extend this base class for common functionality
 */

const { Anthropic } = require('@anthropic-ai/sdk');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const { AgentMCPWrapper } = require('../mcp');

class BaseAgent extends EventEmitter {
  constructor(config) {
    super();
    this.name = config.name;
    this.role = config.role;
    this.model = config.model || 'claude-3-sonnet-20240229';
    this.systemMessage = config.systemMessage || '';
    this.tools = config.tools || [];
    this.maxTokens = config.maxTokens || 4096;
    this.useMCP = config.useMCP !== false; // Default to using MCP
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    this.conversationHistory = [];
    this.status = 'idle'; // idle, working, done, error
    this.currentTask = null;
    
    // Initialize MCP wrapper if enabled
    if (this.useMCP) {
      this.mcpWrapper = new AgentMCPWrapper(this, this.name);
    }
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
   * Call Claude API with the agent's system message
   */
  async callClaude(prompt, options = {}) {
    try {
      this.setStatus('working', { task: 'calling_claude' });
      
      const messages = [
        ...this.conversationHistory.slice(-10), // Keep last 10 messages for context
        { role: 'user', content: prompt }
      ];

      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: options.maxTokens || this.maxTokens,
        system: this.systemMessage,
        messages: messages,
        temperature: options.temperature || 0.7,
      });

      const content = response.content[0].text;
      
      // Update conversation history
      this.conversationHistory.push(
        { role: 'user', content: prompt },
        { role: 'assistant', content: content }
      );

      // Trim history if too long
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      this.setStatus('done', { task: 'calling_claude' });
      
      return {
        success: true,
        content: content,
        usage: response.usage,
      };
    } catch (error) {
      this.setStatus('error', { task: 'calling_claude', error: error.message });
      logger.error(`[${this.name}] Claude API error:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
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
