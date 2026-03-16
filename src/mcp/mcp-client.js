/**
 * 🦉 Nigents - MCP (Model Context Protocol) Client
 * Integrates MCP servers with AI agents for enhanced capabilities
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class MCPClientManager {
  constructor() {
    this.clients = new Map();
    this.servers = new Map();
    this.tools = [];
    this.isInitialized = false;
    this.connectionErrors = new Map();
  }

  /**
   * Initialize all configured MCP servers
   */
  async initialize() {
    const config = require('../../config/mcp-servers.json');
    
    logger.info('[MCP] ═══════════════════════════════════════════════════');
    logger.info('[MCP] Initializing MCP servers...');
    logger.info(`[MCP] Node version: ${process.version}`);
    logger.info(`[MCP] Working directory: ${process.cwd()}`);
    
    // Ensure workspace directory exists
    this.ensureWorkspace();
    
    // Check if npx is available
    const npxAvailable = await this.checkNpxAvailable();
    if (!npxAvailable) {
      logger.error('[MCP] npx is not available. MCP servers will not work.');
      logger.error('[MCP] Install Node.js properly to fix this issue.');
    }

    let connectedCount = 0;
    let failedCount = 0;
    const criticalServers = [];
    
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      if (serverConfig.enabled !== false) {
        try {
          logger.info(`[MCP] Connecting to ${name}...`);
          await this.connectServer(name, serverConfig);
          logger.info(`[MCP] ✅ Connected: ${name}`);
          connectedCount++;
          
          if (serverConfig.critical) {
            criticalServers.push({ name, status: 'connected' });
          }
        } catch (error) {
          failedCount++;
          this.connectionErrors.set(name, error.message);
          logger.error(`[MCP] ❌ Failed to connect ${name}: ${error.message}`);
          
          if (serverConfig.critical) {
            criticalServers.push({ name, status: 'failed', error: error.message });
          }
          
          // Log more details for debugging
          if (error.stderr) {
            logger.error(`[MCP] ${name} stderr: ${error.stderr.substring(0, 500)}`);
          }
        }
      }
    }

    this.isInitialized = true;
    
    logger.info('[MCP] ═══════════════════════════════════════════════════');
    logger.info(`[MCP] Connection Summary: ${connectedCount} connected, ${failedCount} failed`);
    
    // Report critical server status
    const criticalFailed = criticalServers.filter(s => s.status === 'failed');
    if (criticalFailed.length > 0) {
      logger.warn('[MCP] ⚠️ Critical servers failed:');
      criticalFailed.forEach(s => logger.warn(`[MCP]   - ${s.name}: ${s.error}`));
      logger.warn('[MCP] Some features may not work correctly.');
    }
    
    if (this.clients.size > 0) {
      logger.info(`[MCP] ${this.clients.size} servers ready with ${this.tools.length} total tools`);
    } else {
      logger.warn('[MCP] No MCP servers connected - running in standalone mode');
      logger.warn('[MCP] To fix: Ensure npx is available and required packages can be downloaded');
    }
    logger.info('[MCP] ═══════════════════════════════════════════════════');
    
    return {
      connected: connectedCount,
      failed: failedCount,
      critical: criticalServers,
      tools: this.tools.length,
    };
  }

  /**
   * Ensure workspace directory exists
   */
  ensureWorkspace() {
    const workspacePath = '/workspace';
    
    if (!fs.existsSync(workspacePath)) {
      logger.warn(`[MCP] Workspace directory ${workspacePath} does not exist`);
      try {
        fs.mkdirSync(workspacePath, { recursive: true });
        logger.info(`[MCP] Created workspace directory: ${workspacePath}`);
      } catch (err) {
        logger.error(`[MCP] Failed to create workspace: ${err.message}`);
      }
    }
    
    // Also create data subdirectory for sqlite
    const dataPath = path.join(workspacePath, 'data');
    if (!fs.existsSync(dataPath)) {
      try {
        fs.mkdirSync(dataPath, { recursive: true });
      } catch (err) {
        logger.warn(`[MCP] Could not create data directory: ${err.message}`);
      }
    }
    
    // Create repos subdirectory for cloned repositories
    const reposPath = path.join(workspacePath, 'repos');
    if (!fs.existsSync(reposPath)) {
      try {
        fs.mkdirSync(reposPath, { recursive: true });
        logger.info(`[MCP] Created repos directory: ${reposPath}`);
      } catch (err) {
        logger.warn(`[MCP] Could not create repos directory: ${err.message}`);
      }
    }
  }

  /**
   * Check if npx is available
   */
  async checkNpxAvailable() {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec('which npx', (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Connect to an MCP server via stdio
   */
  async connectServer(name, config) {
    const env = {};
    
    // Resolve environment variables
    for (const [key, value] of Object.entries(config.env || {})) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const envVar = value.slice(2, -1);
        env[key] = process.env[envVar] || '';
      } else {
        env[key] = value;
      }
    }

    // Create transport with timeout
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...env },
    });

    const client = new Client({ transport });
    
    // Connect with timeout
    const connectPromise = client.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout (30s)')), 30000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);

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
    // Lazy initialization
    if (!this.isInitialized) {
      await this.initialize();
    }

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

    logger.debug(`[MCP] Executing ${toolName} from ${toolInfo.server}`);
    
    const result = await targetClient.callTool({
      name: toolName,
      arguments: params,
    });

    return result;
  }

  /**
   * Get all available tools
   */
  getAllTools() {
    return this.tools;
  }

  /**
   * Get tools available to a specific agent
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
   * Get server status
   */
  getServerStatus() {
    const status = {
      initialized: this.isInitialized,
      connectedServers: this.clients.size,
      totalTools: this.tools.length,
      servers: {},
    };

    const config = require('../../config/mcp-servers.json');
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      const isConnected = this.clients.has(name);
      status.servers[name] = {
        enabled: serverConfig.enabled !== false,
        connected: isConnected,
        critical: serverConfig.critical || false,
        tools: isConnected ? this.clients.get(name).tools.map(t => t.name) : [],
        error: this.connectionErrors.get(name) || null,
      };
    }

    return status;
  }

  /**
   * Check if a specific tool is available
   */
  hasTool(toolName) {
    return this.tools.some(t => t.name === toolName);
  }

  /**
   * Close all MCP connections
   */
  async shutdown() {
    logger.info('[MCP] Shutting down MCP servers...');
    
    for (const [name, serverData] of this.clients) {
      try {
        await serverData.client.disconnect();
        logger.info(`[MCP] Disconnected: ${name}`);
      } catch (e) {
        logger.warn(`[MCP] Error disconnecting ${name}:`, e.message);
      }
    }

    this.clients.clear();
    this.tools = [];
    this.isInitialized = false;
    this.connectionErrors.clear();
    
    logger.info('[MCP] Shutdown complete');
  }
}

// Export singleton
module.exports = new MCPClientManager();
