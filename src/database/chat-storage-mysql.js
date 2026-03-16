/**
 * Chat Storage - MySQL Implementation
 * Replaces JSON file storage with MySQL database
 */

const db = require('./connection');
const logger = require('../utils/logger');

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return typeof value === 'string' ? JSON.parse(value) : fallback;
  } catch (e) {
    return fallback;
  }
}

class ChatStorageMySQL {
  constructor() {
    this.initialized = false;
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      await db.initializePool();
      this.initialized = true;
      logger.info('[ChatStorageMySQL] Initialized');
    } catch (error) {
      logger.error('[ChatStorageMySQL] Initialization failed:', error.message);
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }

  // =====================================================
  // User Methods
  // =====================================================
  
  async createOrUpdateUser(userId, userData) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      await db.query(
        `INSERT INTO users (id, username, first_name, last_name, language_code, is_bot, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         first_name = VALUES(first_name),
         last_name = VALUES(last_name),
         language_code = VALUES(language_code),
         last_active_at = VALUES(last_active_at)`,
        [key, userData.username, userData.firstName, userData.lastName, 
         userData.languageCode, userData.isBot || false]
      );
      
      // Ensure user settings exist
      await db.query(
        `INSERT IGNORE INTO user_settings (user_id) VALUES (?)`,
        [key]
      );
      
      logger.info(`[ChatStorageMySQL] User ${key} created/updated`);
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to create/update user:', error);
      throw error;
    }
  }

  // =====================================================
  // Chat History Methods
  // =====================================================
  
  async addMessage(userId, role, content, metadata = {}) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      await db.query(
        `INSERT INTO chat_messages (user_id, role, content, metadata)
         VALUES (?, ?, ?, ?)`,
        [key, role, content, JSON.stringify(metadata)]
      );
      
      // Update user's last active
      await db.query(
        `UPDATE users SET last_active_at = NOW() WHERE id = ?`,
        [key]
      );
      
      // Keep only last 100 messages per user
      await db.query(
        `DELETE FROM chat_messages 
         WHERE user_id = ? 
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM chat_messages 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 100
           ) AS recent
         )`,
        [key, key]
      );
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to add message:', error);
    }
  }

  async getChatHistory(userId, limit = 20) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      const rows = await db.query(
        `SELECT role, content, metadata, created_at as timestamp
         FROM chat_messages
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [key, parseInt(limit)]
      );
      
      // Return in chronological order
      return rows.reverse().map(row => ({
        role: row.role,
        content: row.content,
        timestamp: new Date(row.timestamp).getTime(),
        ...parseJson(row.metadata, {}),
      }));
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to get chat history:', error);
      return [];
    }
  }

  async clearChatHistory(userId) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      await db.query(
        `DELETE FROM chat_messages WHERE user_id = ?`,
        [key]
      );
      logger.info(`[ChatStorageMySQL] Cleared chat history for user ${key}`);
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to clear chat history:', error);
    }
  }

  // =====================================================
  // Pending Plans Methods
  // =====================================================
  
  async setPendingPlan(userId, planData) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      // First, expire any existing pending plans for this user
      await db.query(
        `UPDATE pending_plans 
         SET status = 'expired' 
         WHERE user_id = ? AND status = 'pending'`,
        [key]
      );
      
      // Insert new plan
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      const result = await db.query(
        `INSERT INTO pending_plans 
         (user_id, task, chat_id, username, project_id, project_name, plan_data, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [key, planData.task, planData.chatId, planData.username, 
         planData.projectId, planData.projectName,
         JSON.stringify(planData), expiresAt]
      );
      
      logger.info(`[ChatStorageMySQL] Pending plan set for user ${key}: ${planData.task}`);
      return true;
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to set pending plan:', error);
      return false;
    }
  }

  async getPendingPlan(userId) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      const rows = await db.query(
        `SELECT id, user_id, task, chat_id, username, project_id, project_name, 
                plan_data, status, created_at, expires_at
         FROM pending_plans
         WHERE user_id = ? AND status = 'pending' AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [key]
      );
      
      if (rows.length === 0) {
        logger.info(`[ChatStorageMySQL] No pending plan found for user ${key}`);
        return null;
      }
      
      const row = rows[0];
      const plan = {
        id: row.id,
        task: row.task,
        chatId: row.chat_id,
        username: row.username,
        projectId: row.project_id,
        projectName: row.project_name,
        createdAt: new Date(row.created_at).getTime(),
        ...parseJson(row.plan_data, {}),
      };
      
      logger.info(`[ChatStorageMySQL] Found pending plan for user ${key}: ${plan.task}`);
      return plan;
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to get pending plan:', error);
      return null;
    }
  }

  async deletePendingPlan(userId) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      await db.query(
        `UPDATE pending_plans 
         SET status = 'approved', approved_at = NOW()
         WHERE user_id = ? AND status = 'pending'`,
        [key]
      );
      logger.info(`[ChatStorageMySQL] Deleted pending plan for user ${key}`);
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to delete pending plan:', error);
    }
  }

  async getAllPendingPlans() {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT user_id, task, chat_id, username, plan_data, created_at
         FROM pending_plans
         WHERE status = 'pending' AND expires_at > NOW()`
      );
      
      const plans = {};
      rows.forEach(row => {
        plans[row.user_id] = {
          task: row.task,
          chatId: row.chat_id,
          username: row.username,
          createdAt: new Date(row.created_at).getTime(),
          ...parseJson(row.plan_data, {}),
        };
      });
      
      return plans;
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to get all pending plans:', error);
      return {};
    }
  }

  // =====================================================
  // User Settings Methods
  // =====================================================
  
  async getUserSettings(userId) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      const rows = await db.query(
        `SELECT voice_response, language, default_project, preferred_ai, preferred_model
         FROM user_settings
         WHERE user_id = ?`,
        [key]
      );
      
      if (rows.length === 0) {
        return {
          voiceResponse: true,
          language: 'auto',
          defaultProject: null,
          preferredAI: null,
          preferredModel: null,
        };
      }
      
      const row = rows[0];
      return {
        voiceResponse: !!row.voice_response,
        language: row.language,
        defaultProject: row.default_project,
        preferredAI: row.preferred_ai,
        preferredModel: row.preferred_model,
      };
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to get user settings:', error);
      return {
        voiceResponse: true,
        language: 'auto',
        defaultProject: null,
        preferredAI: null,
        preferredModel: null,
      };
    }
  }

  async setUserSettings(userId, settings) {
    await this.ensureInitialized();
    const key = userId.toString();
    
    try {
      await db.query(
        `INSERT INTO user_settings 
         (user_id, voice_response, language, default_project, preferred_ai, preferred_model)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         voice_response = VALUES(voice_response),
         language = VALUES(language),
         default_project = VALUES(default_project),
         preferred_ai = VALUES(preferred_ai),
         preferred_model = VALUES(preferred_model)`,
        [key, 
         settings.voiceResponse !== undefined ? settings.voiceResponse : true,
         settings.language || 'auto',
         settings.defaultProject || null,
         settings.preferredAI || null,
         settings.preferredModel || null]
      );
      
      logger.info(`[ChatStorageMySQL] Updated settings for user ${key}`);
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to set user settings:', error);
    }
  }

  async toggleVoiceResponse(userId) {
    const settings = await this.getUserSettings(userId);
    const newValue = !settings.voiceResponse;
    await this.setUserSettings(userId, { voiceResponse: newValue });
    return newValue;
  }

  async setLanguage(userId, language) {
    await this.setUserSettings(userId, { language });
  }

  async getAllUserSettings() {
    await this.ensureInitialized();
    
    try {
      const rows = await db.query(
        `SELECT user_id, voice_response, language, default_project, preferred_ai, preferred_model
         FROM user_settings`
      );
      
      const settings = {};
      rows.forEach(row => {
        settings[row.user_id] = {
          voiceResponse: !!row.voice_response,
          language: row.language,
          defaultProject: row.default_project,
          preferredAI: row.preferred_ai,
          preferredModel: row.preferred_model,
        };
      });
      
      return settings;
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to get all user settings:', error);
      return {};
    }
  }

  // =====================================================
  // Stats/Debug Methods
  // =====================================================
  
  async getStats() {
    await this.ensureInitialized();
    
    try {
      const [users, messages, plans, settings] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM users'),
        db.query('SELECT COUNT(*) as count FROM chat_messages'),
        db.query(`SELECT COUNT(*) as count FROM pending_plans WHERE status = 'pending'`),
        db.query('SELECT COUNT(*) as count FROM user_settings'),
      ]);
      
      return {
        users: users[0].count,
        messages: messages[0].count,
        pendingPlans: plans[0].count,
        userSettings: settings[0].count,
        database: 'MySQL',
      };
    } catch (error) {
      logger.error('[ChatStorageMySQL] Failed to get stats:', error);
      return { error: error.message };
    }
  }
}

// Singleton instance
const chatStorageMySQL = new ChatStorageMySQL();

module.exports = chatStorageMySQL;
