const jwt = require('jsonwebtoken');
const { Player } = require('../database/models');
const { logger } = require('../utils/logger');
const { envValidator } = require('../utils/envValidator');

/**
 * Authentication middleware for protected routes
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      return res.status(401).json({
        error: 'Access Denied',
        message: 'No token provided'
      });
    }

    // Validate JWT secret exists and is secure
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET environment variable not set');
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Authentication system misconfigured'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find player in database
    const player = await Player.findById(decoded.playerId);
    if (!player) {
      logger.logSecurityEvent('Invalid player token', { 
        playerId: decoded.playerId,
        ip: req.ip 
      });
      
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Invalid token - player not found'
      });
    }

    // Check if player account is active
    if (player.status === 'banned') {
      logger.logSecurityEvent('Banned player access attempt', { 
        playerId: player.id,
        username: player.username,
        ip: req.ip 
      });
      
      return res.status(403).json({
        error: 'Account Banned',
        message: 'Your account has been suspended'
      });
    }

    // Attach player info to request
    req.player = player;
    req.token = token;

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.logSecurityEvent('Invalid JWT token', { 
        error: error.message,
        ip: req.ip 
      });
      
      return res.status(401).json({
        error: 'Access Denied',
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token Expired',
        message: 'Your session has expired. Please login again.'
      });
    }

    logger.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 */
async function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (token) {
      // Validate JWT secret exists
      if (!process.env.JWT_SECRET) {
        logger.error('JWT_SECRET environment variable not set');
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const player = await Player.findById(decoded.playerId);
      
      if (player && player.status !== 'banned') {
        req.player = player;
        req.token = token;
      }
    }

    next();

  } catch (error) {
    // Don't fail - just continue without authentication
    next();
  }
}

/**
 * Admin-only authentication middleware
 */
async function adminAuthMiddleware(req, res, next) {
  try {
    // First run regular auth
    await new Promise((resolve, reject) => {
      authMiddleware(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Check if player is admin
    if (!req.player.isAdmin) {
      logger.logSecurityEvent('Admin access attempt by non-admin', {
        playerId: req.player.id,
        username: req.player.username,
        ip: req.ip,
        route: req.originalUrl
      });

      return res.status(403).json({
        error: 'Access Denied',
        message: 'Admin privileges required'
      });
    }

    next();

  } catch (error) {
    logger.error('Admin auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Wallet verification middleware
 */
function requireVerifiedWallet(req, res, next) {
  if (!req.player) {
    return res.status(401).json({
      error: 'Authentication Required',
      message: 'Please login first'
    });
  }

  if (!req.player.isVerified) {
    return res.status(403).json({
      error: 'Wallet Not Verified',
      message: 'Please verify your wallet to access this feature'
    });
  }

  next();
}

/**
 * Rate limiting middleware for authentication attempts
 */
const rateLimit = require('express-rate-limit');

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too Many Attempts',
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.logSecurityEvent('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      error: 'Too Many Attempts',
      message: 'Too many authentication attempts. Please try again later.'
    });
  }
});

/**
 * API key authentication for internal services
 */
function apiKeyAuth(req, res, next) {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'API Key Required',
      message: 'X-API-Key header is required'
    });
  }

  if (apiKey !== process.env.INTERNAL_API_KEY) {
    logger.logSecurityEvent('Invalid API key attempt', {
      providedKey: apiKey.substring(0, 8) + '...',
      ip: req.ip
    });

    return res.status(401).json({
      error: 'Invalid API Key',
      message: 'The provided API key is invalid'
    });
  }

  req.isInternalRequest = true;
  next();
}

/**
 * CORS validation for specific origins
 */
function validateOrigin(req, res, next) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://solduel.app'
  ];

  const origin = req.get('Origin');
  
  if (origin && !allowedOrigins.includes(origin)) {
    logger.logSecurityEvent('Invalid origin attempt', {
      origin,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(403).json({
      error: 'Access Denied',
      message: 'Origin not allowed'
    });
  }

  next();
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminAuthMiddleware,
  requireVerifiedWallet,
  authRateLimit,
  apiKeyAuth,
  validateOrigin
};