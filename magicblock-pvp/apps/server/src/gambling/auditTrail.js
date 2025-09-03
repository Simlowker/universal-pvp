const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');
const crypto = require('crypto');

/**
 * Financial Audit Trail System
 * Comprehensive logging and reporting for all gambling transactions
 */
class AuditTrailManager {
  constructor() {
    this.auditLogs = {
      TRANSACTION: 'transaction_audit',
      BET: 'bet_audit',
      PAYOUT: 'payout_audit',
      ESCROW: 'escrow_audit',
      SECURITY: 'security_audit',
      SYSTEM: 'system_audit'
    };
    
    this.retentionPeriods = {
      [this.auditLogs.TRANSACTION]: 2592000000, // 30 days
      [this.auditLogs.BET]: 7776000000, // 90 days
      [this.auditLogs.PAYOUT]: 7776000000, // 90 days
      [this.auditLogs.ESCROW]: 15552000000, // 180 days
      [this.auditLogs.SECURITY]: 31104000000, // 360 days
      [this.auditLogs.SYSTEM]: 2592000000 // 30 days
    };

    this.initializeAuditSystem();
  }

  /**
   * Initialize audit system with integrity checks
   */
  initializeAuditSystem() {
    // Start audit log integrity verification
    this.startIntegrityMonitoring();
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
    
    // Initialize audit metrics
    this.auditMetrics = {
      totalLogs: 0,
      logsByType: {},
      integrityChecks: 0,
      tamperAttempts: 0,
      lastIntegrityCheck: null
    };

    logger.info('Audit trail system initialized');
  }

  /**
   * Log financial transaction with full audit trail
   */
  async logTransaction(transactionData) {
    try {
      const auditEntry = {
        id: this.generateAuditId('TXN'),
        type: 'FINANCIAL_TRANSACTION',
        timestamp: Date.now(),
        userId: transactionData.userId,
        userWallet: transactionData.userWallet,
        transactionType: transactionData.type, // deposit, withdrawal, bet, payout, fee
        amount: transactionData.amount,
        currency: transactionData.currency || 'SOL',
        fromAddress: transactionData.fromAddress,
        toAddress: transactionData.toAddress,
        transactionHash: transactionData.transactionHash,
        blockNumber: transactionData.blockNumber,
        gasUsed: transactionData.gasUsed,
        status: transactionData.status, // pending, confirmed, failed
        metadata: {
          poolId: transactionData.poolId,
          matchId: transactionData.matchId,
          tournamentId: transactionData.tournamentId,
          escrowId: transactionData.escrowId,
          description: transactionData.description,
          relatedTransactions: transactionData.relatedTransactions || []
        },
        fingerprint: this.generateFingerprint(transactionData),
        signature: null, // Will be set after hashing
        previousHash: await this.getLastLogHash(this.auditLogs.TRANSACTION)
      };

      // Create cryptographic signature
      auditEntry.signature = this.signAuditEntry(auditEntry);

      // Store in primary audit log
      await this.storeAuditEntry(this.auditLogs.TRANSACTION, auditEntry);

      // Store in user-specific audit log
      await this.storeUserAuditEntry(transactionData.userId, auditEntry);

      // Update audit metrics
      await this.updateAuditMetrics('TRANSACTION', auditEntry);

      logger.debug(`Transaction audit logged: ${auditEntry.id}`);
      return auditEntry.id;

    } catch (error) {
      logger.error('Failed to log transaction audit:', error);
      throw new Error('Audit logging failed');
    }
  }

  /**
   * Log betting activity with comprehensive details
   */
  async logBet(betData) {
    try {
      const auditEntry = {
        id: this.generateAuditId('BET'),
        type: 'BET_PLACED',
        timestamp: Date.now(),
        userId: betData.userId,
        userWallet: betData.userWallet,
        betType: betData.betType, // standard, live, bracket
        poolId: betData.poolId,
        outcomeId: betData.outcomeId,
        amount: betData.amount,
        odds: betData.odds,
        potentialPayout: betData.potentialPayout,
        betStatus: betData.status,
        metadata: {
          matchId: betData.matchId,
          tournamentId: betData.tournamentId,
          roundNumber: betData.roundNumber,
          placementMethod: betData.placementMethod, // web, socket, api
          clientIP: betData.clientIP,
          userAgent: betData.userAgent,
          sessionId: betData.sessionId,
          riskScore: betData.riskScore,
          securityFlags: betData.securityFlags || []
        },
        fingerprint: this.generateFingerprint(betData),
        signature: null,
        previousHash: await this.getLastLogHash(this.auditLogs.BET)
      };

      auditEntry.signature = this.signAuditEntry(auditEntry);

      await this.storeAuditEntry(this.auditLogs.BET, auditEntry);
      await this.storeUserAuditEntry(betData.userId, auditEntry);
      await this.updateAuditMetrics('BET', auditEntry);

      // Cross-reference with transaction log if payment involved
      if (betData.transactionId) {
        await this.createAuditCrossReference(auditEntry.id, betData.transactionId);
      }

      return auditEntry.id;

    } catch (error) {
      logger.error('Failed to log bet audit:', error);
      throw error;
    }
  }

  /**
   * Log payout with settlement details
   */
  async logPayout(payoutData) {
    try {
      const auditEntry = {
        id: this.generateAuditId('PAY'),
        type: 'PAYOUT_PROCESSED',
        timestamp: Date.now(),
        userId: payoutData.userId,
        userWallet: payoutData.userWallet,
        payoutType: payoutData.type, // bet_win, tournament_prize, bracket_bonus
        amount: payoutData.amount,
        originalBetAmount: payoutData.originalBetAmount,
        odds: payoutData.odds,
        profit: payoutData.profit,
        poolId: payoutData.poolId,
        settlementId: payoutData.settlementId,
        metadata: {
          betId: payoutData.betId,
          matchId: payoutData.matchId,
          tournamentId: payoutData.tournamentId,
          escrowId: payoutData.escrowId,
          winningOutcome: payoutData.winningOutcome,
          settlementMethod: payoutData.settlementMethod, // auto, manual
          processingDelay: payoutData.processingDelay,
          transactionFee: payoutData.transactionFee,
          platformFee: payoutData.platformFee
        },
        fingerprint: this.generateFingerprint(payoutData),
        signature: null,
        previousHash: await this.getLastLogHash(this.auditLogs.PAYOUT)
      };

      auditEntry.signature = this.signAuditEntry(auditEntry);

      await this.storeAuditEntry(this.auditLogs.PAYOUT, auditEntry);
      await this.storeUserAuditEntry(payoutData.userId, auditEntry);
      await this.updateAuditMetrics('PAYOUT', auditEntry);

      return auditEntry.id;

    } catch (error) {
      logger.error('Failed to log payout audit:', error);
      throw error;
    }
  }

  /**
   * Log escrow operations
   */
  async logEscrow(escrowData) {
    try {
      const auditEntry = {
        id: this.generateAuditId('ESC'),
        type: 'ESCROW_OPERATION',
        timestamp: Date.now(),
        escrowId: escrowData.escrowId,
        operation: escrowData.operation, // create, deposit, settle, dispute, refund
        initiator: escrowData.initiator,
        participants: escrowData.participants,
        amount: escrowData.amount,
        status: escrowData.status,
        metadata: {
          eventId: escrowData.eventId,
          settlementConditions: escrowData.settlementConditions,
          multisigThreshold: escrowData.multisigThreshold,
          authorities: escrowData.authorities,
          disputeReason: escrowData.disputeReason,
          resolutionMethod: escrowData.resolutionMethod,
          gasEstimate: escrowData.gasEstimate
        },
        fingerprint: this.generateFingerprint(escrowData),
        signature: null,
        previousHash: await this.getLastLogHash(this.auditLogs.ESCROW)
      };

      auditEntry.signature = this.signAuditEntry(auditEntry);

      await this.storeAuditEntry(this.auditLogs.ESCROW, auditEntry);
      await this.updateAuditMetrics('ESCROW', auditEntry);

      // Log for all participants
      for (const participant of escrowData.participants) {
        await this.storeUserAuditEntry(participant.userId, auditEntry);
      }

      return auditEntry.id;

    } catch (error) {
      logger.error('Failed to log escrow audit:', error);
      throw error;
    }
  }

  /**
   * Log security events
   */
  async logSecurityEvent(securityData) {
    try {
      const auditEntry = {
        id: this.generateAuditId('SEC'),
        type: 'SECURITY_EVENT',
        timestamp: Date.now(),
        eventType: securityData.eventType, // alert, violation, breach, mitigation
        severity: securityData.severity, // low, medium, high, critical
        userId: securityData.userId,
        description: securityData.description,
        source: securityData.source, // anti_manipulation, rate_limiter, auth_system
        metadata: {
          riskScore: securityData.riskScore,
          triggers: securityData.triggers,
          clientIP: securityData.clientIP,
          userAgent: securityData.userAgent,
          sessionId: securityData.sessionId,
          actionsTaken: securityData.actionsTaken,
          evidence: securityData.evidence,
          falsePositive: securityData.falsePositive || false
        },
        fingerprint: this.generateFingerprint(securityData),
        signature: null,
        previousHash: await this.getLastLogHash(this.auditLogs.SECURITY)
      };

      auditEntry.signature = this.signAuditEntry(auditEntry);

      await this.storeAuditEntry(this.auditLogs.SECURITY, auditEntry);
      
      if (securityData.userId) {
        await this.storeUserAuditEntry(securityData.userId, auditEntry);
      }
      
      await this.updateAuditMetrics('SECURITY', auditEntry);

      // Immediate notification for critical security events
      if (securityData.severity === 'critical') {
        await this.triggerSecurityAlert(auditEntry);
      }

      return auditEntry.id;

    } catch (error) {
      logger.error('Failed to log security audit:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive financial report
   */
  async generateFinancialReport(criteria) {
    try {
      const {
        startDate,
        endDate,
        userId,
        transactionTypes,
        includeDetails = false,
        format = 'json'
      } = criteria;

      const report = {
        metadata: {
          generated: Date.now(),
          period: { startDate, endDate },
          criteria,
          totalRecords: 0
        },
        summary: {
          totalVolume: 0,
          totalBets: 0,
          totalPayouts: 0,
          totalFees: 0,
          netRevenue: 0,
          uniqueUsers: new Set(),
          transactionsByType: {},
          averageTransactionSize: 0
        },
        transactions: [],
        anomalies: [],
        integrityStatus: 'verified'
      };

      // Fetch audit logs within date range
      const logs = await this.getAuditLogsByDateRange(
        this.auditLogs.TRANSACTION,
        startDate,
        endDate,
        userId
      );

      for (const log of logs) {
        report.metadata.totalRecords++;
        report.summary.totalVolume += log.amount || 0;
        report.summary.uniqueUsers.add(log.userId);

        // Categorize by transaction type
        const txType = log.transactionType;
        if (!report.summary.transactionsByType[txType]) {
          report.summary.transactionsByType[txType] = { count: 0, volume: 0 };
        }
        report.summary.transactionsByType[txType].count++;
        report.summary.transactionsByType[txType].volume += log.amount || 0;

        // Calculate specific totals
        if (txType === 'bet') {
          report.summary.totalBets += log.amount || 0;
        } else if (txType === 'payout') {
          report.summary.totalPayouts += log.amount || 0;
        } else if (txType === 'fee') {
          report.summary.totalFees += log.amount || 0;
        }

        if (includeDetails) {
          report.transactions.push(this.sanitizeAuditEntry(log));
        }
      }

      // Calculate derived metrics
      report.summary.netRevenue = report.summary.totalBets - report.summary.totalPayouts;
      report.summary.uniqueUsers = report.summary.uniqueUsers.size;
      report.summary.averageTransactionSize = 
        report.metadata.totalRecords > 0 
          ? report.summary.totalVolume / report.metadata.totalRecords 
          : 0;

      // Detect anomalies
      report.anomalies = await this.detectFinancialAnomalies(logs);

      // Verify report integrity
      report.integrityStatus = await this.verifyReportIntegrity(logs);

      // Format output
      if (format === 'csv') {
        return this.formatReportAsCSV(report);
      } else if (format === 'pdf') {
        return this.formatReportAsPDF(report);
      }

      return report;

    } catch (error) {
      logger.error('Failed to generate financial report:', error);
      throw error;
    }
  }

  /**
   * Generate audit integrity report
   */
  async generateIntegrityReport() {
    try {
      const report = {
        generated: Date.now(),
        overallStatus: 'healthy',
        checks: [],
        issues: [],
        recommendations: []
      };

      // Check hash chain integrity
      for (const logType of Object.values(this.auditLogs)) {
        const integrityCheck = await this.verifyLogIntegrity(logType);
        report.checks.push(integrityCheck);
        
        if (!integrityCheck.passed) {
          report.issues.push({
            severity: 'high',
            type: 'hash_chain_broken',
            logType,
            details: integrityCheck.details
          });
          report.overallStatus = 'compromised';
        }
      }

      // Check for missing sequences
      const sequenceCheck = await this.checkSequenceIntegrity();
      report.checks.push(sequenceCheck);

      // Check signature validity
      const signatureCheck = await this.checkSignatureValidity();
      report.checks.push(signatureCheck);

      // Generate recommendations
      if (report.issues.length > 0) {
        report.recommendations = await this.generateIntegrityRecommendations(report.issues);
      }

      return report;

    } catch (error) {
      logger.error('Failed to generate integrity report:', error);
      throw error;
    }
  }

  /**
   * Generate unique audit ID
   */
  generateAuditId(prefix) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Generate fingerprint for audit entry
   */
  generateFingerprint(data) {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Sign audit entry with cryptographic signature
   */
  signAuditEntry(entry) {
    // Remove signature field for signing
    const { signature, ...entryForSigning } = entry;
    const dataString = JSON.stringify(entryForSigning, Object.keys(entryForSigning).sort());
    
    // In production, this would use a proper signing key
    return crypto.createHash('sha256').update(dataString + process.env.AUDIT_SIGNING_KEY).digest('hex');
  }

  /**
   * Store audit entry in Redis with expiration
   */
  async storeAuditEntry(logType, entry) {
    try {
      const key = `${logType}:${entry.id}`;
      const ttl = this.retentionPeriods[logType] / 1000; // Convert to seconds

      await redis.setex(key, ttl, JSON.stringify(entry));
      
      // Add to ordered log for chronological access
      await redis.zadd(`${logType}_chronological`, entry.timestamp, entry.id);
      
      // Update log hash chain
      await this.updateLogHashChain(logType, entry);

    } catch (error) {
      logger.error('Failed to store audit entry:', error);
      throw error;
    }
  }

  /**
   * Store user-specific audit entry
   */
  async storeUserAuditEntry(userId, entry) {
    try {
      const key = `user_audit:${userId}`;
      const userEntry = {
        auditId: entry.id,
        type: entry.type,
        timestamp: entry.timestamp,
        amount: entry.amount
      };

      await redis.lpush(key, JSON.stringify(userEntry));
      
      // Set expiration on user audit log
      await redis.expire(key, this.retentionPeriods[this.auditLogs.TRANSACTION] / 1000);

    } catch (error) {
      logger.error('Failed to store user audit entry:', error);
    }
  }

  /**
   * Update audit metrics
   */
  async updateAuditMetrics(type, entry) {
    try {
      this.auditMetrics.totalLogs++;
      
      if (!this.auditMetrics.logsByType[type]) {
        this.auditMetrics.logsByType[type] = 0;
      }
      this.auditMetrics.logsByType[type]++;

      // Store metrics in Redis
      await redis.set('audit_metrics', JSON.stringify(this.auditMetrics));

    } catch (error) {
      logger.error('Failed to update audit metrics:', error);
    }
  }

  /**
   * Get last log hash for chain integrity
   */
  async getLastLogHash(logType) {
    try {
      const lastHash = await redis.get(`${logType}_last_hash`);
      return lastHash || 'genesis';
    } catch (error) {
      logger.error('Failed to get last log hash:', error);
      return 'genesis';
    }
  }

  /**
   * Update log hash chain
   */
  async updateLogHashChain(logType, entry) {
    try {
      const currentHash = crypto.createHash('sha256')
        .update(entry.signature + entry.previousHash)
        .digest('hex');

      await redis.set(`${logType}_last_hash`, currentHash);
    } catch (error) {
      logger.error('Failed to update log hash chain:', error);
    }
  }

  /**
   * Start integrity monitoring
   */
  startIntegrityMonitoring() {
    // Check integrity every hour
    setInterval(async () => {
      try {
        for (const logType of Object.values(this.auditLogs)) {
          await this.verifyLogIntegrity(logType);
        }
        this.auditMetrics.integrityChecks++;
        this.auditMetrics.lastIntegrityCheck = Date.now();
      } catch (error) {
        logger.error('Integrity check failed:', error);
        this.auditMetrics.tamperAttempts++;
      }
    }, 3600000); // 1 hour

    logger.info('Audit integrity monitoring started');
  }

  /**
   * Start periodic cleanup of old logs
   */
  startPeriodicCleanup() {
    // Clean up old logs daily
    setInterval(async () => {
      for (const [logType, retention] of Object.entries(this.retentionPeriods)) {
        await this.cleanupOldLogs(logType, retention);
      }
    }, 86400000); // 24 hours

    logger.info('Audit log cleanup scheduling started');
  }

  /**
   * Verify log integrity
   */
  async verifyLogIntegrity(logType) {
    try {
      const logIds = await redis.zrange(`${logType}_chronological`, 0, -1);
      let previousHash = 'genesis';
      let brokenChain = false;

      for (const logId of logIds) {
        const logData = await redis.get(`${logType}:${logId}`);
        if (!logData) continue;

        const entry = JSON.parse(logData);
        
        // Verify hash chain
        if (entry.previousHash !== previousHash) {
          brokenChain = true;
          break;
        }

        // Verify signature
        const expectedSignature = this.signAuditEntry(entry);
        if (entry.signature !== expectedSignature) {
          brokenChain = true;
          break;
        }

        previousHash = crypto.createHash('sha256')
          .update(entry.signature + entry.previousHash)
          .digest('hex');
      }

      return {
        logType,
        passed: !brokenChain,
        checkedEntries: logIds.length,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error(`Failed to verify ${logType} integrity:`, error);
      return {
        logType,
        passed: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Sanitize audit entry for reports (remove sensitive data)
   */
  sanitizeAuditEntry(entry) {
    const { signature, fingerprint, ...sanitized } = entry;
    return sanitized;
  }
}

module.exports = { AuditTrailManager: new AuditTrailManager() };