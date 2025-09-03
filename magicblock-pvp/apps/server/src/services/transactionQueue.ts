import { Connection, Transaction, PublicKey, SendOptions } from '@solana/web3.js';
import { logger } from '@/config/logger';
import { config } from '@/config/environment';
import { costTrackingService } from './costTracking';
import { EventEmitter } from 'events';

export interface QueuedTransaction {
  id: string;
  transaction: Transaction;
  priority: 'low' | 'medium' | 'high' | 'critical';
  operation: string;
  gameId?: string;
  playerId?: string;
  maxRetries: number;
  currentRetry: number;
  feeMultiplier: number;
  createdAt: number;
  estimatedCost?: number;
  onSuccess?: (signature: string) => void;
  onError?: (error: Error) => void;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  totalCost: number;
}

export interface NetworkCongestionLevel {
  level: 'low' | 'medium' | 'high';
  priorityFeePercentile: number;
  avgConfirmationTime: number;
  recommendedFeeMultiplier: number;
}

export class TransactionQueueService extends EventEmitter {
  private connection: Connection;
  private queues: Map<string, QueuedTransaction[]> = new Map();
  private processing: Set<string> = new Set();
  private stats: QueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    avgProcessingTime: 0,
    totalCost: 0
  };
  private processingTimes: number[] = [];
  private congestionCache: { level: NetworkCongestionLevel; timestamp: number } | null = null;
  private readonly CONGESTION_CACHE_TTL = 30000; // 30 seconds
  private readonly MAX_CONCURRENT_TRANSACTIONS = 10;
  private readonly PRIORITY_WEIGHTS = { critical: 4, high: 3, medium: 2, low: 1 };

  constructor(connection: Connection) {
    super();
    this.connection = connection;
    this.initializeQueues();
    this.startQueueProcessor();
  }

  private initializeQueues(): void {
    // Initialize priority queues
    this.queues.set('critical', []);
    this.queues.set('high', []);
    this.queues.set('medium', []);
    this.queues.set('low', []);
  }

  private startQueueProcessor(): void {
    setInterval(() => {
      this.processQueues();
    }, 1000); // Process every second

    // Periodic congestion detection
    setInterval(() => {
      this.updateNetworkCongestion();
    }, 30000); // Update every 30 seconds
  }

  async enqueue(
    transaction: Transaction,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      operation: string;
      gameId?: string;
      playerId?: string;
      maxRetries?: number;
      feeMultiplier?: number;
      onSuccess?: (signature: string) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<string> {
    const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const priority = options.priority || 'medium';
    
    const queuedTx: QueuedTransaction = {
      id,
      transaction,
      priority,
      operation: options.operation,
      gameId: options.gameId,
      playerId: options.playerId,
      maxRetries: options.maxRetries || 3,
      currentRetry: 0,
      feeMultiplier: options.feeMultiplier || 1,
      createdAt: Date.now(),
      onSuccess: options.onSuccess,
      onError: options.onError
    };

    // Estimate cost
    try {
      const congestion = await this.getNetworkCongestion();
      queuedTx.estimatedCost = await this.estimateTransactionCost(transaction, congestion);
    } catch (error) {
      logger.warn('Failed to estimate transaction cost:', error);
    }

    // Add to appropriate priority queue
    const queue = this.queues.get(priority) || [];
    queue.push(queuedTx);
    this.queues.set(priority, queue);
    
    this.stats.pending++;
    this.emit('transaction_queued', { id, priority, operation: options.operation });
    
    logger.debug('Transaction queued', {
      id,
      priority,
      operation: options.operation,
      estimatedCost: queuedTx.estimatedCost
    });

    return id;
  }

  private async processQueues(): Promise<void> {
    if (this.processing.size >= this.MAX_CONCURRENT_TRANSACTIONS) {
      return;
    }

    // Process queues by priority
    const priorities: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority) || [];
      if (queue.length === 0) continue;
      
      const availableSlots = this.MAX_CONCURRENT_TRANSACTIONS - this.processing.size;
      if (availableSlots <= 0) break;

      // Process transactions based on priority weights
      const toProcess = queue.splice(0, Math.min(availableSlots, this.PRIORITY_WEIGHTS[priority]));
      
      for (const queuedTx of toProcess) {
        this.processTransaction(queuedTx);
      }
    }
  }

  private async processTransaction(queuedTx: QueuedTransaction): Promise<void> {
    this.processing.add(queuedTx.id);
    this.stats.pending--;
    this.stats.processing++;
    
    const startTime = Date.now();
    
    try {
      // Apply fee optimization
      await this.optimizeTransactionFees(queuedTx);
      
      // Send transaction
      const signature = await this.sendTransaction(queuedTx);
      
      // Wait for confirmation
      await this.waitForConfirmation(signature, queuedTx);
      
      const processingTime = Date.now() - startTime;
      this.updateProcessingStats(processingTime);
      
      // Record successful transaction cost
      if (queuedTx.estimatedCost) {
        await costTrackingService.recordCost({
          category: 'TRANSACTION_FEE' as any,
          operation: queuedTx.operation,
          costUsd: queuedTx.estimatedCost * 0.000001, // Convert lamports to USD estimate
          solanaFees: queuedTx.estimatedCost,
          gameId: queuedTx.gameId,
          playerId: queuedTx.playerId,
          metadata: {
            signature,
            priority: queuedTx.priority,
            retries: queuedTx.currentRetry,
            processingTime
          }
        });
      }

      this.stats.processing--;
      this.stats.completed++;
      
      this.emit('transaction_confirmed', {
        id: queuedTx.id,
        signature,
        processingTime,
        cost: queuedTx.estimatedCost
      });
      
      if (queuedTx.onSuccess) {
        queuedTx.onSuccess(signature);
      }
      
      logger.info('Transaction processed successfully', {
        id: queuedTx.id,
        signature,
        processingTime,
        operation: queuedTx.operation
      });
      
    } catch (error) {
      await this.handleTransactionError(queuedTx, error as Error, startTime);
    } finally {
      this.processing.delete(queuedTx.id);
    }
  }

  private async handleTransactionError(
    queuedTx: QueuedTransaction,
    error: Error,
    startTime: number
  ): Promise<void> {
    const processingTime = Date.now() - startTime;
    
    if (queuedTx.currentRetry < queuedTx.maxRetries && this.shouldRetry(error)) {
      // Retry with exponential backoff and increased fee
      queuedTx.currentRetry++;
      queuedTx.feeMultiplier *= 1.5;
      
      const delay = Math.pow(2, queuedTx.currentRetry) * 1000; // Exponential backoff
      
      setTimeout(() => {
        const queue = this.queues.get(queuedTx.priority) || [];
        queue.unshift(queuedTx); // Add to front for retry
        this.queues.set(queuedTx.priority, queue);
        this.stats.pending++;
      }, delay);
      
      this.emit('transaction_retry', {
        id: queuedTx.id,
        retry: queuedTx.currentRetry,
        delay,
        newFeeMultiplier: queuedTx.feeMultiplier
      });
      
    } else {
      // Max retries reached or non-retryable error
      this.stats.failed++;
      
      this.emit('transaction_failed', {
        id: queuedTx.id,
        error: error.message,
        retries: queuedTx.currentRetry,
        processingTime
      });
      
      if (queuedTx.onError) {
        queuedTx.onError(error);
      }
      
      logger.error('Transaction failed after retries', {
        id: queuedTx.id,
        operation: queuedTx.operation,
        error: error.message,
        retries: queuedTx.currentRetry
      });
    }
    
    this.stats.processing--;
  }

  private shouldRetry(error: Error): boolean {
    const retryableErrors = [
      'BlockhashNotFound',
      'TransactionExpired',
      'InsufficientFundsForFee',
      'NetworkError',
      'RateLimited'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }

  private async optimizeTransactionFees(queuedTx: QueuedTransaction): Promise<void> {
    try {
      const congestion = await this.getNetworkCongestion();
      const recommendedMultiplier = congestion.recommendedFeeMultiplier;
      
      // Apply congestion-based fee adjustment
      const adjustedMultiplier = Math.max(
        queuedTx.feeMultiplier,
        recommendedMultiplier * this.getPriorityFeeMultiplier(queuedTx.priority)
      );
      
      // Update transaction fees (simplified - in reality would modify transaction)
      queuedTx.feeMultiplier = adjustedMultiplier;
      queuedTx.estimatedCost = (queuedTx.estimatedCost || 5000) * adjustedMultiplier;
      
    } catch (error) {
      logger.warn('Fee optimization failed:', error);
    }
  }

  private getPriorityFeeMultiplier(priority: string): number {
    switch (priority) {
      case 'critical': return 2.0;
      case 'high': return 1.5;
      case 'medium': return 1.0;
      case 'low': return 0.8;
      default: return 1.0;
    }
  }

  private async sendTransaction(queuedTx: QueuedTransaction): Promise<string> {
    const sendOptions: SendOptions = {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 0 // We handle retries manually
    };
    
    return await this.connection.sendTransaction(queuedTx.transaction, [], sendOptions);
  }

  private async waitForConfirmation(signature: string, queuedTx: QueuedTransaction): Promise<void> {
    const timeout = queuedTx.priority === 'critical' ? 60000 : 30000; // 60s for critical, 30s for others
    
    const confirmation = await this.connection.confirmTransaction({
      signature,
      blockhash: await this.connection.getLatestBlockhash().then(r => r.blockhash),
      lastValidBlockHeight: await this.connection.getLatestBlockhash().then(r => r.lastValidBlockHeight)
    });
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }
  }

  private async getNetworkCongestion(): Promise<NetworkCongestionLevel> {
    if (this.congestionCache && Date.now() - this.congestionCache.timestamp < this.CONGESTION_CACHE_TTL) {
      return this.congestionCache.level;
    }
    
    return await this.updateNetworkCongestion();
  }

  private async updateNetworkCongestion(): Promise<NetworkCongestionLevel> {
    try {
      const recentFees = await this.connection.getRecentPrioritizationFees();
      
      if (recentFees.length === 0) {
        const defaultLevel: NetworkCongestionLevel = {
          level: 'low',
          priorityFeePercentile: 0,
          avgConfirmationTime: 1000,
          recommendedFeeMultiplier: 1.0
        };
        
        this.congestionCache = { level: defaultLevel, timestamp: Date.now() };
        return defaultLevel;
      }
      
      const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
      const p50 = fees[Math.floor(fees.length * 0.5)];
      const p90 = fees[Math.floor(fees.length * 0.9)];
      
      let level: 'low' | 'medium' | 'high';
      let recommendedFeeMultiplier: number;
      
      if (p90 < 10000) {
        level = 'low';
        recommendedFeeMultiplier = 1.0;
      } else if (p90 < 50000) {
        level = 'medium';
        recommendedFeeMultiplier = 1.5;
      } else {
        level = 'high';
        recommendedFeeMultiplier = 2.0;
      }
      
      const congestionLevel: NetworkCongestionLevel = {
        level,
        priorityFeePercentile: p90,
        avgConfirmationTime: level === 'high' ? 5000 : level === 'medium' ? 2000 : 1000,
        recommendedFeeMultiplier
      };
      
      this.congestionCache = { level: congestionLevel, timestamp: Date.now() };
      this.emit('congestion_updated', congestionLevel);
      
      return congestionLevel;
      
    } catch (error) {
      logger.error('Failed to detect network congestion:', error);
      
      const fallbackLevel: NetworkCongestionLevel = {
        level: 'medium',
        priorityFeePercentile: 25000,
        avgConfirmationTime: 2000,
        recommendedFeeMultiplier: 1.2
      };
      
      this.congestionCache = { level: fallbackLevel, timestamp: Date.now() };
      return fallbackLevel;
    }
  }

  private async estimateTransactionCost(
    transaction: Transaction,
    congestion: NetworkCongestionLevel
  ): Promise<number> {
    const baseFee = 5000; // 5k lamports
    const priorityFee = congestion.priorityFeePercentile || 5000;
    const computeCost = 200000 * 0.000001 * 100000000; // Estimated compute units cost
    
    return baseFee + priorityFee + computeCost;
  }

  private updateProcessingStats(processingTime: number): void {
    this.processingTimes.push(processingTime);
    
    // Keep only last 100 processing times for rolling average
    if (this.processingTimes.length > 100) {
      this.processingTimes = this.processingTimes.slice(-100);
    }
    
    this.stats.avgProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  // Public API methods
  
  getStats(): QueueStats {
    return { ...this.stats };
  }

  getQueueStatus(): Record<string, number> {
    const status: Record<string, number> = {};
    
    for (const [priority, queue] of this.queues) {
      status[priority] = queue.length;
    }
    
    status.processing = this.processing.size;
    return status;
  }

  async getTransactionStatus(id: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
    position?: number;
    estimatedWaitTime?: number;
  }> {
    // Check if currently processing
    if (this.processing.has(id)) {
      return { status: 'processing' };
    }
    
    // Check in queues
    for (const [priority, queue] of this.queues) {
      const position = queue.findIndex(tx => tx.id === id);
      if (position >= 0) {
        const estimatedWaitTime = this.calculateEstimatedWaitTime(priority, position);
        return {
          status: 'pending',
          position: position + 1,
          estimatedWaitTime
        };
      }
    }
    
    return { status: 'not_found' };
  }

  private calculateEstimatedWaitTime(priority: string, position: number): number {
    const avgProcessingTime = this.stats.avgProcessingTime || 2000;
    const priorityWeight = this.PRIORITY_WEIGHTS[priority as keyof typeof this.PRIORITY_WEIGHTS] || 1;
    
    // Rough estimation based on position and processing capacity
    return Math.ceil(position / (this.MAX_CONCURRENT_TRANSACTIONS * priorityWeight)) * avgProcessingTime;
  }

  async cancelTransaction(id: string): Promise<boolean> {
    // Check all queues for the transaction
    for (const [priority, queue] of this.queues) {
      const index = queue.findIndex(tx => tx.id === id);
      if (index >= 0) {
        queue.splice(index, 1);
        this.stats.pending--;
        this.emit('transaction_cancelled', { id });
        return true;
      }
    }
    
    return false; // Not found or already processing
  }

  async getCurrentCongestion(): Promise<NetworkCongestionLevel> {
    return await this.getNetworkCongestion();
  }

  async clearQueue(priority?: string): Promise<number> {
    let cleared = 0;
    
    if (priority) {
      const queue = this.queues.get(priority);
      if (queue) {
        cleared = queue.length;
        this.queues.set(priority, []);
        this.stats.pending -= cleared;
      }
    } else {
      for (const [, queue] of this.queues) {
        cleared += queue.length;
        queue.length = 0;
      }
      this.stats.pending = 0;
    }
    
    this.emit('queue_cleared', { priority, count: cleared });
    return cleared;
  }
}

// Export singleton instance
export const transactionQueueService = new TransactionQueueService(
  new Connection(config.solana.rpcUrl)
);