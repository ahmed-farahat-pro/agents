/**
 * Task Queue - Hybrid Implementation (MySQL + Memory fallback)
 * Uses MySQL if available, falls back to in-memory storage
 */

const logger = require('./logger');

// Check if MySQL is enabled
const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

let taskQueue;

if (useMySQL) {
  try {
    const mysqlQueue = require('../database/task-queue-mysql');
    taskQueue = mysqlQueue;
    logger.info('[TaskQueue] Using MySQL backend');
  } catch (error) {
    logger.error('[TaskQueue] Failed to load MySQL backend:', error.message);
    taskQueue = null;
  }
} else {
  logger.info('[TaskQueue] MySQL not configured, using memory-only queue');
  taskQueue = null;
}

module.exports = taskQueue;
