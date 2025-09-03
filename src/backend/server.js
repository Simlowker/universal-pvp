const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import security utilities early
const { envValidator } = require('./utils/envValidator');

// Validate environment variables for security
try {
  envValidator.init();
} catch (error) {
  console.error('Environment validation failed:', error.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const { logger } = require('./utils/logger');
const { connectDatabase, closeDatabase } = require('./database/connection');
const { connectRedis } = require('./utils/redis');

// Import route handlers
const authRoutes = require('./api/auth');
const gameRoutes = require('./api/games');
const playerRoutes = require('./api/players');
const tournamentRoutes = require('./api/tournaments');
const leaderboardRoutes = require('./api/leaderboard');
const statsRoutes = require('./api/stats');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { securityValidation } = require('./middleware/inputValidation');
const { secureHeaders, configureCORS } = require('./middleware/secureHeaders');

// Import WebSocket handlers
const gameSocketHandlers = require('./websocket/gameHandlers');
const matchmakingSocketHandlers = require('./websocket/matchmakingHandlers');

class Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });
    this.port = process.env.PORT || 5000;
  }

  async initialize() {
    try {
      // Connect to services
      await connectDatabase();
      await connectRedis();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket handlers
      this.setupSocketHandlers();
      
      // Setup error handling
      this.setupErrorHandling();
      
      logger.info('Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security middleware (apply early)
    this.app.use(secureHeaders);
    this.app.use(helmet());
    this.app.use(securityValidation);
    
    // CORS with security configuration
    this.app.use(cors(configureCORS()));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Logging
    this.app.use(require('express-winston').logger({
      winstonInstance: logger,
      meta: true,
      msg: "HTTP {{req.method}} {{req.url}}",
      expressFormat: true,
      colorize: false,
    }));
  }

  setupRoutes() {
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/games', authMiddleware, gameRoutes);
    this.app.use('/api/players', authMiddleware, playerRoutes);
    this.app.use('/api/tournaments', authMiddleware, tournamentRoutes);
    this.app.use('/api/leaderboard', leaderboardRoutes);
    this.app.use('/api/stats', statsRoutes);

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        version: '1.0.0',
        endpoints: {
          auth: [
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/auth/verify-wallet'
          ],
          games: [
            'GET /api/games',
            'POST /api/games',
            'GET /api/games/:id',
            'PUT /api/games/:id',
            'POST /api/games/:id/join'
          ],
          players: [
            'GET /api/players/profile',
            'PUT /api/players/profile',
            'GET /api/players/:id/stats'
          ],
          tournaments: [
            'GET /api/tournaments',
            'POST /api/tournaments',
            'GET /api/tournaments/:id',
            'POST /api/tournaments/:id/join'
          ],
          leaderboard: [
            'GET /api/leaderboard',
            'GET /api/leaderboard/top/:limit'
          ],
          stats: [
            'GET /api/stats/overview',
            'GET /api/stats/player/:id'
          ]
        }
      });
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      // Game-related socket handlers
      gameSocketHandlers(socket, this.io);
      
      // Matchmaking socket handlers
      matchmakingSocketHandlers(socket, this.io);
      
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
      });
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  async start() {
    await this.initialize();
    
    this.server.listen(this.port, () => {
      logger.info(`SOL Duel Backend Server running on port ${this.port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('Shutting down server...');
    
    this.server.close(() => {
      logger.info('HTTP server closed');
    });
    
    await closeDatabase();
    logger.info('Server shutdown complete');
    process.exit(0);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = Server;