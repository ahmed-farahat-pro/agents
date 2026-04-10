/**
 * Chat Storage - MySQL or Mock Implementation
 * Uses MySQL database when configured, falls back to mock for development
 */

const logger = require('./logger');

// Check if MySQL is enabled
const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

if (useMySQL) {
  const mysqlStorage = require('../database/chat-storage-mysql');
  logger.info('[ChatStorage] Using MySQL backend');
  module.exports = mysqlStorage;
} else {
  logger.warn('[ChatStorage] MySQL not configured, using mock implementation for development');

  // Mock implementation for development
  module.exports = {
    getAllUserSettings: () => ({}),
    getUserSetting: (userId) => null,
    saveChatSession: (session) => Promise.resolve(session),
    getChatSession: (sessionId) => Promise.resolve(null),
    getChatSessions: (userId) => Promise.resolve([]),
    updateChatSession: (sessionId, updates) => Promise.resolve(updates),
    deleteChatSession: (sessionId) => Promise.resolve(true),
  };
}
