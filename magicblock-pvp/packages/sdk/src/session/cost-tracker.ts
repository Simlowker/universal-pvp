/**
 * Cost Tracker - Monitor and optimize transaction costs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'eventemitter3';
import { CostEstimate, CostTracking, SDKEvents, MagicBlockError } from '../types';

export class CostTracker extends EventEmitter<SDKEvents> {
  private costHistory: Array<{
    timestamp: number;
    cost: number;
    gasUsed: number;
    baseFee: number;
    priorityFee: number;
    transactionType: string;
  }> = [];

  private currentTracking: CostTracking = {
    totalSpent: 0,
    transactionCount: 0,
    averageCost: 0,
    hourlySpend: 0,
    projectedDailySpend: 0
  };

  private connection: Connection;
  private feeHistory: number[] = [];
  private gasEstimates = new Map<string, number>();

  constructor(connection: Connection) {
    super();
    this.connection = connection;
    
    // Update fee data periodically
    setInterval(() => this.updateFeeData(), 30000); // Every 30 seconds
    setInterval(() => this.updateHourlySpend(), 3600000); // Every hour
    
    // Initial fee data fetch
    this.updateFeeData();
  }

  /**
   * Estimate transaction cost
   */
  async estimateTransactionCost(
    transactionType: string,
    computeUnits?: number,
    priorityLevel: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<CostEstimate> {
    try {
      // Get recent fee data
      const recentFees = await this.getRecentFees();
      const baseFee = recentFees.baseFee;
      
      // Calculate priority fee based on level
      const priorityMultipliers = { low: 1, medium: 1.5, high: 2 };
      const priorityFee = Math.round(baseFee * priorityMultipliers[priorityLevel]);
      
      // Estimate compute units if not provided
      const estimatedComputeUnits = computeUnits || this.getComputeUnitEstimate(transactionType);
      
      // Calculate total cost
      const totalCost = (baseFee + priorityFee) * (estimatedComputeUnits / 1000000); // Convert to SOL
      
      // Calculate confidence based on fee volatility
      const confidence = this.calculateFeeConfidence();
      
      const estimate: CostEstimate = {
        baseFee,
        priorityFee,
        computeUnits: estimatedComputeUnits,
        totalCost,
        confidence
      };

      return estimate;
    } catch (error) {
      throw new MagicBlockError(
        `Cost estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'COST_ESTIMATION_ERROR'
      );
    }
  }

  /**
   * Record actual transaction cost
   */
  recordTransactionCost(
    transactionType: string,
    actualCost: number,
    gasUsed: number,
    baseFee: number,
    priorityFee: number
  ): void {
    const record = {
      timestamp: Date.now(),
      cost: actualCost,
      gasUsed,
      baseFee,
      priorityFee,
      transactionType
    };

    this.costHistory.push(record);
    
    // Keep only last 1000 records
    if (this.costHistory.length > 1000) {
      this.costHistory.shift();
    }

    // Update tracking
    this.updateCostTracking(actualCost);
    
    // Update gas estimates
    this.updateGasEstimate(transactionType, gasUsed);
    
    this.emit('cost:updated', this.currentTracking);
  }

  /**
   * Get cost tracking data
   */
  getCostTracking(): CostTracking {
    return { ...this.currentTracking };
  }

  /**
   * Get cost history for analysis
   */
  getCostHistory(hours: number = 24): typeof this.costHistory {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.costHistory.filter(record => record.timestamp >= cutoff);
  }

  /**
   * Get average cost for transaction type
   */
  getAverageCost(transactionType: string, hours: number = 24): number {
    const recentHistory = this.getCostHistory(hours);
    const typeRecords = recentHistory.filter(record => record.transactionType === transactionType);
    
    if (typeRecords.length === 0) return 0;
    
    const totalCost = typeRecords.reduce((sum, record) => sum + record.cost, 0);
    return totalCost / typeRecords.length;
  }

  /**
   * Get cost optimization suggestions
   */
  getOptimizationSuggestions(): Array<{
    type: 'fee_reduction' | 'batching' | 'timing' | 'gas_optimization';
    description: string;
    potentialSavings: number;
  }> {
    const suggestions: Array<{
      type: 'fee_reduction' | 'batching' | 'timing' | 'gas_optimization';
      description: string;
      potentialSavings: number;
    }> = [];

    // Analyze recent transactions
    const recentHistory = this.getCostHistory(1); // Last hour
    
    // Fee reduction suggestion
    const highPriorityTxs = recentHistory.filter(r => r.priorityFee > r.baseFee * 1.5);
    if (highPriorityTxs.length > 0) {
      const potentialSavings = highPriorityTxs.reduce((sum, tx) => 
        sum + (tx.priorityFee - tx.baseFee), 0
      );
      
      suggestions.push({
        type: 'fee_reduction',
        description: 'Consider using lower priority fees for non-urgent transactions',
        potentialSavings
      });
    }

    // Batching suggestion
    const frequentTxTypes = this.getFrequentTransactionTypes(recentHistory);
    if (frequentTxTypes.length > 0) {
      const batchableTxs = recentHistory.filter(r => 
        frequentTxTypes.includes(r.transactionType)
      );
      
      const potentialSavings = batchableTxs.length * 0.00001; // Estimated savings per tx
      
      suggestions.push({
        type: 'batching',
        description: `Batch ${frequentTxTypes.join(', ')} transactions for efficiency`,
        potentialSavings
      });
    }

    // Timing suggestion
    const peakHourCosts = this.analyzePeakHours();
    if (peakHourCosts.isPeakTime) {
      suggestions.push({
        type: 'timing',
        description: 'Consider executing non-urgent transactions during off-peak hours',
        potentialSavings: peakHourCosts.potentialSavings
      });
    }

    return suggestions;
  }

  /**
   * Get recent fee data from network
   */
  private async getRecentFees(): Promise<{ baseFee: number; averageFee: number }> {
    try {
      // Get recent block with fee data
      const recentBlockhash = await this.connection.getLatestBlockhash();
      
      // For Solana, we'll use a simplified fee estimation
      // In production, you'd want to use more sophisticated fee estimation
      const baseFee = 5000; // 5,000 lamports base fee
      const averageFee = this.feeHistory.length > 0 
        ? this.feeHistory.reduce((sum, fee) => sum + fee, 0) / this.feeHistory.length
        : baseFee;
      
      // Update fee history
      this.feeHistory.push(baseFee);
      if (this.feeHistory.length > 100) {
        this.feeHistory.shift();
      }
      
      return { baseFee, averageFee };
    } catch (error) {
      // Fallback to default values
      return { baseFee: 5000, averageFee: 5000 };
    }
  }

  /**
   * Update fee data from network
   */
  private async updateFeeData(): Promise<void> {
    try {
      await this.getRecentFees();
    } catch (error) {
      console.warn('Failed to update fee data:', error);
    }
  }

  /**
   * Get compute unit estimate for transaction type
   */
  private getComputeUnitEstimate(transactionType: string): number {
    const estimates = this.gasEstimates.get(transactionType);
    if (estimates) {
      return estimates;
    }

    // Default estimates by transaction type
    const defaults: Record<string, number> = {
      'transfer': 200000,
      'swap': 400000,
      'stake': 300000,
      'unstake': 300000,
      'game_action': 250000,
      'nft_mint': 350000,
      'program_invoke': 200000
    };

    return defaults[transactionType] || 200000;
  }

  /**
   * Update gas estimate based on actual usage
   */
  private updateGasEstimate(transactionType: string, actualGasUsed: number): void {
    const currentEstimate = this.gasEstimates.get(transactionType) || actualGasUsed;
    
    // Use exponential moving average
    const alpha = 0.1;
    const newEstimate = Math.round((1 - alpha) * currentEstimate + alpha * actualGasUsed);
    
    this.gasEstimates.set(transactionType, newEstimate);
  }

  /**
   * Calculate confidence in fee estimates
   */
  private calculateFeeConfidence(): number {
    if (this.feeHistory.length < 10) {
      return 0.5; // Low confidence with limited data
    }

    // Calculate coefficient of variation (standard deviation / mean)
    const mean = this.feeHistory.reduce((sum, fee) => sum + fee, 0) / this.feeHistory.length;
    const variance = this.feeHistory.reduce((sum, fee) => sum + Math.pow(fee - mean, 2), 0) / this.feeHistory.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean;

    // Convert CV to confidence (lower CV = higher confidence)
    return Math.max(0.1, Math.min(1, 1 - cv));
  }

  /**
   * Update cost tracking metrics
   */
  private updateCostTracking(newCost: number): void {
    this.currentTracking.totalSpent += newCost;
    this.currentTracking.transactionCount++;
    this.currentTracking.averageCost = this.currentTracking.totalSpent / this.currentTracking.transactionCount;
  }

  /**
   * Update hourly spend calculation
   */
  private updateHourlySpend(): void {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const hourlyTransactions = this.costHistory.filter(record => record.timestamp >= oneHourAgo);
    
    this.currentTracking.hourlySpend = hourlyTransactions.reduce((sum, record) => sum + record.cost, 0);
    this.currentTracking.projectedDailySpend = this.currentTracking.hourlySpend * 24;
  }

  /**
   * Get frequent transaction types for batching suggestions
   */
  private getFrequentTransactionTypes(history: typeof this.costHistory): string[] {
    const typeCounts = new Map<string, number>();
    
    history.forEach(record => {
      typeCounts.set(record.transactionType, (typeCounts.get(record.transactionType) || 0) + 1);
    });
    
    return Array.from(typeCounts.entries())
      .filter(([_, count]) => count >= 3) // At least 3 transactions
      .map(([type, _]) => type);
  }

  /**
   * Analyze peak hours for cost optimization
   */
  private analyzePeakHours(): { isPeakTime: boolean; potentialSavings: number } {
    const currentHour = new Date().getHours();
    const recentHistory = this.getCostHistory(24);
    
    // Group by hour
    const hourlyAverages = new Map<number, number[]>();
    
    recentHistory.forEach(record => {
      const hour = new Date(record.timestamp).getHours();
      if (!hourlyAverages.has(hour)) {
        hourlyAverages.set(hour, []);
      }
      hourlyAverages.get(hour)!.push(record.cost);
    });
    
    // Calculate average cost per hour
    const hourlyAvgs = new Map<number, number>();
    hourlyAverages.forEach((costs, hour) => {
      const avg = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
      hourlyAvgs.set(hour, avg);
    });
    
    if (hourlyAvgs.size === 0) {
      return { isPeakTime: false, potentialSavings: 0 };
    }
    
    const allAverages = Array.from(hourlyAvgs.values());
    const overallAverage = allAverages.reduce((sum, avg) => sum + avg, 0) / allAverages.length;
    const currentHourAvg = hourlyAvgs.get(currentHour) || overallAverage;
    
    const isPeakTime = currentHourAvg > overallAverage * 1.2; // 20% above average
    const potentialSavings = isPeakTime ? (currentHourAvg - overallAverage) : 0;
    
    return { isPeakTime, potentialSavings };
  }

  /**
   * Reset cost tracking data
   */
  resetTracking(): void {
    this.costHistory = [];
    this.currentTracking = {
      totalSpent: 0,
      transactionCount: 0,
      averageCost: 0,
      hourlySpend: 0,
      projectedDailySpend: 0
    };
    this.feeHistory = [];
    this.gasEstimates.clear();
  }

  /**
   * Export cost data for analysis
   */
  exportData(): {
    costHistory: Array<{
      timestamp: number;
      cost: number;
      gasUsed: number;
      baseFee: number;
      priorityFee: number;
      transactionType: string;
    }>;
    currentTracking: CostTracking;
    gasEstimates: Record<string, number>;
  } {
    return {
      costHistory: [...this.costHistory],
      currentTracking: { ...this.currentTracking },
      gasEstimates: Object.fromEntries(this.gasEstimates)
    };
  }
}