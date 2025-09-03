import { costTrackingService } from './costTracking';
import { transactionQueueService } from './transactionQueue';
import { feeEstimationService } from './feeEstimation';
import { logger } from '@/config/logger';
import { prisma } from '@/config/database';

export interface HistoricalTrend {
  date: string;
  totalCost: number;
  transactionCount: number;
  avgCostPerTransaction: number;
  categories: Record<string, number>;
  networkCongestion: 'low' | 'medium' | 'high';
}

export interface CostPrediction {
  period: '1d' | '7d' | '30d';
  predictedCost: number;
  confidence: number;
  factors: {
    historicalTrend: number;
    seasonality: number;
    networkConditions: number;
  };
  recommendations: string[];
}

export interface PerformanceAnalysis {
  timeframe: string;
  metrics: {
    avgTransactionTime: number;
    successRate: number;
    costEfficiency: number;
    networkUtilization: number;
  };
  trends: {
    improving: string[];
    declining: string[];
    stable: string[];
  };
  insights: string[];
}

export class HistoricalAnalysisService {
  
  async generateCostTrendReport(days: number = 30): Promise<{
    trends: HistoricalTrend[];
    summary: {
      totalPeriodCost: number;
      avgDailyCost: number;
      costGrowthRate: number;
      peakCostDay: string;
      lowestCostDay: string;
    };
    insights: string[];
  }> {
    try {
      const trends = await costTrackingService.getCostTrends(days);
      
      if (trends.length === 0) {
        return {
          trends: [],
          summary: {
            totalPeriodCost: 0,
            avgDailyCost: 0,
            costGrowthRate: 0,
            peakCostDay: '',
            lowestCostDay: ''
          },
          insights: ['No historical data available for analysis']
        };
      }

      // Calculate summary statistics
      const totalPeriodCost = trends.reduce((sum, t) => sum + t.totalCost, 0);
      const avgDailyCost = totalPeriodCost / trends.length;
      
      // Calculate growth rate (first vs last week average)
      const firstWeek = trends.slice(0, 7);
      const lastWeek = trends.slice(-7);
      const firstWeekAvg = firstWeek.reduce((sum, t) => sum + t.totalCost, 0) / firstWeek.length;
      const lastWeekAvg = lastWeek.reduce((sum, t) => sum + t.totalCost, 0) / lastWeek.length;
      const costGrowthRate = firstWeekAvg > 0 ? ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100 : 0;
      
      // Find peak and lowest cost days
      const peakDay = trends.reduce((max, t) => t.totalCost > max.totalCost ? t : max);
      const lowestDay = trends.reduce((min, t) => t.totalCost < min.totalCost ? t : min);

      // Generate insights
      const insights = this.generateCostInsights(trends, {
        totalPeriodCost,
        avgDailyCost,
        costGrowthRate,
        peakCostDay: peakDay.date,
        lowestCostDay: lowestDay.date
      });

      return {
        trends: trends.map(t => ({
          date: t.date,
          totalCost: t.totalCost,
          transactionCount: 0, // Would come from transaction logs
          avgCostPerTransaction: 0,
          categories: {
            transaction: t.transactionCosts,
            compute: t.computeCosts,
            infrastructure: t.infraCosts
          },
          networkCongestion: t.transactionCosts > avgDailyCost * 1.5 ? 'high' : 
                           t.transactionCosts > avgDailyCost * 1.2 ? 'medium' : 'low'
        })),
        summary: {
          totalPeriodCost,
          avgDailyCost,
          costGrowthRate,
          peakCostDay: peakDay.date,
          lowestCostDay: lowestDay.date
        },
        insights
      };
    } catch (error) {
      logger.error('Failed to generate cost trend report:', error);
      throw error;
    }
  }

  async predictFutureCosts(period: '1d' | '7d' | '30d' = '7d'): Promise<CostPrediction> {
    try {
      // Get historical data for prediction
      const historicalDays = period === '1d' ? 7 : period === '7d' ? 30 : 90;
      const trends = await costTrackingService.getCostTrends(historicalDays);
      
      if (trends.length < 3) {
        return {
          period,
          predictedCost: 0,
          confidence: 0,
          factors: { historicalTrend: 0, seasonality: 0, networkConditions: 0 },
          recommendations: ['Insufficient historical data for prediction']
        };
      }

      // Simple linear regression for trend
      const costs = trends.map(t => t.totalCost);
      const trendFactor = this.calculateTrendFactor(costs);
      
      // Seasonality factor (simplified - would use more sophisticated analysis in production)
      const dayOfWeek = new Date().getDay();
      const seasonalityFactor = this.getSeasonalityFactor(dayOfWeek, trends);
      
      // Network conditions factor
      const congestion = await transactionQueueService.getCurrentCongestion();
      const networkFactor = congestion.level === 'high' ? 1.3 : 
                          congestion.level === 'medium' ? 1.1 : 0.9;

      // Predict based on recent average and factors
      const recentAvg = costs.slice(-7).reduce((sum, c) => sum + c, 0) / 7;
      const multiplier = period === '1d' ? 1 : period === '7d' ? 7 : 30;
      
      const predictedCost = recentAvg * multiplier * trendFactor * seasonalityFactor * networkFactor;
      
      // Calculate confidence based on data variance
      const variance = this.calculateVariance(costs);
      const confidence = Math.max(0, Math.min(100, 100 - (variance * 100 / recentAvg)));

      // Generate recommendations
      const recommendations = this.generatePredictionRecommendations(
        predictedCost / multiplier, // daily predicted cost
        recentAvg,
        trendFactor,
        seasonalityFactor,
        networkFactor
      );

      return {
        period,
        predictedCost,
        confidence,
        factors: {
          historicalTrend: trendFactor,
          seasonality: seasonalityFactor,
          networkConditions: networkFactor
        },
        recommendations
      };
    } catch (error) {
      logger.error('Failed to predict future costs:', error);
      throw error;
    }
  }

  async analyzePerformanceMetrics(timeframe: '24h' | '7d' | '30d' = '24h'): Promise<PerformanceAnalysis> {
    try {
      const [costSummary, queueStats, feeTrends] = await Promise.all([
        costTrackingService.getCostSummary(timeframe),
        transactionQueueService.getStats(),
        feeEstimationService.getRecentFeeTrends()
      ]);

      // Calculate performance metrics
      const totalTransactions = queueStats.completed + queueStats.failed;
      const successRate = totalTransactions > 0 ? (queueStats.completed / totalTransactions) * 100 : 0;
      const avgTransactionTime = queueStats.avgProcessingTime;
      const costEfficiency = totalTransactions > 0 ? (successRate / 100) / (costSummary.totalCostUsd + 0.001) * 100 : 0;
      
      // Network utilization based on queue size and processing
      const congestion = await transactionQueueService.getCurrentCongestion();
      const networkUtilization = congestion.level === 'high' ? 90 : 
                                congestion.level === 'medium' ? 60 : 30;

      // Analyze trends (simplified)
      const trends = {
        improving: [] as string[],
        declining: [] as string[],
        stable: [] as string[]
      };

      if (feeTrends.trend === 'decreasing') {
        trends.improving.push('Transaction fees');
      } else if (feeTrends.trend === 'increasing') {
        trends.declining.push('Transaction fees');
      } else {
        trends.stable.push('Transaction fees');
      }

      if (successRate > 95) {
        trends.stable.push('Success rate');
      } else if (successRate > 90) {
        trends.improving.push('Success rate');
      } else {
        trends.declining.push('Success rate');
      }

      // Generate insights
      const insights = this.generatePerformanceInsights({
        avgTransactionTime,
        successRate,
        costEfficiency,
        networkUtilization
      }, trends);

      return {
        timeframe,
        metrics: {
          avgTransactionTime,
          successRate,
          costEfficiency,
          networkUtilization
        },
        trends,
        insights
      };
    } catch (error) {
      logger.error('Failed to analyze performance metrics:', error);
      throw error;
    }
  }

  async generateOptimizationReport(): Promise<{
    costOptimizations: Array<{
      area: string;
      potential: number;
      difficulty: 'low' | 'medium' | 'high';
      description: string;
      steps: string[];
    }>;
    performanceOptimizations: Array<{
      area: string;
      impact: 'low' | 'medium' | 'high';
      description: string;
      steps: string[];
    }>;
    priorityRecommendations: string[];
  }> {
    try {
      const [costSummary, queueStats, congestion] = await Promise.all([
        costTrackingService.getCostSummary('24h'),
        transactionQueueService.getStats(),
        transactionQueueService.getCurrentCongestion()
      ]);

      const costOptimizations = [];
      const performanceOptimizations = [];
      const priorityRecommendations = [];

      // Cost optimization opportunities
      if (costSummary.totalCostUsd > 10) { // More than $10/day
        costOptimizations.push({
          area: 'Transaction Batching',
          potential: 25, // 25% cost reduction
          difficulty: 'medium' as const,
          description: 'Batch multiple operations into single transactions',
          steps: [
            'Implement transaction batching for non-critical operations',
            'Group similar operations together',
            'Use program-derived addresses efficiently'
          ]
        });
      }

      if (congestion.level === 'high') {
        costOptimizations.push({
          area: 'Fee Optimization',
          potential: 15,
          difficulty: 'low' as const,
          description: 'Implement dynamic fee adjustment',
          steps: [
            'Use adaptive priority fees',
            'Schedule non-critical transactions for off-peak times',
            'Implement fee capping for cost control'
          ]
        });
      }

      // Performance optimization opportunities
      if (queueStats.avgProcessingTime > 3000) {
        performanceOptimizations.push({
          area: 'Queue Processing',
          impact: 'high' as const,
          description: 'Optimize transaction queue processing',
          steps: [
            'Increase concurrent transaction limits',
            'Implement parallel processing for independent transactions',
            'Add queue prioritization logic'
          ]
        });
      }

      const successRate = queueStats.completed + queueStats.failed > 0 
        ? (queueStats.completed / (queueStats.completed + queueStats.failed)) * 100 
        : 100;
      
      if (successRate < 95) {
        performanceOptimizations.push({
          area: 'Transaction Reliability',
          impact: 'high' as const,
          description: 'Improve transaction success rates',
          steps: [
            'Implement better error handling and retries',
            'Use transaction confirmation strategies',
            'Add circuit breakers for failing operations'
          ]
        });
      }

      // Priority recommendations
      if (costSummary.totalCostUsd > 50) {
        priorityRecommendations.push('🚨 HIGH PRIORITY: Daily costs exceed $50 - implement cost controls immediately');
      }
      
      if (successRate < 90) {
        priorityRecommendations.push('🚨 HIGH PRIORITY: Transaction success rate below 90% - investigate failures');
      }
      
      if (congestion.level === 'high' && queueStats.pending > 50) {
        priorityRecommendations.push('⚠️ MEDIUM PRIORITY: High network congestion with large queue - optimize processing');
      }

      if (priorityRecommendations.length === 0) {
        priorityRecommendations.push('✅ System operating within normal parameters');
      }

      return {
        costOptimizations,
        performanceOptimizations,
        priorityRecommendations
      };
    } catch (error) {
      logger.error('Failed to generate optimization report:', error);
      throw error;
    }
  }

  private calculateTrendFactor(costs: number[]): number {
    if (costs.length < 2) return 1;
    
    const recent = costs.slice(-7);
    const older = costs.slice(-14, -7);
    
    if (older.length === 0) return 1;
    
    const recentAvg = recent.reduce((sum, c) => sum + c, 0) / recent.length;
    const olderAvg = older.reduce((sum, c) => sum + c, 0) / older.length;
    
    return olderAvg > 0 ? recentAvg / olderAvg : 1;
  }

  private getSeasonalityFactor(dayOfWeek: number, trends: any[]): number {
    // Simplified seasonality - in production would use more sophisticated analysis
    // Weekend typically has lower activity
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 0.8; // 20% lower on weekends
    }
    return 1.0;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
  }

  private generateCostInsights(trends: any[], summary: any): string[] {
    const insights = [];

    if (summary.costGrowthRate > 20) {
      insights.push(`⚠️ Cost growth rate is ${summary.costGrowthRate.toFixed(1)}% - consider cost optimization measures`);
    } else if (summary.costGrowthRate < -10) {
      insights.push(`✅ Cost reduction of ${Math.abs(summary.costGrowthRate).toFixed(1)}% observed - optimizations are working`);
    }

    if (summary.totalPeriodCost > 500) {
      insights.push(`💰 High total costs ($${summary.totalPeriodCost.toFixed(2)}) - review cost breakdown for optimization opportunities`);
    }

    const highCostDays = trends.filter(t => t.totalCost > summary.avgDailyCost * 1.5).length;
    if (highCostDays > trends.length * 0.2) {
      insights.push(`📊 ${highCostDays} days had unusually high costs - investigate peak usage patterns`);
    }

    return insights;
  }

  private generatePredictionRecommendations(
    dailyPredicted: number, 
    recentAvg: number, 
    trendFactor: number,
    seasonalityFactor: number,
    networkFactor: number
  ): string[] {
    const recommendations = [];

    if (dailyPredicted > recentAvg * 1.2) {
      recommendations.push('📈 Costs expected to increase - consider implementing cost controls');
    }

    if (trendFactor > 1.2) {
      recommendations.push('📊 Strong upward cost trend detected - review recent changes and optimize high-cost operations');
    }

    if (networkFactor > 1.2) {
      recommendations.push('🌐 High network congestion expected - consider delaying non-critical transactions');
    }

    if (dailyPredicted > 100) {
      recommendations.push('💸 High daily costs predicted (>$100) - implement spending alerts and limits');
    }

    return recommendations;
  }

  private generatePerformanceInsights(metrics: any, trends: any): string[] {
    const insights = [];

    if (metrics.successRate < 95) {
      insights.push(`⚠️ Success rate (${metrics.successRate.toFixed(1)}%) below target - investigate transaction failures`);
    }

    if (metrics.avgTransactionTime > 5000) {
      insights.push(`⏱️ Average transaction time (${metrics.avgTransactionTime}ms) is high - optimize processing`);
    }

    if (metrics.costEfficiency < 50) {
      insights.push(`💰 Cost efficiency is low - review cost per successful transaction`);
    }

    if (trends.declining.length > trends.improving.length) {
      insights.push(`📉 More metrics declining than improving - system performance may be degrading`);
    }

    return insights;
  }
}

export const historicalAnalysisService = new HistoricalAnalysisService();