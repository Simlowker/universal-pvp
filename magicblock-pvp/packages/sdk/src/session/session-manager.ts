/**
 * Session Manager - Handle gasless transactions and session lifecycle
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import { EventEmitter } from 'eventemitter3';
import { 
  SessionConfig, 
  SessionState, 
  SessionMetrics, 
  SessionError,
  SDKEvents 
} from '../types';

export class SessionManager extends EventEmitter<SDKEvents> {
  private sessions = new Map<string, SessionState>();
  private activeSessionId?: string;
  private config: SessionConfig;
  private sessionMetrics = new Map<string, SessionMetrics>();

  constructor(config: Partial<SessionConfig> = {}) {
    super();
    
    this.config = {
      maxDuration: 3600000, // 1 hour default
      gaslessTransactions: true,
      autoRenew: true,
      batchSize: 10,
      ...config
    };

    // Auto-cleanup expired sessions
    setInterval(() => this.cleanupExpiredSessions(), 60000); // Every minute
  }

  /**
   * Create a new session
   * @param keypair Optional keypair for session (generates if not provided)
   * @returns Session state
   */
  async createSession(keypair?: Keypair): Promise<SessionState> {
    const sessionKeypair = keypair || Keypair.generate();
    const now = Date.now();
    
    const sessionState: SessionState = {
      id: this.generateSessionId(),
      publicKey: sessionKeypair.publicKey,
      isActive: true,
      createdAt: now,
      expiresAt: now + this.config.maxDuration,
      gaslessTransactions: 0,
      totalCost: 0
    };

    // Initialize metrics
    const metrics: SessionMetrics = {
      transactionsProcessed: 0,
      gasUsed: 0,
      costInSOL: 0,
      averageLatency: 0,
      successRate: 0
    };

    this.sessions.set(sessionState.id, sessionState);
    this.sessionMetrics.set(sessionState.id, metrics);
    this.activeSessionId = sessionState.id;

    this.emit('session:created', sessionState);
    
    // Setup auto-renewal if enabled
    if (this.config.autoRenew) {
      this.scheduleAutoRenew(sessionState.id);
    }

    return sessionState;
  }

  /**
   * Get active session
   */
  getActiveSession(): SessionState | null {
    if (!this.activeSessionId) {
      return null;
    }

    const session = this.sessions.get(this.activeSessionId);
    if (!session || !session.isActive) {
      this.activeSessionId = undefined;
      return null;
    }

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): SessionState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Extend session duration
   */
  async extendSession(sessionId: string, additionalTime: number): Promise<SessionState> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError(`Session ${sessionId} not found`);
    }

    if (!session.isActive) {
      throw new SessionError(`Session ${sessionId} is not active`);
    }

    session.expiresAt += additionalTime;
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError(`Session ${sessionId} not found`);
    }

    session.isActive = false;
    this.sessions.set(sessionId, session);

    if (this.activeSessionId === sessionId) {
      this.activeSessionId = undefined;
    }

    this.emit('session:expired', sessionId);
  }

  /**
   * Record transaction in session
   */
  recordTransaction(sessionId: string, gasUsed: number, cost: number, latency: number, success: boolean): void {
    const session = this.sessions.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);
    
    if (!session || !metrics) {
      return;
    }

    // Update session
    if (this.config.gaslessTransactions && success) {
      session.gaslessTransactions++;
    }
    session.totalCost += cost;

    // Update metrics
    metrics.transactionsProcessed++;
    metrics.gasUsed += gasUsed;
    metrics.costInSOL += cost;
    
    // Update average latency
    const totalTx = metrics.transactionsProcessed;
    metrics.averageLatency = (metrics.averageLatency * (totalTx - 1) + latency) / totalTx;
    
    // Update success rate
    const successCount = Math.round(metrics.successRate * (totalTx - 1)) + (success ? 1 : 0);
    metrics.successRate = successCount / totalTx;

    this.sessions.set(sessionId, session);
    this.sessionMetrics.set(sessionId, metrics);
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(sessionId: string): SessionMetrics | null {
    return this.sessionMetrics.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionState[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }

  /**
   * Check if session needs renewal
   */
  needsRenewal(sessionId: string, thresholdMs: number = 300000): boolean { // 5 minutes default
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return false;
    }

    return (session.expiresAt - Date.now()) < thresholdMs;
  }

  /**
   * Batch transaction tracking for efficiency
   */
  recordTransactionBatch(sessionId: string, transactions: Array<{
    gasUsed: number;
    cost: number;
    latency: number;
    success: boolean;
  }>): void {
    const session = this.sessions.get(sessionId);
    const metrics = this.sessionMetrics.get(sessionId);
    
    if (!session || !metrics) {
      return;
    }

    let totalGas = 0;
    let totalCost = 0;
    let totalLatency = 0;
    let successCount = 0;

    transactions.forEach(tx => {
      totalGas += tx.gasUsed;
      totalCost += tx.cost;
      totalLatency += tx.latency;
      if (tx.success) {
        successCount++;
        if (this.config.gaslessTransactions) {
          session.gaslessTransactions++;
        }
      }
    });

    // Update session
    session.totalCost += totalCost;

    // Update metrics
    const prevTxCount = metrics.transactionsProcessed;
    metrics.transactionsProcessed += transactions.length;
    metrics.gasUsed += totalGas;
    metrics.costInSOL += totalCost;

    // Update average latency
    const avgBatchLatency = totalLatency / transactions.length;
    const newTxCount = metrics.transactionsProcessed;
    metrics.averageLatency = (metrics.averageLatency * prevTxCount + avgBatchLatency * transactions.length) / newTxCount;

    // Update success rate
    const prevSuccessCount = Math.round(metrics.successRate * prevTxCount);
    metrics.successRate = (prevSuccessCount + successCount) / newTxCount;

    this.sessions.set(sessionId, session);
    this.sessionMetrics.set(sessionId, metrics);
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Schedule automatic session renewal
   */
  private scheduleAutoRenew(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const renewalTime = session.expiresAt - Date.now() - 300000; // 5 minutes before expiry
    
    if (renewalTime > 0) {
      setTimeout(async () => {
        if (this.needsRenewal(sessionId)) {
          try {
            await this.extendSession(sessionId, this.config.maxDuration);
            this.scheduleAutoRenew(sessionId); // Schedule next renewal
          } catch (error) {
            console.warn(`Auto-renewal failed for session ${sessionId}:`, error);
          }
        }
      }, renewalTime);
    }
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];

    this.sessions.forEach((session, sessionId) => {
      if (session.expiresAt < now && session.isActive) {
        session.isActive = false;
        this.sessions.set(sessionId, session);
        expiredSessions.push(sessionId);
      }
    });

    expiredSessions.forEach(sessionId => {
      this.emit('session:expired', sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = undefined;
      }
    });
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalTransactions: number;
    totalCost: number;
  } {
    let totalSessions = this.sessions.size;
    let activeSessions = 0;
    let totalTransactions = 0;
    let totalCost = 0;

    this.sessions.forEach(session => {
      if (session.isActive) {
        activeSessions++;
      }
      totalCost += session.totalCost;
    });

    this.sessionMetrics.forEach(metrics => {
      totalTransactions += metrics.transactionsProcessed;
    });

    return {
      totalSessions,
      activeSessions,
      totalTransactions,
      totalCost
    };
  }

  /**
   * Export session data for persistence
   */
  exportSessions(): {
    sessions: Array<SessionState>;
    metrics: Array<{ sessionId: string; metrics: SessionMetrics }>;
  } {
    const sessions = Array.from(this.sessions.values());
    const metrics = Array.from(this.sessionMetrics.entries()).map(([sessionId, metrics]) => ({
      sessionId,
      metrics
    }));

    return { sessions, metrics };
  }

  /**
   * Import session data
   */
  importSessions(data: {
    sessions: Array<SessionState>;
    metrics: Array<{ sessionId: string; metrics: SessionMetrics }>;
  }): void {
    // Clear existing sessions
    this.sessions.clear();
    this.sessionMetrics.clear();
    this.activeSessionId = undefined;

    // Import sessions
    data.sessions.forEach(session => {
      this.sessions.set(session.id, session);
      
      // Set active session (most recent active one)
      if (session.isActive && (!this.activeSessionId || session.createdAt > (this.sessions.get(this.activeSessionId)?.createdAt || 0))) {
        this.activeSessionId = session.id;
      }
    });

    // Import metrics
    data.metrics.forEach(({ sessionId, metrics }) => {
      this.sessionMetrics.set(sessionId, metrics);
    });
  }
}