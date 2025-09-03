import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { CostMetricsQuery, CostSummary } from '@/types/api.types';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { config } from '@/config/environment';

export class MetricsService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl || clusterApiUrl('devnet'));
  }

  async getCostSummary(playerId: string, query: CostMetricsQuery): Promise<CostSummary> {
    try {
      const whereClause: any = { playerId };

      if (query.startDate || query.endDate) {
        whereClause.timestamp = {};
        if (query.startDate) {
          whereClause.timestamp.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          whereClause.timestamp.lte = new Date(query.endDate);
        }
      }

      if (query.category) {
        whereClause.category = query.category;
      }

      if (query.operation) {
        whereClause.operation = query.operation;
      }

      if (query.gameId) {
        whereClause.gameId = query.gameId;
      }

      const [metrics, aggregates] = await Promise.all([
        prisma.costMetrics.findMany({
          where: whereClause,
          orderBy: { timestamp: 'desc' }
        }),
        prisma.costMetrics.aggregate({
          where: whereClause,
          _sum: {
            costUsd: true,
            solanaFees: true,
            computeUnits: true
          },
          _count: true
        })
      ]);

      // Calculate breakdown by category
      const categoryBreakdown = metrics.reduce((acc: any, metric) => {
        const category = metric.category;
        if (!acc[category]) {
          acc[category] = {
            category,
            costUsd: 0,
            percentage: 0,
            operationCount: 0
          };
        }
        acc[category].costUsd += Number(metric.costUsd);
        acc[category].operationCount += 1;
        return acc;
      }, {});

      const totalCostUsd = Number(aggregates._sum.costUsd || 0);
      const costBreakdown = Object.values(categoryBreakdown).map((item: any) => ({
        ...item,
        percentage: totalCostUsd > 0 ? (item.costUsd / totalCostUsd) * 100 : 0
      }));

      // Generate optimization suggestions
      const optimizationSuggestions = this.generateOptimizationSuggestions(metrics);
      const potentialSavings = this.calculatePotentialSavings(metrics);

      return {
        totalCostUsd,
        totalSolanaFees: Number(aggregates._sum.solanaFees || 0),
        totalComputeUnits: Number(aggregates._sum.computeUnits || 0),
        operationCount: aggregates._count,
        averageCostPerOperation: aggregates._count > 0 ? totalCostUsd / aggregates._count : 0,
        costBreakdown,
        optimizationSuggestions,
        potentialSavings
      };

    } catch (error) {
      logger.error('Failed to get cost summary:', error);
      throw error;
    }
  }

  async getPerformanceMetrics(startDate?: string, endDate?: string, metric?: string) {
    try {
      const cacheKey = `performance_metrics:${startDate || 'none'}:${endDate || 'none'}:${metric || 'all'}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Mock performance metrics - in real system would collect from monitoring
      const metrics = {
        latency: {
          p50: 45,
          p95: 120,
          p99: 280,
          avg: 52
        },
        throughput: {
          requestsPerSecond: 150,
          peakRPS: 450,
          avgResponseTime: 52
        },
        uptime: {
          percentage: 99.9,
          downtime: 0.1,
          incidents: 0
        },
        errors: {
          rate: 0.02,
          total: 12,
          byType: {
            'timeout': 8,
            'validation': 3,
            'network': 1
          }
        }
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(metrics));

      return metric ? metrics[metric as keyof typeof metrics] : metrics;

    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      throw error;
    }
  }

  async getGameStats(period: string = '24h', gameType?: any) {
    try {
      const cacheKey = `game_stats:${period}:${gameType || 'all'}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Calculate time range
      let startDate: Date;
      switch (period) {
        case '24h':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      const whereClause: any = {
        createdAt: { gte: startDate }
      };

      if (gameType) {
        whereClause.gameType = gameType;
      }

      const [
        totalGames,
        completedGames,
        activeGames,
        averageDuration,
        totalVolume
      ] = await Promise.all([
        prisma.game.count({ where: whereClause }),
        prisma.game.count({ where: { ...whereClause, status: 'COMPLETED' } }),
        prisma.game.count({ where: { status: { in: ['WAITING', 'STARTING', 'ACTIVE'] } } }),
        prisma.game.aggregate({
          where: {
            ...whereClause,
            status: 'COMPLETED',
            startedAt: { not: null },
            endedAt: { not: null }
          },
          _avg: {
            // Would need to calculate duration in database
          }
        }),
        prisma.game.aggregate({
          where: whereClause,
          _sum: { betAmount: true }
        })
      ]);

      const stats = {
        totalGames,
        completedGames,
        activeGames,
        averageDuration: 180, // Mock value in seconds
        totalVolume: Number(totalVolume._sum.betAmount || 0),
        completionRate: totalGames > 0 ? (completedGames / totalGames) * 100 : 0,
        period
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(stats));

      return stats;

    } catch (error) {
      logger.error('Failed to get game stats:', error);
      throw error;
    }
  }

  async getNetworkHealth() {
    try {
      const cacheKey = 'network_health';
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Get Solana network health
      const [epochInfo, performanceSamples, supply] = await Promise.all([
        this.connection.getEpochInfo(),
        this.connection.getRecentPerformanceSamples(20),
        this.connection.getSupply().catch(() => null)
      ]);

      const avgSlotTime = performanceSamples.length > 0
        ? performanceSamples.reduce((sum, sample) => 
            sum + (sample.samplePeriodSecs / sample.numSlots), 0
          ) / performanceSamples.length
        : 0.4;

      const health = {
        solana: {
          epoch: epochInfo.epoch,
          slot: epochInfo.absoluteSlot,
          avgSlotTime: Math.round(avgSlotTime * 1000), // Convert to ms
          tps: performanceSamples.length > 0 ? 
            Math.round(performanceSamples[0].numTransactions / performanceSamples[0].samplePeriodSecs) : 0,
          supply: supply ? Number(supply.value.total) / 1e9 : null // Convert to SOL
        },
        status: avgSlotTime < 0.6 ? 'healthy' : avgSlotTime < 1.0 ? 'degraded' : 'unhealthy'
      };

      // Cache for 30 seconds
      await redis.setex(cacheKey, 30, JSON.stringify(health));

      return health;

    } catch (error) {
      logger.error('Failed to get network health:', error);
      return {
        solana: { status: 'unknown' },
        status: 'unknown',
        error: error.message
      };
    }
  }

  async getCongestionData(period: string = '24h') {
    try {
      const samples = await this.connection.getRecentPerformanceSamples(
        period === '1h' ? 60 : period === '6h' ? 360 : 1440 // Sample count based on period
      );

      const congestionData = samples.map(sample => ({
        timestamp: new Date(Date.now() - sample.samplePeriodSecs * 1000).toISOString(),
        slotTime: Math.round((sample.samplePeriodSecs / sample.numSlots) * 1000),
        tps: Math.round(sample.numTransactions / sample.samplePeriodSecs),
        congestionLevel: this.calculateCongestionLevel(sample.samplePeriodSecs / sample.numSlots)
      }));

      return {
        data: congestionData,
        period,
        averageCongestion: congestionData.length > 0 
          ? congestionData.reduce((sum, d) => sum + d.slotTime, 0) / congestionData.length
          : 0
      };

    } catch (error) {
      logger.error('Failed to get congestion data:', error);
      return { data: [], period, error: error.message };
    }
  }

  async getPlayerAnalytics(playerId: string, period: string = '30d', metric: string = 'activity') {
    try {
      const cacheKey = `player_analytics:${playerId}:${period}:${metric}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      let startDate: Date;
      switch (period) {
        case '24h':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const analytics = {
        activity: await this.getActivityAnalytics(playerId, startDate),
        performance: await this.getPerformanceAnalytics(playerId, startDate),
        spending: await this.getSpendingAnalytics(playerId, startDate),
        engagement: await this.getEngagementAnalytics(playerId, startDate)
      };

      const result = metric === 'all' ? analytics : { [metric]: analytics[metric as keyof typeof analytics] };

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(result));

      return result;

    } catch (error) {
      logger.error('Failed to get player analytics:', error);
      throw error;
    }
  }

  async getRealTimeMetrics() {
    try {
      // Get real-time system metrics
      const [
        activeConnections,
        queueStats,
        gameStats,
        errorRate
      ] = await Promise.all([
        this.getActiveConnections(),
        this.getQueueStats(),
        this.getRealTimeGameStats(),
        this.getErrorRate()
      ]);

      return {
        connections: activeConnections,
        queues: queueStats,
        games: gameStats,
        errors: errorRate,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get real-time metrics:', error);
      throw error;
    }
  }

  async recordCostMetric(playerId: string, costData: any) {
    try {
      const costMetric = await prisma.costMetrics.create({
        data: {
          playerId,
          category: costData.category,
          operation: costData.operation,
          costUsd: costData.costUsd,
          solanaFees: costData.solanaFees,
          computeUnits: costData.computeUnits ? BigInt(costData.computeUnits) : null,
          gameId: costData.gameId,
          metadata: costData.metadata || {}
        }
      });

      return costMetric;

    } catch (error) {
      logger.error('Failed to record cost metric:', error);
      throw error;
    }
  }

  async getOptimizationSuggestions(playerId: string, period: string = '30d') {
    const costSummary = await this.getCostSummary(playerId, {
      startDate: new Date(Date.now() - (period === '7d' ? 7 : period === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString()
    });

    return this.generateOptimizationSuggestions(await prisma.costMetrics.findMany({
      where: { playerId }
    }));
  }

  // Private helper methods
  private generateOptimizationSuggestions(metrics: any[]): string[] {
    const suggestions: string[] = [];

    // Analyze transaction fees
    const avgTransactionFee = metrics
      .filter(m => m.category === 'TRANSACTION_FEE')
      .reduce((sum, m) => sum + Number(m.costUsd), 0) / metrics.length;

    if (avgTransactionFee > 0.005) {
      suggestions.push('Consider batching transactions to reduce fees');
    }

    // Analyze compute costs
    const highComputeOps = metrics.filter(m => 
      m.category === 'COMPUTE_COST' && Number(m.computeUnits || 0) > 100000
    );

    if (highComputeOps.length > 0) {
      suggestions.push('Optimize high-compute operations to reduce costs');
    }

    // Analyze timing
    const peakHourOps = metrics.filter(m => {
      const hour = new Date(m.timestamp).getHours();
      return hour >= 12 && hour <= 18; // Peak hours (example)
    });

    if (peakHourOps.length > metrics.length * 0.5) {
      suggestions.push('Schedule operations during off-peak hours for lower fees');
    }

    return suggestions;
  }

  private calculatePotentialSavings(metrics: any[]): number {
    // Simple calculation - could be more sophisticated
    const totalCost = metrics.reduce((sum, m) => sum + Number(m.costUsd), 0);
    return totalCost * 0.15; // Assume 15% potential savings
  }

  private calculateCongestionLevel(avgSlotTime: number): string {
    if (avgSlotTime < 0.5) return 'low';
    if (avgSlotTime < 0.8) return 'medium';
    return 'high';
  }

  private async getActivityAnalytics(playerId: string, startDate: Date) {
    const games = await prisma.game.count({
      where: {
        OR: [{ player1Id: playerId }, { player2Id: playerId }],
        createdAt: { gte: startDate }
      }
    });

    return {
      gamesPlayed: games,
      dailyAverage: games / Math.ceil((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000))
    };
  }

  private async getPerformanceAnalytics(playerId: string, startDate: Date) {
    // Mock implementation
    return {
      winRate: 0.65,
      avgGameDuration: 180,
      ratingChange: 25
    };
  }

  private async getSpendingAnalytics(playerId: string, startDate: Date) {
    const spending = await prisma.costMetrics.aggregate({
      where: {
        playerId,
        timestamp: { gte: startDate }
      },
      _sum: { costUsd: true }
    });

    return {
      totalSpent: Number(spending._sum.costUsd || 0),
      avgPerDay: Number(spending._sum.costUsd || 0) / Math.ceil((Date.now() - startDate.getTime()) / (24 * 60 * 60 * 1000))
    };
  }

  private async getEngagementAnalytics(playerId: string, startDate: Date) {
    // Mock implementation
    return {
      sessionCount: 15,
      avgSessionLength: 45 * 60, // 45 minutes
      streakDays: 7
    };
  }

  private async getActiveConnections() {
    // Mock implementation - would integrate with WebSocket server
    return { total: 150, game: 80, lobby: 70 };
  }

  private async getQueueStats() {
    // Mock implementation - would integrate with queue system
    return {
      settlement: { active: 2, waiting: 5 },
      proof: { active: 8, waiting: 12 }
    };
  }

  private async getRealTimeGameStats() {
    const activeGames = await prisma.game.count({
      where: { status: { in: ['WAITING', 'STARTING', 'ACTIVE'] } }
    });

    return { active: activeGames };
  }

  private async getErrorRate() {
    // Mock implementation - would integrate with error tracking
    return { rate: 0.02, count: 12, last24h: 28 };
  }
}

export const metricsService = new MetricsService();