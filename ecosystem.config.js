/**
 * PM2 Ecosystem Configuration
 * Manages memory limits and auto-restart for Nigents services
 */

module.exports = {
  apps: [
    {
      name: 'nigents-bot',
      script: './src/bot.js',
      cwd: '/home/ubuntu/nigents',
      instances: 1,
      exec_mode: 'fork',
      // Memory management
      max_memory_restart: '2G',       // Restart if memory exceeds 2GB
      node_args: '--max-old-space-size=4096 --optimize-for-size',
      // Auto-restart on failure
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Environment
      env: {
        NODE_ENV: 'production',
      },
      // Logging
      log_file: './logs/bot.log',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Monitoring
      monitor: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
    {
      name: 'nigents-dashboard',
      script: './src/dashboard/server.js',
      cwd: '/home/ubuntu/nigents',
      instances: 1,
      exec_mode: 'fork',
      // Memory management
      max_memory_restart: '1G',       // Restart if memory exceeds 1GB
      node_args: '--max-old-space-size=2048 --optimize-for-size',
      // Auto-restart on failure
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Logging
      log_file: './logs/dashboard.log',
      out_file: './logs/dashboard-out.log',
      error_file: './logs/dashboard-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
    },
  ],
};
