# Shivesh Backend

A robust Express.js backend application with ES6 modules, comprehensive logging, security middleware, and organized project structure.

## Features

- ✅ **ES6 Modules** - Modern JavaScript import/export syntax
- ✅ Express.js server with security middleware (Helmet, CORS)
- ✅ Comprehensive logging with Winston (console + file rotation)
- ✅ Environment-based configuration
- ✅ Organized project structure
- ✅ Error handling middleware
- ✅ Health check endpoint
- ✅ Development tools (Nodemon)
- ✅ Request compression and parsing

## ES6 Module Structure

This project uses ES6 modules (`import/export`) instead of CommonJS (`require/module.exports`). The `package.json` includes `"type": "module"` to enable this modern JavaScript syntax.

### Import/Export Examples:
```javascript
// ES6 Import
import express from 'express';
import logger from './config/logger.js';

// ES6 Export
export default app;
export { middleware1, middleware2 };
```

**Note:** All relative imports must include the `.js` extension when using ES6 modules.

## Project Structure

```
shivesh-backend/
├── src/
│   ├── config/
│   │   └── logger.js          # Winston logger configuration
│   ├── controllers/           # Business logic controllers
│   ├── middleware/
│   │   └── index.js          # Custom middleware functions
│   ├── routes/
│   │   ├── index.js          # Main routes file
│   │   └── users.js          # Example user routes
│   ├── services/             # Business logic services
│   └── app.js                # Express app configuration
├── logs/                     # Log files (auto-generated)
├── .env                      # Environment variables
├── .env.example              # Environment template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies and scripts
└── server.js                # Server entry point
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd shivesh-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create environment file:
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your configuration values.

### Running the Application

#### Development Mode
```bash
npm run dev
```
This starts the server with nodemon for automatic restarts on file changes.

#### Production Mode
```bash
npm start
```

#### Custom Environment
```bash
NODE_ENV=production npm run production
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3001` |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `http://localhost:3000,http://localhost:3001` |
| `LOG_LEVEL` | Logging level | `debug` |
| `ENABLE_FILE_LOGGING` | Enable file logging | `false` |

## Production Deployment

### PM2 Process Manager

This project includes PM2 configuration for production deployment with process management, clustering, and monitoring.

#### Prerequisites

```bash
# Install PM2 globally
npm install -g pm2

# Install project dependencies
npm install
```

#### Available PM2 Commands

| Command | Description |
|---------|-------------|
| `npm run pm2:start` | Start production environment |
| `npm run pm2:start:dev` | Start development environment with file watching |
| `npm run pm2:start:staging` | Start staging environment |
| `npm run pm2:stop` | Stop all processes |
| `npm run pm2:restart` | Restart all processes |
| `npm run pm2:reload` | Graceful reload (zero-downtime) |
| `npm run pm2:delete` | Delete all processes |
| `npm run pm2:logs` | View logs |
| `npm run pm2:monit` | Open monitoring dashboard |
| `npm run pm2:status` | Check process status |

#### Deployment Environments

**Production:**
- **Instances:** Uses all CPU cores (cluster mode)
- **Port:** 3001
- **Auto-restart:** Enabled with memory limits
- **Logging:** File logging enabled
- **Monitoring:** PM2 Plus integration

**Development:**
- **Instances:** Single process (fork mode)
- **Port:** 3001
- **File watching:** Enabled for auto-restart
- **Logging:** Console + file logging

**Staging:**
- **Instances:** 2 processes (cluster mode)
- **Port:** 3002
- **Monitoring:** Enabled
- **File watching:** Disabled

#### Remote Deployment

```bash
# Setup remote server (first time only)
npm run deploy:setup

# Deploy to production
npm run deploy:prod

# Deploy to staging
npm run deploy:staging
```

#### PM2 Ecosystem Configuration

The `ecosystem.config.js` file includes:
- **Multi-environment support** (production, development, staging)
- **Cluster mode** for production scalability
- **Auto-restart policies** with memory limits
- **Log rotation** and centralized logging
- **Health monitoring** with PM2 Plus
- **Git-based deployment** configuration

#### Monitoring & Logs

```bash
# Real-time monitoring
npm run pm2:monit

# View logs
npm run pm2:logs

# View specific app logs
pm2 logs shivesh-backend-prod

# Flush logs
npm run pm2:flush
```

## API Endpoints

### Health Check
- **GET** `/health` - Server health status

### API Root
- **GET** `/api` - API information and available endpoints

### Users (Example)
- **GET** `/api/users` - Get all users
- **GET** `/api/users/:id` - Get user by ID
- **POST** `/api/users` - Create new user
- **PUT** `/api/users/:id` - Update user
- **DELETE** `/api/users/:id` - Delete user

## Logging

The application uses Winston for logging with the following features:

- **Console logging**: Colorized output for development
- **File logging**: Daily rotating files for production
- **HTTP logging**: Request/response logging with Morgan
- **Error logging**: Separate error log files
- **Log levels**: error, warn, info, http, debug

### Log Files (when enabled)
- `logs/application-YYYY-MM-DD.log` - Combined logs
- `logs/error-YYYY-MM-DD.log` - Error logs only

## Security Features

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Body parsing limits**: Prevent large payload attacks
- **Request logging**: Track all requests
- **Error handling**: Safe error responses

## Development

### Adding New Routes

1. Create a new route file in `src/routes/`
2. Import and mount it in `src/routes/index.js`

### Adding Middleware

1. Add middleware functions to `src/middleware/index.js`
2. Apply them in `src/app.js` or specific routes

### Environment Configuration

1. Add new variables to `.env.example`
2. Update the README documentation
3. Use them in your application code

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure production environment variables
3. Enable file logging if needed
4. Set up process manager (PM2, Docker, etc.)
5. Configure reverse proxy (Nginx, Apache)

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run production` - Start with production environment

## Contributing

1. Follow the existing code structure
2. Add proper logging for new features
3. Update documentation for API changes
4. Test thoroughly before committing

## License

ISC