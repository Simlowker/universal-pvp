import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '@/config/database';
import { config } from '@/config/environment';
import { logger, securityLogger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { ValidationError, ConflictError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/middleware/errorHandler';
import { body, validationResult } from 'express-validator';
import { nanoid } from 'nanoid';

const router = Router();

// Validation middleware
const validateWalletAuth = [
  body('walletId')
    .isString()
    .isLength({ min: 32, max: 44 })
    .withMessage('Invalid wallet ID format'),
  body('signature')
    .isString()
    .isLength({ min: 64 })
    .withMessage('Invalid signature format'),
  body('message')
    .isString()
    .isLength({ min: 1 })
    .withMessage('Message is required'),
];

const validatePlayerUpdate = [
  body('username')
    .optional()
    .isString()
    .isLength({ min: 3, max: 20 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-20 characters, alphanumeric and underscores only'),
  body('displayName')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be 1-50 characters'),
  body('avatarUrl')
    .optional()
    .isURL()
    .withMessage('Avatar URL must be a valid URL'),
];

/**
 * @route   POST /api/auth/wallet
 * @desc    Authenticate with wallet signature
 * @access  Public
 */
router.post('/wallet', validateWalletAuth, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { walletId, signature, message } = req.body;

  try {
    // Verify signature (simplified - in production, use proper crypto verification)
    const isValidSignature = await verifyWalletSignature(walletId, signature, message);
    
    if (!isValidSignature) {
      securityLogger.authAttempt(walletId, false, req.ip);
      return res.status(401).json({
        error: 'Invalid signature',
        message: 'Wallet signature verification failed',
      });
    }

    // Find or create player
    let player = await prisma.player.findUnique({
      where: { walletId },
    });

    if (!player) {
      player = await prisma.player.create({
        data: {
          walletId,
          username: `player_${walletId.substring(0, 8)}`,
          displayName: `Player ${walletId.substring(0, 6)}`,
        },
      });

      metricsUtils.recordPlayerRegistration();
      logger.info('New player registered', { playerId: player.id, walletId });
    }

    // Create session
    const sessionToken = nanoid(32);
    const session = await prisma.session.create({
      data: {
        playerId: player.id,
        sessionToken,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Generate JWT
    const token = jwt.sign(
      {
        playerId: player.id,
        walletId: player.walletId,
        sessionId: sessionToken,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    // Update last active
    await prisma.player.update({
      where: { id: player.id },
      data: { lastActiveAt: new Date() },
    });

    securityLogger.authAttempt(walletId, true, req.ip);

    res.json({
      success: true,
      token,
      player: {
        id: player.id,
        walletId: player.walletId,
        username: player.username,
        displayName: player.displayName,
        avatarUrl: player.avatarUrl,
        gamesPlayed: player.gamesPlayed,
        gamesWon: player.gamesWon,
        winRate: player.winRate,
        totalEarnings: player.totalEarnings.toNumber(),
      },
      session: {
        expiresAt: session.expiresAt,
      },
    });

  } catch (error) {
    logger.error('Wallet authentication failed:', error);
    securityLogger.authAttempt(walletId, false, req.ip);
    throw error;
  }
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh authentication token
 * @access  Private
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid authentication token',
    });
  }

  const token = authHeader.substring(7);

  try {
    // Verify current token (even if expired)
    const decoded = jwt.decode(token) as any;
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token could not be decoded',
      });
    }

    // Check if session exists
    const session = await prisma.session.findUnique({
      where: {
        sessionToken: decoded.sessionId,
        isActive: true,
      },
      include: { player: true },
    });

    if (!session) {
      return res.status(401).json({
        error: 'Invalid session',
        message: 'Session not found or expired',
      });
    }

    // Generate new token
    const newToken = jwt.sign(
      {
        playerId: session.playerId,
        walletId: session.player.walletId,
        sessionId: session.sessionToken,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    // Update session
    await prisma.session.update({
      where: { id: session.id },
      data: { 
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Extend 24 hours
      },
    });

    res.json({
      success: true,
      token: newToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

  } catch (error) {
    logger.error('Token refresh failed:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Unable to refresh authentication token',
    });
  }
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout and invalidate session
 * @access  Private
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(200).json({ success: true, message: 'Already logged out' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.decode(token) as any;
    if (decoded && decoded.sessionId) {
      // Invalidate session
      await prisma.session.update({
        where: { sessionToken: decoded.sessionId },
        data: { isActive: false },
      }).catch(() => {
        // Session might not exist, ignore error
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });

  } catch (error) {
    logger.error('Logout error:', error);
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
}));

/**
 * @route   PUT /api/auth/profile
 * @desc    Update player profile
 * @access  Private
 */
router.put('/profile', validatePlayerUpdate, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, config.jwt.secret) as any;

  const { username, displayName, avatarUrl } = req.body;

  try {
    // Check if username is already taken (if provided)
    if (username) {
      const existingPlayer = await prisma.player.findFirst({
        where: {
          username,
          id: { not: decoded.playerId },
        },
      });

      if (existingPlayer) {
        throw new ConflictError('Username is already taken');
      }
    }

    // Update player
    const updatedPlayer = await prisma.player.update({
      where: { id: decoded.playerId },
      data: {
        ...(username && { username }),
        ...(displayName && { displayName }),
        ...(avatarUrl && { avatarUrl }),
      },
    });

    res.json({
      success: true,
      player: {
        id: updatedPlayer.id,
        walletId: updatedPlayer.walletId,
        username: updatedPlayer.username,
        displayName: updatedPlayer.displayName,
        avatarUrl: updatedPlayer.avatarUrl,
        gamesPlayed: updatedPlayer.gamesPlayed,
        gamesWon: updatedPlayer.gamesWon,
        winRate: updatedPlayer.winRate,
        totalEarnings: updatedPlayer.totalEarnings.toNumber(),
      },
    });

  } catch (error) {
    logger.error('Profile update failed:', error);
    throw error;
  }
}));

/**
 * @route   GET /api/auth/sessions
 * @desc    Get active sessions for current user
 * @access  Private
 */
router.get('/sessions', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, config.jwt.secret) as any;

  const sessions = await prisma.session.findMany({
    where: {
      playerId: decoded.playerId,
      isActive: true,
    },
    select: {
      id: true,
      sessionToken: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  });

  res.json({
    success: true,
    sessions: sessions.map(session => ({
      ...session,
      isCurrent: session.sessionToken === decoded.sessionId,
    })),
  });
}));

/**
 * @route   DELETE /api/auth/sessions/:sessionId
 * @desc    Revoke a specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, config.jwt.secret) as any;
  const { sessionId } = req.params;

  await prisma.session.updateMany({
    where: {
      sessionToken: sessionId,
      playerId: decoded.playerId,
    },
    data: { isActive: false },
  });

  res.json({
    success: true,
    message: 'Session revoked successfully',
  });
}));

// Helper function to verify wallet signature
async function verifyWalletSignature(walletId: string, signature: string, message: string): Promise<boolean> {
  // In a real implementation, this would verify the cryptographic signature
  // using the appropriate blockchain's signature verification method
  // For Solana, you would use @solana/web3.js utilities
  
  // Simplified verification for demo purposes
  try {
    // Basic validation
    if (!walletId || !signature || !message) {
      return false;
    }

    // Check message format (should include timestamp to prevent replay attacks)
    const messageMatch = message.match(/Sign in to MagicBlock PvP at (\d+)/);
    if (!messageMatch) {
      return false;
    }

    const timestamp = parseInt(messageMatch[1]);
    const now = Date.now();
    
    // Message should be recent (within 5 minutes)
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
      return false;
    }

    // In production, verify the actual cryptographic signature here
    return true;
  } catch (error) {
    logger.error('Signature verification error:', error);
    return false;
  }
}

export default router;