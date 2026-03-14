/**
 * Chat Storage - Hybrid Implementation (MySQL + JSON fallback)
 * Uses MySQL if available, falls back to JSON file storage
 */

const logger = require('./logger');

// Check if MySQL is enabled
const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

let storage;

if (useMySQL) {
  try {
    const mysqlStorage = require('../database/chat-storage-mysql');
    storage = mysqlStorage;
    logger.info('[ChatStorage] Using MySQL backend');
  } catch (error) {
    logger.error('[ChatStorage] Failed to load MySQL backend, falling back to JSON:', error.message);
    const jsonStorage = require('./chat-storage-json');
    storage = jsonStorage;
  }
} else {
  logger.info('[ChatStorage] Using JSON file backend (DB_HOST not set)');
  const jsonStorage = require('./chat-storage-json');
  storage = jsonStorage;
}

module.exports = storage;
