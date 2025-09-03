/**
 * Strategic Duel Performance Optimization Suite
 * Comprehensive performance optimization system for 10-50ms gameplay
 */

export { NetworkOptimizer, networkOptimizer } from './network-optimizer';
export { StateCache, stateCache } from './state-cache';
export { RenderScheduler, renderScheduler } from './render-scheduler';
export { LatencyCompensator, latencyCompensator } from './latency-compensator';
export { MemoryManager, memoryManager } from './memory-manager';

export type {
  NetworkMessage,
  ConnectionPoolOptions,
  NetworkMetrics
} from './network-optimizer';

export type {
  CacheEntry,
  CacheMetrics,
  StateCacheOptions
} from './state-cache';

export type {
  RenderTask,
  FrameBudget,
  RenderMetrics,
  RenderSchedulerOptions
} from './render-scheduler';

export type {
  GameState,
  PlayerState,
  InputCommand,
  PredictionResult,
  CompensationOptions
} from './latency-compensator';

export type {
  MemoryPool,
  MemoryMetrics,
  MemoryManagerOptions
} from './memory-manager';

/**
 * Initialize and configure all performance optimization systems
 */
export class PerformanceOptimizationSuite {
  private initialized = false;

  /**
   * Initialize all optimization systems with coordinated configuration
   */
  async initialize(config: {
    targetLatency?: number;
    targetFPS?: number;
    memoryLimit?: number;
    networkOptimization?: boolean;
    enablePrediction?: boolean;
  } = {}) {
    if (this.initialized) return;

    const {
      targetLatency = 30, // 30ms target latency
      targetFPS = 60,
      memoryLimit = 256 * 1024 * 1024, // 256MB
      networkOptimization = true,
      enablePrediction = true
    } = config;

    // Start network optimizer
    if (networkOptimization) {
      await networkOptimizer.connect('ws://localhost:8080', 'primary');
    }

    // Configure render scheduler for target FPS
    renderScheduler.start();

    // Enable latency compensation
    if (enablePrediction) {
      latencyCompensator.setEnabled(true);
    }

    // Configure memory management
    memoryManager.setEnabled(true);

    // Start performance monitoring
    // (performance tracker would be started separately)

    this.initialized = true;
  }

  /**
   * Get comprehensive performance status
   */
  getPerformanceStatus() {
    return {
      network: networkOptimizer.getMetrics(),
      cache: stateCache.getMetrics(),
      rendering: renderScheduler.getMetrics(),
      latency: latencyCompensator.getCompensationStats(),
      memory: memoryManager.getMemoryMetrics()
    };
  }

  /**
   * Optimize all systems based on current performance
   */
  optimizePerformance() {
    // Optimize network settings
    networkOptimizer.optimizeSettings();

    // Optimize cache performance
    stateCache.optimizePerformance();

    // Optimize render scheduler
    renderScheduler.optimizeSettings();

    // Optimize memory usage
    memoryManager.optimizeMemoryUsage();

    // Update latency compensation based on current latency
    const networkMetrics = networkOptimizer.getMetrics();
    latencyCompensator.updateLatency(networkMetrics.latency);
    latencyCompensator.optimizeSettings(networkMetrics.latency, 60);
  }

  /**
   * Shutdown all optimization systems
   */
  shutdown() {
    if (!this.initialized) return;

    networkOptimizer.disconnect();
    renderScheduler.stop();
    latencyCompensator.reset();
    memoryManager.destroy();

    this.initialized = false;
  }
}

// Export singleton optimization suite
export const optimizationSuite = new PerformanceOptimizationSuite();