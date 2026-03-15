/**
 * Task Queue - MySQL Implementation Only
 * Uses MySQL database for persistent task queue
 */

const logger = require('./logger');

// Check if MySQL is enabled
const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

if (!useMySQL) {
  logger.error('[TaskQueue] MySQL is not configured! Set DB_HOST, DB_USER, DB_PASSWORD env vars.');
  throw new Error('MySQL is required but not configured');
}

const mysqlQueue = require('../database/task-queue-mysql');
logger.info('[TaskQueue] Using MySQL backend');

module.exports = mysqlQueue;
