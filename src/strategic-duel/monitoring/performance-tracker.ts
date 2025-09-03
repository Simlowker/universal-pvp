/**
 * Advanced Performance Tracker for Strategic Duel
 * Real-time monitoring and alerting for 10-50ms gameplay targets
 */

import { EventEmitter } from 'events';
import { LRUCache } from 'lru-cache';

export interface PerformanceMetric {
  timestamp: number;
  category: string;
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
  threshold?: {
    warning: number;
    critical: number;
  };
}

export interface PerformanceAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  metric: string;
  message: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
  tags?: Record<string, string>;
}

export interface PerformanceReport {
  timestamp: number;
  duration: number;
  summary: {
    totalMetrics: number;
    activeAlerts: number;
    averageLatency: number;
    peakLatency: number;
    errorRate: number;
    throughput: number;
  };
  categories: Record<string, CategoryReport>;
  trends: Record<string, TrendData>;
  recommendations: string[];
}

export interface CategoryReport {
  name: string;
  metricCount: number;
  averageValue: number;
  peakValue: number;
  alertCount: number;
  trend: 'improving' | 'stable' | 'degrading';
  healthScore: number;
}

export interface TrendData {
  metric: string;
  values: number[];
  timestamps: number[];
  slope: number;
  correlation: number;
  prediction: number;
}

export interface TrackerOptions {
  metricsRetention: number;
  alertRetention: number;
  samplingInterval: number;
  alertThrottleMs: number;
  enablePrediction: boolean;
  autoOptimization: boolean;
  reportingInterval: number;
  maxMemoryMB: number;
}

/**
 * Real-time metrics collector with buffering and aggregation
 */
class MetricsCollector {
  private metricsBuffer: PerformanceMetric[] = [];
  private aggregatedMetrics: Map<string, PerformanceMetric[]> = new Map();
  private metricThresholds: Map<string, { warning: number; critical: number }> = new Map();
  private lastFlush: number = Date.now();
  private bufferSize: number = 10000;
  private flushInterval: number = 1000;

  constructor() {
    this.setupDefaultThresholds();
  }

  /**
   * Setup default performance thresholds for Strategic Duel
   */
  private setupDefaultThresholds(): void {
    // Action execution thresholds
    this.setThreshold('action_execution_time', { warning: 20, critical: 30 });
    this.setThreshold('ui_update_time', { warning: 35, critical: 50 });
    this.setThreshold('round_transition_time', { warning: 15, critical: 25 });
    this.setThreshold('vrf_resolution_time', { warning: 80, critical: 120 });
    this.setThreshold('total_perceived_latency', { warning: 40, critical: 60 });
    
    // Network performance
    this.setThreshold('network_latency', { warning: 50, critical: 100 });
    this.setThreshold('websocket_reconnects', { warning: 3, critical: 10 });
    this.setThreshold('message_queue_size', { warning: 100, critical: 500 });
    
    // Resource usage
    this.setThreshold('memory_usage_mb', { warning: 256, critical: 512 });
    this.setThreshold('cpu_usage_percent', { warning: 70, critical: 90 });
    this.setThreshold('gpu_usage_percent', { warning: 80, critical: 95 });
    
    // Frame rendering
    this.setThreshold('frame_time_ms', { warning: 18, critical: 25 });
    this.setThreshold('dropped_frames_per_second', { warning: 2, critical: 5 });
    this.setThreshold('render_queue_size', { warning: 50, critical: 100 });
    
    // Game-specific metrics
    this.setThreshold('state_sync_time', { warning: 10, critical: 20 });
    this.setThreshold('input_lag_ms', { warning: 15, critical: 30 });
    this.setThreshold('animation_frame_drops', { warning: 1, critical: 3 });
  }

  /**
   * Set custom threshold for metric
   */
  setThreshold(metricName: string, threshold: { warning: number; critical: number }): void {
    this.metricThresholds.set(metricName, threshold);
  }

  /**
   * Collect performance metric
   */
  collectMetric(metric: PerformanceMetric): void {
    // Add threshold if not present
    const threshold = this.metricThresholds.get(metric.name);
    if (threshold) {
      metric.threshold = threshold;
    }

    // Add to buffer
    this.metricsBuffer.push(metric);

    // Check for buffer flush
    if (this.metricsBuffer.length >= this.bufferSize || 
        Date.now() - this.lastFlush >= this.flushInterval) {
      this.flushBuffer();
    }
  }

  /**
   * Flush metrics buffer to aggregated storage
   */
  private flushBuffer(): void {
    for (const metric of this.metricsBuffer) {
      const key = `${metric.category}:${metric.name}`;
      
      if (!this.aggregatedMetrics.has(key)) {
        this.aggregatedMetrics.set(key, []);
      }
      
      const metrics = this.aggregatedMetrics.get(key)!;
      metrics.push(metric);
      
      // Maintain reasonable history size
      if (metrics.length > 1000) {
        metrics.splice(0, metrics.length - 1000);
      }
    }

    this.metricsBuffer = [];
    this.lastFlush = Date.now();
  }

  /**
   * Get metrics for specific category and name
   */
  getMetrics(category: string, name: string): PerformanceMetric[] {
    this.flushBuffer(); // Ensure latest metrics are included
    return this.aggregatedMetrics.get(`${category}:${name}`) || [];
  }

  /**
   * Get all metrics for category
   */
  getCategoryMetrics(category: string): Map<string, PerformanceMetric[]> {
    this.flushBuffer();
    const categoryMetrics = new Map<string, PerformanceMetric[]>();
    
    for (const [key, metrics] of this.aggregatedMetrics) {
      if (key.startsWith(`${category}:`)) {
        const name = key.split(':')[1];
        categoryMetrics.set(name, metrics);
      }
    }
    
    return categoryMetrics;
  }

  /**
   * Clear old metrics beyond retention period
   */
  clearOldMetrics(retentionMs: number): void {
    const cutoff = Date.now() - retentionMs;
    
    for (const [key, metrics] of this.aggregatedMetrics) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoff);
      this.aggregatedMetrics.set(key, filteredMetrics);
    }
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.metricsBuffer.length;
  }
}

/**
 * Alert management system with throttling and severity escalation
 */
class AlertManager extends EventEmitter {
  private alerts: Map<string, PerformanceAlert> = new Map();
  private alertHistory: PerformanceAlert[] = [];
  private throttleMap: Map<string, number> = new Map();
  private alertCounter: number = 0;
  private throttleMs: number = 5000; // 5 seconds default throttle

  constructor(throttleMs: number = 5000) {
    super();
    this.throttleMs = throttleMs;
  }

  /**
   * Check metric against thresholds and create alerts
   */
  checkMetric(metric: PerformanceMetric): PerformanceAlert | null {
    if (!metric.threshold) return null;

    const alertKey = `${metric.category}:${metric.name}`;
    
    // Check if alert is throttled
    const lastAlert = this.throttleMap.get(alertKey);
    if (lastAlert && Date.now() - lastAlert < this.throttleMs) {
      return null;
    }

    let severity: 'info' | 'warning' | 'error' | 'critical' | null = null;
    let threshold: number = 0;

    // Determine severity level
    if (metric.value >= metric.threshold.critical) {
      severity = 'critical';
      threshold = metric.threshold.critical;
    } else if (metric.value >= metric.threshold.warning) {
      severity = 'warning';
      threshold = metric.threshold.warning;
    }

    // Create alert if threshold exceeded
    if (severity) {
      const alert: PerformanceAlert = {
        id: `alert_${++this.alertCounter}`,
        timestamp: metric.timestamp,
        severity,
        category: metric.category,
        metric: metric.name,
        message: this.generateAlertMessage(metric, severity, threshold),
        value: metric.value,
        threshold,
        acknowledged: false,
        tags: metric.tags
      };

      this.alerts.set(alert.id, alert);
      this.alertHistory.push(alert);
      this.throttleMap.set(alertKey, Date.now());

      // Emit alert event
      this.emit('alert', alert);

      // Auto-escalate critical alerts
      if (severity === 'critical') {
        setTimeout(() => {
          if (!alert.acknowledged) {
            this.escalateAlert(alert);
          }
        }, 30000); // 30 seconds
      }

      return alert;
    }

    return null;
  }

  /**
   * Generate descriptive alert message
   */
  private generateAlertMessage(metric: PerformanceMetric, severity: string, threshold: number): string {
    const performanceImpact = this.getPerformanceImpact(metric.name, metric.value);
    
    return `${severity.toUpperCase()}: ${metric.name} is ${metric.value}${metric.unit} ` +
           `(threshold: ${threshold}${metric.unit}) in ${metric.category}. ${performanceImpact}`;
  }

  /**
   * Get performance impact description for specific metrics
   */
  private getPerformanceImpact(metricName: string, value: number): string {
    switch (metricName) {
      case 'action_execution_time':
        return value > 30 ? 'Actions feel unresponsive to players.' : 'Actions may feel slightly delayed.';
      case 'ui_update_time':
        return value > 50 ? 'UI updates are noticeably laggy.' : 'UI responsiveness is degraded.';
      case 'total_perceived_latency':
        return value > 60 ? 'Game feels unplayable.' : 'Players will notice latency.';
      case 'frame_time_ms':
        return value > 25 ? 'Choppy animations and poor visual experience.' : 'Minor frame rate issues.';
      case 'network_latency':
        return value > 100 ? 'Multiplayer synchronization severely impacted.' : 'Network delays affecting gameplay.';
      default:
        return 'Performance degradation detected.';
    }
  }

  /**
   * Escalate unacknowledged critical alert
   */
  private escalateAlert(alert: PerformanceAlert): void {
    const escalatedAlert: PerformanceAlert = {
      ...alert,
      id: `escalated_${alert.id}`,
      timestamp: Date.now(),
      message: `ESCALATED: ${alert.message} - Alert has been unacknowledged for 30 seconds!`,
      severity: 'critical'
    };

    this.alerts.set(escalatedAlert.id, escalatedAlert);
    this.alertHistory.push(escalatedAlert);
    this.emit('alert-escalated', escalatedAlert);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert-acknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Get active (unacknowledged) alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: 'info' | 'warning' | 'error' | 'critical'): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(alert => alert.severity === severity);
  }

  /**
   * Clear acknowledged alerts older than specified time
   */
  clearOldAlerts(retentionMs: number): void {
    const cutoff = Date.now() - retentionMs;
    
    for (const [id, alert] of this.alerts) {
      if (alert.acknowledged && alert.timestamp < cutoff) {
        this.alerts.delete(id);
      }
    }
    
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoff);
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): any {
    const active = this.getActiveAlerts();
    
    return {
      total: this.alerts.size,
      active: active.length,
      critical: active.filter(a => a.severity === 'critical').length,
      warning: active.filter(a => a.severity === 'warning').length,
      acknowledged: Array.from(this.alerts.values()).filter(a => a.acknowledged).length,
      recentAlerts: this.alertHistory.slice(-10)
    };
  }
}

/**
 * Trend analysis and prediction engine
 */
class TrendAnalyzer {
  private trendCache = new LRUCache<string, TrendData>({ max: 500 });
  private predictionEnabled: boolean = true;

  constructor(predictionEnabled: boolean = true) {
    this.predictionEnabled = predictionEnabled;
  }

  /**
   * Analyze trend for specific metric
   */
  analyzeTrend(metrics: PerformanceMetric[]): TrendData {
    if (metrics.length < 3) {
      return this.createEmptyTrend(metrics[0]?.name || 'unknown');
    }

    const values = metrics.map(m => m.value);
    const timestamps = metrics.map(m => m.timestamp);
    
    // Calculate linear regression
    const { slope, correlation } = this.calculateLinearRegression(timestamps, values);
    
    // Generate prediction if enabled
    let prediction = 0;
    if (this.predictionEnabled && metrics.length >= 5) {
      prediction = this.predictNextValue(timestamps, values, slope);
    }

    const trendData: TrendData = {
      metric: metrics[0].name,
      values,
      timestamps,
      slope,
      correlation,
      prediction
    };

    // Cache result
    this.trendCache.set(metrics[0].name, trendData);
    
    return trendData;
  }

  /**
   * Calculate linear regression for trend analysis
   */
  private calculateLinearRegression(x: number[], y: number[]): { slope: number; correlation: number } {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    const sumYY = y.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Calculate correlation coefficient
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    const correlation = denominator === 0 ? 0 : numerator / denominator;

    return { slope, correlation };
  }

  /**
   * Predict next value based on trend
   */
  private predictNextValue(timestamps: number[], values: number[], slope: number): number {
    const lastTimestamp = timestamps[timestamps.length - 1];
    const avgInterval = (lastTimestamp - timestamps[0]) / (timestamps.length - 1);
    const nextTimestamp = lastTimestamp + avgInterval;
    
    const lastValue = values[values.length - 1];
    return lastValue + (slope * avgInterval);
  }

  /**
   * Create empty trend data structure
   */
  private createEmptyTrend(metricName: string): TrendData {
    return {
      metric: metricName,
      values: [],
      timestamps: [],
      slope: 0,
      correlation: 0,
      prediction: 0
    };
  }

  /**
   * Detect anomalies in metric values
   */
  detectAnomalies(metrics: PerformanceMetric[], threshold: number = 2): PerformanceMetric[] {
    if (metrics.length < 10) return [];

    const values = metrics.map(m => m.value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return metrics.filter(metric => 
      Math.abs(metric.value - mean) > threshold * stdDev
    );
  }

  /**
   * Get cached trend data
   */
  getCachedTrend(metricName: string): TrendData | undefined {
    return this.trendCache.get(metricName);
  }
}

/**
 * Main Performance Tracker class
 */
export class PerformanceTracker extends EventEmitter {
  private metricsCollector: MetricsCollector;
  private alertManager: AlertManager;
  private trendAnalyzer: TrendAnalyzer;
  private options: TrackerOptions;
  private isRunning: boolean = false;
  private reportTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: Partial<TrackerOptions> = {}) {
    super();
    
    this.options = {
      metricsRetention: 60 * 60 * 1000, // 1 hour
      alertRetention: 24 * 60 * 60 * 1000, // 24 hours
      samplingInterval: 1000, // 1 second
      alertThrottleMs: 5000, // 5 seconds
      enablePrediction: true,
      autoOptimization: true,
      reportingInterval: 60000, // 1 minute
      maxMemoryMB: 256,
      ...options
    };

    this.metricsCollector = new MetricsCollector();
    this.alertManager = new AlertManager(this.options.alertThrottleMs);
    this.trendAnalyzer = new TrendAnalyzer(this.options.enablePrediction);

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.alertManager.on('alert', (alert) => {
      this.emit('performance-alert', alert);
    });

    this.alertManager.on('alert-escalated', (alert) => {
      this.emit('performance-critical', alert);
    });
  }

  /**
   * Start performance tracking
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start periodic reporting
    this.reportTimer = setInterval(() => {
      const report = this.generateReport();
      this.emit('performance-report', report);
    }, this.options.reportingInterval);

    // Start cleanup process
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, 300000); // 5 minutes
  }

  /**
   * Stop performance tracking
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Track performance metric
   */
  track(category: string, name: string, value: number, unit: string = 'ms', tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      timestamp: Date.now(),
      category,
      name,
      value,
      unit,
      tags
    };

    this.metricsCollector.collectMetric(metric);

    // Check for alerts
    const alert = this.alertManager.checkMetric(metric);
    if (alert) {
      // Auto-optimization for critical performance issues
      if (this.options.autoOptimization && alert.severity === 'critical') {
        this.triggerAutoOptimization(alert);
      }
    }
  }

  /**
   * Track action execution time
   */
  trackActionExecution(action: string, startTime: number, tags?: Record<string, string>): void {
    const executionTime = Date.now() - startTime;
    this.track('gameplay', 'action_execution_time', executionTime, 'ms', { action, ...tags });
  }

  /**
   * Track UI update performance
   */
  trackUIUpdate(component: string, startTime: number, tags?: Record<string, string>): void {
    const updateTime = Date.now() - startTime;
    this.track('ui', 'ui_update_time', updateTime, 'ms', { component, ...tags });
  }

  /**
   * Track network latency
   */
  trackNetworkLatency(endpoint: string, latency: number, tags?: Record<string, string>): void {
    this.track('network', 'network_latency', latency, 'ms', { endpoint, ...tags });
  }

  /**
   * Track frame rendering performance
   */
  trackFrameRender(frameTime: number, droppedFrames: number = 0, tags?: Record<string, string>): void {
    this.track('rendering', 'frame_time_ms', frameTime, 'ms', tags);
    if (droppedFrames > 0) {
      this.track('rendering', 'dropped_frames_per_second', droppedFrames, 'count', tags);
    }
  }

  /**
   * Track resource usage
   */
  trackResourceUsage(cpu: number, memory: number, gpu: number = 0, tags?: Record<string, string>): void {
    this.track('resources', 'cpu_usage_percent', cpu, '%', tags);
    this.track('resources', 'memory_usage_mb', memory, 'MB', tags);
    if (gpu > 0) {
      this.track('resources', 'gpu_usage_percent', gpu, '%', tags);
    }
  }

  /**
   * Generate comprehensive performance report
   */
  generateReport(): PerformanceReport {
    const endTime = Date.now();
    const startTime = endTime - this.options.reportingInterval;

    // Collect metrics for report period
    const allCategories = ['gameplay', 'ui', 'network', 'rendering', 'resources'];
    const categories: Record<string, CategoryReport> = {};
    const trends: Record<string, TrendData> = {};

    for (const category of allCategories) {
      const categoryMetrics = this.metricsCollector.getCategoryMetrics(category);
      categories[category] = this.generateCategoryReport(category, categoryMetrics);

      // Generate trends for key metrics
      for (const [metricName, metrics] of categoryMetrics) {
        const recentMetrics = metrics.filter(m => m.timestamp > startTime);
        if (recentMetrics.length > 0) {
          trends[`${category}:${metricName}`] = this.trendAnalyzer.analyzeTrend(recentMetrics);
        }
      }
    }

    // Calculate summary metrics
    const actionMetrics = this.metricsCollector.getMetrics('gameplay', 'action_execution_time');
    const networkMetrics = this.metricsCollector.getMetrics('network', 'network_latency');
    const frameMetrics = this.metricsCollector.getMetrics('rendering', 'frame_time_ms');

    const summary = {
      totalMetrics: this.getTotalMetricCount(),
      activeAlerts: this.alertManager.getActiveAlerts().length,
      averageLatency: this.calculateAverageValue(actionMetrics, startTime),
      peakLatency: this.calculatePeakValue(actionMetrics, startTime),
      errorRate: this.calculateErrorRate(startTime),
      throughput: this.calculateThroughput(startTime)
    };

    const recommendations = this.generateRecommendations(categories, trends);

    return {
      timestamp: endTime,
      duration: this.options.reportingInterval,
      summary,
      categories,
      trends,
      recommendations
    };
  }

  /**
   * Generate category-specific report
   */
  private generateCategoryReport(category: string, metrics: Map<string, PerformanceMetric[]>): CategoryReport {
    const allValues: number[] = [];
    let alertCount = 0;

    for (const metricArray of metrics.values()) {
      allValues.push(...metricArray.map(m => m.value));
      alertCount += this.alertManager.getActiveAlerts()
        .filter(alert => alert.category === category).length;
    }

    const averageValue = allValues.length > 0 ? 
      allValues.reduce((sum, val) => sum + val, 0) / allValues.length : 0;
    const peakValue = allValues.length > 0 ? Math.max(...allValues) : 0;

    // Calculate health score (0-100)
    let healthScore = 100;
    if (alertCount > 0) {
      healthScore -= Math.min(50, alertCount * 10);
    }
    
    // Adjust based on performance vs targets
    const performanceRatio = this.getPerformanceRatio(category, averageValue);
    healthScore = Math.max(0, healthScore - (performanceRatio * 30));

    return {
      name: category,
      metricCount: Array.from(metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
      averageValue,
      peakValue,
      alertCount,
      trend: this.determineTrend(category, metrics),
      healthScore: Math.round(healthScore)
    };
  }

  /**
   * Determine trend direction for category
   */
  private determineTrend(category: string, metrics: Map<string, PerformanceMetric[]>): 'improving' | 'stable' | 'degrading' {
    let totalSlope = 0;
    let metricCount = 0;

    for (const metricArray of metrics.values()) {
      if (metricArray.length >= 3) {
        const trend = this.trendAnalyzer.analyzeTrend(metricArray);
        totalSlope += trend.slope;
        metricCount++;
      }
    }

    if (metricCount === 0) return 'stable';

    const averageSlope = totalSlope / metricCount;
    
    if (averageSlope < -0.1) return 'improving';
    if (averageSlope > 0.1) return 'degrading';
    return 'stable';
  }

  /**
   * Get performance ratio compared to targets
   */
  private getPerformanceRatio(category: string, averageValue: number): number {
    const targets: Record<string, number> = {
      'gameplay': 20, // 20ms target for gameplay actions
      'ui': 35,       // 35ms target for UI updates
      'network': 30,  // 30ms target for network operations
      'rendering': 16.67, // 60fps target
      'resources': 50 // 50% resource usage target
    };

    const target = targets[category] || 50;
    return Math.max(0, (averageValue - target) / target);
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(categories: Record<string, CategoryReport>, trends: Record<string, TrendData>): string[] {
    const recommendations: string[] = [];

    // Check each category health
    for (const [name, category] of Object.entries(categories)) {
      if (category.healthScore < 70) {
        recommendations.push(`${name} performance is degraded (health: ${category.healthScore}/100). Consider optimization.`);
      }
      
      if (category.trend === 'degrading') {
        recommendations.push(`${name} metrics show degrading trend. Investigation recommended.`);
      }
    }

    // Check specific performance targets
    const gameplayMetrics = this.metricsCollector.getMetrics('gameplay', 'action_execution_time');
    if (gameplayMetrics.length > 0) {
      const recentAvg = this.calculateAverageValue(gameplayMetrics, Date.now() - 60000);
      if (recentAvg > 25) {
        recommendations.push('Action execution time exceeds 25ms. Optimize game logic or enable performance mode.');
      }
    }

    const frameMetrics = this.metricsCollector.getMetrics('rendering', 'frame_time_ms');
    if (frameMetrics.length > 0) {
      const recentAvg = this.calculateAverageValue(frameMetrics, Date.now() - 60000);
      if (recentAvg > 18) {
        recommendations.push('Frame time exceeds 60fps target. Consider reducing visual complexity or optimizing render pipeline.');
      }
    }

    // Memory recommendations
    const memoryMetrics = this.metricsCollector.getMetrics('resources', 'memory_usage_mb');
    if (memoryMetrics.length > 0) {
      const recentPeak = this.calculatePeakValue(memoryMetrics, Date.now() - 300000);
      if (recentPeak > 400) {
        recommendations.push('Memory usage is high. Consider implementing garbage collection optimizations.');
      }
    }

    return recommendations;
  }

  /**
   * Calculate average value for metrics in time period
   */
  private calculateAverageValue(metrics: PerformanceMetric[], startTime: number): number {
    const recentMetrics = metrics.filter(m => m.timestamp > startTime);
    if (recentMetrics.length === 0) return 0;
    
    return recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;
  }

  /**
   * Calculate peak value for metrics in time period
   */
  private calculatePeakValue(metrics: PerformanceMetric[], startTime: number): number {
    const recentMetrics = metrics.filter(m => m.timestamp > startTime);
    if (recentMetrics.length === 0) return 0;
    
    return Math.max(...recentMetrics.map(m => m.value));
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(startTime: number): number {
    const totalAlerts = this.alertManager.getActiveAlerts().length;
    const criticalAlerts = this.alertManager.getAlertsBySeverity('critical').length;
    
    // Simple error rate calculation
    return totalAlerts > 0 ? (criticalAlerts / totalAlerts) * 100 : 0;
  }

  /**
   * Calculate throughput (actions per second)
   */
  private calculateThroughput(startTime: number): number {
    const actionMetrics = this.metricsCollector.getMetrics('gameplay', 'action_execution_time');
    const recentActions = actionMetrics.filter(m => m.timestamp > startTime);
    const durationSeconds = (Date.now() - startTime) / 1000;
    
    return durationSeconds > 0 ? recentActions.length / durationSeconds : 0;
  }

  /**
   * Get total metric count
   */
  private getTotalMetricCount(): number {
    const categories = ['gameplay', 'ui', 'network', 'rendering', 'resources'];
    let total = 0;
    
    for (const category of categories) {
      const metrics = this.metricsCollector.getCategoryMetrics(category);
      for (const metricArray of metrics.values()) {
        total += metricArray.length;
      }
    }
    
    return total;
  }

  /**
   * Trigger automatic optimization for critical performance issues
   */
  private triggerAutoOptimization(alert: PerformanceAlert): void {
    this.emit('auto-optimization-triggered', {
      alert,
      optimizations: this.getOptimizationSuggestions(alert)
    });
  }

  /**
   * Get optimization suggestions for specific alert
   */
  private getOptimizationSuggestions(alert: PerformanceAlert): string[] {
    const suggestions: string[] = [];
    
    switch (alert.metric) {
      case 'action_execution_time':
        suggestions.push('Enable action batching', 'Optimize game state updates', 'Use Web Workers for heavy calculations');
        break;
      case 'ui_update_time':
        suggestions.push('Implement virtual scrolling', 'Use React.memo for components', 'Debounce rapid updates');
        break;
      case 'frame_time_ms':
        suggestions.push('Reduce draw calls', 'Optimize shaders', 'Use object pooling');
        break;
      case 'memory_usage_mb':
        suggestions.push('Force garbage collection', 'Clear unused caches', 'Reduce object allocations');
        break;
      default:
        suggestions.push('Enable performance monitoring mode', 'Reduce background processes');
    }
    
    return suggestions;
  }

  /**
   * Cleanup old data
   */
  private cleanup(): void {
    this.metricsCollector.clearOldMetrics(this.options.metricsRetention);
    this.alertManager.clearOldAlerts(this.options.alertRetention);
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): Record<string, any> {
    return {
      alerts: this.alertManager.getAlertStats(),
      bufferSize: this.metricsCollector.getBufferSize(),
      memoryUsage: this.estimateMemoryUsage(),
      isRunning: this.isRunning
    };
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    // Simple estimation based on data structures
    return this.metricsCollector.getBufferSize() * 0.5 + // 0.5KB per buffered metric
           this.alertManager.getActiveAlerts().length * 1; // 1KB per active alert
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    return this.alertManager.acknowledgeAlert(alertId);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alertManager.getActiveAlerts();
  }

  /**
   * Get performance trends
   */
  getTrends(category?: string): Record<string, TrendData> {
    if (!category) {
      const allTrends: Record<string, TrendData> = {};
      const categories = ['gameplay', 'ui', 'network', 'rendering', 'resources'];
      
      for (const cat of categories) {
        const metrics = this.metricsCollector.getCategoryMetrics(cat);
        for (const [metricName, metricArray] of metrics) {
          if (metricArray.length >= 3) {
            allTrends[`${cat}:${metricName}`] = this.trendAnalyzer.analyzeTrend(metricArray);
          }
        }
      }
      
      return allTrends;
    } else {
      const trends: Record<string, TrendData> = {};
      const metrics = this.metricsCollector.getCategoryMetrics(category);
      
      for (const [metricName, metricArray] of metrics) {
        if (metricArray.length >= 3) {
          trends[metricName] = this.trendAnalyzer.analyzeTrend(metricArray);
        }
      }
      
      return trends;
    }
  }
}

// Export singleton instance for global use
export const performanceTracker = new PerformanceTracker();