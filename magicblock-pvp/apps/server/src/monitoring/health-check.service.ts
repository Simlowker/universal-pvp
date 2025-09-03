import { DatabaseService } from '../services/database.service';
import { RedisService } from '../services/redis.service';
import { VRFService } from '../services/vrf.service';
import { Connection } from '@solana/web3.js';
import { performance } from 'perf_hooks';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    blockchain: ComponentHealth;
    vrf: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
  };
  metrics: {
    responseTime: number;
    activeConnections: number;
    gameCount: number;
    errorRate: number;
  };
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastChecked: string;
  error?: string;
  metrics?: Record<string, any>;
}

export interface PerformanceMetrics {
  p95Latency: number;
  p95Cost: number;
  successRate: number;
  vrfLatency: number;
}

export class HealthCheckService {
  private readonly databaseService: DatabaseService;
  private readonly redisService: RedisService;
  private readonly vrfService: VRFService;
  private readonly solanaConnection: Connection;
  private readonly startTime: number;

  // Performance targets
  private readonly PERFORMANCE_TARGETS = {
    maxLatencyMs: 100,    // P95 latency < 100ms
    maxCostLamports: 100000, // P95 cost < 100k lamports
    minSuccessRate: 0.999,   // Success rate > 99.9%
    maxVrfLatencyMs: 10      // VRF latency < 10ms
  };

  constructor(
    databaseService: DatabaseService,
    redisService: RedisService,
    vrfService: VRFService,
    solanaConnection: Connection
  ) {
    this.databaseService = databaseService;
    this.redisService = redisService;
    this.vrfService = vrfService;
    this.solanaConnection = solanaConnection;
    this.startTime = Date.now();
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    // Run all health checks in parallel
    const [
      databaseHealth,
      redisHealth,
      blockchainHealth,
      vrfHealth,
      memoryHealth,
      diskHealth,
      metrics
    ] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkBlockchain(),
      this.checkVRF(),
      this.checkMemory(),
      this.checkDisk(),
      this.getMetrics()
    ]);

    const responseTime = Math.round(performance.now() - startTime);
    
    // Determine overall status
    const allChecks = [databaseHealth, redisHealth, blockchainHealth, vrfHealth, memoryHealth, diskHealth];
    const unhealthyCount = allChecks.filter(check => check.status === 'unhealthy').length;
    const degradedCount = allChecks.filter(check => check.status === 'degraded').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 1) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp,
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '0.1.0',
      checks: {
        database: databaseHealth,
        redis: redisHealth,
        blockchain: blockchainHealth,
        vrf: vrfHealth,
        memory: memoryHealth,
        disk: diskHealth,
      },
      metrics: {
        responseTime,
        ...metrics
      }
    };
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<ComponentHealth> {
    const startTime = performance.now();
    
    try {
      // Test basic connectivity
      await this.databaseService.query('SELECT 1');
      
      // Test complex query performance
      const queryStart = performance.now();
      await this.databaseService.query(`
        SELECT COUNT(*) as count, 
               AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration 
        FROM games 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);
      const queryTime = performance.now() - queryStart;

      const responseTime = Math.round(performance.now() - startTime);
      
      return {
        status: responseTime > 1000 ? 'degraded' : 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        metrics: {
          queryTime: Math.round(queryTime),
          connectionPool: await this.getDatabaseMetrics()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check Redis connectivity and performance
   */
  private async checkRedis(): Promise<ComponentHealth> {
    const startTime = performance.now();
    
    try {
      // Test basic connectivity
      const testKey = `health_check_${Date.now()}`;
      await this.redisService.set(testKey, 'test', 'EX', 10);
      const value = await this.redisService.get(testKey);
      await this.redisService.del(testKey);

      if (value !== 'test') {
        throw new Error('Redis read/write test failed');
      }

      const responseTime = Math.round(performance.now() - startTime);
      
      return {
        status: responseTime > 500 ? 'degraded' : 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        metrics: await this.getRedisMetrics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check Solana blockchain connectivity
   */
  private async checkBlockchain(): Promise<ComponentHealth> {
    const startTime = performance.now();
    
    try {
      // Test RPC connectivity
      const slot = await this.solanaConnection.getSlot();
      
      // Test account balance (if monitoring wallet is configured)
      if (process.env.MONITORING_WALLET_ADDRESS) {
        await this.solanaConnection.getBalance(
          new (await import('@solana/web3.js')).PublicKey(process.env.MONITORING_WALLET_ADDRESS)
        );
      }

      const responseTime = Math.round(performance.now() - startTime);
      
      return {
        status: responseTime > 2000 ? 'degraded' : 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        metrics: {
          currentSlot: slot,
          commitment: this.solanaConnection.commitment,
          rpcEndpoint: this.solanaConnection.rpcEndpoint
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check VRF service performance
   */
  private async checkVRF(): Promise<ComponentHealth> {
    const startTime = performance.now();
    
    try {
      // Test VRF request (without actually requesting randomness)
      const testSeed = Buffer.from('health_check_seed');
      const isReady = this.vrfService.isReady;
      
      if (!isReady) {
        throw new Error('VRF service not ready');
      }

      const responseTime = Math.round(performance.now() - startTime);
      
      return {
        status: responseTime > 100 ? 'degraded' : 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        metrics: {
          isReady,
          pendingRequests: await this.vrfService.getPendingRequestCount()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<ComponentHealth> {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.rss + memoryUsage.heapUsed + memoryUsage.external;
    
    // Convert to MB
    const totalMemoryMB = Math.round(totalMemory / 1024 / 1024);
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    
    // Determine status based on heap usage
    const heapUsagePercent = heapUsedMB / heapTotalMB;
    let status: ComponentHealth['status'];
    
    if (heapUsagePercent > 0.9) {
      status = 'unhealthy';
    } else if (heapUsagePercent > 0.7) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      lastChecked: new Date().toISOString(),
      metrics: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: heapTotalMB,
        heapUsed: heapUsedMB,
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        heapUsagePercent: Math.round(heapUsagePercent * 100)
      }
    };
  }

  /**
   * Check disk usage (if available)
   */
  private async checkDisk(): Promise<ComponentHealth> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const stats = await fs.promises.statfs(path.resolve('./'));
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      const usagePercent = usedBytes / totalBytes;

      let status: ComponentHealth['status'];
      if (usagePercent > 0.9) {
        status = 'unhealthy';
      } else if (usagePercent > 0.8) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return {
        status,
        lastChecked: new Date().toISOString(),
        metrics: {
          totalGB: Math.round(totalBytes / 1024 / 1024 / 1024),
          usedGB: Math.round(usedBytes / 1024 / 1024 / 1024),
          freeGB: Math.round(freeBytes / 1024 / 1024 / 1024),
          usagePercent: Math.round(usagePercent * 100)
        }
      };
    } catch (error) {
      return {
        status: 'degraded',
        lastChecked: new Date().toISOString(),
        error: 'Disk metrics unavailable'
      };
    }
  }

  /**
   * Get application metrics
   */
  private async getMetrics(): Promise<{
    activeConnections: number;
    gameCount: number;
    errorRate: number;
  }> {
    try {
      // Get active game count from database
      const gameCountResult = await this.databaseService.query(
        "SELECT COUNT(*) as count FROM games WHERE status = 'active'"
      );
      const gameCount = parseInt(gameCountResult.rows[0]?.count || '0');

      // Get error rate from last hour
      const errorRateResult = await this.databaseService.query(`
        SELECT 
          COUNT(CASE WHEN status_code >= 400 THEN 1 END)::float / COUNT(*) as error_rate
        FROM request_logs 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);
      const errorRate = parseFloat(errorRateResult.rows[0]?.error_rate || '0');

      return {
        activeConnections: await this.getActiveConnectionCount(),
        gameCount,
        errorRate
      };
    } catch (error) {
      return {
        activeConnections: 0,
        gameCount: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Check performance metrics against SLA targets
   */
  async checkPerformanceMetrics(): Promise<PerformanceMetrics & { slaCompliant: boolean }> {
    try {
      // Get P95 latency from last 5 minutes
      const latencyResult = await this.databaseService.query(`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency
        FROM request_logs 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);
      const p95Latency = parseFloat(latencyResult.rows[0]?.p95_latency || '0');

      // Get P95 cost from last 5 minutes
      const costResult = await this.databaseService.query(`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY cost_lamports) as p95_cost
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);
      const p95Cost = parseFloat(costResult.rows[0]?.p95_cost || '0');

      // Get success rate from last 5 minutes
      const successRateResult = await this.databaseService.query(`
        SELECT 
          COUNT(CASE WHEN status_code < 400 THEN 1 END)::float / COUNT(*) as success_rate
        FROM request_logs 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);
      const successRate = parseFloat(successRateResult.rows[0]?.success_rate || '1');

      // Get VRF latency from last 5 minutes
      const vrfLatencyResult = await this.databaseService.query(`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) as vrf_latency
        FROM vrf_requests 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);
      const vrfLatency = parseFloat(vrfLatencyResult.rows[0]?.vrf_latency || '0');

      // Check SLA compliance
      const slaCompliant = (
        p95Latency <= this.PERFORMANCE_TARGETS.maxLatencyMs &&
        p95Cost <= this.PERFORMANCE_TARGETS.maxCostLamports &&
        successRate >= this.PERFORMANCE_TARGETS.minSuccessRate &&
        vrfLatency <= this.PERFORMANCE_TARGETS.maxVrfLatencyMs
      );

      return {
        p95Latency,
        p95Cost,
        successRate,
        vrfLatency,
        slaCompliant
      };
    } catch (error) {
      return {
        p95Latency: 0,
        p95Cost: 0,
        successRate: 0,
        vrfLatency: 0,
        slaCompliant: false
      };
    }
  }

  /**
   * Get cost metrics for monitoring
   */
  async getCostMetrics(): Promise<{
    p95Cost: number;
    hourlyBurn: number;
    dailyBurn: number;
    threshold: number;
    withinBudget: boolean;
  }> {
    try {
      // Get P95 cost from last hour
      const p95Result = await this.databaseService.query(`
        SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY cost_lamports) as p95_cost
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);
      const p95Cost = parseFloat(p95Result.rows[0]?.p95_cost || '0');

      // Get hourly burn rate
      const hourlyResult = await this.databaseService.query(`
        SELECT SUM(cost_lamports) as hourly_burn
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);
      const hourlyBurn = parseFloat(hourlyResult.rows[0]?.hourly_burn || '0');

      // Get daily burn rate
      const dailyResult = await this.databaseService.query(`
        SELECT SUM(cost_lamports) as daily_burn
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
      const dailyBurn = parseFloat(dailyResult.rows[0]?.daily_burn || '0');

      const threshold = this.PERFORMANCE_TARGETS.maxCostLamports;
      const withinBudget = p95Cost <= threshold;

      return {
        p95Cost,
        hourlyBurn,
        dailyBurn,
        threshold,
        withinBudget
      };
    } catch (error) {
      return {
        p95Cost: 0,
        hourlyBurn: 0,
        dailyBurn: 0,
        threshold: this.PERFORMANCE_TARGETS.maxCostLamports,
        withinBudget: true
      };
    }
  }

  /**
   * Helper methods
   */
  private async getDatabaseMetrics(): Promise<Record<string, any>> {
    try {
      const result = await this.databaseService.query(`
        SELECT 
          numbackends as active_connections,
          xact_commit as transactions_committed,
          xact_rollback as transactions_rolled_back,
          tup_returned as tuples_returned,
          tup_fetched as tuples_fetched,
          tup_inserted as tuples_inserted,
          tup_updated as tuples_updated,
          tup_deleted as tuples_deleted
        FROM pg_stat_database 
        WHERE datname = current_database()
      `);
      
      return result.rows[0] || {};
    } catch {
      return {};
    }
  }

  private async getRedisMetrics(): Promise<Record<string, any>> {
    try {
      const info = await this.redisService.info();
      const lines = info.split('\r\n');
      const metrics: Record<string, any> = {};

      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          if (key && value) {
            const numValue = parseFloat(value);
            metrics[key] = isNaN(numValue) ? value : numValue;
          }
        }
      });

      return metrics;
    } catch {
      return {};
    }
  }

  private async getActiveConnectionCount(): Promise<number> {
    try {
      // This would need to be implemented based on your WebSocket/connection tracking
      // For now, return a mock value
      return 0;
    } catch {
      return 0;
    }
  }
}