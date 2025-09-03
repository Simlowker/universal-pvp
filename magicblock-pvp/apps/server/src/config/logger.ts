import winston from 'winston';
import { config } from './environment';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if present
  if (Object.keys(meta).length > 0) {
    log += `\n${JSON.stringify(meta, null, 2)}`;
  }
  
  return log;
});

// Create logger instance
export const logger = winston.createLogger({
  level: config.server.env === 'development' ? 'debug' : 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: {
    service: 'magicblock-pvp-server',
    environment: config.server.env,
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    }),
    
    // File transports
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(timestamp(), json()),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(timestamp(), json()),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      format: combine(timestamp(), json()),
    }),
  ],
  
  rejectionHandlers: [
    new winston.transports.File({
      filename: 'logs/rejections.log',
      format: combine(timestamp(), json()),
    }),
  ],
});

// Create logs directory
import { existsSync, mkdirSync } from 'fs';
if (!existsSync('logs')) {
  mkdirSync('logs');
}

// Game-specific logging utilities
export const gameLogger = {
  gameStart: (gameId: string, players: string[]) => {
    logger.info('Game started', {
      event: 'game_start',
      gameId,
      players,
    });
  },
  
  gameEnd: (gameId: string, winnerId: string, reason: string) => {
    logger.info('Game ended', {
      event: 'game_end',
      gameId,
      winnerId,
      reason,
    });
  },
  
  playerAction: (gameId: string, playerId: string, action: any) => {
    logger.debug('Player action', {
      event: 'player_action',
      gameId,
      playerId,
      action,
    });
  },
  
  transaction: (txHash: string, type: string, amount: number, status: string) => {
    logger.info('Transaction', {
      event: 'transaction',
      txHash,
      type,
      amount,
      status,
    });
  },
  
  error: (context: string, error: any, metadata?: any) => {
    logger.error(`Game error - ${context}`, {
      event: 'game_error',
      context,
      error: error.message || error,
      stack: error.stack,
      ...metadata,
    });
  },
};

// Performance logging utilities
export const perfLogger = {
  start: (operation: string) => {
    return {
      operation,
      startTime: Date.now(),
      
      end: function(metadata?: any) {
        const duration = Date.now() - this.startTime;
        logger.debug('Performance metric', {
          event: 'performance',
          operation: this.operation,
          duration,
          ...metadata,
        });
        return duration;
      },
    };
  },
};

// Security logging utilities
export const securityLogger = {
  authAttempt: (walletId: string, success: boolean, ip?: string) => {
    logger.info('Authentication attempt', {
      event: 'auth_attempt',
      walletId,
      success,
      ip,
    });
  },
  
  suspiciousActivity: (description: string, metadata: any) => {
    logger.warn('Suspicious activity detected', {
      event: 'suspicious_activity',
      description,
      ...metadata,
    });
  },
  
  rateLimitHit: (ip: string, endpoint: string) => {
    logger.warn('Rate limit exceeded', {
      event: 'rate_limit_hit',
      ip,
      endpoint,
    });
  },
};

export default logger;