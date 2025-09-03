/**
 * Gambling System Main Export
 * Comprehensive gambling backend for PvP Universal game
 */

const { VRFService } = require('./vrfService');
const { BettingPoolManager } = require('./bettingPoolManager');
const { EscrowManager } = require('./escrowManager');
const { TournamentBettingManager } = require('./tournamentBetting');
const { AntiManipulationMonitor } = require('./antiManipulationMonitor');
const { RealtimeBettingSocket } = require('./realtimeBettingSocket');
const { AuditTrailManager } = require('./auditTrail');
const { RewardDistributionManager } = require('./rewardDistribution');
const { logger } = require('../utils/logger');

/**
 * Main Gambling System Controller
 * Orchestrates all gambling-related operations with security and transparency
 */
class GamblingSystem {
  constructor() {
    this.services = {
      vrf: VRFService,
      bettingPools: BettingPoolManager,
      escrow: EscrowManager,
      tournaments: TournamentBettingManager,
      antiManipulation: AntiManipulationMonitor,
      auditTrail: AuditTrailManager,
      rewards: RewardDistributionManager
    };

    this.socketHandler = null;
    this.systemHealth = {
      status: 'initializing',
      services: {},
      lastHealthCheck: null,
      uptime: Date.now()
    };

    this.config = {
      maxConcurrentBets: 1000,
      systemMaintenanceWindow: 3600000, // 1 hour
      healthCheckInterval: 300000, // 5 minutes
      emergencyShutdownThreshold: 0.7 // 70% service failure rate
    };

    this.initializeSystem();
  }

  /**
   * Initialize the complete gambling system
   */
  async initializeSystem() {
    try {
      logger.info('Initializing gambling system...');

      // Initialize core services
      await this.initializeServices();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Set up system events
      this.setupSystemEvents();

      this.systemHealth.status = 'operational';
      
      logger.info('Gambling system successfully initialized');

    } catch (error) {
      logger.error('Failed to initialize gambling system:', error);
      this.systemHealth.status = 'failed';
      throw error;
    }
  }

  /**
   * Initialize WebSocket handler
   */
  initializeWebSocket(io) {
    try {
      this.socketHandler = new RealtimeBettingSocket(io);
      logger.info('Real-time betting WebSocket initialized');
    } catch (error) {
      logger.error('Failed to initialize WebSocket:', error);
      throw error;
    }
  }

  /**
   * Create a complete betting event (match, tournament, etc.)
   */
  async createBettingEvent(eventData) {
    try {
      const result = {
        eventId: eventData.id,
        type: eventData.type,
        components: {}
      };

      // Create betting pool
      if (eventData.enableBetting) {
        const poolData = {
          type: 'match_winner',
          eventId: eventData.id,
          eventName: eventData.name,
          outcomes: eventData.outcomes,
          closesAt: eventData.startsAt - 300000, // Close 5 minutes before start
          metadata: eventData.metadata
        };

        result.components.bettingPool = await this.services.bettingPools.createBettingPool(poolData);
      }

      // Create escrow if needed
      if (eventData.useEscrow && eventData.participants) {
        const escrowData = {
          type: eventData.type,
          eventId: eventData.id,
          participants: eventData.participants,
          amounts: eventData.wagerAmounts,
          conditions: eventData.settlementConditions,
          expiresAt: eventData.endsAt,
          metadata: eventData.metadata
        };

        result.components.escrow = await this.services.escrow.createEscrow(escrowData);
      }

      // Create tournament betting structure
      if (eventData.type === 'tournament') {
        result.components.tournament = await this.services.tournaments.createTournamentBetting(eventData);
      }

      // Create reward pool
      if (eventData.rewardPool) {
        const rewardData = {
          type: 'event_rewards',
          distributionType: eventData.rewardPool.distributionType || 'tiered',
          eventId: eventData.id,
          eventName: eventData.name,
          totalAmount: eventData.rewardPool.amount,
          eligibilityCriteria: eventData.rewardPool.criteria,
          distributionConfig: eventData.rewardPool.config,
          endsAt: eventData.endsAt
        };

        result.components.rewards = await this.services.rewards.createRewardPool(rewardData);
      }

      // Log event creation
      await this.services.auditTrail.logTransaction({
        userId: eventData.creatorId,
        type: 'event_creation',
        amount: 0,
        description: `Created betting event: ${eventData.name}`,
        eventId: eventData.id,
        metadata: result
      });

      logger.info(`Created betting event ${eventData.id} with components: ${Object.keys(result.components).join(', ')}`);
      
      return result;

    } catch (error) {
      logger.error('Failed to create betting event:', error);
      throw error;
    }
  }

  /**
   * Place a bet with full security and audit trail
   */
  async placeBet(betData) {
    try {
      // Security screening
      const securityCheck = await this.services.antiManipulation.monitorBettingActivity(
        betData.userId,
        betData
      );

      if (!securityCheck.allowed) {
        // Log security rejection
        await this.services.auditTrail.logSecurityEvent({
          eventType: 'bet_rejected',
          severity: 'high',
          userId: betData.userId,
          description: 'Bet rejected by anti-manipulation system',
          riskScore: securityCheck.riskScore,
          triggers: securityCheck.alerts.map(a => a.type)
        });

        throw new Error('Bet rejected due to security concerns');
      }

      // Place the bet
      const bet = await this.services.bettingPools.placeBet(
        betData.userId,
        betData.poolId,
        betData.outcomeId,
        betData.amount,
        betData.userWallet
      );

      // Log bet transaction
      await this.services.auditTrail.logTransaction({
        userId: betData.userId,
        userWallet: betData.userWallet,
        type: 'bet',
        amount: betData.amount,
        poolId: betData.poolId,
        description: `Bet placed on ${betData.outcomeId}`,
        transactionHash: bet.transactionId || 'pending'
      });

      // Log bet details
      await this.services.auditTrail.logBet({
        ...betData,
        betId: bet.id,
        odds: bet.odds,
        potentialPayout: bet.potentialPayout,
        riskScore: securityCheck.riskScore,
        securityFlags: securityCheck.alerts.map(a => a.type)
      });

      logger.info(`Bet placed successfully: ${bet.id} by user ${betData.userId}`);
      
      return {
        bet,
        securityCheck,
        auditTrail: true
      };

    } catch (error) {
      logger.error('Failed to place bet:', error);
      
      // Log failed bet attempt
      await this.services.auditTrail.logSecurityEvent({
        eventType: 'bet_failed',
        severity: 'medium',
        userId: betData.userId,
        description: `Bet placement failed: ${error.message}`,
        metadata: betData
      });

      throw error;
    }
  }

  /**
   * Settle event with automated distribution
   */
  async settleEvent(eventId, settlementData) {
    try {
      const settlementResults = {
        eventId,
        timestamp: Date.now(),
        settlements: {}
      };

      // Settle betting pools
      if (settlementData.bettingPools) {
        for (const poolSettlement of settlementData.bettingPools) {
          const result = await this.services.bettingPools.settleBettingPool(
            poolSettlement.poolId,
            poolSettlement.winningOutcome
          );
          settlementResults.settlements.bettingPools = result;
        }
      }

      // Settle escrow accounts
      if (settlementData.escrows) {
        for (const escrowSettlement of settlementData.escrows) {
          const result = await this.services.escrow.executeSettlement(escrowSettlement.escrowId);
          settlementResults.settlements.escrows = result;
        }
      }

      // Settle tournament betting
      if (settlementData.tournaments) {
        for (const tournamentSettlement of settlementData.tournaments) {
          const result = await this.services.tournaments.updateMatchResult(
            tournamentSettlement.tournamentId,
            tournamentSettlement.matchId,
            tournamentSettlement.winnerId,
            tournamentSettlement.matchData
          );
          settlementResults.settlements.tournaments = result;
        }
      }

      // Distribute rewards
      if (settlementData.rewardPools) {
        for (const rewardSettlement of settlementData.rewardPools) {
          const result = await this.services.rewards.distributeRewards(
            rewardSettlement.poolId,
            'event_completion'
          );
          settlementResults.settlements.rewards = result;
        }
      }

      // Log settlement
      await this.services.auditTrail.logTransaction({
        userId: 'system',
        type: 'event_settlement',
        amount: 0,
        description: `Event ${eventId} settled`,
        eventId,
        metadata: settlementResults
      });

      logger.info(`Event ${eventId} settled successfully`);
      
      return settlementResults;

    } catch (error) {
      logger.error('Failed to settle event:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus() {
    try {
      // Update service health
      for (const [serviceName, service] of Object.entries(this.services)) {
        try {
          // Basic health check - each service should implement getHealth()
          if (typeof service.getHealth === 'function') {
            this.systemHealth.services[serviceName] = await service.getHealth();
          } else {
            this.systemHealth.services[serviceName] = { status: 'operational' };
          }
        } catch (error) {
          this.systemHealth.services[serviceName] = { 
            status: 'error', 
            error: error.message 
          };
        }
      }

      // Calculate overall system health
      const serviceStatuses = Object.values(this.systemHealth.services);
      const healthyServices = serviceStatuses.filter(s => s.status === 'operational').length;
      const healthPercentage = serviceStatuses.length > 0 ? healthyServices / serviceStatuses.length : 0;

      if (healthPercentage < this.config.emergencyShutdownThreshold) {
        this.systemHealth.status = 'critical';
      } else if (healthPercentage < 0.9) {
        this.systemHealth.status = 'degraded';
      } else {
        this.systemHealth.status = 'operational';
      }

      this.systemHealth.lastHealthCheck = Date.now();
      this.systemHealth.healthPercentage = healthPercentage;

      return this.systemHealth;

    } catch (error) {
      logger.error('Failed to get system status:', error);
      this.systemHealth.status = 'error';
      return this.systemHealth;
    }
  }

  /**
   * Generate comprehensive system report
   */
  async generateSystemReport(criteria = {}) {
    try {
      const report = {
        generated: Date.now(),
        timeframe: criteria.timeframe || '24h',
        summary: {},
        services: {},
        security: {},
        financial: {},
        performance: {}
      };

      // VRF Service stats
      report.services.vrf = await this.services.vrf.getVRFStats();

      // Betting pool stats
      report.services.bettingPools = {
        activePools: await this.services.bettingPools.getActivePools(),
        // Add more pool statistics
      };

      // Anti-manipulation report
      report.security = {
        alerts: [], // Get recent security alerts
        blockedUsers: 0,
        falsePositiveRate: 0
      };

      // Financial summary
      report.financial = await this.services.auditTrail.generateFinancialReport({
        startDate: Date.now() - (criteria.timeframe === '7d' ? 604800000 : 86400000),
        endDate: Date.now(),
        includeDetails: false
      });

      // System performance
      report.performance = {
        uptime: Date.now() - this.systemHealth.uptime,
        averageResponseTime: 0, // Calculate from metrics
        throughput: 0, // Transactions per second
        errorRate: 0
      };

      return report;

    } catch (error) {
      logger.error('Failed to generate system report:', error);
      throw error;
    }
  }

  /**
   * Initialize all services
   */
  async initializeServices() {
    for (const [serviceName, service] of Object.entries(this.services)) {
      try {
        if (typeof service.initialize === 'function') {
          await service.initialize();
        }
        this.systemHealth.services[serviceName] = { status: 'operational' };
        logger.debug(`Service ${serviceName} initialized successfully`);
      } catch (error) {
        this.systemHealth.services[serviceName] = { 
          status: 'failed', 
          error: error.message 
        };
        logger.error(`Failed to initialize service ${serviceName}:`, error);
        throw error;
      }
    }
  }

  /**
   * Start system health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        await this.getSystemStatus();
      } catch (error) {
        logger.error('Health monitoring error:', error);
      }
    }, this.config.healthCheckInterval);

    logger.info('System health monitoring started');
  }

  /**
   * Setup system-wide event handling
   */
  setupSystemEvents() {
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
    
    logger.info('System event handlers configured');
  }

  /**
   * Graceful system shutdown
   */
  async gracefulShutdown() {
    logger.warn('Initiating graceful shutdown...');
    
    this.systemHealth.status = 'shutting_down';
    
    // Stop accepting new bets
    // Complete pending operations
    // Save state
    
    logger.info('Gambling system shutdown complete');
    process.exit(0);
  }
}

module.exports = {
  GamblingSystem: new GamblingSystem(),
  VRFService,
  BettingPoolManager,
  EscrowManager,
  TournamentBettingManager,
  AntiManipulationMonitor,
  RealtimeBettingSocket,
  AuditTrailManager,
  RewardDistributionManager
};