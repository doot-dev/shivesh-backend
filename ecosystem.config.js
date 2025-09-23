module.exports = {
  apps: [
    {
      // Production configuration
      name: 'shivesh-backend-prod',
      script: 'server.js',
      cwd: '/path/to/your/app', // Update this with your actual production path
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info',
        ENABLE_FILE_LOGGING: 'true'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'warn',
        ENABLE_FILE_LOGGING: 'true'
      },
      // Monitoring
      monitoring: true,
      pmx: true,
      
      // Auto restart configuration
      max_restarts: 5,
      min_uptime: '10s',
      max_memory_restart: '1G',
      
      // Logging
      log_file: './logs/pm2/combined.log',
      out_file: './logs/pm2/out.log',
      error_file: './logs/pm2/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced PM2 features
      watch: false, // Set to true for development, false for production
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log',
        '.git',
        '.env'
      ],
      
      // Process management
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // Auto restart on file changes (only for development)
      autorestart: true,
      
      // Source maps support
      source_map_support: true,
      
      // Process title
      instance_var: 'INSTANCE_ID',
      
      // Cron restart (optional - restart every day at 2 AM)
      cron_restart: '0 2 * * *',
      
      // Interpreter
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=4096'
    },
    
    {
      // Development configuration
      name: 'shivesh-backend-dev',
      script: 'server.js',
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
        'ecosystem.config.js'
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
      autorestart: true,
      
      // Source maps
      source_map_support: true
    },
    
    {
      // Staging configuration
      name: 'shivesh-backend-staging',
      script: 'server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'staging',
        PORT: 3002,
        LOG_LEVEL: 'info',
        ENABLE_FILE_LOGGING: 'true'
      },
      
      // Staging specific settings
      max_restarts: 3,
      min_uptime: '10s',
      max_memory_restart: '800M',
      
      // Logging for staging
      log_file: './logs/pm2/staging-combined.log',
      out_file: './logs/pm2/staging-out.log',
      error_file: './logs/pm2/staging-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Monitoring
      monitoring: true,
      pmx: true,
      
      // Watch disabled for staging
      watch: false,
      
      // Auto restart
      autorestart: true,
      
      // Source maps
      source_map_support: true
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy', // Your server username
      host: ['your-production-server.com'], // Your production server(s)
      ref: 'origin/main', // Git branch to deploy
      repo: 'https://github.com/yourusername/shivesh-backend.git', // Your Git repository
      path: '/var/www/shivesh-backend', // Deployment path on server
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git nodejs npm -y',
      'post-setup': 'ls -la',
      ssh_options: 'StrictHostKeyChecking=no'
    },
    
    staging: {
      user: 'deploy',
      host: ['your-staging-server.com'],
      ref: 'origin/develop',
      repo: 'https://github.com/yourusername/shivesh-backend.git',
      path: '/var/www/shivesh-backend-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': 'apt update && apt install git nodejs npm -y',
      ssh_options: 'StrictHostKeyChecking=no'
    }
  }
};