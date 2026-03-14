/**
 * 🦉 Nigents - Winston Logger Configuration
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Safe JSON stringify that handles circular references
 */
function safeStringify(obj, space = 0) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // Skip internal Winston properties
    if (key === 'service' && value === 'nigents') return undefined;
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Handle error objects
    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack,
      };
    }
    return value;
  }, space);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "nigents" },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          // Filter out default service metadata
          const filteredMeta = Object.keys(metadata).reduce((acc, key) => {
            if (key !== 'service') acc[key] = metadata[key];
            return acc;
          }, {});
          if (Object.keys(filteredMeta).length > 0) {
            msg += ` ${safeStringify(filteredMeta)}`;
          }
          return msg;
        })
      ),
    }),
    // Write all logs to file
    new winston.transports.File({ 
      filename: path.join(logDir, 'nightowl.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write error logs to separate file
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
