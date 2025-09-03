/**
 * MagicBlock Client - Core client for MagicBlock Ephemeral Rollups integration
 */

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
// MagicBlock SDK imports will be added as needed
// import { ... } from '../../magicblock/rollup/ephemeral-rollups-client';
import { EventEmitter } from 'eventemitter3';
import { 
  MagicBlockConfig, 
  SessionState, 
  RollupProof,
  MagicBlockError,
  SDKEvents 
} from '../types';
import { SessionManager } from '../session/session-manager';
import { CostTracker } from '../session/cost-tracker';
import { TransactionQueue } from '../session/transaction-queue';
import { RollupVerifier } from '../proof/rollup-verifier';

export class MagicBlockClient extends EventEmitter<SDKEvents> {
  private connection: Connection;
  private rollupSDK: any; // Placeholder for MagicBlock SDK integration
  private sessionManager: SessionManager;
  private costTracker: CostTracker;
  private transactionQueue: TransactionQueue;
  private rollupVerifier: RollupVerifier;
  private config: MagicBlockConfig;
  
  private isInitialized = false;
  private rollupProgramId?: PublicKey;
  
  constructor(config: MagicBlockConfig) {
    super();
    
    this.config = config;
    this.connection = config.connection;
    
    // Initialize components
    // Initialize MagicBlock SDK when available
    this.rollupSDK = {
      connection: this.connection,
      rollupUrl: config.rollupUrl
    };
    
    this.sessionManager = new SessionManager({
      maxDuration: config.sessionTimeout,
      gaslessTransactions: config.gaslessEnabled,
      autoRenew: true
    });
    
    this.costTracker = new CostTracker(this.connection);
    this.transactionQueue = new TransactionQueue(this.connection, this.costTracker);
    
    // Rollup verifier will be initialized after getting program ID
    this.rollupVerifier = new RollupVerifier(this.connection, PublicKey.default);
    
    // Forward events
    this.setupEventForwarding();
  }

  /**
   * Initialize the MagicBlock client
   * @param keypair Optional keypair for session (generates if not provided)
   */
  async initialize(keypair?: Keypair): Promise<void> {
    try {
      // Initialize rollup SDK
      await this.rollupSDK.initialize();
      
      // Get rollup program ID
      this.rollupProgramId = await this.getRollupProgramId();
      
      // Re-initialize rollup verifier with correct program ID
      this.rollupVerifier = new RollupVerifier(this.connection, this.rollupProgramId);
      
      // Create initial session
      await this.sessionManager.createSession(keypair);
      
      this.isInitialized = true;
      this.emit('initialized', { vrfPublicKey: this.rollupProgramId?.toString() || '' });
      
    } catch (error) {
      throw new MagicBlockError(
        `MagicBlock client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_ERROR'
      );
    }
  }

  /**
   * Check if client is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.sessionManager.getActiveSession()?.isActive === true;
  }

  /**
   * Create a new ephemeral rollup session
   * @param config Optional session configuration
   */
  async createRollupSession(config?: { 
    computeBudget?: number;
    lifetimeMs?: number;
    autoCommit?: boolean;
  }): Promise<{ sessionId: string; rollupId: string }> {
    if (!this.isInitialized) {
      throw new MagicBlockError('Client not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Create session through session manager
      const session = await this.sessionManager.createSession();
      
      // Create ephemeral rollup
      const rollupConfig = {
        computeBudget: config?.computeBudget || 1_000_000,
        lifetimeMs: config?.lifetimeMs || this.config.sessionTimeout,
        autoCommit: config?.autoCommit ?? true
      };
      
      const rollup = await this.rollupSDK.createRollup(rollupConfig);
      
      return {
        sessionId: session.id,
        rollupId: rollup.id
      };
    } catch (error) {
      throw new MagicBlockError(
        `Failed to create rollup session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ROLLUP_SESSION_ERROR'
      );
    }
  }

  /**
   * Execute transaction on ephemeral rollup
   * @param transaction Transaction to execute
   * @param options Execution options
   */
  async executeTransaction(transaction: Transaction, options?: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    maxFee?: number;
    timeout?: number;
    rollupId?: string;
  }): Promise<{ signature: string; rollupTxId?: string }> {
    if (!this.isInitialized) {
      throw new MagicBlockError('Client not initialized', 'NOT_INITIALIZED');
    }

    const session = this.sessionManager.getActiveSession();
    if (!session) {
      throw new MagicBlockError('No active session', 'NO_ACTIVE_SESSION');
    }

    try {
      // Execute on rollup first for speed
      let rollupTxId: string | undefined;
      if (options?.rollupId) {
        const rollupResult = await this.rollupSDK.executeTransaction({
          transaction,
          rollupId: options.rollupId
        });
        rollupTxId = rollupResult.transactionId;
      }

      // Queue for L1 settlement
      const queuedTxId = await this.transactionQueue.enqueueTransaction({
        transaction,
        priority: options?.priority || 'medium',
        maxFee: options?.maxFee || 0.01, // 0.01 SOL default
        timeout: Date.now() + (options?.timeout || 30000), // 30s default
        retries: this.config.maxRetries,
        metadata: {
          sessionId: session.id,
          rollupTxId,
          type: 'rollup_settlement'
        }
      });

      // For rollup transactions, return immediately with rollup signature
      if (rollupTxId) {
        return {
          signature: queuedTxId, // Use queue ID as signature for tracking
          rollupTxId
        };
      }

      // For L1 transactions, wait for confirmation if not gasless
      if (!this.config.gaslessEnabled) {
        // Wait for L1 confirmation
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new MagicBlockError('Transaction timeout', 'TRANSACTION_TIMEOUT'));
          }, options?.timeout || 30000);

          this.transactionQueue.once('transaction:confirmed', (signature) => {
            clearTimeout(timeout);
            resolve({ signature });
          });

          this.transactionQueue.once('transaction:failed', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }

      return { signature: queuedTxId };
      
    } catch (error) {
      throw new MagicBlockError(
        `Transaction execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TRANSACTION_ERROR'
      );
    }
  }

  /**
   * Commit rollup state to L1
   * @param rollupId Rollup ID to commit
   */
  async commitToL1(rollupId: string): Promise<{ signature: string; proof: RollupProof }> {
    if (!this.isInitialized) {
      throw new MagicBlockError('Client not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Generate rollup proof
      const proof = await this.rollupSDK.generateProof(rollupId);
      
      // Create L1 commitment transaction
      const commitTx = await this.rollupSDK.createCommitTransaction(rollupId, proof);
      
      // Execute commitment
      const result = await this.executeTransaction(commitTx, {
        priority: 'high',
        timeout: 60000 // 60s for L1 commitment
      });
      
      // Convert SDK proof to our format
      const rollupProof: RollupProof = {
        stateRoot: proof.stateRoot,
        blockHash: proof.blockHash,
        transactionHash: proof.transactionHash,
        signature: proof.signature,
        timestamp: Date.now(),
        blockNumber: proof.blockNumber
      };
      
      return {
        signature: result.signature,
        proof: rollupProof
      };
    } catch (error) {
      throw new MagicBlockError(
        `L1 commitment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'COMMITMENT_ERROR'
      );
    }
  }

  /**
   * Verify rollup proof
   * @param proof Rollup proof to verify
   */
  async verifyProof(proof: RollupProof): Promise<boolean> {
    if (!this.isInitialized) {
      throw new MagicBlockError('Client not initialized', 'NOT_INITIALIZED');
    }

    try {
      const result = await this.rollupVerifier.verifyProof(proof);
      return result.isValid;
    } catch (error) {
      console.error('Proof verification failed:', error);
      return false;
    }
  }

  /**
   * Get current session state
   */
  getSession(): SessionState | null {
    return this.sessionManager.getActiveSession();
  }

  /**
   * Get cost tracking information
   */
  getCostTracking() {
    return this.costTracker.getCostTracking();
  }

  /**
   * Get transaction queue metrics
   */
  getQueueMetrics() {
    return this.transactionQueue.getMetrics();
  }

  /**
   * Get client status and health
   */
  getStatus(): {
    isInitialized: boolean;
    isReady: boolean;
    session: SessionState | null;
    queueMetrics: any;
    costTracking: any;
  } {
    return {
      isInitialized: this.isInitialized,
      isReady: this.isReady(),
      session: this.getSession(),
      queueMetrics: this.getQueueMetrics(),
      costTracking: this.getCostTracking()
    };
  }

  /**
   * Close client and cleanup resources
   */
  async close(): Promise<void> {
    try {
      // Stop transaction queue processing
      this.transactionQueue.stopProcessing();
      
      // Close active session
      const session = this.sessionManager.getActiveSession();
      if (session) {
        await this.sessionManager.closeSession(session.id);
      }
      
      // Cleanup verifier cache
      this.rollupVerifier.clearCache();
      
      this.isInitialized = false;
      
    } catch (error) {
      console.error('Error during client cleanup:', error);
    }
  }

  /**
   * Get rollup program ID from network
   */
  private async getRollupProgramId(): Promise<PublicKey> {
    try {
      // In a real implementation, this would query the network for the program ID
      // For now, return a default program ID
      return new PublicKey('MagicB1ockRo11upProgram111111111111111111111');
    } catch (error) {
      throw new MagicBlockError(
        `Failed to get rollup program ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PROGRAM_ID_ERROR'
      );
    }
  }

  /**
   * Setup event forwarding from sub-components
   */
  private setupEventForwarding(): void {
    // Forward session events
    this.sessionManager.on('session:created', (session) => {
      this.emit('session:created', session);
    });
    
    this.sessionManager.on('session:expired', (sessionId) => {
      this.emit('session:expired', sessionId);
    });
    
    // Forward transaction events
    this.transactionQueue.on('transaction:queued', (tx) => {
      this.emit('transaction:queued', tx);
    });
    
    this.transactionQueue.on('transaction:confirmed', (signature) => {
      this.emit('transaction:confirmed', signature);
    });
    
    this.transactionQueue.on('transaction:failed', (error, tx) => {
      this.emit('transaction:failed', error, tx);
    });
    
    // Forward cost events
    this.costTracker.on('cost:updated', (tracking) => {
      this.emit('cost:updated', tracking);
    });
    
    // Forward proof events
    this.rollupVerifier.on('proof:verified', (result) => {
      this.emit('proof:verified', result);
    });
  }
}