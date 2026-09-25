import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import logger from './helper/logger.js';
import { databaseConnection } from './config/database.js';
import { initFirebase } from './helper/firebase.js';
import adminApiRoutes from './app/admin/routes/index.js';
import mobileApiRoutes from './app/mobile/routes/index.js';
import { getSocketCount } from './realtime/socketServer.js';
import { serveUploads, ensureBucket } from './config/objectStorage.js';
import { requireUploadAuth } from './middleware/uploadAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialise Firebase Admin (push notifications)
initFirebase();

// Create Express app
const app = express();

// Trust proxy (important for production deployments behind load balancers)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration

app.use(cors({
  origin: "*",
  credentials: true,
}));


// Serve static files from public directory
// MinIO first (see config/objectStorage.js); files not in the bucket fall through
// to the legacy disk copy.
app.use('/uploads', requireUploadAuth, serveUploads, express.static(path.join(__dirname, '../public/uploads')));
ensureBucket().catch((err) => logger.error('MinIO bucket check failed:', err));

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
    database: dbHealth,
    websocket: { connected: getSocketCount() }
  });
});

// Route params (:orderId, :billNo, :clientId) are joined straight into upload
// directories by the multer configs, and Express decodes them — so a segment
// like "..%2F..%2Fsrc" would let multer write outside public/uploads. Reject
// any segment that decodes to a separator or a parent reference, for all routes.
app.use('/api', (req, res, next) => {
  let segments;
  try {
    segments = req.path.split('/').map(decodeURIComponent);
  } catch {
    segments = null;
  }
  if (!segments || segments.some((s) => s === '..' || /[/\\]/.test(s))) {
    return res.status(400).json({ success: false, message: 'Invalid path', data: null });
  }
  next();
});

// API Routes
app.use('/api/v1/admin', adminApiRoutes);
app.use('/api/v1/mobile', mobileApiRoutes);

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