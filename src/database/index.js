/**
 * Database Module
 * Centralized database access for Nigents
 */

const db = require('./connection');
const chatStorage = require('./chat-storage-mysql');
const taskQueue = require('./task-queue-mysql');

module.exports = {
  // Connection
  ...db,
  
  // Storage modules
  chatStorage,
  taskQueue,
};
