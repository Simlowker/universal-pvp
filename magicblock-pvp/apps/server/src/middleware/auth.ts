import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { prisma } from '@/config/database';
import { logger, securityLogger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';

export interface AuthenticatedRequest extends Request {
  user?: {
    playerId: string;
    walletId: string;
    sessionId: string;
  };
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid authentication token',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as {
      playerId: string;
      walletId: string;
      sessionId: string;
      iat: number;
      exp: number;
    };

    // Check if session exists and is active
    const session = await prisma.session.findUnique({
      where: {
        sessionToken: decoded.sessionId,
        isActive: true,
      },
      include: {
        player: true,
      },
    });

    if (!session) {
      securityLogger.authAttempt(decoded.walletId, false, req.ip);
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session has expired or is invalid',
      });
    }

    // Update last used timestamp
    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    // Attach user info to request
    req.user = {
      playerId: session.playerId,
      walletId: session.player.walletId,
      sessionId: session.sessionToken,
    };

    securityLogger.authAttempt(session.player.walletId, true, req.ip);
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid or expired',
      });
    }

    logger.error('Authentication error:', error);
    metricsUtils.recordError('auth_error', req.path);
    
    return res.status(500).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication',
    });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(); // Continue without authentication
  }

  try {
    return await authenticate(req, res, next);
  } catch (error) {
    // If authentication fails, continue without user context
    req.user = undefined;
    return next();
  }
}

export function requireRole(_allowedRoles: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
    }

    // For now, we don't have roles in the schema
    // This is a placeholder for future role-based access control
    return next();
  };
}

export function rateLimitByUser(maxRequests: number, windowMs: number) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Authentication required for rate limiting',
      });
    }

    const userId = req.user.playerId;
    const now = Date.now();
    const userLimit = userRequests.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new limit window
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (userLimit.count >= maxRequests) {
      securityLogger.rateLimitHit(req.ip || 'unknown', req.path);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Try again in ${Math.ceil((userLimit.resetTime - now) / 1000)} seconds`,
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
      });
    }

    userLimit.count++;
    return next();
  };
}

// WebSocket authentication middleware
export async function authenticateSocket(socket: any, next: any) {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      playerId: string;
      walletId: string;
      sessionId: string;
    };

    // Verify session
    const session = await prisma.session.findUnique({
      where: {
        sessionToken: decoded.sessionId,
        isActive: true,
      },
      include: {
        player: true,
      },
    });

    if (!session) {
      return next(new Error('Invalid or expired session'));
    }

    // Attach user data to socket
    socket.data.playerId = session.playerId;
    socket.data.walletId = session.player.walletId;
    socket.data.sessionId = session.sessionToken;
    socket.data.player = session.player;

    return next();
  } catch (error) {
    logger.error('WebSocket authentication failed:', error);
    return next(new Error('Authentication failed'));
  }
}