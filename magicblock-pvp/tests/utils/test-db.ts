import { Pool } from 'pg';
import { Redis } from 'ioredis';

interface TestDatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

interface TestRedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

// Test database configuration
const TEST_DB_CONFIG: TestDatabaseConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'magicblock_test',
  username: process.env.TEST_DB_USER || 'test_user',
  password: process.env.TEST_DB_PASSWORD || 'test_password'
};

const TEST_REDIS_CONFIG: TestRedisConfig = {
  host: process.env.TEST_REDIS_HOST || 'localhost',
  port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
  password: process.env.TEST_REDIS_PASSWORD,
  db: parseInt(process.env.TEST_REDIS_DB || '1') // Use separate DB for tests
};

let testDbPool: Pool | null = null;
let testRedisClient: Redis | null = null;

/**
 * Setup test database connection
 */
export async function setupTestDatabase(): Promise<void> {
  if (testDbPool) {
    return; // Already setup
  }

  testDbPool = new Pool({
    host: TEST_DB_CONFIG.host,
    port: TEST_DB_CONFIG.port,
    database: TEST_DB_CONFIG.database,
    user: TEST_DB_CONFIG.username,
    password: TEST_DB_CONFIG.password,
    max: 20, // Maximum number of connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test the connection
  try {
    const client = await testDbPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Test database connected successfully');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }

  // Run initial setup
  await createTestTables();
}

/**
 * Setup test Redis connection
 */
export async function setupTestRedis(): Promise<void> {
  if (testRedisClient) {
    return; // Already setup
  }

  testRedisClient = new Redis({
    host: TEST_REDIS_CONFIG.host,
    port: TEST_REDIS_CONFIG.port,
    password: TEST_REDIS_CONFIG.password,
    db: TEST_REDIS_CONFIG.db,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  });

  // Test the connection
  try {
    await testRedisClient.ping();
    console.log('Test Redis connected successfully');
  } catch (error) {
    console.error('Failed to connect to test Redis:', error);
    throw error;
  }
}

/**
 * Create test database tables
 */
async function createTestTables(): Promise<void> {
  if (!testDbPool) {
    throw new Error('Test database not initialized');
  }

  const client = await testDbPool.connect();

  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        wallet_address VARCHAR(255),
        balance BIGINT DEFAULT 0,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Games table
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'waiting',
        bet_amount BIGINT NOT NULL,
        max_players INTEGER NOT NULL,
        time_limit INTEGER NOT NULL,
        created_by UUID NOT NULL REFERENCES users(id),
        winner UUID REFERENCES users(id),
        escrow_account VARCHAR(255),
        vrf_seed BYTEA,
        is_private BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Game players table
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_players (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        player_id UUID NOT NULL REFERENCES users(id),
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        health INTEGER DEFAULT 100,
        status VARCHAR(50) DEFAULT 'active',
        UNIQUE(game_id, player_id)
      )
    `);

    // Moves table
    await client.query(`
      CREATE TABLE IF NOT EXISTS moves (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        player_id UUID NOT NULL REFERENCES users(id),
        move_type VARCHAR(50) NOT NULL,
        target_player_id UUID REFERENCES users(id),
        damage INTEGER DEFAULT 0,
        processing_time_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID REFERENCES games(id),
        transaction_signature VARCHAR(255) UNIQUE NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        amount BIGINT NOT NULL,
        cost_lamports INTEGER NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        confirmed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // VRF requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vrf_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        request_id VARCHAR(255) UNIQUE NOT NULL,
        seed BYTEA NOT NULL,
        random_value BYTEA,
        proof BYTEA,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        response_time_ms INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        completed_at TIMESTAMP WITH TIME ZONE
      )
    `);

    // Request logs table (for performance monitoring)
    await client.query(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        method VARCHAR(10) NOT NULL,
        path VARCHAR(255) NOT NULL,
        status_code INTEGER NOT NULL,
        response_time_ms INTEGER NOT NULL,
        user_id UUID REFERENCES users(id),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_games_created_by ON games(created_by);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_game_id ON transactions(game_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vrf_requests_game_id ON vrf_requests(game_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
    `);

    console.log('Test tables created successfully');
  } finally {
    client.release();
  }
}

/**
 * Clean test database (truncate all tables)
 */
export async function cleanTestDatabase(): Promise<void> {
  if (!testDbPool) {
    throw new Error('Test database not initialized');
  }

  const client = await testDbPool.connect();

  try {
    // Truncate tables in correct order (respecting foreign keys)
    await client.query('TRUNCATE TABLE request_logs CASCADE');
    await client.query('TRUNCATE TABLE vrf_requests CASCADE');
    await client.query('TRUNCATE TABLE transactions CASCADE');
    await client.query('TRUNCATE TABLE moves CASCADE');
    await client.query('TRUNCATE TABLE game_players CASCADE');
    await client.query('TRUNCATE TABLE games CASCADE');
    await client.query('TRUNCATE TABLE users CASCADE');
  } finally {
    client.release();
  }
}

/**
 * Clean test Redis (flush test database)
 */
export async function cleanTestRedis(): Promise<void> {
  if (!testRedisClient) {
    throw new Error('Test Redis not initialized');
  }

  await testRedisClient.flushdb();
}

/**
 * Teardown test database connection
 */
export async function teardownTestDatabase(): Promise<void> {
  if (testDbPool) {
    await testDbPool.end();
    testDbPool = null;
  }
}

/**
 * Teardown test Redis connection
 */
export async function teardownTestRedis(): Promise<void> {
  if (testRedisClient) {
    await testRedisClient.quit();
    testRedisClient = null;
  }
}

/**
 * Get test database pool
 */
export function getTestDbPool(): Pool {
  if (!testDbPool) {
    throw new Error('Test database not initialized');
  }
  return testDbPool;
}

/**
 * Get test Redis client
 */
export function getTestRedisClient(): Redis {
  if (!testRedisClient) {
    throw new Error('Test Redis not initialized');
  }
  return testRedisClient;
}

/**
 * Execute SQL query on test database
 */
export async function executeTestQuery(query: string, params: any[] = []): Promise<any> {
  const pool = getTestDbPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Insert test data
 */
export async function insertTestData(table: string, data: Record<string, any>): Promise<string> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  
  const query = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders})
    RETURNING id
  `;
  
  const result = await executeTestQuery(query, values);
  return result.rows[0].id;
}

/**
 * Create test user
 */
export async function createTestUser(userData: {
  username: string;
  email: string;
  password?: string;
  walletAddress?: string;
  balance?: number;
}): Promise<{
  id: string;
  username: string;
  email: string;
  token: string;
}> {
  const id = await insertTestData('users', {
    username: userData.username,
    email: userData.email,
    password_hash: '$2b$10$test.hash.for.testing', // Mock password hash
    wallet_address: userData.walletAddress || null,
    balance: userData.balance || 0,
    is_verified: true
  });

  return {
    id,
    username: userData.username,
    email: userData.email,
    token: `test_token_${id}` // Mock JWT token
  };
}

/**
 * Create test game
 */
export async function createTestGame(
  creatorId: string,
  gameData?: Partial<{
    gameType: string;
    betAmount: number;
    maxPlayers: number;
    timeLimit: number;
    status: string;
    isPrivate: boolean;
  }>
): Promise<{
  id: string;
  gameType: string;
  status: string;
  betAmount: number;
  maxPlayers: number;
  timeLimit: number;
  createdBy: string;
  isPrivate: boolean;
}> {
  const defaultGameData = {
    game_type: 'PVP',
    bet_amount: 1000000,
    max_players: 2,
    time_limit: 30000,
    status: 'waiting',
    is_private: false,
    ...gameData
  };

  const id = await insertTestData('games', {
    ...defaultGameData,
    created_by: creatorId
  });

  return {
    id,
    gameType: defaultGameData.game_type,
    status: defaultGameData.status,
    betAmount: defaultGameData.bet_amount,
    maxPlayers: defaultGameData.max_players,
    timeLimit: defaultGameData.time_limit,
    createdBy: creatorId,
    isPrivate: defaultGameData.is_private
  };
}

/**
 * Seed test database with sample data
 */
export async function seedTestDatabase(): Promise<void> {
  // Create sample users
  const user1 = await createTestUser({
    username: 'testuser1',
    email: 'test1@example.com',
    balance: 10000000 // 10 SOL
  });

  const user2 = await createTestUser({
    username: 'testuser2',
    email: 'test2@example.com',
    balance: 5000000 // 5 SOL
  });

  // Create sample games
  const game1 = await createTestGame(user1.id, {
    gameType: 'PVP',
    betAmount: 1000000,
    status: 'waiting'
  });

  const game2 = await createTestGame(user2.id, {
    gameType: 'PVP',
    betAmount: 500000,
    status: 'active'
  });

  // Add user2 to game2
  await insertTestData('game_players', {
    game_id: game2.id,
    player_id: user1.id
  });

  console.log('Test database seeded successfully');
}