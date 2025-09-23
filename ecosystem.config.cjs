module.exports = {
  apps: [
    {
      // Development configuration
      name: 'shivesh-backend-dev',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug',
        ENABLE_FILE_LOGGING: 'false'
      },
      
      // Development specific settings
      watch: true,
      watch_delay: 1000,
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log',
        '.git',
        '.env',
        'ecosystem.config.cjs'
      ],
      
      // Logging for development
      log_file: './logs/pm2/dev-combined.log',
      out_file: './logs/pm2/dev-out.log',
      error_file: './logs/pm2/dev-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Restart settings for development
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '500M',
      
      // Auto restart
      autorestart: true
    }
  ]
};