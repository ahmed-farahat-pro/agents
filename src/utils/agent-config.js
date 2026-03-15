/**
 * Agent Configuration Manager
 * Uses MySQL database (with JSON file fallback) for agent AI model configurations
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Check if MySQL is available
const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

let mysqlConfig = null;
if (useMySQL) {
  try {
    mysqlConfig = require('../database/agent-config-mysql');
    logger.info('[AgentConfig] Using MySQL backend');
  } catch (error) {
    logger.warn('[AgentConfig] MySQL config module not available:', error.message);
  }
}

const AGENTS_CONFIG_FILE = path.join(process.cwd(), 'config/agents.json');

class AgentConfigManager {
  constructor() {
    this.runtimeOverrides = new Map(); // userId -> { agentName -> { provider, model } }
    this.fileConfig = this.loadFileConfig();
  }

  loadFileConfig() {
    try {
      const data = fs.readFileSync(AGENTS_CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('[AgentConfig] Failed to load config file:', error.message);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      global: {
        defaultProvider: 'zhipu',
        defaultModel: 'glm-5',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-5-sonnet-20241022',
      },
      orchestrator: {
        name: 'orchestrator',
        role: 'Team Lead & Router',
        provider: 'zhipu',
        model: 'glm-5',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-5-sonnet-20241022',
      },
      planner: {
        name: 'planner',
        role: 'Architecture & Planning',
        provider: 'zhipu',
        model: 'glm-5',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-5-sonnet-20241022',
      },
      'backend-dev': {
        name: 'backend-dev',
        role: 'Backend Developer',
        provider: 'zhipu',
        model: 'glm-5',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-5-sonnet-20241022',
      },
      'frontend-dev': {
        name: 'frontend-dev',
        role: 'Frontend Developer',
        provider: 'zhipu',
        model: 'glm-4-plus',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-haiku-20240307',
      },
      'qa-tester': {
        name: 'qa-tester',
        role: 'Quality Assurance',
        provider: 'zhipu',
        model: 'glm-4',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-haiku-20240307',
      },
      'code-reviewer': {
        name: 'code-reviewer',
        role: 'Code Reviewer',
        provider: 'zhipu',
        model: 'glm-5',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-5-sonnet-20241022',
      },
      reporter: {
        name: 'reporter',
        role: 'Reporter & Communicator',
        provider: 'zhipu',
        model: 'glm-4',
        fallbackProvider: 'anthropic',
        fallbackModel: 'claude-3-haiku-20240307',
      },
    };
  }

  saveFileConfig() {
    try {
      fs.writeFileSync(AGENTS_CONFIG_FILE, JSON.stringify(this.fileConfig, null, 2), 'utf8');
      logger.info('[AgentConfig] Config saved to file');
      return true;
    } catch (error) {
      logger.error('[AgentConfig] Failed to save config:', error.message);
      return false;
    }
  }

  /**
   * Get all agent configurations
   */
  async getAllAgents() {
    if (mysqlConfig) {
      try {
        return await mysqlConfig.getAllAgents();
      } catch (error) {
        logger.warn('[AgentConfig] MySQL getAllAgents failed, using file:', error.message);
      }
    }
    
    // Fallback to file
    const agents = {};
    const agentNames = ['orchestrator', 'planner', 'backend-dev', 'frontend-dev', 'qa-tester', 'code-reviewer', 'reporter'];
    
    for (const name of agentNames) {
      if (this.fileConfig[name]) {
        agents[name] = {
          name,
          role: this.fileConfig[name].role,
          provider: this.fileConfig[name].provider,
          model: this.fileConfig[name].model,
          fallbackProvider: this.fileConfig[name].fallbackProvider,
          fallbackModel: this.fileConfig[name].fallbackModel,
        };
      }
    }
    return agents;
  }

  /**
   * Get global default configuration
   */
  async getGlobalDefaults() {
    if (mysqlConfig) {
      try {
        return await mysqlConfig.getGlobalDefaults();
      } catch (error) {
        logger.warn('[AgentConfig] MySQL getGlobalDefaults failed, using file:', error.message);
      }
    }
    
    return this.fileConfig.global || {
      defaultProvider: 'zhipu',
      defaultModel: 'glm-5',
    };
  }

  /**
   * Set global default provider and model
   */
  async setGlobalDefaults(provider, model) {
    let success = false;
    
    // Try MySQL first
    if (mysqlConfig) {
      try {
        success = await mysqlConfig.setGlobalDefaults(provider, model);
      } catch (error) {
        logger.warn('[AgentConfig] MySQL setGlobalDefaults failed:', error.message);
      }
    }
    
    // Also update file
    if (!this.fileConfig.global) {
      this.fileConfig.global = {};
    }
    if (provider) this.fileConfig.global.defaultProvider = provider;
    if (model) this.fileConfig.global.defaultModel = model;
    this.saveFileConfig();
    
    return success || true;
  }

  /**
   * Get agent configuration (with optional user override)
   */
  async getAgentConfig(agentName, userId = null) {
    let baseConfig;
    
    if (mysqlConfig) {
      try {
        baseConfig = await mysqlConfig.getAgentConfig(agentName);
      } catch (error) {
        logger.warn('[AgentConfig] MySQL getAgentConfig failed:', error.message);
      }
    }
    
    if (!baseConfig) {
      baseConfig = this.fileConfig[agentName] || {};
    }
    
    // Check for user-specific runtime override
    if (userId && this.runtimeOverrides.has(userId)) {
      const userOverrides = this.runtimeOverrides.get(userId);
      if (userOverrides[agentName]) {
        return {
          ...baseConfig,
          provider: userOverrides[agentName].provider || baseConfig.provider,
          model: userOverrides[agentName].model || baseConfig.model,
          _isRuntimeOverride: true,
        };
      }
    }
    
    return baseConfig;
  }

  /**
   * Set agent provider and model (persisted to both DB and file)
   */
  async setAgentModel(agentName, provider, model) {
    let success = false;
    
    // Update MySQL
    if (mysqlConfig) {
      try {
        success = await mysqlConfig.setAgentModel(agentName, provider, model);
      } catch (error) {
        logger.warn('[AgentConfig] MySQL setAgentModel failed:', error.message);
      }
    }
    
    // Also update file
    if (this.fileConfig[agentName]) {
      if (provider) this.fileConfig[agentName].provider = provider;
      if (model) this.fileConfig[agentName].model = model;
      this.saveFileConfig();
      success = true;
    }
    
    logger.info(`[AgentConfig] Set ${agentName} to ${provider}/${model}`);
    return success;
  }

  /**
   * Set runtime override for a user (not persisted, only for current session)
   */
  setRuntimeOverride(userId, agentName, provider, model) {
    if (!this.runtimeOverrides.has(userId)) {
      this.runtimeOverrides.set(userId, {});
    }
    
    this.runtimeOverrides.get(userId)[agentName] = { provider, model };
    logger.info(`[AgentConfig] Runtime override for user ${userId}, agent ${agentName}: ${provider}/${model}`);
    return true;
  }

  /**
   * Clear runtime override for a user
   */
  clearRuntimeOverride(userId, agentName = null) {
    if (!this.runtimeOverrides.has(userId)) return true;
    
    if (agentName) {
      delete this.runtimeOverrides.get(userId)[agentName];
    } else {
      this.runtimeOverrides.delete(userId);
    }
    return true;
  }

  /**
   * Get available providers and models
   */
  async getAvailableProviders() {
    if (mysqlConfig) {
      try {
        return await mysqlConfig.getAvailableProviders();
      } catch (error) {
        logger.warn('[AgentConfig] MySQL getAvailableProviders failed, using defaults:', error.message);
      }
    }
    
    // Default providers
    return {
      anthropic: {
        name: 'Anthropic Claude',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
      },
      zhipu: {
        name: 'Zhipu AI (GLM)',
        models: ['glm-5', 'glm-4.5', 'glm-4', 'glm-4-plus', 'glm-4-flash', 'glm-4v', 'glm-4-long'],
      },
      moonshot: {
        name: 'Moonshot AI',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      },
      deepseek: {
        name: 'DeepSeek',
        models: ['deepseek-chat', 'deepseek-coder'],
      },
    };
  }

  /**
   * Reload config from file and database
   */
  async reloadConfig() {
    this.fileConfig = this.loadFileConfig();
    
    if (mysqlConfig) {
      try {
        // MySQL config is always fresh
        logger.info('[AgentConfig] MySQL config reloaded');
      } catch (error) {
        logger.warn('[AgentConfig] MySQL reload failed:', error.message);
      }
    }
    
    return true;
  }
}

// Singleton instance
const agentConfig = new AgentConfigManager();

module.exports = agentConfig;
