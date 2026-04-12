/**
 * Chat Storage - MySQL Implementation Only
 * Uses MySQL database for all storage needs
 */

const logger = require('./logger');

// Check if MySQL is enabled
const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

if (!useMySQL) {
  logger.error('[ChatStorage] MySQL is not configured! Set DB_HOST, DB_USER, DB_PASSWORD env vars.');
  throw new Error('MySQL is required but not configured');
}

const mysqlStorage = require('../database/chat-storage-mysql');
logger.info('[ChatStorage] Using MySQL backend');

module.exports = mysqlStorage;
