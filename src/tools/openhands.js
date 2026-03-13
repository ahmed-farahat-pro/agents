/**
 * 🦉 Nigents - OpenHands Tool
 * Code execution sandbox for writing and testing code
 */

const axios = require('axios');
const logger = require('../utils/logger');

class OpenHandsTool {
  constructor() {
    this.baseUrl = process.env.OPENHANDS_URL || 'http://localhost:3000';
    this.apiKey = process.env.OPENHANDS_API_KEY;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 300000, // 5 minute timeout for long operations
      headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
    });
  }

  /**
   * Execute shell commands in OpenHands sandbox
   */
  async executeCommands(commands, options = {}) {
    try {
      logger.info('[OpenHands] Executing commands:', commands.length);
      
      const response = await this.client.post('/api/execute', {
        commands,
        working_dir: options.workingDir || '/workspace',
        timeout: options.timeout || 300,
      });

      return {
        success: response.data.exit_code === 0,
        output: response.data.output,
        error: response.data.error,
        exitCode: response.data.exit_code,
      };
    } catch (error) {
      logger.error('[OpenHands] Command execution failed:', error.message);
      return {
        success: false,
        error: error.message,
        output: '',
        exitCode: -1,
      };
    }
  }

  /**
   * Write a file in the sandbox
   */
  async writeFile(filePath, content) {
    try {
      logger.info('[OpenHands] Writing file:', filePath);
      
      const response = await this.client.post('/api/files/write', {
        path: filePath,
        content: content,
      });

      return {
        success: true,
        path: filePath,
      };
    } catch (error) {
      logger.error('[OpenHands] Write file failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(filePath) {
    try {
      const response = await this.client.get('/api/files/read', {
        params: { path: filePath },
      });

      return {
        success: true,
        content: response.data.content,
        path: filePath,
      };
    } catch (error) {
      logger.error('[OpenHands] Read file failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Edit a file (search and replace)
   */
  async editFile(filePath, search, replace) {
    try {
      logger.info('[OpenHands] Editing file:', filePath);
      
      const response = await this.client.post('/api/files/edit', {
        path: filePath,
        search: search,
        replace: replace,
      });

      return {
        success: true,
        path: filePath,
        changes: response.data.changes,
      };
    } catch (error) {
      logger.error('[OpenHands] Edit file failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath) {
    try {
      const response = await this.client.get('/api/files/list', {
        params: { path: dirPath },
      });

      return {
        success: true,
        files: response.data.files,
        path: dirPath,
      };
    } catch (error) {
      logger.error('[OpenHands] List directory failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Run a task with AI assistance
   */
  async implementWithPrompt(prompt, workingDir) {
    try {
      logger.info('[OpenHands] Running AI implementation');
      
      const response = await this.client.post('/api/agent/run', {
        prompt: prompt,
        working_dir: workingDir,
        model: 'claude-3-sonnet-20240229',
      });

      return {
        success: response.data.success,
        output: response.data.output,
        actions: response.data.actions,
      };
    } catch (error) {
      logger.error('[OpenHands] AI implementation failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if OpenHands is available
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return {
        available: response.status === 200,
        status: response.data,
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
      };
    }
  }

  /**
   * Initialize a workspace for a project
   */
  async initWorkspace(project, branch) {
    const commands = [
      'cd /workspace',
      `git clone ${project} repo || true`,
      'cd repo',
      `git checkout -b ${branch}`,
    ];

    return this.executeCommands(commands);
  }

  /**
   * Run tests in the workspace
   */
  async runTests(testCommand, workingDir) {
    return this.executeCommands([`cd ${workingDir}`, testCommand]);
  }

  /**
   * Commit and push changes
   */
  async commitAndPush(workingDir, message, branch) {
    const commands = [
      `cd ${workingDir}`,
      'git add -A',
      `git commit -m "${message}"`,
      `git push origin ${branch}`,
    ];

    return this.executeCommands(commands);
  }
}

// Export singleton
module.exports = new OpenHandsTool();
