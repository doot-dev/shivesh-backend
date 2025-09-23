import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import 'dotenv/config';
import logger from './helper/logger.js';
import { databaseConnection } from './config/database.js';
import adminApiRoutes from './app/admin/routes/index.js';

// Create Express app
const app = express();

// Trust proxy (important for production deployments behind load balancers)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: "*",
  credentials: true,
  optionsSuccessStatus: 200
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging with Morgan and Winston
app.use(morgan('combined', { stream: logger.stream }));

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await databaseConnection.healthCheck();
  
  res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
    status: dbHealth.status === 'healthy' ? 'OK' : 'SERVICE_UNAVAILABLE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: dbHealth
  });
});

// API Routes
app.use('/api/v1/admin', adminApiRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    url: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { 
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

export default app;