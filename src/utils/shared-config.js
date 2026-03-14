/**
 * Shared Configuration - Sync API keys between dashboard and bot
 * Stores API keys in a file that both can access
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'shared-config.json');

// Default config
const defaultConfig = {
  apiKeys: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    ZHIPU_API_KEY: process.env.ZHIPU_API_KEY || '',
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY || '',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  },
  gitlab: {
    token: process.env.GITLAB_TOKEN || '',
    namespace: process.env.GITLAB_NAMESPACE || '',
    url: process.env.GITLAB_URL || 'https://gitlab.com',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  updatedAt: null,
};

class SharedConfig {
  constructor() {
    this.config = this.loadConfig();
    logger.info('[SharedConfig] Initialized with API keys:', {
      anthropic: this.config.apiKeys.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET',
      zhipu: this.config.apiKeys.ZHIPU_API_KEY ? 'SET' : 'NOT SET',
      moonshot: this.config.apiKeys.MOONSHOT_API_KEY ? 'SET' : 'NOT SET',
      deepseek: this.config.apiKeys.DEEPSEEK_API_KEY ? 'SET' : 'NOT SET',
    });
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        const loaded = JSON.parse(data);
        // Merge with defaults (env vars take precedence if file is older)
        return {
          ...defaultConfig,
          ...loaded,
          apiKeys: {
            ...defaultConfig.apiKeys,
            ...loaded.apiKeys,
          },
        };
      }
    } catch (error) {
      logger.error('[SharedConfig] Failed to load config:', error);
    }
    return { ...defaultConfig };
  }

  saveConfig() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.config.updatedAt = new Date().toISOString();
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
      logger.info('[SharedConfig] Config saved');
      return true;
    } catch (error) {
      logger.error('[SharedConfig] Failed to save config:', error);
      return false;
    }
  }

  // API Keys
  getApiKeys() {
    return this.config.apiKeys;
  }

  setApiKey(name, value) {
    this.config.apiKeys[name] = value;
    this.saveConfig();
    logger.info(`[SharedConfig] API key ${name} updated`);
  }

  updateApiKeys(keys) {
    this.config.apiKeys = { ...this.config.apiKeys, ...keys };
    this.saveConfig();
    logger.info('[SharedConfig] Multiple API keys updated');
  }

  // Get sanitized config (for frontend - hides full keys)
  getSanitizedConfig() {
    const mask = (key) => {
      if (!key || key.length < 8) return '';
      return key.substring(0, 4) + '****' + key.substring(key.length - 4);
    };

    return {
      apiKeys: {
        ANTHROPIC_API_KEY: this.config.apiKeys.ANTHROPIC_API_KEY ? 'SET' : '',
        ZHIPU_API_KEY: this.config.apiKeys.ZHIPU_API_KEY ? 'SET' : '',
        MOONSHOT_API_KEY: this.config.apiKeys.MOONSHOT_API_KEY ? 'SET' : '',
        DEEPSEEK_API_KEY: this.config.apiKeys.DEEPSEEK_API_KEY ? 'SET' : '',
        OPENAI_API_KEY: this.config.apiKeys.OPENAI_API_KEY ? 'SET' : '',
      },
      gitlab: {
        token: this.config.gitlab.token ? 'SET' : '',
        namespace: this.config.gitlab.namespace,
        url: this.config.gitlab.url,
      },
      telegram: {
        botToken: this.config.telegram.botToken ? 'SET' : '',
        chatId: this.config.telegram.chatId,
      },
      updatedAt: this.config.updatedAt,
    };
  }

  // Get full config (for server-side use)
  getFullConfig() {
    return this.config;
  }

  // Apply to environment (call after loading)
  applyToEnv() {
    // Apply API keys to process.env
    Object.entries(this.config.apiKeys).forEach(([key, value]) => {
      if (value && !process.env[key]) {
        process.env[key] = value;
        logger.info(`[SharedConfig] Applied ${key} to environment`);
      }
    });

    // Also update ai-client if needed
    const aiClient = require('./ai-client');
    this.updateAIClient(aiClient);
  }

  updateAIClient(aiClient) {
    // Update providers in ai-client
    const keys = this.config.apiKeys;
    
    if (keys.ANTHROPIC_API_KEY) {
      aiClient.providers.anthropic.enabled = true;
      aiClient.providers.anthropic.client.apiKey = keys.ANTHROPIC_API_KEY;
    }
    
    if (keys.ZHIPU_API_KEY) {
      aiClient.providers.zhipu.enabled = true;
      aiClient.providers.zhipu.apiKey = keys.ZHIPU_API_KEY;
    }
    
    if (keys.MOONSHOT_API_KEY) {
      aiClient.providers.moonshot.enabled = true;
      aiClient.providers.moonshot.apiKey = keys.MOONSHOT_API_KEY;
    }
    
    if (keys.DEEPSEEK_API_KEY) {
      aiClient.providers.deepseek.enabled = true;
      aiClient.providers.deepseek.apiKey = keys.DEEPSEEK_API_KEY;
    }

    logger.info('[SharedConfig] AI client updated with new API keys');
  }
}

// Singleton instance
const sharedConfig = new SharedConfig();

// Apply config to environment on load
sharedConfig.applyToEnv();

module.exports = sharedConfig;
