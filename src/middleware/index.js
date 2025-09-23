import logger from '../helper/logger.js';

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
  });
  
  next();
};

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error(`Error in ${req.method} ${req.url}:`, {
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;

  res.status(err.status || 500).json({
    error: message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

/**
 * Rate limiting middleware (basic implementation)
 */
const rateLimiter = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const requestData = requests.get(ip);
    
    if (now > requestData.resetTime) {
      requestData.count = 1;
      requestData.resetTime = now + windowMs;
      return next();
    }

    if (requestData.count >= maxRequests) {
      logger.warn(`Rate limit exceeded for IP: ${ip}`);
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
      });
    }

    requestData.count++;
    next();
  };
};

/**
 * Validation middleware
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      // Basic validation example - you can integrate with Joi, express-validator, etc.
      if (schema.body && !req.body) {
        return res.status(400).json({ error: 'Request body is required' });
      }
      
      next();
    } catch (error) {
      logger.error('Validation error:', error);
      res.status(400).json({ error: 'Validation failed', details: error.message });
    }
  };
};

export {
  requestLogger,
  errorHandler,
  rateLimiter,
  validateRequest
};