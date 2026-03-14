/**
 * Chat Storage - Persistent storage for chat history, pending plans, and user settings
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const CHAT_HISTORY_FILE = path.join(DATA_DIR, 'chat-history.json');
const PENDING_PLANS_FILE = path.join(DATA_DIR, 'pending-plans.json');
const USER_SETTINGS_FILE = path.join(DATA_DIR, 'user-settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class ChatStorage {
  constructor() {
    this.chatHistory = this.loadData(CHAT_HISTORY_FILE, {});
    this.pendingPlans = this.loadData(PENDING_PLANS_FILE, {});
    this.userSettings = this.loadData(USER_SETTINGS_FILE, {});
    
    // Auto-save every 30 seconds
    setInterval(() => this.saveAll(), 30000);
  }

  loadData(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error(`[ChatStorage] Failed to load ${filePath}:`, error);
    }
    return defaultValue;
  }

  saveData(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      logger.error(`[ChatStorage] Failed to save ${filePath}:`, error);
      return false;
    }
  }

  saveAll() {
    this.saveData(CHAT_HISTORY_FILE, this.chatHistory);
    this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
    this.saveData(USER_SETTINGS_FILE, this.userSettings);
  }

  // Chat History Methods
  addMessage(userId, role, content, metadata = {}) {
    const key = userId.toString();
    if (!this.chatHistory[key]) {
      this.chatHistory[key] = [];
    }
    
    this.chatHistory[key].push({
      role, // 'user' or 'assistant'
      content,
      timestamp: Date.now(),
      ...metadata,
    });

    // Keep only last 100 messages per user
    if (this.chatHistory[key].length > 100) {
      this.chatHistory[key] = this.chatHistory[key].slice(-100);
    }

    this.saveData(CHAT_HISTORY_FILE, this.chatHistory);
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
  }

  // Pending Plans Methods
  setPendingPlan(userId, planData) {
    const key = userId.toString();
    this.pendingPlans[key] = {
      ...planData,
      createdAt: Date.now(),
    };
    this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
  }

  getPendingPlan(userId) {
    const key = userId.toString();
    const plan = this.pendingPlans[key];
    
    // Check if plan is expired (24 hours)
    if (plan && Date.now() - plan.createdAt > 24 * 60 * 60 * 1000) {
      delete this.pendingPlans[key];
      this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
      return null;
    }
    
    return plan || null;
  }

  deletePendingPlan(userId) {
    const key = userId.toString();
    delete this.pendingPlans[key];
    this.saveData(PENDING_PLANS_FILE, this.pendingPlans);
  }

  getAllPendingPlans() {
    const now = Date.now();
    const validPlans = {};
    
    for (const [key, plan] of Object.entries(this.pendingPlans)) {
      if (now - plan.createdAt <= 24 * 60 * 60 * 1000) {
        validPlans[key] = plan;
      }
    }
    
    return validPlans;
  }

  // User Settings Methods
  getUserSettings(userId) {
    const key = userId.toString();
    return this.userSettings[key] || {
      voiceResponse: true, // Default to voice
      language: 'auto', // auto, en, ar
      defaultProject: null,
      preferredAI: null,
    };
  }

  setUserSettings(userId, settings) {
    const key = userId.toString();
    this.userSettings[key] = {
      ...this.getUserSettings(userId),
      ...settings,
      updatedAt: Date.now(),
    };
    this.saveData(USER_SETTINGS_FILE, this.userSettings);
  }

  toggleVoiceResponse(userId) {
    const settings = this.getUserSettings(userId);
    const newValue = !settings.voiceResponse;
    this.setUserSettings(userId, { voiceResponse: newValue });
    return newValue;
  }

  setLanguage(userId, language) {
    this.setUserSettings(userId, { language });
  }
}

// Singleton instance
const chatStorage = new ChatStorage();

module.exports = chatStorage;
