/**
 * Shared Configuration - Sync API keys between dashboard and bot
 * Stores API keys in a file that both can access
 * Reloads from disk on every read to ensure consistency
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'shared-config.json');

logger.info(`[SharedConfig] Data directory: ${DATA_DIR}`);
logger.info(`[SharedConfig] Config file: ${CONFIG_FILE}`);

// Ensure data directory exists
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      logger.info(`[SharedConfig] Created data directory: ${DATA_DIR}`);
    }
  } catch (error) {
    logger.error(`[SharedConfig] Failed to create data directory:`, error);
  }
}

ensureDataDir();

// Default config - uses env vars as fallback
function getDefaultConfig() {
  return {
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
}

class SharedConfig {
  constructor() {
    // Always reload from disk to get latest
    this.config = this.loadConfig();
    
    logger.info('[SharedConfig] ============================================');
    logger.info('[SharedConfig] Initialized with API keys:', {
      openai: this.config.apiKeys.OPENAI_API_KEY ? 'SET' : 'NOT SET',
      customModels: (this.config.customModels && Object.keys(this.config.customModels).length) || 0,
    });
    logger.info('[SharedConfig] ============================================');
  }

  loadConfig() {
    try {
      ensureDataDir();
      
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        const loaded = JSON.parse(data);
        const defaults = getDefaultConfig();
        
        // Merge: file data takes precedence over env vars
        const merged = {
          ...defaults,
          ...loaded,
          apiKeys: {
            ...defaults.apiKeys,
            ...loaded.apiKeys,
          },
          gitlab: {
            ...defaults.gitlab,
            ...loaded.gitlab,
          },
          telegram: {
            ...defaults.telegram,
            ...loaded.telegram,
          },
        };
        
        logger.info('[SharedConfig] Loaded config from file');
        return merged;
      }
    } catch (error) {
      logger.error('[SharedConfig] Failed to load config:', error);
    }
    
    logger.info('[SharedConfig] Using default config (env vars)');
    return getDefaultConfig();
  }

  // Always reload from disk before returning config
  getConfig() {
    return this.loadConfig();
  }

  saveConfig(configToSave = null) {
    try {
      ensureDataDir();
      
      const config = configToSave || this.config;
      config.updatedAt = new Date().toISOString();
      
      // Atomic write
      const tempFile = `${CONFIG_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(config, null, 2));
      fs.renameSync(tempFile, CONFIG_FILE);
      
      this.config = config;
      logger.info('[SharedConfig] Config saved successfully');
      return true;
    } catch (error) {
      logger.error('[SharedConfig] Failed to save config:', error);
      return false;
    }
  }

  // API Keys - always reload from disk
  getApiKeys() {
    const config = this.loadConfig();
    return config.apiKeys;
  }

  setApiKey(name, value) {
    const config = this.loadConfig();
    config.apiKeys[name] = value;
    this.config = config;
    this.saveConfig();
    logger.info(`[SharedConfig] API key ${name} updated`);
    
    // Apply immediately
    this.applyToEnv();
  }

  updateApiKeys(keys) {
    const config = this.loadConfig();
    config.apiKeys = { ...config.apiKeys, ...keys };
    this.config = config;
    this.saveConfig();
    logger.info('[SharedConfig] Multiple API keys updated:', Object.keys(keys));
    
    // Apply immediately
    this.applyToEnv();
  }

  // Get sanitized config (for frontend - hides full keys)
  getSanitizedConfig() {
    const config = this.loadConfig();
    
    return {
      apiKeys: {
        ANTHROPIC_API_KEY: config.apiKeys.ANTHROPIC_API_KEY ? 'SET' : '',
        ZHIPU_API_KEY: config.apiKeys.ZHIPU_API_KEY ? 'SET' : '',
        MOONSHOT_API_KEY: config.apiKeys.MOONSHOT_API_KEY ? 'SET' : '',
        DEEPSEEK_API_KEY: config.apiKeys.DEEPSEEK_API_KEY ? 'SET' : '',
        OPENAI_API_KEY: config.apiKeys.OPENAI_API_KEY ? 'SET' : '',
      },
      gitlab: {
        token: config.gitlab.token ? 'SET' : '',
        namespace: config.gitlab.namespace,
        url: config.gitlab.url,
      },
      telegram: {
        botToken: config.telegram.botToken ? 'SET' : '',
        chatId: config.telegram.chatId,
      },
      updatedAt: config.updatedAt,
    };
  }

  // Get full config (for server-side use)
  getFullConfig() {
    return this.loadConfig();
  }

  // Get custom models/providers
  getCustomProviders() {
    const config = this.loadConfig();
    return config.customModels || {};
  }

  // Apply to environment - call this after loading
  applyToEnv() {
    const config = this.loadConfig();
    let applied = 0;
    
    // Apply API keys to process.env
    Object.entries(config.apiKeys).forEach(([key, value]) => {
      if (value) {
        process.env[key] = value;
        applied++;
      }
    });

    // Apply GitLab config
    if (config.gitlab.token) {
      process.env.GITLAB_TOKEN = config.gitlab.token;
      applied++;
    }
    if (config.gitlab.namespace) {
      process.env.GITLAB_NAMESPACE = config.gitlab.namespace;
      applied++;
    }

    logger.info(`[SharedConfig] Applied ${applied} config values to environment`);
    
    // Update ai-client if available (lazy load to avoid circular dependency)
    try {
      // Use setImmediate to break circular dependency chain
      setImmediate(() => {
        try {
          const aiClient = require('./ai-client');
          if (aiClient && aiClient.refreshProviders) {
            aiClient.refreshProviders();
            logger.info('[SharedConfig] AI client refreshed with new config');
          }
        } catch (err) {
          logger.warn('[SharedConfig] Could not refresh AI client:', err.message);
        }
      });
    } catch (e) {
      logger.warn('[SharedConfig] Could not schedule AI client update:', e.message);
    }
  }
  
  // Force reload from disk
  reload() {
    this.config = this.loadConfig();
    this.applyToEnv();
    logger.info('[SharedConfig] Config reloaded from disk');
    return this.config;
  }
}

// Singleton instance
const sharedConfig = new SharedConfig();

// Apply config to environment on load
sharedConfig.applyToEnv();

module.exports = sharedConfig;
