/**
 * Chat Storage - Persistent storage for chat history, pending plans, and user settings
 * Uses synchronous writes to ensure data is persisted immediately
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Use absolute path for data directory - make sure it's outside the git repo if possible
// or ensure it's properly ignored by git
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const CHAT_HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');
const PENDING_PLANS_FILE = path.join(DATA_DIR, 'pending-plans.json');
const USER_SETTINGS_FILE = path.join(DATA_DIR, 'user-settings.json');

logger.info(`[ChatStorage] ========================================`);
logger.info(`[ChatStorage] Data directory: ${DATA_DIR}`);
logger.info(`[ChatStorage] Pending plans file: ${PENDING_PLANS_FILE}`);
logger.info(`[ChatStorage] ========================================`);

// Ensure data directory exists
function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      logger.info(`[ChatStorage] Created data directory: ${DATA_DIR}`);
    }
  } catch (error) {
    logger.error(`[ChatStorage] Failed to create data directory:`, error);
    throw error;
  }
}

ensureDataDir();

class ChatStorage {
  constructor() {
    this.chatHistory = this.loadData(CHAT_HISTORY_FILE, {});
    this.pendingPlans = this.loadData(PENDING_PLANS_FILE, {});
    this.userSettings = this.loadData(USER_SETTINGS_FILE, {});
    
    logger.info(`[ChatStorage] Loaded ${Object.keys(this.pendingPlans).length} pending plans`);
    logger.info(`[ChatStorage] Loaded ${Object.keys(this.chatHistory).length} chat histories`);
    logger.info(`[ChatStorage] Loaded ${Object.keys(this.userSettings).length} user settings`);
    
    // Log each pending plan for debugging
    Object.entries(this.pendingPlans).forEach(([key, plan]) => {
      logger.info(`[ChatStorage] Pending plan - User ${key}: ${plan.task}`);
    });
    
    // Save immediately to ensure files exist
    this.saveAll();
    
    // Auto-save every 5 seconds (more frequent)
    setInterval(() => this.saveAll(), 5000);
  }

  loadData(filePath, defaultValue) {
    try {
      ensureDataDir();
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        if (!data || data.trim() === '') {
          logger.warn(`[ChatStorage] Empty file: ${filePath}`);
          return defaultValue;
        }
        const parsed = JSON.parse(data);
        logger.info(`[ChatStorage] Loaded ${filePath}: ${Object.keys(parsed).length} entries`);
        return parsed;
      }
    } catch (error) {
      logger.error(`[ChatStorage] Failed to load ${filePath}:`, error);
    }
    logger.info(`[ChatStorage] Using default value for ${filePath}`);
    return defaultValue;
  }

  saveData(filePath, data) {
    try {
      ensureDataDir();
      
      // Write to temp file first, then rename for atomic operation
      const tempFile = `${filePath}.tmp`;
      const jsonData = JSON.stringify(data, null, 2);
      
      // Synchronous write to ensure data is persisted
      fs.writeFileSync(tempFile, jsonData, 'utf8');
      fs.renameSync(tempFile, filePath);
      
      // Verify the write
      if (fs.existsSync(filePath)) {
        const verify = fs.readFileSync(filePath, 'utf8');
        if (verify === jsonData) {
          return true;
        } else {
          logger.error(`[ChatStorage] Verification failed for ${filePath}`);
          return false;
        }
      }
      return false;
    } catch (error) {
      logger.error(`[ChatStorage] Failed to save ${filePath}:`, error);
      return false;
    }
  }

  saveAll() {
    try {
      this.saveData(CHAT_HISTORY_FILE, this.chatHistory);
      this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
      this.saveData(USER_SETTINGS_FILE, this.userSettings);
    } catch (error) {
      logger.error('[ChatStorage] Failed to save all data:', error);
    }
  }

  // Chat History Methods
  addMessage(userId, role, content, metadata = {}) {
    try {
      const key = userId.toString();
      if (!this.chatHistory[key]) {
        this.chatHistory[key] = [];
      }
      
      this.chatHistory[key].push({
        role,
        content,
        timestamp: Date.now(),
        ...metadata,
      });

      // Keep only last 100 messages per user
      if (this.chatHistory[key].length > 100) {
        this.chatHistory[key] = this.chatHistory[key].slice(-100);
      }

      // Save immediately
      this.saveData(CHAT_HISTORY_FILE, this.chatHistory);
    } catch (error) {
      logger.error('[ChatStorage] Failed to add message:', error);
    }
  }

  getChatHistory(userId, limit = 20) {
    const key = userId.toString();
    const history = this.chatHistory[key] || [];
    return history.slice(-limit);
  }

  clearChatHistory(userId) {
    const key = userId.toString();
    delete this.chatHistory[key];
    this.saveData(CHAT_HISTORY_FILE, this.chatHistory);
    logger.info(`[ChatStorage] Cleared chat history for user ${key}`);
  }

  // Pending Plans Methods
  setPendingPlan(userId, planData) {
    try {
      const key = userId.toString();
      this.pendingPlans[key] = {
        ...planData,
        createdAt: Date.now(),
      };
      
      logger.info(`[ChatStorage] Setting pending plan for user ${key}: ${planData.task}`);
      
      // Save immediately and verify
      const saved = this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
      
      if (saved) {
        // Verify by reading back
        const verify = this.getPendingPlan(userId);
        if (verify) {
          logger.info(`[ChatStorage] Pending plan saved and verified for user ${key}`);
        } else {
          logger.error(`[ChatStorage] FAILED TO VERIFY pending plan for user ${key}`);
        }
      } else {
        logger.error(`[ChatStorage] FAILED TO SAVE pending plan for user ${key}`);
      }
    } catch (error) {
      logger.error('[ChatStorage] Failed to set pending plan:', error);
    }
  }

  getPendingPlan(userId) {
    try {
      // Reload from disk to ensure we have latest data
      this.pendingPlans = this.loadData(PENDING_PLANS_FILE, {});
      
      const key = userId.toString();
      const plan = this.pendingPlans[key];
      
      if (!plan) {
        logger.info(`[ChatStorage] No pending plan found for user ${key}`);
        return null;
      }
      
      // Check if plan is expired (24 hours)
      const age = Date.now() - plan.createdAt;
      const maxAge = 24 * 60 * 60 * 1000;
      
      if (age > maxAge) {
        logger.info(`[ChatStorage] Plan expired for user ${key}, age: ${Math.round(age/1000/60)} minutes`);
        delete this.pendingPlans[key];
        this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
        return null;
      }
      
      logger.info(`[ChatStorage] Found pending plan for user ${key}: ${plan.task}, age: ${Math.round(age/1000/60)} minutes`);
      return plan;
    } catch (error) {
      logger.error('[ChatStorage] Failed to get pending plan:', error);
      return null;
    }
  }

  deletePendingPlan(userId) {
    try {
      const key = userId.toString();
      delete this.pendingPlans[key];
      this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
      logger.info(`[ChatStorage] Deleted pending plan for user ${key}`);
    } catch (error) {
      logger.error('[ChatStorage] Failed to delete pending plan:', error);
    }
  }

  getAllPendingPlans() {
    try {
      // Reload from disk
      this.pendingPlans = this.loadData(PENDING_PLANS_FILE, {});
      
      const now = Date.now();
      const validPlans = {};
      
      for (const [key, plan] of Object.entries(this.pendingPlans)) {
        if (now - plan.createdAt <= 24 * 60 * 60 * 1000) {
          validPlans[key] = plan;
        }
      }
      
      return validPlans;
    } catch (error) {
      logger.error('[ChatStorage] Failed to get all pending plans:', error);
      return {};
    }
  }

  // User Settings Methods
  getUserSettings(userId) {
    try {
      const key = userId.toString();
      return this.userSettings[key] || {
        voiceResponse: true,
        language: 'auto',
        defaultProject: null,
        preferredAI: null,
      };
    } catch (error) {
      logger.error('[ChatStorage] Failed to get user settings:', error);
      return {
        voiceResponse: true,
        language: 'auto',
        defaultProject: null,
        preferredAI: null,
      };
    }
  }

  setUserSettings(userId, settings) {
    try {
      const key = userId.toString();
      this.userSettings[key] = {
        ...this.getUserSettings(userId),
        ...settings,
        updatedAt: Date.now(),
      };
      this.saveData(USER_SETTINGS_FILE, this.userSettings);
      logger.info(`[ChatStorage] Updated settings for user ${key}`);
    } catch (error) {
      logger.error('[ChatStorage] Failed to set user settings:', error);
    }
  }

  toggleVoiceResponse(userId) {
    try {
      const settings = this.getUserSettings(userId);
      const newValue = !settings.voiceResponse;
      this.setUserSettings(userId, { voiceResponse: newValue });
      return newValue;
    } catch (error) {
      logger.error('[ChatStorage] Failed to toggle voice response:', error);
      return true;
    }
  }

  setLanguage(userId, language) {
    this.setUserSettings(userId, { language });
  }

  // Debug method
  getStats() {
    return {
      dataDir: DATA_DIR,
      pendingPlansCount: Object.keys(this.pendingPlans).length,
      chatHistoryCount: Object.keys(this.chatHistory).length,
      userSettingsCount: Object.keys(this.userSettings).length,
      pendingPlans: Object.keys(this.pendingPlans),
      files: {
        chatHistory: fs.existsSync(CHAT_HISTORY_FILE),
        pendingPlans: fs.existsSync(PENDING_PLANS_FILE),
        userSettings: fs.existsSync(USER_SETTINGS_FILE),
      },
    };
  }
}

// Singleton instance
const chatStorage = new ChatStorage();

module.exports = chatStorage;
