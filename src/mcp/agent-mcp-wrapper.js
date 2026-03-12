/**
 * 🦉 NightOwl - Agent MCP Wrapper
 * Wraps agents with MCP tool capabilities
 */

const mcpClient = require('./mcp-client');
const logger = require('../utils/logger');

class AgentMCPWrapper {
  constructor(agent, agentName) {
    this.agent = agent;
    this.agentName = agentName;
    this.toolHistory = [];
    
    // Get allowed servers from config
    const config = require('../../config/mcp-servers.json');
    this.allowedServers = config.agentTools[agentName] || [];
  }

  /**
   * Execute agent task with MCP tools
   */
  async executeWithTools(task, context = {}) {
    if (!mcpClient.isInitialized) {
      await mcpClient.initialize();
    }

    // Get tools relevant to this agent
    const availableTools = this.getAgentTools();
    
    logger.info(`[MCP Wrapper] ${this.agentName} has ${availableTools.length} tools available`);

    // Create the prompt
    const prompt = this.createToolEnhancedPrompt(task, availableTools, context);

    try {
      // Execute with tool loop
      const result = await this.executeWithToolLoop(prompt, availableTools);
      return result;
    } catch (error) {
      logger.error(`[MCP Wrapper] Error in ${this.agentName}:`, error);
      throw error;
    }
  }

  /**
   * Get tools available to this agent
   */
  getAgentTools() {
    return mcpClient.getToolsForAgent(this.agentName);
  }

  /**
   * Create prompt with tool context
   */
  createToolEnhancedPrompt(task, tools, context) {
    const toolDescriptions = tools.map(t => 
      `- ${t.name} (${t.server}): ${t.description}`
    ).join('\n');

    return `
You are ${this.agentName} agent in NightOwl AI development team.

Task: ${task}

Context: ${JSON.stringify(context, null, 2)}

You have access to the following MCP tools:

${toolDescriptions}

When you need to use a tool, respond with a tool_use request.
After receiving tool results, continue with your response.
You can chain multiple tool calls to accomplish complex tasks.

Proceed to accomplish the task using available tools when needed.
`;
  }

  /**
   * Execute with tool use loop
   */
  async executeWithToolLoop(prompt, tools) {
    const messages = [
      { role: 'user', content: prompt },
    ];

    let iteration = 0;
    const maxIterations = 20;

    while (iteration < maxIterations) {
      iteration++;
      
      // Call Claude with tools
      const response = await this.agent.anthropic.messages.create({
        model: this.agent.model,
        max_tokens: 4096,
        system: this.agent.systemMessage,
        messages: messages,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        })),
      });

      // Check if Claude wants to use a tool
      const toolUse = response.content.find(c => c.type === 'tool_use');
      
      if (!toolUse) {
        // No tool use, return the final response
        return {
          success: true,
          content: response.content[0].text,
          toolCalls: this.toolHistory,
          iterations: iteration,
        };
      }

      // Execute the tool
      logger.info(`[MCP Wrapper] ${this.agentName} using tool: ${toolUse.name}`);
      
      const toolResult = await this.executeTool(toolUse.name, toolUse.input);
      
      this.toolHistory.push({
        tool: toolUse.name,
        input: toolUse.input,
        output: toolResult,
        timestamp: new Date(),
      });

      // Add tool use and result to messages
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof toolResult === 'string' 
            ? toolResult 
            : JSON.stringify(toolResult),
        }],
      });
    }

    return {
      success: false,
      error: 'Maximum iterations reached',
      toolCalls: this.toolHistory,
    };
  }

  /**
   * Execute a specific tool
   */
  async executeTool(toolName, params) {
    try {
      const result = await mcpClient.executeTool(toolName, params);
      return result;
    } catch (error) {
      logger.error(`[MCP Wrapper] Tool execution failed: ${toolName}`, error);
      return { error: error.message };
    }
  }

  /**
   * Quick tool execution without conversation
   */
  async quickTool(toolName, params) {
    if (!mcpClient.isInitialized) {
      await mcpClient.initialize();
    }

    return await mcpClient.executeTool(toolName, params);
  }

  /**
   * Chain multiple tools in sequence
   */
  async chainTools(operations) {
    const results = [];

    for (const op of operations) {
      const result = await this.executeTool(op.tool, op.params);
      results.push({
        operation: op,
        result,
      });
    }

    return results;
  }

  /**
   * Read file using MCP filesystem
   */
  async readFile(path) {
    return this.quickTool('read_file', { path });
  }

  /**
   * Write file using MCP filesystem
   */
  async writeFile(path, content) {
    return this.quickTool('write_file', { path, content });
  }

  /**
   * Search files using MCP
   */
  async searchFiles(path, pattern) {
    return this.quickTool('search_files', { path, pattern });
  }

  /**
   * Git status using MCP
   */
  async gitStatus(repoPath) {
    return this.quickTool('git_status', { repo_path: repoPath });
  }

  /**
   * Git commit using MCP
   */
  async gitCommit(repoPath, message) {
    return this.quickTool('git_commit', { 
      repo_path: repoPath, 
      message,
      files: []
    });
  }

  /**
   * Database query using MCP
   */
  async queryDatabase(query) {
    return this.quickTool('query', { sql: query });
  }

  /**
   * Web fetch using MCP
   */
  async fetchWeb(url) {
    return this.quickTool('fetch', { url });
  }

  /**
   * Search web using Brave
   */
  async webSearch(query) {
    return this.quickTool('brave_web_search', { query });
  }
}

module.exports = AgentMCPWrapper;
