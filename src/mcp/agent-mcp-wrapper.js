/**
 * 🦉 Nigents - Agent MCP Wrapper
 * Wraps agents with MCP tool capabilities
 */

const mcpClient = require('./mcp-client');
const logger = require('../utils/logger');
const aiClient = require('../utils/ai-client');

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
      // If no tools available, just call AI directly
      if (availableTools.length === 0) {
        logger.info(`[MCP Wrapper] No tools for ${this.agentName}, calling AI directly`);
        const result = await aiClient.call(prompt, {
          provider: this.agent.provider,
          model: this.agent.model,
          systemMessage: this.agent.systemMessage,
          maxTokens: 4096,
        });
        return {
          success: true,
          content: result.content,
          toolCalls: [],
          iterations: 1,
        };
      }

      // Execute with tool loop
      const result = await this.executeWithToolLoop(prompt, availableTools);
      return result;
    } catch (error) {
      logger.error(`[MCP Wrapper] Error in ${this.agentName}:`, error);
      // Fallback to direct AI call on error
      try {
        logger.info(`[MCP Wrapper] Falling back to direct AI call for ${this.agentName}`);
        const result = await aiClient.call(prompt, {
          provider: this.agent.provider,
          model: this.agent.model,
          systemMessage: this.agent.systemMessage,
          maxTokens: 4096,
        });
        return {
          success: true,
          content: result.content,
          toolCalls: [],
          iterations: 1,
          fallback: true,
        };
      } catch (fallbackError) {
        logger.error(`[MCP Wrapper] Fallback also failed:`, fallbackError);
        throw error;
      }
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
${this.agent.systemMessage || ''}

You are ${this.agentName} with access to tools.

TASK: ${task}

${context.project ? `PROJECT: ${context.project}` : ''}

AVAILABLE TOOLS:
${toolDescriptions || 'No tools available'}

When you need to use a tool, respond with:
TOOL: <tool_name>
INPUT: <json_input>

After tool results are provided, continue with your analysis.

If no tools are needed, simply provide your response.
`;
  }

  /**
   * Execute with tool use loop - Simplified version using aiClient
   */
  async executeWithToolLoop(prompt, tools) {
    const messages = [
      { role: 'user', content: prompt },
    ];

    let iteration = 0;
    const maxIterations = 10;

    while (iteration < maxIterations) {
      iteration++;
      
      logger.info(`[MCP Wrapper] ${this.agentName} iteration ${iteration}`);
      
      // Build the full prompt with conversation history
      const fullPrompt = messages.map(m => {
        if (m.role === 'user') return `User: ${m.content}`;
        if (m.role === 'assistant') return `Assistant: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`;
        if (m.role === 'tool') return `Tool Result: ${m.content}`;
        return `${m.role}: ${m.content}`;
      }).join('\n\n');

      try {
        // Call AI using aiClient
        const response = await aiClient.call(fullPrompt, {
          provider: this.agent.provider,
          model: this.agent.model,
          systemMessage: this.agent.systemMessage,
          maxTokens: 4096,
          temperature: 0.7,
        });

        const content = response.content;

        // Check if AI wants to use a tool
        const toolMatch = content.match(/TOOL:\s*(\w+)\s*\nINPUT:\s*(\{[^}]*\}|.+)/i);
        
        if (!toolMatch) {
          // No tool use, return the final response
          return {
            success: true,
            content: content,
            toolCalls: this.toolHistory,
            iterations: iteration,
          };
        }

        // Extract tool info
        const toolName = toolMatch[1].trim();
        let toolInput;
        try {
          toolInput = JSON.parse(toolMatch[2].trim());
        } catch {
          toolInput = { query: toolMatch[2].trim() };
        }

        // Execute the tool
        logger.info(`[MCP Wrapper] ${this.agentName} using tool: ${toolName}`);
        
        const toolResult = await this.executeTool(toolName, toolInput);
        
        this.toolHistory.push({
          tool: toolName,
          input: toolInput,
          output: toolResult,
          timestamp: new Date(),
        });

        // Add to messages for next iteration
        messages.push({
          role: 'assistant',
          content: content,
        });

        messages.push({
          role: 'tool',
          content: typeof toolResult === 'string' 
            ? toolResult 
            : JSON.stringify(toolResult, null, 2),
        });

      } catch (error) {
        logger.error(`[MCP Wrapper] AI call failed in iteration ${iteration}:`, error);
        return {
          success: false,
          error: error.message,
          content: messages.map(m => `${m.role}: ${m.content}`).join('\n\n'),
          toolCalls: this.toolHistory,
          iterations: iteration,
        };
      }
    }

    return {
      success: false,
      error: 'Maximum iterations reached',
      toolCalls: this.toolHistory,
      iterations,
    };
  }

  /**
   * Execute a specific tool
   */
  async executeTool(toolName, input) {
    try {
      return await mcpClient.executeTool(toolName, input);
    } catch (error) {
      logger.error(`[MCP Wrapper] Tool execution failed: ${toolName}`, error);
      return { error: error.message };
    }
  }

  /**
   * Get tool usage history
   */
  getToolHistory() {
    return this.toolHistory;
  }
}

module.exports = AgentMCPWrapper;
