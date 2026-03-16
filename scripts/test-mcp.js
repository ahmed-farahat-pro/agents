#!/usr/bin/env node
/**
 * 🧪 MCP Server and GitLab Connectivity Test Script
 * Tests all MCP servers and GitLab API access
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const config = require('../config/mcp-servers.json');

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(status, message) {
  const color = status === 'ok' ? colors.green : status === 'warn' ? colors.yellow : colors.red;
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  console.log(`${color}${icon} ${message}${colors.reset}`);
}

function info(message) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

async function testMCPConnection(name, serverConfig) {
  info(`Testing ${name}...`);
  
  try {
    const env = {};
    for (const [key, value] of Object.entries(serverConfig.env || {})) {
      if (value.startsWith('${') && value.endsWith('}')) {
        const envVar = value.slice(2, -1);
        env[key] = process.env[envVar] || '';
      } else {
        env[key] = value;
      }
    }

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: { ...process.env, ...env },
    });

    const client = new Client({ transport });
    
    // Set a timeout for connection
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 15000)
    );
    
    await Promise.race([client.connect(), timeout]);
    
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    
    log('ok', `${name}: Connected (${tools.length} tools)`);
    if (tools.length > 0) {
      console.log(`  Tools: ${tools.map(t => t.name).join(', ')}`);
    }
    
    await client.close();
    return { success: true, tools: tools.length };
  } catch (error) {
    log('error', `${name}: ${error.message}`);
    if (error.stderr) {
      console.log(`  stderr: ${error.stderr.substring(0, 200)}`);
    }
    return { success: false, error: error.message };
  }
}

async function testGitLabAPI() {
  info('Testing GitLab API...');
  
  const token = process.env.GITLAB_TOKEN;
  const namespace = process.env.GITLAB_NAMESPACE;
  const baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
  
  if (!token) {
    log('warn', 'GitLab API: GITLAB_TOKEN not set');
    return { success: false, reason: 'no_token' };
  }
  
  if (!namespace) {
    log('warn', 'GitLab API: GITLAB_NAMESPACE not set');
  }
  
  try {
    const client = axios.create({
      baseURL: `${baseUrl}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json',
      },
    });
    
    // Test user access
    const userResponse = await client.get('/user');
    log('ok', `GitLab API: Authenticated as ${userResponse.data.username}`);
    
    // Test project listing
    const projectsResponse = await client.get('/projects', {
      params: { membership: true, per_page: 5 }
    });
    log('ok', `GitLab API: Found ${projectsResponse.data.length} accessible projects`);
    
    return { 
      success: true, 
      user: userResponse.data.username,
      projects: projectsResponse.data.length 
    };
  } catch (error) {
    log('error', `GitLab API: ${error.message}`);
    if (error.response) {
      console.log(`  Status: ${error.response.status}`);
      console.log(`  Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    return { success: false, error: error.message };
  }
}

async function testWorkspace() {
  info('Testing workspace directory...');
  
  const workspacePath = '/workspace';
  
  if (!fs.existsSync(workspacePath)) {
    log('warn', `Workspace directory ${workspacePath} does not exist`);
    try {
      fs.mkdirSync(workspacePath, { recursive: true });
      log('ok', `Created workspace directory: ${workspacePath}`);
    } catch (err) {
      log('error', `Failed to create workspace: ${err.message}`);
      return { success: false };
    }
  } else {
    log('ok', `Workspace directory exists: ${workspacePath}`);
    
    // Check write permissions
    try {
      const testFile = path.join(workspacePath, '.test-write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      log('ok', 'Workspace directory is writable');
    } catch (err) {
      log('warn', `Workspace directory not writable: ${err.message}`);
    }
  }
  
  return { success: true };
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         🦉 Nigents MCP & GitLab Test Suite                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  info(`Node version: ${process.version}`);
  info(`Working directory: ${process.cwd()}`);
  info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  console.log('');
  
  // Test workspace
  const workspaceResult = await testWorkspace();
  
  console.log('');
  
  // Test GitLab API
  const gitlabResult = await testGitLabAPI();
  
  console.log('');
  
  // Test MCP servers
  info('Testing MCP servers...\n');
  
  const results = {
    connected: 0,
    failed: 0,
    details: []
  };
  
  for (const [name, serverConfig] of Object.entries(config.servers)) {
    if (serverConfig.enabled !== false) {
      const result = await testMCPConnection(name, serverConfig);
      results.details.push({ name, ...result });
      if (result.success) {
        results.connected++;
      } else {
        results.failed++;
      }
      console.log('');
    }
  }
  
  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      Test Summary                          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Workspace:   ${workspaceResult.success ? colors.green + '✓ OK' + colors.reset : colors.red + '✗ FAIL' + colors.reset}                                      ║`);
  console.log(`║  GitLab API:  ${gitlabResult.success ? colors.green + '✓ OK' + colors.reset : colors.yellow + '⚠ WARN' + colors.reset}                                      ║`);
  console.log(`║  MCP Servers: ${results.connected > 0 ? colors.green + '✓ ' + results.connected + ' connected' + colors.reset : colors.yellow + '⚠ ' + results.connected + ' connected' + colors.reset}                                ║`);
  console.log(`║  Failed:      ${results.failed > 0 ? colors.red + '✗ ' + results.failed + ' failed' + colors.reset : colors.green + '✓ 0 failed' + colors.reset}                                 ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Recommendations
  if (results.failed > 0) {
    info('Recommendations:');
    console.log('  1. Ensure npx is available: npm install -g npx');
    console.log('  2. Check MCP server packages are installed or cache is available');
    console.log('  3. Verify environment variables are set correctly');
    console.log('  4. Check firewall/proxy settings if using corporate network\n');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
