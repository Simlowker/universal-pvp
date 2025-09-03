import { Request, Response, NextFunction } from 'express';
import { logger } from '@/config/logger';
import { config } from '@/config/environment';
import { nanoid } from 'nanoid';

interface LoggedRequest extends Request {
  requestId?: string;
  startTime?: number;
}

export function requestLogger(req: LoggedRequest, res: Response, next: NextFunction) {
  // Generate unique request ID
  req.requestId = nanoid(10);
  req.startTime = Date.now();

  // Add request ID to response headers
  res.set('X-Request-ID', req.requestId);

  // Log request start (debug level to avoid spam)
  if (config.server.env === 'development') {
    logger.debug('Request started', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      query: req.query,
      params: req.params,
    });
  }

  // Store original response methods
  const originalSend = res.send;
  const originalJson = res.json;

  // Override res.send to log response
  res.send = function(body: any) {
    logResponse(req, res, body);
    return originalSend.call(this, body);
  };

  // Override res.json to log response
  res.json = function(body: any) {
    logResponse(req, res, body);
    return originalJson.call(this, body);
  };

  next();
}

function logResponse(req: LoggedRequest, res: Response, body: any) {
  const duration = req.startTime ? Date.now() - req.startTime : 0;
  const contentLength = res.get('Content-Length') || (body ? Buffer.byteLength(JSON.stringify(body)) : 0);
  
  const logData = {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    contentLength: `${contentLength} bytes`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    referer: req.get('Referer'),
  };

  // Log different levels based on status code
  if (res.statusCode >= 500) {
    logger.error('Request completed with server error', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('Request completed with client error', logData);
  } else if (res.statusCode >= 300) {
    logger.info('Request completed with redirect', logData);
  } else {
    // For successful requests, use info level for important endpoints, debug for others
    if (isImportantEndpoint(req.url)) {
      logger.info('Request completed successfully', logData);
    } else {
      logger.debug('Request completed successfully', logData);
    }
  }

  // Log slow requests as warnings
  if (duration > 1000) {
    logger.warn('Slow request detected', {
      ...logData,
      slowRequestThreshold: '1000ms',
    });
  }
}

function isImportantEndpoint(url?: string): boolean {
  if (!url) return false;
  
  const importantPatterns = [
    '/api/games',
    '/api/matchmaking',
    '/api/auth',
    '/health',
    '/metrics',
  ];
  
  return importantPatterns.some(pattern => url.startsWith(pattern));
}

// Middleware to log WebSocket connections
export function wsConnectionLogger(socket: any, next: any) {
  const connectionId = nanoid(10);
  socket.connectionId = connectionId;
  
  logger.info('WebSocket connection established', {
    connectionId,
    socketId: socket.id,
    ip: socket.request.connection.remoteAddress,
    userAgent: socket.request.headers['user-agent'],
    playerId: socket.data?.playerId,
  });

  // Log disconnection
  socket.on('disconnect', (reason: string) => {
    logger.info('WebSocket connection closed', {
      connectionId,
      socketId: socket.id,
      reason,
      playerId: socket.data?.playerId,
    });
  });

  next();
}

// Middleware to log WebSocket events
export function wsEventLogger(eventName: string) {
  return (socket: any, data: any, next?: Function) => {
    logger.debug('WebSocket event received', {
      event: eventName,
      connectionId: socket.connectionId,
      socketId: socket.id,
      playerId: socket.data?.playerId,
      data: config.server.env === 'development' ? data : '[REDACTED]',
    });

    if (next) next();
  };
}