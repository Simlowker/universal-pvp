import { PrismaClient, Prisma } from '@prisma/client';
import { createClient, RedisClientType } from 'redis';
import winston from 'winston';

// Global variables for connection management
declare global {
  var __prisma: PrismaClient | undefined;
  var __redis: RedisClientType | undefined;
}

// Enhanced Prisma client with logging and connection pooling
export class DatabaseClient {
  private static instance: DatabaseClient;
  public prisma: PrismaClient;
  public redis: RedisClientType;
  private logger: winston.Logger;

  private constructor() {
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'database' },
    });

    // Initialize Prisma with connection pooling
    this.prisma = globalThis.__prisma || new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });

    // Set up Prisma event logging
    this.prisma.$on('query', (e: any) => {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug('Query executed', {
          query: e.query,
          params: e.params,
          duration: e.duration,
          target: e.target,
        });
      }
    });

    this.prisma.$on('error', (e: any) => {
      this.logger.error('Prisma error', { error: e });
    });

    this.prisma.$on('info', (e: any) => {
      this.logger.info('Prisma info', { message: e.message });
    });

    this.prisma.$on('warn', (e: any) => {
      this.logger.warn('Prisma warning', { message: e.message });
    });

    // Initialize Redis connection
    this.redis = globalThis.__redis || createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            this.logger.error('Redis max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 50, 1000);
        },
      },
    });

    // Set up Redis error handling
    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', { error: err });
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });

    this.redis.on('disconnect', () => {
      this.logger.warn('Redis disconnected');
    });

    // Store in global for reuse in development
    if (process.env.NODE_ENV !== 'production') {
      globalThis.__prisma = this.prisma;
      globalThis.__redis = this.redis;
    }
  }

  public static getInstance(): DatabaseClient {
    if (!DatabaseClient.instance) {
      DatabaseClient.instance = new DatabaseClient();
    }
    return DatabaseClient.instance;
  }

  async connect(): Promise<void> {
    try {
      // Test Prisma connection
      await this.prisma.$connect();
      this.logger.info('Database connected successfully');

      // Connect Redis if not already connected
      if (!this.redis.isOpen) {
        await this.redis.connect();
      }
    } catch (error) {
      this.logger.error('Failed to connect to database', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      if (this.redis.isOpen) {
        await this.redis.disconnect();
      }
      this.logger.info('Database connections closed');
    } catch (error) {
      this.logger.error('Error disconnecting from database', { error });
    }
  }

  async healthCheck(): Promise<{ postgres: boolean; redis: boolean; latency: { postgres: number; redis: number } }> {
    
    try {
      // Test PostgreSQL
      const pgStart = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const pgLatency = Date.now() - pgStart;

      // Test Redis
      const redisStart = Date.now();
      await this.redis.ping();
      const redisLatency = Date.now() - redisStart;

      return {
        postgres: true,
        redis: true,
        latency: {
          postgres: pgLatency,
          redis: redisLatency,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed', { error });
      
      // Try to determine which connection failed
      let postgresHealth = false;
      let redisHealth = false;
      let pgLatency = -1;
      let redisLatency = -1;

      try {
        const pgStart = Date.now();
        await this.prisma.$queryRaw`SELECT 1`;
        postgresHealth = true;
        pgLatency = Date.now() - pgStart;
      } catch (pgError) {
        this.logger.error('PostgreSQL health check failed', { error: pgError });
      }

      try {
        const redisStart = Date.now();
        await this.redis.ping();
        redisHealth = true;
        redisLatency = Date.now() - redisStart;
      } catch (redisError) {
        this.logger.error('Redis health check failed', { error: redisError });
      }

      return {
        postgres: postgresHealth,
        redis: redisHealth,
        latency: {
          postgres: pgLatency,
          redis: redisLatency,
        },
      };
    }
  }

  // Transaction wrapper with retry logic
  async withTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
      retries?: number;
    }
  ): Promise<T> {
    const maxRetries = options?.retries || 3;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(callback, {
          maxWait: options?.maxWait || 5000,
          timeout: options?.timeout || 10000,
          isolationLevel: options?.isolationLevel,
        });
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (
          error && typeof error === 'object' && 'code' in error &&
          ((error as any).code === 'P2034' || (error as any).code === 'P2002') && // Transaction conflicts
          attempt < maxRetries
        ) {
          this.logger.warn(`Transaction attempt ${attempt} failed, retrying`, {
            error: (error as any).message,
            code: (error as any).code,
          });
          
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError;
  }

  // Cached query with Redis
  async cachedQuery<T>(
    key: string,
    queryFn: () => Promise<T>,
    ttlSeconds: number = 300
  ): Promise<T> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Cache read failed, executing query', { key, error });
    }

    const result = await queryFn();
    
    try {
      await this.redis.setEx(key, ttlSeconds, JSON.stringify(result));
    } catch (error) {
      this.logger.warn('Cache write failed', { key, error });
    }

    return result;
  }

  // Invalidate cache pattern
  async invalidateCache(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      this.logger.warn('Cache invalidation failed', { pattern, error });
    }
  }
}

// Export singleton instance
export const db = DatabaseClient.getInstance();

// Export types for convenience
export type { PrismaClient, Prisma } from '@prisma/client';