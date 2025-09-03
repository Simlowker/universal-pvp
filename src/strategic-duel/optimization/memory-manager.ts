/**
 * Advanced Memory Manager for Strategic Duel
 * Optimizes garbage collection patterns and memory usage for 10-50ms performance
 */

import { EventEmitter } from 'events';

export interface MemoryPool<T> {
  name: string;
  create: () => T;
  reset: (item: T) => void;
  validate?: (item: T) => boolean;
  maxSize: number;
  currentSize: number;
  created: number;
  reused: number;
}

export interface MemoryMetrics {
  totalHeapSize: number;
  usedHeapSize: number;
  heapGrowthRate: number;
  gcFrequency: number;
  gcPauseTime: number;
  objectAllocationsPerSecond: number;
  poolUtilization: Record<string, number>;
  fragmentationIndex: number;
}

export interface GCOptimization {
  strategy: 'generational' | 'incremental' | 'concurrent';
  youngGenSize: number;
  oldGenThreshold: number;
  gcTriggerThreshold: number;
  idleGCEnabled: boolean;
  forceGCInterval: number;
}

export interface MemoryManagerOptions {
  enableObjectPooling: boolean;
  maxPoolSize: number;
  gcOptimization: GCOptimization;
  memoryThreshold: number;
  monitoringInterval: number;
  enablePreallocation: number;
  fragmentationThreshold: number;
}

/**
 * Object pool implementation for frequently created objects
 */
class ObjectPool<T> implements MemoryPool<T> {
  name: string;
  create: () => T;
  reset: (item: T) => void;
  validate?: (item: T) => boolean;
  maxSize: number;
  currentSize: number = 0;
  created: number = 0;
  reused: number = 0;

  private pool: T[] = [];
  private active: Set<T> = new Set();

  constructor(
    name: string,
    create: () => T,
    reset: (item: T) => void,
    maxSize: number = 1000,
    validate?: (item: T) => boolean
  ) {
    this.name = name;
    this.create = create;
    this.reset = reset;
    this.maxSize = maxSize;
    this.validate = validate;
  }

  /**
   * Get object from pool or create new one
   */
  acquire(): T {
    let item: T;

    if (this.pool.length > 0) {
      item = this.pool.pop()!;
      this.reused++;
    } else {
      item = this.create();
      this.created++;
      this.currentSize++;
    }

    this.active.add(item);
    return item;
  }

  /**
   * Return object to pool
   */
  release(item: T): boolean {
    if (!this.active.has(item)) {
      return false;
    }

    this.active.delete(item);

    // Validate item before returning to pool
    if (this.validate && !this.validate(item)) {
      this.currentSize--;
      return false;
    }

    // Reset item state
    this.reset(item);

    // Add back to pool if under max size
    if (this.pool.length < this.maxSize) {
      this.pool.push(item);
      return true;
    } else {
      // Pool is full, discard item
      this.currentSize--;
      return false;
    }
  }

  /**
   * Pre-allocate objects to reduce allocation during gameplay
   */
  preallocate(count: number): void {
    const actualCount = Math.min(count, this.maxSize);
    
    for (let i = this.pool.length; i < actualCount; i++) {
      const item = this.create();
      this.reset(item);
      this.pool.push(item);
      this.created++;
      this.currentSize++;
    }
  }

  /**
   * Clear all pooled objects
   */
  clear(): void {
    this.pool.length = 0;
    this.active.clear();
    this.currentSize = 0;
    this.created = 0;
    this.reused = 0;
  }

  /**
   * Get pool statistics
   */
  getStats(): any {
    return {
      name: this.name,
      poolSize: this.pool.length,
      activeObjects: this.active.size,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      created: this.created,
      reused: this.reused,
      reuseRate: this.created > 0 ? this.reused / this.created : 0,
      utilization: this.currentSize / this.maxSize
    };
  }
}

/**
 * Garbage collection optimizer
 */
class GCOptimizer {
  private options: GCOptimization;
  private gcStats: Array<{ timestamp: number; duration: number; type: string }> = [];
  private lastGCTime: number = 0;
  private forceGCTimer: NodeJS.Timeout | null = null;
  private performanceObserver: PerformanceObserver | null = null;

  constructor(options: GCOptimization) {
    this.options = options;
    this.setupGCMonitoring();
  }

  /**
   * Setup garbage collection monitoring
   */
  private setupGCMonitoring(): void {
    // Monitor GC events if available
    if ('PerformanceObserver' in globalThis) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure' && entry.name.includes('gc')) {
              this.recordGCEvent({
                timestamp: entry.startTime,
                duration: entry.duration,
                type: entry.name
              });
            }
          }
        });

        this.performanceObserver.observe({ entryTypes: ['measure'] });
      } catch (error) {
        console.warn('GC monitoring not available:', error);
      }
    }

    // Setup periodic forced GC if enabled
    if (this.options.idleGCEnabled && this.options.forceGCInterval > 0) {
      this.forceGCTimer = setInterval(() => {
        this.requestIdleGC();
      }, this.options.forceGCInterval);
    }
  }

  /**
   * Record garbage collection event
   */
  private recordGCEvent(event: { timestamp: number; duration: number; type: string }): void {
    this.gcStats.push(event);
    this.lastGCTime = Date.now();

    // Keep only recent GC stats
    const maxAge = 300000; // 5 minutes
    const cutoff = Date.now() - maxAge;
    this.gcStats = this.gcStats.filter(stat => stat.timestamp > cutoff);
  }

  /**
   * Request garbage collection during idle time
   */
  private requestIdleGC(): void {
    if ('requestIdleCallback' in globalThis) {
      requestIdleCallback(() => {
        this.performIdleGC();
      }, { timeout: 1000 });
    } else {
      // Fallback for environments without requestIdleCallback
      setTimeout(() => {
        this.performIdleGC();
      }, 0);
    }
  }

  /**
   * Perform idle garbage collection
   */
  private performIdleGC(): void {
    // Check if enough time has passed since last GC
    const timeSinceLastGC = Date.now() - this.lastGCTime;
    if (timeSinceLastGC < 10000) { // 10 seconds minimum
      return;
    }

    // Force GC if available
    if (typeof global !== 'undefined' && global.gc) {
      const gcStart = performance.now();
      global.gc();
      const gcDuration = performance.now() - gcStart;
      
      this.recordGCEvent({
        timestamp: gcStart,
        duration: gcDuration,
        type: 'forced-idle-gc'
      });
    } else if ('gc' in globalThis) {
      const gcStart = performance.now();
      (globalThis as any).gc();
      const gcDuration = performance.now() - gcStart;
      
      this.recordGCEvent({
        timestamp: gcStart,
        duration: gcDuration,
        type: 'forced-idle-gc'
      });
    }
  }

  /**
   * Optimize GC settings based on current performance
   */
  optimizeSettings(memoryMetrics: MemoryMetrics): void {
    const avgGCPause = this.getAverageGCPause();
    const gcFrequency = this.getGCFrequency();

    // Adjust GC trigger threshold based on pause times
    if (avgGCPause > 10) { // 10ms pause threshold
      this.options.gcTriggerThreshold *= 0.9; // Trigger GC earlier
    } else if (avgGCPause < 3) {
      this.options.gcTriggerThreshold *= 1.1; // Allow more memory usage
    }

    // Adjust force GC interval based on memory pressure
    if (memoryMetrics.heapGrowthRate > 1024 * 1024) { // 1MB/s growth
      this.options.forceGCInterval = Math.max(5000, this.options.forceGCInterval * 0.8);
    } else if (memoryMetrics.heapGrowthRate < 100 * 1024) { // 100KB/s growth
      this.options.forceGCInterval = Math.min(60000, this.options.forceGCInterval * 1.2);
    }
  }

  /**
   * Get average GC pause time
   */
  private getAverageGCPause(): number {
    if (this.gcStats.length === 0) return 0;
    
    const totalDuration = this.gcStats.reduce((sum, stat) => sum + stat.duration, 0);
    return totalDuration / this.gcStats.length;
  }

  /**
   * Get GC frequency (events per minute)
   */
  private getGCFrequency(): number {
    if (this.gcStats.length === 0) return 0;
    
    const timeSpan = Date.now() - this.gcStats[0].timestamp;
    const minutes = timeSpan / (1000 * 60);
    
    return minutes > 0 ? this.gcStats.length / minutes : 0;
  }

  /**
   * Get GC statistics
   */
  getGCStats(): any {
    return {
      averagePauseTime: this.getAverageGCPause(),
      frequency: this.getGCFrequency(),
      totalEvents: this.gcStats.length,
      lastGCTime: this.lastGCTime,
      options: this.options,
      recentEvents: this.gcStats.slice(-10)
    };
  }

  /**
   * Cleanup GC optimizer
   */
  cleanup(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    if (this.forceGCTimer) {
      clearInterval(this.forceGCTimer);
      this.forceGCTimer = null;
    }

    this.gcStats = [];
  }
}

/**
 * Memory usage monitor
 */
class MemoryMonitor {
  private metrics: MemoryMetrics;
  private previousMetrics: MemoryMetrics | null = null;
  private monitoringInterval: number;
  private monitoringTimer: NodeJS.Timeout | null = null;

  constructor(monitoringInterval: number = 5000) {
    this.monitoringInterval = monitoringInterval;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize memory metrics
   */
  private initializeMetrics(): MemoryMetrics {
    return {
      totalHeapSize: 0,
      usedHeapSize: 0,
      heapGrowthRate: 0,
      gcFrequency: 0,
      gcPauseTime: 0,
      objectAllocationsPerSecond: 0,
      poolUtilization: {},
      fragmentationIndex: 0
    };
  }

  /**
   * Start memory monitoring
   */
  start(): void {
    if (this.monitoringTimer) return;
    
    this.monitoringTimer = setInterval(() => {
      this.updateMetrics();
    }, this.monitoringInterval);

    // Initial metrics update
    this.updateMetrics();
  }

  /**
   * Stop memory monitoring
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Update memory metrics
   */
  private updateMetrics(): void {
    this.previousMetrics = { ...this.metrics };

    // Get memory usage if available
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.totalHeapSize = memory.totalJSHeapSize;
      this.metrics.usedHeapSize = memory.usedJSHeapSize;
    } else if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      this.metrics.totalHeapSize = memory.heapTotal;
      this.metrics.usedHeapSize = memory.heapUsed;
    }

    // Calculate heap growth rate
    if (this.previousMetrics) {
      const heapGrowth = this.metrics.usedHeapSize - this.previousMetrics.usedHeapSize;
      const timeInterval = this.monitoringInterval / 1000; // Convert to seconds
      this.metrics.heapGrowthRate = heapGrowth / timeInterval;
    }

    // Calculate fragmentation index
    this.metrics.fragmentationIndex = this.calculateFragmentation();
  }

  /**
   * Calculate memory fragmentation index
   */
  private calculateFragmentation(): number {
    if (this.metrics.totalHeapSize === 0) return 0;
    
    // Simple fragmentation estimate based on heap utilization
    const utilization = this.metrics.usedHeapSize / this.metrics.totalHeapSize;
    
    // Higher fragmentation when utilization is moderate (lots of gaps)
    // Lower fragmentation when utilization is very high or very low
    return 1 - Math.abs(utilization - 0.5) * 2;
  }

  /**
   * Update pool utilization metrics
   */
  updatePoolUtilization(poolStats: Record<string, any>): void {
    for (const [poolName, stats] of Object.entries(poolStats)) {
      this.metrics.poolUtilization[poolName] = stats.utilization || 0;
    }
  }

  /**
   * Get current memory metrics
   */
  getMetrics(): MemoryMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if memory usage is critical
   */
  isMemoryCritical(threshold: number): boolean {
    return this.metrics.usedHeapSize > threshold;
  }

  /**
   * Get memory pressure level (0-1)
   */
  getMemoryPressure(): number {
    if (this.metrics.totalHeapSize === 0) return 0;
    
    const utilization = this.metrics.usedHeapSize / this.metrics.totalHeapSize;
    const growthPressure = Math.min(1, Math.abs(this.metrics.heapGrowthRate) / (1024 * 1024)); // Normalize to 1MB/s
    const fragmentationPressure = this.metrics.fragmentationIndex;
    
    return Math.min(1, (utilization * 0.5 + growthPressure * 0.3 + fragmentationPressure * 0.2));
  }
}

/**
 * Main Memory Manager class
 */
export class MemoryManager extends EventEmitter {
  private objectPools: Map<string, ObjectPool<any>> = new Map();
  private gcOptimizer: GCOptimizer;
  private memoryMonitor: MemoryMonitor;
  private options: MemoryManagerOptions;
  private isEnabled: boolean = true;

  constructor(options: Partial<MemoryManagerOptions> = {}) {
    super();
    
    this.options = {
      enableObjectPooling: true,
      maxPoolSize: 1000,
      gcOptimization: {
        strategy: 'incremental',
        youngGenSize: 32 * 1024 * 1024, // 32MB
        oldGenThreshold: 64 * 1024 * 1024, // 64MB
        gcTriggerThreshold: 128 * 1024 * 1024, // 128MB
        idleGCEnabled: true,
        forceGCInterval: 30000 // 30 seconds
      },
      memoryThreshold: 256 * 1024 * 1024, // 256MB
      monitoringInterval: 5000,
      enablePreallocation: 100, // Pre-allocate 100 objects per pool
      fragmentationThreshold: 0.7,
      ...options
    };

    this.gcOptimizer = new GCOptimizer(this.options.gcOptimization);
    this.memoryMonitor = new MemoryMonitor(this.options.monitoringInterval);

    this.setupEventHandlers();
    this.createDefaultPools();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.memoryMonitor.start();
    
    // Monitor memory pressure
    setInterval(() => {
      if (!this.isEnabled) return;
      
      const metrics = this.memoryMonitor.getMetrics();
      const pressure = this.memoryMonitor.getMemoryPressure();
      
      if (pressure > 0.8) {
        this.emit('memory-pressure-high', { metrics, pressure });
        this.performEmergencyCleanup();
      } else if (pressure > 0.6) {
        this.emit('memory-pressure-medium', { metrics, pressure });
        this.performRoutineCleanup();
      }

      // Update pool utilization metrics
      const poolStats = this.getPoolStats();
      this.memoryMonitor.updatePoolUtilization(poolStats);

      // Optimize GC settings
      this.gcOptimizer.optimizeSettings(metrics);

    }, this.options.monitoringInterval);
  }

  /**
   * Create default object pools for common game objects
   */
  private createDefaultPools(): void {
    // Vector2D pool
    this.createPool('Vector2D', 
      () => ({ x: 0, y: 0 }),
      (v) => { v.x = 0; v.y = 0; },
      1000
    );

    // Game event pool
    this.createPool('GameEvent',
      () => ({ type: '', data: {}, timestamp: 0 }),
      (e) => { e.type = ''; e.data = {}; e.timestamp = 0; },
      500
    );

    // Animation frame pool
    this.createPool('AnimationFrame',
      () => ({ sprite: null, x: 0, y: 0, rotation: 0, scale: 1 }),
      (f) => { f.sprite = null; f.x = 0; f.y = 0; f.rotation = 0; f.scale = 1; },
      200
    );

    // Network message pool
    this.createPool('NetworkMessage',
      () => ({ id: '', type: '', payload: {}, timestamp: 0 }),
      (m) => { m.id = ''; m.type = ''; m.payload = {}; m.timestamp = 0; },
      300
    );

    // UI component state pool
    this.createPool('ComponentState',
      () => ({ id: '', props: {}, state: {}, dirty: false }),
      (s) => { s.id = ''; s.props = {}; s.state = {}; s.dirty = false; },
      100
    );

    // Preallocate objects if enabled
    if (this.options.enablePreallocation > 0) {
      for (const pool of this.objectPools.values()) {
        pool.preallocate(this.options.enablePreallocation);
      }
    }
  }

  /**
   * Create a new object pool
   */
  createPool<T>(
    name: string,
    create: () => T,
    reset: (item: T) => void,
    maxSize: number = this.options.maxPoolSize,
    validate?: (item: T) => boolean
  ): ObjectPool<T> {
    const pool = new ObjectPool(name, create, reset, maxSize, validate);
    this.objectPools.set(name, pool);
    
    this.emit('pool-created', { name, maxSize });
    return pool;
  }

  /**
   * Get object from pool
   */
  acquire<T>(poolName: string): T | null {
    if (!this.options.enableObjectPooling) return null;
    
    const pool = this.objectPools.get(poolName);
    return pool ? pool.acquire() : null;
  }

  /**
   * Return object to pool
   */
  release<T>(poolName: string, item: T): boolean {
    if (!this.options.enableObjectPooling) return false;
    
    const pool = this.objectPools.get(poolName);
    return pool ? pool.release(item) : false;
  }

  /**
   * Perform routine cleanup
   */
  private performRoutineCleanup(): void {
    // Clean up pools by reducing their sizes slightly
    for (const pool of this.objectPools.values()) {
      const stats = pool.getStats();
      if (stats.utilization < 0.3) {
        // Pool is underutilized, reduce size
        const targetSize = Math.max(10, Math.floor(stats.poolSize * 0.8));
        while (pool.pool.length > targetSize && pool.pool.length > 0) {
          pool.pool.pop();
          pool.currentSize--;
        }
      }
    }

    this.emit('routine-cleanup-performed');
  }

  /**
   * Perform emergency cleanup when memory pressure is high
   */
  private performEmergencyCleanup(): void {
    // Aggressive pool cleanup
    for (const pool of this.objectPools.values()) {
      // Clear half of pooled objects
      const targetSize = Math.max(5, Math.floor(pool.pool.length * 0.5));
      while (pool.pool.length > targetSize) {
        pool.pool.pop();
        pool.currentSize--;
      }
    }

    // Force garbage collection if available
    if (typeof global !== 'undefined' && global.gc) {
      global.gc();
    } else if ('gc' in globalThis) {
      (globalThis as any).gc();
    }

    this.emit('emergency-cleanup-performed');
  }

  /**
   * Get memory metrics
   */
  getMemoryMetrics(): MemoryMetrics {
    return this.memoryMonitor.getMetrics();
  }

  /**
   * Get memory pressure level
   */
  getMemoryPressure(): number {
    return this.memoryMonitor.getMemoryPressure();
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, pool] of this.objectPools.values()) {
      stats[name] = pool.getStats();
    }
    
    return stats;
  }

  /**
   * Get GC statistics
   */
  getGCStats(): any {
    return this.gcOptimizer.getGCStats();
  }

  /**
   * Optimize memory usage based on current patterns
   */
  optimizeMemoryUsage(): void {
    const metrics = this.getMemoryMetrics();
    const poolStats = this.getPoolStats();

    // Adjust pool sizes based on usage patterns
    for (const [name, stats] of Object.entries(poolStats)) {
      const pool = this.objectPools.get(name);
      if (!pool) continue;

      const utilizationRatio = stats.reuseRate || 0;
      const currentUtilization = stats.utilization || 0;

      // Increase pool size if high reuse and near capacity
      if (utilizationRatio > 0.8 && currentUtilization > 0.9) {
        pool.maxSize = Math.min(this.options.maxPoolSize * 2, pool.maxSize * 1.2);
      }
      // Decrease pool size if low reuse
      else if (utilizationRatio < 0.3 && currentUtilization < 0.5) {
        pool.maxSize = Math.max(10, pool.maxSize * 0.8);
      }
    }

    // Optimize GC settings
    this.gcOptimizer.optimizeSettings(metrics);

    this.emit('memory-optimized', { metrics, poolStats });
  }

  /**
   * Enable or disable memory management
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    if (!enabled) {
      this.memoryMonitor.stop();
    } else {
      this.memoryMonitor.start();
    }
  }

  /**
   * Clear all pools and reset
   */
  reset(): void {
    for (const pool of this.objectPools.values()) {
      pool.clear();
    }
    
    // Force cleanup
    this.performEmergencyCleanup();
    
    this.emit('memory-reset');
  }

  /**
   * Get comprehensive memory report
   */
  getMemoryReport(): any {
    return {
      timestamp: Date.now(),
      metrics: this.getMemoryMetrics(),
      pressure: this.getMemoryPressure(),
      pools: this.getPoolStats(),
      gc: this.getGCStats(),
      options: this.options,
      isEnabled: this.isEnabled
    };
  }

  /**
   * Cleanup and shutdown memory manager
   */
  destroy(): void {
    this.setEnabled(false);
    this.gcOptimizer.cleanup();
    this.reset();
    this.removeAllListeners();
  }
}

// Export singleton instance for global use
export const memoryManager = new MemoryManager();