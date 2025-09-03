/**
 * Real GaslessTransactionManager implementation with MagicBlock delegation patterns
 * Handles gasless transactions through session wallets and delegation
 */

import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  ComputeBudgetProgram,
  TransactionInstruction,
  SendOptions
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { RealSessionKeyManager, ActiveSession } from './real-session-key-manager';
import { EphemeralRollupsClient } from '../rollup/ephemeral-rollups-client';

export interface GaslessTransaction {
  id: string;
  transaction: Transaction;
  sessionId: string;
  programId: PublicKey;
  instruction: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  maxFee: number;
  createdAt: number;
  executedAt?: number;
  signature?: string;
  status: 'pending' | 'executing' | 'confirmed' | 'failed';
  retries: number;
  error?: string;
}

export interface DelegationPattern {
  type: 'session' | 'program' | 'account';
  delegator: PublicKey;
  delegate: PublicKey;
  permissions: DelegationPermission[];
  expiresAt: number;
}

export interface DelegationPermission {
  programId: PublicKey;
  instruction: string;
  accounts?: PublicKey[];
  maxAmount?: BN;
  transferAuthority?: boolean;
}

export interface GaslessMetrics {
  totalTransactions: number;
  gaslessSavings: number; // SOL saved
  averageExecutionTime: number;
  successRate: number;
  currentQueueSize: number;
}

export class GaslessTransactionManager {
  private connection: Connection;
  private sessionManager: RealSessionKeyManager;
  private rollupClient: EphemeralRollupsClient;
  
  // Transaction management
  private transactionQueue: Map<string, GaslessTransaction> = new Map();
  private processingQueue: Set<string> = new Set();
  private delegationPatterns: Map<string, DelegationPattern> = new Map();
  
  // Performance tracking
  private readonly TARGET_LATENCY_MS = 30;
  private executionTimes: number[] = [];
  private gasfeeSavings: number = 0;
  
  // Queue processing
  private isProcessing = false;
  private maxConcurrent = 10;
  private batchSize = 5;
  
  constructor(
    connection: Connection,
    sessionManager: RealSessionKeyManager,
    rollupClient: EphemeralRollupsClient
  ) {
    this.connection = connection;
    this.sessionManager = sessionManager;
    this.rollupClient = rollupClient;
    
    // Start processing queue
    this.startQueueProcessing();
  }

  /**
   * Setup delegation pattern for gasless transactions
   */
  async createDelegationPattern(
    delegator: PublicKey,
    delegate: PublicKey,
    permissions: DelegationPermission[],
    expiresAt: number
  ): Promise<DelegationPattern> {
    const pattern: DelegationPattern = {
      type: 'session',
      delegator,
      delegate,
      permissions,
      expiresAt
    };
    
    const patternId = `${delegator.toString()}_${delegate.toString()}`;
    this.delegationPatterns.set(patternId, pattern);
    
    console.log(`✅ Delegation pattern created: ${patternId}`);
    return pattern;
  }

  /**
   * Queue gasless transaction for execution
   */
  async queueGaslessTransaction(
    transaction: Transaction,
    sessionId: string,
    programId: PublicKey,
    instruction: string,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      maxFee?: number;
      rollupExecution?: boolean;
    } = {}
  ): Promise<string> {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const gaslessTransaction: GaslessTransaction = {
      id: txId,
      transaction,
      sessionId,
      programId,
      instruction,
      priority: options.priority || 'medium',
      maxFee: options.maxFee || 0.01,
      createdAt: Date.now(),
      status: 'pending',
      retries: 0
    };
    
    // Add compute budget for optimal execution
    this.optimizeTransactionForSpeed(gaslessTransaction.transaction);
    
    this.transactionQueue.set(txId, gaslessTransaction);
    
    console.log(`📝 Gasless transaction queued: ${txId} (${instruction})`);
    
    // If high priority, process immediately
    if (options.priority === 'critical') {
      setImmediate(() => this.processTransaction(txId));
    }
    
    return txId;
  }

  /**
   * Execute gasless transaction immediately (bypass queue)
   */
  async executeGaslessTransactionImmediate(
    transaction: Transaction,
    sessionId: string,
    programId: PublicKey,
    instruction: string,
    useRollup: boolean = true
  ): Promise<{ signature: string; executionTime: number }> {
    const startTime = performance.now();
    
    try {
      // Get session
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Verify delegation permission
      await this.verifyDelegationPermission(session, programId, instruction);
      
      // Optimize transaction for speed
      this.optimizeTransactionForSpeed(transaction);
      
      let signature: string;
      let executionTime: number;
      
      if (useRollup) {
        // Execute on ephemeral rollup for instant confirmation
        const rollupSessions = this.rollupClient.getActiveSessions();
        let rollupSessionId = rollupSessions.find(s => s.id.includes(sessionId))?.id;
        
        if (!rollupSessionId) {
          // Create rollup session if needed
          const rollupSession = await this.rollupClient.createRollupSession(
            session.sessionKey,
            {
              computeBudget: 1_000_000,
              lifetimeMs: 3600000,
              autoCommit: true,
              tickRateMs: 50 // 20 TPS for gaming
            }
          );
          rollupSessionId = rollupSession.id;
        }
        
        const rollupResult = await this.rollupClient.executeTransaction(
          rollupSessionId,
          transaction,
          [session.sessionKey]
        );
        
        signature = rollupResult.signature;
        executionTime = rollupResult.executionTime;
        
      } else {
        // Execute through session wallet (gasless L1)
        const result = await this.sessionManager.executeGaslessTransaction(
          sessionId,
          transaction,
          programId,
          instruction
        );
        
        signature = result.signature;
        executionTime = result.executionTime;
      }
      
      // Track performance
      this.executionTimes.push(executionTime);
      if (this.executionTimes.length > 100) {
        this.executionTimes.shift();
      }
      
      // Estimate gas savings
      const estimatedGasFee = await this.estimateTransactionFee(transaction);
      this.gasfeeSavings += estimatedGasFee;
      
      if (executionTime > this.TARGET_LATENCY_MS) {
        console.warn(`⚠️ Gasless TX took ${executionTime}ms, target is ${this.TARGET_LATENCY_MS}ms`);
      }
      
      console.log(`✅ Gasless TX executed: ${signature} (${executionTime.toFixed(1)}ms, saved ${estimatedGasFee.toFixed(6)} SOL)`);
      
      return { signature, executionTime };
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(`❌ Gasless transaction failed in ${executionTime.toFixed(1)}ms:`, error);
      throw new Error(`Gasless transaction failed: ${error.message}`);
    }
  }

  /**
   * Process single transaction from queue
   */
  private async processTransaction(txId: string): Promise<void> {
    const tx = this.transactionQueue.get(txId);
    if (!tx || this.processingQueue.has(txId)) {
      return;
    }
    
    this.processingQueue.add(txId);
    tx.status = 'executing';
    
    try {
      const result = await this.executeGaslessTransactionImmediate(
        tx.transaction,
        tx.sessionId,
        tx.programId,
        tx.instruction,
        true // Use rollup by default
      );
      
      tx.signature = result.signature;
      tx.executedAt = Date.now();
      tx.status = 'confirmed';
      
      console.log(`✅ Queued transaction completed: ${txId}`);
      
    } catch (error) {
      tx.retries++;
      tx.error = error.message;
      
      if (tx.retries < 3) {
        tx.status = 'pending';
        console.log(`⚠️ Retrying transaction ${txId} (attempt ${tx.retries}/3)`);
        
        // Retry with exponential backoff
        setTimeout(() => {
          this.processTransaction(txId);
        }, Math.pow(2, tx.retries) * 1000);
        
      } else {
        tx.status = 'failed';
        console.error(`❌ Transaction failed after retries: ${txId}`, error);
      }
    } finally {
      this.processingQueue.delete(txId);
    }
  }

  /**
   * Start queue processing loop
   */
  private startQueueProcessing(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    const processLoop = async () => {
      try {
        const pendingTransactions = Array.from(this.transactionQueue.values())
          .filter(tx => tx.status === 'pending')
          .sort((a, b) => {
            // Sort by priority and age
            const priorityWeights = { critical: 4, high: 3, medium: 2, low: 1 };
            const priorityDiff = priorityWeights[b.priority] - priorityWeights[a.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return a.createdAt - b.createdAt;
          });
        
        const availableSlots = this.maxConcurrent - this.processingQueue.size;
        const toProcess = pendingTransactions.slice(0, Math.min(availableSlots, this.batchSize));
        
        // Process batch concurrently
        const promises = toProcess.map(tx => this.processTransaction(tx.id));
        await Promise.allSettled(promises);
        
      } catch (error) {
        console.error('Error in queue processing:', error);
      }
      
      // Continue processing
      if (this.isProcessing) {
        setTimeout(processLoop, 100); // 100ms intervals
      }
    };
    
    processLoop();
    console.log('🚀 Gasless transaction queue processing started');
  }

  /**
   * Verify delegation permission for gasless execution
   */
  private async verifyDelegationPermission(
    session: ActiveSession,
    programId: PublicKey,
    instruction: string
  ): Promise<void> {
    const hasPermission = session.permissions.some(p =>
      p.programId.equals(programId) &&
      (p.instruction === '*' || p.instruction === instruction)
    );
    
    if (!hasPermission) {
      throw new Error(`No delegation permission for ${programId.toString()}:${instruction}`);
    }
    
    // Check session validity
    if (Date.now() / 1000 > session.validUntil) {
      throw new Error('Session expired, delegation invalid');
    }
  }

  /**
   * Optimize transaction for maximum speed
   */
  private optimizeTransactionForSpeed(transaction: Transaction): void {
    // Add compute budget for optimal execution
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_000_000
    });
    
    // Add priority fee for faster inclusion
    const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 10_000 // 0.01 SOL per million compute units
    });
    
    // Prepend optimization instructions
    transaction.instructions.unshift(priorityFeeIx, computeBudgetIx);
  }

  /**
   * Estimate transaction fee for savings calculation
   */
  private async estimateTransactionFee(transaction: Transaction): Promise<number> {
    try {
      const feeCalcResult = await this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      );
      
      return feeCalcResult.value ? feeCalcResult.value / 1e9 : 0.005; // Default 0.005 SOL
      
    } catch (error) {
      return 0.005; // Default estimate
    }
  }

  /**
   * Get transaction by ID
   */
  getTransaction(txId: string): GaslessTransaction | undefined {
    return this.transactionQueue.get(txId);
  }

  /**
   * Get all transactions with status
   */
  getTransactions(status?: string): GaslessTransaction[] {
    const transactions = Array.from(this.transactionQueue.values());
    return status ? transactions.filter(tx => tx.status === status) : transactions;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): GaslessMetrics {
    const totalTransactions = this.transactionQueue.size;
    const confirmedTransactions = Array.from(this.transactionQueue.values())
      .filter(tx => tx.status === 'confirmed').length;
    
    const avgExecutionTime = this.executionTimes.length > 0
      ? this.executionTimes.reduce((sum, time) => sum + time, 0) / this.executionTimes.length
      : 0;
    
    return {
      totalTransactions,
      gaslessSavings: this.gasfeeSavings,
      averageExecutionTime: avgExecutionTime,
      successRate: totalTransactions > 0 ? confirmedTransactions / totalTransactions : 0,
      currentQueueSize: Array.from(this.transactionQueue.values())
        .filter(tx => tx.status === 'pending').length
    };
  }

  /**
   * Clear completed transactions (cleanup)
   */
  clearCompletedTransactions(): void {
    const cutoff = Date.now() - 3600000; // 1 hour ago
    
    for (const [txId, tx] of this.transactionQueue) {
      if ((tx.status === 'confirmed' || tx.status === 'failed') && 
          (tx.executedAt || tx.createdAt) < cutoff) {
        this.transactionQueue.delete(txId);
      }
    }
    
    console.log('🧹 Cleared old completed transactions');
  }

  /**
   * Stop queue processing
   */
  stopProcessing(): void {
    this.isProcessing = false;
    console.log('⏹️ Gasless transaction queue processing stopped');
  }

  /**
   * Create batch gasless transaction for multiple operations
   */
  async createBatchGaslessTransaction(
    instructions: {
      instruction: TransactionInstruction;
      programId: PublicKey;
      name: string;
    }[],
    sessionId: string,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<string> {
    const batchTransaction = new Transaction();
    
    // Add all instructions to batch
    for (const { instruction } of instructions) {
      batchTransaction.add(instruction);
    }
    
    // Use first instruction's program for permission check
    const primaryProgram = instructions[0]?.programId;
    const batchName = instructions.map(i => i.name).join(',');
    
    return this.queueGaslessTransaction(
      batchTransaction,
      sessionId,
      primaryProgram,
      `batch:${batchName}`,
      { priority }
    );
  }
}

export default GaslessTransactionManager;