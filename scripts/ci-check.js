#!/usr/bin/env node
/**
 * Local CI mirror: run the same checks as the GitLab test stage.
 * Use before push to catch failures that would break the pipeline.
 * Exit code 0 = all passed, non-zero = at least one failed.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const steps = [];
let failed = false;

function run(name, fn) {
  steps.push(name);
  try {
    fn();
    console.log(`[ci-check] ✅ ${name}`);
  } catch (err) {
    console.error(`[ci-check] ❌ ${name}:`, err.message || err);
    failed = true;
  }
}

console.log('[ci-check] Running same checks as GitLab test stage...\n');

run('lint', () => {
  execSync('npm run lint', { cwd: rootDir, stdio: 'inherit' });
});

run('node --check src/bot.js', () => {
  execSync('node --check src/bot.js', { cwd: rootDir, stdio: 'inherit' });
});

run('node --check src/dashboard/server.js', () => {
  execSync('node --check src/dashboard/server.js', { cwd: rootDir, stdio: 'inherit' });
});

run('node --check src/database/connection.js', () => {
  if (fs.existsSync(path.join(rootDir, 'src/database/connection.js'))) {
    execSync('node --check src/database/connection.js', { cwd: rootDir, stdio: 'inherit' });
  }
});

run('node --check src/database/migrate.js', () => {
  if (fs.existsSync(path.join(rootDir, 'src/database/migrate.js'))) {
    execSync('node --check src/database/migrate.js', { cwd: rootDir, stdio: 'inherit' });
  }
});

const mcpDirs = ['arabic-rtl-auditor', 'task-splitter', 'smart-code-search'];
for (const dir of mcpDirs) {
  const fullPath = path.join(rootDir, 'mcp-servers', dir);
  if (fs.existsSync(fullPath)) {
    run(`mcp-servers/${dir} build`, () => {
      execSync('npm ci && npm run build', { cwd: fullPath, stdio: 'inherit' });
    });
  }
}

console.log('');
if (failed) {
  console.error('[ci-check] Some checks failed. Fix before pushing to avoid pipeline failure.');
  process.exit(1);
}
console.log('[ci-check] All checks passed. Safe to push.');
process.exit(0);
