import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { 
  AuthenticatedRequest,
  LeaderboardQuery,
  ApiResponse 
} from '@/types/api.types';
import { leaderboardService } from '@/services/leaderboard.service';
import { validationErrorHandler } from '@/middleware/validation';
import { logger } from '@/config/logger';

const router = Router();

// GET /api/leaderboard - Get main leaderboard
router.get('/', [
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'all']),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  query('sortBy').optional().isIn(['rating', 'winRate', 'netPnL', 'totalEarnings', 'gamesPlayed']),
  query('order').optional().isIn(['asc', 'desc']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const query: LeaderboardQuery = {
      period: req.query.period as any || 'all',
      gameType: req.query.gameType as any,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0
    };

    const sortBy = req.query.sortBy as string || 'rating';
    const order = req.query.order as string || 'desc';

    logger.info('Fetching leaderboard', { query, sortBy, order });

    const leaderboard = await leaderboardService.getLeaderboard(query, sortBy, order);

    res.json({
      success: true,
      data: { 
        leaderboard: leaderboard.entries,
        totalPlayers: leaderboard.total,
        lastUpdated: leaderboard.lastUpdated
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: leaderboard.total,
          page: Math.floor(query.offset! / query.limit!) + 1,
          limit: query.limit!,
          hasNext: (query.offset! + query.limit!) < leaderboard.total,
          hasPrev: query.offset! > 0
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

// GET /api/leaderboard/top - Get top players (cached, fast endpoint)
router.get('/top', [
  query('count').optional().isInt({ min: 1, max: 20 }),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const count = parseInt(req.query.count as string) || 10;
    const gameType = req.query.gameType as any;

    logger.info('Fetching top players', { count, gameType });

    const topPlayers = await leaderboardService.getTopPlayers(count, gameType);

    res.json({
      success: true,
      data: { 
        topPlayers,
        count: topPlayers.length
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get top players:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'TOP_PLAYERS_FETCH_FAILED',
        message: error.message || 'Failed to fetch top players'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/leaderboard/rank - Get current player's rank
router.get('/rank', [
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'all']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const gameType = req.query.gameType as any;
    const period = req.query.period as any || 'all';

    logger.info(`Fetching rank for player ${playerId}`, { gameType, period });

    const rankInfo = await leaderboardService.getPlayerRank(playerId, gameType, period);

    res.json({
      success: true,
      data: { rank: rankInfo },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get player rank:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PLAYER_RANK_FETCH_FAILED',
        message: error.message || 'Failed to fetch player rank'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/leaderboard/nearby - Get players ranked near current player
router.get('/nearby', [
  query('range').optional().isInt({ min: 1, max: 20 }),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'all']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const range = parseInt(req.query.range as string) || 5; // +/- 5 ranks
    const gameType = req.query.gameType as any;
    const period = req.query.period as any || 'all';

    logger.info(`Fetching nearby players for ${playerId}`, { range, gameType, period });

    const nearbyPlayers = await leaderboardService.getNearbyPlayers(playerId, range, gameType, period);

    res.json({
      success: true,
      data: { 
        nearbyPlayers: nearbyPlayers.players,
        playerRank: nearbyPlayers.playerRank,
        totalPlayers: nearbyPlayers.totalPlayers
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get nearby players:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'NEARBY_PLAYERS_FETCH_FAILED',
        message: error.message || 'Failed to fetch nearby players'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/leaderboard/seasons - Get seasonal leaderboards
router.get('/seasons', [
  query('season').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const season = req.query.season as string || 'current';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    logger.info('Fetching seasonal leaderboard', { season, limit, offset });

    const seasonalLeaderboard = await leaderboardService.getSeasonalLeaderboard(season, limit, offset);

    res.json({
      success: true,
      data: { 
        leaderboard: seasonalLeaderboard.entries,
        season: seasonalLeaderboard.season,
        seasonInfo: seasonalLeaderboard.seasonInfo,
        totalPlayers: seasonalLeaderboard.total
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: seasonalLeaderboard.total,
          page: Math.floor(offset / limit) + 1,
          limit,
          hasNext: (offset + limit) < seasonalLeaderboard.total,
          hasPrev: offset > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get seasonal leaderboard:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'SEASONAL_LEADERBOARD_FETCH_FAILED',
        message: error.message || 'Failed to fetch seasonal leaderboard'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/leaderboard/tournaments - Get tournament leaderboards
router.get('/tournaments', [
  query('tournamentId').optional().isString(),
  query('status').optional().isIn(['upcoming', 'active', 'completed']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const tournamentId = req.query.tournamentId as string;
    const status = req.query.status as any || 'active';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    logger.info('Fetching tournament leaderboard', { tournamentId, status, limit, offset });

    const tournamentLeaderboard = await leaderboardService.getTournamentLeaderboard(
      tournamentId, 
      status, 
      limit, 
      offset
    );

    res.json({
      success: true,
      data: { 
        leaderboard: tournamentLeaderboard.entries,
        tournament: tournamentLeaderboard.tournament,
        totalParticipants: tournamentLeaderboard.total
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: tournamentLeaderboard.total,
          page: Math.floor(offset / limit) + 1,
          limit,
          hasNext: (offset + limit) < tournamentLeaderboard.total,
          hasPrev: offset > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get tournament leaderboard:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'TOURNAMENT_LEADERBOARD_FETCH_FAILED',
        message: error.message || 'Failed to fetch tournament leaderboard'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/leaderboard/stats - Get leaderboard statistics
router.get('/stats', [
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'all']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const period = req.query.period as any || 'all';

    logger.info('Fetching leaderboard statistics', { period });

    const stats = await leaderboardService.getLeaderboardStats(period);

    res.json({
      success: true,
      data: { stats },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get leaderboard stats:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'LEADERBOARD_STATS_FETCH_FAILED',
        message: error.message || 'Failed to fetch leaderboard statistics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

export default router;