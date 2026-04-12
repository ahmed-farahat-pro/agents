#!/usr/bin/env node
/**
 * Database Initialization Script
 * Creates database schema and runs migrations
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/database/connection');
const logger = require('../src/utils/logger');

const SCHEMA_FILE = path.join(__dirname, '../src/database/schema.sql');

async function initializeDatabase() {
  logger.info('===============================================');
  logger.info('[DB Init] Initializing database...');
  logger.info('===============================================');

  try {
    // Initialize connection pool
    await db.initializePool();
    
    // Read and execute schema
    const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
    
    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    logger.info(`[DB Init] Executing ${statements.length} schema statements...`);
    
    for (const statement of statements) {
      try {
        await db.query(statement);
      } catch (error) {
        // Ignore "database exists" and "table exists" errors
        if (error.message.includes('exists')) {
          logger.info(`[DB Init] ${error.message}`);
        } else {
          throw error;
        }
      }
    }
    
    logger.info('[DB Init] Schema created successfully');
    
    // Run data migration if needed
    const { migrate } = require('../src/database/migrate');
    await migrate();
    
    logger.info('===============================================');
    logger.info('[DB Init] Database initialization complete!');
    logger.info('===============================================');
    
  } catch (error) {
    logger.error('[DB Init] Initialization failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

// Run if executed directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
