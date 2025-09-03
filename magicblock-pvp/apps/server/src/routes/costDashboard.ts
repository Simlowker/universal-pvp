import { Router } from 'express';
import { costTrackingService } from '@/services/costTracking';
import { transactionQueueService } from '@/services/transactionQueue';
import { feeEstimationService } from '@/services/feeEstimation';
import { logger } from '@/config/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const timeframeSchema = z.enum(['24h', '7d', '30d']);
const prioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * GET /api/costs/summary
 * Get cost summary for specified timeframe
 */
router.get('/summary', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    const validTimeframe = timeframeSchema.parse(timeframe);
    
    const summary = await costTrackingService.getCostSummary(validTimeframe);
    
    res.json({
      success: true,
      data: {
        ...summary,
        timeframe: validTimeframe,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get cost summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost summary'
    });
  }
});

/**
 * GET /api/costs/player/:playerId
 * Get cost breakdown for specific player
 */
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { timeframe = '24h' } = req.query;
    const validTimeframe = timeframeSchema.parse(timeframe);
    
    const playerCosts = await costTrackingService.getPlayerCosts(playerId, validTimeframe);
    
    res.json({
      success: true,
      data: {
        playerId,
        ...playerCosts,
        timeframe: validTimeframe
      }
    });
  } catch (error) {
    logger.error('Failed to get player costs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve player costs'
    });
  }
});

/**
 * GET /api/costs/game/:gameId
 * Get cost breakdown for specific game
 */
router.get('/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const gameCosts = await costTrackingService.getGameCosts(gameId);
    
    res.json({
      success: true,
      data: {
        gameId,
        ...gameCosts
      }
    });
  } catch (error) {
    logger.error('Failed to get game costs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve game costs'
    });
  }
});

/**
 * GET /api/costs/trends
 * Get cost trends over time
 */
router.get('/trends', async (req, res) => {
  try {
    const { days = '7' } = req.query;
    const numDays = Math.min(Math.max(parseInt(days as string), 1), 30);
    
    const trends = await costTrackingService.getCostTrends(numDays);
    
    res.json({
      success: true,
      data: {
        trends,
        days: numDays,
        period: `${numDays}d`
      }
    });
  } catch (error) {
    logger.error('Failed to get cost trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost trends'
    });
  }
});

/**
 * GET /api/costs/queue/status
 * Get transaction queue status
 */
router.get('/queue/status', async (req, res) => {
  try {
    const stats = transactionQueueService.getStats();
    const queueStatus = transactionQueueService.getQueueStatus();
    const congestion = await transactionQueueService.getCurrentCongestion();
    
    res.json({
      success: true,
      data: {
        stats,
        queueStatus,
        congestion,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve queue status'
    });
  }
});

/**
 * GET /api/costs/queue/transaction/:transactionId
 * Get specific transaction status
 */
router.get('/queue/transaction/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const status = await transactionQueueService.getTransactionStatus(transactionId);
    
    res.json({
      success: true,
      data: {
        transactionId,
        ...status
      }
    });
  } catch (error) {
    logger.error('Failed to get transaction status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction status'
    });
  }
});

/**
 * POST /api/costs/fee-estimate
 * Get fee estimation for transaction or priority level
 */
router.post('/fee-estimate', async (req, res) => {
  try {
    const { priority = 'medium', maxFee, targetConfirmationTime } = req.body;
    
    let estimate;
    
    if (targetConfirmationTime) {
      estimate = await feeEstimationService.getOptimalFeeForTarget(targetConfirmationTime);
    } else {
      const validPriority = prioritySchema.parse(priority);
      estimate = await feeEstimationService.estimateFee(undefined, {
        priority: validPriority,
        maxFee
      });
    }
    
    res.json({
      success: true,
      data: estimate
    });
  } catch (error) {
    logger.error('Failed to estimate fees:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to estimate transaction fees'
    });
  }
});

/**
 * GET /api/costs/fee-trends
 * Get recent fee trends and network congestion
 */
router.get('/fee-trends', async (req, res) => {
  try {
    const { timeWindowMs = '300000' } = req.query; // 5 minutes default
    const windowMs = parseInt(timeWindowMs as string);
    
    const trends = await feeEstimationService.getRecentFeeTrends(windowMs);
    const congestionLevel = feeEstimationService.getNetworkCongestionLevel();
    
    res.json({
      success: true,
      data: {
        ...trends,
        congestionLevel,
        timeWindowMs: windowMs
      }
    });
  } catch (error) {
    logger.error('Failed to get fee trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve fee trends'
    });
  }
});

/**
 * GET /api/costs/metrics/realtime
 * Get real-time cost and performance metrics
 */
router.get('/metrics/realtime', async (req, res) => {
  try {
    // Get current metrics from all services
    const [
      costSummary,
      queueStats,
      congestion,
      feeTrends
    ] = await Promise.all([
      costTrackingService.getCostSummary('24h'),
      transactionQueueService.getStats(),
      transactionQueueService.getCurrentCongestion(),
      feeEstimationService.getRecentFeeTrends(60000) // 1 minute
    ]);
    
    // Calculate efficiency metrics
    const efficiency = {
      costPerTransaction: queueStats.completed > 0 ? costSummary.totalCostUsd / queueStats.completed : 0,
      successRate: queueStats.completed + queueStats.failed > 0 
        ? (queueStats.completed / (queueStats.completed + queueStats.failed)) * 100 
        : 0,
      avgProcessingTime: queueStats.avgProcessingTime,
      networkEfficiency: congestion.level === 'low' ? 90 : congestion.level === 'medium' ? 70 : 50
    };
    
    res.json({
      success: true,
      data: {
        costs: {
          totalUsd: costSummary.totalCostUsd,
          avgTransactionCost: efficiency.costPerTransaction,
          breakdown: costSummary.byCategory
        },
        queue: {
          stats: queueStats,
          processing: queueStats.processing,
          pending: queueStats.pending
        },
        network: {
          congestion: congestion.level,
          priorityFee: congestion.priorityFeePercentile,
          avgConfirmationTime: congestion.avgConfirmationTime,
          recommendedMultiplier: congestion.recommendedFeeMultiplier
        },
        fees: {
          trend: feeTrends.trend,
          averageFee: feeTrends.averageFee,
          volatility: feeTrends.volatility
        },
        efficiency,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get realtime metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve realtime metrics'
    });
  }
});

/**
 * POST /api/costs/optimize
 * Get optimization recommendations
 */
router.post('/optimize', async (req, res) => {
  try {
    const { gameId, operation, priority = 'medium', targetCost } = req.body;
    
    // Get current metrics
    const [costSummary, congestion, feeTrends] = await Promise.all([
      costTrackingService.getCostSummary('24h'),
      transactionQueueService.getCurrentCongestion(),
      feeEstimationService.getRecentFeeTrends()
    ]);
    
    const recommendations = [];
    
    // Cost-based recommendations
    if (costSummary.totalCostUsd > 100) { // High daily costs
      recommendations.push({
        type: 'cost_reduction',
        priority: 'high',
        title: 'High Daily Costs Detected',
        description: 'Daily costs exceed $100. Consider implementing transaction batching.',
        impact: 'Could reduce costs by 20-40%',
        actions: [
          'Enable transaction batching for non-critical operations',
          'Optimize compute unit usage',
          'Review priority fee settings'
        ]
      });
    }
    
    // Network congestion recommendations
    if (congestion.level === 'high') {
      recommendations.push({
        type: 'congestion_mitigation',
        priority: 'medium',
        title: 'High Network Congestion',
        description: 'Network is experiencing high congestion. Adjust transaction timing.',
        impact: 'Could reduce confirmation times by 30-50%',
        actions: [
          'Delay non-critical transactions',
          'Use dynamic fee adjustment',
          'Implement retry logic with backoff'
        ]
      });
    }
    
    // Fee trend recommendations
    if (feeTrends.trend === 'increasing' && feeTrends.volatility > 0.3) {
      recommendations.push({
        type: 'fee_optimization',
        priority: 'medium',
        title: 'Volatile Fee Environment',
        description: 'Transaction fees are increasing and volatile.',
        impact: 'Could save 15-25% on transaction costs',
        actions: [
          'Use adaptive fee estimation',
          'Implement fee capping',
          'Consider off-peak transaction scheduling'
        ]
      });
    }
    
    // Target cost recommendations
    if (targetCost && costSummary.totalCostUsd > targetCost) {
      const overage = ((costSummary.totalCostUsd / targetCost) - 1) * 100;
      recommendations.push({
        type: 'budget_optimization',
        priority: 'high',
        title: 'Budget Exceeded',
        description: `Costs are ${overage.toFixed(1)}% over target of $${targetCost}`,
        impact: `Need to reduce costs by $${(costSummary.totalCostUsd - targetCost).toFixed(2)}`,
        actions: [
          'Review high-cost operations',
          'Implement stricter fee limits',
          'Optimize transaction frequency'
        ]
      });
    }
    
    // Performance recommendations
    const queueStats = transactionQueueService.getStats();
    if (queueStats.avgProcessingTime > 5000) { // More than 5 seconds
      recommendations.push({
        type: 'performance_optimization',
        priority: 'medium',
        title: 'Slow Transaction Processing',
        description: 'Average processing time exceeds 5 seconds.',
        impact: 'Could improve user experience significantly',
        actions: [
          'Increase concurrent transaction limit',
          'Optimize queue processing',
          'Use higher priority fees for critical operations'
        ]
      });
    }
    
    // Default optimization if no specific issues
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'general_optimization',
        priority: 'low',
        title: 'System Running Optimally',
        description: 'No major issues detected. Consider these proactive optimizations.',
        impact: 'Maintain current performance levels',
        actions: [
          'Continue monitoring cost trends',
          'Review monthly cost reports',
          'Consider implementing additional monitoring'
        ]
      });
    }
    
    res.json({
      success: true,
      data: {
        recommendations: recommendations.sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority as keyof typeof priorityOrder] - 
                 priorityOrder[a.priority as keyof typeof priorityOrder];
        }),
        currentMetrics: {
          totalCost: costSummary.totalCostUsd,
          congestionLevel: congestion.level,
          feeTrend: feeTrends.trend,
          avgProcessingTime: queueStats.avgProcessingTime
        },
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('Failed to generate optimization recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate optimization recommendations'
    });
  }
});

/**
 * DELETE /api/costs/queue/clear
 * Clear transaction queue (admin operation)
 */
router.delete('/queue/clear', async (req, res) => {
  try {
    const { priority } = req.body;
    
    const cleared = await transactionQueueService.clearQueue(priority);
    
    res.json({
      success: true,
      data: {
        cleared,
        priority: priority || 'all'
      }
    });
  } catch (error) {
    logger.error('Failed to clear queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear transaction queue'
    });
  }
});

export { router as costDashboardRoutes };