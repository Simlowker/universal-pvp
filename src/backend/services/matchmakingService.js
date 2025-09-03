const { Game, Player } = require('../database/models');
const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');

class MatchmakingService {
  constructor() {
    this.matchmakingQueue = new Map(); // In-memory queue for simplicity
    this.eloRanges = [
      { min: 0, max: 1000, name: 'Bronze' },
      { min: 1001, max: 1200, name: 'Silver' },
      { min: 1201, max: 1400, name: 'Gold' },
      { min: 1401, max: 1600, name: 'Platinum' },
      { min: 1601, max: 1800, name: 'Diamond' },
      { min: 1801, max: 2000, name: 'Master' },
      { min: 2001, max: 9999, name: 'Grandmaster' }
    ];
  }

  /**
   * Find a match for a player or create a new game
   */
  async findMatch(playerId, preferences) {
    try {
      const { wagerAmount, gameType, eloRating } = preferences;
      
      logger.info(`Finding match for player ${playerId} with ELO ${eloRating}`);

      // First, try to find an existing game that matches criteria
      const existingGame = await this.findSuitableGame(playerId, preferences);
      if (existingGame) {
        await this.joinGame(existingGame.id, playerId, wagerAmount);
        return existingGame;
      }

      // If no suitable game found, create a new one
      const newGame = await this.createGame(playerId, preferences);
      
      // Add to matchmaking queue
      await this.addToQueue(playerId, preferences);
      
      return newGame;

    } catch (error) {
      logger.error('Matchmaking error:', error);
      throw new Error('Failed to find match');
    }
  }

  /**
   * Find a suitable existing game for the player
   */
  async findSuitableGame(playerId, preferences) {
    const { wagerAmount, gameType, eloRating } = preferences;
    const eloRange = this.calculateEloRange(eloRating);

    const games = await Game.findSuitable({
      gameType,
      wagerAmount,
      status: 'waiting',
      excludePlayer: playerId,
      eloRange
    });

    if (games.length === 0) {
      return null;
    }

    // Sort by ELO compatibility and creation time
    return games.sort((a, b) => {
      const aEloDistance = Math.abs(a.averageElo - eloRating);
      const bEloDistance = Math.abs(b.averageElo - eloRating);
      
      if (aEloDistance !== bEloDistance) {
        return aEloDistance - bEloDistance;
      }
      
      // If ELO distance is equal, prefer older games
      return new Date(a.createdAt) - new Date(b.createdAt);
    })[0];
  }

  /**
   * Create a new game for matchmaking
   */
  async createGame(playerId, preferences) {
    const { wagerAmount, gameType } = preferences;

    const gameData = {
      gameType,
      wagerAmount,
      isPrivate: false,
      maxPlayers: 2,
      timeLimit: 300, // 5 minutes
      createdBy: playerId,
      players: [playerId],
      status: 'waiting',
      createdAt: new Date(),
      settings: {
        ranked: true,
        autoStart: true
      }
    };

    const gameId = await Game.create(gameData);
    const game = await Game.findById(gameId);

    // Escrow the wager amount
    await Player.updateBalance(playerId, -wagerAmount);

    logger.info(`Matchmaking game created: ${gameId}`);
    return game;
  }

  /**
   * Join an existing game
   */
  async joinGame(gameId, playerId, wagerAmount) {
    await Game.addPlayer(gameId, playerId);
    await Player.updateBalance(playerId, -wagerAmount);

    // Start the game if it's full
    const game = await Game.findById(gameId);
    if (game.players.length >= game.maxPlayers) {
      await Game.updateStatus(gameId, 'active');
      await this.removeFromQueue(playerId);
      
      // Notify all players that game is starting
      // This would typically emit a socket event
      logger.info(`Game ${gameId} starting with ${game.players.length} players`);
    }
  }

  /**
   * Add player to matchmaking queue
   */
  async addToQueue(playerId, preferences) {
    const queueKey = `matchmaking:${preferences.gameType}:${preferences.wagerAmount}`;
    
    const queueData = {
      playerId,
      preferences,
      timestamp: Date.now()
    };

    // Store in Redis with expiration (10 minutes)
    await redis.setex(
      `${queueKey}:${playerId}`,
      600,
      JSON.stringify(queueData)
    );

    // Add to sorted set for efficient range queries
    await redis.zadd(
      `${queueKey}:elo`,
      preferences.eloRating,
      playerId
    );

    logger.info(`Player ${playerId} added to matchmaking queue`);
  }

  /**
   * Remove player from matchmaking queue
   */
  async removeFromQueue(playerId) {
    // Remove from all possible queue keys
    const keys = await redis.keys(`matchmaking:*:${playerId}`);
    if (keys.length > 0) {
      await redis.del(keys);
    }

    // Remove from ELO sorted sets
    const eloKeys = await redis.keys('matchmaking:*:elo');
    for (const key of eloKeys) {
      await redis.zrem(key, playerId);
    }

    logger.info(`Player ${playerId} removed from matchmaking queue`);
  }

  /**
   * Calculate ELO range for matchmaking
   */
  calculateEloRange(eloRating, expandRange = false) {
    const baseRange = expandRange ? 200 : 100;
    return {
      min: Math.max(0, eloRating - baseRange),
      max: eloRating + baseRange
    };
  }

  /**
   * Update ELO ratings after game completion
   */
  async updateEloRatings(gameId, winnerId, loserId) {
    try {
      const winner = await Player.findById(winnerId);
      const loser = await Player.findById(loserId);

      if (!winner || !loser) {
        throw new Error('Players not found for ELO update');
      }

      const { newWinnerElo, newLoserElo } = this.calculateEloChange(
        winner.eloRating,
        loser.eloRating,
        1 // Winner scored 1, loser scored 0
      );

      await Player.updateElo(winnerId, newWinnerElo);
      await Player.updateElo(loserId, newLoserElo);

      // Update game record with ELO changes
      await Game.updateEloChanges(gameId, {
        [winnerId]: newWinnerElo - winner.eloRating,
        [loserId]: newLoserElo - loser.eloRating
      });

      logger.info(
        `ELO updated - Winner: ${winner.eloRating} -> ${newWinnerElo}, ` +
        `Loser: ${loser.eloRating} -> ${newLoserElo}`
      );

      return {
        winnerId,
        loserId,
        eloChanges: {
          winner: newWinnerElo - winner.eloRating,
          loser: newLoserElo - loser.eloRating
        }
      };

    } catch (error) {
      logger.error('ELO update error:', error);
      throw error;
    }
  }

  /**
   * Calculate ELO rating changes using standard formula
   */
  calculateEloChange(winnerRating, loserRating, score) {
    const K = 32; // K-factor (can be adjusted based on player experience)
    
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 - expectedWinner;

    const newWinnerElo = Math.round(winnerRating + K * (score - expectedWinner));
    const newLoserElo = Math.round(loserRating + K * ((1 - score) - expectedLoser));

    return {
      newWinnerElo: Math.max(0, newWinnerElo), // Minimum ELO of 0
      newLoserElo: Math.max(0, newLoserElo)
    };
  }

  /**
   * Get player's rank based on ELO
   */
  getPlayerRank(eloRating) {
    for (const range of this.eloRanges) {
      if (eloRating >= range.min && eloRating <= range.max) {
        return range.name;
      }
    }
    return 'Unranked';
  }

  /**
   * Process matchmaking queue periodically
   */
  async processQueue() {
    try {
      const queueKeys = await redis.keys('matchmaking:*:elo');
      
      for (const queueKey of queueKeys) {
        const players = await redis.zrange(queueKey, 0, -1, 'WITHSCORES');
        
        if (players.length >= 4) { // Need at least 2 players (2 elements each with score)
          await this.matchPlayersInQueue(queueKey, players);
        }
      }

    } catch (error) {
      logger.error('Queue processing error:', error);
    }
  }

  /**
   * Match players in the same queue
   */
  async matchPlayersInQueue(queueKey, players) {
    // Convert to array of player objects
    const playerList = [];
    for (let i = 0; i < players.length; i += 2) {
      playerList.push({
        playerId: players[i],
        eloRating: parseFloat(players[i + 1])
      });
    }

    // Sort by ELO rating
    playerList.sort((a, b) => a.eloRating - b.eloRating);

    // Match adjacent players (closest ELO ratings)
    for (let i = 0; i < playerList.length - 1; i += 2) {
      const player1 = playerList[i];
      const player2 = playerList[i + 1];

      if (Math.abs(player1.eloRating - player2.eloRating) <= 200) {
        await this.createMatchedGame([player1.playerId, player2.playerId], queueKey);
      }
    }
  }

  /**
   * Create a game with matched players
   */
  async createMatchedGame(playerIds, queueKey) {
    try {
      // Extract game type and wager from queue key
      const [, gameType, wagerAmount] = queueKey.split(':');

      const gameData = {
        gameType,
        wagerAmount: parseFloat(wagerAmount),
        isPrivate: false,
        maxPlayers: 2,
        timeLimit: 300,
        createdBy: playerIds[0],
        players: playerIds,
        status: 'active',
        createdAt: new Date(),
        settings: {
          ranked: true,
          autoMatched: true
        }
      };

      const gameId = await Game.create(gameData);

      // Escrow wager amounts for both players
      for (const playerId of playerIds) {
        await Player.updateBalance(playerId, -parseFloat(wagerAmount));
        await this.removeFromQueue(playerId);
      }

      logger.info(`Auto-matched game created: ${gameId} with players ${playerIds.join(', ')}`);
      return gameId;

    } catch (error) {
      logger.error('Create matched game error:', error);
      throw error;
    }
  }

  /**
   * Get matchmaking statistics
   */
  async getMatchmakingStats() {
    try {
      const queueKeys = await redis.keys('matchmaking:*:elo');
      const stats = {
        totalQueues: queueKeys.length,
        playersInQueue: 0,
        queuesByType: {}
      };

      for (const queueKey of queueKeys) {
        const playerCount = await redis.zcard(queueKey);
        stats.playersInQueue += playerCount;

        const [, gameType, wagerAmount] = queueKey.replace(':elo', '').split(':');
        const key = `${gameType}_${wagerAmount}`;
        stats.queuesByType[key] = playerCount;
      }

      return stats;

    } catch (error) {
      logger.error('Get matchmaking stats error:', error);
      return null;
    }
  }
}

module.exports = { MatchmakingService: new MatchmakingService() };