import { Router, Response } from 'express';
import { param, query, body, validationResult } from 'express-validator';
import { 
  AuthenticatedRequest,
  PlayerStats,
  GameHistoryQuery,
  PnLQuery,
  ApiResponse 
} from '@/types/api.types';
import { profileService } from '@/services/profile.service';
import { validationErrorHandler } from '@/middleware/validation';
import { logger } from '@/config/logger';

const router = Router();

// GET /api/profile/stats - Get current player statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response<ApiResponse<PlayerStats>>) => {
  try {
    const playerId = req.player.id;

    logger.info(`Fetching stats for player ${playerId}`);

    const stats = await profileService.getPlayerStats(playerId);

    res.json({
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get player stats:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'STATS_FETCH_FAILED',
        message: error.message || 'Failed to fetch player statistics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile/stats/:playerId - Get another player's public stats
router.get('/stats/:playerId', [
  param('playerId').isString().notEmpty(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse<PlayerStats>>) => {
  try {
    const targetPlayerId = req.params.playerId;
    const requesterId = req.player.id;

    logger.info(`Player ${requesterId} fetching stats for ${targetPlayerId}`);

    const stats = await profileService.getPublicPlayerStats(targetPlayerId);

    res.json({
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get public player stats:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PUBLIC_STATS_FETCH_FAILED',
        message: error.message || 'Failed to fetch player statistics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile/history - Get game history for current player
router.get('/history', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('status').optional().isIn(['WAITING', 'STARTING', 'ACTIVE', 'PAUSED', 'SETTLING', 'COMPLETED', 'CANCELLED', 'DISPUTED']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const query: GameHistoryQuery = {
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
      gameType: req.query.gameType as any,
      status: req.query.status as any,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    logger.info(`Fetching game history for player ${playerId}`, { query });

    const history = await profileService.getGameHistory(playerId, query);

    res.json({
      success: true,
      data: { 
        games: history.games,
        totalGames: history.total,
        summary: history.summary
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: history.total,
          page: Math.floor(query.offset! / query.limit!) + 1,
          limit: query.limit!,
          hasNext: (query.offset! + query.limit!) < history.total,
          hasPrev: query.offset! > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get game history:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'HISTORY_FETCH_FAILED',
        message: error.message || 'Failed to fetch game history'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile/pnl - Get profit and loss data
router.get('/pnl', [
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'all']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const query: PnLQuery = {
      period: req.query.period as any || 'all',
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      gameType: req.query.gameType as any
    };

    logger.info(`Fetching PnL data for player ${playerId}`, { query });

    const pnlData = await profileService.getPnLData(playerId, query);

    res.json({
      success: true,
      data: { pnl: pnlData },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get PnL data:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PNL_FETCH_FAILED',
        message: error.message || 'Failed to fetch profit and loss data'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// PUT /api/profile - Update player profile
router.put('/', [
  body('username').optional().isString().isLength({ min: 3, max: 20 }).matches(/^[a-zA-Z0-9_-]+$/),
  body('displayName').optional().isString().isLength({ min: 1, max: 50 }),
  body('avatarUrl').optional().isURL(),
  body('maxLossPerDay').optional().isFloat({ min: 0 }),
  body('maxBetSize').optional().isFloat({ min: 0.01, max: 10 }),
  body('autoStopLoss').optional().isBoolean(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const updates = req.body;

    logger.info(`Updating profile for player ${playerId}`, { updates });

    const updatedProfile = await profileService.updatePlayerProfile(playerId, updates);

    res.json({
      success: true,
      data: { profile: updatedProfile },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to update player profile:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PROFILE_UPDATE_FAILED',
        message: error.message || 'Failed to update player profile'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile - Get current player profile
router.get('/', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;

    logger.info(`Fetching profile for player ${playerId}`);

    const profile = await profileService.getPlayerProfile(playerId);

    res.json({
      success: true,
      data: { profile },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get player profile:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PROFILE_FETCH_FAILED',
        message: error.message || 'Failed to fetch player profile'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile/achievements - Get player achievements
router.get('/achievements', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;

    logger.info(`Fetching achievements for player ${playerId}`);

    const achievements = await profileService.getPlayerAchievements(playerId);

    res.json({
      success: true,
      data: { achievements },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get player achievements:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'ACHIEVEMENTS_FETCH_FAILED',
        message: error.message || 'Failed to fetch player achievements'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile/rating-history - Get rating history chart data
router.get('/rating-history', [
  query('period').optional().isIn(['7d', '30d', '90d', '1y', 'all']),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const period = req.query.period as string || '30d';
    const gameType = req.query.gameType as any;

    logger.info(`Fetching rating history for player ${playerId}`, { period, gameType });

    const ratingHistory = await profileService.getRatingHistory(playerId, period, gameType);

    res.json({
      success: true,
      data: { ratingHistory },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get rating history:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'RATING_HISTORY_FETCH_FAILED',
        message: error.message || 'Failed to fetch rating history'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/profile/sessions - Create new session (login/delegate)
router.post('/sessions', [
  body('delegationType').optional().isIn(['full', 'limited', 'game_only']),
  body('expiresIn').optional().isInt({ min: 300, max: 86400 }), // 5 minutes to 24 hours
  body('permissions').optional().isArray(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const { delegationType, expiresIn, permissions } = req.body;

    logger.info(`Creating session for player ${playerId}`, { delegationType });

    const session = await profileService.createSession(playerId, {
      delegationType,
      expiresIn,
      permissions
    });

    res.status(201).json({
      success: true,
      data: { session },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to create session:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SESSION_CREATE_FAILED',
        message: error.message || 'Failed to create session'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/profile/sessions - Get active sessions
router.get('/sessions', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;

    logger.info(`Fetching sessions for player ${playerId}`);

    const sessions = await profileService.getActiveSessions(playerId);

    res.json({
      success: true,
      data: { sessions },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get sessions:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SESSIONS_FETCH_FAILED',
        message: error.message || 'Failed to fetch sessions'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// DELETE /api/profile/sessions/:sessionId - Revoke session
router.delete('/sessions/:sessionId', [
  param('sessionId').isString().notEmpty(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const sessionId = req.params.sessionId;

    logger.info(`Player ${playerId} revoking session ${sessionId}`);

    await profileService.revokeSession(playerId, sessionId);

    res.json({
      success: true,
      data: { status: 'revoked' },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to revoke session:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SESSION_REVOKE_FAILED',
        message: error.message || 'Failed to revoke session'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

export default router;