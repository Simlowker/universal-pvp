import { db } from '../lib/database/client';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'database-health' },
});

export interface DatabaseHealthStatus {
  postgres: {
    connected: boolean;
    latency: number;
    error?: string;
  };
  redis: {
    connected: boolean;
    latency: number;
    memory?: {
      used: string;
      peak: string;
      fragmentation: number;
    };
    error?: string;
  };
  overall: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
}

export interface DatabaseMetrics {
  connections: {
    active: number;
    idle: number;
    total: number;
  };
  queries: {
    slow: number;
    failed: number;
    total: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  size: {
    database: string;
    indexes: string;
    total: string;
  };
}

export class DatabaseHealthChecker {
  private static instance: DatabaseHealthChecker;
  private metrics: Map<string, any> = new Map();

  static getInstance(): DatabaseHealthChecker {
    if (!this.instance) {
      this.instance = new DatabaseHealthChecker();
    }
    return this.instance;
  }

  async checkHealth(): Promise<DatabaseHealthStatus> {
    const timestamp = new Date();
    let postgresStatus = { connected: false, latency: -1, error: undefined };
    let redisStatus = { connected: false, latency: -1, memory: undefined, error: undefined };

    try {
      // Check PostgreSQL
      const pgStart = Date.now();
      await db.prisma.$queryRaw`SELECT 1`;
      postgresStatus = {
        connected: true,
        latency: Date.now() - pgStart,
        error: undefined,
      };
    } catch (error) {
      postgresStatus.error = error instanceof Error ? error.message : 'Unknown PostgreSQL error';
      logger.error('PostgreSQL health check failed', { error });
    }

    try {
      // Check Redis
      const redisStart = Date.now();
      await db.redis.ping();
      const latency = Date.now() - redisStart;

      // Get Redis memory info
      const memoryInfo = await (db.redis as any).memory?.('usage');
      const stats = await db.redis.info('memory');
      const memoryLines = stats.split('\\r\\n');
      const usedMemory = memoryLines.find(line => line.startsWith('used_memory_human:'))?.split(':')[1];
      const peakMemory = memoryLines.find(line => line.startsWith('used_memory_peak_human:'))?.split(':')[1];
      const fragRatio = memoryLines.find(line => line.startsWith('mem_fragmentation_ratio:'))?.split(':')[1];

      redisStatus = {
        connected: true,
        latency,
        memory: {
          used: usedMemory || 'unknown',
          peak: peakMemory || 'unknown',
          fragmentation: fragRatio ? parseFloat(fragRatio) : 1,
        },
        error: undefined,
      };
    } catch (error) {
      redisStatus.error = error instanceof Error ? error.message : 'Unknown Redis error';
      logger.error('Redis health check failed', { error });
    }

    // Determine overall health
    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!postgresStatus.connected || !redisStatus.connected) {
      overall = 'unhealthy';
    } else if (
      postgresStatus.latency > 1000 || 
      redisStatus.latency > 500 ||
      (redisStatus.memory?.fragmentation ?? 1) > 2
    ) {
      overall = 'degraded';
    }

    const healthStatus: DatabaseHealthStatus = {
      postgres: postgresStatus,
      redis: redisStatus,
      overall,
      timestamp,
    };

    // Store metrics for trending
    this.metrics.set('health', {
      ...healthStatus,
      timestamp: timestamp.getTime(),
    });

    return healthStatus;
  }

  async getMetrics(): Promise<DatabaseMetrics> {
    try {
      // PostgreSQL connection info
      const connectionInfo = await db.prisma.$queryRaw<Array<{
        state: string;
        count: bigint;
      }>>`
        SELECT state, COUNT(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state
      `;

      const connections = connectionInfo.reduce(
        (acc, { state, count }) => {
          const countNum = Number(count);
          if (state === 'active') acc.active = countNum;
          else if (state === 'idle') acc.idle = countNum;
          acc.total += countNum;
          return acc;
        },
        { active: 0, idle: 0, total: 0 }
      );

      // Slow queries (queries taking more than 1 second)
      const slowQueries = await db.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM pg_stat_statements 
        WHERE mean_exec_time > 1000
      `.catch(() => [{ count: BigInt(0) }]); // Fallback if pg_stat_statements not available

      // Database size info
      const sizeInfo = await db.prisma.$queryRaw<Array<{
        database_size: string;
        indexes_size: string;
      }>>`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          pg_size_pretty(SUM(pg_total_relation_size(indexrelid))) as indexes_size
        FROM pg_stat_user_indexes
      `;

      // Redis cache statistics
      const redisInfo = await db.redis.info('stats');
      const statsLines = redisInfo.split('\\r\\n');
      const cacheHits = parseInt(statsLines.find(line => line.startsWith('keyspace_hits:'))?.split(':')[1] || '0');
      const cacheMisses = parseInt(statsLines.find(line => line.startsWith('keyspace_misses:'))?.split(':')[1] || '0');

      const metrics: DatabaseMetrics = {
        connections,
        queries: {
          slow: Number(slowQueries[0]?.count || 0),
          failed: 0, // Would need additional tracking
          total: 0, // Would need additional tracking
        },
        cache: {
          hits: cacheHits,
          misses: cacheMisses,
          hitRate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
        },
        size: {
          database: sizeInfo[0]?.database_size || 'unknown',
          indexes: sizeInfo[0]?.indexes_size || 'unknown',
          total: 'calculated', // Would calculate total
        },
      };

      return metrics;
    } catch (error) {
      logger.error('Failed to get database metrics', { error });
      throw error;
    }
  }

  async getSlowQueries(limit: number = 10): Promise<Array<{
    query: string;
    calls: number;
    mean_time: number;
    total_time: number;
  }>> {
    try {
      return await db.prisma.$queryRaw`
        SELECT 
          query,
          calls,
          mean_exec_time as mean_time,
          total_exec_time as total_time
        FROM pg_stat_statements 
        ORDER BY mean_exec_time DESC 
        LIMIT ${limit}
      `;
    } catch (error) {
      logger.warn('Could not fetch slow queries - pg_stat_statements may not be available');
      return [];
    }
  }

  async getTableSizes(): Promise<Array<{
    table_name: string;
    size: string;
    row_count: number;
  }>> {
    try {
      return await db.prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename as table_name,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          n_tup_ins + n_tup_upd + n_tup_del as row_count
        FROM pg_stat_user_tables 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 20
      `;
    } catch (error) {
      logger.error('Failed to get table sizes', { error });
      return [];
    }
  }

  async analyzePerformance(): Promise<{
    recommendations: string[];
    warnings: string[];
    stats: any;
  }> {
    const recommendations: string[] = [];
    const warnings: string[] = [];
    const stats: any = {};

    try {
      const health = await this.checkHealth();
      const metrics = await this.getMetrics();

      // Analyze connection usage
      if (metrics.connections.active > 10) {
        warnings.push('High number of active database connections');
        recommendations.push('Consider implementing connection pooling optimization');
      }

      // Analyze cache performance
      if (metrics.cache.hitRate < 0.8) {
        warnings.push('Low cache hit rate detected');
        recommendations.push('Review caching strategy and increase cache TTL for stable data');
      }

      // Analyze latency
      if (health.postgres.latency > 100) {
        warnings.push('High database latency detected');
        recommendations.push('Consider optimizing slow queries and adding database indexes');
      }

      if (health.redis.latency > 50) {
        warnings.push('High Redis latency detected');
        recommendations.push('Check Redis memory usage and network connectivity');
      }

      // Analyze Redis memory
      if (health.redis.memory?.fragmentation && health.redis.memory.fragmentation > 1.5) {
        warnings.push('High Redis memory fragmentation');
        recommendations.push('Consider Redis memory optimization or restart');
      }

      stats.lastAnalysis = new Date();
      stats.healthScore = warnings.length === 0 ? 100 : Math.max(0, 100 - warnings.length * 15);

      return { recommendations, warnings, stats };
    } catch (error) {
      logger.error('Performance analysis failed', { error });
      return {
        recommendations: ['Unable to analyze performance due to error'],
        warnings: ['Performance analysis failed'],
        stats: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  // Monitoring queries for different aspects
  async getActiveQueries(): Promise<Array<{
    pid: number;
    duration: string;
    query: string;
    state: string;
  }>> {
    try {
      return await db.prisma.$queryRaw`
        SELECT 
          pid,
          now() - pg_stat_activity.query_start as duration,
          query,
          state
        FROM pg_stat_activity 
        WHERE state = 'active' 
        AND query != '<IDLE>'
        ORDER BY duration DESC
      `;
    } catch (error) {
      logger.error('Failed to get active queries', { error });
      return [];
    }
  }

  async getIndexUsage(): Promise<Array<{
    table_name: string;
    index_name: string;
    scans: number;
    usage_ratio: number;
  }>> {
    try {
      return await db.prisma.$queryRaw`
        SELECT 
          schemaname||'.'||tablename as table_name,
          indexname as index_name,
          idx_scan as scans,
          CASE WHEN seq_scan + idx_scan = 0 THEN 0
               ELSE 100.0 * idx_scan / (seq_scan + idx_scan)
          END as usage_ratio
        FROM pg_stat_user_indexes 
        JOIN pg_stat_user_tables USING (relname, schemaname)
        ORDER BY usage_ratio ASC
      `;
    } catch (error) {
      logger.error('Failed to get index usage', { error });
      return [];
    }
  }
}

export const healthChecker = DatabaseHealthChecker.getInstance();