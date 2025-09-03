const knex = require('knex');
const { logger } = require('../utils/logger');

let db = null;

const dbConfig = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'sol_duel',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  pool: {
    min: 2,
    max: 20,
    createTimeoutMillis: 30000,
    acquireTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
    propagateCreateError: false
  },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: './seeds'
  }
};

async function connectDatabase() {
  try {
    if (db) {
      return db;
    }

    db = knex(dbConfig);

    // Test the connection
    await db.raw('SELECT 1+1 as result');
    logger.info('Database connected successfully');

    // Run migrations if in development
    if (process.env.NODE_ENV === 'development') {
      await db.migrate.latest();
      logger.info('Database migrations completed');
    }

    return db;

  } catch (error) {
    logger.error('Database connection error:', error);
    throw new Error('Failed to connect to database');
  }
}

async function closeDatabase() {
  try {
    if (db) {
      await db.destroy();
      db = null;
      logger.info('Database connection closed');
    }
  } catch (error) {
    logger.error('Database close error:', error);
  }
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not connected');
  }
  return db;
}

// Health check function
async function checkDatabaseHealth() {
  try {
    if (!db) {
      return { healthy: false, error: 'No database connection' };
    }

    await db.raw('SELECT 1');
    return { healthy: true };

  } catch (error) {
    logger.error('Database health check failed:', error);
    return { healthy: false, error: error.message };
  }
}

module.exports = {
  connectDatabase,
  closeDatabase,
  getDatabase,
  checkDatabaseHealth
};