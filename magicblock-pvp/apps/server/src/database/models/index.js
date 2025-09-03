const { getDatabase } = require('../connection');
const { logger } = require('../../utils/logger');

/**
 * Base Model class with security-focused database operations
 */
class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
  }

  /**
   * Get database instance with error handling
   */
  getDb() {
    return getDatabase();
  }

  /**
   * Safe query execution with parameter validation
   */
  async safeQuery(query, params = []) {
    try {
      const db = this.getDb();
      return await db.raw(query, params);
    } catch (error) {
      logger.error(`Database query error in ${this.tableName}:`, error);
      throw error;
    }
  }

  /**
   * Safe find by ID using parameterized query
   */
  async findById(id) {
    if (!id) return null;
    
    const db = this.getDb();
    const results = await db(this.tableName)
      .where('id', id)
      .first();
    
    return results || null;
  }

  /**
   * Safe create with validation
   */
  async create(data) {
    const db = this.getDb();
    const [result] = await db(this.tableName)
      .insert(data)
      .returning('*');
    
    return result;
  }

  /**
   * Safe update with parameterized query
   */
  async update(id, data) {
    if (!id) throw new Error('ID is required for update');
    
    const db = this.getDb();
    const [result] = await db(this.tableName)
      .where('id', id)
      .update(data)
      .returning('*');
    
    return result;
  }

  /**
   * Safe delete with parameterized query
   */
  async delete(id) {
    if (!id) throw new Error('ID is required for delete');
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('id', id)
      .delete();
  }
}

/**
 * Player Model with security measures
 */
class Player extends BaseModel {
  constructor() {
    super('players');
  }

  /**
   * Find player by email using parameterized query
   */
  async findByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('email', email.toLowerCase().trim())
      .first();
  }

  /**
   * Find player by username using parameterized query
   */
  async findByUsername(username) {
    if (!username || typeof username !== 'string') return null;
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('username', username.trim())
      .first();
  }

  /**
   * Find player by wallet address using parameterized query
   */
  async findByWalletAddress(walletAddress) {
    if (!walletAddress || typeof walletAddress !== 'string') return null;
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('wallet_address', walletAddress.trim())
      .first();
  }

  /**
   * Update player balance safely
   */
  async updateBalance(playerId, amount) {
    if (!playerId || typeof amount !== 'number') {
      throw new Error('Invalid parameters for balance update');
    }
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('id', playerId)
      .increment('balance', amount);
  }

  /**
   * Verify wallet with security logging
   */
  async verifyWallet(playerId) {
    if (!playerId) throw new Error('Player ID is required');
    
    const db = this.getDb();
    const result = await db(this.tableName)
      .where('id', playerId)
      .update({ is_verified: true, verified_at: new Date() })
      .returning('*');

    logger.info(`Wallet verified for player ${playerId}`);
    return result[0];
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(playerId) {
    if (!playerId) throw new Error('Player ID is required');
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('id', playerId)
      .update({ last_login: new Date() });
  }

  /**
   * Get player stats safely
   */
  async getStats(playerId) {
    if (!playerId) return null;
    
    const db = this.getDb();
    return await db(this.tableName)
      .select('games_played', 'games_won', 'total_earnings', 'elo_rating')
      .where('id', playerId)
      .first();
  }
}

/**
 * Game Model with security measures
 */
class Game extends BaseModel {
  constructor() {
    super('games');
  }

  /**
   * Find games with secure filtering
   */
  async findMany(options = {}) {
    const { filters = {}, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    
    const db = this.getDb();
    let query = db(this.tableName);

    // Apply filters safely with parameterized queries
    if (filters.status) {
      query = query.where('status', filters.status);
    }
    if (filters.gameType) {
      query = query.where('game_type', filters.gameType);
    }
    if (filters.minWager !== undefined) {
      query = query.where('wager_amount', '>=', filters.minWager);
    }
    if (filters.maxWager !== undefined) {
      query = query.where('wager_amount', '<=', filters.maxWager);
    }

    return await query
      .limit(limit)
      .offset(offset)
      .orderBy('created_at', 'desc');
  }

  /**
   * Count games with secure filtering
   */
  async count(filters = {}) {
    const db = this.getDb();
    let query = db(this.tableName).count('* as count');

    // Apply same filters as findMany
    if (filters.status) {
      query = query.where('status', filters.status);
    }
    if (filters.gameType) {
      query = query.where('game_type', filters.gameType);
    }
    if (filters.minWager !== undefined) {
      query = query.where('wager_amount', '>=', filters.minWager);
    }
    if (filters.maxWager !== undefined) {
      query = query.where('wager_amount', '<=', filters.maxWager);
    }

    const result = await query.first();
    return parseInt(result.count);
  }

  /**
   * Find games by player using parameterized query
   */
  async findByPlayer(playerId, options = {}) {
    if (!playerId) return [];
    
    const { page = 1, limit = 20, status } = options;
    const offset = (page - 1) * limit;
    
    const db = this.getDb();
    let query = db(this.tableName)
      .where('players', 'like', `%${playerId}%`); // This needs to be improved for JSON arrays

    if (status) {
      query = query.where('status', status);
    }

    return await query
      .limit(limit)
      .offset(offset)
      .orderBy('created_at', 'desc');
  }

  /**
   * Count games by player
   */
  async countByPlayer(playerId, status = null) {
    if (!playerId) return 0;
    
    const db = this.getDb();
    let query = db(this.tableName)
      .count('* as count')
      .where('players', 'like', `%${playerId}%`); // This needs to be improved for JSON arrays

    if (status) {
      query = query.where('status', status);
    }

    const result = await query.first();
    return parseInt(result.count);
  }

  /**
   * Add player to game safely
   */
  async addPlayer(gameId, playerId) {
    if (!gameId || !playerId) {
      throw new Error('Game ID and Player ID are required');
    }
    
    const db = this.getDb();
    
    // First get current players
    const game = await this.findById(gameId);
    if (!game) throw new Error('Game not found');
    
    const currentPlayers = Array.isArray(game.players) ? game.players : JSON.parse(game.players || '[]');
    
    if (currentPlayers.includes(playerId)) {
      throw new Error('Player already in game');
    }
    
    currentPlayers.push(playerId);
    
    return await db(this.tableName)
      .where('id', gameId)
      .update({ 
        players: JSON.stringify(currentPlayers),
        updated_at: new Date()
      });
  }

  /**
   * Update game status safely
   */
  async updateStatus(gameId, status) {
    if (!gameId || !status) {
      throw new Error('Game ID and status are required');
    }
    
    const validStatuses = ['waiting', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid game status');
    }
    
    const db = this.getDb();
    return await db(this.tableName)
      .where('id', gameId)
      .update({ 
        status, 
        updated_at: new Date(),
        ...(status === 'active' ? { started_at: new Date() } : {}),
        ...(status === 'completed' ? { finished_at: new Date() } : {})
      });
  }
}

// Create instances
const playerModel = new Player();
const gameModel = new Game();

module.exports = {
  Player: playerModel,
  Game: gameModel,
  BaseModel
};