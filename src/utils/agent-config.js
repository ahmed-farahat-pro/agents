/**
 * Agent Configuration Manager
 * Allows runtime changes to agent AI models without restarting
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const AGENTS_CONFIG_FILE = path.join(process.cwd(), 'config/agents.json');

class AgentConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this.runtimeOverrides = new Map(); // userId -> { agentName -> { provider, model } }
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(AGENTS_CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('[AgentConfig] Failed to load config:', error.message);
      return {};
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(AGENTS_CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
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
  getAllAgents() {
    const agents = {};
    const agentNames = ['orchestrator', 'planner', 'backend-dev', 'frontend-dev', 'qa-tester', 'code-reviewer', 'reporter'];
    
    for (const name of agentNames) {
      if (this.config[name]) {
        agents[name] = {
          name,
          role: this.config[name].role,
          provider: this.config[name].provider,
          model: this.config[name].model,
          fallbackProvider: this.config[name].fallbackProvider,
          fallbackModel: this.config[name].fallbackModel,
        };
      }
    }
    return agents;
  }

  /**
   * Get global default configuration
   */
  getGlobalDefaults() {
    return this.config.global || {
      defaultProvider: 'zhipu',
      defaultModel: 'glm-5',
    };
  }

  /**
   * Set global default provider and model
   */
  setGlobalDefaults(provider, model) {
    if (!this.config.global) {
      this.config.global = {};
    }
    if (provider) this.config.global.defaultProvider = provider;
    if (model) this.config.global.defaultModel = model;
    return this.saveConfig();
  }

  /**
   * Get agent configuration (with optional user override)
   */
  getAgentConfig(agentName, userId = null) {
    const baseConfig = this.config[agentName] || {};
    
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
   * Set agent provider and model (persisted to file)
   */
  setAgentModel(agentName, provider, model) {
    if (!this.config[agentName]) {
      logger.error(`[AgentConfig] Agent ${agentName} not found`);
      return false;
    }
    
    if (provider) this.config[agentName].provider = provider;
    if (model) this.config[agentName].model = model;
    
    logger.info(`[AgentConfig] Set ${agentName} to ${provider}/${model}`);
    return this.saveConfig();
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
  getAvailableProviders() {
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
   * Reload config from file
   */
  reloadConfig() {
    this.config = this.loadConfig();
    logger.info('[AgentConfig] Config reloaded from file');
    return true;
  }
}

// Singleton instance
const agentConfig = new AgentConfigManager();

module.exports = agentConfig;
