/**
 * Single Instance Lock - Prevent multiple bot instances
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const LOCK_FILE = path.join(process.cwd(), 'data', 'bot.lock');
const LOCK_TIMEOUT = 30000; // 30 seconds

class SingleInstanceLock {
  constructor() {
    this.lockFile = LOCK_FILE;
  }

  acquire() {
    try {
      // Check if lock exists and is recent
      if (fs.existsSync(this.lockFile)) {
        const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
        const age = Date.now() - lockData.timestamp;
        
        if (age < LOCK_TIMEOUT) {
          logger.error(`[SingleInstance] Another instance is running (PID: ${lockData.pid}, age: ${age}ms)`);
          return false;
        }
        
        logger.warn(`[SingleInstance] Stale lock found (age: ${age}ms), overwriting`);
      }

      // Write lock
      fs.writeFileSync(this.lockFile, JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
        startTime: new Date().toISOString(),
      }));

      logger.info(`[SingleInstance] Lock acquired (PID: ${process.pid})`);
      return true;
    } catch (error) {
      logger.error('[SingleInstance] Failed to acquire lock:', error);
      return false;
    }
  }

  release() {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
        logger.info('[SingleInstance] Lock released');
      }
    } catch (error) {
      logger.error('[SingleInstance] Failed to release lock:', error);
    }
  }

  // Keep lock alive
  startHeartbeat() {
    setInterval(() => {
      try {
        fs.writeFileSync(this.lockFile, JSON.stringify({
          pid: process.pid,
          timestamp: Date.now(),
          startTime: new Date().toISOString(),
        }));
      } catch (error) {
        // Ignore
      }
    }, 10000); // Every 10 seconds
  }
}

const lock = new SingleInstanceLock();

// Handle cleanup
process.on('exit', () => lock.release());
process.on('SIGINT', () => {
  lock.release();
  process.exit(0);
});
process.on('SIGTERM', () => {
  lock.release();
  process.exit(0);
});

module.exports = lock;
