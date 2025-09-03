/**
 * Transaction Queue - Batch and optimize transaction processing
 */

import { Transaction, Connection } from '@solana/web3.js';
import { EventEmitter } from 'eventemitter3';
import { 
  TransactionWithMetadata, 
  QueueMetrics, 
  CostEstimate,
  SDKEvents,
  MagicBlockError 
} from '../types';
import { CostTracker } from './cost-tracker';

interface QueuedTransaction extends TransactionWithMetadata {
  id: string;
  queuedAt: number;
  attempts: number;
  lastAttempt?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  signature?: string;
  error?: string;
}

export class TransactionQueue extends EventEmitter<SDKEvents> {
  private queue: QueuedTransaction[] = [];
  private processing = new Set<string>();
  private completed = new Map<string, QueuedTransaction>();
  private failed = new Map<string, QueuedTransaction>();
  
  private connection: Connection;
  private costTracker: CostTracker;
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;
  
  private metrics: QueueMetrics = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    averageProcessingTime: 0
  };

  constructor(connection: Connection, costTracker: CostTracker) {
    super();
    this.connection = connection;
    this.costTracker = costTracker;
    
    // Start processing queue
    this.startProcessing();
    
    // Update metrics periodically
    setInterval(() => this.updateMetrics(), 5000);
  }

  /**
   * Add transaction to queue
   */
  async enqueueTransaction(transaction: TransactionWithMetadata): Promise<string> {
    const queuedTx: QueuedTransaction = {
      ...transaction,
      id: this.generateTransactionId(),
      queuedAt: Date.now(),
      attempts: 0,
      status: 'pending'
    };

    // Insert at correct position based on priority
    const insertIndex = this.findInsertionIndex(queuedTx);
    this.queue.splice(insertIndex, 0, queuedTx);
    
    this.emit('transaction:queued', transaction);
    this.updateMetrics();
    
    return queuedTx.id;
  }

  /**
   * Get queue status and metrics
   */
  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Get transaction status by ID
   */
  getTransactionStatus(transactionId: string): {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
    signature?: string;
    error?: string;
    attempts: number;
  } {
    // Check pending queue
    const pending = this.queue.find(tx => tx.id === transactionId);
    if (pending) {
      return {
        status: pending.status,
        attempts: pending.attempts,
        signature: pending.signature,
        error: pending.error
      };
    }

    // Check completed
    const completed = this.completed.get(transactionId);
    if (completed) {
      return {
        status: 'completed',
        signature: completed.signature,
        attempts: completed.attempts
      };
    }

    // Check failed
    const failed = this.failed.get(transactionId);
    if (failed) {
      return {
        status: 'failed',
        error: failed.error,
        attempts: failed.attempts
      };
    }

    return { status: 'not_found', attempts: 0 };
  }

  /**
   * Cancel pending transaction
   */
  cancelTransaction(transactionId: string): boolean {
    const index = this.queue.findIndex(tx => tx.id === transactionId && tx.status === 'pending');
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.updateMetrics();
      return true;
    }
    return false;
  }

  /**
   * Clear failed transactions
   */
  clearFailedTransactions(): number {
    const count = this.failed.size;
    this.failed.clear();
    this.updateMetrics();
    return count;
  }

  /**
   * Batch transactions for efficiency
   */
  async createBatch(maxBatchSize: number = 10): Promise<QueuedTransaction[]> {
    const batch: QueuedTransaction[] = [];
    const eligibleTxs = this.queue
      .filter(tx => tx.status === 'pending' && this.isEligibleForBatch(tx))
      .sort((a, b) => this.getPriorityScore(b) - this.getPriorityScore(a))
      .slice(0, maxBatchSize);

    // Group compatible transactions
    for (const tx of eligibleTxs) {
      if (this.canBatchWith(tx, batch)) {
        batch.push(tx);
      }
    }

    return batch;
  }

  /**
   * Process transaction queue
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Process every second
  }

  /**
   * Stop processing queue
   */
  stopProcessing(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  /**
   * Process pending transactions
   */
  private async processQueue(): Promise<void> {
    if (!this.isProcessing || this.queue.length === 0) return;

    // Get next batch to process
    const batch = await this.createBatch(5); // Process up to 5 at a time
    
    for (const tx of batch) {
      if (this.processing.has(tx.id)) continue;
      
      this.processing.add(tx.id);
      tx.status = 'processing';
      
      // Process transaction asynchronously
      this.processTransaction(tx).finally(() => {
        this.processing.delete(tx.id);
      });
    }
  }

  /**
   * Process individual transaction
   */
  private async processTransaction(tx: QueuedTransaction): Promise<void> {
    const startTime = Date.now();
    
    try {
      tx.attempts++;
      tx.lastAttempt = startTime;
      
      // Check if transaction has expired
      if (startTime > tx.timeout) {
        throw new Error('Transaction timeout exceeded');
      }

      // Estimate and optimize fees
      const costEstimate = await this.optimizeFees(tx);
      
      // Send transaction
      const signature = await this.connection.sendTransaction(
        tx.transaction, 
        [], // signers array - empty for now
        {
          maxRetries: 1,
          skipPreflight: false
        }
      );
      
      // Wait for confirmation
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      // Record success
      tx.signature = signature;
      tx.status = 'completed';
      
      const processingTime = Date.now() - startTime;
      
      // Remove from queue and add to completed
      const queueIndex = this.queue.findIndex(qtx => qtx.id === tx.id);
      if (queueIndex >= 0) {
        this.queue.splice(queueIndex, 1);
      }
      this.completed.set(tx.id, tx);
      
      // Record cost
      this.costTracker.recordTransactionCost(
        tx.metadata.type || 'unknown',
        costEstimate.totalCost,
        costEstimate.computeUnits,
        costEstimate.baseFee,
        costEstimate.priorityFee
      );
      
      this.emit('transaction:confirmed', signature);
      
    } catch (error) {
      tx.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Retry logic
      if (tx.attempts < tx.retries && Date.now() < tx.timeout) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, tx.attempts - 1), 30000);
        setTimeout(() => {
          tx.status = 'pending';
        }, delay);
      } else {
        // Max retries exceeded or timeout
        tx.status = 'failed';
        
        const queueIndex = this.queue.findIndex(qtx => qtx.id === tx.id);
        if (queueIndex >= 0) {
          this.queue.splice(queueIndex, 1);
        }
        this.failed.set(tx.id, tx);
        
        this.emit('transaction:failed', new Error(tx.error!), tx);
      }
    }
    
    this.updateMetrics();
  }

  /**
   * Optimize transaction fees
   */
  private async optimizeFees(tx: QueuedTransaction): Promise<CostEstimate> {
    const transactionType = tx.metadata.type || 'unknown';
    
    // Get priority level based on transaction priority
    const priorityLevel = this.getPriorityLevel(tx.priority);
    
    return await this.costTracker.estimateTransactionCost(transactionType, undefined, priorityLevel);
  }

  /**
   * Find correct insertion index for priority queue
   */
  private findInsertionIndex(tx: QueuedTransaction): number {
    const txScore = this.getPriorityScore(tx);
    
    for (let i = 0; i < this.queue.length; i++) {
      if (this.getPriorityScore(this.queue[i]) < txScore) {
        return i;
      }
    }
    
    return this.queue.length;
  }

  /**
   * Calculate priority score for transaction
   */
  private getPriorityScore(tx: QueuedTransaction): number {
    const priorityScores = {
      'critical': 1000,
      'high': 750,
      'medium': 500,
      'low': 250
    };
    
    let score = priorityScores[tx.priority];
    
    // Adjust for age (older transactions get higher priority)
    const age = Date.now() - tx.queuedAt;
    score += Math.floor(age / 1000); // +1 per second
    
    // Adjust for max fee (willing to pay more = higher priority)
    score += tx.maxFee * 1000;
    
    return score;
  }

  /**
   * Check if transaction is eligible for batching
   */
  private isEligibleForBatch(tx: QueuedTransaction): boolean {
    // Don't batch critical transactions
    if (tx.priority === 'critical') return false;
    
    // Don't batch if close to timeout
    const timeLeft = tx.timeout - Date.now();
    return timeLeft > 30000; // At least 30 seconds left
  }

  /**
   * Check if transaction can be batched with existing batch
   */
  private canBatchWith(tx: QueuedTransaction, batch: QueuedTransaction[]): boolean {
    if (batch.length === 0) return true;
    
    // Only batch transactions of same or lower priority
    const batchPriority = Math.max(...batch.map(btx => this.getPriorityScore(btx)));
    return this.getPriorityScore(tx) <= batchPriority;
  }

  /**
   * Convert priority to fee level
   */
  private getPriorityLevel(priority: string): 'low' | 'medium' | 'high' {
    switch (priority) {
      case 'critical':
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      default:
        return 'low';
    }
  }

  /**
   * Update queue metrics
   */
  private updateMetrics(): void {
    this.metrics.pending = this.queue.filter(tx => tx.status === 'pending').length;
    this.metrics.processing = this.processing.size;
    this.metrics.completed = this.completed.size;
    this.metrics.failed = this.failed.size;
    
    // Calculate average processing time from completed transactions
    const completedTxs = Array.from(this.completed.values());
    if (completedTxs.length > 0) {
      const totalTime = completedTxs.reduce((sum, tx) => {
        return sum + ((tx.lastAttempt || tx.queuedAt) - tx.queuedAt);
      }, 0);
      this.metrics.averageProcessingTime = totalTime / completedTxs.length;
    }
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old completed/failed transactions
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const cutoff = Date.now() - maxAge;
    
    // Clean completed transactions
    const completedToDelete: string[] = [];
    this.completed.forEach((tx, id) => {
      if (tx.queuedAt < cutoff) {
        completedToDelete.push(id);
      }
    });
    completedToDelete.forEach(id => this.completed.delete(id));
    
    // Clean failed transactions  
    const failedToDelete: string[] = [];
    this.failed.forEach((tx, id) => {
      if (tx.queuedAt < cutoff) {
        failedToDelete.push(id);
      }
    });
    failedToDelete.forEach(id => this.failed.delete(id));
    
    this.updateMetrics();
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    totalQueued: number;
    successRate: number;
    averageWaitTime: number;
    throughput: number; // transactions per minute
  } {
    const total = this.metrics.completed + this.metrics.failed;
    const successRate = total > 0 ? this.metrics.completed / total : 0;
    
    // Calculate throughput (last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const recentCompleted = Array.from(this.completed.values())
      .filter(tx => (tx.lastAttempt || tx.queuedAt) >= fiveMinutesAgo).length;
    const throughput = recentCompleted / 5; // per minute
    
    return {
      totalQueued: this.queue.length + this.processing.size + this.metrics.completed + this.metrics.failed,
      successRate,
      averageWaitTime: this.metrics.averageProcessingTime,
      throughput
    };
  }
}