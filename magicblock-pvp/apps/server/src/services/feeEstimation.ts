import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { logger } from '@/config/logger';
import { config } from '@/config/environment';

export interface FeeEstimate {
  baseFee: number;
  priorityFee: number;
  totalFee: number;
  computeUnits: number;
  confidence: 'low' | 'medium' | 'high';
  source: 'helius' | 'quicknode' | 'rpc' | 'fallback' | 'environment';
  timestamp: number;
  networkCongestion: 'low' | 'medium' | 'high';
}

export interface FeeEstimationOptions {
  priority?: 'low' | 'medium' | 'high' | 'critical';
  maxFee?: number;
  includeComputeUnits?: boolean;
  safetyMultiplier?: number;
  preferredProvider?: 'helius' | 'quicknode' | 'rpc';
}

export interface ProviderConfig {
  helius?: {
    apiKey: string;
    endpoint: string;
  };
  quicknode?: {
    apiKey: string;
    endpoint: string;
  };
  rpc?: {
    endpoint: string;
  };
}

export class FeeEstimationService {
  private connection: Connection;
  private providers: ProviderConfig;
  private readonly BASE_FEE = 5000; // 5k lamports base fee
  private readonly MIN_PRIORITY_FEE = 1000; // 1k lamports minimum priority
  private readonly MAX_PRIORITY_FEE = 100000; // 100k lamports maximum priority
  private readonly SAFETY_MULTIPLIERS = {
    low: 1.0,
    medium: 1.2,
    high: 1.5,
    critical: 2.0
  };
  private recentEstimates: FeeEstimate[] = [];
  private readonly ESTIMATE_CACHE_SIZE = 100;

  constructor(connection: Connection, providers: ProviderConfig = {}) {
    this.connection = connection;
    this.providers = {
      helius: providers.helius || {
        apiKey: process.env.HELIUS_API_KEY || '',
        endpoint: process.env.HELIUS_ENDPOINT || 'https://api.helius.xyz'
      },
      quicknode: providers.quicknode || {
        apiKey: process.env.QUICKNODE_API_KEY || '',
        endpoint: process.env.QUICKNODE_ENDPOINT || ''
      },
      rpc: providers.rpc || {
        endpoint: config.solana.rpcUrl
      }
    };
  }

  async estimateFee(
    transaction?: Transaction,
    options: FeeEstimationOptions = {}
  ): Promise<FeeEstimate> {
    const priority = options.priority || 'medium';
    const safetyMultiplier = options.safetyMultiplier || this.SAFETY_MULTIPLIERS[priority];
    const preferredProvider = options.preferredProvider;

    try {
      let estimate: FeeEstimate;

      // Try preferred provider first, then fallback chain
      if (preferredProvider === 'helius' && this.providers.helius?.apiKey) {
        estimate = await this.estimateWithHelius(transaction, options);
      } else if (preferredProvider === 'quicknode' && this.providers.quicknode?.apiKey) {
        estimate = await this.estimateWithQuickNode(transaction, options);
      } else {
        // Try providers in order of preference
        estimate = await this.estimateWithFallbackChain(transaction, options);
      }

      // Apply safety multiplier
      estimate.priorityFee = Math.round(estimate.priorityFee * safetyMultiplier);
      estimate.totalFee = estimate.baseFee + estimate.priorityFee;

      // Enforce limits
      estimate = this.enforceLimits(estimate, options);

      // Cache the estimate
      this.cacheEstimate(estimate);

      logger.debug('Fee estimation completed', {
        source: estimate.source,
        baseFee: estimate.baseFee,
        priorityFee: estimate.priorityFee,
        totalFee: estimate.totalFee,
        confidence: estimate.confidence,
        networkCongestion: estimate.networkCongestion
      });

      return estimate;

    } catch (error) {
      logger.error('Fee estimation failed, using fallback:', error);
      return this.getFallbackEstimate(priority, options);
    }
  }

  private async estimateWithFallbackChain(
    transaction?: Transaction,
    options: FeeEstimationOptions = {}
  ): Promise<FeeEstimate> {
    // Try Helius first (most accurate for Solana)
    if (this.providers.helius?.apiKey) {
      try {
        return await this.estimateWithHelius(transaction, options);
      } catch (error) {
        logger.warn('Helius fee estimation failed:', error);
      }
    }

    // Try QuickNode
    if (this.providers.quicknode?.apiKey) {
      try {
        return await this.estimateWithQuickNode(transaction, options);
      } catch (error) {
        logger.warn('QuickNode fee estimation failed:', error);
      }
    }

    // Try standard RPC
    try {
      return await this.estimateWithRPC(transaction, options);
    } catch (error) {
      logger.warn('RPC fee estimation failed:', error);
      throw error;
    }
  }

  private async estimateWithHelius(
    transaction?: Transaction,
    options: FeeEstimationOptions = {}
  ): Promise<FeeEstimate> {
    const { apiKey, endpoint } = this.providers.helius!;
    
    try {
      // Use Helius getPriorityFeeEstimate API
      const response = await fetch(`${endpoint}/v0/transactions/priority-fee-estimate?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: transaction ? transaction.serialize({ requireAllSignatures: false }).toString('base64') : undefined,
          options: {
            includeAllPriorityFeeLevels: true,
            transactionEncoding: 'base64'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data = await response.json();
      
      const networkCongestion = this.determineNetworkCongestion(data.priorityFeeEstimate || 5000);
      
      return {
        baseFee: this.BASE_FEE,
        priorityFee: Math.max(data.priorityFeeEstimate || 5000, this.MIN_PRIORITY_FEE),
        totalFee: this.BASE_FEE + (data.priorityFeeEstimate || 5000),
        computeUnits: data.computeUnits || 200000,
        confidence: 'high',
        source: 'helius',
        timestamp: Date.now(),
        networkCongestion
      };
    } catch (error) {
      logger.error('Helius fee estimation error:', error);
      throw error;
    }
  }

  private async estimateWithQuickNode(
    transaction?: Transaction,
    options: FeeEstimationOptions = {}
  ): Promise<FeeEstimate> {
    const { apiKey, endpoint } = this.providers.quicknode!;
    
    try {
      // Use QuickNode's custom fee estimation if available
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'qn_estimatePriorityFees',
          params: {
            account: transaction?.feePayer?.toString(),
            last_n_blocks: 100
          }
        })
      });

      if (!response.ok) {
        throw new Error(`QuickNode API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`QuickNode RPC error: ${data.error.message}`);
      }

      const priorityFee = data.result?.per_transaction?.medium || 10000;
      const networkCongestion = this.determineNetworkCongestion(priorityFee);
      
      return {
        baseFee: this.BASE_FEE,
        priorityFee: Math.max(priorityFee, this.MIN_PRIORITY_FEE),
        totalFee: this.BASE_FEE + priorityFee,
        computeUnits: 200000,
        confidence: 'high',
        source: 'quicknode',
        timestamp: Date.now(),
        networkCongestion
      };
    } catch (error) {
      logger.error('QuickNode fee estimation error:', error);
      throw error;
    }
  }

  private async estimateWithRPC(
    transaction?: Transaction,
    options: FeeEstimationOptions = {}
  ): Promise<FeeEstimate> {
    try {
      // Get recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees();
      
      let priorityFee = this.MIN_PRIORITY_FEE;
      
      if (recentFees.length > 0) {
        const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
        const priority = options.priority || 'medium';
        
        switch (priority) {
          case 'low':
            priorityFee = fees[Math.floor(fees.length * 0.25)] || this.MIN_PRIORITY_FEE;
            break;
          case 'medium':
            priorityFee = fees[Math.floor(fees.length * 0.50)] || this.MIN_PRIORITY_FEE;
            break;
          case 'high':
            priorityFee = fees[Math.floor(fees.length * 0.75)] || this.MIN_PRIORITY_FEE;
            break;
          case 'critical':
            priorityFee = fees[Math.floor(fees.length * 0.95)] || this.MIN_PRIORITY_FEE;
            break;
        }
      }

      let computeUnits = 200000; // Default estimate
      
      // If transaction provided, simulate to get accurate compute units
      if (transaction && options.includeComputeUnits) {
        try {
          const simulation = await this.connection.simulateTransaction(transaction);
          if (simulation.value.unitsConsumed) {
            computeUnits = simulation.value.unitsConsumed;
          }
        } catch (simulationError) {
          logger.warn('Transaction simulation failed:', simulationError);
        }
      }

      const networkCongestion = this.determineNetworkCongestion(priorityFee);
      
      return {
        baseFee: this.BASE_FEE,
        priorityFee: Math.max(priorityFee, this.MIN_PRIORITY_FEE),
        totalFee: this.BASE_FEE + priorityFee,
        computeUnits,
        confidence: recentFees.length > 10 ? 'medium' : 'low',
        source: 'rpc',
        timestamp: Date.now(),
        networkCongestion
      };
    } catch (error) {
      logger.error('RPC fee estimation error:', error);
      throw error;
    }
  }

  private getFallbackEstimate(
    priority: string,
    options: FeeEstimationOptions = {}
  ): FeeEstimate {
    // Use environment variables or hardcoded fallbacks
    const envBaseFee = parseInt(process.env.FALLBACK_BASE_FEE || '5000');
    const envPriorityFee = parseInt(process.env.FALLBACK_PRIORITY_FEE || '10000');
    
    const priorityMultipliers = {
      low: 0.8,
      medium: 1.0,
      high: 1.5,
      critical: 2.0
    };
    
    const multiplier = priorityMultipliers[priority as keyof typeof priorityMultipliers] || 1.0;
    const priorityFee = Math.round(envPriorityFee * multiplier);
    
    return {
      baseFee: envBaseFee,
      priorityFee,
      totalFee: envBaseFee + priorityFee,
      computeUnits: 200000,
      confidence: 'low',
      source: 'environment',
      timestamp: Date.now(),
      networkCongestion: 'medium'
    };
  }

  private enforceLimits(estimate: FeeEstimate, options: FeeEstimationOptions): FeeEstimate {
    // Enforce priority fee limits
    estimate.priorityFee = Math.max(
      this.MIN_PRIORITY_FEE,
      Math.min(estimate.priorityFee, this.MAX_PRIORITY_FEE)
    );
    
    // Enforce maximum total fee if specified
    if (options.maxFee && estimate.totalFee > options.maxFee) {
      estimate.priorityFee = Math.max(0, options.maxFee - estimate.baseFee);
      estimate.totalFee = estimate.baseFee + estimate.priorityFee;
      estimate.confidence = 'low'; // Reduce confidence when capped
    }
    
    // Recalculate total fee
    estimate.totalFee = estimate.baseFee + estimate.priorityFee;
    
    return estimate;
  }

  private determineNetworkCongestion(priorityFee: number): 'low' | 'medium' | 'high' {
    if (priorityFee < 10000) return 'low';
    if (priorityFee < 50000) return 'medium';
    return 'high';
  }

  private cacheEstimate(estimate: FeeEstimate): void {
    this.recentEstimates.unshift(estimate);
    
    // Keep only recent estimates
    if (this.recentEstimates.length > this.ESTIMATE_CACHE_SIZE) {
      this.recentEstimates = this.recentEstimates.slice(0, this.ESTIMATE_CACHE_SIZE);
    }
  }

  // Public utility methods

  async getRecentFeeTrends(timeWindowMs: number = 300000): Promise<{
    averageFee: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    volatility: number;
    samples: number;
  }> {
    const cutoff = Date.now() - timeWindowMs;
    const recentEstimates = this.recentEstimates.filter(e => e.timestamp > cutoff);
    
    if (recentEstimates.length < 2) {
      return {
        averageFee: 0,
        trend: 'stable',
        volatility: 0,
        samples: recentEstimates.length
      };
    }
    
    const fees = recentEstimates.map(e => e.totalFee);
    const averageFee = fees.reduce((sum, fee) => sum + fee, 0) / fees.length;
    
    // Calculate trend (simple linear regression slope)
    const n = fees.length;
    const sumX = (n * (n - 1)) / 2; // 0 + 1 + 2 + ... + (n-1)
    const sumY = fees.reduce((sum, fee) => sum + fee, 0);
    const sumXY = fees.reduce((sum, fee, i) => sum + i * fee, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < averageFee * 0.01) {
      trend = 'stable';
    } else {
      trend = slope > 0 ? 'increasing' : 'decreasing';
    }
    
    // Calculate volatility (coefficient of variation)
    const variance = fees.reduce((sum, fee) => sum + Math.pow(fee - averageFee, 2), 0) / fees.length;
    const standardDeviation = Math.sqrt(variance);
    const volatility = standardDeviation / averageFee;
    
    return {
      averageFee,
      trend,
      volatility,
      samples: recentEstimates.length
    };
  }

  async getOptimalFeeForTarget(targetConfirmationTime: number): Promise<FeeEstimate> {
    // Estimate based on recent trends and target confirmation time
    const trends = await this.getRecentFeeTrends();
    
    let priorityMultiplier = 1.0;
    
    if (targetConfirmationTime <= 5000) { // 5 seconds or less
      priorityMultiplier = 2.0;
    } else if (targetConfirmationTime <= 15000) { // 15 seconds or less
      priorityMultiplier = 1.5;
    } else if (targetConfirmationTime <= 30000) { // 30 seconds or less
      priorityMultiplier = 1.2;
    }
    
    // Adjust for current trend
    if (trends.trend === 'increasing') {
      priorityMultiplier *= 1.2;
    } else if (trends.trend === 'decreasing') {
      priorityMultiplier *= 0.9;
    }
    
    // Adjust for volatility
    if (trends.volatility > 0.3) {
      priorityMultiplier *= 1.1; // Add buffer for high volatility
    }
    
    return await this.estimateFee(undefined, {
      priority: targetConfirmationTime <= 5000 ? 'critical' : 'high',
      safetyMultiplier: priorityMultiplier
    });
  }

  getNetworkCongestionLevel(): 'low' | 'medium' | 'high' {
    if (this.recentEstimates.length === 0) return 'medium';
    
    const recent = this.recentEstimates.slice(0, 10);
    const avgPriorityFee = recent.reduce((sum, e) => sum + e.priorityFee, 0) / recent.length;
    
    return this.determineNetworkCongestion(avgPriorityFee);
  }

  async simulateTransactionCost(transaction: Transaction): Promise<{
    computeUnits: number;
    estimatedFee: FeeEstimate;
    wouldSucceed: boolean;
    simulationError?: string;
  }> {
    try {
      const simulation = await this.connection.simulateTransaction(transaction);
      
      if (simulation.value.err) {
        return {
          computeUnits: 0,
          estimatedFee: await this.estimateFee(transaction),
          wouldSucceed: false,
          simulationError: JSON.stringify(simulation.value.err)
        };
      }
      
      const computeUnits = simulation.value.unitsConsumed || 200000;
      const estimatedFee = await this.estimateFee(transaction, { includeComputeUnits: true });
      
      return {
        computeUnits,
        estimatedFee,
        wouldSucceed: true
      };
      
    } catch (error) {
      logger.error('Transaction simulation failed:', error);
      
      return {
        computeUnits: 200000,
        estimatedFee: await this.estimateFee(transaction),
        wouldSucceed: false,
        simulationError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const feeEstimationService = new FeeEstimationService(
  new Connection(config.solana.rpcUrl)
);