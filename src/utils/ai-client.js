/**
 * 🦉 Nigents - Multi-Provider AI Client
 * Supports Anthropic, Zhipu, Moonshot, and DeepSeek with comprehensive logging
 */

const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');
const logger = require('./logger');
const sharedConfig = require('./shared-config');

class AIClient {
  constructor() {
    this.requestLog = [];
    this.maxLogSize = 1000;
    
    // Initialize providers (will be updated with actual keys from shared config)
    this.refreshProviders();
    
    this.defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'anthropic';

    // Log API keys status on startup
    this.logAPIKeysStatus();
  }

  /**
   * Refresh provider configurations from shared config
   */
  refreshProviders() {
    const apiKeys = sharedConfig.getApiKeys();
    const config = sharedConfig.getFullConfig();
    
    this.providers = {
      anthropic: {
        name: 'Anthropic Claude',
        enabled: !!apiKeys.ANTHROPIC_API_KEY,
        apiKey: apiKeys.ANTHROPIC_API_KEY,
        client: apiKeys.ANTHROPIC_API_KEY ? new Anthropic({
          apiKey: apiKeys.ANTHROPIC_API_KEY,
        }) : null,
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        defaultModel: 'claude-3-5-sonnet-20241022',
      },
      zhipu: {
        name: 'Z.AI (Zhipu)',
        enabled: !!apiKeys.ZHIPU_API_KEY,
        apiKey: apiKeys.ZHIPU_API_KEY,
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
        models: ['glm-4', 'glm-4-flash', 'glm-4v'],
        defaultModel: 'glm-4',
      },
      moonshot: {
        name: 'Moonshot AI',
        enabled: !!apiKeys.MOONSHOT_API_KEY,
        apiKey: apiKeys.MOONSHOT_API_KEY,
        baseUrl: 'https://api.moonshot.ai/v1',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        defaultModel: 'moonshot-v1-8k',
      },
      deepseek: {
        name: 'DeepSeek',
        enabled: !!apiKeys.DEEPSEEK_API_KEY,
        apiKey: apiKeys.DEEPSEEK_API_KEY,
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-coder'],
        defaultModel: 'deepseek-chat',
      },
    };
    
    // Load custom models from shared config
    const customModels = config.customModels || {};
    for (const [key, model] of Object.entries(customModels)) {
      if (model.enabled && model.apiKey) {
        this.providers[key] = {
          name: model.name,
          enabled: true,
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          models: [model.model],
          defaultModel: model.model,
          isCustom: true,
        };
        logger.info(`[AIClient] Loaded custom provider: ${model.name} (${key})`);
      }
    }
    
    logger.info('[AIClient] Providers refreshed from shared config');
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    // Always refresh before checking
    this.refreshProviders();
    
    const available = {};
    for (const [key, provider] of Object.entries(this.providers)) {
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
   * Call Zhipu AI (GLM)
   */
  async callZhipu(prompt, options = {}) {
    this.refreshProviders();
    
    const provider = this.providers.zhipu;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

    if (!provider.apiKey) {
      throw new Error('Zhipu API key not configured');
    }

    logger.info(`[AIClient] Zhipu REQUEST:`, {
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
        provider: 'zhipu',
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
        provider: 'zhipu',
        model,
        usage: response.data.usage,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logRequest({
        provider: 'zhipu',
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
   * Call Moonshot AI (Kimi)
   */
  async callMoonshot(prompt, options = {}) {
    this.refreshProviders();
    
    const provider = this.providers.moonshot;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

    if (!provider.apiKey) {
      throw new Error('Moonshot API key not configured');
    }

    logger.info(`[AIClient] Moonshot REQUEST:`, {
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
    this.refreshProviders();
    
    const provider = this.providers[providerKey];
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
    // Refresh providers before each call
    this.refreshProviders();
    
    const provider = options.provider || this.defaultProvider;

    logger.info(`[AIClient] Calling ${provider}:`, {
      promptLength: prompt.length,
      model: options.model || 'default',
    });

    // Check if it's a custom provider
    if (this.providers[provider]?.isCustom) {
      return this.callCustom(provider, prompt, options);
    }

    switch (provider) {
      case 'anthropic':
        if (!this.providers.anthropic.enabled) {
          throw new Error('Anthropic API key not configured');
        }
        return this.callAnthropic(prompt, options);
      case 'zhipu':
        if (!this.providers.zhipu.enabled) {
          throw new Error('Zhipu API key not configured');
        }
        return this.callZhipu(prompt, options);
      case 'moonshot':
        if (!this.providers.moonshot.enabled) {
          throw new Error('Moonshot API key not configured');
        }
        return this.callMoonshot(prompt, options);
      case 'deepseek':
        if (!this.providers.deepseek.enabled) {
          throw new Error('DeepSeek API key not configured');
        }
        return this.callDeepseek(prompt, options);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Try calling with fallback providers
   */
  async callWithFallback(prompt, options = {}, fallbackProviders = ['anthropic', 'zhipu', 'moonshot']) {
    // Refresh providers before trying
    this.refreshProviders();
    
    const errors = [];

    for (const provider of fallbackProviders) {
      if (this.providers[provider]?.enabled) {
        try {
          logger.info(`[AIClient] Trying provider: ${provider}`);
          const result = await this.call(prompt, { ...options, provider });
          return result;
        } catch (error) {
          logger.warn(`[AIClient] Provider ${provider} failed:`, error.message);
          errors.push({ provider, error: error.message });
        }
      }
    }

    throw new Error(`All providers failed: ${JSON.stringify(errors)}`);
  }

  /**
   * Get the cheapest available provider for intent detection
   */
  getCheapestProvider() {
    // Refresh providers
    this.refreshProviders();
    
    if (this.providers.zhipu.enabled) return 'zhipu';
    if (this.providers.deepseek.enabled) return 'deepseek';
    if (this.providers.moonshot.enabled) return 'moonshot';
    return 'anthropic';
  }
}

// Singleton instance
const aiClient = new AIClient();

module.exports = aiClient;
