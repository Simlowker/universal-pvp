import { faker } from '@faker-js/faker';
import { createTestUser, createTestGame, insertTestData } from './test-db';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  token: string;
  walletAddress?: string;
  balance?: number;
}

export interface TestGame {
  id: string;
  gameType: string;
  status: string;
  betAmount: number;
  maxPlayers: number;
  timeLimit: number;
  createdBy: string;
  isPrivate: boolean;
  players?: TestUser[];
}

export interface TestMove {
  id: string;
  gameId: string;
  playerId: string;
  moveType: string;
  targetPlayerId?: string;
  damage: number;
  processingTimeMs?: number;
}

export interface TestTransaction {
  id: string;
  gameId?: string;
  transactionSignature: string;
  transactionType: string;
  amount: number;
  costLamports: number;
  status: string;
}

export interface TestVRFRequest {
  id: string;
  gameId: string;
  requestId: string;
  seed: Buffer;
  randomValue?: Buffer;
  proof?: Buffer;
  status: string;
  responseTimeMs?: number;
}

/**
 * Factory for creating test users
 */
export class UserFactory {
  /**
   * Create a single test user with default or custom data
   */
  static async create(overrides?: Partial<{
    username: string;
    email: string;
    password: string;
    walletAddress: string;
    balance: number;
    isVerified: boolean;
  }>): Promise<TestUser> {
    const userData = {
      username: overrides?.username || faker.internet.userName(),
      email: overrides?.email || faker.internet.email(),
      password: overrides?.password || 'TestPassword123!',
      walletAddress: overrides?.walletAddress || this.generateSolanaAddress(),
      balance: overrides?.balance || faker.number.int({ min: 1000000, max: 10000000 }), // 1-10 SOL
      isVerified: overrides?.isVerified ?? true
    };

    return await createTestUser(userData);
  }

  /**
   * Create multiple test users
   */
  static async createMany(count: number, overrides?: Partial<{
    username: string;
    email: string;
    balance: number;
  }>): Promise<TestUser[]> {
    const users: TestUser[] = [];
    
    for (let i = 0; i < count; i++) {
      const user = await this.create({
        ...overrides,
        username: overrides?.username ? `${overrides.username}_${i}` : undefined,
        email: overrides?.email ? 
          `${overrides.email.split('@')[0]}_${i}@${overrides.email.split('@')[1]}` : 
          undefined
      });
      users.push(user);
    }
    
    return users;
  }

  /**
   * Create a user with high balance for testing
   */
  static async createWhale(): Promise<TestUser> {
    return this.create({
      username: `whale_${faker.string.alphanumeric(8)}`,
      balance: 100000000 // 100 SOL
    });
  }

  /**
   * Create a user with minimal balance
   */
  static async createMinnow(): Promise<TestUser> {
    return this.create({
      username: `minnow_${faker.string.alphanumeric(8)}`,
      balance: 100000 // 0.1 SOL
    });
  }

  /**
   * Generate a mock Solana wallet address
   */
  private static generateSolanaAddress(): string {
    // Generate a base58-like string (Solana addresses are 32-44 chars)
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 44; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

/**
 * Factory for creating test games
 */
export class GameFactory {
  /**
   * Create a single test game
   */
  static async create(
    creator: TestUser | string,
    overrides?: Partial<{
      gameType: string;
      betAmount: number;
      maxPlayers: number;
      timeLimit: number;
      status: string;
      isPrivate: boolean;
    }>
  ): Promise<TestGame> {
    const creatorId = typeof creator === 'string' ? creator : creator.id;
    
    const gameData = {
      gameType: overrides?.gameType || 'PVP',
      betAmount: overrides?.betAmount || faker.number.int({ min: 100000, max: 5000000 }),
      maxPlayers: overrides?.maxPlayers || 2,
      timeLimit: overrides?.timeLimit || faker.number.int({ min: 30000, max: 300000 }),
      status: overrides?.status || 'waiting',
      isPrivate: overrides?.isPrivate ?? false
    };

    return await createTestGame(creatorId, gameData);
  }

  /**
   * Create a waiting game (ready for players to join)
   */
  static async createWaitingGame(creator: TestUser): Promise<TestGame> {
    return this.create(creator, { status: 'waiting' });
  }

  /**
   * Create an active game with two players
   */
  static async createActiveGame(players: [TestUser, TestUser]): Promise<TestGame> {
    const game = await this.create(players[0], { status: 'active' });
    
    // Add second player
    await insertTestData('game_players', {
      game_id: game.id,
      player_id: players[1].id
    });

    game.players = players;
    return game;
  }

  /**
   * Create a finished game with winner
   */
  static async createFinishedGame(
    players: [TestUser, TestUser],
    winner: TestUser
  ): Promise<TestGame> {
    const game = await this.create(players[0], { status: 'finished' });
    
    // Add both players
    for (const player of players) {
      await insertTestData('game_players', {
        game_id: game.id,
        player_id: player.id,
        status: player.id === winner.id ? 'winner' : 'loser'
      });
    }

    // Update game with winner
    await insertTestData('games', {
      id: game.id,
      winner: winner.id
    });

    game.players = players;
    return game;
  }

  /**
   * Create multiple test games
   */
  static async createMany(
    count: number,
    creators: TestUser[],
    overrides?: Partial<{
      gameType: string;
      betAmount: number;
      status: string;
    }>
  ): Promise<TestGame[]> {
    const games: TestGame[] = [];
    
    for (let i = 0; i < count; i++) {
      const creator = creators[i % creators.length];
      const game = await this.create(creator, overrides);
      games.push(game);
    }
    
    return games;
  }

  /**
   * Create a high-stakes game
   */
  static async createHighStakes(creator: TestUser): Promise<TestGame> {
    return this.create(creator, {
      betAmount: 10000000, // 10 SOL
      gameType: 'PVP'
    });
  }

  /**
   * Create a private game
   */
  static async createPrivateGame(creator: TestUser): Promise<TestGame> {
    return this.create(creator, {
      isPrivate: true,
      status: 'waiting'
    });
  }
}

/**
 * Factory for creating test moves
 */
export class MoveFactory {
  /**
   * Create a test move
   */
  static async create(
    gameId: string,
    player: TestUser,
    overrides?: Partial<{
      moveType: string;
      targetPlayerId: string;
      damage: number;
      processingTimeMs: number;
    }>
  ): Promise<TestMove> {
    const moveTypes = ['attack', 'defend', 'special', 'heal'];
    
    const moveData = {
      game_id: gameId,
      player_id: player.id,
      move_type: overrides?.moveType || faker.helpers.arrayElement(moveTypes),
      target_player_id: overrides?.targetPlayerId || null,
      damage: overrides?.damage ?? faker.number.int({ min: 10, max: 100 }),
      processing_time_ms: overrides?.processingTimeMs ?? faker.number.int({ min: 50, max: 200 })
    };

    const id = await insertTestData('moves', moveData);

    return {
      id,
      gameId: moveData.game_id,
      playerId: moveData.player_id,
      moveType: moveData.move_type,
      targetPlayerId: moveData.target_player_id,
      damage: moveData.damage,
      processingTimeMs: moveData.processing_time_ms
    };
  }

  /**
   * Create a sequence of moves for a game
   */
  static async createSequence(
    gameId: string,
    players: TestUser[],
    count: number
  ): Promise<TestMove[]> {
    const moves: TestMove[] = [];
    
    for (let i = 0; i < count; i++) {
      const player = players[i % players.length];
      const targetPlayer = players[(i + 1) % players.length];
      
      const move = await this.create(gameId, player, {
        moveType: 'attack',
        targetPlayerId: targetPlayer.id,
        damage: faker.number.int({ min: 20, max: 50 })
      });
      
      moves.push(move);
    }
    
    return moves;
  }

  /**
   * Create a critical hit move
   */
  static async createCriticalHit(
    gameId: string,
    player: TestUser,
    target: TestUser
  ): Promise<TestMove> {
    return this.create(gameId, player, {
      moveType: 'attack',
      targetPlayerId: target.id,
      damage: faker.number.int({ min: 80, max: 100 })
    });
  }
}

/**
 * Factory for creating test transactions
 */
export class TransactionFactory {
  /**
   * Create a test transaction
   */
  static async create(overrides?: Partial<{
    gameId: string;
    transactionSignature: string;
    transactionType: string;
    amount: number;
    costLamports: number;
    status: string;
  }>): Promise<TestTransaction> {
    const transactionData = {
      game_id: overrides?.gameId || null,
      transaction_signature: overrides?.transactionSignature || this.generateSignature(),
      transaction_type: overrides?.transactionType || faker.helpers.arrayElement([
        'game_creation', 'game_join', 'move_submission', 'payout'
      ]),
      amount: overrides?.amount ?? faker.number.int({ min: 100000, max: 10000000 }),
      cost_lamports: overrides?.costLamports ?? faker.number.int({ min: 5000, max: 50000 }),
      status: overrides?.status || faker.helpers.arrayElement(['pending', 'confirmed', 'failed'])
    };

    const id = await insertTestData('transactions', transactionData);

    return {
      id,
      gameId: transactionData.game_id,
      transactionSignature: transactionData.transaction_signature,
      transactionType: transactionData.transaction_type,
      amount: transactionData.amount,
      costLamports: transactionData.cost_lamports,
      status: transactionData.status
    };
  }

  /**
   * Create multiple transactions for performance testing
   */
  static async createMany(count: number, gameIds: string[] = []): Promise<TestTransaction[]> {
    const transactions: TestTransaction[] = [];
    
    for (let i = 0; i < count; i++) {
      const transaction = await this.create({
        gameId: gameIds.length > 0 ? faker.helpers.arrayElement(gameIds) : undefined
      });
      transactions.push(transaction);
    }
    
    return transactions;
  }

  /**
   * Create a high-cost transaction
   */
  static async createHighCost(gameId?: string): Promise<TestTransaction> {
    return this.create({
      gameId,
      costLamports: faker.number.int({ min: 80000, max: 150000 }),
      amount: faker.number.int({ min: 5000000, max: 20000000 })
    });
  }

  /**
   * Generate a mock transaction signature
   */
  private static generateSignature(): string {
    return faker.string.alphanumeric(88); // Solana transaction signatures are 88 chars
  }
}

/**
 * Factory for creating test VRF requests
 */
export class VRFRequestFactory {
  /**
   * Create a test VRF request
   */
  static async create(
    gameId: string,
    overrides?: Partial<{
      requestId: string;
      seed: Buffer;
      randomValue: Buffer;
      proof: Buffer;
      status: string;
      responseTimeMs: number;
    }>
  ): Promise<TestVRFRequest> {
    const vrfData = {
      game_id: gameId,
      request_id: overrides?.requestId || `vrf_${faker.string.uuid()}`,
      seed: overrides?.seed || Buffer.from(faker.string.alphanumeric(32)),
      random_value: overrides?.randomValue || null,
      proof: overrides?.proof || null,
      status: overrides?.status || 'pending',
      response_time_ms: overrides?.responseTimeMs || null
    };

    const id = await insertTestData('vrf_requests', vrfData);

    return {
      id,
      gameId: vrfData.game_id,
      requestId: vrfData.request_id,
      seed: vrfData.seed,
      randomValue: vrfData.random_value,
      proof: vrfData.proof,
      status: vrfData.status,
      responseTimeMs: vrfData.response_time_ms
    };
  }

  /**
   * Create a completed VRF request
   */
  static async createCompleted(gameId: string): Promise<TestVRFRequest> {
    return this.create(gameId, {
      status: 'completed',
      randomValue: Buffer.from(faker.string.alphanumeric(32)),
      proof: Buffer.from(faker.string.alphanumeric(64)),
      responseTimeMs: faker.number.int({ min: 5, max: 15 })
    });
  }

  /**
   * Create a slow VRF request (for performance testing)
   */
  static async createSlow(gameId: string): Promise<TestVRFRequest> {
    return this.create(gameId, {
      status: 'completed',
      randomValue: Buffer.from(faker.string.alphanumeric(32)),
      proof: Buffer.from(faker.string.alphanumeric(64)),
      responseTimeMs: faker.number.int({ min: 15, max: 50 }) // Slow response
    });
  }
}

/**
 * Factory for creating performance test data
 */
export class PerformanceDataFactory {
  /**
   * Create test data for performance metrics
   */
  static async createPerformanceData(
    gameCount: number = 100,
    userCount: number = 50
  ): Promise<{
    users: TestUser[];
    games: TestGame[];
    transactions: TestTransaction[];
    vrfRequests: TestVRFRequest[];
  }> {
    console.log('Creating performance test data...');

    // Create users
    const users = await UserFactory.createMany(userCount);

    // Create games
    const games = await GameFactory.createMany(gameCount, users);

    // Create transactions
    const transactions = await TransactionFactory.createMany(
      gameCount * 3, // ~3 transactions per game
      games.map(g => g.id)
    );

    // Create VRF requests
    const vrfRequests: TestVRFRequest[] = [];
    for (const game of games.slice(0, 20)) { // VRF requests for 20% of games
      const vrf = await VRFRequestFactory.createCompleted(game.id);
      vrfRequests.push(vrf);
    }

    console.log(`Created ${users.length} users, ${games.length} games, ${transactions.length} transactions, ${vrfRequests.length} VRF requests`);

    return { users, games, transactions, vrfRequests };
  }

  /**
   * Create load test data with realistic patterns
   */
  static async createLoadTestData(): Promise<void> {
    // Create base users (whales and regular players)
    const whales = await UserFactory.createMany(5, { balance: 50000000 });
    const regularPlayers = await UserFactory.createMany(50, { balance: 5000000 });
    const minnows = await UserFactory.createMany(20, { balance: 500000 });

    const allUsers = [...whales, ...regularPlayers, ...minnows];

    // Create realistic game distribution
    // High stakes games (whales)
    await GameFactory.createMany(5, whales, { 
      betAmount: 10000000, 
      status: 'active' 
    });

    // Regular games
    await GameFactory.createMany(30, regularPlayers, { 
      betAmount: 1000000, 
      status: faker.helpers.arrayElement(['waiting', 'active']) 
    });

    // Low stakes games (minnows)
    await GameFactory.createMany(15, minnows, { 
      betAmount: 100000, 
      status: 'waiting' 
    });

    console.log('Load test data created successfully');
  }
}