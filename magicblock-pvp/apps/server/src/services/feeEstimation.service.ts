import { Connection, clusterApiUrl } from '@solana/web3.js';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { config } from '@/config/environment';
import { FeeEstimate, FeeEstimationRequest } from '@/types/api.types';

export interface FeeStrategy {
  estimateFee(request: FeeEstimationRequest): Promise<number>;
}

export class ProviderFeeStrategy implements FeeStrategy {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl || clusterApiUrl('devnet'));
  }

  async estimateFee(request: FeeEstimationRequest): Promise<number> {
    try {
      const recentBlockhash = await this.connection.getLatestBlockhash();
      const feeCalculator = await this.connection.getFeeCalculatorForBlockhash(recentBlockhash.blockhash);
      
      if (!feeCalculator.value) {
        throw new Error('Unable to get fee calculator');
      }

      // Base fee from network
      let baseFee = feeCalculator.value.lamportsPerSignature;

      // Adjust based on complexity
      const complexityMultiplier = this.getComplexityMultiplier(request.complexity);
      const urgencyMultiplier = this.getUrgencyMultiplier(request.urgency);

      return Math.ceil(baseFee * complexityMultiplier * urgencyMultiplier);
    } catch (error) {
      logger.error('Provider fee estimation failed:', error);
      throw error;
    }
  }

  private getComplexityMultiplier(complexity?: string): number {
    switch (complexity) {
      case 'low': return 1.0;
      case 'medium': return 1.5;
      case 'high': return 2.5;
      default: return 1.2;
    }
  }

  private getUrgencyMultiplier(urgency?: string): number {
    switch (urgency) {
      case 'low': return 1.0;
      case 'normal': return 1.3;
      case 'high': return 2.0;
      default: return 1.3;
    }
  }
}

export class RecentFeesStrategy implements FeeStrategy {
  private readonly CACHE_KEY = 'recent_fees';
  private readonly CACHE_TTL = 30; // 30 seconds

  async estimateFee(request: FeeEstimationRequest): Promise<number> {
    try {
      // Try to get recent fees from cache
      const cachedFees = await redis.get(this.CACHE_KEY);
      let recentFees: number[] = [];

      if (cachedFees) {
        recentFees = JSON.parse(cachedFees);
      } else {
        // Fetch recent fees and cache them
        recentFees = await this.fetchRecentFees();
        await redis.setex(this.CACHE_KEY, this.CACHE_TTL, JSON.stringify(recentFees));
      }

      if (recentFees.length === 0) {
        throw new Error('No recent fee data available');
      }

      // Calculate percentile-based fee
      const percentile = this.getPercentileForUrgency(request.urgency);
      const baseEstimate = this.calculatePercentile(recentFees, percentile);

      // Apply complexity multiplier
      const complexityMultiplier = this.getComplexityMultiplier(request.complexity);
      
      return Math.ceil(baseEstimate * complexityMultiplier);
    } catch (error) {
      logger.error('Recent fees estimation failed:', error);
      throw error;
    }
  }

  private async fetchRecentFees(): Promise<number[]> {
    const connection = new Connection(config.solana.rpcUrl || clusterApiUrl('devnet'));
    
    try {
      const signatures = await connection.getSignaturesForAddress(
        connection.publicKey!, // This would be your program's public key
        { limit: 100 }
      );

      const fees: number[] = [];
      
      for (const sig of signatures.slice(0, 20)) { // Process last 20 transactions
        try {
          const transaction = await connection.getTransaction(sig.signature);
          if (transaction?.meta?.fee) {
            fees.push(transaction.meta.fee);
          }
        } catch (error) {
          // Skip failed transactions
          continue;
        }
      }

      return fees.filter(fee => fee > 0).sort((a, b) => a - b);
    } catch (error) {
      logger.error('Failed to fetch recent fees:', error);
      return [];
    }
  }

  private getPercentileForUrgency(urgency?: string): number {
    switch (urgency) {
      case 'low': return 25;
      case 'normal': return 50;
      case 'high': return 90;
      default: return 50;
    }
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  private getComplexityMultiplier(complexity?: string): number {
    switch (complexity) {
      case 'low': return 1.0;
      case 'medium': return 1.3;
      case 'high': return 2.0;
      default: return 1.2;
    }
  }
}

export class EmergencyFallbackStrategy implements FeeStrategy {
  private readonly FALLBACK_FEES = {
    low: 5000,      // 5,000 lamports
    medium: 10000,  // 10,000 lamports  
    high: 25000,    // 25,000 lamports
  };

  async estimateFee(request: FeeEstimationRequest): Promise<number> {
    const complexity = request.complexity || 'medium';
    const urgencyMultiplier = this.getUrgencyMultiplier(request.urgency);
    
    const baseFee = this.FALLBACK_FEES[complexity as keyof typeof this.FALLBACK_FEES] || this.FALLBACK_FEES.medium;
    
    return Math.ceil(baseFee * urgencyMultiplier);
  }

  private getUrgencyMultiplier(urgency?: string): number {
    switch (urgency) {
      case 'low': return 0.8;
      case 'normal': return 1.0;
      case 'high': return 1.5;
      default: return 1.0;
    }
  }
}

export class FeeEstimationService {
  private strategies: FeeStrategy[];
  private connection: Connection;

  constructor() {
    this.strategies = [
      new ProviderFeeStrategy(),
      new RecentFeesStrategy(),
      new EmergencyFallbackStrategy()
    ];
    this.connection = new Connection(config.solana.rpcUrl || clusterApiUrl('devnet'));
  }

  async estimateFee(request: FeeEstimationRequest): Promise<FeeEstimate> {
    const startTime = Date.now();
    
    try {
      // Try strategies in order until one succeeds
      let baseFee: number = 0;
      let strategyUsed = 'fallback';

      for (let i = 0; i < this.strategies.length; i++) {
        try {
          baseFee = await this.strategies[i].estimateFee(request);
          strategyUsed = this.strategies[i].constructor.name;
          break;
        } catch (error) {
          logger.warn(`Fee strategy ${this.strategies[i].constructor.name} failed:`, error);
          if (i === this.strategies.length - 1) {
            throw error; // If all strategies fail, throw the last error
          }
        }
      }

      // Get current congestion level
      const congestionLevel = await this.getCongestionLevel();
      
      // Calculate priority fee based on congestion
      const priorityFee = this.calculatePriorityFee(baseFee, congestionLevel, request.urgency);
      
      const totalFee = baseFee + priorityFee;
      
      // Convert to USD (using cached SOL price)
      const costUsd = await this.convertToUsd(totalFee);
      
      // Estimate confirmation time
      const estimatedConfirmationTime = this.estimateConfirmationTime(congestionLevel, request.urgency);
      
      // Generate alternatives
      const alternatives = this.generateAlternatives(baseFee, congestionLevel);

      const estimate: FeeEstimate = {
        baseFee,
        priorityFee,
        totalFee,
        costUsd,
        estimatedConfirmationTime,
        congestionLevel,
        alternatives
      };

      // Log the estimation for monitoring
      this.logFeeEstimation(request, estimate, strategyUsed, Date.now() - startTime);

      return estimate;

    } catch (error) {
      logger.error('Fee estimation failed completely:', error);
      
      // Return emergency fallback estimate
      return this.getEmergencyEstimate(request);
    }
  }

  private async getCongestionLevel(): Promise<'low' | 'medium' | 'high'> {
    try {
      const recentPerformanceSamples = await this.connection.getRecentPerformanceSamples(20);
      
      if (recentPerformanceSamples.length === 0) {
        return 'medium';
      }

      // Calculate average slot time
      const avgSlotTime = recentPerformanceSamples.reduce((sum, sample) => 
        sum + (sample.samplePeriodSecs / sample.numSlots), 0) / recentPerformanceSamples.length;

      // Classify congestion based on slot time
      if (avgSlotTime < 0.4) return 'low';
      if (avgSlotTime < 0.6) return 'medium';
      return 'high';

    } catch (error) {
      logger.warn('Failed to get congestion level:', error);
      return 'medium';
    }
  }

  private calculatePriorityFee(baseFee: number, congestion: string, urgency?: string): number {
    let multiplier = 0;

    // Base multiplier from congestion
    switch (congestion) {
      case 'low': multiplier = 0.1; break;
      case 'medium': multiplier = 0.3; break;
      case 'high': multiplier = 0.8; break;
    }

    // Adjust for urgency
    switch (urgency) {
      case 'low': multiplier *= 0.5; break;
      case 'normal': multiplier *= 1.0; break;
      case 'high': multiplier *= 2.0; break;
      default: multiplier *= 1.0;
    }

    return Math.ceil(baseFee * multiplier);
  }

  private async convertToUsd(lamports: number): Promise<number> {
    try {
      // Try to get cached SOL price
      const cachedPrice = await redis.get('sol_price_usd');
      let solPrice: number;

      if (cachedPrice) {
        solPrice = parseFloat(cachedPrice);
      } else {
        // Fetch current SOL price (you'd integrate with a price API here)
        solPrice = await this.fetchSolPrice();
        // Cache for 1 minute
        await redis.setex('sol_price_usd', 60, solPrice.toString());
      }

      const solAmount = lamports / 1e9; // Convert lamports to SOL
      return solAmount * solPrice;

    } catch (error) {
      logger.warn('Failed to convert to USD:', error);
      // Fallback to a reasonable estimate
      const solAmount = lamports / 1e9;
      return solAmount * 20; // Assume $20 per SOL as fallback
    }
  }

  private async fetchSolPrice(): Promise<number> {
    // In a real implementation, you'd fetch from CoinGecko, Jupiter, etc.
    // For now, return a mock price
    return 20.0; // $20 USD per SOL
  }

  private estimateConfirmationTime(congestion: string, urgency?: string): number {
    let baseTime: number;

    switch (congestion) {
      case 'low': baseTime = 400; break;    // 400ms
      case 'medium': baseTime = 800; break; // 800ms  
      case 'high': baseTime = 2000; break;  // 2s
      default: baseTime = 800;
    }

    switch (urgency) {
      case 'high': return Math.ceil(baseTime * 0.6);
      case 'normal': return baseTime;
      case 'low': return Math.ceil(baseTime * 1.8);
      default: return baseTime;
    }
  }

  private generateAlternatives(baseFee: number, congestion: string): Array<{ priority: string; fee: number; estimatedTime: number }> {
    const alternatives = [
      {
        priority: 'low',
        fee: Math.ceil(baseFee * 1.1),
        estimatedTime: this.estimateConfirmationTime(congestion, 'low')
      },
      {
        priority: 'normal', 
        fee: Math.ceil(baseFee * 1.3),
        estimatedTime: this.estimateConfirmationTime(congestion, 'normal')
      },
      {
        priority: 'high',
        fee: Math.ceil(baseFee * 2.0),
        estimatedTime: this.estimateConfirmationTime(congestion, 'high')
      }
    ];

    return alternatives;
  }

  private getEmergencyEstimate(request: FeeEstimationRequest): FeeEstimate {
    const fallbackStrategy = new EmergencyFallbackStrategy();
    const baseFee = 10000; // 10,000 lamports default
    
    return {
      baseFee,
      priorityFee: 2000,
      totalFee: 12000,
      costUsd: 0.0024, // Rough estimate
      estimatedConfirmationTime: 1000,
      congestionLevel: 'medium',
      alternatives: [
        { priority: 'low', fee: 8000, estimatedTime: 2000 },
        { priority: 'normal', fee: 12000, estimatedTime: 1000 },
        { priority: 'high', fee: 20000, estimatedTime: 500 }
      ]
    };
  }

  private logFeeEstimation(
    request: FeeEstimationRequest,
    estimate: FeeEstimate,
    strategy: string,
    duration: number
  ) {
    logger.info('Fee estimation completed', {
      operation: request.operation,
      complexity: request.complexity,
      urgency: request.urgency,
      strategy,
      baseFee: estimate.baseFee,
      totalFee: estimate.totalFee,
      costUsd: estimate.costUsd,
      congestionLevel: estimate.congestionLevel,
      duration
    });
  }

  // Method for rent-exempt calculations
  async calculateRentExemption(dataSize: number): Promise<number> {
    try {
      const rentExemption = await this.connection.getMinimumBalanceForRentExemption(dataSize);
      return rentExemption;
    } catch (error) {
      logger.error('Failed to calculate rent exemption:', error);
      // Fallback calculation: approximately 0.00204428 SOL per byte
      return Math.ceil(dataSize * 2044280 / 1000000);
    }
  }

  // Batch fee estimation for multiple operations
  async estimateMultipleOperations(requests: FeeEstimationRequest[]): Promise<FeeEstimate[]> {
    const promises = requests.map(request => this.estimateFee(request));
    return Promise.all(promises);
  }
}

// Singleton instance
export const feeEstimationService = new FeeEstimationService();