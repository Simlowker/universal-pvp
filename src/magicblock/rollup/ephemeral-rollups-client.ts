/**
 * Real EphemeralRollupsClient implementation using MagicBlock SDK
 * Connects to devnet-router.magicblock.app for ultra-fast transactions
 */

import { 
  Connection, 
  PublicKey, 
  Transaction,
  Keypair,
  TransactionSignature,
  Commitment
} from '@solana/web3.js';
import {
  MagicRouter,
  EphemeralRollupManager,
  RollupConfig,
  RollupSession,
  StateCommitment
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { EventEmitter } from 'eventemitter3';

export interface ERRollupConfig {
  computeBudget: number;
  lifetimeMs: number;
  autoCommit: boolean;
  batchSize: number;
  tickRateMs: number;
  maxRetries: number;
}

export interface ERSession {
  id: string;
  rollupId: string;
  startedAt: number;
  expiresAt: number;
  transactionCount: number;
  lastCommitAt: number;
  config: ERRollupConfig;
}

export interface ERTransaction {
  id: string;
  signature: string;
  rollupSignature?: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  executionTime: number;
}

export interface ERMetrics {
  averageLatency: number;
  transactionsPerSecond: number;
  successRate: number;
  rollupUtilization: number;
  lastCommitLatency: number;
}

export class EphemeralRollupsClient extends EventEmitter {
  private connection: Connection;
  private magicRouter: MagicRouter;
  private rollupManager: EphemeralRollupManager;
  private activeSessions: Map<string, ERSession> = new Map();
  private transactions: Map<string, ERTransaction> = new Map();
  
  // Devnet configuration
  private readonly devnetEndpoint = 'https://devnet-router.magicblock.app';
  private readonly rollupEndpoint = 'wss://devnet-rollup.magicblock.app';
  
  // Performance tracking
  private latencyHistory: number[] = [];
  private readonly MAX_HISTORY = 100;
  private readonly TARGET_LATENCY_MS = 30;
  
  constructor(connection: Connection, useDevnet: boolean = true) {
    super();
    
    // Use MagicBlock devnet router for optimal performance
    this.connection = useDevnet 
      ? new Connection(this.devnetEndpoint, {
          commitment: 'processed',
          wsEndpoint: this.rollupEndpoint
        })
      : connection;
    
    // Initialize MagicBlock SDK components
    this.initializeMagicBlockSDK();
  }

  /**
   * Initialize MagicBlock SDK with devnet configuration
   */
  private async initializeMagicBlockSDK(): Promise<void> {
    try {
      // Initialize Magic Router
      this.magicRouter = new MagicRouter({
        connection: this.connection,
        endpoint: this.devnetEndpoint
      });
      
      // Initialize Rollup Manager
      this.rollupManager = new EphemeralRollupManager({
        connection: this.connection,
        magicRouter: this.magicRouter,
        config: {
          defaultComputeBudget: 1_000_000,
          defaultLifetimeMs: 3600000, // 1 hour
          maxConcurrentRollups: 10
        }
      });
      
      await this.magicRouter.initialize();
      await this.rollupManager.initialize();
      
      console.log('✅ MagicBlock SDK initialized for devnet');
      
    } catch (error) {
      console.error('❌ Failed to initialize MagicBlock SDK:', error);
      throw new Error(`SDK initialization failed: ${error.message}`);
    }
  }

  /**
   * Create new ephemeral rollup session
   */
  async createRollupSession(
    authority: Keypair,
    config: Partial<ERRollupConfig> = {}
  ): Promise<ERSession> {
    const startTime = performance.now();
    
    try {
      const rollupConfig: RollupConfig = {
        computeBudget: config.computeBudget || 1_000_000,
        lifetimeMs: config.lifetimeMs || 3600000, // 1 hour
        autoCommit: config.autoCommit ?? true,
        batchSize: config.batchSize || 50,
        tickRateMs: config.tickRateMs || 100, // 10 TPS base
        authority: authority.publicKey
      };
      
      // Create rollup through SDK
      const rollupSession: RollupSession = await this.rollupManager.createRollup(
        authority,
        rollupConfig
      );
      
      const session: ERSession = {
        id: rollupSession.id,
        rollupId: rollupSession.rollupId,
        startedAt: Date.now(),
        expiresAt: Date.now() + rollupConfig.lifetimeMs,
        transactionCount: 0,
        lastCommitAt: Date.now(),
        config: rollupConfig as ERRollupConfig
      };
      
      // Store active session
      this.activeSessions.set(session.id, session);
      
      const latency = performance.now() - startTime;
      this.addLatencyMeasurement(latency);
      
      console.log(`✅ Rollup session created: ${session.id} (${latency.toFixed(1)}ms)`);
      this.emit('session:created', session);
      
      return session;
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ Rollup session creation failed in ${latency.toFixed(1)}ms:`, error);
      throw new Error(`Rollup session creation failed: ${error.message}`);
    }
  }

  /**
   * Execute transaction on ephemeral rollup with <30ms target
   */
  async executeTransaction(
    sessionId: string,
    transaction: Transaction,
    signers: Keypair[]
  ): Promise<ERTransaction> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Check session validity
      if (Date.now() > session.expiresAt) {
        throw new Error('Rollup session expired');
      }
      
      // Execute on ephemeral rollup for instant confirmation
      const rollupResult = await this.rollupManager.executeTransaction({
        rollupId: session.rollupId,
        transaction,
        signers,
        commitment: 'processed' as Commitment, // Fastest commitment
        skipPreflight: true // Skip for maximum speed
      });
      
      const executionTime = performance.now() - startTime;
      this.addLatencyMeasurement(executionTime);
      
      const erTransaction: ERTransaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        signature: rollupResult.signature,
        rollupSignature: rollupResult.rollupSignature,
        timestamp: Date.now(),
        status: 'confirmed',
        executionTime
      };
      
      // Update session
      session.transactionCount++;
      this.transactions.set(erTransaction.id, erTransaction);
      
      if (executionTime > this.TARGET_LATENCY_MS) {
        console.warn(`⚠️ Transaction took ${executionTime}ms, target is ${this.TARGET_LATENCY_MS}ms`);
      }
      
      console.log(`✅ Rollup TX executed: ${rollupResult.signature} (${executionTime.toFixed(1)}ms)`);
      this.emit('transaction:executed', erTransaction);
      
      return erTransaction;
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(`❌ Rollup transaction failed in ${executionTime.toFixed(1)}ms:`, error);
      
      const failedTransaction: ERTransaction = {
        id: `failed_${Date.now()}`,
        signature: '',
        timestamp: Date.now(),
        status: 'failed',
        executionTime
      };
      
      this.emit('transaction:failed', failedTransaction, error);
      throw new Error(`Rollup transaction failed: ${error.message}`);
    }
  }

  /**
   * Commit rollup state to L1 Solana
   */
  async commitToL1(sessionId: string): Promise<{
    signature: string;
    stateRoot: string;
    commitmentLatency: number;
  }> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Generate state commitment
      const stateCommitment: StateCommitment = await this.rollupManager.generateStateCommitment(
        session.rollupId
      );
      
      // Commit to L1
      const commitResult = await this.rollupManager.commitToL1({
        rollupId: session.rollupId,
        stateCommitment,
        priorityFee: 0.001 // 0.001 SOL priority fee for fast confirmation
      });
      
      const commitmentLatency = performance.now() - startTime;
      session.lastCommitAt = Date.now();
      
      console.log(`✅ State committed to L1: ${commitResult.signature} (${commitmentLatency.toFixed(1)}ms)`);
      this.emit('state:committed', {
        sessionId,
        signature: commitResult.signature,
        stateRoot: stateCommitment.stateRoot
      });
      
      return {
        signature: commitResult.signature,
        stateRoot: stateCommitment.stateRoot,
        commitmentLatency
      };
      
    } catch (error) {
      const commitmentLatency = performance.now() - startTime;
      console.error(`❌ L1 commitment failed in ${commitmentLatency.toFixed(1)}ms:`, error);
      throw new Error(`L1 commitment failed: ${error.message}`);
    }
  }

  /**
   * Get current rollup state
   */
  async getRollupState(sessionId: string): Promise<any> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      const state = await this.rollupManager.getRollupState(session.rollupId);
      
      const latency = performance.now() - startTime;
      if (latency > this.TARGET_LATENCY_MS) {
        console.warn(`State fetch took ${latency}ms, optimizing...`);
      }
      
      return state;
      
    } catch (error) {
      console.error('Failed to get rollup state:', error);
      throw new Error(`Failed to get rollup state: ${error.message}`);
    }
  }

  /**
   * Subscribe to rollup state changes
   */
  async subscribeToStateChanges(
    sessionId: string,
    callback: (state: any) => void
  ): Promise<number> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const subscriptionId = await this.rollupManager.subscribeToStateChanges(
      session.rollupId,
      callback
    );
    
    console.log(`📡 Subscribed to state changes for session ${sessionId}`);
    return subscriptionId;
  }

  /**
   * Close rollup session and cleanup
   */
  async closeSession(sessionId: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found for closure`);
        return;
      }
      
      // Final commit if auto-commit is enabled and there are pending transactions
      if (session.config.autoCommit && session.transactionCount > 0) {
        await this.commitToL1(sessionId);
      }
      
      // Close rollup
      await this.rollupManager.closeRollup(session.rollupId);
      
      // Cleanup
      this.activeSessions.delete(sessionId);
      
      const latency = performance.now() - startTime;
      console.log(`✅ Rollup session closed: ${sessionId} (${latency.toFixed(1)}ms)`);
      this.emit('session:closed', sessionId);
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ Session closure failed in ${latency.toFixed(1)}ms:`, error);
      // Force cleanup even if SDK call failed
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): ERMetrics {
    const avgLatency = this.latencyHistory.length > 0
      ? this.latencyHistory.reduce((sum, lat) => sum + lat, 0) / this.latencyHistory.length
      : 0;
    
    const totalSessions = this.activeSessions.size;
    const totalTransactions = this.transactions.size;
    
    // Calculate TPS over last minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentTransactions = Array.from(this.transactions.values())
      .filter(tx => tx.timestamp > oneMinuteAgo).length;
    
    const successfulTransactions = Array.from(this.transactions.values())
      .filter(tx => tx.status === 'confirmed').length;
    
    const successRate = totalTransactions > 0 ? successfulTransactions / totalTransactions : 0;
    
    return {
      averageLatency: avgLatency,
      transactionsPerSecond: recentTransactions / 60,
      successRate,
      rollupUtilization: totalSessions > 0 ? totalSessions / 10 : 0, // Based on max 10 concurrent
      lastCommitLatency: this.getLastCommitLatency()
    };
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): ERSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Health check for rollup connectivity
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    rollupConnected: boolean;
    activeRollups: number;
  }> {
    const startTime = performance.now();
    
    try {
      // Test connection to MagicRouter
      const rollupStatus = await this.magicRouter.getStatus();
      const latency = performance.now() - startTime;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (latency > 100) status = 'degraded';
      if (latency > 500 || !rollupStatus.connected) status = 'unhealthy';
      
      return {
        status,
        latency,
        rollupConnected: rollupStatus.connected,
        activeRollups: this.activeSessions.size
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: performance.now() - startTime,
        rollupConnected: false,
        activeRollups: 0
      };
    }
  }

  /**
   * Cleanup expired sessions automatically
   */
  startAutoCleanup(): void {
    setInterval(async () => {
      const now = Date.now();
      const expiredSessions: string[] = [];
      
      for (const [sessionId, session] of this.activeSessions) {
        if (now > session.expiresAt) {
          expiredSessions.push(sessionId);
        }
      }
      
      for (const sessionId of expiredSessions) {
        try {
          await this.closeSession(sessionId);
        } catch (error) {
          console.error(`Failed to cleanup expired session ${sessionId}:`, error);
        }
      }
      
      if (expiredSessions.length > 0) {
        console.log(`🧹 Cleaned up ${expiredSessions.length} expired rollup sessions`);
      }
    }, 60000); // Check every minute
    
    console.log('🤖 Auto-cleanup started for rollup sessions');
  }

  /**
   * Add latency measurement to history
   */
  private addLatencyMeasurement(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.MAX_HISTORY) {
      this.latencyHistory.shift();
    }
  }

  /**
   * Get last commit latency from sessions
   */
  private getLastCommitLatency(): number {
    const sessions = Array.from(this.activeSessions.values());
    if (sessions.length === 0) return 0;
    
    const lastSession = sessions.reduce((latest, session) => 
      session.lastCommitAt > latest.lastCommitAt ? session : latest
    );
    
    return Date.now() - lastSession.lastCommitAt;
  }
}

export default EphemeralRollupsClient;