const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');
const { VRFService } = require('./vrfService');

/**
 * Betting Pool Manager for PvP Gambling System
 * Manages betting pools, odds calculation, and automated settlement
 */
class BettingPoolManager {
  constructor() {
    this.activePools = new Map();
    this.poolTypes = {
      MATCH_WINNER: 'match_winner',
      TOURNAMENT_WINNER: 'tournament_winner',
      BRACKET_OUTCOME: 'bracket_outcome',
      PERFORMANCE_BET: 'performance_bet',
      ROUND_ROBIN: 'round_robin'
    };
    
    // Pool configuration
    this.config = {
      minPoolSize: parseFloat(process.env.MIN_POOL_SIZE || '100'), // SOL
      maxPoolSize: parseFloat(process.env.MAX_POOL_SIZE || '10000'), // SOL
      defaultHouseEdge: parseFloat(process.env.HOUSE_EDGE || '0.05'), // 5%
      minOdds: 1.01,
      maxOdds: 50.0,
      settlementDelay: 300, // 5 minutes
      maxBetPerUser: parseFloat(process.env.MAX_BET_PER_USER || '1000') // SOL
    };
  }

  /**
   * Create a new betting pool for a match or tournament
   */
  async createBettingPool(poolData) {
    try {
      const poolId = this.generatePoolId(poolData.type, poolData.eventId);
      
      const pool = {
        id: poolId,
        type: poolData.type,
        eventId: poolData.eventId,
        eventName: poolData.eventName,
        description: poolData.description,
        outcomes: poolData.outcomes || [], // Array of possible outcomes
        bets: new Map(), // userId -> bet data
        totalPool: 0,
        outcomePools: {}, // outcome -> total bet amount
        odds: {}, // outcome -> current odds
        status: 'active',
        created: Date.now(),
        closesAt: poolData.closesAt || Date.now() + 3600000, // 1 hour default
        settledAt: null,
        winningOutcome: null,
        houseEdge: poolData.houseEdge || this.config.defaultHouseEdge,
        metadata: poolData.metadata || {}
      };

      // Initialize outcome pools
      pool.outcomes.forEach(outcome => {
        pool.outcomePools[outcome.id] = 0;
        pool.odds[outcome.id] = outcome.initialOdds || 2.0;
      });

      // Store in memory and Redis
      this.activePools.set(poolId, pool);
      await this.savePoolToRedis(pool);

      logger.info(`Created betting pool: ${poolId} for event: ${poolData.eventId}`);
      return pool;

    } catch (error) {
      logger.error('Failed to create betting pool:', error);
      throw new Error('Failed to create betting pool');
    }
  }

  /**
   * Place a bet in a betting pool
   */
  async placeBet(userId, poolId, outcomeId, amount, userWallet) {
    try {
      const pool = await this.getPool(poolId);
      if (!pool) {
        throw new Error('Betting pool not found');
      }

      // Validation checks
      this.validateBet(pool, userId, outcomeId, amount);

      // Check if outcome exists
      const outcome = pool.outcomes.find(o => o.id === outcomeId);
      if (!outcome) {
        throw new Error('Invalid outcome selection');
      }

      const betId = `${poolId}_${userId}_${Date.now()}`;
      const currentOdds = pool.odds[outcomeId];

      const bet = {
        id: betId,
        userId,
        userWallet,
        poolId,
        outcomeId,
        outcomeName: outcome.name,
        amount,
        odds: currentOdds,
        potentialPayout: amount * currentOdds,
        timestamp: Date.now(),
        status: 'active'
      };

      // Add bet to pool
      if (!pool.bets.has(userId)) {
        pool.bets.set(userId, []);
      }
      pool.bets.get(userId).push(bet);

      // Update pool totals
      pool.totalPool += amount;
      pool.outcomePools[outcomeId] += amount;

      // Recalculate odds for all outcomes
      await this.recalculateOdds(pool);

      // Save updated pool
      await this.savePoolToRedis(pool);

      // Log the bet
      await this.logBet(bet);

      logger.info(
        `Bet placed: ${amount} SOL on ${outcome.name} ` +
        `at odds ${currentOdds} (potential payout: ${bet.potentialPayout})`
      );

      return bet;

    } catch (error) {
      logger.error('Failed to place bet:', error);
      throw error;
    }
  }

  /**
   * Calculate dynamic odds based on pool distribution
   */
  async recalculateOdds(pool) {
    try {
      if (pool.totalPool === 0) {
        return pool.odds; // Keep initial odds if no bets
      }

      const newOdds = {};
      const houseEdge = pool.houseEdge;

      pool.outcomes.forEach(outcome => {
        const outcomePool = pool.outcomePools[outcome.id] || 0;
        const otherOutcomes = pool.totalPool - outcomePool;

        if (outcomePool === 0) {
          // No bets on this outcome - high odds
          newOdds[outcome.id] = this.config.maxOdds;
        } else {
          // Calculate implied probability and adjust for house edge
          const impliedProbability = outcomePool / pool.totalPool;
          const adjustedProbability = impliedProbability * (1 + houseEdge);
          
          // Convert to odds
          const calculatedOdds = 1 / adjustedProbability;
          
          // Apply min/max constraints
          newOdds[outcome.id] = Math.max(
            this.config.minOdds,
            Math.min(this.config.maxOdds, calculatedOdds)
          );
        }
      });

      pool.odds = newOdds;
      
      logger.debug(`Recalculated odds for pool ${pool.id}:`, newOdds);
      return newOdds;

    } catch (error) {
      logger.error('Failed to recalculate odds:', error);
      return pool.odds;
    }
  }

  /**
   * Close betting pool (no more bets accepted)
   */
  async closeBettingPool(poolId) {
    try {
      const pool = await this.getPool(poolId);
      if (!pool) {
        throw new Error('Pool not found');
      }

      pool.status = 'closed';
      pool.closedAt = Date.now();
      
      await this.savePoolToRedis(pool);

      logger.info(`Closed betting pool: ${poolId}`);
      return pool;

    } catch (error) {
      logger.error('Failed to close betting pool:', error);
      throw error;
    }
  }

  /**
   * Settle betting pool with winning outcome
   */
  async settleBettingPool(poolId, winningOutcomeId) {
    try {
      const pool = await this.getPool(poolId);
      if (!pool || pool.status === 'settled') {
        throw new Error('Pool not found or already settled');
      }

      // Verify winning outcome exists
      const winningOutcome = pool.outcomes.find(o => o.id === winningOutcomeId);
      if (!winningOutcome) {
        throw new Error('Invalid winning outcome');
      }

      pool.status = 'settled';
      pool.settledAt = Date.now();
      pool.winningOutcome = winningOutcomeId;

      // Calculate payouts
      const payouts = await this.calculatePayouts(pool, winningOutcomeId);
      
      // Process payouts
      const settlementResults = await this.processPayouts(pool, payouts);

      // Save final state
      await this.savePoolToRedis(pool);

      // Create settlement record
      await this.createSettlementRecord(pool, payouts, settlementResults);

      logger.info(
        `Settled betting pool ${poolId}. Winner: ${winningOutcome.name}. ` +
        `Payouts: ${payouts.length} winners, total: ${settlementResults.totalPaid} SOL`
      );

      return {
        pool,
        payouts,
        settlementResults
      };

    } catch (error) {
      logger.error('Failed to settle betting pool:', error);
      throw error;
    }
  }

  /**
   * Calculate payouts for winning bets
   */
  async calculatePayouts(pool, winningOutcomeId) {
    try {
      const payouts = [];
      const winningPool = pool.outcomePools[winningOutcomeId] || 0;
      const totalPool = pool.totalPool;
      const houseEdge = pool.houseEdge;

      if (winningPool === 0) {
        logger.warn(`No bets on winning outcome ${winningOutcomeId} in pool ${pool.id}`);
        return payouts;
      }

      // Calculate house take
      const houseTake = totalPool * houseEdge;
      const payoutPool = totalPool - houseTake;

      // Process winning bets
      for (const userBets of pool.bets.values()) {
        for (const bet of userBets) {
          if (bet.outcomeId === winningOutcomeId && bet.status === 'active') {
            // Calculate proportional payout
            const userShare = bet.amount / winningPool;
            const payout = userShare * payoutPool;

            payouts.push({
              betId: bet.id,
              userId: bet.userId,
              userWallet: bet.userWallet,
              betAmount: bet.amount,
              payout: payout,
              profit: payout - bet.amount,
              odds: bet.odds
            });

            bet.status = 'won';
            bet.payout = payout;
          } else if (bet.status === 'active') {
            bet.status = 'lost';
            bet.payout = 0;
          }
        }
      }

      return payouts;

    } catch (error) {
      logger.error('Failed to calculate payouts:', error);
      throw error;
    }
  }

  /**
   * Process payouts to winners
   */
  async processPayouts(pool, payouts) {
    try {
      let totalPaid = 0;
      let successfulPayouts = 0;
      let failedPayouts = 0;
      const results = [];

      for (const payout of payouts) {
        try {
          // In production, this would transfer SOL to winner's wallet
          // For now, we'll create a payout record
          const payoutResult = {
            betId: payout.betId,
            userId: payout.userId,
            userWallet: payout.userWallet,
            amount: payout.payout,
            status: 'completed',
            transactionId: `mock_tx_${Date.now()}_${payout.betId}`,
            processedAt: Date.now()
          };

          totalPaid += payout.payout;
          successfulPayouts++;
          results.push(payoutResult);

          // Log payout
          await this.logPayout(payoutResult);

        } catch (error) {
          logger.error(`Failed to process payout for bet ${payout.betId}:`, error);
          failedPayouts++;
          
          results.push({
            betId: payout.betId,
            userId: payout.userId,
            status: 'failed',
            error: error.message,
            processedAt: Date.now()
          });
        }
      }

      return {
        totalPaid,
        successfulPayouts,
        failedPayouts,
        results
      };

    } catch (error) {
      logger.error('Failed to process payouts:', error);
      throw error;
    }
  }

  /**
   * Get betting pool by ID
   */
  async getPool(poolId) {
    // Check memory cache first
    if (this.activePools.has(poolId)) {
      return this.activePools.get(poolId);
    }

    // Load from Redis
    try {
      const poolData = await redis.get(`pool:${poolId}`);
      if (poolData) {
        const pool = JSON.parse(poolData);
        // Convert bets Map from object
        pool.bets = new Map(Object.entries(pool.bets || {}));
        this.activePools.set(poolId, pool);
        return pool;
      }
    } catch (error) {
      logger.error(`Failed to load pool ${poolId}:`, error);
    }

    return null;
  }

  /**
   * Validate bet parameters
   */
  validateBet(pool, userId, outcomeId, amount) {
    if (pool.status !== 'active') {
      throw new Error('Betting pool is not active');
    }

    if (Date.now() > pool.closesAt) {
      throw new Error('Betting has closed for this pool');
    }

    if (amount <= 0 || amount > this.config.maxBetPerUser) {
      throw new Error(`Invalid bet amount. Must be between 0 and ${this.config.maxBetPerUser} SOL`);
    }

    if (pool.totalPool + amount > this.config.maxPoolSize) {
      throw new Error('Pool size limit exceeded');
    }

    // Check user's existing bets on this outcome
    const userBets = pool.bets.get(userId) || [];
    const existingOnOutcome = userBets
      .filter(bet => bet.outcomeId === outcomeId && bet.status === 'active')
      .reduce((sum, bet) => sum + bet.amount, 0);

    if (existingOnOutcome + amount > this.config.maxBetPerUser) {
      throw new Error('Maximum bet per outcome exceeded');
    }
  }

  /**
   * Generate unique pool ID
   */
  generatePoolId(type, eventId) {
    return `${type}_${eventId}_${Date.now()}`;
  }

  /**
   * Save pool to Redis
   */
  async savePoolToRedis(pool) {
    try {
      // Convert Map to object for JSON storage
      const poolData = {
        ...pool,
        bets: Object.fromEntries(pool.bets)
      };

      await redis.setex(
        `pool:${pool.id}`,
        86400, // 24 hours
        JSON.stringify(poolData)
      );

      // Add to active pools index
      await redis.sadd('active_pools', pool.id);

    } catch (error) {
      logger.error('Failed to save pool to Redis:', error);
    }
  }

  /**
   * Log bet for audit trail
   */
  async logBet(bet) {
    try {
      await redis.lpush('bet_log', JSON.stringify({
        type: 'bet_placed',
        timestamp: Date.now(),
        bet
      }));
    } catch (error) {
      logger.error('Failed to log bet:', error);
    }
  }

  /**
   * Log payout for audit trail
   */
  async logPayout(payout) {
    try {
      await redis.lpush('payout_log', JSON.stringify({
        type: 'payout_processed',
        timestamp: Date.now(),
        payout
      }));
    } catch (error) {
      logger.error('Failed to log payout:', error);
    }
  }

  /**
   * Create settlement record
   */
  async createSettlementRecord(pool, payouts, results) {
    try {
      const record = {
        poolId: pool.id,
        eventId: pool.eventId,
        winningOutcome: pool.winningOutcome,
        totalPool: pool.totalPool,
        houseTake: pool.totalPool * pool.houseEdge,
        totalPayouts: results.totalPaid,
        winnerCount: payouts.length,
        settlementDate: Date.now()
      };

      await redis.setex(
        `settlement:${pool.id}`,
        2592000, // 30 days
        JSON.stringify(record)
      );

    } catch (error) {
      logger.error('Failed to create settlement record:', error);
    }
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(poolId) {
    try {
      const pool = await this.getPool(poolId);
      if (!pool) {
        return null;
      }

      const stats = {
        poolId: pool.id,
        type: pool.type,
        status: pool.status,
        totalPool: pool.totalPool,
        betCount: Array.from(pool.bets.values()).flat().length,
        outcomeDistribution: pool.outcomePools,
        currentOdds: pool.odds,
        created: pool.created,
        closesAt: pool.closesAt
      };

      return stats;

    } catch (error) {
      logger.error('Failed to get pool stats:', error);
      return null;
    }
  }

  /**
   * Get all active pools
   */
  async getActivePools() {
    try {
      const poolIds = await redis.smembers('active_pools');
      const pools = [];

      for (const poolId of poolIds) {
        const pool = await this.getPool(poolId);
        if (pool && pool.status === 'active') {
          pools.push(await this.getPoolStats(poolId));
        }
      }

      return pools;

    } catch (error) {
      logger.error('Failed to get active pools:', error);
      return [];
    }
  }
}

module.exports = { BettingPoolManager: new BettingPoolManager() };