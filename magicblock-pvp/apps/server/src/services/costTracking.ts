// Prisma enum types - using string literals since direct enum imports are not working
type CostCategory = 'TRANSACTION_FEE' | 'COMPUTE_COST' | 'RENT_COST' | 'INFRASTRUCTURE' | 'THIRD_PARTY' | 'STORAGE';

const CostCategory = {
  TRANSACTION_FEE: 'TRANSACTION_FEE' as const,
  COMPUTE_COST: 'COMPUTE_COST' as const,
  RENT_COST: 'RENT_COST' as const,
  INFRASTRUCTURE: 'INFRASTRUCTURE' as const,
  THIRD_PARTY: 'THIRD_PARTY' as const,
  STORAGE: 'STORAGE' as const,
};
import { prisma } from '@/config/database';
import { logger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { config } from '@/config/environment';
import Decimal from 'decimal.js';

export interface CostData {
  category: CostCategory;
  operation: string;
  costUsd: number;
  solanaFees?: number;
  computeUnits?: number;
  executionTime?: number;
  metadata?: any;
  gameId?: string;
  playerId?: string;
}

export class CostTrackingService {
  private accumulatedCosts = new Map<string, number>();
  private costAlerts = new Set<string>();

  async recordCost(data: CostData): Promise<void> {
    if (!config.costs.trackingEnabled) {
      return;
    }

    try {
      // Record in database
      await prisma.costMetrics.create({
        data: {
          category: data.category,
          operation: data.operation,
          costUsd: new Decimal(data.costUsd),
          solanaFees: data.solanaFees ? new Decimal(data.solanaFees) : null,
          computeUnits: data.computeUnits ? BigInt(data.computeUnits) : null,
          executionTime: data.executionTime,
          metadata: data.metadata,
          gameId: data.gameId,
          playerId: data.playerId,
        },
      });

      // Update metrics
      metricsUtils.recordCost(data.category, data.operation, data.costUsd);

      // Update accumulated costs
      const key = `${data.category}:${data.operation}`;
      const currentCost = this.accumulatedCosts.get(key) || 0;
      this.accumulatedCosts.set(key, currentCost + data.costUsd);

      // Check for cost alerts
      await this.checkCostAlerts(key, this.accumulatedCosts.get(key)!);

      logger.debug('Cost recorded', {
        category: data.category,
        operation: data.operation,
        costUsd: data.costUsd,
        gameId: data.gameId,
      });
    } catch (error) {
      logger.error('Failed to record cost:', error);
    }
  }

  async getSolanaTransactionCost(signature: string): Promise<CostData> {
    // This would integrate with Solana to get actual transaction costs
    // For now, return estimated costs
    return {
      category: CostCategory.TRANSACTION_FEE,
      operation: 'solana_transaction',
      costUsd: 0.0001, // ~$0.0001 per transaction
      solanaFees: 0.000005, // 0.000005 SOL
      computeUnits: 200000,
      executionTime: 1000,
      metadata: { signature },
    };
  }

  async getComputeCost(computeUnits: number, operation: string): Promise<CostData> {
    const costPerUnit = 0.0000001; // $0.0000001 per compute unit
    return {
      category: CostCategory.COMPUTE_COST,
      operation,
      costUsd: computeUnits * costPerUnit,
      computeUnits,
    };
  }

  async getInfrastructureCost(operation: string, duration: number): Promise<CostData> {
    const costPerSecond = 0.0001; // $0.0001 per second
    return {
      category: CostCategory.INFRASTRUCTURE,
      operation,
      costUsd: (duration / 1000) * costPerSecond,
      executionTime: duration,
    };
  }

  async getStorageCost(dataSize: number, operation: string): Promise<CostData> {
    const costPerMB = 0.00001; // $0.00001 per MB
    const sizeMB = dataSize / (1024 * 1024);
    return {
      category: CostCategory.STORAGE,
      operation,
      costUsd: sizeMB * costPerMB,
      metadata: { dataSizeBytes: dataSize, dataSizeMB: sizeMB },
    };
  }

  async getCostSummary(timeframe: '24h' | '7d' | '30d' = '24h'): Promise<{
    totalCostUsd: number;
    byCategory: Record<CostCategory, number>;
    byOperation: Record<string, number>;
    topOperations: Array<{ operation: string; cost: number }>;
  }> {
    const hoursMap = { '24h': 24, '7d': 168, '30d': 720 };
    const hours = hoursMap[timeframe];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const costs = await prisma.costMetrics.findMany({
      where: {
        timestamp: { gte: since },
      },
      select: {
        category: true,
        operation: true,
        costUsd: true,
      },
    });

    const totalCostUsd = costs.reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);
    
    const byCategory: Record<CostCategory, number> = {} as any;
    const byOperation: Record<string, number> = {};

    for (const cost of costs) {
      byCategory[cost.category] = (byCategory[cost.category] || 0) + cost.costUsd.toNumber();
      byOperation[cost.operation] = (byOperation[cost.operation] || 0) + cost.costUsd.toNumber();
    }

    const topOperations = Object.entries(byOperation)
      .map(([operation, cost]) => ({ operation, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    return {
      totalCostUsd,
      byCategory,
      byOperation,
      topOperations,
    };
  }

  async getPlayerCosts(playerId: string, timeframe: '24h' | '7d' | '30d' = '24h'): Promise<{
    totalCostUsd: number;
    gamesPlayed: number;
    avgCostPerGame: number;
    costBreakdown: Record<CostCategory, number>;
  }> {
    const hoursMap = { '24h': 24, '7d': 168, '30d': 720 };
    const hours = hoursMap[timeframe];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [costs, games] = await Promise.all([
      prisma.costMetrics.findMany({
        where: {
          playerId,
          timestamp: { gte: since },
        },
        select: {
          category: true,
          costUsd: true,
          gameId: true,
        },
      }),
      prisma.game.count({
        where: {
          OR: [{ player1Id: playerId }, { player2Id: playerId }],
          createdAt: { gte: since },
          status: 'COMPLETED',
        },
      }),
    ]);

    const totalCostUsd = costs.reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);
    const uniqueGames = new Set(costs.map(cost => cost.gameId).filter(Boolean)).size;
    const gamesPlayed = Math.max(games, uniqueGames);
    const avgCostPerGame = gamesPlayed > 0 ? totalCostUsd / gamesPlayed : 0;

    const costBreakdown: Record<CostCategory, number> = {} as any;
    for (const cost of costs) {
      costBreakdown[cost.category] = (costBreakdown[cost.category] || 0) + cost.costUsd.toNumber();
    }

    return {
      totalCostUsd,
      gamesPlayed,
      avgCostPerGame,
      costBreakdown,
    };
  }

  async getGameCosts(gameId: string): Promise<{
    totalCostUsd: number;
    costBreakdown: Record<CostCategory, number>;
    operationCosts: Array<{ operation: string; cost: number; timestamp: Date }>;
  }> {
    const costs = await prisma.costMetrics.findMany({
      where: { gameId },
      select: {
        category: true,
        operation: true,
        costUsd: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'asc' },
    });

    const totalCostUsd = costs.reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);

    const costBreakdown: Record<CostCategory, number> = {} as any;
    for (const cost of costs) {
      costBreakdown[cost.category] = (costBreakdown[cost.category] || 0) + cost.costUsd.toNumber();
    }

    const operationCosts = costs.map(cost => ({
      operation: cost.operation,
      cost: cost.costUsd.toNumber(),
      timestamp: cost.timestamp,
    }));

    return {
      totalCostUsd,
      costBreakdown,
      operationCosts,
    };
  }

  private async checkCostAlerts(key: string, currentCost: number): Promise<void> {
    if (currentCost > config.costs.alertThresholdUsd && !this.costAlerts.has(key)) {
      this.costAlerts.add(key);
      
      logger.warn('Cost alert triggered', {
        operation: key,
        currentCost,
        threshold: config.costs.alertThresholdUsd,
      });

      // Here you could send alerts to external systems
      // e.g., Slack, email, PagerDuty, etc.
    }
  }

  async getCostTrends(days: number = 7): Promise<Array<{
    date: string;
    totalCost: number;
    transactionCosts: number;
    computeCosts: number;
    infraCosts: number;
  }>> {
    const trends = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      
      const dayCosts = await prisma.costMetrics.findMany({
        where: {
          timestamp: {
            gte: date,
            lt: nextDate,
          },
        },
        select: {
          category: true,
          costUsd: true,
        },
      });

      const totalCost = dayCosts.reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);
      const transactionCosts = dayCosts
        .filter(cost => cost.category === CostCategory.TRANSACTION_FEE)
        .reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);
      const computeCosts = dayCosts
        .filter(cost => cost.category === CostCategory.COMPUTE_COST)
        .reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);
      const infraCosts = dayCosts
        .filter(cost => cost.category === CostCategory.INFRASTRUCTURE)
        .reduce((sum, cost) => sum + cost.costUsd.toNumber(), 0);

      trends.push({
        date: date.toISOString().split('T')[0],
        totalCost,
        transactionCosts,
        computeCosts,
        infraCosts,
      });
    }

    return trends;
  }

  // Helper methods for common cost recording scenarios
  async recordTransactionCost(signature: string, gameId?: string, playerId?: string): Promise<void> {
    const costData = await this.getSolanaTransactionCost(signature);
    costData.gameId = gameId;
    costData.playerId = playerId;
    await this.recordCost(costData);
  }

  async recordGameOperationCost(operation: string, duration: number, gameId: string): Promise<void> {
    const infraCost = await this.getInfrastructureCost(`game_${operation}`, duration);
    infraCost.gameId = gameId;
    await this.recordCost(infraCost);
  }

  async recordDatabaseOperationCost(operation: string, dataSize: number, gameId?: string): Promise<void> {
    const storageCost = await this.getStorageCost(dataSize, `db_${operation}`);
    storageCost.gameId = gameId;
    await this.recordCost(storageCost);
  }
}

export const costTrackingService = new CostTrackingService();