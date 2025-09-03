const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');
const { VRFService } = require('./vrfService');

/**
 * Reward Distribution System
 * Manages configurable reward pools and automated distribution mechanisms
 */
class RewardDistributionManager {
  constructor() {
    this.rewardPools = new Map();
    this.distributionSchedules = new Map();
    this.bonusMultipliers = new Map();
    
    this.config = {
      maxPoolSize: 100000, // SOL
      minPoolSize: 10, // SOL
      maxParticipants: 1000,
      distributionDelay: 300000, // 5 minutes
      bonusThreshold: 0.8, // 80% win rate for bonus
      streakBonusMultiplier: 1.2,
      referralBonusRate: 0.1, // 10%
      loyaltyTierMultipliers: {
        bronze: 1.0,
        silver: 1.1,
        gold: 1.25,
        platinum: 1.5,
        diamond: 2.0
      }
    };

    this.distributionTypes = {
      WINNER_TAKES_ALL: 'winner_takes_all',
      PROPORTIONAL: 'proportional',
      TIERED: 'tiered',
      PARTICIPATION: 'participation',
      PERFORMANCE: 'performance',
      LOTTERY: 'lottery',
      STREAK_BONUS: 'streak_bonus',
      REFERRAL_BONUS: 'referral_bonus'
    };

    this.initializeRewardSystem();
  }

  /**
   * Initialize reward distribution system
   */
  initializeRewardSystem() {
    // Load existing reward pools
    this.loadRewardPools();
    
    // Start distribution scheduler
    this.startDistributionScheduler();
    
    // Initialize bonus tracking
    this.initializeBonusTracking();

    logger.info('Reward distribution system initialized');
  }

  /**
   * Create a new reward pool
   */
  async createRewardPool(poolData) {
    try {
      const poolId = this.generatePoolId(poolData.type, poolData.eventId);
      
      const pool = {
        id: poolId,
        type: poolData.type,
        distributionType: poolData.distributionType,
        eventId: poolData.eventId,
        eventName: poolData.eventName,
        totalAmount: poolData.totalAmount,
        remainingAmount: poolData.totalAmount,
        currency: poolData.currency || 'SOL',
        participants: new Map(), // participantId -> participation data
        eligibilityCriteria: poolData.eligibilityCriteria || {},
        distributionConfig: poolData.distributionConfig || {},
        bonusConfigs: poolData.bonusConfigs || [],
        created: Date.now(),
        startsAt: poolData.startsAt || Date.now(),
        endsAt: poolData.endsAt,
        distributionSchedule: poolData.distributionSchedule || 'immediate',
        status: 'active', // active, distributing, completed, cancelled
        distributions: [],
        metadata: poolData.metadata || {}
      };

      // Validate pool configuration
      this.validatePoolConfiguration(pool);

      // Store pool
      this.rewardPools.set(poolId, pool);
      await this.savePoolToRedis(pool);

      // Set up distribution schedule if needed
      if (pool.distributionSchedule !== 'immediate') {
        await this.scheduleDistribution(pool);
      }

      logger.info(
        `Created reward pool ${poolId} with ${pool.totalAmount} ${pool.currency} ` +
        `for ${pool.distributionType} distribution`
      );

      return pool;

    } catch (error) {
      logger.error('Failed to create reward pool:', error);
      throw error;
    }
  }

  /**
   * Add participant to reward pool
   */
  async addParticipant(poolId, participantData) {
    try {
      const pool = await this.getPool(poolId);
      if (!pool) {
        throw new Error('Reward pool not found');
      }

      if (pool.status !== 'active') {
        throw new Error('Pool is not accepting participants');
      }

      // Check eligibility
      const isEligible = await this.checkParticipantEligibility(pool, participantData);
      if (!isEligible.eligible) {
        throw new Error(`Participant not eligible: ${isEligible.reason}`);
      }

      const participant = {
        id: participantData.id,
        userId: participantData.userId,
        walletAddress: participantData.walletAddress,
        joinedAt: Date.now(),
        performance: participantData.performance || {},
        contributions: participantData.contributions || 0,
        bonusEligibility: await this.calculateBonusEligibility(participantData),
        loyaltyTier: participantData.loyaltyTier || 'bronze',
        streakData: participantData.streakData || { current: 0, best: 0 },
        referralData: participantData.referralData || { referrer: null, referred: [] },
        metadata: participantData.metadata || {}
      };

      pool.participants.set(participant.id, participant);
      await this.savePoolToRedis(pool);

      logger.debug(`Added participant ${participant.id} to pool ${poolId}`);
      return participant;

    } catch (error) {
      logger.error('Failed to add participant to pool:', error);
      throw error;
    }
  }

  /**
   * Distribute rewards based on pool configuration
   */
  async distributeRewards(poolId, distributionTrigger = 'manual') {
    try {
      const pool = await this.getPool(poolId);
      if (!pool) {
        throw new Error('Reward pool not found');
      }

      if (pool.status !== 'active') {
        throw new Error('Pool is not ready for distribution');
      }

      pool.status = 'distributing';
      
      const distribution = {
        id: `dist_${poolId}_${Date.now()}`,
        poolId,
        trigger: distributionTrigger,
        timestamp: Date.now(),
        participants: Array.from(pool.participants.values()),
        allocations: [],
        bonuses: [],
        totalDistributed: 0,
        status: 'processing'
      };

      // Calculate base allocations
      switch (pool.distributionType) {
        case this.distributionTypes.WINNER_TAKES_ALL:
          distribution.allocations = await this.calculateWinnerTakesAll(pool);
          break;
        case this.distributionTypes.PROPORTIONAL:
          distribution.allocations = await this.calculateProportional(pool);
          break;
        case this.distributionTypes.TIERED:
          distribution.allocations = await this.calculateTiered(pool);
          break;
        case this.distributionTypes.PARTICIPATION:
          distribution.allocations = await this.calculateParticipation(pool);
          break;
        case this.distributionTypes.PERFORMANCE:
          distribution.allocations = await this.calculatePerformance(pool);
          break;
        case this.distributionTypes.LOTTERY:
          distribution.allocations = await this.calculateLottery(pool);
          break;
        default:
          throw new Error(`Unknown distribution type: ${pool.distributionType}`);
      }

      // Apply bonuses
      distribution.bonuses = await this.calculateBonuses(pool, distribution.allocations);

      // Process final allocations with bonuses
      const finalAllocations = this.applyBonuses(distribution.allocations, distribution.bonuses);

      // Execute distributions
      const distributionResults = await this.executeDistributions(pool, finalAllocations);

      // Update distribution record
      distribution.totalDistributed = distributionResults.totalDistributed;
      distribution.successfulDistributions = distributionResults.successful;
      distribution.failedDistributions = distributionResults.failed;
      distribution.status = 'completed';
      distribution.completedAt = Date.now();

      // Update pool
      pool.distributions.push(distribution);
      pool.remainingAmount -= distribution.totalDistributed;
      pool.status = pool.remainingAmount > 0 ? 'active' : 'completed';

      await this.savePoolToRedis(pool);

      // Log distribution event
      await this.logDistributionEvent(distribution);

      logger.info(
        `Distributed ${distribution.totalDistributed} ${pool.currency} ` +
        `to ${distributionResults.successful} participants from pool ${poolId}`
      );

      return {
        distribution,
        results: distributionResults
      };

    } catch (error) {
      logger.error('Failed to distribute rewards:', error);
      throw error;
    }
  }

  /**
   * Calculate winner takes all distribution
   */
  async calculateWinnerTakesAll(pool) {
    const participants = Array.from(pool.participants.values());
    
    if (participants.length === 0) {
      return [];
    }

    // Find winner based on performance or random selection
    let winner;
    if (pool.distributionConfig.winnerCriteria === 'performance') {
      winner = participants.reduce((best, participant) => 
        (participant.performance.score || 0) > (best.performance.score || 0) ? participant : best
      );
    } else if (pool.distributionConfig.winnerCriteria === 'random') {
      const vrfResult = await VRFService.selectRandomWinner(
        participants,
        `pool_${pool.id}_winner`
      );
      winner = vrfResult.winner;
    } else {
      // Default to highest contribution
      winner = participants.reduce((best, participant) => 
        participant.contributions > best.contributions ? participant : best
      );
    }

    return [{
      participantId: winner.id,
      userId: winner.userId,
      walletAddress: winner.walletAddress,
      amount: pool.remainingAmount,
      reason: 'winner_takes_all',
      criteria: pool.distributionConfig.winnerCriteria || 'contribution'
    }];
  }

  /**
   * Calculate proportional distribution
   */
  async calculateProportional(pool) {
    const participants = Array.from(pool.participants.values());
    const allocations = [];

    if (participants.length === 0) {
      return allocations;
    }

    // Calculate total contributions/performance
    const totalContributions = participants.reduce((sum, p) => 
      sum + (p.contributions || p.performance.score || 1), 0
    );

    if (totalContributions === 0) {
      return allocations;
    }

    // Distribute proportionally
    for (const participant of participants) {
      const contribution = participant.contributions || participant.performance.score || 1;
      const proportion = contribution / totalContributions;
      const amount = pool.remainingAmount * proportion;

      if (amount > 0) {
        allocations.push({
          participantId: participant.id,
          userId: participant.userId,
          walletAddress: participant.walletAddress,
          amount,
          reason: 'proportional',
          proportion,
          contribution
        });
      }
    }

    return allocations;
  }

  /**
   * Calculate tiered distribution
   */
  async calculateTiered(pool) {
    const participants = Array.from(pool.participants.values());
    const allocations = [];

    if (participants.length === 0) {
      return allocations;
    }

    // Sort participants by performance/contribution
    const sortedParticipants = participants.sort((a, b) => {
      const aScore = a.performance.score || a.contributions || 0;
      const bScore = b.performance.score || b.contributions || 0;
      return bScore - aScore;
    });

    // Apply tier distribution
    const tiers = pool.distributionConfig.tiers || [
      { rank: 1, percentage: 0.5 }, // 1st place gets 50%
      { rank: 2, percentage: 0.3 }, // 2nd place gets 30%
      { rank: 3, percentage: 0.2 }  // 3rd place gets 20%
    ];

    let remainingAmount = pool.remainingAmount;
    let participantIndex = 0;

    for (const tier of tiers) {
      if (participantIndex >= sortedParticipants.length) {
        break;
      }

      const participant = sortedParticipants[participantIndex];
      const amount = pool.remainingAmount * tier.percentage;

      allocations.push({
        participantId: participant.id,
        userId: participant.userId,
        walletAddress: participant.walletAddress,
        amount,
        reason: 'tiered',
        tier: tier.rank,
        percentage: tier.percentage
      });

      remainingAmount -= amount;
      participantIndex++;
    }

    // Distribute any remaining amount equally among remaining participants
    if (remainingAmount > 0 && participantIndex < sortedParticipants.length) {
      const remainingParticipants = sortedParticipants.slice(participantIndex);
      const equalShare = remainingAmount / remainingParticipants.length;

      for (const participant of remainingParticipants) {
        allocations.push({
          participantId: participant.id,
          userId: participant.userId,
          walletAddress: participant.walletAddress,
          amount: equalShare,
          reason: 'participation',
          tier: 'participation'
        });
      }
    }

    return allocations;
  }

  /**
   * Calculate participation rewards (equal distribution)
   */
  async calculateParticipation(pool) {
    const participants = Array.from(pool.participants.values());
    const allocations = [];

    if (participants.length === 0) {
      return allocations;
    }

    const equalShare = pool.remainingAmount / participants.length;

    for (const participant of participants) {
      allocations.push({
        participantId: participant.id,
        userId: participant.userId,
        walletAddress: participant.walletAddress,
        amount: equalShare,
        reason: 'participation',
        equalShare: true
      });
    }

    return allocations;
  }

  /**
   * Calculate performance-based distribution
   */
  async calculatePerformance(pool) {
    const participants = Array.from(pool.participants.values());
    const allocations = [];

    if (participants.length === 0) {
      return allocations;
    }

    // Calculate performance scores
    const performanceScores = participants.map(p => {
      const score = this.calculatePerformanceScore(p, pool.distributionConfig);
      return { participant: p, score };
    }).filter(ps => ps.score > 0);

    if (performanceScores.length === 0) {
      return allocations;
    }

    const totalPerformance = performanceScores.reduce((sum, ps) => sum + ps.score, 0);

    for (const { participant, score } of performanceScores) {
      const proportion = score / totalPerformance;
      const amount = pool.remainingAmount * proportion;

      allocations.push({
        participantId: participant.id,
        userId: participant.userId,
        walletAddress: participant.walletAddress,
        amount,
        reason: 'performance',
        performanceScore: score,
        proportion
      });
    }

    return allocations;
  }

  /**
   * Calculate lottery-style distribution
   */
  async calculateLottery(pool) {
    const participants = Array.from(pool.participants.values());
    
    if (participants.length === 0) {
      return [];
    }

    const lotteryConfig = pool.distributionConfig.lottery || {
      winnerCount: Math.min(3, participants.length),
      prizeDistribution: [0.6, 0.3, 0.1] // 60%, 30%, 10%
    };

    const allocations = [];
    
    // Select winners using VRF
    const remainingParticipants = [...participants];
    
    for (let i = 0; i < lotteryConfig.winnerCount && remainingParticipants.length > 0; i++) {
      const vrfResult = await VRFService.selectRandomWinner(
        remainingParticipants,
        `pool_${pool.id}_lottery_${i}`
      );

      const winner = vrfResult.winner;
      const prizePercentage = lotteryConfig.prizeDistribution[i] || 0;
      const amount = pool.remainingAmount * prizePercentage;

      allocations.push({
        participantId: winner.id,
        userId: winner.userId,
        walletAddress: winner.walletAddress,
        amount,
        reason: 'lottery',
        position: i + 1,
        vrfProof: vrfResult.proof
      });

      // Remove winner from remaining participants
      const winnerIndex = remainingParticipants.findIndex(p => p.id === winner.id);
      if (winnerIndex !== -1) {
        remainingParticipants.splice(winnerIndex, 1);
      }
    }

    return allocations;
  }

  /**
   * Calculate bonus rewards
   */
  async calculateBonuses(pool, baseAllocations) {
    const bonuses = [];

    for (const allocation of baseAllocations) {
      const participant = pool.participants.get(allocation.participantId);
      if (!participant) continue;

      // Loyalty tier bonus
      const loyaltyMultiplier = this.config.loyaltyTierMultipliers[participant.loyaltyTier] || 1.0;
      if (loyaltyMultiplier > 1.0) {
        const bonusAmount = allocation.amount * (loyaltyMultiplier - 1.0);
        bonuses.push({
          participantId: participant.id,
          type: 'loyalty_tier',
          tier: participant.loyaltyTier,
          multiplier: loyaltyMultiplier,
          amount: bonusAmount,
          baseAmount: allocation.amount
        });
      }

      // Streak bonus
      if (participant.streakData.current >= 3) {
        const streakBonus = allocation.amount * (this.config.streakBonusMultiplier - 1.0);
        bonuses.push({
          participantId: participant.id,
          type: 'streak_bonus',
          streak: participant.streakData.current,
          amount: streakBonus,
          baseAmount: allocation.amount
        });
      }

      // Referral bonus
      if (participant.referralData.referrer) {
        const referralBonus = allocation.amount * this.config.referralBonusRate;
        bonuses.push({
          participantId: participant.referralData.referrer,
          type: 'referral_bonus',
          referredParticipant: participant.id,
          amount: referralBonus,
          baseAmount: allocation.amount
        });
      }
    }

    return bonuses;
  }

  /**
   * Apply bonuses to base allocations
   */
  applyBonuses(allocations, bonuses) {
    const finalAllocations = new Map();

    // Initialize with base allocations
    for (const allocation of allocations) {
      finalAllocations.set(allocation.participantId, { ...allocation });
    }

    // Apply bonuses
    for (const bonus of bonuses) {
      if (!finalAllocations.has(bonus.participantId)) {
        // Create new allocation for bonus-only rewards (e.g., referral bonuses)
        finalAllocations.set(bonus.participantId, {
          participantId: bonus.participantId,
          amount: 0,
          bonuses: []
        });
      }

      const allocation = finalAllocations.get(bonus.participantId);
      allocation.amount += bonus.amount;
      
      if (!allocation.bonuses) {
        allocation.bonuses = [];
      }
      allocation.bonuses.push(bonus);
    }

    return Array.from(finalAllocations.values());
  }

  /**
   * Execute actual reward distributions
   */
  async executeDistributions(pool, allocations) {
    const results = {
      successful: 0,
      failed: 0,
      totalDistributed: 0,
      distributions: []
    };

    for (const allocation of allocations) {
      try {
        // In production, this would transfer actual tokens
        const transactionResult = await this.executeTokenTransfer(
          allocation.walletAddress,
          allocation.amount,
          pool.currency
        );

        results.distributions.push({
          participantId: allocation.participantId,
          amount: allocation.amount,
          status: 'success',
          transactionId: transactionResult.transactionId,
          timestamp: Date.now()
        });

        results.successful++;
        results.totalDistributed += allocation.amount;

      } catch (error) {
        logger.error(`Failed to distribute to participant ${allocation.participantId}:`, error);
        
        results.distributions.push({
          participantId: allocation.participantId,
          amount: allocation.amount,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });

        results.failed++;
      }
    }

    return results;
  }

  /**
   * Execute token transfer (mock implementation)
   */
  async executeTokenTransfer(walletAddress, amount, currency) {
    // Mock transaction - in production would use actual blockchain transfer
    return {
      transactionId: `mock_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'confirmed',
      amount,
      currency,
      recipient: walletAddress,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate performance score for participant
   */
  calculatePerformanceScore(participant, config) {
    const metrics = config.performanceMetrics || ['wins', 'accuracy', 'consistency'];
    let score = 0;

    for (const metric of metrics) {
      const value = participant.performance[metric] || 0;
      const weight = config.metricWeights?.[metric] || 1;
      score += value * weight;
    }

    return score;
  }

  /**
   * Get reward pool by ID
   */
  async getPool(poolId) {
    if (this.rewardPools.has(poolId)) {
      return this.rewardPools.get(poolId);
    }

    try {
      const poolData = await redis.get(`reward_pool:${poolId}`);
      if (poolData) {
        const pool = JSON.parse(poolData);
        pool.participants = new Map(Object.entries(pool.participants || {}));
        this.rewardPools.set(poolId, pool);
        return pool;
      }
    } catch (error) {
      logger.error(`Failed to load reward pool ${poolId}:`, error);
    }

    return null;
  }

  /**
   * Generate pool ID
   */
  generatePoolId(type, eventId) {
    return `${type}_${eventId}_${Date.now()}`;
  }

  /**
   * Save pool to Redis
   */
  async savePoolToRedis(pool) {
    try {
      const poolData = {
        ...pool,
        participants: Object.fromEntries(pool.participants)
      };

      await redis.setex(
        `reward_pool:${pool.id}`,
        86400, // 24 hours
        JSON.stringify(poolData)
      );

      // Add to active pools index
      if (pool.status === 'active') {
        await redis.sadd('active_reward_pools', pool.id);
      } else {
        await redis.srem('active_reward_pools', pool.id);
      }

    } catch (error) {
      logger.error('Failed to save reward pool to Redis:', error);
    }
  }

  /**
   * Load existing reward pools
   */
  async loadRewardPools() {
    try {
      const activePoolIds = await redis.smembers('active_reward_pools');
      
      for (const poolId of activePoolIds) {
        await this.getPool(poolId); // This will load it into memory
      }

      logger.info(`Loaded ${activePoolIds.length} active reward pools`);

    } catch (error) {
      logger.error('Failed to load reward pools:', error);
    }
  }

  /**
   * Additional helper methods...
   */
  validatePoolConfiguration(pool) {
    if (pool.totalAmount <= 0) {
      throw new Error('Pool amount must be positive');
    }
    if (pool.totalAmount > this.config.maxPoolSize) {
      throw new Error(`Pool size exceeds maximum of ${this.config.maxPoolSize}`);
    }
    // Additional validation...
  }

  async checkParticipantEligibility(pool, participantData) {
    // Implementation for eligibility checking
    return { eligible: true };
  }

  async calculateBonusEligibility(participantData) {
    // Implementation for bonus eligibility calculation
    return {};
  }

  startDistributionScheduler() {
    // Implementation for scheduled distributions
    logger.info('Distribution scheduler started');
  }

  initializeBonusTracking() {
    // Implementation for bonus tracking initialization
    logger.info('Bonus tracking initialized');
  }

  async logDistributionEvent(distribution) {
    // Implementation for distribution event logging
    logger.info(`Distribution event logged: ${distribution.id}`);
  }
}

module.exports = { RewardDistributionManager: new RewardDistributionManager() };