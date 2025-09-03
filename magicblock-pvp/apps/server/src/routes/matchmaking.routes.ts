import { Router, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { 
  AuthenticatedRequest,
  JoinQueueRequest,
  QueueStatus,
  ApiResponse 
} from '@/types/api.types';
import { matchmakingService } from '@/services/matchmaking.service';
import { validationErrorHandler } from '@/middleware/validation';
import { logger } from '@/config/logger';

const router = Router();

// Validation middleware
const joinQueueValidation = [
  body('gameType').isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  body('betAmount').isFloat({ min: 0.01, max: 10 }),
  body('preferredOpponentRating').optional().isInt({ min: 0, max: 3000 }),
  body('maxRatingDifference').optional().isInt({ min: 0, max: 500 }),
  validationErrorHandler
];

// POST /api/matchmaking/queue - Join matchmaking queue
router.post('/queue', joinQueueValidation, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const queueRequest: JoinQueueRequest = req.body;

    logger.info(`Player ${playerId} joining matchmaking queue`, { 
      gameType: queueRequest.gameType, 
      betAmount: queueRequest.betAmount 
    });

    const result = await matchmakingService.joinQueue(playerId, queueRequest);

    res.status(201).json({
      success: true,
      data: {
        queueId: result.queueId,
        position: result.position,
        estimatedWaitTime: result.estimatedWaitTime,
        status: 'queued'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to join matchmaking queue:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'QUEUE_JOIN_FAILED',
        message: error.message || 'Failed to join matchmaking queue'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// DELETE /api/matchmaking/queue - Leave matchmaking queue
router.delete('/queue', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;

    logger.info(`Player ${playerId} leaving matchmaking queue`);

    const result = await matchmakingService.leaveQueue(playerId);

    res.json({
      success: true,
      data: {
        status: 'removed',
        refundAmount: result.refundAmount
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to leave matchmaking queue:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'QUEUE_LEAVE_FAILED',
        message: error.message || 'Failed to leave matchmaking queue'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/matchmaking/queue/status - Get queue status
router.get('/queue/status', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;

    const status = await matchmakingService.getQueueStatus(playerId);

    res.json({
      success: true,
      data: { status },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get queue status:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'QUEUE_STATUS_FAILED',
        message: error.message || 'Failed to get queue status'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/matchmaking/queue/stats - Get matchmaking statistics
router.get('/queue/stats', [
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('betRange').optional().isString(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameType = req.query.gameType as any;
    const betRange = req.query.betRange as string;

    const stats = await matchmakingService.getQueueStats(gameType, betRange);

    res.json({
      success: true,
      data: { stats },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get queue stats:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'QUEUE_STATS_FAILED',
        message: error.message || 'Failed to get queue statistics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/matchmaking/challenge - Send direct challenge to player
router.post('/challenge', [
  body('targetPlayerId').isString().notEmpty(),
  body('gameType').isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  body('betAmount').isFloat({ min: 0.01, max: 10 }),
  body('message').optional().isString().isLength({ max: 200 }),
  body('expiresIn').optional().isInt({ min: 300, max: 3600 }), // 5 minutes to 1 hour
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const challengerId = req.player.id;
    const { targetPlayerId, gameType, betAmount, message, expiresIn } = req.body;

    logger.info(`Player ${challengerId} challenging ${targetPlayerId}`, { 
      gameType, 
      betAmount 
    });

    const challenge = await matchmakingService.createChallenge(
      challengerId, 
      targetPlayerId, 
      { gameType, betAmount, message, expiresIn }
    );

    res.status(201).json({
      success: true,
      data: {
        challengeId: challenge.id,
        targetPlayerId,
        gameType,
        betAmount,
        expiresAt: challenge.expiresAt,
        status: 'sent'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to create challenge:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'CHALLENGE_CREATE_FAILED',
        message: error.message || 'Failed to create challenge'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/matchmaking/challenge/:challengeId/accept - Accept challenge
router.post('/challenge/:challengeId/accept', [
  body('challengeId').isString().notEmpty(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const challengeId = req.params.challengeId;

    logger.info(`Player ${playerId} accepting challenge ${challengeId}`);

    const result = await matchmakingService.acceptChallenge(challengeId, playerId);

    res.json({
      success: true,
      data: {
        challengeId,
        gameId: result.gameId,
        status: 'accepted'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to accept challenge:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'CHALLENGE_ACCEPT_FAILED',
        message: error.message || 'Failed to accept challenge'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/matchmaking/challenge/:challengeId/decline - Decline challenge
router.post('/challenge/:challengeId/decline', [
  body('challengeId').isString().notEmpty(),
  body('reason').optional().isString().isLength({ max: 100 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const challengeId = req.params.challengeId;
    const reason = req.body.reason;

    logger.info(`Player ${playerId} declining challenge ${challengeId}`, { reason });

    await matchmakingService.declineChallenge(challengeId, playerId, reason);

    res.json({
      success: true,
      data: {
        challengeId,
        status: 'declined'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to decline challenge:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'CHALLENGE_DECLINE_FAILED',
        message: error.message || 'Failed to decline challenge'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/matchmaking/challenges - Get challenges for player
router.get('/challenges', [
  query('status').optional().isIn(['pending', 'accepted', 'declined', 'expired']),
  query('type').optional().isIn(['sent', 'received']),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('offset').optional().isInt({ min: 0 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const filters = {
      status: req.query.status as any,
      type: req.query.type as 'sent' | 'received',
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0
    };

    const challenges = await matchmakingService.getChallenges(playerId, filters);

    res.json({
      success: true,
      data: { challenges },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: challenges.length,
          page: Math.floor(filters.offset / filters.limit) + 1,
          limit: filters.limit,
          hasNext: challenges.length === filters.limit,
          hasPrev: filters.offset > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get challenges:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'CHALLENGES_FETCH_FAILED',
        message: error.message || 'Failed to fetch challenges'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/matchmaking/leaderboard - Get matchmaking leaderboard
router.get('/leaderboard', [
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'all']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const filters = {
      gameType: req.query.gameType as any,
      period: req.query.period as any || 'all',
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0
    };

    const leaderboard = await matchmakingService.getLeaderboard(filters);

    res.json({
      success: true,
      data: { leaderboard },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: leaderboard.length,
          page: Math.floor(filters.offset / filters.limit) + 1,
          limit: filters.limit,
          hasNext: leaderboard.length === filters.limit,
          hasPrev: filters.offset > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get leaderboard:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'LEADERBOARD_FETCH_FAILED',
        message: error.message || 'Failed to fetch leaderboard'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

export default router;