/**
 * Nigents - PM2 Ecosystem Configuration
 * Process manager configuration for 24/7 operation with data persistence
 */

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'nigents-bot',
      script: './src/bot.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // Data persistence paths
        DATA_DIR: '/home/ubuntu/nigents/data',
        LOGS_DIR: '/home/ubuntu/nigents/logs',
        CACHE_DIR: '/home/ubuntu/nigents/.cache',
      },
      log_file: '/home/ubuntu/nigents/logs/bot.log',
      out_file: '/home/ubuntu/nigents/logs/bot-out.log',
      error_file: '/home/ubuntu/nigents/logs/bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      // Ensure data persists between restarts
      kill_timeout: 5000,
      listen_timeout: 10000,
      // Post-deploy hook to ensure directories exist
      post_update: ['mkdir -p /home/ubuntu/nigents/data /home/ubuntu/nigents/logs /home/ubuntu/nigents/.cache'],
    },
    {
      name: 'nigents-dashboard',
      script: './src/dashboard/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        DATA_DIR: '/home/ubuntu/nigents/data',
        LOGS_DIR: '/home/ubuntu/nigents/logs',
      },
      log_file: '/home/ubuntu/nigents/logs/dashboard.log',
      out_file: '/home/ubuntu/nigents/logs/dashboard-out.log',
      error_file: '/home/ubuntu/nigents/logs/dashboard-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],

  // Deployment configuration (if using PM2 deploy)
  deploy: {
    production: {
      user: 'ubuntu',
      host: process.env.EC2_HOST || 'nigents.com',
      ref: 'origin/main',
      repo: 'https://gitlab.com/bonyad-tech/nigents.git',
      path: '/home/ubuntu/nigents',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --production && pm2 reload ecosystem.config.js --env production && pm2 save',
      'pre-setup': '',
    },
  },
};
