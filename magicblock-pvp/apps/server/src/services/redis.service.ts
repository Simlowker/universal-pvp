import { redisManager } from '@/config/redis';
import { logger } from '@/config/logger';

export class RedisService {
  async checkHealth(): Promise<{
    isHealthy: boolean;
    latency: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      const result = await redisManager.ping();
      const latency = Date.now() - start;
      
      return {
        isHealthy: result === 'PONG',
        latency
      };
    } catch (error) {
      logger.error('Redis health check failed', error);
      return {
        isHealthy: false,
        latency: -1,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getInfo(): Promise<any> {
    try {
      const info = await redisManager.info();
      // Parse Redis INFO output
      const sections: any = {};
      const lines = info.split('\r\n');
      let currentSection = 'general';
      
      for (const line of lines) {
        if (line.startsWith('#')) {
          currentSection = line.substring(1).trim().toLowerCase();
          sections[currentSection] = {};
        } else if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (!sections[currentSection]) {
            sections[currentSection] = {};
          }
          sections[currentSection][key] = value;
        }
      }
      
      return sections;
    } catch (error) {
      logger.error('Failed to get Redis info', error);
      return null;
    }
  }

  async getMemoryStats(): Promise<any> {
    try {
      const info = await this.getInfo();
      if (!info || !info.memory) {
        return null;
      }
      
      return {
        used: info.memory.used_memory_human || '0',
        peak: info.memory.used_memory_peak_human || '0',
        fragmentation: parseFloat(info.memory.mem_fragmentation_ratio || '1'),
        rss: info.memory.used_memory_rss_human || '0'
      };
    } catch (error) {
      logger.error('Failed to get Redis memory stats', error);
      return null;
    }
  }

  async flushCache(pattern?: string): Promise<number> {
    try {
      if (pattern) {
        const keys = await redisManager.keys(pattern);
        if (keys.length > 0) {
          await redisManager.del(...keys);
        }
        return keys.length;
      } else {
        await redisManager.flushAll();
        return -1; // Indicates all keys were flushed
      }
    } catch (error) {
      logger.error('Failed to flush cache', error);
      throw error;
    }
  }

  async getKeyCount(): Promise<number> {
    try {
      return await redisManager.dbSize();
    } catch (error) {
      logger.error('Failed to get key count', error);
      return 0;
    }
  }

  // Additional methods needed by health check service
  async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
    try {
      if (mode === 'EX' && duration) {
        await redisManager.set(key, value, duration);
      } else {
        await redisManager.set(key, value);
      }
      return 'OK';
    } catch (error) {
      logger.error('Redis SET failed', error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await redisManager.get(key);
    } catch (error) {
      logger.error('Redis GET failed', error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await redisManager.del(key);
    } catch (error) {
      logger.error('Redis DEL failed', error);
      throw error;
    }
  }

  async info(section?: string): Promise<string> {
    try {
      return await redisManager.info(section);
    } catch (error) {
      logger.error('Redis INFO failed', error);
      throw error;
    }
  }
}

export const redisService = new RedisService();