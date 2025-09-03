/**
 * Real SessionKeyManager implementation using MagicBlock SDK
 * Replaces mock implementation with actual devnet integration
 */

import { 
  Connection, 
  PublicKey, 
  Keypair,
  Transaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction
} from '@solana/web3.js';
import { 
  SessionWallet, 
  SessionOptions,
  createSessionKeyManager,
  SessionKeyManager as GumSessionManager
} from '@magicblock-labs/gum-react-sdk';
import { BN } from '@coral-xyz/anchor';

export interface SessionConfig {
  validUntil?: number; // Unix timestamp
  permissions: SessionPermission[];
  gaslessEnabled: boolean;
  maxTransactionsPerSecond?: number;
  maxTransactionsPerSession?: number;
}

export interface SessionPermission {
  programId: PublicKey;
  instruction: string;
  maxAmount?: BN;
  accounts?: PublicKey[];
}

export interface ActiveSession {
  sessionKey: Keypair;
  sessionWallet: SessionWallet;
  authority: PublicKey;
  validUntil: number;
  permissions: SessionPermission[];
  transactionCount: number;
  createdAt: number;
  lastUsed: number;
}

export class RealSessionKeyManager {
  private connection: Connection;
  private gumSessionManager: GumSessionManager;
  private activeSessions: Map<string, ActiveSession> = new Map();
  private devnetEndpoint = 'https://devnet-router.magicblock.app';
  
  // Performance tracking
  private latencyTracker: Map<string, number> = new Map();
  private readonly TARGET_LATENCY_MS = 30;
  
  constructor(connection: Connection, devnetMode = true) {
    this.connection = connection;
    
    // Initialize Gum Session Manager for MagicBlock devnet
    this.gumSessionManager = createSessionKeyManager({
      connection: new Connection(devnetMode ? this.devnetEndpoint : connection.rpcEndpoint),
      cluster: devnetMode ? 'devnet' : 'mainnet-beta'
    });
  }

  /**
   * Create new gasless session with MagicBlock delegation
   */
  async createSession(
    authority: Keypair,
    config: SessionConfig
  ): Promise<ActiveSession> {
    const startTime = performance.now();
    
    try {
      // Generate session keypair
      const sessionKey = Keypair.generate();
      
      // Create session with MagicBlock Gum integration
      const sessionOptions: SessionOptions = {
        authority: authority.publicKey,
        sessionKey: sessionKey.publicKey,
        validUntil: config.validUntil || (Date.now() / 1000 + 3600), // 1 hour default
        permissions: config.permissions.map(p => ({
          programId: p.programId,
          instruction: p.instruction,
          maxAmount: p.maxAmount,
          accounts: p.accounts || []
        }))
      };
      
      // Create session through Gum SDK
      const sessionWallet = await this.gumSessionManager.createSessionWallet(
        authority,
        sessionOptions
      );
      
      const session: ActiveSession = {
        sessionKey,
        sessionWallet,
        authority: authority.publicKey,
        validUntil: sessionOptions.validUntil,
        permissions: config.permissions,
        transactionCount: 0,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };
      
      // Store active session
      this.activeSessions.set(sessionKey.publicKey.toString(), session);
      
      const latency = performance.now() - startTime;
      this.latencyTracker.set('create_session', latency);
      
      if (latency > this.TARGET_LATENCY_MS) {
        console.warn(`Session creation took ${latency}ms, target is ${this.TARGET_LATENCY_MS}ms`);
      }
      
      console.log(`✅ Session created: ${sessionKey.publicKey.toString()} (${latency.toFixed(1)}ms)`);
      
      return session;
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ Session creation failed in ${latency.toFixed(1)}ms:`, error);
      throw new Error(`Session creation failed: ${error.message}`);
    }
  }

  /**
   * Execute gasless transaction using session delegation
   */
  async executeGaslessTransaction(
    sessionId: string,
    transaction: Transaction,
    programId: PublicKey,
    instruction: string
  ): Promise<{ signature: string; executionTime: number }> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Check session validity
      if (Date.now() / 1000 > session.validUntil) {
        throw new Error('Session expired');
      }
      
      // Verify permission
      const hasPermission = session.permissions.some(p => 
        p.programId.equals(programId) && 
        (p.instruction === '*' || p.instruction === instruction)
      );
      
      if (!hasPermission) {
        throw new Error(`No permission for ${programId.toString()}:${instruction}`);
      }
      
      // Execute through session wallet (gasless)
      const signature = await session.sessionWallet.sendTransaction(transaction);
      
      // Update session usage
      session.transactionCount++;
      session.lastUsed = Date.now();
      
      const executionTime = performance.now() - startTime;
      this.latencyTracker.set(`tx_${instruction}`, executionTime);
      
      if (executionTime > this.TARGET_LATENCY_MS) {
        console.warn(`Transaction took ${executionTime}ms, target is ${this.TARGET_LATENCY_MS}ms`);
      }
      
      console.log(`✅ Gasless TX executed: ${signature} (${executionTime.toFixed(1)}ms)`);
      
      return {
        signature,
        executionTime
      };
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error(`❌ Gasless transaction failed in ${executionTime.toFixed(1)}ms:`, error);
      throw new Error(`Gasless transaction failed: ${error.message}`);
    }
  }

  /**
   * Renew session before expiry
   */
  async renewSession(sessionId: string, extendBySeconds: number = 3600): Promise<void> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Extend session through Gum SDK
      const newValidUntil = session.validUntil + extendBySeconds;
      
      await this.gumSessionManager.extendSession(
        session.sessionWallet,
        newValidUntil
      );
      
      // Update local session
      session.validUntil = newValidUntil;
      
      const latency = performance.now() - startTime;
      console.log(`✅ Session renewed: ${sessionId} (${latency.toFixed(1)}ms)`);
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ Session renewal failed in ${latency.toFixed(1)}ms:`, error);
      throw new Error(`Session renewal failed: ${error.message}`);
    }
  }

  /**
   * Close session and cleanup
   */
  async closeSession(sessionId: string): Promise<void> {
    const startTime = performance.now();
    
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found for closure`);
        return;
      }
      
      // Close session through Gum SDK
      await this.gumSessionManager.closeSession(session.sessionWallet);
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      
      const latency = performance.now() - startTime;
      console.log(`✅ Session closed: ${sessionId} (${latency.toFixed(1)}ms)`);
      
    } catch (error) {
      const latency = performance.now() - startTime;
      console.error(`❌ Session closure failed in ${latency.toFixed(1)}ms:`, error);
      // Still remove from active sessions even if SDK call failed
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Check session validity
   */
  isSessionValid(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    
    return Date.now() / 1000 < session.validUntil;
  }

  /**
   * Get performance metrics
   */
  getLatencyMetrics(): Record<string, number> {
    return Object.fromEntries(this.latencyTracker);
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now() / 1000;
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.activeSessions) {
      if (now > session.validUntil) {
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
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Create session for PvP game
   */
  async createPvPSession(
    authority: Keypair,
    gameProgram: PublicKey,
    maxBetAmount?: BN
  ): Promise<ActiveSession> {
    const gamePermissions: SessionPermission[] = [
      {
        programId: gameProgram,
        instruction: 'place_bet',
        maxAmount: maxBetAmount || new BN(1000000) // 1 SOL default
      },
      {
        programId: gameProgram,
        instruction: 'fold_hand'
      },
      {
        programId: gameProgram,
        instruction: 'call_bet'
      },
      {
        programId: gameProgram,
        instruction: 'raise_bet',
        maxAmount: maxBetAmount || new BN(1000000)
      },
      {
        programId: gameProgram,
        instruction: 'reveal_hand'
      },
      {
        programId: gameProgram,
        instruction: 'strategic_fold'
      }
    ];
    
    const config: SessionConfig = {
      validUntil: Date.now() / 1000 + 7200, // 2 hours for PvP games
      permissions: gamePermissions,
      gaslessEnabled: true,
      maxTransactionsPerSecond: 10,
      maxTransactionsPerSession: 1000
    };
    
    return this.createSession(authority, config);
  }

  /**
   * Auto-renewal mechanism for long sessions
   */
  startAutoRenewal(renewalThresholdSeconds: number = 300): void {
    const checkInterval = 60000; // Check every minute
    
    setInterval(async () => {
      const now = Date.now() / 1000;
      
      for (const [sessionId, session] of this.activeSessions) {
        const timeLeft = session.validUntil - now;
        
        if (timeLeft > 0 && timeLeft < renewalThresholdSeconds) {
          try {
            await this.renewSession(sessionId, 3600); // Extend by 1 hour
            console.log(`🔄 Auto-renewed session: ${sessionId}`);
          } catch (error) {
            console.error(`Failed to auto-renew session ${sessionId}:`, error);
          }
        }
      }
    }, checkInterval);
    
    console.log(`🤖 Auto-renewal started (threshold: ${renewalThresholdSeconds}s)`);
  }
}

export default RealSessionKeyManager;