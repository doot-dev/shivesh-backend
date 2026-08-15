import app from './src/app.js';
import logger from './src/helper/logger.js';
import { databaseConnection } from './src/config/database.js';
import { initSocketServer } from './src/realtime/socketServer.js';

const PORT = process.env.PORT || 3001;
let server; // Declare server variable at module level

// Initialize database connection
const startServer = async () => {
  try {
    // Connect to database
    await databaseConnection.connect();

    // Start the server
    server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📍 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API endpoint: http://localhost:${PORT}/api/v1/admin`);
      logger.info(`🔌 WebSocket:    ws://localhost:${PORT}/ws`);
    });

    // Live order updates share the HTTP port via the upgrade handshake.
    initSocketServer(server);

    // Graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        try {
          await databaseConnection.disconnect();
          logger.info('Process terminated');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

export default server;
