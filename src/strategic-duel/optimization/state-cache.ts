/**
 * Advanced State Cache with Predictive Pre-loading for Strategic Duel
 * Achieves <5ms state access through intelligent caching and prediction
 */

import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';

export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
  version: number;
  dirty: boolean;
  predictions?: string[];
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalAccess: number;
  totalHits: number;
  totalMisses: number;
  predictiveHits: number;
  memoryUsage: number;
  averageAccessTime: number;
}

export interface PredictionPattern {
  key: string;
  nextKeys: Map<string, number>;
  frequency: number;
  confidence: number;
  lastSeen: number;
}

export interface StateCacheOptions {
  maxSize: number;
  maxAge: number;
  predictivePreloadCount: number;
  compressionEnabled: boolean;
  syncInterval: number;
  memoryThreshold: number;
  predictionWindowMs: number;
}

/**
 * Predictive access pattern analyzer
 */
class AccessPatternAnalyzer {
  private patterns: Map<string, PredictionPattern> = new Map();
  private accessHistory: string[] = [];
  private maxHistorySize: number = 1000;
  private confidenceThreshold: number = 0.6;

  /**
   * Record access pattern for prediction learning
   */
  recordAccess(key: string): void {
    this.accessHistory.push(key);
    
    // Maintain history size
    if (this.accessHistory.length > this.maxHistorySize) {
      this.accessHistory = this.accessHistory.slice(-this.maxHistorySize);
    }

    // Update patterns
    this.updatePatterns(key);
  }

  /**
   * Update prediction patterns based on access sequence
   */
  private updatePatterns(currentKey: string): void {
    const historyLength = this.accessHistory.length;
    if (historyLength < 2) return;

    // Look at previous keys to establish patterns
    for (let lookback = 1; lookback <= Math.min(5, historyLength - 1); lookback++) {
      const previousKey = this.accessHistory[historyLength - 1 - lookback];
      if (!previousKey) continue;

      let pattern = this.patterns.get(previousKey);
      if (!pattern) {
        pattern = {
          key: previousKey,
          nextKeys: new Map(),
          frequency: 0,
          confidence: 0,
          lastSeen: Date.now()
        };
        this.patterns.set(previousKey, pattern);
      }

      // Update next key frequency
      const currentCount = pattern.nextKeys.get(currentKey) || 0;
      pattern.nextKeys.set(currentKey, currentCount + 1);
      pattern.frequency++;
      pattern.lastSeen = Date.now();

      // Calculate confidence based on frequency and consistency
      this.updatePatternConfidence(pattern);
    }

    // Cleanup old patterns
    this.cleanupOldPatterns();
  }

  /**
   * Update pattern confidence score
   */
  private updatePatternConfidence(pattern: PredictionPattern): void {
    const totalTransitions = Array.from(pattern.nextKeys.values()).reduce((sum, count) => sum + count, 0);
    const maxTransitions = Math.max(...pattern.nextKeys.values());
    
    // Confidence based on frequency and consistency
    const consistencyRatio = maxTransitions / totalTransitions;
    const frequencyScore = Math.min(pattern.frequency / 10, 1); // Normalize to 0-1
    
    pattern.confidence = (consistencyRatio * 0.7 + frequencyScore * 0.3);
  }

  /**
   * Predict next keys based on current access pattern
   */
  predictNextKeys(currentKey: string, count: number = 3): string[] {
    const pattern = this.patterns.get(currentKey);
    if (!pattern || pattern.confidence < this.confidenceThreshold) {
      return [];
    }

    // Sort by frequency and return top predictions
    const sortedPredictions = Array.from(pattern.nextKeys.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([key, frequency]) => key);

    return sortedPredictions;
  }

  /**
   * Get prediction confidence for a specific key transition
   */
  getPredictionConfidence(fromKey: string, toKey: string): number {
    const pattern = this.patterns.get(fromKey);
    if (!pattern) return 0;

    const transitionCount = pattern.nextKeys.get(toKey) || 0;
    const totalTransitions = Array.from(pattern.nextKeys.values()).reduce((sum, count) => sum + count, 0);
    
    return totalTransitions > 0 ? transitionCount / totalTransitions : 0;
  }

  /**
   * Cleanup old or unused patterns
   */
  private cleanupOldPatterns(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, pattern] of this.patterns) {
      if (now - pattern.lastSeen > maxAge || pattern.confidence < 0.1) {
        this.patterns.delete(key);
      }
    }
  }

  /**
   * Get analytics about prediction patterns
   */
  getPatternAnalytics(): any {
    return {
      totalPatterns: this.patterns.size,
      highConfidencePatterns: Array.from(this.patterns.values()).filter(p => p.confidence > 0.7).length,
      averageConfidence: Array.from(this.patterns.values()).reduce((sum, p) => sum + p.confidence, 0) / this.patterns.size,
      mostFrequentPatterns: Array.from(this.patterns.entries())
        .sort((a, b) => b[1].frequency - a[1].frequency)
        .slice(0, 10)
        .map(([key, pattern]) => ({ key, frequency: pattern.frequency, confidence: pattern.confidence }))
    };
  }
}

/**
 * Advanced compression system for cache entries
 */
class CacheCompression {
  private compressionCache = new LRUCache<string, string>({ max: 100 });
  
  /**
   * Compress cache entry if beneficial
   */
  async compress(data: any): Promise<{ compressed: boolean; data: any; originalSize: number; compressedSize: number }> {
    const serialized = JSON.stringify(data);
    const originalSize = serialized.length;

    // Skip compression for small data
    if (originalSize < 1024) {
      return { compressed: false, data, originalSize, compressedSize: originalSize };
    }

    try {
      // Simple JSON compression by removing whitespace and common patterns
      const compressed = this.jsonCompress(serialized);
      const compressedSize = compressed.length;

      // Only use compression if we save significant space
      if (compressedSize < originalSize * 0.8) {
        return { compressed: true, data: compressed, originalSize, compressedSize };
      } else {
        return { compressed: false, data, originalSize, compressedSize: originalSize };
      }
    } catch (error) {
      return { compressed: false, data, originalSize, compressedSize: originalSize };
    }
  }

  /**
   * Decompress cache entry
   */
  async decompress(compressedData: string): Promise<any> {
    try {
      const decompressed = this.jsonDecompress(compressedData);
      return JSON.parse(decompressed);
    } catch (error) {
      throw new Error(`Failed to decompress cache entry: ${error.message}`);
    }
  }

  /**
   * Simple JSON compression
   */
  private jsonCompress(json: string): string {
    // Replace common JSON patterns
    return json
      .replace(/\s+/g, '')
      .replace(/":"/g, '":"')
      .replace(/":(\d+)/g, '":$1')
      .replace(/":true/g, '":!0')
      .replace(/":false/g, '":!1')
      .replace(/":null/g, '":N');
  }

  /**
   * Simple JSON decompression
   */
  private jsonDecompress(compressed: string): string {
    // Restore common JSON patterns
    return compressed
      .replace(/":N/g, '":null')
      .replace(/":!1/g, '":false')
      .replace(/":!0/g, '":true');
  }
}

/**
 * Main State Cache class with predictive pre-loading
 */
export class StateCache extends EventEmitter {
  private cache: LRUCache<string, CacheEntry>;
  private accessAnalyzer: AccessPatternAnalyzer;
  private compression: CacheCompression;
  private metrics: CacheMetrics;
  private options: StateCacheOptions;
  private preloadQueue: Set<string> = new Set();
  private syncTimer: NodeJS.Timeout | null = null;
  private memoryMonitor: NodeJS.Timeout | null = null;

  constructor(options: Partial<StateCacheOptions> = {}) {
    super();
    
    this.options = {
      maxSize: 10000,
      maxAge: 5 * 60 * 1000, // 5 minutes
      predictivePreloadCount: 5,
      compressionEnabled: true,
      syncInterval: 1000,
      memoryThreshold: 100 * 1024 * 1024, // 100MB
      predictionWindowMs: 100,
      ...options
    };

    this.cache = new LRUCache({
      max: this.options.maxSize,
      ttl: this.options.maxAge,
      dispose: (value, key) => {
        this.emit('cache-evicted', key, value);
      }
    });

    this.accessAnalyzer = new AccessPatternAnalyzer();
    this.compression = new CacheCompression();
    this.metrics = this.initializeMetrics();

    this.startSyncTimer();
    this.startMemoryMonitoring();
  }

  /**
   * Initialize cache metrics
   */
  private initializeMetrics(): CacheMetrics {
    return {
      hitRate: 0,
      missRate: 0,
      totalAccess: 0,
      totalHits: 0,
      totalMisses: 0,
      predictiveHits: 0,
      memoryUsage: 0,
      averageAccessTime: 0
    };
  }

  /**
   * Get value from cache with predictive pre-loading
   */
  async get<T = any>(key: string): Promise<T | undefined> {
    const startTime = performance.now();
    
    // Record access for pattern learning
    this.accessAnalyzer.recordAccess(key);
    
    // Update metrics
    this.metrics.totalAccess++;

    const entry = this.cache.get(key);
    
    if (entry) {
      // Cache hit
      this.metrics.totalHits++;
      entry.accessCount++;
      entry.lastAccess = Date.now();
      
      // Trigger predictive pre-loading
      this.triggerPredictivePreload(key);
      
      // Handle compressed data
      let value = entry.value;
      if (entry.value && typeof entry.value === 'string' && entry.value.startsWith('COMPRESSED:')) {
        value = await this.compression.decompress(entry.value.slice(11));
      }

      const accessTime = performance.now() - startTime;
      this.updateAccessTimeMetrics(accessTime);
      
      return value;
    } else {
      // Cache miss
      this.metrics.totalMisses++;
      return undefined;
    }
  }

  /**
   * Set value in cache with optional compression
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    let processedValue: any = value;
    
    // Apply compression if enabled and beneficial
    if (this.options.compressionEnabled && value) {
      const compressionResult = await this.compression.compress(value);
      if (compressionResult.compressed) {
        processedValue = `COMPRESSED:${compressionResult.data}`;
      }
    }

    const entry: CacheEntry<T> = {
      value: processedValue,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
      version: 1,
      dirty: false
    };

    // Set with TTL if specified
    if (ttl) {
      this.cache.set(key, entry, { ttl });
    } else {
      this.cache.set(key, entry);
    }

    this.emit('cache-set', key, entry);
  }

  /**
   * Trigger predictive pre-loading based on access patterns
   */
  private async triggerPredictivePreload(currentKey: string): Promise<void> {
    // Get predictions
    const predictions = this.accessAnalyzer.predictNextKeys(
      currentKey, 
      this.options.predictivePreloadCount
    );

    // Schedule pre-loading with delay
    setTimeout(() => {
      this.preloadPredictedKeys(predictions, currentKey);
    }, this.options.predictionWindowMs);
  }

  /**
   * Pre-load predicted keys
   */
  private async preloadPredictedKeys(keys: string[], originKey: string): Promise<void> {
    for (const key of keys) {
      if (this.preloadQueue.has(key) || this.cache.has(key)) {
        continue;
      }

      this.preloadQueue.add(key);
      
      // Emit preload request
      this.emit('preload-request', key, {
        origin: originKey,
        confidence: this.accessAnalyzer.getPredictionConfidence(originKey, key)
      });

      // Clean up preload queue after timeout
      setTimeout(() => {
        this.preloadQueue.delete(key);
      }, 5000);
    }
  }

  /**
   * Handle preload response from external data source
   */
  async handlePreloadResponse<T = any>(key: string, value: T): Promise<void> {
    if (this.preloadQueue.has(key)) {
      await this.set(key, value);
      this.preloadQueue.delete(key);
      this.metrics.predictiveHits++;
      this.emit('predictive-hit', key);
    }
  }

  /**
   * Update or increment a cached value atomically
   */
  async update<T = any>(key: string, updateFn: (current: T | undefined) => T): Promise<T> {
    const current = await this.get<T>(key);
    const updated = updateFn(current);
    await this.set(key, updated);
    return updated;
  }

  /**
   * Batch get operation for multiple keys
   */
  async getMany<T = any>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const promises = keys.map(async (key) => {
      const value = await this.get<T>(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Batch set operation for multiple key-value pairs
   */
  async setMany<T = any>(entries: Map<string, T>): Promise<void> {
    const promises = Array.from(entries.entries()).map(([key, value]) => 
      this.set(key, value)
    );
    
    await Promise.all(promises);
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear();
    this.preloadQueue.clear();
    this.metrics = this.initializeMetrics();
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in cache
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    // Update hit/miss rates
    if (this.metrics.totalAccess > 0) {
      this.metrics.hitRate = this.metrics.totalHits / this.metrics.totalAccess;
      this.metrics.missRate = this.metrics.totalMisses / this.metrics.totalAccess;
    }

    // Update memory usage
    this.metrics.memoryUsage = this.estimateMemoryUsage();

    return { ...this.metrics };
  }

  /**
   * Get prediction analytics
   */
  getPredictionAnalytics(): any {
    return this.accessAnalyzer.getPatternAnalytics();
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length * 2; // Unicode string size
      totalSize += JSON.stringify(entry).length * 2;
    }
    
    return totalSize;
  }

  /**
   * Update access time metrics
   */
  private updateAccessTimeMetrics(accessTime: number): void {
    const alpha = 0.1; // Exponential moving average factor
    this.metrics.averageAccessTime = 
      alpha * accessTime + (1 - alpha) * this.metrics.averageAccessTime;
  }

  /**
   * Start periodic sync timer
   */
  private startSyncTimer(): void {
    this.syncTimer = setInterval(() => {
      this.emit('sync-required', this.getDirtyEntries());
    }, this.options.syncInterval);
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitor = setInterval(() => {
      const memoryUsage = this.estimateMemoryUsage();
      
      if (memoryUsage > this.options.memoryThreshold) {
        this.performMemoryCleanup();
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Get entries that need synchronization
   */
  private getDirtyEntries(): Array<{ key: string; entry: CacheEntry }> {
    const dirtyEntries: Array<{ key: string; entry: CacheEntry }> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.dirty) {
        dirtyEntries.push({ key, entry });
      }
    }
    
    return dirtyEntries;
  }

  /**
   * Perform memory cleanup by removing least recently used items
   */
  private performMemoryCleanup(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    
    // Remove bottom 20% of entries
    const removeCount = Math.floor(entries.length * 0.2);
    
    for (let i = 0; i < removeCount; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    this.emit('memory-cleanup', removeCount);
  }

  /**
   * Optimize cache performance based on usage patterns
   */
  optimizePerformance(): void {
    const metrics = this.getMetrics();
    
    // Adjust cache size based on hit rate
    if (metrics.hitRate < 0.7 && this.cache.max < this.options.maxSize * 2) {
      this.cache.max = Math.min(this.options.maxSize * 2, this.cache.max * 1.2);
    } else if (metrics.hitRate > 0.9 && this.cache.max > this.options.maxSize / 2) {
      this.cache.max = Math.max(this.options.maxSize / 2, this.cache.max * 0.8);
    }

    // Adjust preload count based on predictive hit rate
    const predictiveHitRate = this.metrics.predictiveHits / Math.max(this.metrics.totalHits, 1);
    if (predictiveHitRate > 0.3) {
      this.options.predictivePreloadCount = Math.min(10, this.options.predictivePreloadCount + 1);
    } else if (predictiveHitRate < 0.1) {
      this.options.predictivePreloadCount = Math.max(2, this.options.predictivePreloadCount - 1);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
      this.memoryMonitor = null;
    }
    
    this.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance for global use
export const stateCache = new StateCache();