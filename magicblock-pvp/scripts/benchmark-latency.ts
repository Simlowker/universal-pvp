#!/usr/bin/env tsx

import { Connection, PublicKey } from '@solana/web3.js';
import { performance } from 'perf_hooks';

interface LatencyMetrics {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
  metadata?: {
    vrfSeed?: string;
    rollupBatch?: number;
    l1ConfirmationTime?: number;
    websocketLatency?: number;
    databaseQueryTime?: number;
  };
}

interface BenchmarkConfig {
  iterations: number;
  warmupRounds: number;
  concurrent?: boolean;
  maxConcurrency?: number;
  vrfTarget?: number;     // <10ms target
  rollupTarget?: number;  // <5s target
  l1Target?: number;      // <30s target
  websocketTarget?: number; // <100ms target
  dbTarget?: number;      // <50ms target
}

class LatencyBenchmark {
  private connection: Connection;
  private metrics: LatencyMetrics[] = [];
  private config: BenchmarkConfig;

  constructor(
    rpcUrl: string = 'https://api.devnet.solana.com',
    config: Partial<BenchmarkConfig> = {}
  ) {
    this.connection = new Connection(rpcUrl);
    this.config = {
      iterations: 100,
      warmupRounds: 10,
      concurrent: false,
      maxConcurrency: 10,
      vrfTarget: 10,
      rollupTarget: 5000,
      l1Target: 30000,
      websocketTarget: 100,
      dbTarget: 50,
      ...config
    };
  }

  async benchmarkOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<void> {
    console.log(`\nBenchmarking: ${operationName}`);
    console.log(`Iterations: ${this.config.iterations}, Warmup: ${this.config.warmupRounds}`);

    // Warmup rounds
    console.log('Warming up...');
    for (let i = 0; i < this.config.warmupRounds; i++) {
      try {
        await operation();
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Actual benchmark
    console.log('Running benchmark...');
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.config.iterations; i++) {
      const benchmarkRun = async () => {
        const startTime = performance.now();
        let success = true;
        let error: string | undefined;

        try {
          await operation();
        } catch (err) {
          success = false;
          error = err instanceof Error ? err.message : String(err);
        }

        const duration = performance.now() - startTime;
        
        this.metrics.push({
          operation: operationName,
          duration,
          timestamp: Date.now(),
          success,
          error
        });
      };

      if (this.config.concurrent) {
        promises.push(benchmarkRun());
        
        if (promises.length >= (this.config.maxConcurrency || 10)) {
          await Promise.all(promises);
          promises.length = 0;
        }
      } else {
        await benchmarkRun();
        
        if (i % 10 === 0) {
          process.stdout.write(`\rProgress: ${i}/${this.config.iterations}`);
        }
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    console.log(`\rCompleted: ${this.config.iterations}/${this.config.iterations}`);
  }

  async benchmarkRPCOperations(): Promise<void> {
    console.log('\n🔗 Benchmarking Basic RPC Operations');
    
    // Benchmark basic RPC calls
    await this.benchmarkOperation('getVersion', async () => {
      await this.connection.getVersion();
    });

    await this.benchmarkOperation('getSlot', async () => {
      await this.connection.getSlot();
    });

    await this.benchmarkOperation('getRecentBlockhash', async () => {
      await this.connection.getRecentBlockhash();
    });

    // Benchmark account fetching
    const systemProgram = new PublicKey('11111111111111111111111111111111');
    await this.benchmarkOperation('getAccountInfo', async () => {
      await this.connection.getAccountInfo(systemProgram);
    });

    await this.benchmarkOperation('getBalance', async () => {
      await this.connection.getBalance(systemProgram);
    });
  }

  async benchmarkVRFGeneration(): Promise<void> {
    console.log('\n🎲 Benchmarking VRF Generation (<10ms target)');
    
    await this.benchmarkOperation('vrf_seed_generation', async () => {
      // Simulate VRF seed generation
      const seed = Math.random().toString(36).substring(2, 15);
      await new Promise(resolve => setTimeout(resolve, Math.random() * 15)); // 0-15ms random
      return seed;
    });
    
    await this.benchmarkOperation('vrf_proof_creation', async () => {
      // Simulate VRF proof creation
      const proof = crypto.randomBytes(64).toString('hex');
      await new Promise(resolve => setTimeout(resolve, Math.random() * 12)); // 0-12ms random
      return proof;
    });
    
    await this.benchmarkOperation('vrf_verification', async () => {
      // Simulate VRF verification
      const isValid = Math.random() > 0.01; // 99% success rate
      await new Promise(resolve => setTimeout(resolve, Math.random() * 8)); // 0-8ms random
      if (!isValid) throw new Error('VRF verification failed');
      return true;
    });
  }

  async benchmarkRollupSettlement(): Promise<void> {
    console.log('\n⚡ Benchmarking Rollup Settlement (<5s target)');
    
    await this.benchmarkOperation('rollup_batch_creation', async () => {
      // Simulate batch creation
      const batchSize = Math.floor(Math.random() * 50) + 10; // 10-60 transactions
      await new Promise(resolve => setTimeout(resolve, batchSize * 10)); // ~10ms per tx
      return batchSize;
    });
    
    await this.benchmarkOperation('rollup_state_update', async () => {
      // Simulate state update computation
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500)); // 0.5-1.5s
      return 'state_updated';
    });
    
    await this.benchmarkOperation('rollup_proof_generation', async () => {
      // Simulate proof generation
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000)); // 1-3s
      return 'proof_generated';
    });
    
    await this.benchmarkOperation('rollup_submission', async () => {
      // Simulate L1 submission
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1500 + 500)); // 0.5-2s
      return 'submitted_to_l1';
    });
  }

  async benchmarkL1Confirmation(): Promise<void> {
    console.log('\n🔍 Benchmarking L1 Confirmation (<30s target)');
    
    await this.benchmarkOperation('l1_transaction_submission', async () => {
      // Simulate L1 transaction submission
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000)); // 1-3s
      return 'tx_submitted';
    });
    
    await this.benchmarkOperation('l1_mempool_waiting', async () => {
      // Simulate mempool waiting time
      const waitTime = Math.random() * 15000 + 5000; // 5-20s
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return waitTime;
    });
    
    await this.benchmarkOperation('l1_block_inclusion', async () => {
      // Simulate block inclusion
      const blockTime = Math.random() * 10000 + 5000; // 5-15s
      await new Promise(resolve => setTimeout(resolve, blockTime));
      return blockTime;
    });
    
    await this.benchmarkOperation('l1_confirmation_check', async () => {
      // Simulate confirmation checking
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500)); // 0.5-1.5s
      const confirmations = Math.floor(Math.random() * 5) + 1; // 1-6 confirmations
      return confirmations;
    });
  }

  async benchmarkWebSocketLatency(): Promise<void> {
    console.log('\n🌐 Benchmarking WebSocket Latency (<100ms target)');
    
    await this.benchmarkOperation('websocket_message_send', async () => {
      // Simulate WebSocket message sending
      const startTime = performance.now();
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10)); // 10-60ms
      return performance.now() - startTime;
    });
    
    await this.benchmarkOperation('websocket_round_trip', async () => {
      // Simulate round-trip time
      const startTime = performance.now();
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 20)); // 20-120ms
      return performance.now() - startTime;
    });
    
    await this.benchmarkOperation('websocket_broadcast', async () => {
      // Simulate broadcasting to multiple clients
      const clientCount = Math.floor(Math.random() * 10) + 1; // 1-10 clients
      await new Promise(resolve => setTimeout(resolve, clientCount * 5)); // ~5ms per client
      return clientCount;
    });
  }

  async benchmarkDatabasePerformance(): Promise<void> {
    console.log('\n🗄️ Benchmarking Database Performance (<50ms target)');
    
    await this.benchmarkOperation('db_game_state_read', async () => {
      // Simulate game state read
      await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 5)); // 5-35ms
      return 'game_state';
    });
    
    await this.benchmarkOperation('db_game_state_write', async () => {
      // Simulate game state write
      await new Promise(resolve => setTimeout(resolve, Math.random() * 40 + 10)); // 10-50ms
      return 'state_updated';
    });
    
    await this.benchmarkOperation('db_player_stats_query', async () => {
      // Simulate player statistics query
      await new Promise(resolve => setTimeout(resolve, Math.random() * 25 + 5)); // 5-30ms
      return 'player_stats';
    });
    
    await this.benchmarkOperation('db_leaderboard_update', async () => {
      // Simulate leaderboard update
      await new Promise(resolve => setTimeout(resolve, Math.random() * 60 + 20)); // 20-80ms
      return 'leaderboard_updated';
    });
    
    await this.benchmarkOperation('db_transaction_log', async () => {
      // Simulate transaction logging
      await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 2)); // 2-22ms
      return 'logged';
    });
  }

  async runComprehensiveBenchmark(): Promise<void> {
    console.log('🚀 Running Comprehensive Latency Benchmark');
    console.log('==========================================');
    
    try {
      await this.benchmarkRPCOperations();
      await this.benchmarkVRFGeneration();
      await this.benchmarkRollupSettlement();
      await this.benchmarkL1Confirmation();
      await this.benchmarkWebSocketLatency();
      await this.benchmarkDatabasePerformance();
    } catch (error) {
      console.error('Benchmark failed:', error);
      throw error;
    }
  }

  generateReport(): void {
    if (this.metrics.length === 0) {
      console.log('No metrics collected');
      return;
    }

    console.log('\n📊 COMPREHENSIVE LATENCY REPORT');
    console.log('================================\n');

    const operationStats = this.groupMetricsByOperation();
    const targetChecks = this.checkTargetCompliance(operationStats);

    Object.entries(operationStats).forEach(([operation, metrics]) => {
      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const successCount = metrics.filter(m => m.success).length;
      const errorCount = metrics.length - successCount;
      const successRate = (successCount / metrics.length) * 100;
      
      const stats = this.calculateStatistics(durations);
      const target = this.getTargetForOperation(operation);
      const meetsTarget = target ? stats.p95 <= target : true;
      
      console.log(`${operation}:`);
      console.log(`  Requests: ${metrics.length} (${successCount} success, ${errorCount} errors)`);
      console.log(`  Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`  Average: ${stats.mean.toFixed(2)}ms`);
      console.log(`  Median: ${stats.median.toFixed(2)}ms`);
      console.log(`  Min/Max: ${stats.min.toFixed(2)}ms / ${stats.max.toFixed(2)}ms`);
      console.log(`  P95/P99: ${stats.p95.toFixed(2)}ms / ${stats.p99.toFixed(2)}ms`);
      console.log(`  Std Dev: ${stats.stdDev.toFixed(2)}ms`);
      
      if (target) {
        const status = meetsTarget ? '✅ PASS' : '❌ FAIL';
        console.log(`  Target: <${target}ms - ${status}`);
      }
      
      if (errorCount > 0) {
        const errorTypes = metrics
          .filter(m => !m.success)
          .reduce((acc, m) => {
            acc[m.error || 'Unknown'] = (acc[m.error || 'Unknown'] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        
        console.log(`  Errors: ${Object.entries(errorTypes).map(([err, count]) => `${err}(${count})`).join(', ')}`);
      }
      
      console.log('');
    });

    this.printTargetSummary(targetChecks);
    this.printOverallStats();
    this.generatePerformanceRecommendations(operationStats);
  }

  private getTargetForOperation(operation: string): number | null {
    if (operation.includes('vrf')) return this.config.vrfTarget;
    if (operation.includes('rollup')) return this.config.rollupTarget;
    if (operation.includes('l1')) return this.config.l1Target;
    if (operation.includes('websocket')) return this.config.websocketTarget;
    if (operation.includes('db')) return this.config.dbTarget;
    return null;
  }

  private checkTargetCompliance(operationStats: Record<string, LatencyMetrics[]>) {
    const checks: Record<string, { target: number; actual: number; passes: boolean }> = {};
    
    Object.entries(operationStats).forEach(([operation, metrics]) => {
      const target = this.getTargetForOperation(operation);
      if (target) {
        const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
        const p95 = durations[Math.floor(durations.length * 0.95)];
        checks[operation] = {
          target,
          actual: p95,
          passes: p95 <= target
        };
      }
    });
    
    return checks;
  }

  private printTargetSummary(targetChecks: Record<string, any>): void {
    console.log('🎯 TARGET COMPLIANCE SUMMARY');
    console.log('============================');
    
    const totalTargets = Object.keys(targetChecks).length;
    const passingTargets = Object.values(targetChecks).filter(c => c.passes).length;
    const passingPercentage = (passingTargets / totalTargets) * 100;
    
    console.log(`Overall: ${passingTargets}/${totalTargets} targets met (${passingPercentage.toFixed(1)}%)\n`);
    
    Object.entries(targetChecks).forEach(([operation, check]) => {
      const status = check.passes ? '✅' : '❌';
      const diff = check.actual - check.target;
      const diffStr = diff > 0 ? `+${diff.toFixed(2)}ms` : `${diff.toFixed(2)}ms`;
      console.log(`${status} ${operation}: ${check.actual.toFixed(2)}ms (target: ${check.target}ms, diff: ${diffStr})`);
    });
    
    console.log('');
  }

  private generatePerformanceRecommendations(operationStats: Record<string, LatencyMetrics[]>): void {
    console.log('💡 PERFORMANCE RECOMMENDATIONS');
    console.log('==============================');
    
    const recommendations: string[] = [];
    
    Object.entries(operationStats).forEach(([operation, metrics]) => {
      const durations = metrics.map(m => m.duration);
      const stats = this.calculateStatistics(durations);
      const target = this.getTargetForOperation(operation);
      
      if (target && stats.p95 > target) {
        if (operation.includes('vrf')) {
          recommendations.push('🎲 VRF: Consider using hardware acceleration or optimized cryptographic libraries');
        } else if (operation.includes('rollup')) {
          recommendations.push('⚡ Rollup: Optimize batch sizes and implement parallel proof generation');
        } else if (operation.includes('l1')) {
          recommendations.push('🔍 L1: Implement priority fee optimization and transaction batching');
        } else if (operation.includes('websocket')) {
          recommendations.push('🌐 WebSocket: Optimize message serialization and connection pooling');
        } else if (operation.includes('db')) {
          recommendations.push('🗄️ Database: Add indexing, implement query optimization, or use caching');
        }
      }
      
      if (stats.stdDev > stats.mean * 0.5) {
        recommendations.push(`📊 ${operation}: High variability detected - investigate inconsistent performance`);
      }
    });
    
    if (recommendations.length === 0) {
      console.log('🎉 All performance targets are being met! No immediate optimizations needed.');
    } else {
      recommendations.forEach(rec => console.log(rec));
    }
    
    console.log('');
  }

  private groupMetricsByOperation(): Record<string, LatencyMetrics[]> {
    return this.metrics.reduce((acc, metric) => {
      if (!acc[metric.operation]) {
        acc[metric.operation] = [];
      }
      acc[metric.operation].push(metric);
      return acc;
    }, {} as Record<string, LatencyMetrics[]>);
  }

  private calculateStatistics(durations: number[]) {
    const sorted = durations.sort((a, b) => a - b);
    const mean = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    const variance = sorted.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    return { mean, median, min, max, p95, p99, stdDev };
  }

  private printOverallStats(): void {
    const allDurations = this.metrics.map(m => m.duration);
    const overallStats = this.calculateStatistics(allDurations);
    const successRate = (this.metrics.filter(m => m.success).length / this.metrics.length) * 100;

    console.log('OVERALL STATISTICS:');
    console.log(`  Total Requests: ${this.metrics.length}`);
    console.log(`  Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`  Average Latency: ${overallStats.mean.toFixed(2)}ms`);
    console.log(`  P95 Latency: ${overallStats.p95.toFixed(2)}ms`);
    console.log(`  P99 Latency: ${overallStats.p99.toFixed(2)}ms`);
  }

  exportMetrics(filename?: string): void {
    const data = {
      config: this.config,
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      summary: this.generateSummary()
    };
    
    const filepath = filename || `latency-benchmark-${Date.now()}.json`;
    require('fs').writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`\nBenchmark results exported to ${filepath}`);
  }

  private generateSummary() {
    const allDurations = this.metrics.map(m => m.duration);
    const stats = this.calculateStatistics(allDurations);
    const successRate = (this.metrics.filter(m => m.success).length / this.metrics.length) * 100;

    return {
      totalRequests: this.metrics.length,
      successRate,
      ...stats
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

// CLI execution with enhanced features
async function main() {
  const args = process.argv.slice(2);
  const rpcUrl = args[0] || 'https://api.devnet.solana.com';
  const iterations = parseInt(args[1]) || 50;
  const concurrent = args.includes('--concurrent');
  const comprehensive = args.includes('--comprehensive');
  
  console.log('⚡ Solana PvP Duel Latency Benchmark System');
  console.log('==========================================');
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Mode: ${comprehensive ? 'Comprehensive' : 'Basic'}`);
  console.log(`Execution: ${concurrent ? 'Concurrent' : 'Sequential'}`);
  console.log();
  
  console.log('🎯 Performance Targets:');
  console.log('  VRF Generation: <10ms');
  console.log('  Rollup Settlement: <5s');
  console.log('  L1 Confirmation: <30s');
  console.log('  WebSocket Latency: <100ms');
  console.log('  Database Queries: <50ms');
  console.log();

  const benchmark = new LatencyBenchmark(rpcUrl, {
    iterations,
    concurrent,
    warmupRounds: Math.min(10, Math.floor(iterations / 10))
  });

  try {
    if (comprehensive) {
      await benchmark.runComprehensiveBenchmark();
    } else {
      await benchmark.benchmarkRPCOperations();
    }
    
    benchmark.generateReport();
    benchmark.exportMetrics();
    
    console.log('\n✅ Benchmark completed successfully!');
    console.log('📁 Results exported to latency-benchmark-*.json');
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { LatencyBenchmark, LatencyMetrics, BenchmarkConfig };