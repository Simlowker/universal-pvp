import { Router, Response } from 'express';
import { query, validationResult } from 'express-validator';
import { 
  AuthenticatedRequest,
  CostMetricsQuery,
  FeeEstimationRequest,
  ApiResponse 
} from '@/types/api.types';
import { metricsService } from '@/services/metrics.service';
import { feeEstimationService } from '@/services/feeEstimation.service';
import { validationErrorHandler } from '@/middleware/validation';
import { logger } from '@/config/logger';

const router = Router();

// GET /api/metrics/costs - Get cost metrics summary
router.get('/costs', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('category').optional().isIn(['TRANSACTION_FEE', 'COMPUTE_COST', 'RENT_COST', 'INFRASTRUCTURE', 'THIRD_PARTY', 'STORAGE']),
  query('operation').optional().isString(),
  query('gameId').optional().isString(),
  query('playerId').optional().isString(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const query: CostMetricsQuery = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      category: req.query.category as any,
      operation: req.query.operation as string,
      gameId: req.query.gameId as string
    };

    // Only allow players to see their own costs (unless admin)
    const playerId = req.query.playerId as string || req.player.id;
    
    logger.info(`Fetching cost metrics for player ${playerId}`, { query });

    const costSummary = await metricsService.getCostSummary(playerId, query);

    res.json({
      success: true,
      data: { costSummary },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get cost metrics:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'COST_METRICS_FETCH_FAILED',
        message: error.message || 'Failed to fetch cost metrics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/metrics/fees/estimate - Estimate transaction fees
router.post('/fees/estimate', [
  query('operation').isString().notEmpty(),
  query('complexity').optional().isIn(['low', 'medium', 'high']),
  query('urgency').optional().isIn(['low', 'normal', 'high']),
  query('computeUnits').optional().isInt({ min: 1 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const request: FeeEstimationRequest = {
      operation: req.body.operation,
      complexity: req.body.complexity,
      urgency: req.body.urgency,
      computeUnits: req.body.computeUnits
    };

    logger.info(`Estimating fees for operation ${request.operation}`, { request });

    const estimate = await feeEstimationService.estimateFee(request);

    res.json({
      success: true,
      data: { estimate },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to estimate fees:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'FEE_ESTIMATION_FAILED',
        message: error.message || 'Failed to estimate transaction fees'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/performance - Get system performance metrics
router.get('/performance', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('metric').optional().isIn(['latency', 'throughput', 'uptime', 'errors']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const metric = req.query.metric as string;

    logger.info('Fetching performance metrics', { startDate, endDate, metric });

    const performanceMetrics = await metricsService.getPerformanceMetrics(startDate, endDate, metric);

    res.json({
      success: true,
      data: { metrics: performanceMetrics },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get performance metrics:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PERFORMANCE_METRICS_FETCH_FAILED',
        message: error.message || 'Failed to fetch performance metrics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/game-stats - Get game statistics
router.get('/game-stats', [
  query('period').optional().isIn(['24h', '7d', '30d', '90d']),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const period = req.query.period as string || '24h';
    const gameType = req.query.gameType as any;

    logger.info('Fetching game statistics', { period, gameType });

    const gameStats = await metricsService.getGameStats(period, gameType);

    res.json({
      success: true,
      data: { gameStats },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get game statistics:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_STATS_FETCH_FAILED',
        message: error.message || 'Failed to fetch game statistics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/network-health - Get Solana network health
router.get('/network-health', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    logger.info('Fetching network health metrics');

    const networkHealth = await metricsService.getNetworkHealth();

    res.json({
      success: true,
      data: { networkHealth },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get network health:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'NETWORK_HEALTH_FETCH_FAILED',
        message: error.message || 'Failed to fetch network health'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/congestion - Get network congestion data
router.get('/congestion', [
  query('period').optional().isIn(['1h', '6h', '24h', '7d']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const period = req.query.period as string || '24h';

    logger.info('Fetching network congestion data', { period });

    const congestionData = await metricsService.getCongestionData(period);

    res.json({
      success: true,
      data: { congestion: congestionData },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get congestion data:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'CONGESTION_DATA_FETCH_FAILED',
        message: error.message || 'Failed to fetch congestion data'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/player-analytics - Get player analytics
router.get('/player-analytics', [
  query('playerId').optional().isString(),
  query('period').optional().isIn(['24h', '7d', '30d', '90d']),
  query('metric').optional().isIn(['activity', 'performance', 'spending', 'engagement']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // Players can only see their own analytics (unless admin)
    const playerId = req.query.playerId as string || req.player.id;
    const period = req.query.period as string || '30d';
    const metric = req.query.metric as string || 'activity';

    logger.info(`Fetching player analytics for ${playerId}`, { period, metric });

    const analytics = await metricsService.getPlayerAnalytics(playerId, period, metric);

    res.json({
      success: true,
      data: { analytics },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get player analytics:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PLAYER_ANALYTICS_FETCH_FAILED',
        message: error.message || 'Failed to fetch player analytics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/real-time - Get real-time metrics dashboard
router.get('/real-time', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    logger.info('Fetching real-time metrics');

    const realTimeMetrics = await metricsService.getRealTimeMetrics();

    res.json({
      success: true,
      data: { metrics: realTimeMetrics },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get real-time metrics:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'REAL_TIME_METRICS_FETCH_FAILED',
        message: error.message || 'Failed to fetch real-time metrics'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/metrics/costs/record - Record cost metric (internal use)
router.post('/costs/record', [
  query('category').isIn(['TRANSACTION_FEE', 'COMPUTE_COST', 'RENT_COST', 'INFRASTRUCTURE', 'THIRD_PARTY', 'STORAGE']),
  query('operation').isString().notEmpty(),
  query('costUsd').isFloat({ min: 0 }),
  query('solanaFees').isFloat({ min: 0 }),
  query('computeUnits').optional().isInt({ min: 0 }),
  query('gameId').optional().isString(),
  query('metadata').optional().isObject(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const costData = {
      category: req.body.category,
      operation: req.body.operation,
      costUsd: req.body.costUsd,
      solanaFees: req.body.solanaFees,
      computeUnits: req.body.computeUnits,
      gameId: req.body.gameId,
      metadata: req.body.metadata
    };

    logger.info(`Recording cost metric for player ${playerId}`, { costData });

    const costMetric = await metricsService.recordCostMetric(playerId, costData);

    res.status(201).json({
      success: true,
      data: { costMetric },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to record cost metric:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'COST_RECORD_FAILED',
        message: error.message || 'Failed to record cost metric'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/metrics/optimization - Get cost optimization suggestions
router.get('/optimization', [
  query('playerId').optional().isString(),
  query('period').optional().isIn(['7d', '30d', '90d']),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // Players can only see their own optimization suggestions
    const playerId = req.query.playerId as string || req.player.id;
    const period = req.query.period as string || '30d';

    logger.info(`Fetching optimization suggestions for player ${playerId}`, { period });

    const suggestions = await metricsService.getOptimizationSuggestions(playerId, period);

    res.json({
      success: true,
      data: { suggestions },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get optimization suggestions:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'OPTIMIZATION_SUGGESTIONS_FETCH_FAILED',
        message: error.message || 'Failed to fetch optimization suggestions'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

export default router;