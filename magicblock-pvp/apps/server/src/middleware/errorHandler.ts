import { Request, Response, NextFunction } from 'express';
import { logger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { config } from '@/config/environment';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
  
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  code = 'CONFLICT';
  
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  code = 'FORBIDDEN';
  
  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class GameError extends Error {
  statusCode = 400;
  code = 'GAME_ERROR';
  
  constructor(message: string, public gameId?: string) {
    super(message);
    this.name = 'GameError';
  }
}

export class BlockchainError extends Error {
  statusCode = 502;
  code = 'BLOCKCHAIN_ERROR';
  
  constructor(message: string, public transactionId?: string) {
    super(message);
    this.name = 'BlockchainError';
  }
}

export function errorHandler(
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Record error metrics
  metricsUtils.recordError(error.name || 'UnknownError', req.path);

  // Log error with context
  logger.error('Request error:', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
    },
    request: {
      method: req.method,
      url: req.url,
      params: req.params,
      query: req.query,
      body: config.server.env === 'development' ? req.body : '[REDACTED]',
      headers: {
        'user-agent': req.get('User-Agent'),
        'x-forwarded-for': req.get('X-Forwarded-For'),
        'authorization': req.get('Authorization') ? '[PRESENT]' : '[MISSING]',
      },
    },
    user: (req as any).user || null,
  });

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    return handlePrismaError(error, res);
  }

  if (error && typeof error === 'object' && 'message' in error && (error as any).message?.includes('validation')) {
    return res.status(400).json({
      error: 'Database validation error',
      message: 'Invalid data provided',
      code: 'DATABASE_VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle custom API errors
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      error: error.name || 'API Error',
      message: error.message,
      code: error.code,
      details: error.details,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle validation errors from express-validator
  if (error.name === 'ValidationError' && Array.isArray(error.details)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid input data',
      code: 'VALIDATION_ERROR',
      details: error.details,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Invalid or expired token',
      code: 'INVALID_TOKEN',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle rate limit errors
  if (error.name === 'TooManyRequestsError') {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
    });
  }

  // Default internal server error
  return res.status(500).json({
    error: 'Internal Server Error',
    message: config.server.env === 'development' 
      ? error.message 
      : 'An unexpected error occurred',
    code: 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString(),
    ...(config.server.env === 'development' && {
      stack: error.stack,
    }),
  });
}

function handlePrismaError(error: any, res: Response) {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = error.meta?.target as string[] | undefined;
      return res.status(409).json({
        error: 'Duplicate Entry',
        message: `A record with this ${field?.join(', ') || 'value'} already exists`,
        code: 'DUPLICATE_ENTRY',
        details: { field: field?.[0] },
        timestamp: new Date().toISOString(),
      });

    case 'P2025':
      // Record not found
      return res.status(404).json({
        error: 'Not Found',
        message: 'The requested record was not found',
        code: 'RECORD_NOT_FOUND',
        timestamp: new Date().toISOString(),
      });

    case 'P2003':
      // Foreign key constraint violation
      return res.status(400).json({
        error: 'Invalid Reference',
        message: 'Referenced record does not exist',
        code: 'INVALID_REFERENCE',
        timestamp: new Date().toISOString(),
      });

    case 'P2004':
      // Constraint violation
      return res.status(400).json({
        error: 'Constraint Violation',
        message: 'The operation violates a database constraint',
        code: 'CONSTRAINT_VIOLATION',
        timestamp: new Date().toISOString(),
      });

    default:
      logger.error('Unhandled Prisma error:', {
        code: error.code,
        message: error.message,
        meta: error.meta,
      });
      
      return res.status(500).json({
        error: 'Database Error',
        message: 'A database error occurred',
        code: 'DATABASE_ERROR',
        timestamp: new Date().toISOString(),
      });
  }
}

// Async error wrapper for route handlers
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Global unhandled rejection handler
export function setupGlobalErrorHandlers() {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection:', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise,
    });
    
    // Graceful shutdown
    process.exit(1);
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', {
      error: error.message,
      stack: error.stack,
    });
    
    // Graceful shutdown
    process.exit(1);
  });
}