/**
 * Agent Configuration - MySQL Implementation
 * Stores and retrieves agent AI model configurations from database
 */

const db = require('./connection');
const logger = require('../utils/logger');

class AgentConfigMySQL {
  constructor() {
    this.initialized = false;
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      await db.initializePool();
      await this.runMigrations();
      this.initialized = true;
      logger.info('[AgentConfigMySQL] Initialized');
    } catch (error) {
      logger.error('[AgentConfigMySQL] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations() {
    try {
      // Drop foreign key constraints to support custom provider keys
      const constraints = await db.query(`
        SELECT CONSTRAINT_NAME, COLUMN_NAME 
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'agent_configurations' 
        AND TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `);

      for (const constraint of constraints) {
        try {
          await db.query(`ALTER TABLE agent_configurations DROP FOREIGN KEY ${constraint.CONSTRAINT_NAME}`);
          logger.info(`[AgentConfigMySQL] Dropped FK constraint: ${constraint.CONSTRAINT_NAME}`);
        } catch (dropError) {
          logger.warn(`[AgentConfigMySQL] Failed to drop FK ${constraint.CONSTRAINT_NAME}:`, dropError.message);
        }
      }

      // Alter columns to support longer custom provider keys
      await db.query(`
        ALTER TABLE agent_configurations 
        MODIFY COLUMN provider_id VARCHAR(100),
        MODIFY COLUMN model_id VARCHAR(100),
        MODIFY COLUMN fallback_provider_id VARCHAR(100),
        MODIFY COLUMN fallback_model_id VARCHAR(100)
      `);

      logger.info('[AgentConfigMySQL] Migrations completed - custom provider keys supported');
    } catch (error) {
      logger.error('[AgentConfigMySQL] Migration error:', error.message);
      // Don't throw - let it continue even if migrations fail
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }

  /**
   * Get all agent configurations
   */
  async getAllAgents() {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(`
        SELECT 
          ac.agent_name,
          ac.display_name,
          ac.role,
          ac.provider_id,
          ap.name as provider_name,
          ac.model_id,
          am.name as model_name,
          ac.fallback_provider_id,
          ac.fallback_model_id,
          ac.max_tokens,
          ac.system_message,
          ac.enabled
        FROM agent_configurations ac
        LEFT JOIN ai_providers ap ON ac.provider_id = ap.id
        LEFT JOIN ai_models am ON ac.model_id = am.id
        WHERE ac.enabled = TRUE
      `);
      
      const agents = {};
      for (const row of rows) {
        agents[row.agent_name] = {
          name: row.agent_name,
          displayName: row.display_name,
          role: row.role,
          provider: row.provider_id,
          providerName: row.provider_name,
          model: row.model_id,
          modelName: row.model_name,
          fallbackProvider: row.fallback_provider_id,
          fallbackModel: row.fallback_model_id,
          maxTokens: row.max_tokens,
          systemMessage: row.system_message,
          enabled: row.enabled,
        };
      }
      
      return agents;
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to get all agents:', error);
      return {};
    }
  }

  /**
   * Get global default configuration
   */
  async getGlobalDefaults() {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(`
        SELECT config_key, config_value 
        FROM global_config 
        WHERE config_key IN ('default_provider', 'default_model', 'fallback_provider', 'fallback_model')
      `);
      
      const defaults = {
        defaultProvider: 'zhipuglm5',
        fallbackProvider: 'zhipuglm5',
      };
      
      for (const row of rows) {
        switch (row.config_key) {
          case 'default_provider':
            defaults.defaultProvider = row.config_value;
            break;
          case 'default_model':
            defaults.defaultModel = row.config_value;
            break;
          case 'fallback_provider':
            defaults.fallbackProvider = row.config_value;
            break;
          case 'fallback_model':
            defaults.fallbackModel = row.config_value;
            break;
        }
      }
      
      return defaults;
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to get global defaults:', error);
      return {
        defaultProvider: 'zhipuglm5',
        fallbackProvider: 'zhipuglm5',
      };
    }
  }

  /**
   * Get single agent configuration
   */
  async getAgentConfig(agentName) {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(`
        SELECT 
          ac.*,
          ap.name as provider_name,
          am.name as model_name
        FROM agent_configurations ac
        LEFT JOIN ai_providers ap ON ac.provider_id = ap.id
        LEFT JOIN ai_models am ON ac.model_id = am.id
        WHERE ac.agent_name = ?
      `, [agentName]);
      
      if (rows.length === 0) {
        return null;
      }
      
      const row = rows[0];
      return {
        name: row.agent_name,
        displayName: row.display_name,
        role: row.role,
        provider: row.provider_id,
        providerName: row.provider_name,
        model: row.model_id,
        modelName: row.model_name,
        fallbackProvider: row.fallback_provider_id,
        fallbackModel: row.fallback_model_id,
        maxTokens: row.max_tokens,
        systemMessage: row.system_message,
        enabled: row.enabled,
      };
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to get agent config:', error);
      return null;
    }
  }

  /**
   * Set agent provider and model
   */
  async setAgentModel(agentName, provider, model) {
    await this.ensureInitialized();
    
    try {
      const result = await db.query(`
        UPDATE agent_configurations 
        SET provider_id = ?, model_id = ?, updated_at = NOW()
        WHERE agent_name = ?
      `, [provider, model, agentName]);
      
      if (result.affectedRows === 0) {
        logger.warn(`[AgentConfigMySQL] No rows updated for ${agentName}, agent may not exist`);
        return false;
      }
      
      logger.info(`[AgentConfigMySQL] Updated ${agentName}: ${provider}/${model} (affectedRows: ${result.affectedRows})`);
      return true;
    } catch (error) {
      logger.error(`[AgentConfigMySQL] Failed to set ${agentName} to ${provider}/${model}:`, error.message);
      return false;
    }
  }

  /**
   * Set global defaults
   */
  async setGlobalDefaults(provider, model) {
    await this.ensureInitialized();
    
    try {
      if (provider) {
        await db.query(`
          INSERT INTO global_config (config_key, config_value) 
          VALUES ('default_provider', ?)
          ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
        `, [provider]);
      }
      
      if (model) {
        await db.query(`
          INSERT INTO global_config (config_key, config_value) 
          VALUES ('default_model', ?)
          ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)
        `, [model]);
      }
      
      logger.info(`[AgentConfigMySQL] Updated global defaults: ${provider}/${model}`);
      return true;
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to set global defaults:', error);
      return false;
    }
  }

  /**
   * Get available providers
   */
  async getAvailableProviders() {
    await this.ensureInitialized();
    
    try {
      const providers = await db.query(`
        SELECT id, name, description, enabled
        FROM ai_providers
        ORDER BY name
      `);
      
      const result = {};
      for (const p of providers) {
        const models = await db.query(`
          SELECT id, name, max_tokens
          FROM ai_models
          WHERE provider_id = ? AND enabled = TRUE
          ORDER BY name
        `, [p.id]);
        
        result[p.id] = {
          name: p.name,
          description: p.description,
          enabled: p.enabled,
          models: models.map(m => m.id),
        };
      }
      
      return result;
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to get providers:', error);
      return {};
    }
  }

  /**
   * Add or update an AI provider
   */
  async upsertProvider(id, name, description, baseUrl, enabled = true) {
    await this.ensureInitialized();
    
    try {
      await db.query(`
        INSERT INTO ai_providers (id, name, description, base_url, enabled)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          name = VALUES(name),
          description = VALUES(description),
          base_url = VALUES(base_url),
          enabled = VALUES(enabled)
      `, [id, name, description, baseUrl, enabled]);
      
      return true;
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to upsert provider:', error);
      return false;
    }
  }

  /**
   * Add or update an AI model
   */
  async upsertModel(id, providerId, name, description, maxTokens = 4096) {
    await this.ensureInitialized();
    
    try {
      await db.query(`
        INSERT INTO ai_models (id, provider_id, name, description, max_tokens)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          name = VALUES(name),
          description = VALUES(description),
          max_tokens = VALUES(max_tokens)
      `, [id, providerId, name, description, maxTokens]);
      
      return true;
    } catch (error) {
      logger.error('[AgentConfigMySQL] Failed to upsert model:', error);
      return false;
    }
  }
}

// Singleton instance
const agentConfigMySQL = new AgentConfigMySQL();

module.exports = agentConfigMySQL;
