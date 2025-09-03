const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');
const { BettingPoolManager } = require('./bettingPoolManager');
const { VRFService } = require('./vrfService');

/**
 * Tournament Bracket Betting System
 * Manages complex tournament betting with bracket predictions and live betting
 */
class TournamentBettingManager {
  constructor() {
    this.activeTournaments = new Map();
    this.bracketPredictions = new Map();
    this.liveBets = new Map();
    
    this.config = {
      maxBracketSize: 64,
      minBracketSize: 4,
      bracketBettingClosure: 3600000, // 1 hour before tournament
      liveBettingEnabled: true,
      maxLiveBetAmount: 1000, // SOL
      bracketBonusMultiplier: 2.0, // Bonus for perfect bracket
      advancementBonusRate: 0.1 // 10% bonus for each correct advancement
    };
    
    this.tournamentTypes = {
      SINGLE_ELIMINATION: 'single_elimination',
      DOUBLE_ELIMINATION: 'double_elimination',
      ROUND_ROBIN: 'round_robin',
      SWISS_SYSTEM: 'swiss_system'
    };
  }

  /**
   * Create tournament betting structure
   */
  async createTournamentBetting(tournamentData) {
    try {
      const tournamentId = tournamentData.id;
      
      const tournament = {
        id: tournamentId,
        name: tournamentData.name,
        type: tournamentData.type,
        participants: tournamentData.participants,
        bracket: this.generateBracket(tournamentData.participants, tournamentData.type),
        created: Date.now(),
        startsAt: tournamentData.startsAt,
        bracketLockTime: tournamentData.startsAt - this.config.bracketBettingClosure,
        status: 'open', // open, locked, active, completed
        currentRound: 0,
        totalRounds: this.calculateTotalRounds(tournamentData.participants.length, tournamentData.type),
        bettingPools: new Map(),
        bracketBets: new Map(),
        liveBets: new Map(),
        prizePool: {
          total: 0,
          bracketPool: 0,
          matchPools: 0,
          bonusPool: 0
        },
        results: {
          matches: new Map(),
          eliminations: [],
          winners: [],
          perfectBrackets: []
        },
        metadata: tournamentData.metadata || {}
      };

      // Create betting pools for each bracket match
      await this.createBracketBettingPools(tournament);
      
      // Initialize live betting for first round
      await this.initializeLiveBetting(tournament);

      this.activeTournaments.set(tournamentId, tournament);
      await this.saveTournamentToRedis(tournament);

      logger.info(
        `Created tournament betting for ${tournamentData.name} ` +
        `with ${tournamentData.participants.length} participants`
      );

      return tournament;

    } catch (error) {
      logger.error('Failed to create tournament betting:', error);
      throw error;
    }
  }

  /**
   * Generate tournament bracket structure
   */
  generateBracket(participants, type) {
    switch (type) {
      case this.tournamentTypes.SINGLE_ELIMINATION:
        return this.generateSingleEliminationBracket(participants);
      case this.tournamentTypes.DOUBLE_ELIMINATION:
        return this.generateDoubleEliminationBracket(participants);
      case this.tournamentTypes.ROUND_ROBIN:
        return this.generateRoundRobinBracket(participants);
      default:
        return this.generateSingleEliminationBracket(participants);
    }
  }

  /**
   * Generate single elimination bracket
   */
  generateSingleEliminationBracket(participants) {
    const bracket = {
      type: 'single_elimination',
      rounds: [],
      matches: new Map()
    };

    let currentParticipants = [...participants];
    let roundNumber = 1;
    let matchId = 1;

    // Pad to power of 2 if needed
    while (currentParticipants.length & (currentParticipants.length - 1)) {
      currentParticipants.push({ id: `bye_${currentParticipants.length}`, name: 'BYE', isBye: true });
    }

    while (currentParticipants.length > 1) {
      const round = {
        roundNumber,
        matches: [],
        startsAt: null,
        status: 'pending'
      };

      // Create matches for this round
      for (let i = 0; i < currentParticipants.length; i += 2) {
        const match = {
          id: `match_${matchId++}`,
          roundNumber,
          participant1: currentParticipants[i],
          participant2: currentParticipants[i + 1],
          winner: null,
          status: 'scheduled',
          bettingPoolId: null,
          odds: { [currentParticipants[i].id]: 2.0, [currentParticipants[i + 1].id]: 2.0 }
        };

        round.matches.push(match);
        bracket.matches.set(match.id, match);
      }

      bracket.rounds.push(round);
      
      // Prepare for next round (winners advance)
      currentParticipants = round.matches.map(() => ({ id: 'tbd', name: 'TBD' }));
      roundNumber++;
    }

    return bracket;
  }

  /**
   * Create betting pools for all bracket matches
   */
  async createBracketBettingPools(tournament) {
    try {
      for (const match of tournament.bracket.matches.values()) {
        if (!match.participant1.isBye && !match.participant2.isBye) {
          const poolData = {
            type: BettingPoolManager.poolTypes.MATCH_WINNER,
            eventId: match.id,
            eventName: `${match.participant1.name} vs ${match.participant2.name}`,
            description: `Round ${match.roundNumber} - ${tournament.name}`,
            outcomes: [
              {
                id: match.participant1.id,
                name: match.participant1.name,
                initialOdds: match.odds[match.participant1.id]
              },
              {
                id: match.participant2.id,
                name: match.participant2.name,
                initialOdds: match.odds[match.participant2.id]
              }
            ],
            closesAt: tournament.bracketLockTime,
            metadata: {
              tournamentId: tournament.id,
              roundNumber: match.roundNumber,
              matchId: match.id
            }
          };

          const pool = await BettingPoolManager.createBettingPool(poolData);
          match.bettingPoolId = pool.id;
          tournament.bettingPools.set(pool.id, pool);
        }
      }

      logger.info(`Created ${tournament.bettingPools.size} betting pools for tournament ${tournament.id}`);

    } catch (error) {
      logger.error('Failed to create bracket betting pools:', error);
      throw error;
    }
  }

  /**
   * Place bracket prediction bet
   */
  async placeBracketBet(userId, tournamentId, bracketPrediction, betAmount) {
    try {
      const tournament = await this.getTournament(tournamentId);
      if (!tournament) {
        throw new Error('Tournament not found');
      }

      if (tournament.status !== 'open') {
        throw new Error('Bracket betting is closed');
      }

      if (Date.now() > tournament.bracketLockTime) {
        throw new Error('Bracket betting period has ended');
      }

      // Validate bracket prediction
      this.validateBracketPrediction(tournament, bracketPrediction);

      const betId = `bracket_${tournamentId}_${userId}_${Date.now()}`;
      
      const bracketBet = {
        id: betId,
        userId,
        tournamentId,
        predictions: bracketPrediction, // Complete bracket predictions
        betAmount,
        potentialPayout: betAmount * this.config.bracketBonusMultiplier,
        placedAt: Date.now(),
        status: 'active',
        correctPredictions: 0,
        incorrectPredictions: 0,
        bonusMultiplier: 1.0,
        finalPayout: 0
      };

      tournament.bracketBets.set(userId, bracketBet);
      tournament.prizePool.bracketPool += betAmount;
      tournament.prizePool.total += betAmount;

      await this.saveTournamentToRedis(tournament);
      await this.logBracketBet(bracketBet);

      logger.info(
        `Bracket bet placed: ${betAmount} SOL by user ${userId} ` +
        `on tournament ${tournamentId}`
      );

      return bracketBet;

    } catch (error) {
      logger.error('Failed to place bracket bet:', error);
      throw error;
    }
  }

  /**
   * Place live bet during tournament
   */
  async placeLiveBet(userId, matchId, outcomeId, betAmount) {
    try {
      if (!this.config.liveBettingEnabled) {
        throw new Error('Live betting is disabled');
      }

      const tournament = this.findTournamentByMatch(matchId);
      if (!tournament) {
        throw new Error('Match not found');
      }

      const match = tournament.bracket.matches.get(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status !== 'live') {
        throw new Error('Live betting not available for this match');
      }

      if (betAmount > this.config.maxLiveBetAmount) {
        throw new Error(`Maximum live bet is ${this.config.maxLiveBetAmount} SOL`);
      }

      // Get current live odds
      const liveOdds = await this.getCurrentLiveOdds(matchId);
      
      const liveBetId = `live_${matchId}_${userId}_${Date.now()}`;
      
      const liveBet = {
        id: liveBetId,
        userId,
        tournamentId: tournament.id,
        matchId,
        outcomeId,
        betAmount,
        odds: liveOdds[outcomeId],
        potentialPayout: betAmount * liveOdds[outcomeId],
        placedAt: Date.now(),
        matchState: await this.getMatchState(matchId), // Current game state
        status: 'active'
      };

      if (!tournament.liveBets.has(matchId)) {
        tournament.liveBets.set(matchId, []);
      }
      tournament.liveBets.get(matchId).push(liveBet);

      tournament.prizePool.total += betAmount;

      await this.saveTournamentToRedis(tournament);
      await this.logLiveBet(liveBet);

      logger.info(
        `Live bet placed: ${betAmount} SOL on ${outcomeId} ` +
        `at odds ${liveOdds[outcomeId]} for match ${matchId}`
      );

      return liveBet;

    } catch (error) {
      logger.error('Failed to place live bet:', error);
      throw error;
    }
  }

  /**
   * Update match result and settle bets
   */
  async updateMatchResult(tournamentId, matchId, winnerId, matchData) {
    try {
      const tournament = await this.getTournament(tournamentId);
      if (!tournament) {
        throw new Error('Tournament not found');
      }

      const match = tournament.bracket.matches.get(matchId);
      if (!match) {
        throw new Error('Match not found');
      }

      // Update match result
      match.winner = winnerId;
      match.status = 'completed';
      match.completedAt = Date.now();
      match.matchData = matchData;

      // Record result
      tournament.results.matches.set(matchId, {
        winnerId,
        loserId: winnerId === match.participant1.id ? match.participant2.id : match.participant1.id,
        matchData,
        completedAt: Date.now()
      });

      // Settle match betting pool
      if (match.bettingPoolId) {
        await BettingPoolManager.settleBettingPool(match.bettingPoolId, winnerId);
      }

      // Settle live bets for this match
      await this.settleLiveBets(tournament, matchId, winnerId);

      // Update bracket predictions
      await this.updateBracketPredictions(tournament, matchId, winnerId);

      // Advance winner to next round
      await this.advanceWinnerToNextRound(tournament, matchId, winnerId);

      // Check if tournament is complete
      if (this.isTournamentComplete(tournament)) {
        await this.completeTournament(tournament);
      }

      await this.saveTournamentToRedis(tournament);

      logger.info(
        `Match result updated: ${winnerId} won match ${matchId} ` +
        `in tournament ${tournamentId}`
      );

      return {
        matchId,
        winnerId,
        tournamentStatus: tournament.status,
        nextRoundMatches: await this.getNextRoundMatches(tournament, match.roundNumber)
      };

    } catch (error) {
      logger.error('Failed to update match result:', error);
      throw error;
    }
  }

  /**
   * Update bracket predictions based on match results
   */
  async updateBracketPredictions(tournament, matchId, winnerId) {
    try {
      for (const bracketBet of tournament.bracketBets.values()) {
        const prediction = bracketBet.predictions[matchId];
        
        if (prediction) {
          if (prediction === winnerId) {
            bracketBet.correctPredictions++;
            // Apply advancement bonus
            bracketBet.bonusMultiplier += this.config.advancementBonusRate;
          } else {
            bracketBet.incorrectPredictions++;
          }

          // Update potential payout based on performance
          const accuracyRate = bracketBet.correctPredictions / 
            (bracketBet.correctPredictions + bracketBet.incorrectPredictions);
          
          bracketBet.potentialPayout = bracketBet.betAmount * 
            this.config.bracketBonusMultiplier * 
            bracketBet.bonusMultiplier * 
            accuracyRate;
        }
      }

      logger.debug(`Updated bracket predictions for match ${matchId}`);

    } catch (error) {
      logger.error('Failed to update bracket predictions:', error);
    }
  }

  /**
   * Complete tournament and settle all remaining bets
   */
  async completeTournament(tournament) {
    try {
      tournament.status = 'completed';
      tournament.completedAt = Date.now();

      // Find perfect bracket predictions
      const perfectBrackets = [];
      for (const bracketBet of tournament.bracketBets.values()) {
        if (bracketBet.incorrectPredictions === 0) {
          perfectBrackets.push(bracketBet);
        }
      }

      tournament.results.perfectBrackets = perfectBrackets;

      // Settle bracket bets
      await this.settleBracketBets(tournament);

      // Create final tournament report
      const report = await this.generateTournamentReport(tournament);

      logger.info(
        `Tournament ${tournament.id} completed. ` +
        `Perfect brackets: ${perfectBrackets.length}, ` +
        `Total prize pool: ${tournament.prizePool.total} SOL`
      );

      return report;

    } catch (error) {
      logger.error('Failed to complete tournament:', error);
      throw error;
    }
  }

  /**
   * Settle all bracket bets
   */
  async settleBracketBets(tournament) {
    try {
      const payouts = [];
      const totalBracketPool = tournament.prizePool.bracketPool;
      
      // Calculate payouts based on accuracy
      for (const bracketBet of tournament.bracketBets.values()) {
        const totalPredictions = bracketBet.correctPredictions + bracketBet.incorrectPredictions;
        const accuracyRate = totalPredictions > 0 ? bracketBet.correctPredictions / totalPredictions : 0;
        
        if (accuracyRate > 0) {
          const basePayout = bracketBet.betAmount;
          const bonusPayout = basePayout * bracketBet.bonusMultiplier * accuracyRate;
          const finalPayout = Math.min(basePayout + bonusPayout, bracketBet.potentialPayout);
          
          bracketBet.finalPayout = finalPayout;
          bracketBet.status = 'settled';
          
          payouts.push({
            userId: bracketBet.userId,
            betId: bracketBet.id,
            payout: finalPayout,
            accuracyRate,
            correctPredictions: bracketBet.correctPredictions
          });
        }
      }

      // Process payouts
      for (const payout of payouts) {
        await this.processBracketPayout(payout);
      }

      logger.info(`Processed ${payouts.length} bracket bet settlements`);
      return payouts;

    } catch (error) {
      logger.error('Failed to settle bracket bets:', error);
      throw error;
    }
  }

  /**
   * Get current live odds for a match
   */
  async getCurrentLiveOdds(matchId) {
    try {
      // Get current match state
      const matchState = await this.getMatchState(matchId);
      
      // Calculate live odds based on current game state
      const baseOdds = { participant1: 2.0, participant2: 2.0 };
      
      // Adjust odds based on current performance, health, etc.
      if (matchState) {
        const p1Advantage = this.calculatePlayerAdvantage(matchState.participant1);
        const p2Advantage = this.calculatePlayerAdvantage(matchState.participant2);
        
        // Adjust odds inversely to advantage
        baseOdds.participant1 = 2.0 - (p1Advantage * 0.5);
        baseOdds.participant2 = 2.0 - (p2Advantage * 0.5);
      }

      return baseOdds;

    } catch (error) {
      logger.error('Failed to get live odds:', error);
      return { participant1: 2.0, participant2: 2.0 };
    }
  }

  /**
   * Validate bracket prediction structure
   */
  validateBracketPrediction(tournament, prediction) {
    const requiredMatches = Array.from(tournament.bracket.matches.keys());
    
    for (const matchId of requiredMatches) {
      if (!prediction[matchId]) {
        throw new Error(`Missing prediction for match ${matchId}`);
      }
      
      const match = tournament.bracket.matches.get(matchId);
      const validOutcomes = [match.participant1.id, match.participant2.id];
      
      if (!validOutcomes.includes(prediction[matchId])) {
        throw new Error(`Invalid prediction for match ${matchId}`);
      }
    }
  }

  /**
   * Get tournament by ID
   */
  async getTournament(tournamentId) {
    if (this.activeTournaments.has(tournamentId)) {
      return this.activeTournaments.get(tournamentId);
    }

    try {
      const tournamentData = await redis.get(`tournament:${tournamentId}`);
      if (tournamentData) {
        const tournament = JSON.parse(tournamentData);
        // Restore Maps
        tournament.bettingPools = new Map(Object.entries(tournament.bettingPools || {}));
        tournament.bracketBets = new Map(Object.entries(tournament.bracketBets || {}));
        tournament.liveBets = new Map(Object.entries(tournament.liveBets || {}));
        tournament.bracket.matches = new Map(Object.entries(tournament.bracket.matches || {}));
        tournament.results.matches = new Map(Object.entries(tournament.results.matches || {}));
        
        this.activeTournaments.set(tournamentId, tournament);
        return tournament;
      }
    } catch (error) {
      logger.error(`Failed to load tournament ${tournamentId}:`, error);
    }

    return null;
  }

  /**
   * Save tournament to Redis
   */
  async saveTournamentToRedis(tournament) {
    try {
      const tournamentData = {
        ...tournament,
        bettingPools: Object.fromEntries(tournament.bettingPools),
        bracketBets: Object.fromEntries(tournament.bracketBets),
        liveBets: Object.fromEntries(tournament.liveBets),
        bracket: {
          ...tournament.bracket,
          matches: Object.fromEntries(tournament.bracket.matches)
        },
        results: {
          ...tournament.results,
          matches: Object.fromEntries(tournament.results.matches)
        }
      };

      await redis.setex(
        `tournament:${tournament.id}`,
        86400, // 24 hours
        JSON.stringify(tournamentData)
      );

      // Add to active tournaments index
      if (tournament.status !== 'completed') {
        await redis.sadd('active_tournaments', tournament.id);
      } else {
        await redis.srem('active_tournaments', tournament.id);
      }

    } catch (error) {
      logger.error('Failed to save tournament to Redis:', error);
    }
  }

  // Helper methods for bracket calculations, state management, etc.
  calculateTotalRounds(participantCount, type) {
    if (type === this.tournamentTypes.SINGLE_ELIMINATION) {
      return Math.ceil(Math.log2(participantCount));
    }
    // Add other tournament type calculations
    return Math.ceil(Math.log2(participantCount));
  }

  findTournamentByMatch(matchId) {
    for (const tournament of this.activeTournaments.values()) {
      if (tournament.bracket.matches.has(matchId)) {
        return tournament;
      }
    }
    return null;
  }

  async logBracketBet(bet) {
    await redis.lpush('bracket_bet_log', JSON.stringify({
      type: 'bracket_bet_placed',
      timestamp: Date.now(),
      bet
    }));
  }

  async logLiveBet(bet) {
    await redis.lpush('live_bet_log', JSON.stringify({
      type: 'live_bet_placed',
      timestamp: Date.now(),
      bet
    }));
  }
}

module.exports = { TournamentBettingManager: new TournamentBettingManager() };