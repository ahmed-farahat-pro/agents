#!/usr/bin/env node
/**
 * 🔧 MCP Initialization Script
 * Pre-installs MCP packages and verifies setup
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Critical MCP packages that need to be available
const CRITICAL_PACKAGES = [
  '@modelcontextprotocol/server-filesystem',
  '@modelcontextprotocol/server-git',
  '@modelcontextprotocol/server-gitlab',
  '@modelcontextprotocol/server-github',
  '@modelcontextprotocol/server-fetch',
  '@modelcontextprotocol/server-sequential-thinking',
  '@modelcontextprotocol/server-memory',
];

const OPTIONAL_PACKAGES = [
  '@modelcontextprotocol/server-postgres',
  '@modelcontextprotocol/server-sqlite',
  '@modelcontextprotocol/server-puppeteer',
  '@modelcontextprotocol/server-brave-search',
  '@modelcontextprotocol/server-redis',
  '@modelcontextprotocol/server-docker',
];

function ensureWorkspace() {
  info('Setting up workspace directories...');
  
  const dirs = [
    '/workspace',
    '/workspace/data',
    '/workspace/repos',
    '/workspace/notes',
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        log('ok', `Created: ${dir}`);
      } catch (err) {
        log('error', `Failed to create ${dir}: ${err.message}`);
      }
    } else {
      log('ok', `Exists: ${dir}`);
    }
  }
}

function checkNpx() {
  info('Checking npx availability...');
  try {
    const result = execSync('which npx', { encoding: 'utf8' });
    log('ok', `npx found at: ${result.trim()}`);
    return true;
  } catch (error) {
    log('error', 'npx not found. Please install Node.js.');
    return false;
  }
}

function checkNodeVersion() {
  info('Checking Node.js version...');
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0], 10);
  
  if (major >= 18) {
    log('ok', `Node.js ${version} (supported)`);
    return true;
  } else {
    log('warn', `Node.js ${version} (recommended: 18+)`);
    return true;
  }
}

async function installMcpPackage(pkg) {
  return new Promise((resolve) => {
    try {
      // Use npx to verify package can be fetched
      execSync(`npx --yes --package=${pkg} echo "Package ready"`, {
        timeout: 60000,
        stdio: 'pipe',
      });
      resolve({ success: true });
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
  });
}

async function preinstallPackages() {
  info('Pre-installing critical MCP packages...');
  info('This may take a few minutes on first run...\n');
  
  for (const pkg of CRITICAL_PACKAGES) {
    process.stdout.write(`  Installing ${pkg}... `);
    const result = await installMcpPackage(pkg);
    if (result.success) {
      console.log(`${colors.green}✓${colors.reset}`);
    } else {
      console.log(`${colors.red}✗${colors.reset}`);
      console.log(`    Error: ${result.error}`);
    }
  }
  
  info('\nOptional packages (installing in background)...');
  // Install optional packages in parallel
  await Promise.all(OPTIONAL_PACKAGES.map(async (pkg) => {
    try {
      await installMcpPackage(pkg);
    } catch (e) {
      // Silently fail for optional packages
    }
  }));
}

function checkEnvVars() {
  info('Checking environment variables...');
  
  const required = ['GITLAB_TOKEN'];
  const optional = ['GITLAB_NAMESPACE', 'GITLAB_URL', 'GITHUB_TOKEN'];
  
  let allRequired = true;
  
  for (const key of required) {
    if (process.env[key]) {
      log('ok', `${key} is set`);
    } else {
      log('error', `${key} is NOT set`);
      allRequired = false;
    }
  }
  
  for (const key of optional) {
    if (process.env[key]) {
      log('ok', `${key} is set (optional)`);
    } else {
      log('warn', `${key} is not set (optional)`);
    }
  }
  
  return allRequired;
}

async function testGitLabConnection() {
  info('Testing GitLab connection...');
  
  const token = process.env.GITLAB_TOKEN;
  const baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
  
  if (!token) {
    log('warn', 'Skipping GitLab test - no token');
    return false;
  }
  
  try {
    const axios = require('axios');
    const client = axios.create({
      baseURL: `${baseUrl}/api/v4`,
      headers: { 'PRIVATE-TOKEN': token },
      timeout: 10000,
    });
    
    const response = await client.get('/user');
    log('ok', `GitLab: Authenticated as ${response.data.username}`);
    
    const projects = await client.get('/projects', {
      params: { membership: true, per_page: 5 }
    });
    log('ok', `GitLab: Found ${projects.data.length} accessible projects`);
    
    return true;
  } catch (error) {
    log('error', `GitLab: ${error.message}`);
    if (error.response) {
      console.log(`  Status: ${error.response.status}`);
    }
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         🔧 Nigents MCP Initialization                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  // Check prerequisites
  const nodeOk = checkNodeVersion();
  const npxOk = checkNpx();
  
  if (!nodeOk || !npxOk) {
    console.log('\n❌ Prerequisites not met. Please fix the issues above.');
    process.exit(1);
  }
  
  // Setup workspace
  ensureWorkspace();
  
  // Check environment
  const envOk = checkEnvVars();
  
  // Pre-install packages
  await preinstallPackages();
  
  // Test connections
  const gitlabOk = await testGitLabConnection();
  
  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Initialization Summary                  ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Node.js:    ${nodeOk ? colors.green + '✓ OK' + colors.reset : colors.red + '✗ FAIL' + colors.reset}                                      ║`);
  console.log(`║  npx:        ${npxOk ? colors.green + '✓ OK' + colors.reset : colors.red + '✗ FAIL' + colors.reset}                                      ║`);
  console.log(`║  Workspace:  ${colors.green}✓ OK${colors.reset}                                      ║`);
  console.log(`║  GitLab:     ${gitlabOk ? colors.green + '✓ OK' + colors.reset : colors.yellow + '⚠ CHECK' + colors.reset}                                     ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  if (envOk && gitlabOk) {
    console.log('✅ All systems ready! You can now run the bot.');
    console.log('   The MCP servers will initialize automatically on startup.\n');
  } else {
    console.log('⚠️  Setup incomplete. Some features may not work.');
    console.log('   Set the missing environment variables and try again.\n');
  }
}

main().catch(err => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
