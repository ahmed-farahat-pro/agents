/**
 * Database Connection Module
 * MySQL connection pool management
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'nigents',
  password: process.env.DB_PASSWORD || 'nigents_password',
  database: process.env.DB_NAME || 'nigents',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Connection pool
let pool = null;

/**
 * Initialize the database connection pool
 */
async function initializePool() {
  if (pool) {
    return pool;
  }

  try {
    pool = mysql.createPool(dbConfig);
    
    // Test the connection
    const connection = await pool.getConnection();
    logger.info('[Database] Connected to MySQL database');
    logger.info(`[Database] Host: ${dbConfig.host}, Database: ${dbConfig.database}`);
    connection.release();
    
    return pool;
  } catch (error) {
    logger.error('[Database] Failed to connect to MySQL:', error.message);
    throw error;
  }
}

/**
 * Get a connection from the pool
 */
async function getConnection() {
  if (!pool) {
    await initializePool();
  }
  return pool.getConnection();
}

/**
 * Execute a query
 */
async function query(sql, params = []) {
  if (!pool) {
    await initializePool();
  }
  
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    logger.error('[Database] Query error:', error.message);
    logger.error('[Database] SQL:', sql);
    throw error;
  }
}

/**
 * Execute a transaction
 */
async function transaction(callback) {
  const connection = await getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Close the pool
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('[Database] Connection pool closed');
  }
}

/**
 * Check if database is connected
 */
async function isConnected() {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  initializePool,
  getConnection,
  query,
  transaction,
  closePool,
  isConnected,
  dbConfig,
};
