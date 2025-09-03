import { Pool, PoolConfig } from 'pg';
import { createClient, RedisClientType } from 'redis';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'connection-pool' },
});

interface ConnectionPoolConfig {
  postgresql: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    ssl?: boolean | object;
  };
  redis: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    maxRetriesPerRequest?: number;
    retryDelayOnFailover?: number;
    enableReadyCheck?: boolean;
  };
}

export class DatabaseConnectionPool {
  private pgPool: Pool | null = null;
  private redisClient: RedisClientType | null = null;
  private config: ConnectionPoolConfig;
  private isInitialized = false;

  constructor(config?: Partial<ConnectionPoolConfig>) {
    // Parse DATABASE_URL if provided
    let dbConfig: any = {};
    if (process.env.DATABASE_URL) {
      try {
        const url = new URL(process.env.DATABASE_URL);
        dbConfig = {
          host: url.hostname,
          port: parseInt(url.port) || 5432,
          database: url.pathname.substring(1),
          user: url.username,
          password: url.password,
          ssl: url.searchParams.get('sslmode') === 'require',
        };
      } catch (error) {
        logger.warn('Failed to parse DATABASE_URL, using individual env vars');
      }
    }

    this.config = {
      postgresql: {
        host: process.env.DB_HOST || dbConfig.host || 'localhost',
        port: parseInt(process.env.DB_PORT || '') || dbConfig.port || 5432,
        database: process.env.DB_NAME || dbConfig.database || 'magicblock_pvp',
        user: process.env.DB_USER || dbConfig.user || 'postgres',
        password: process.env.DB_PASSWORD || dbConfig.password || '',
        min: parseInt(process.env.DB_POOL_MIN || '') || 2,
        max: parseInt(process.env.DB_POOL_MAX || '') || 20,
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '') || 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '') || 10000,
        ssl: process.env.DB_SSL === 'true' || dbConfig.ssl || false,
        ...config?.postgresql,
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '') || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '') || 0,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        ...config?.redis,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await Promise.all([
      this.initializePostgreSQL(),
      this.initializeRedis(),
    ]);

    this.isInitialized = true;
    logger.info('Database connection pools initialized successfully');
  }

  private async initializePostgreSQL(): Promise<void> {
    try {
      const poolConfig: PoolConfig = {
        host: this.config.postgresql.host,
        port: this.config.postgresql.port,
        database: this.config.postgresql.database,
        user: this.config.postgresql.user,
        password: this.config.postgresql.password,
        min: this.config.postgresql.min,
        max: this.config.postgresql.max,
        idleTimeoutMillis: this.config.postgresql.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.postgresql.connectionTimeoutMillis,
        ssl: this.config.postgresql.ssl,
        
        // Additional performance settings
        application_name: 'magicblock-pvp-server',
        statement_timeout: 30000, // 30 seconds
        query_timeout: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      };

      this.pgPool = new Pool(poolConfig);

      // Set up event handlers
      this.pgPool.on('connect', (client) => {
        logger.debug('New PostgreSQL client connected', {
          processID: (client as any).processID,
          secretKey: (client as any).secretKey,
        });
      });

      this.pgPool.on('acquire', (client) => {
        logger.debug('PostgreSQL client acquired from pool', {
          processID: (client as any).processID,
        });
      });

      this.pgPool.on('remove', (client) => {
        logger.debug('PostgreSQL client removed from pool', {
          processID: (client as any).processID,
        });
      });

      this.pgPool.on('error', (err, client) => {
        logger.error('PostgreSQL pool error', {
          error: err.message,
          processID: (client as any)?.processID,
        });
      });

      // Test connection
      const client = await this.pgPool.connect();
      await client.query('SELECT 1');
      client.release();

      logger.info('PostgreSQL connection pool initialized', {
        host: this.config.postgresql.host,
        port: this.config.postgresql.port,
        database: this.config.postgresql.database,
        minConnections: this.config.postgresql.min,
        maxConnections: this.config.postgresql.max,
      });
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL connection pool', { error });
      throw error;
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redisClient = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          reconnectStrategy: (retries) => {
            if (retries > 20) {
              logger.error('Redis max reconnection attempts reached');
              return new Error('Redis connection failed');
            }
            return Math.min(retries * 50, 1000);
          },
          connectTimeout: 10000,
        },
        password: this.config.redis.password,
        database: this.config.redis.db,
      });

      // Set up event handlers
      this.redisClient.on('connect', () => {
        logger.debug('Redis client connecting');
      });

      this.redisClient.on('ready', () => {
        logger.info('Redis client ready');
      });

      this.redisClient.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
      });

      this.redisClient.on('end', () => {
        logger.warn('Redis client connection ended');
      });

      this.redisClient.on('reconnecting', () => {
        logger.info('Redis client reconnecting');
      });

      // Connect to Redis
      await this.redisClient.connect();

      // Test connection
      await this.redisClient.ping();

      logger.info('Redis connection pool initialized', {
        host: this.config.redis.host,
        port: this.config.redis.port,
        database: this.config.redis.db,
      });
    } catch (error) {
      logger.error('Failed to initialize Redis connection pool', { error });
      throw error;
    }
  }

  getPostgreSQLPool(): Pool {
    if (!this.pgPool) {
      throw new Error('PostgreSQL pool not initialized. Call initialize() first.');
    }
    return this.pgPool;
  }

  getRedisClient(): RedisClientType {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    return this.redisClient;
  }

  async getPoolStats(): Promise<{
    postgresql: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    redis: {
      status: string;
      connected: boolean;
    };
  }> {
    const pgStats = {
      totalCount: this.pgPool?.totalCount || 0,
      idleCount: this.pgPool?.idleCount || 0,
      waitingCount: this.pgPool?.waitingCount || 0,
    };

    const redisStats = {
      status: (this.redisClient as any)?.status || 'disconnected',
      connected: this.redisClient?.isReady || false,
    };

    return {
      postgresql: pgStats,
      redis: redisStats,
    };
  }

  async healthCheck(): Promise<{
    postgresql: { healthy: boolean; latency: number; error?: string };
    redis: { healthy: boolean; latency: number; error?: string };
  }> {
    const results = {
      postgresql: { healthy: false, latency: -1, error: undefined as string | undefined },
      redis: { healthy: false, latency: -1, error: undefined as string | undefined },
    };

    // Test PostgreSQL
    try {
      if (this.pgPool) {
        const start = Date.now();
        const client = await this.pgPool.connect();
        await client.query('SELECT 1');
        client.release();
        results.postgresql.latency = Date.now() - start;
        results.postgresql.healthy = true;
      }
    } catch (error) {
      results.postgresql.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test Redis
    try {
      if (this.redisClient) {
        const start = Date.now();
        await this.redisClient.ping();
        results.redis.latency = Date.now() - start;
        results.redis.healthy = true;
      }
    } catch (error) {
      results.redis.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return results;
  }

  async close(): Promise<void> {
    const promises: Promise<any>[] = [];

    if (this.pgPool) {
      logger.info('Closing PostgreSQL connection pool');
      promises.push(this.pgPool.end());
    }

    if (this.redisClient) {
      logger.info('Closing Redis connection');
      promises.push(this.redisClient.disconnect());
    }

    await Promise.all(promises);
    this.isInitialized = false;
    logger.info('Database connection pools closed');
  }

  // Graceful shutdown handler
  setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, closing database connections...`);
      
      try {
        await this.close();
        logger.info('Database connections closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
  }

  // Connection monitoring
  startMonitoring(intervalMs: number = 60000): void {
    setInterval(async () => {
      try {
        const stats = await this.getPoolStats();
        const health = await this.healthCheck();
        
        logger.debug('Connection pool stats', {
          postgresql: {
            ...stats.postgresql,
            healthy: health.postgresql.healthy,
            latency: health.postgresql.latency,
          },
          redis: {
            ...stats.redis,
            healthy: health.redis.healthy,
            latency: health.redis.latency,
          },
        });

        // Alert if connections are running low
        if (stats.postgresql.idleCount < 2) {
          logger.warn('Low PostgreSQL idle connections', {
            idleCount: stats.postgresql.idleCount,
            totalCount: stats.postgresql.totalCount,
          });
        }

        // Alert if health check fails
        if (!health.postgresql.healthy) {
          logger.error('PostgreSQL health check failed', {
            error: health.postgresql.error,
          });
        }

        if (!health.redis.healthy) {
          logger.error('Redis health check failed', {
            error: health.redis.error,
          });
        }
      } catch (error) {
        logger.error('Connection monitoring failed', { error });
      }
    }, intervalMs);
  }
}

// Export singleton instance
export const connectionPool = new DatabaseConnectionPool();

// Auto-initialize if not in test environment
if (process.env.NODE_ENV !== 'test') {
  connectionPool.initialize().catch((error) => {
    logger.error('Failed to initialize connection pools', { error });
    process.exit(1);
  });
}