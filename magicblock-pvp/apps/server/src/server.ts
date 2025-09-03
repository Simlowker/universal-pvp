import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/requestLogger';
import { authenticate } from '@/middleware/auth';
import { prisma } from '@/config/database';
import { redis } from '@/config/redis';

// Routes
import authRoutes from '@/routes/auth';
import gameRoutes from '@/routes/game.routes';
import playerRoutes from '@/routes/profile.routes';
import matchmakingRoutes from '@/routes/matchmaking.routes';
import metricsRoutes from '@/routes/metrics.routes';
import leaderboardRoutes from '@/routes/leaderboard.routes';
import { costDashboardRoutes } from '@/routes/costDashboard';

// Monitoring and cost tracking
import { register } from '@/config/prometheus';
import { alertSystem } from '@/services/alertSystem';
import { transactionQueueService } from '@/services/transactionQueue';

// WebSocket handlers
import { setupGameNamespace, setupLobbyNamespace } from '@/websocket/namespaces';

export async function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", config.cors.origin]
      }
    }
  }));

  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/', limiter);

  // General middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);

  // Health check
  app.get('/health', async (req, res) => {
    try {
      // Check database
      await prisma.$queryRaw`SELECT 1`;
      
      // Check Redis
      await redis.ping();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database or Redis connection failed'
      });
    }
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/games', authenticate, gameRoutes);
  app.use('/api/profile', authenticate, playerRoutes);
  app.use('/api/matchmaking', authenticate, matchmakingRoutes);
  app.use('/api/metrics', authenticate, metricsRoutes);
  app.use('/api/leaderboard', authenticate, leaderboardRoutes);
  
  // Cost dashboard routes (with authentication)
  app.use('/api/costs', authenticate, costDashboardRoutes);

  // Prometheus metrics endpoint (no auth for monitoring systems)
  app.get('/metrics', (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(register.metrics());
  });

  // WebSocket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify and decode token (implement your auth logic)
      const decoded = await verifyToken(token);
      socket.data.playerId = decoded.playerId;
      socket.data.walletId = decoded.walletId;
      
      next();
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Initialize WebSocket namespaces
  setupGameNamespace(io);
  setupLobbyNamespace(io);

  // Global error handlers
  app.use(errorHandler);

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
      timestamp: new Date().toISOString()
    });
  });

  return { app, server: httpServer, io };
}

// Helper function to verify JWT token
async function verifyToken(token: string): Promise<{ playerId: string; walletId: string }> {
  // Implement JWT verification logic
  // This should decode and validate the JWT token
  // Return the decoded payload with playerId and walletId
  
  const jwt = require('jsonwebtoken');
  const decoded = jwt.verify(token, config.jwt.secret);
  
  return {
    playerId: decoded.playerId,
    walletId: decoded.walletId
  };
}