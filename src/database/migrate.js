#!/usr/bin/env node
/**
 * Database Migration Script
 * Migrates existing JSON data to MySQL database
 */

const fs = require('fs');
const path = require('path');
const db = require('./connection');
const logger = require('../utils/logger');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Load JSON files
function loadJsonFile(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error(`[Migration] Failed to load ${filename}:`, error.message);
  }
  return {};
}

// Migrate users and settings
async function migrateUsersAndSettings() {
  logger.info('[Migration] Migrating users and settings...');
  
  const userSettings = loadJsonFile('user-settings.json');
  let count = 0;
  
  for (const [userId, settings] of Object.entries(userSettings)) {
    try {
      // Create user if not exists
      await db.query(
        `INSERT IGNORE INTO users (id, username, created_at, last_active_at)
         VALUES (?, ?, NOW(), NOW())`,
        [userId, settings.username || null]
      );
      
      // Insert settings
      await db.query(
        `INSERT INTO user_settings 
         (user_id, voice_response, language, default_project, preferred_ai, preferred_model)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         voice_response = VALUES(voice_response),
         language = VALUES(language),
         default_project = VALUES(default_project),
         preferred_ai = VALUES(preferred_ai),
         preferred_model = VALUES(preferred_model)`,
        [userId, 
         settings.voiceResponse !== false,
         settings.language || 'auto',
         settings.defaultProject || null,
         settings.preferredAI || null,
         settings.preferredModel || null]
      );
      
      count++;
    } catch (error) {
      logger.error(`[Migration] Failed to migrate user ${userId}:`, error.message);
    }
  }
  
  logger.info(`[Migration] Migrated ${count} users/settings`);
}

// Migrate chat history
async function migrateChatHistory() {
  logger.info('[Migration] Migrating chat history...');
  
  const chatHistory = loadJsonFile('chat-history.json');
  let count = 0;
  
  for (const [userId, messages] of Object.entries(chatHistory)) {
    try {
      // Ensure user exists
      await db.query(
        `INSERT IGNORE INTO users (id, created_at, last_active_at)
         VALUES (?, NOW(), NOW())`,
        [userId]
      );
      
      // Insert messages (limit to 100 per user)
      const recentMessages = messages.slice(-100);
      for (const msg of recentMessages) {
        await db.query(
          `INSERT INTO chat_messages (user_id, role, content, metadata, created_at)
           VALUES (?, ?, ?, ?, FROM_UNIXTIME(? / 1000))`,
          [userId, msg.role, msg.content, 
           JSON.stringify({...msg, role: undefined, content: undefined, timestamp: undefined}),
           msg.timestamp || Date.now()]
        );
      }
      
      count++;
    } catch (error) {
      logger.error(`[Migration] Failed to migrate chat for user ${userId}:`, error.message);
    }
  }
  
  logger.info(`[Migration] Migrated ${count} chat histories`);
}

// Migrate pending plans
async function migratePendingPlans() {
  logger.info('[Migration] Migrating pending plans...');
  
  const pendingPlans = loadJsonFile('pending-plans.json');
  let count = 0;
  
  for (const [userId, plan] of Object.entries(pendingPlans)) {
    try {
      // Check if expired (24 hours)
      const age = Date.now() - (plan.createdAt || 0);
      const isExpired = age > 24 * 60 * 60 * 1000;
      
      if (isExpired) {
        logger.info(`[Migration] Skipping expired plan for user ${userId}`);
        continue;
      }
      
      // Ensure user exists
      await db.query(
        `INSERT IGNORE INTO users (id, username, created_at, last_active_at)
         VALUES (?, ?, NOW(), NOW())`,
        [userId, plan.username || null]
      );
      
      // Insert pending plan
      const expiresAt = new Date((plan.createdAt || Date.now()) + 24 * 60 * 60 * 1000);
      await db.query(
        `INSERT INTO pending_plans 
         (user_id, task, chat_id, username, project_id, project_name, plan_data, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', FROM_UNIXTIME(? / 1000), ?)`,
        [userId, plan.task, plan.chatId, plan.username, 
         plan.projectId, plan.projectName, JSON.stringify(plan),
         plan.createdAt || Date.now(), expiresAt]
      );
      
      count++;
    } catch (error) {
      logger.error(`[Migration] Failed to migrate pending plan for user ${userId}:`, error.message);
    }
  }
  
  logger.info(`[Migration] Migrated ${count} pending plans`);
}

// Run migration
async function migrate() {
  logger.info('===============================================');
  logger.info('[Migration] Starting database migration...');
  logger.info('===============================================');
  
  try {
    // Initialize database connection
    await db.initializePool();
    
    // Run migrations in order
    await migrateUsersAndSettings();
    await migrateChatHistory();
    await migratePendingPlans();
    
    logger.info('===============================================');
    logger.info('[Migration] Migration completed successfully!');
    logger.info('===============================================');
    
    // Show stats
    const stats = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM users'),
      db.query('SELECT COUNT(*) as count FROM chat_messages'),
      db.query('SELECT COUNT(*) as count FROM pending_plans'),
      db.query('SELECT COUNT(*) as count FROM user_settings'),
    ]);
    
    logger.info('[Migration] Final database stats:');
    logger.info(`  - Users: ${stats[0][0].count}`);
    logger.info(`  - Messages: ${stats[1][0].count}`);
    logger.info(`  - Pending Plans: ${stats[2][0].count}`);
    logger.info(`  - User Settings: ${stats[3][0].count}`);
    
  } catch (error) {
    logger.error('[Migration] Migration failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
}

// Run if executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
