/**
 * 🦉 Nigents - Multi-Provider AI Client
 * Supports Anthropic, Zhipu, Moonshot, and DeepSeek with comprehensive logging
 */

const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');
const logger = require('./logger');

class AIClient {
  constructor() {
    this.providers = {
      anthropic: {
        name: 'Anthropic Claude',
        enabled: !!process.env.ANTHROPIC_API_KEY,
        client: process.env.ANTHROPIC_API_KEY ? new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        }) : null,
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        defaultModel: 'claude-3-5-sonnet-20241022',
      },
      zhipu: {
        name: 'Zhipu AI',
        enabled: !!process.env.ZHIPU_API_KEY,
        apiKey: process.env.ZHIPU_API_KEY,
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        models: ['glm-4', 'glm-4-flash', 'glm-4v'],
        defaultModel: 'glm-4',
      },
      moonshot: {
        name: 'Moonshot AI',
        enabled: !!process.env.MOONSHOT_API_KEY,
        apiKey: process.env.MOONSHOT_API_KEY,
        baseUrl: 'https://api.moonshot.cn/v1',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        defaultModel: 'moonshot-v1-8k',
      },
      deepseek: {
        name: 'DeepSeek',
        enabled: !!process.env.DEEPSEEK_API_KEY,
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-coder'],
        defaultModel: 'deepseek-chat',
      },
    };

    this.defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'anthropic';
    this.requestLog = [];
    this.maxLogSize = 1000;

    logger.info('[AIClient] Initialized with providers:', {
      anthropic: this.providers.anthropic.enabled,
      zhipu: this.providers.zhipu.enabled,
      moonshot: this.providers.moonshot.enabled,
      deepseek: this.providers.deepseek.enabled,
    });
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
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
    const provider = this.providers.anthropic;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

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
    const provider = this.providers.zhipu;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

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
    const provider = this.providers.moonshot;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

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
    const provider = this.providers.deepseek;
    const model = options.model || provider.defaultModel;
    const startTime = Date.now();

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
   * Call AI with specified provider or default
   */
  async call(prompt, options = {}) {
    const provider = options.provider || this.defaultProvider;

    logger.info(`[AIClient] Calling ${provider}:`, {
      promptLength: prompt.length,
      model: options.model || 'default',
    });

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
}

// Singleton instance
const aiClient = new AIClient();

module.exports = aiClient;
