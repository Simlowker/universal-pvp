const Redis = require('redis');
const { logger } = require('./logger');

let redis = null;

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  commandTimeout: 5000
};

async function connectRedis() {
  try {
    if (redis && redis.isOpen) {
      return redis;
    }

    redis = Redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        keepAlive: redisConfig.keepAlive,
        connectTimeout: redisConfig.commandTimeout,
        commandTimeout: redisConfig.commandTimeout
      },
      password: redisConfig.password,
      database: redisConfig.db,
      retryDelayOnFailover: redisConfig.retryDelayOnFailover
    });

    redis.on('error', (error) => {
      logger.error('Redis error:', error);
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('ready', () => {
      logger.info('Redis ready');
    });

    redis.on('end', () => {
      logger.info('Redis connection ended');
    });

    redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    await redis.connect();
    
    // Test the connection
    await redis.ping();
    logger.info('Redis connection established successfully');

    return redis;

  } catch (error) {
    logger.error('Redis connection error:', error);
    throw new Error('Failed to connect to Redis');
  }
}

async function closeRedis() {
  try {
    if (redis && redis.isOpen) {
      await redis.quit();
      redis = null;
      logger.info('Redis connection closed');
    }
  } catch (error) {
    logger.error('Redis close error:', error);
  }
}

function getRedis() {
  if (!redis || !redis.isOpen) {
    throw new Error('Redis not connected');
  }
  return redis;
}

// Cache helper functions
class CacheService {
  constructor() {
    this.defaultTTL = 3600; // 1 hour
  }

  async get(key) {
    try {
      const client = getRedis();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      const client = getRedis();
      await client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    try {
      const client = getRedis();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key) {
    try {
      const client = getRedis();
      return await client.exists(key);
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  async keys(pattern) {
    try {
      const client = getRedis();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  }

  async increment(key, amount = 1, ttl = this.defaultTTL) {
    try {
      const client = getRedis();
      const result = await client.incrBy(key, amount);
      
      // Set TTL if this is the first increment
      if (result === amount) {
        await client.expire(key, ttl);
      }
      
      return result;
    } catch (error) {
      logger.error('Cache increment error:', error);
      return null;
    }
  }

  async decrement(key, amount = 1) {
    try {
      const client = getRedis();
      return await client.decrBy(key, amount);
    } catch (error) {
      logger.error('Cache decrement error:', error);
      return null;
    }
  }

  // List operations
  async listPush(key, value, ttl = this.defaultTTL) {
    try {
      const client = getRedis();
      const result = await client.lPush(key, JSON.stringify(value));
      await client.expire(key, ttl);
      return result;
    } catch (error) {
      logger.error('Cache list push error:', error);
      return null;
    }
  }

  async listPop(key) {
    try {
      const client = getRedis();
      const value = await client.lPop(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache list pop error:', error);
      return null;
    }
  }

  async listLength(key) {
    try {
      const client = getRedis();
      return await client.lLen(key);
    } catch (error) {
      logger.error('Cache list length error:', error);
      return 0;
    }
  }

  // Set operations
  async setAdd(key, value, ttl = this.defaultTTL) {
    try {
      const client = getRedis();
      const result = await client.sAdd(key, JSON.stringify(value));
      await client.expire(key, ttl);
      return result;
    } catch (error) {
      logger.error('Cache set add error:', error);
      return null;
    }
  }

  async setRemove(key, value) {
    try {
      const client = getRedis();
      return await client.sRem(key, JSON.stringify(value));
    } catch (error) {
      logger.error('Cache set remove error:', error);
      return null;
    }
  }

  async setMembers(key) {
    try {
      const client = getRedis();
      const members = await client.sMembers(key);
      return members.map(member => JSON.parse(member));
    } catch (error) {
      logger.error('Cache set members error:', error);
      return [];
    }
  }

  // Hash operations
  async hashSet(key, field, value, ttl = this.defaultTTL) {
    try {
      const client = getRedis();
      await client.hSet(key, field, JSON.stringify(value));
      await client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache hash set error:', error);
      return false;
    }
  }

  async hashGet(key, field) {
    try {
      const client = getRedis();
      const value = await client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache hash get error:', error);
      return null;
    }
  }

  async hashGetAll(key) {
    try {
      const client = getRedis();
      const hash = await client.hGetAll(key);
      const result = {};
      
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value;
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Cache hash get all error:', error);
      return {};
    }
  }

  // Pattern-based operations
  async deletePattern(pattern) {
    try {
      const client = getRedis();
      const keys = await client.keys(pattern);
      
      if (keys.length > 0) {
        await client.del(keys);
        return keys.length;
      }
      
      return 0;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const client = getRedis();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Cache health check error:', error);
      return false;
    }
  }
}

const cacheService = new CacheService();

module.exports = {
  connectRedis,
  closeRedis,
  getRedis,
  redis: () => getRedis(),
  cache: cacheService
};