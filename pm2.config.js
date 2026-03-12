/**
 * 🦉 NightOwl - PM2 Configuration
 * Process manager configuration for 24/7 operation
 */

module.exports = {
  apps: [
    {
      name: 'nightowl-bot',
      script: './src/bot.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      log_file: './logs/bot.log',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'nightowl-dashboard',
      script: './src/dashboard/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      log_file: './logs/dashboard.log',
      out_file: './logs/dashboard-out.log',
      error_file: './logs/dashboard-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
    },
  ],
};
