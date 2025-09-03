const { logger } = require('../utils/logger');
const { BettingPoolManager } = require('./bettingPoolManager');
const { TournamentBettingManager } = require('./tournamentBetting');
const { AntiManipulationMonitor } = require('./antiManipulationMonitor');
const { VRFService } = require('./vrfService');

/**
 * Real-time Betting WebSocket Handler
 * Manages live betting, odds updates, and real-time notifications
 */
class RealtimeBettingSocket {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // socketId -> user data
    this.roomSubscriptions = new Map(); // roomId -> Set of socketIds
    this.userSubscriptions = new Map(); // userId -> Set of room subscriptions
    this.rateLimits = new Map(); // userId -> rate limit data
    
    this.config = {
      maxRoomsPerUser: 10,
      oddsUpdateInterval: 1000, // 1 second
      rateLimitWindow: 60000, // 1 minute
      maxRequestsPerWindow: 30,
      maxBetAmount: 10000, // SOL
      minBetAmount: 0.1 // SOL
    };

    this.setupSocketHandlers();
    this.startPeriodicUpdates();
    
    logger.info('Real-time betting socket system initialized');
  }

  /**
   * Setup WebSocket event handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.debug(`Betting socket connected: ${socket.id}`);

      // Authentication
      socket.on('authenticate', async (data) => {
        await this.handleAuthentication(socket, data);
      });

      // Room subscriptions
      socket.on('subscribe_pool', async (data) => {
        await this.handlePoolSubscription(socket, data);
      });

      socket.on('unsubscribe_pool', async (data) => {
        await this.handlePoolUnsubscription(socket, data);
      });

      socket.on('subscribe_tournament', async (data) => {
        await this.handleTournamentSubscription(socket, data);
      });

      // Betting actions
      socket.on('place_bet', async (data) => {
        await this.handlePlaceBet(socket, data);
      });

      socket.on('place_live_bet', async (data) => {
        await this.handlePlaceLiveBet(socket, data);
      });

      socket.on('place_bracket_bet', async (data) => {
        await this.handlePlaceBracketBet(socket, data);
      });

      // Information requests
      socket.on('get_pool_stats', async (data) => {
        await this.handleGetPoolStats(socket, data);
      });

      socket.on('get_live_odds', async (data) => {
        await this.handleGetLiveOdds(socket, data);
      });

      socket.on('get_user_bets', async (data) => {
        await this.handleGetUserBets(socket, data);
      });

      // Tournament actions
      socket.on('get_tournament_bracket', async (data) => {
        await this.handleGetTournamentBracket(socket, data);
      });

      // Disconnection handling
      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });
    });
  }

  /**
   * Handle user authentication
   */
  async handleAuthentication(socket, data) {
    try {
      const { userId, walletAddress, signature, message } = data;

      // Verify wallet signature (simplified)
      const isValidSignature = await this.verifyWalletSignature(
        walletAddress,
        signature,
        message
      );

      if (!isValidSignature) {
        socket.emit('auth_error', { message: 'Invalid signature' });
        return;
      }

      // Store user data
      this.connectedUsers.set(socket.id, {
        userId,
        walletAddress,
        authenticatedAt: Date.now(),
        subscriptions: new Set()
      });

      // Initialize rate limiting
      this.rateLimits.set(userId, {
        requests: 0,
        windowStart: Date.now()
      });

      socket.emit('authenticated', {
        success: true,
        userId,
        timestamp: Date.now()
      });

      logger.info(`User ${userId} authenticated on betting socket ${socket.id}`);

    } catch (error) {
      logger.error('Authentication error:', error);
      socket.emit('auth_error', { message: 'Authentication failed' });
    }
  }

  /**
   * Handle betting pool subscription
   */
  async handlePoolSubscription(socket, data) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { poolId } = data;
      const roomId = `pool_${poolId}`;

      // Check subscription limits
      if (user.subscriptions.size >= this.config.maxRoomsPerUser) {
        socket.emit('subscription_error', {
          message: 'Maximum room subscriptions reached'
        });
        return;
      }

      // Join room
      socket.join(roomId);
      user.subscriptions.add(roomId);

      // Track room subscriptions
      if (!this.roomSubscriptions.has(roomId)) {
        this.roomSubscriptions.set(roomId, new Set());
      }
      this.roomSubscriptions.get(roomId).add(socket.id);

      // Send initial pool data
      const poolStats = await BettingPoolManager.getPoolStats(poolId);
      socket.emit('pool_subscribed', {
        poolId,
        stats: poolStats,
        timestamp: Date.now()
      });

      logger.debug(`User ${user.userId} subscribed to pool ${poolId}`);

    } catch (error) {
      logger.error('Pool subscription error:', error);
      socket.emit('subscription_error', { message: 'Failed to subscribe to pool' });
    }
  }

  /**
   * Handle betting pool unsubscription
   */
  async handlePoolUnsubscription(socket, data) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) return;

      const { poolId } = data;
      const roomId = `pool_${poolId}`;

      socket.leave(roomId);
      user.subscriptions.delete(roomId);

      // Update room subscriptions
      if (this.roomSubscriptions.has(roomId)) {
        this.roomSubscriptions.get(roomId).delete(socket.id);
        if (this.roomSubscriptions.get(roomId).size === 0) {
          this.roomSubscriptions.delete(roomId);
        }
      }

      socket.emit('pool_unsubscribed', { poolId, timestamp: Date.now() });

    } catch (error) {
      logger.error('Pool unsubscription error:', error);
    }
  }

  /**
   * Handle tournament subscription
   */
  async handleTournamentSubscription(socket, data) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { tournamentId } = data;
      const roomId = `tournament_${tournamentId}`;

      socket.join(roomId);
      user.subscriptions.add(roomId);

      if (!this.roomSubscriptions.has(roomId)) {
        this.roomSubscriptions.set(roomId, new Set());
      }
      this.roomSubscriptions.get(roomId).add(socket.id);

      // Send initial tournament data
      const tournament = await TournamentBettingManager.getTournament(tournamentId);
      socket.emit('tournament_subscribed', {
        tournamentId,
        tournament: this.sanitizeTournamentData(tournament),
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Tournament subscription error:', error);
      socket.emit('subscription_error', { message: 'Failed to subscribe to tournament' });
    }
  }

  /**
   * Handle place bet request
   */
  async handlePlaceBet(socket, data) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) {
        socket.emit('bet_error', { message: 'Not authenticated' });
        return;
      }

      // Rate limiting
      if (!this.checkRateLimit(user.userId)) {
        socket.emit('bet_error', { message: 'Rate limit exceeded' });
        return;
      }

      const { poolId, outcomeId, amount } = data;

      // Validate bet amount
      if (amount < this.config.minBetAmount || amount > this.config.maxBetAmount) {
        socket.emit('bet_error', {
          message: `Bet amount must be between ${this.config.minBetAmount} and ${this.config.maxBetAmount} SOL`
        });
        return;
      }

      // Anti-manipulation check
      const monitoringResult = await AntiManipulationMonitor.monitorBettingActivity(
        user.userId,
        { poolId, outcomeId, amount, userWallet: user.walletAddress }
      );

      if (!monitoringResult.allowed) {
        socket.emit('bet_error', {
          message: 'Bet rejected due to security concerns',
          riskScore: monitoringResult.riskScore
        });
        return;
      }

      // Place the bet
      const bet = await BettingPoolManager.placeBet(
        user.userId,
        poolId,
        outcomeId,
        amount,
        user.walletAddress
      );

      // Emit bet confirmation to user
      socket.emit('bet_placed', {
        bet,
        timestamp: Date.now()
      });

      // Broadcast pool update to all subscribers
      await this.broadcastPoolUpdate(poolId);

      logger.info(`Bet placed via socket: ${amount} SOL by ${user.userId} on ${outcomeId}`);

    } catch (error) {
      logger.error('Place bet error:', error);
      socket.emit('bet_error', { message: error.message });
    }
  }

  /**
   * Handle place live bet request
   */
  async handlePlaceLiveBet(socket, data) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) {
        socket.emit('live_bet_error', { message: 'Not authenticated' });
        return;
      }

      if (!this.checkRateLimit(user.userId)) {
        socket.emit('live_bet_error', { message: 'Rate limit exceeded' });
        return;
      }

      const { matchId, outcomeId, amount } = data;

      // Validate live bet amount (typically smaller limits)
      const maxLiveBet = Math.min(this.config.maxBetAmount, 1000);
      if (amount < this.config.minBetAmount || amount > maxLiveBet) {
        socket.emit('live_bet_error', {
          message: `Live bet amount must be between ${this.config.minBetAmount} and ${maxLiveBet} SOL`
        });
        return;
      }

      // Place live bet
      const liveBet = await TournamentBettingManager.placeLiveBet(
        user.userId,
        matchId,
        outcomeId,
        amount
      );

      socket.emit('live_bet_placed', {
        bet: liveBet,
        timestamp: Date.now()
      });

      // Broadcast to tournament subscribers
      const tournamentId = this.extractTournamentIdFromMatch(matchId);
      await this.broadcastTournamentUpdate(tournamentId, 'live_bet_update', {
        matchId,
        newBet: liveBet
      });

    } catch (error) {
      logger.error('Live bet error:', error);
      socket.emit('live_bet_error', { message: error.message });
    }
  }

  /**
   * Handle place bracket bet request
   */
  async handlePlaceBracketBet(socket, data) {
    try {
      const user = this.connectedUsers.get(socket.id);
      if (!user) {
        socket.emit('bracket_bet_error', { message: 'Not authenticated' });
        return;
      }

      const { tournamentId, bracketPrediction, betAmount } = data;

      const bracketBet = await TournamentBettingManager.placeBracketBet(
        user.userId,
        tournamentId,
        bracketPrediction,
        betAmount
      );

      socket.emit('bracket_bet_placed', {
        bet: bracketBet,
        timestamp: Date.now()
      });

      // Broadcast tournament update
      await this.broadcastTournamentUpdate(tournamentId, 'bracket_bet_update', {
        newBracketBet: {
          userId: user.userId,
          amount: betAmount
        }
      });

    } catch (error) {
      logger.error('Bracket bet error:', error);
      socket.emit('bracket_bet_error', { message: error.message });
    }
  }

  /**
   * Handle get pool stats request
   */
  async handleGetPoolStats(socket, data) {
    try {
      const { poolId } = data;
      const stats = await BettingPoolManager.getPoolStats(poolId);
      
      socket.emit('pool_stats', {
        poolId,
        stats,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Get pool stats error:', error);
      socket.emit('pool_stats_error', { message: 'Failed to get pool stats' });
    }
  }

  /**
   * Handle get live odds request
   */
  async handleGetLiveOdds(socket, data) {
    try {
      const { matchId } = data;
      const odds = await TournamentBettingManager.getCurrentLiveOdds(matchId);
      
      socket.emit('live_odds', {
        matchId,
        odds,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Get live odds error:', error);
      socket.emit('live_odds_error', { message: 'Failed to get live odds' });
    }
  }

  /**
   * Broadcast pool updates to all subscribers
   */
  async broadcastPoolUpdate(poolId) {
    try {
      const roomId = `pool_${poolId}`;
      const stats = await BettingPoolManager.getPoolStats(poolId);
      
      this.io.to(roomId).emit('pool_update', {
        poolId,
        stats,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Broadcast pool update error:', error);
    }
  }

  /**
   * Broadcast tournament updates
   */
  async broadcastTournamentUpdate(tournamentId, updateType, data) {
    try {
      const roomId = `tournament_${tournamentId}`;
      
      this.io.to(roomId).emit('tournament_update', {
        tournamentId,
        updateType,
        data,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('Broadcast tournament update error:', error);
    }
  }

  /**
   * Start periodic updates for odds and statistics
   */
  startPeriodicUpdates() {
    // Update odds every second for active pools
    setInterval(async () => {
      await this.updateLiveOdds();
    }, this.config.oddsUpdateInterval);

    // Clean up rate limits every minute
    setInterval(() => {
      this.cleanupRateLimits();
    }, 60000);

    logger.info('Started periodic betting updates');
  }

  /**
   * Update live odds for all active matches
   */
  async updateLiveOdds() {
    try {
      // Get all active tournament rooms
      const tournamentRooms = Array.from(this.roomSubscriptions.keys())
        .filter(room => room.startsWith('tournament_'));

      for (const roomId of tournamentRooms) {
        const tournamentId = roomId.replace('tournament_', '');
        const tournament = await TournamentBettingManager.getTournament(tournamentId);
        
        if (tournament && tournament.status === 'active') {
          // Update odds for live matches
          for (const match of tournament.bracket.matches.values()) {
            if (match.status === 'live') {
              const newOdds = await TournamentBettingManager.getCurrentLiveOdds(match.id);
              
              this.io.to(roomId).emit('live_odds_update', {
                matchId: match.id,
                odds: newOdds,
                timestamp: Date.now()
              });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Update live odds error:', error);
    }
  }

  /**
   * Check rate limiting for user
   */
  checkRateLimit(userId) {
    const now = Date.now();
    let rateLimit = this.rateLimits.get(userId);
    
    if (!rateLimit) {
      rateLimit = { requests: 0, windowStart: now };
      this.rateLimits.set(userId, rateLimit);
    }

    // Reset window if expired
    if (now - rateLimit.windowStart > this.config.rateLimitWindow) {
      rateLimit.requests = 0;
      rateLimit.windowStart = now;
    }

    // Check limit
    if (rateLimit.requests >= this.config.maxRequestsPerWindow) {
      return false;
    }

    rateLimit.requests++;
    return true;
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnection(socket) {
    const user = this.connectedUsers.get(socket.id);
    if (user) {
      // Clean up subscriptions
      for (const roomId of user.subscriptions) {
        if (this.roomSubscriptions.has(roomId)) {
          this.roomSubscriptions.get(roomId).delete(socket.id);
          if (this.roomSubscriptions.get(roomId).size === 0) {
            this.roomSubscriptions.delete(roomId);
          }
        }
      }

      this.connectedUsers.delete(socket.id);
      logger.debug(`User ${user.userId} disconnected from betting socket`);
    }
  }

  /**
   * Verify wallet signature (simplified)
   */
  async verifyWalletSignature(walletAddress, signature, message) {
    // This would use actual signature verification in production
    // For now, return true for demo purposes
    return true;
  }

  /**
   * Sanitize tournament data for client
   */
  sanitizeTournamentData(tournament) {
    if (!tournament) return null;
    
    return {
      id: tournament.id,
      name: tournament.name,
      type: tournament.type,
      status: tournament.status,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      bracket: tournament.bracket,
      prizePool: tournament.prizePool
      // Exclude sensitive data like private betting information
    };
  }

  /**
   * Clean up old rate limit data
   */
  cleanupRateLimits() {
    const now = Date.now();
    for (const [userId, rateLimit] of this.rateLimits.entries()) {
      if (now - rateLimit.windowStart > this.config.rateLimitWindow * 2) {
        this.rateLimits.delete(userId);
      }
    }
  }

  /**
   * Extract tournament ID from match ID
   */
  extractTournamentIdFromMatch(matchId) {
    // Implementation depends on match ID format
    return matchId.split('_')[0];
  }
}

module.exports = { RealtimeBettingSocket };