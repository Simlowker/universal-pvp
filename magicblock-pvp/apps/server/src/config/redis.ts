import { createClient, RedisClientType } from 'redis';
import { logger } from './logger';
import { config } from './environment';

export type RedisClient = RedisClientType;

class RedisManager {
  private client: RedisClientType;
  private subscriber: RedisClientType;
  private publisher: RedisClientType;

  constructor() {
    this.client = createClient({
      url: config.redis.url,
      socket: {
        connectTimeout: 5000,
      },
    });

    this.subscriber = this.client.duplicate();
    this.publisher = this.client.duplicate();

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Main client event handlers
    this.client.on('connect', () => {
      logger.info('✅ Redis client connected');
    });

    this.client.on('error', (error) => {
      logger.error('❌ Redis client error:', error);
    });

    this.client.on('disconnect', () => {
      logger.warn('⚠️ Redis client disconnected');
    });

    // Subscriber event handlers
    this.subscriber.on('connect', () => {
      logger.info('✅ Redis subscriber connected');
    });

    this.subscriber.on('error', (error) => {
      logger.error('❌ Redis subscriber error:', error);
    });

    // Publisher event handlers
    this.publisher.on('connect', () => {
      logger.info('✅ Redis publisher connected');
    });

    this.publisher.on('error', (error) => {
      logger.error('❌ Redis publisher error:', error);
    });
  }

  async connect() {
    try {
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect(),
      ]);
      logger.info('✅ All Redis connections established');
    } catch (error) {
      logger.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await Promise.all([
        this.client.quit(),
        this.subscriber.quit(),
        this.publisher.quit(),
      ]);
      logger.info('✅ All Redis connections closed');
    } catch (error) {
      logger.error('❌ Failed to disconnect from Redis:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  getSubscriber(): RedisClientType {
    return this.subscriber;
  }

  getPublisher(): RedisClientType {
    return this.publisher;
  }

  // Utility methods
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(...keys: string[]): Promise<number> {
    return await this.client.del(keys);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    return await this.client.hSet(key, field, value);
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return await this.client.hGet(key, field);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return await this.client.hGetAll(key);
  }

  async hDel(key: string, field: string): Promise<number> {
    return await this.client.hDel(key, field);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return await this.client.expire(key, seconds);
  }

  async publish(channel: string, message: string): Promise<number> {
    return await this.publisher.publish(channel, message);
  }

  async subscribe(channel: string, callback: (message: string, channel: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel, callback);
  }

  async unsubscribe(channel?: string): Promise<void> {
    if (channel) {
      await this.subscriber.unsubscribe(channel);
    } else {
      await this.subscriber.unsubscribe();
    }
  }

  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 86400): Promise<void> {
    const key = `session:${sessionId}`;
    await this.set(key, JSON.stringify(data), ttl);
  }

  async getSession(sessionId: string): Promise<any | null> {
    const key = `session:${sessionId}`;
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await this.del(key);
  }

  // Game state caching
  async setGameState(gameId: string, state: any, ttl: number = 3600): Promise<void> {
    const key = `game:${gameId}`;
    await this.set(key, JSON.stringify(state), ttl);
  }

  async getGameState(gameId: string): Promise<any | null> {
    const key = `game:${gameId}`;
    const state = await this.get(key);
    return state ? JSON.parse(state) : null;
  }

  // Player presence tracking
  async setPlayerOnline(playerId: string): Promise<void> {
    const key = 'players:online';
    await this.client.sAdd(key, playerId);
  }

  async setPlayerOffline(playerId: string): Promise<void> {
    const key = 'players:online';
    await this.client.sRem(key, playerId);
  }

  async getOnlinePlayers(): Promise<string[]> {
    const key = 'players:online';
    return await this.client.sMembers(key);
  }

  async isPlayerOnline(playerId: string): Promise<boolean> {
    const key = 'players:online';
    return await this.client.sIsMember(key, playerId);
  }

  // Additional utility methods for health checks
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  async info(section?: string): Promise<string> {
    if (section) {
      return await this.client.info(section);
    }
    return await this.client.info();
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async flushAll(): Promise<string> {
    return await this.client.flushAll();
  }

  async dbSize(): Promise<number> {
    return await this.client.dbSize();
  }
}

const redisManager = new RedisManager();

// Export the client instance and utility methods
export const redis = redisManager.getClient();
export const redisSubscriber = redisManager.getSubscriber();
export const redisPublisher = redisManager.getPublisher();
export const redisUtils = redisManager;

export { redisManager };