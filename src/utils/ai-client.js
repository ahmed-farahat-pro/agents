/**
 * 🦉 Nigents - Multi-Provider AI Client
 * Only custom models (from dashboard). OpenAI is used separately for voice (Whisper).
 */

const axios = require('axios');
const logger = require('./logger');
const sharedConfig = require('./shared-config');

class AIClient {
  constructor() {
    this.requestLog = [];
    this.maxLogSize = 1000;

    this.refreshProviders();
    const agentsConfig = this.loadAgentsConfig();
    const configDefault = process.env.DEFAULT_AI_PROVIDER || agentsConfig?.global?.defaultProvider || 'zhipuglm5';
    this.defaultProvider = this.providers[configDefault]?.enabled ? configDefault : this.getFirstEnabledProvider();
    this.defaultModel = agentsConfig?.global?.defaultModel || null;

    logger.info(`[AIClient] Default provider: ${this.defaultProvider}${this.defaultModel ? ` (${this.defaultModel})` : ''}`);
    this.logAPIKeysStatus();
  }

  getFirstEnabledProvider() {
    const key = Object.keys(this.providers).find(k => this.providers[k]?.enabled && k !== 'custom');
    return key || this.providers.custom ? 'custom' : null;
  }

  /**
   * Load agents config from agents.json
   */
  loadAgentsConfig() {
    try {
      return require('../../config/agents.json');
    } catch (error) {
      logger.warn('[AIClient] Could not load agents.json:', error.message);
      return null;
    }
  }

  /**
   * Build providers map from a config (for per-user config).
   * @param {{ customModels?: object, apiKeys?: object }} config
   * @returns {object} providers map same shape as this.providers
   */
  getProvidersFromConfig(config) {
    const customModels = (config && config.customModels) ? config.customModels : {};
    const providers = {};
    let firstCustomKey = null;
    for (const [key, model] of Object.entries(customModels)) {
      if (model.enabled && model.apiKey) {
        providers[key] = {
          name: model.name,
          enabled: true,
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          models: [model.model],
          defaultModel: model.model,
          isCustom: true,
        };
        if (firstCustomKey === null) firstCustomKey = key;
      }
    }
    if (firstCustomKey) providers.custom = providers[firstCustomKey];
    return providers;
  }

  /**
   * Refresh provider configurations – only custom models from dashboard
   */
  refreshProviders() {
    const config = sharedConfig.getFullConfig();
    this.providers = this.getProvidersFromConfig(config);
    logger.info('[AIClient] Providers refreshed (custom only)');
  }

  /**
   * Get available providers (optionally from a specific config, e.g. per-user).
   * @param {{ customModels?: object } | null} config - If provided, use this config instead of shared.
   */
  getAvailableProviders(config = null) {
    const providers = config ? this.getProvidersFromConfig(config) : (this.refreshProviders(), this.providers);
    const available = {};
    for (const [key, provider] of Object.entries(providers)) {
      available[key] = {
        name: provider.name,
        enabled: provider.enabled,
        models: provider.models,
        defaultModel: provider.defaultModel,
      };
    }
    return available;
  }

  /**
   * Get available models for a specific provider
   */
  getAvailableModels(providerName) {
    this.refreshProviders();
    
    const provider = this.providers[providerName];
    if (!provider || !provider.enabled) {
      return [];
    }
    
    return provider.models || [];
  }

  /**
   * Get API keys status - shows which providers are ready to use
   */
  getAPIKeysStatus() {
    // Refresh from shared config
    this.refreshProviders();
    
    const status = {
      timestamp: new Date().toISOString(),
      providers: {},
      ready: [],
      notReady: [],
    };

    for (const [key, provider] of Object.entries(this.providers)) {
      const isReady = provider.enabled && provider.apiKey;
      status.providers[key] = {
        name: provider.name,
        enabled: provider.enabled,
        hasApiKey: !!provider.apiKey,
        baseUrl: provider.baseUrl,
        ready: isReady,
      };

      if (isReady) {
        status.ready.push({
          key,
          name: provider.name,
          model: provider.defaultModel,
          baseUrl: provider.baseUrl,
        });
      } else {
        status.notReady.push({
          key,
          name: provider.name,
          reason: !provider.enabled ? 'API key not set' : 'API key is empty',
        });
      }
    }

    status.summary = `${status.ready.length}/${Object.keys(this.providers).length} providers ready`;
    
    return status;
  }

  /**
   * Print API keys status to console/logs
   */
  logAPIKeysStatus() {
    const status = this.getAPIKeysStatus();
    
    logger.info('========================================');
    logger.info('  AI API KEYS STATUS');
    logger.info('========================================');
    logger.info(status.summary);
    logger.info('');
    
    if (status.ready.length > 0) {
      logger.info('  READY TO USE:');
      status.ready.forEach(p => {
        logger.info(`    [OK] ${p.name} (${p.key})`);
        logger.info(`         Model: ${p.model}`);
        logger.info(`         URL: ${p.baseUrl}`);
      });
    }
    
    if (status.notReady.length > 0) {
      logger.info('');
      logger.info('  NOT CONFIGURED:');
      status.notReady.forEach(p => {
        logger.info(`    [MISSING] ${p.name} (${p.key}): ${p.reason}`);
      });
    }
    
    logger.info('========================================');
    
    return status;
  }

  /**
   * Log API request/response
   */
  logRequest(data) {
    const logEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      timestamp: new Date().toISOString(),
      ...data,
    };

    this.requestLog.unshift(logEntry);
    
    // Trim log if too large
    if (this.requestLog.length > this.maxLogSize) {
      this.requestLog = this.requestLog.slice(0, this.maxLogSize);
    }

    // Also log to logger
    if (data.error) {
      logger.error(`[AIClient] ${data.provider} ${data.model} ERROR:`, {
        error: data.error,
        duration: data.duration,
        promptLength: data.promptLength,
      });
    } else {
      logger.info(`[AIClient] ${data.provider} ${data.model} SUCCESS:`, {
        duration: data.duration,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        promptLength: data.promptLength,
        responseLength: data.responseLength,
      });
    }

    return logEntry;
  }

  /**
   * Get recent request logs
   */
  getLogs(limit = 100, provider = null) {
    let logs = this.requestLog;
    if (provider) {
      logs = logs.filter(l => l.provider === provider);
    }
    return logs.slice(0, limit);
  }

  /**
   * Call Anthropic Claude
   */
  async callAnthropic(prompt, options = {}) {
    // Refresh providers to get latest API key
    this.refreshProviders();
    
    const provider = this.providers.anthropic;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

    if (!provider.client) {
      throw new Error('Anthropic API key not configured');
    }

    logger.info(`[AIClient] Anthropic REQUEST:`, {
      model,
      promptLength: prompt.length,
      maxTokens: options.maxTokens || 4096,
    });

    try {
      const response = await provider.client.messages.create({
        model: model,
        max_tokens: options.maxTokens || 4096,
        system: options.systemMessage || '',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7,
      });

      const duration = Date.now() - startTime;
      const content = response.content[0].text;

      this.logRequest({
        provider: 'anthropic',
        model,
        operation: 'chat.completion',
        status: 'success',
        duration,
        promptLength: prompt.length,
        responseLength: content.length,
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      });

      return {
        success: true,
        content,
        provider: 'anthropic',
        model,
        usage: response.usage,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logRequest({
        provider: 'anthropic',
        model,
        operation: 'chat.completion',
        status: 'error',
        duration,
        promptLength: prompt.length,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Call Moonshot AI (Kimi)
   */
  async callMoonshot(prompt, options = {}) {
    this.refreshProviders();
    
    const provider = this.providers.moonshot;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

    if (!provider.apiKey) {
      logger.error('[AIClient] Moonshot API key is empty!');
      throw new Error('Moonshot API key not configured');
    }

    // Debug: log first/last 4 chars of key to verify it's loaded
    const keyPreview = `${provider.apiKey.substring(0, 4)}...${provider.apiKey.substring(provider.apiKey.length - 4)}`;
    logger.info(`[AIClient] Moonshot REQUEST (key: ${keyPreview}):`, {
      model,
      promptLength: prompt.length,
    });

    try {
      const response = await axios.post(
        `${provider.baseUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: options.systemMessage || 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 4096,
        },
        {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const duration = Date.now() - startTime;
      const content = response.data.choices[0].message.content;

      this.logRequest({
        provider: 'moonshot',
        model,
        operation: 'chat.completion',
        status: 'success',
        duration,
        promptLength: prompt.length,
        responseLength: content.length,
        promptTokens: response.data.usage?.prompt_tokens || 0,
        completionTokens: response.data.usage?.completion_tokens || 0,
        totalTokens: response.data.usage?.total_tokens || 0,
      });

      return {
        success: true,
        content,
        provider: 'moonshot',
        model,
        usage: response.data.usage,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logRequest({
        provider: 'moonshot',
        model,
        operation: 'chat.completion',
        status: 'error',
        duration,
        promptLength: prompt.length,
        error: error.response?.data?.error?.message || error.message,
      });

      throw error;
    }
  }

  /**
   * Call DeepSeek
   */
  async callDeepseek(prompt, options = {}) {
    this.refreshProviders();
    
    const provider = this.providers.deepseek;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

    if (!provider.apiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    logger.info(`[AIClient] DeepSeek REQUEST:`, {
      model,
      promptLength: prompt.length,
    });

    try {
      const response = await axios.post(
        `${provider.baseUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: options.systemMessage || 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 4096,
        },
        {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const duration = Date.now() - startTime;
      const content = response.data.choices[0].message.content;

      this.logRequest({
        provider: 'deepseek',
        model,
        operation: 'chat.completion',
        status: 'success',
        duration,
        promptLength: prompt.length,
        responseLength: content.length,
        promptTokens: response.data.usage?.prompt_tokens || 0,
        completionTokens: response.data.usage?.completion_tokens || 0,
        totalTokens: response.data.usage?.total_tokens || 0,
      });

      return {
        success: true,
        content,
        provider: 'deepseek',
        model,
        usage: response.data.usage,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logRequest({
        provider: 'deepseek',
        model,
        operation: 'chat.completion',
        status: 'error',
        duration,
        promptLength: prompt.length,
        error: error.response?.data?.error?.message || error.message,
      });

      throw error;
    }
  }

  /**
   * Call custom provider (OpenAI-compatible API)
   */
  async callCustom(providerKey, prompt, options = {}) {
    const providers = options._providers || (this.refreshProviders(), this.providers);
    const provider = providers[providerKey];
    if (!provider || !provider.enabled) {
      throw new Error(`Custom provider ${providerKey} not available`);
    }

    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

    logger.info(`[AIClient] Custom provider ${providerKey} REQUEST:`, {
      model,
      baseUrl: provider.baseUrl,
      promptLength: prompt.length,
    });

    try {
      const response = await axios.post(
        `${provider.baseUrl}/chat/completions`,
        {
          model,
          messages: [
            { role: 'system', content: options.systemMessage || 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 4096,
        },
        {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const duration = Date.now() - startTime;
      const content = response.data.choices[0].message.content;

      this.logRequest({
        provider: providerKey,
        model,
        operation: 'chat.completion',
        status: 'success',
        duration,
        promptLength: prompt.length,
        responseLength: content.length,
        promptTokens: response.data.usage?.prompt_tokens || 0,
        completionTokens: response.data.usage?.completion_tokens || 0,
        totalTokens: response.data.usage?.total_tokens || 0,
      });

      return {
        success: true,
        content,
        provider: providerKey,
        model,
        usage: response.data.usage,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logRequest({
        provider: providerKey,
        model,
        operation: 'chat.completion',
        status: 'error',
        duration,
        promptLength: prompt.length,
        error: error.response?.data?.error?.message || error.message,
      });

      throw error;
    }
  }

  /**
   * Call AI with specified provider or default
   */
  async call(prompt, options = {}) {
    const userConfig = options.userConfig;
    const effectiveProviders = userConfig
      ? this.getProvidersFromConfig(userConfig)
      : (this.refreshProviders(), this.providers);

    const getFirst = () => {
      const k = Object.keys(effectiveProviders).find(key => effectiveProviders[key]?.enabled && key !== 'custom');
      return k || (effectiveProviders.custom ? 'custom' : null);
    };
    const defaultProvider = options.provider || this.defaultProvider;
    const provider = effectiveProviders[defaultProvider]?.enabled ? defaultProvider : getFirst();
    const model = options.model || this.defaultModel || (effectiveProviders[provider]?.defaultModel);

    const resolvedOptions = { ...options, provider, model, _providers: effectiveProviders };

    logger.info(`[AIClient] Calling ${provider}:`, {
      promptLength: prompt.length,
      model: model || 'default',
    });

    if (effectiveProviders[provider]?.enabled) {
      return this.callCustom(provider, prompt, resolvedOptions);
    }
    const fallback = getFirst();
    if (fallback && fallback !== provider) {
      logger.info(`[AIClient] Provider ${provider} not available, using ${fallback}`);
      return this.call(prompt, { ...options, provider: fallback, userConfig });
    }
    const available = Object.keys(effectiveProviders).filter(k => effectiveProviders[k].enabled).join(', ');
    throw new Error(`No AI provider available. Configure a custom model in the dashboard. Available: ${available || 'none'}`);
  }

  /**
   * Try calling with fallback providers (only enabled custom providers)
   */
  async callWithFallback(prompt, options = {}, fallbackProviders = null) {
    const effectiveProviders = options.userConfig
      ? this.getProvidersFromConfig(options.userConfig)
      : (this.refreshProviders(), this.providers);
    const toTry = fallbackProviders && fallbackProviders.length > 0
      ? fallbackProviders
      : Object.keys(effectiveProviders).filter(k => effectiveProviders[k]?.enabled);
    const errors = [];

    for (const provider of toTry) {
      if (effectiveProviders[provider]?.enabled) {
        try {
          logger.info(`[AIClient] Trying provider: ${provider}`);
          return await this.call(prompt, { ...options, provider });
        } catch (error) {
          logger.warn(`[AIClient] Provider ${provider} failed:`, error.message);
          errors.push({ provider, error: error.message });
        }
      }
    }

    throw new Error(`All providers failed: ${JSON.stringify(errors)}`);
  }

  getCheapestProvider() {
    this.refreshProviders();
    return this.getFirstEnabledProvider();
  }
}

// Singleton instance
const aiClient = new AIClient();

module.exports = aiClient;
