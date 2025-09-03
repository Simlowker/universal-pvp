import { Router, Request, Response } from 'express';
import { healthChecker } from '../utils/database.health';
import { db } from '../lib/database/client';
import winston from 'winston';

const router = Router();
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'database-monitoring' },
});

/**
 * Database health check endpoint
 * GET /health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const healthStatus = await healthChecker.checkHealth();
    
    const httpStatus = healthStatus.overall === 'healthy' ? 200 : 
                      healthStatus.overall === 'degraded' ? 200 : 503;

    res.status(httpStatus).json({
      status: healthStatus.overall,
      timestamp: healthStatus.timestamp,
      checks: {
        postgres: {
          status: healthStatus.postgres.connected ? 'up' : 'down',
          latency_ms: healthStatus.postgres.latency,
          error: healthStatus.postgres.error,
        },
        redis: {
          status: healthStatus.redis.connected ? 'up' : 'down',
          latency_ms: healthStatus.redis.latency,
          memory: healthStatus.redis.memory,
          error: healthStatus.redis.error,
        },
      },
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    });
  }
});

/**
 * Detailed database metrics endpoint
 * GET /metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await healthChecker.getMetrics();
    res.json({
      timestamp: new Date(),
      metrics,
    });
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get metrics',
    });
  }
});

/**
 * Performance analysis endpoint
 * GET /performance
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const analysis = await healthChecker.analyzePerformance();
    res.json({
      timestamp: new Date(),
      ...analysis,
    });
  } catch (error) {
    logger.error('Performance analysis failed', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Performance analysis failed',
    });
  }
});

/**
 * Slow queries endpoint
 * GET /slow-queries
 */
router.get('/slow-queries', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const slowQueries = await healthChecker.getSlowQueries(limit);
    
    res.json({
      timestamp: new Date(),
      queries: slowQueries,
      count: slowQueries.length,
    });
  } catch (error) {
    logger.error('Failed to get slow queries', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get slow queries',
    });
  }
});

/**
 * Active queries endpoint
 * GET /active-queries
 */
router.get('/active-queries', async (req: Request, res: Response) => {
  try {
    const activeQueries = await healthChecker.getActiveQueries();
    
    res.json({
      timestamp: new Date(),
      queries: activeQueries,
      count: activeQueries.length,
    });
  } catch (error) {
    logger.error('Failed to get active queries', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get active queries',
    });
  }
});

/**
 * Table sizes endpoint
 * GET /table-sizes
 */
router.get('/table-sizes', async (req: Request, res: Response) => {
  try {
    const tableSizes = await healthChecker.getTableSizes();
    
    res.json({
      timestamp: new Date(),
      tables: tableSizes,
      count: tableSizes.length,
    });
  } catch (error) {
    logger.error('Failed to get table sizes', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get table sizes',
    });
  }
});

/**
 * Index usage endpoint
 * GET /index-usage
 */
router.get('/index-usage', async (req: Request, res: Response) => {
  try {
    const indexUsage = await healthChecker.getIndexUsage();
    
    res.json({
      timestamp: new Date(),
      indexes: indexUsage,
      count: indexUsage.length,
    });
  } catch (error) {
    logger.error('Failed to get index usage', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get index usage',
    });
  }
});

/**
 * Cache statistics endpoint
 * GET /cache-stats
 */
router.get('/cache-stats', async (req: Request, res: Response) => {
  try {
    // Get Redis cache statistics
    const redisInfo = await db.redis.info('stats');
    const memoryInfo = await db.redis.info('memory');
    
    const parseRedisInfo = (info: string) => {
      const lines = info.split('\\r\\n');
      const stats: any = {};
      
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = isNaN(Number(value)) ? value : Number(value);
        }
      });
      
      return stats;
    };

    const stats = parseRedisInfo(redisInfo);
    const memory = parseRedisInfo(memoryInfo);

    res.json({
      timestamp: new Date(),
      cache: {
        hits: stats.keyspace_hits || 0,
        misses: stats.keyspace_misses || 0,
        hit_rate: stats.keyspace_hits && stats.keyspace_misses 
          ? stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses)
          : 0,
        evicted_keys: stats.evicted_keys || 0,
        expired_keys: stats.expired_keys || 0,
        keys_total: stats.keyspace_hits + stats.keyspace_misses || 0,
      },
      memory: {
        used: memory.used_memory_human || 'unknown',
        peak: memory.used_memory_peak_human || 'unknown',
        fragmentation_ratio: memory.mem_fragmentation_ratio || 1,
        system: memory.total_system_memory_human || 'unknown',
      },
      clients: {
        connected: stats.connected_clients || 0,
        blocked: stats.blocked_clients || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to get cache stats', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get cache stats',
    });
  }
});

/**
 * Database connection info endpoint
 * GET /connections
 */
router.get('/connections', async (req: Request, res: Response) => {
  try {
    const connections = await db.prisma.$queryRaw<Array<{
      state: string;
      count: bigint;
      application_name: string;
    }>>`
      SELECT 
        state, 
        COUNT(*) as count,
        application_name
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY state, application_name
      ORDER BY count DESC
    `;

    const processedConnections = connections.map(conn => ({
      ...conn,
      count: Number(conn.count),
    }));

    const totalConnections = processedConnections.reduce((sum, conn) => sum + conn.count, 0);
    const activeConnections = processedConnections
      .filter(conn => conn.state === 'active')
      .reduce((sum, conn) => sum + conn.count, 0);

    res.json({
      timestamp: new Date(),
      summary: {
        total: totalConnections,
        active: activeConnections,
        idle: totalConnections - activeConnections,
      },
      connections: processedConnections,
    });
  } catch (error) {
    logger.error('Failed to get connection info', { error });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get connection info',
    });
  }
});

/**
 * Clear Redis cache endpoint
 * POST /cache/clear
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const pattern = req.body.pattern || '*';
    
    if (pattern === '*') {
      // Clear all cache
      await db.redis.flushAll();
      res.json({
        message: 'All cache cleared successfully',
        pattern: '*',
        timestamp: new Date(),
      });
    } else {
      // Clear specific pattern
      await db.invalidateCache(pattern);
      res.json({
        message: `Cache cleared for pattern: ${pattern}`,
        pattern,
        timestamp: new Date(),
      });
    }
    
    logger.info('Cache cleared', { pattern });
  } catch (error) {
    logger.error('Failed to clear cache', { error, pattern: req.body.pattern });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to clear cache',
    });
  }
});

/**
 * Execute custom monitoring query (admin only)
 * POST /query
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    // Security check - only allow in development or with proper auth
    if (process.env.NODE_ENV === 'production' && !req.headers.authorization) {
      return res.status(403).json({
        error: 'Unauthorized - admin access required',
      });
    }

    const { query, params } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Query is required',
      });
    }

    // Basic security - prevent harmful operations
    const lowerQuery = query.toLowerCase().trim();
    const dangerousKeywords = ['drop', 'delete', 'truncate', 'alter', 'create', 'update', 'insert'];
    
    if (dangerousKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return res.status(400).json({
        error: 'Potentially dangerous query detected',
      });
    }

    const result = await db.prisma.$queryRawUnsafe(query, ...(params || []));
    
    res.json({
      timestamp: new Date(),
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      result,
      row_count: Array.isArray(result) ? result.length : 1,
    });

    logger.info('Custom query executed', { 
      query: query.substring(0, 100),
      row_count: Array.isArray(result) ? result.length : 1,
    });
  } catch (error) {
    logger.error('Custom query failed', { error, query: req.body.query });
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Query execution failed',
    });
  }
});

export { router as databaseRoutes };