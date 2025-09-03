/**
 * Stress Tests for 1000 Concurrent Battles
 * Performance and reliability testing under extreme load
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { performance } from 'perf_hooks';
import { Connection, Keypair } from '@solana/web3.js';
import { EphemeralRollupSDK } from '@magicblock-labs/ephemeral-rollups-sdk';
import { SessionKeyManager } from '@magicblock-labs/session-keys';
import { BoltSDK } from '@magicblock-labs/bolt-sdk';

// Import stress testing utilities
import { LoadBalancer } from '../../src/performance/load_balancer';
import { MetricsCollector } from '../../src/performance/metrics_collector';
import { ResourceMonitor } from '../../src/performance/resource_monitor';
import { StressTestManager } from '../../src/performance/stress_test_manager';

describe('1000 Concurrent Battles Stress Test', () => {
  let connection: Connection;
  let erSDK: EphemeralRollupSDK;
  let boltSDK: BoltSDK;
  let sessionKeyManager: SessionKeyManager;
  let loadBalancer: LoadBalancer;
  let metricsCollector: MetricsCollector;
  let resourceMonitor: ResourceMonitor;
  let stressTestManager: StressTestManager;

  beforeAll(async () => {
    // Initialize high-performance test environment
    connection = new Connection('http://localhost:8899', 'confirmed');

    // Configure ER SDK for high load
    erSDK = new EphemeralRollupSDK({
      connection,
      commitment: 'confirmed',
      maxRetries: 1,
      retryDelay: 2,
      batchSize: 100, // Larger batches for efficiency
      flushInterval: 5, // Aggressive flushing
      compressionEnabled: true,
      priorityFees: true,
      connectionPoolSize: 50, // Large connection pool
    });

    boltSDK = new BoltSDK({
      connection,
      erSDK,
      worldPoolSize: 10, // Multiple world instances
      componentCacheSize: 10000,
      systemCacheSize: 1000,
    });

    sessionKeyManager = new SessionKeyManager({
      connection,
      erSDK,
      keyPoolSize: 1000, // Pre-allocate session keys
      batchKeyCreation: true,
      cacheTimeout: 7200, // 2 hour cache
    });

    loadBalancer = new LoadBalancer({
      maxConcurrentOperations: 1000,
      queueSize: 5000,
      priorityLevels: 3,
      adaptiveThrottling: true,
    });

    metricsCollector = new MetricsCollector({
      sampleInterval: 100, // 100ms samples
      retentionPeriod: 300000, // 5 minutes
      aggregationWindow: 1000, // 1 second aggregation
      memoryOptimized: true,
    });

    resourceMonitor = new ResourceMonitor({
      cpuThreshold: 90, // 90% CPU warning
      memoryThreshold: 85, // 85% memory warning
      latencyThreshold: 100, // 100ms latency warning
      alertCallback: (alert) => console.warn('Resource Alert:', alert),
    });

    stressTestManager = new StressTestManager({
      erSDK,
      boltSDK,
      sessionKeyManager,
      loadBalancer,
      metricsCollector,
      resourceMonitor,
    });

    // Initialize all systems
    await erSDK.initialize();
    await boltSDK.initialize();
    await sessionKeyManager.initialize();
    await loadBalancer.initialize();
    await metricsCollector.initialize();
    await resourceMonitor.start();
    await stressTestManager.initialize();

    // Pre-warm the system
    await stressTestManager.preWarmSystem();
  });

  afterAll(async () => {
    await stressTestManager.shutdown();
    await resourceMonitor.stop();
    await metricsCollector.shutdown();
    await loadBalancer.shutdown();
    await sessionKeyManager.cleanup();
    await boltSDK.shutdown();
    await erSDK.shutdown();
  });

  describe('Concurrent Battle Stress Tests', () => {
    test('should handle 1000 concurrent simple battles', async () => {
      const startTime = performance.now();
      const concurrentBattles = 1000;
      
      console.log(`Starting ${concurrentBattles} concurrent battles stress test...`);

      // Pre-generate battle configurations
      const battleConfigs = [];
      for (let i = 0; i < concurrentBattles; i++) {
        battleConfigs.push({
          battleId: `stress_battle_${i}`,
          battleType: 'quick_1v1',
          player1: {
            id: `player_${i * 2}`,
            level: 10 + (i % 20),
            class: ['warrior', 'mage', 'archer', 'rogue'][i % 4],
            stats: {
              attack: 30 + (i % 30),
              defense: 25 + (i % 25),
              speed: 20 + (i % 40),
              health: 100,
              mana: 50,
            },
          },
          player2: {
            id: `player_${i * 2 + 1}`,
            level: 10 + ((i + 1) % 20),
            class: ['warrior', 'mage', 'archer', 'rogue'][(i + 1) % 4],
            stats: {
              attack: 30 + ((i + 1) % 30),
              defense: 25 + ((i + 1) % 25),
              speed: 20 + ((i + 1) % 40),
              health: 100,
              mana: 50,
            },
          },
        });
      }

      // Execute concurrent battles using load balancer
      const battlePromises = battleConfigs.map(config => 
        loadBalancer.execute(() => stressTestManager.runSimpleBattle(config))
      );

      // Monitor system resources during execution
      const resourceSnapshot1 = await resourceMonitor.getSnapshot();
      console.log('Initial resources:', resourceSnapshot1);

      const results = await Promise.all(battlePromises);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Verify results
      expect(results.length).toBe(concurrentBattles);
      expect(results.every(r => r.success)).toBe(true);
      
      // Performance assertions
      expect(totalTime).toBeLessThan(120000); // Under 2 minutes
      
      const avgBattleTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
      expect(avgBattleTime).toBeLessThan(500); // Average battle under 500ms

      // Resource usage checks
      const resourceSnapshot2 = await resourceMonitor.getSnapshot();
      console.log('Final resources:', resourceSnapshot2);
      
      expect(resourceSnapshot2.cpuUsage).toBeLessThan(95); // CPU under 95%
      expect(resourceSnapshot2.memoryUsage).toBeLessThan(90); // Memory under 90%

      // Collect and analyze metrics
      const metrics = await metricsCollector.getComprehensiveMetrics();
      
      expect(metrics.throughput.battlesPerSecond).toBeGreaterThan(10);
      expect(metrics.latency.average).toBeLessThan(100);
      expect(metrics.latency.p99).toBeLessThan(500);
      expect(metrics.errorRate).toBeLessThan(0.01); // Less than 1% errors

      console.log(`Stress test completed in ${totalTime.toFixed(2)}ms`);
      console.log(`Average battle time: ${avgBattleTime.toFixed(2)}ms`);
      console.log(`Throughput: ${metrics.throughput.battlesPerSecond.toFixed(2)} battles/sec`);
      console.log(`Error rate: ${(metrics.errorRate * 100).toFixed(3)}%`);
    });

    test('should maintain performance with mixed battle types under load', async () => {
      const startTime = performance.now();
      const totalBattles = 500;
      
      // Mix of battle types
      const battleTypes = [
        { type: 'quick_1v1', weight: 0.4, duration: 200 },      // 40% - quick battles
        { type: 'standard_1v1', weight: 0.3, duration: 800 },   // 30% - standard battles  
        { type: 'team_2v2', weight: 0.2, duration: 1500 },      // 20% - team battles
        { type: 'tournament_match', weight: 0.1, duration: 1200 }, // 10% - tournament matches
      ];

      const battleConfigs = [];
      for (let i = 0; i < totalBattles; i++) {
        const rand = Math.random();
        let cumulativeWeight = 0;
        let selectedType = battleTypes[0];

        for (const battleType of battleTypes) {
          cumulativeWeight += battleType.weight;
          if (rand <= cumulativeWeight) {
            selectedType = battleType;
            break;
          }
        }

        battleConfigs.push({
          battleId: `mixed_battle_${i}`,
          battleType: selectedType.type,
          expectedDuration: selectedType.duration,
          complexity: selectedType.type.includes('team') ? 'high' : 'medium',
        });
      }

      // Execute mixed battles with adaptive load balancing
      const battlePromises = battleConfigs.map(config => 
        loadBalancer.executeWithPriority(() => 
          stressTestManager.runMixedBattle(config),
          config.complexity === 'high' ? 'high' : 'medium'
        )
      );

      // Monitor performance in real-time
      const performanceMonitor = setInterval(async () => {
        const currentMetrics = await metricsCollector.getCurrentMetrics();
        const resources = await resourceMonitor.getSnapshot();
        
        console.log(`Active battles: ${currentMetrics.activeBattles}, ` +
                   `CPU: ${resources.cpuUsage.toFixed(1)}%, ` +
                   `Memory: ${resources.memoryUsage.toFixed(1)}%, ` +
                   `Avg Latency: ${currentMetrics.averageLatency.toFixed(2)}ms`);
        
        // Auto-throttle if resources are strained
        if (resources.cpuUsage > 85 || resources.memoryUsage > 80) {
          await loadBalancer.enableThrottling(0.7); // Reduce to 70% capacity
        }
      }, 5000);

      const results = await Promise.all(battlePromises);
      clearInterval(performanceMonitor);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Comprehensive result analysis
      const successfulResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);

      expect(successfulResults.length).toBeGreaterThan(totalBattles * 0.95); // 95%+ success rate
      expect(failedResults.length).toBeLessThan(totalBattles * 0.05); // Less than 5% failures

      // Performance by battle type
      const performanceByType = {};
      battleTypes.forEach(type => {
        const typeResults = successfulResults.filter(r => r.battleType === type.type);
        if (typeResults.length > 0) {
          performanceByType[type.type] = {
            count: typeResults.length,
            avgDuration: typeResults.reduce((sum, r) => sum + r.duration, 0) / typeResults.length,
            maxDuration: Math.max(...typeResults.map(r => r.duration)),
            successRate: typeResults.length / battleConfigs.filter(c => c.battleType === type.type).length,
          };
        }
      });

      // Verify each battle type meets performance requirements
      Object.entries(performanceByType).forEach(([type, stats]) => {
        console.log(`${type}: ${stats.count} battles, avg: ${stats.avgDuration.toFixed(2)}ms, success: ${(stats.successRate * 100).toFixed(1)}%`);
        
        expect(stats.successRate).toBeGreaterThan(0.9); // 90%+ success for each type
        expect(stats.avgDuration).toBeLessThan(stats.expectedDuration * 1.5); // Within 150% of expected
      });

      console.log(`Mixed battle stress test completed in ${totalTime.toFixed(2)}ms`);
    });

    test('should handle sustained load over extended period', async () => {
      const startTime = performance.now();
      const testDuration = 60000; // 1 minute sustained test
      const battlesPerWave = 50;
      const waveInterval = 5000; // 5 seconds between waves
      
      console.log('Starting sustained load test...');

      const allResults = [];
      const resourceSnapshots = [];
      let waveCount = 0;

      while (performance.now() - startTime < testDuration) {
        const waveStartTime = performance.now();
        waveCount++;

        console.log(`Wave ${waveCount}: Starting ${battlesPerWave} battles`);

        // Generate battle configurations for this wave
        const waveConfigs = [];
        for (let i = 0; i < battlesPerWave; i++) {
          waveConfigs.push({
            battleId: `sustained_${waveCount}_${i}`,
            battleType: 'quick_1v1',
            waveNumber: waveCount,
          });
        }

        // Execute wave of battles
        const wavePromises = waveConfigs.map(config =>
          loadBalancer.execute(() => stressTestManager.runQuickBattle(config))
        );

        const waveResults = await Promise.all(wavePromises);
        allResults.push(...waveResults);

        // Collect resource snapshot
        const resourceSnapshot = await resourceMonitor.getSnapshot();
        resourceSnapshots.push({
          wave: waveCount,
          timestamp: Date.now(),
          ...resourceSnapshot,
        });

        const waveTime = performance.now() - waveStartTime;
        console.log(`Wave ${waveCount} completed in ${waveTime.toFixed(2)}ms`);

        // Wait for next wave
        const waitTime = Math.max(0, waveInterval - waveTime);
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      const endTime = performance.now();
      const actualDuration = endTime - startTime;

      // Analyze sustained performance
      const totalBattles = allResults.length;
      const successfulBattles = allResults.filter(r => r.success).length;
      const failedBattles = totalBattles - successfulBattles;

      expect(totalBattles).toBeGreaterThan(500); // At least 500 battles executed
      expect(successfulBattles / totalBattles).toBeGreaterThan(0.95); // 95%+ success rate

      // Performance degradation analysis
      const earlyWaves = resourceSnapshots.slice(0, 3);
      const lateWaves = resourceSnapshots.slice(-3);

      const earlyAvgCPU = earlyWaves.reduce((sum, s) => sum + s.cpuUsage, 0) / earlyWaves.length;
      const lateAvgCPU = lateWaves.reduce((sum, s) => sum + s.cpuUsage, 0) / lateWaves.length;

      const earlyAvgMemory = earlyWaves.reduce((sum, s) => sum + s.memoryUsage, 0) / earlyWaves.length;
      const lateAvgMemory = lateWaves.reduce((sum, s) => sum + s.memoryUsage, 0) / lateWaves.length;

      // CPU should not increase by more than 20% over time
      expect(lateAvgCPU - earlyAvgCPU).toBeLessThan(20);
      
      // Memory should not increase by more than 15% (some growth is expected)
      expect(lateAvgMemory - earlyAvgMemory).toBeLessThan(15);

      // Throughput stability
      const throughputByWave = [];
      for (let i = 1; i <= waveCount; i++) {
        const waveBattles = allResults.filter(r => r.waveNumber === i);
        const waveSuccesses = waveBattles.filter(r => r.success).length;
        throughputByWave.push(waveSuccesses);
      }

      const avgThroughput = throughputByWave.reduce((sum, t) => sum + t, 0) / throughputByWave.length;
      const throughputVariance = throughputByWave.reduce((sum, t) => sum + Math.pow(t - avgThroughput, 2), 0) / throughputByWave.length;
      const throughputStdDev = Math.sqrt(throughputVariance);

      // Throughput should be consistent (low variance)
      expect(throughputStdDev / avgThroughput).toBeLessThan(0.2); // CV less than 20%

      console.log(`Sustained load test completed:`);
      console.log(`- Duration: ${actualDuration.toFixed(2)}ms`);
      console.log(`- Total battles: ${totalBattles}`);
      console.log(`- Success rate: ${(successfulBattles / totalBattles * 100).toFixed(2)}%`);
      console.log(`- Avg throughput: ${avgThroughput.toFixed(1)} battles/wave`);
      console.log(`- CPU change: ${(lateAvgCPU - earlyAvgCPU).toFixed(1)}%`);
      console.log(`- Memory change: ${(lateAvgMemory - earlyAvgMemory).toFixed(1)}%`);
    });
  });

  describe('Memory and Resource Management', () => {
    test('should prevent memory leaks under continuous load', async () => {
      const initialMemory = process.memoryUsage();
      console.log('Initial memory usage:', {
        rss: (initialMemory.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapUsed: (initialMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (initialMemory.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      });

      const testCycles = 10;
      const battlesPerCycle = 100;
      
      for (let cycle = 1; cycle <= testCycles; cycle++) {
        console.log(`Memory test cycle ${cycle}/${testCycles}`);
        
        // Create and execute battles
        const battleConfigs = Array(battlesPerCycle).fill(null).map((_, i) => ({
          battleId: `memory_test_${cycle}_${i}`,
          battleType: 'quick_1v1',
        }));

        const battlePromises = battleConfigs.map(config =>
          stressTestManager.runQuickBattle(config)
        );

        const results = await Promise.all(battlePromises);
        
        // Verify all battles succeeded
        expect(results.every(r => r.success)).toBe(true);

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        // Check memory usage
        const currentMemory = process.memoryUsage();
        const memoryGrowth = (currentMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
        
        console.log(`Cycle ${cycle} memory usage:`, {
          rss: (currentMemory.rss / 1024 / 1024).toFixed(2) + ' MB',
          heapUsed: (currentMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
          growth: memoryGrowth.toFixed(2) + ' MB',
        });

        // Memory growth should be bounded
        expect(memoryGrowth).toBeLessThan(100); // Less than 100MB growth
        
        // Allow brief pause between cycles
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const finalMemory = process.memoryUsage();
      const totalGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      console.log('Final memory usage:', {
        rss: (finalMemory.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapUsed: (finalMemory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        totalGrowth: totalGrowth.toFixed(2) + ' MB',
      });

      // Total memory growth should be reasonable after all cycles
      expect(totalGrowth).toBeLessThan(200); // Less than 200MB total growth
    });

    test('should handle resource contention gracefully', async () => {
      const startTime = performance.now();
      
      // Create resource-intensive scenario
      const heavyBattleConfigs = Array(200).fill(null).map((_, i) => ({
        battleId: `resource_heavy_${i}`,
        battleType: 'complex_battle',
        players: 4, // 2v2 battles
        duration: 2000, // 2 second battles
        complexity: 'maximum',
      }));

      // Execute with high concurrency
      const battlePromises = heavyBattleConfigs.map(config =>
        loadBalancer.executeWithPriority(() => 
          stressTestManager.runHeavyBattle(config),
          'high'
        )
      );

      // Monitor resource contention
      const resourceMonitoringInterval = setInterval(async () => {
        const resources = await resourceMonitor.getSnapshot();
        console.log(`Resources: CPU ${resources.cpuUsage.toFixed(1)}%, Memory ${resources.memoryUsage.toFixed(1)}%, Active: ${resources.activeConnections}`);
        
        // System should auto-throttle under extreme load
        if (resources.cpuUsage > 90) {
          console.log('High CPU detected, system should be throttling...');
        }
      }, 2000);

      const results = await Promise.all(battlePromises);
      clearInterval(resourceMonitoringInterval);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Verify system handled resource contention
      const successfulBattles = results.filter(r => r.success).length;
      const failedBattles = results.length - successfulBattles;

      // System should maintain stability even under extreme load
      expect(successfulBattles).toBeGreaterThan(results.length * 0.8); // At least 80% success
      expect(totalTime).toBeLessThan(300000); // Complete within 5 minutes

      console.log(`Resource contention test completed:`);
      console.log(`- Duration: ${totalTime.toFixed(2)}ms`);
      console.log(`- Successful: ${successfulBattles}/${results.length} (${(successfulBattles/results.length*100).toFixed(1)}%)`);
      console.log(`- Failed: ${failedBattles} (${(failedBattles/results.length*100).toFixed(1)}%)`);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from network interruptions', async () => {
      const startTime = performance.now();
      const totalBattles = 200;
      const interruptionPoint = 100; // Interrupt after 100 battles

      console.log('Starting network interruption resilience test...');

      // Start first batch of battles
      const firstBatchConfigs = Array(interruptionPoint).fill(null).map((_, i) => ({
        battleId: `resilience_1_${i}`,
        battleType: 'standard_1v1',
      }));

      const firstBatchPromises = firstBatchConfigs.map(config =>
        stressTestManager.runBattle(config)
      );

      const firstBatchResults = await Promise.all(firstBatchPromises);

      // Simulate network interruption
      console.log('Simulating network interruption...');
      await stressTestManager.simulateNetworkInterruption(5000); // 5 second interruption

      console.log('Network recovered, continuing with second batch...');

      // Start second batch after network recovery
      const secondBatchConfigs = Array(totalBattles - interruptionPoint).fill(null).map((_, i) => ({
        battleId: `resilience_2_${i}`,
        battleType: 'standard_1v1',
      }));

      const secondBatchPromises = secondBatchConfigs.map(config =>
        stressTestManager.runBattle(config)
      );

      const secondBatchResults = await Promise.all(secondBatchPromises);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Verify resilience
      const allResults = [...firstBatchResults, ...secondBatchResults];
      const successfulBattles = allResults.filter(r => r.success).length;

      expect(firstBatchResults.every(r => r.success)).toBe(true); // First batch should succeed
      expect(successfulBattles).toBeGreaterThan(totalBattles * 0.9); // 90%+ overall success

      console.log(`Network interruption test completed in ${totalTime.toFixed(2)}ms`);
      console.log(`Success rate: ${(successfulBattles/totalBattles*100).toFixed(1)}%`);
    });

    test('should handle cascading failures gracefully', async () => {
      const startTime = performance.now();
      const battleCount = 300;

      // Create mix of stable and unstable battle configs
      const battleConfigs = Array(battleCount).fill(null).map((_, i) => ({
        battleId: `cascade_test_${i}`,
        battleType: 'standard_1v1',
        stability: i % 10 === 0 ? 'unstable' : 'stable', // 10% unstable
        failureChance: i % 10 === 0 ? 0.3 : 0.01, // 30% vs 1% failure rate
      }));

      // Enable cascade protection
      await stressTestManager.enableCascadeProtection(true);

      const battlePromises = battleConfigs.map(config =>
        stressTestManager.runBattleWithFailureSimulation(config)
      );

      const results = await Promise.all(battlePromises);

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Analyze failure patterns
      const stableResults = results.filter((r, i) => battleConfigs[i].stability === 'stable');
      const unstableResults = results.filter((r, i) => battleConfigs[i].stability === 'unstable');

      const stableSuccessRate = stableResults.filter(r => r.success).length / stableResults.length;
      const unstableSuccessRate = unstableResults.filter(r => r.success).length / unstableResults.length;

      // Cascade protection should maintain stable battle success rates
      expect(stableSuccessRate).toBeGreaterThan(0.95); // 95%+ success for stable battles
      expect(unstableSuccessRate).toBeGreaterThan(0.5); // Even unstable should have some success

      console.log(`Cascade failure test completed:`);
      console.log(`- Stable success rate: ${(stableSuccessRate*100).toFixed(1)}%`);
      console.log(`- Unstable success rate: ${(unstableSuccessRate*100).toFixed(1)}%`);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should achieve target throughput benchmarks', async () => {
      const benchmarkDuration = 30000; // 30 seconds
      const targetThroughput = 50; // 50 battles per second
      const startTime = performance.now();

      console.log(`Running ${benchmarkDuration/1000}s throughput benchmark (target: ${targetThroughput} battles/sec)`);

      let battleCount = 0;
      let completedBattles = 0;
      const benchmarkResults = [];

      // Continuous battle generation
      const battleGenerator = setInterval(() => {
        if (performance.now() - startTime < benchmarkDuration) {
          const batchSize = Math.min(10, targetThroughput); // Generate in small batches
          
          for (let i = 0; i < batchSize; i++) {
            battleCount++;
            const battleConfig = {
              battleId: `benchmark_${battleCount}`,
              battleType: 'optimized_quick',
            };

            loadBalancer.execute(() => stressTestManager.runOptimizedBattle(battleConfig))
              .then(result => {
                completedBattles++;
                benchmarkResults.push(result);
              })
              .catch(error => {
                completedBattles++;
                benchmarkResults.push({ success: false, error: error.message });
              });
          }
        } else {
          clearInterval(battleGenerator);
        }
      }, 1000 / (targetThroughput / 10)); // Adjust interval based on target

      // Wait for benchmark completion
      await new Promise(resolve => {
        const checkCompletion = setInterval(() => {
          if (performance.now() - startTime >= benchmarkDuration && 
              benchmarkResults.length === battleCount) {
            clearInterval(checkCompletion);
            resolve();
          }
        }, 100);
      });

      const endTime = performance.now();
      const actualDuration = (endTime - startTime) / 1000; // Convert to seconds

      // Calculate throughput metrics
      const successfulBattles = benchmarkResults.filter(r => r.success).length;
      const actualThroughput = successfulBattles / actualDuration;
      const avgBattleTime = benchmarkResults
        .filter(r => r.success && r.duration)
        .reduce((sum, r) => sum + r.duration, 0) / successfulBattles;

      // Benchmark assertions
      expect(actualThroughput).toBeGreaterThan(targetThroughput * 0.8); // At least 80% of target
      expect(successfulBattles / battleCount).toBeGreaterThan(0.95); // 95%+ success rate
      expect(avgBattleTime).toBeLessThan(200); // Average battle under 200ms

      console.log(`Throughput benchmark results:`);
      console.log(`- Target throughput: ${targetThroughput} battles/sec`);
      console.log(`- Actual throughput: ${actualThroughput.toFixed(2)} battles/sec`);
      console.log(`- Success rate: ${(successfulBattles/battleCount*100).toFixed(2)}%`);
      console.log(`- Average battle time: ${avgBattleTime.toFixed(2)}ms`);
    });

    test('should meet latency percentile requirements', async () => {
      const testBattles = 1000;
      const latencyRequirements = {
        p50: 50,  // 50ms
        p90: 100, // 100ms
        p95: 200, // 200ms
        p99: 500, // 500ms
      };

      console.log(`Running latency benchmark with ${testBattles} battles`);

      const battleConfigs = Array(testBattles).fill(null).map((_, i) => ({
        battleId: `latency_test_${i}`,
        battleType: 'quick_1v1',
        latencyTracking: true,
      }));

      const battlePromises = battleConfigs.map(config =>
        stressTestManager.runBattleWithLatencyTracking(config)
      );

      const results = await Promise.all(battlePromises);

      // Extract latency data
      const latencies = results
        .filter(r => r.success && r.latency)
        .map(r => r.latency)
        .sort((a, b) => a - b);

      // Calculate percentiles
      const percentiles = {
        p50: latencies[Math.floor(latencies.length * 0.50)],
        p90: latencies[Math.floor(latencies.length * 0.90)],
        p95: latencies[Math.floor(latencies.length * 0.95)],
        p99: latencies[Math.floor(latencies.length * 0.99)],
      };

      // Verify latency requirements
      Object.entries(latencyRequirements).forEach(([percentile, requirement]) => {
        expect(percentiles[percentile]).toBeLessThan(requirement);
        console.log(`${percentile.toUpperCase()}: ${percentiles[percentile]}ms (requirement: <${requirement}ms)`);
      });

      console.log(`Latency benchmark completed - all requirements met`);
    });
  });
});