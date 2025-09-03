const winston = require('winston');

// Define custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logMessage += ` | Meta: ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'sol-duel-backend',
    version: process.env.APP_VERSION || '1.0.0'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf((info) => {
          const { timestamp, level, message, stack } = info;
          let logMessage = `${timestamp} [${level}]: ${message}`;
          
          if (stack) {
            logMessage += `\n${stack}`;
          }
          
          return logMessage;
        })
      )
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json()
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json()
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  
  // Handle unhandled rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userId: req.player?.id || 'anonymous'
  };

  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Add game event logging
logger.logGameEvent = (event, gameId, playerId, data = {}) => {
  logger.info('Game Event', {
    event,
    gameId,
    playerId,
    timestamp: new Date().toISOString(),
    ...data
  });
};

// Add security event logging
logger.logSecurityEvent = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Add blockchain event logging
logger.logBlockchainEvent = (event, transactionSignature, details = {}) => {
  logger.info('Blockchain Event', {
    event,
    transactionSignature,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Performance monitoring
logger.logPerformance = (operation, duration, details = {}) => {
  const level = duration > 1000 ? 'warn' : 'info';
  logger.log(level, 'Performance Metric', {
    operation,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Database query logging
logger.logQuery = (query, duration, params = {}) => {
  if (process.env.LOG_QUERIES === 'true') {
    logger.debug('Database Query', {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration: `${duration}ms`,
      params: Object.keys(params).length > 0 ? params : undefined
    });
  }
};

// Environment-specific configuration
if (process.env.NODE_ENV === 'production') {
  // In production, we might want to send logs to external services
  // Add external transports here (e.g., CloudWatch, Loggly, etc.)
  
  // Reduce console logging in production
  logger.transports.forEach(transport => {
    if (transport.name === 'console') {
      transport.level = 'warn';
    }
  });
}

if (process.env.NODE_ENV === 'test') {
  // Silence logs during testing
  logger.transports.forEach(transport => {
    transport.silent = true;
  });
}

// Helper function to create child loggers with context
logger.createChild = (context) => {
  return logger.child(context);
};

// Memory usage logging
setInterval(() => {
  const memUsage = process.memoryUsage();
  logger.debug('Memory Usage', {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
  });
}, 300000); // Every 5 minutes

module.exports = { logger };