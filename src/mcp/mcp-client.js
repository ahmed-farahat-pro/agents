/**
 * 🦉 Nigents - MCP (Model Context Protocol) Client
 * Integrates MCP servers with AI agents for enhanced capabilities
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const logger = require('../utils/logger');

class MCPClientManager {
  constructor() {
    this.clients = new Map();
    this.servers = new Map();
    this.tools = [];
    this.isInitialized = false;
  }

  /**
   * Initialize all configured MCP servers
   */
  async initialize() {
    const config = require('../../config/mcp-servers.json');
    
    logger.info('[MCP] Initializing MCP servers...');
    
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.enabled !== false) {
        try {
          await this.connectServer(name, serverConfig);
          logger.info(`[MCP] Connected: ${name}`);
        } catch (error) {
          logger.error(`[MCP] Failed to connect ${name}:`, error.message);
        }
      }
    }

    this.isInitialized = true;
    logger.info(`[MCP] Initialization complete. ${this.clients.size} servers connected.`);
  }

  /**
   * Connect to an MCP server via stdio
   */
  async connectServer(name, config) {
    const env = {};
    
    // Resolve environment variables
    for (const [key, value] of Object.entries(config.env || {})) {
      if (value.startsWith('${') && value.endsWith('}')) {
        const envVar = value.slice(2, -1);
        env[key] = process.env[envVar] || '';
      } else {
        env[key] = value;
      }
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...env },
    });

    const client = new Client({ transport });
    await client.connect();

    // Discover available tools
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    
    logger.info(`[MCP] ${name} provides ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);

    this.clients.set(name, {
      client,
      tools: tools.map(t => ({
        ...t,
        server: name,
      })),
    });

    // Aggregate all tools
    this.tools = [...this.tools, ...tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || {},
      server: name,
    }))];
  }

  /**
   * Execute a tool from any MCP server
   */
  async executeTool(toolName, params) {
    // Find which server has this tool
    let targetClient = null;
    let toolInfo = null;

    for (const [serverName, serverData] of this.clients) {
      const tool = serverData.tools.find(t => t.name === toolName);
      if (tool) {
        targetClient = serverData.client;
        toolInfo = tool;
        break;
      }
    }

    if (!targetClient) {
      throw new Error(`Tool ${toolName} not found in any MCP server`);
    }

    logger.info(`[MCP] Executing ${toolName} from ${toolInfo.server}`);
    
    const result = await targetClient.callTool({
      name: toolName,
      arguments: params,
    });

    return result;
  }

  /**
   * Get all available tools as Claude tool definitions
   */
  getToolsForClaude() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: `[${tool.server}] ${tool.description}`,
      input_schema: tool.inputSchema,
    }));
  }

  /**
   * Get tools for a specific agent
   */
  getToolsForAgent(agentName) {
    const config = require('../../config/mcp-servers.json');
    const allowedServers = config.agentTools[agentName] || [];
    
    return this.tools.filter(tool => 
      allowedServers.includes(tool.server)
    );
  }

  /**
   * Get tools grouped by server
   */
  getToolsByServer() {
    const grouped = {};
    for (const [serverName, serverData] of this.clients) {
      grouped[serverName] = serverData.tools;
    }
    return grouped;
  }

  /**
   * Close all MCP connections
   */
  async shutdown() {
    logger.info('[MCP] Shutting down MCP servers...');
    
    for (const [name, serverData] of this.clients) {
      try {
        await serverData.client.disconnect();
      } catch (e) {
        logger.warn(`[MCP] Error disconnecting ${name}:`, e.message);
      }
    }

    this.clients.clear();
    this.isInitialized = false;
    
    logger.info('[MCP] Shutdown complete');
  }
}

// Export singleton
module.exports = new MCPClientManager();
