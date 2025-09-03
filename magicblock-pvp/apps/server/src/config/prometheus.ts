import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { config } from './environment';
import { logger } from './logger';

// Collect default system metrics
collectDefaultMetrics({
  register,
  prefix: 'solana_pvp_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10
});

// Custom metrics for cost tracking and performance

// Cost Metrics
export const costMetrics = {
  // Total costs tracked
  totalCost: new Counter({
    name: 'solana_pvp_total_cost_usd',
    help: 'Total costs in USD across all operations',
    labelNames: ['category', 'operation', 'game_id']
  }),

  // Transaction costs
  transactionCosts: new Histogram({
    name: 'solana_pvp_transaction_cost_lamports',
    help: 'Transaction costs in lamports',
    labelNames: ['operation', 'priority', 'success'],
    buckets: [1000, 5000, 10000, 25000, 50000, 100000, 250000]
  }),

  // Compute unit usage
  computeUnits: new Histogram({
    name: 'solana_pvp_compute_units',
    help: 'Compute units consumed per operation',
    labelNames: ['operation', 'success'],
    buckets: [10000, 50000, 100000, 200000, 500000, 1000000]
  }),

  // Cost per game
  gameCosts: new Histogram({
    name: 'solana_pvp_game_cost_usd',
    help: 'Total cost per game in USD',
    labelNames: ['game_type'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
  })
};

// Transaction Queue Metrics
export const queueMetrics = {
  // Queue sizes
  queueSize: new Gauge({
    name: 'solana_pvp_queue_size',
    help: 'Number of transactions in queue by priority',
    labelNames: ['priority']
  }),

  // Processing times
  processingTime: new Histogram({
    name: 'solana_pvp_transaction_processing_seconds',
    help: 'Transaction processing time in seconds',
    labelNames: ['operation', 'priority', 'success'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
  }),

  // Transaction outcomes
  transactionOutcomes: new Counter({
    name: 'solana_pvp_transaction_outcomes_total',
    help: 'Count of transaction outcomes',
    labelNames: ['status', 'operation', 'priority']
  }),

  // Queue wait times
  queueWaitTime: new Histogram({
    name: 'solana_pvp_queue_wait_seconds',
    help: 'Time transactions spend waiting in queue',
    labelNames: ['priority'],
    buckets: [0.1, 1, 5, 10, 30, 60, 120]
  }),

  // Retry attempts
  retryAttempts: new Counter({
    name: 'solana_pvp_transaction_retries_total',
    help: 'Number of transaction retry attempts',
    labelNames: ['operation', 'retry_reason']
  })
};

// Network and Fee Metrics
export const networkMetrics = {
  // Network congestion level
  congestionLevel: new Gauge({
    name: 'solana_pvp_network_congestion_level',
    help: 'Network congestion level (0=low, 1=medium, 2=high)',
  }),

  // Priority fees
  priorityFees: new Histogram({
    name: 'solana_pvp_priority_fee_lamports',
    help: 'Priority fees paid in lamports',
    labelNames: ['priority_level'],
    buckets: [1000, 5000, 10000, 25000, 50000, 100000]
  }),

  // Fee estimation accuracy
  feeEstimationAccuracy: new Histogram({
    name: 'solana_pvp_fee_estimation_accuracy_percent',
    help: 'Accuracy of fee estimation vs actual fees',
    buckets: [50, 70, 80, 90, 95, 98, 100]
  }),

  // Confirmation times
  confirmationTime: new Histogram({
    name: 'solana_pvp_confirmation_time_seconds',
    help: 'Transaction confirmation time in seconds',
    labelNames: ['priority'],
    buckets: [1, 5, 10, 15, 30, 60, 120]
  })
};

// Performance Metrics
export const performanceMetrics = {
  // VRF generation time
  vrfGenerationTime: new Histogram({
    name: 'solana_pvp_vrf_generation_seconds',
    help: 'VRF generation time in seconds',
    buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1]
  }),

  // Rollup settlement time
  rollupSettlementTime: new Histogram({
    name: 'solana_pvp_rollup_settlement_seconds',
    help: 'Rollup settlement time in seconds',
    buckets: [0.5, 1, 2, 3, 5, 10, 15]
  }),

  // Database query times
  databaseQueryTime: new Histogram({
    name: 'solana_pvp_db_query_seconds',
    help: 'Database query execution time',
    labelNames: ['operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25]
  }),

  // WebSocket latency
  websocketLatency: new Histogram({
    name: 'solana_pvp_websocket_latency_seconds',
    help: 'WebSocket message latency',
    labelNames: ['message_type'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0]
  }),

  // Game session metrics
  gameSessionDuration: new Histogram({
    name: 'solana_pvp_game_session_seconds',
    help: 'Duration of game sessions',
    buckets: [30, 60, 120, 300, 600, 1800]
  }),

  // Active connections
  activeConnections: new Gauge({
    name: 'solana_pvp_active_connections',
    help: 'Number of active WebSocket connections'
  })
};

// Business Metrics
export const businessMetrics = {
  // Games played
  gamesPlayed: new Counter({
    name: 'solana_pvp_games_played_total',
    help: 'Total number of games played',
    labelNames: ['game_type', 'outcome']
  }),

  // Player activity
  playerActivity: new Counter({
    name: 'solana_pvp_player_activity_total',
    help: 'Player activity events',
    labelNames: ['activity_type', 'player_tier']
  }),

  // Revenue tracking
  revenue: new Counter({
    name: 'solana_pvp_revenue_usd',
    help: 'Revenue generated in USD',
    labelNames: ['source', 'game_type']
  }),

  // Error rates
  errorRate: new Counter({
    name: 'solana_pvp_errors_total',
    help: 'Total errors by type',
    labelNames: ['error_type', 'service', 'severity']
  })
};

// Utility functions for updating metrics

export const recordCostMetric = (
  category: string,
  operation: string,
  costUsd: number,
  lamports?: number,
  computeUnits?: number,
  gameId?: string,
  success: boolean = true
) => {
  costMetrics.totalCost.labels(category, operation, gameId || 'unknown').inc(costUsd);
  
  if (lamports) {
    costMetrics.transactionCosts.labels(operation, 'medium', success.toString()).observe(lamports);
  }
  
  if (computeUnits) {
    costMetrics.computeUnits.labels(operation, success.toString()).observe(computeUnits);
  }
};

export const recordQueueMetric = (
  operation: string,
  priority: string,
  processingTimeMs: number,
  success: boolean,
  retries: number = 0
) => {
  queueMetrics.processingTime
    .labels(operation, priority, success.toString())
    .observe(processingTimeMs / 1000);
    
  queueMetrics.transactionOutcomes
    .labels(success ? 'success' : 'failure', operation, priority)
    .inc();
    
  if (retries > 0) {
    queueMetrics.retryAttempts
      .labels(operation, 'network_error')
      .inc(retries);
  }
};

export const updateQueueSizes = (queueSizes: Record<string, number>) => {
  Object.entries(queueSizes).forEach(([priority, size]) => {
    queueMetrics.queueSize.labels(priority).set(size);
  });
};

export const recordNetworkMetrics = (
  congestionLevel: 'low' | 'medium' | 'high',
  priorityFee: number,
  confirmationTimeMs: number
) => {
  const congestionValue = congestionLevel === 'low' ? 0 : congestionLevel === 'medium' ? 1 : 2;
  networkMetrics.congestionLevel.set(congestionValue);
  
  networkMetrics.priorityFees.labels(congestionLevel).observe(priorityFee);
  networkMetrics.confirmationTime.labels(congestionLevel).observe(confirmationTimeMs / 1000);
};

export const recordPerformanceMetric = (
  metric: 'vrf' | 'rollup' | 'db' | 'websocket',
  durationMs: number,
  labels: Record<string, string> = {}
) => {
  const durationSeconds = durationMs / 1000;
  
  switch (metric) {
    case 'vrf':
      performanceMetrics.vrfGenerationTime.observe(durationSeconds);
      break;
    case 'rollup':
      performanceMetrics.rollupSettlementTime.observe(durationSeconds);
      break;
    case 'db':
      performanceMetrics.databaseQueryTime
        .labels(labels.operation || 'unknown', labels.table || 'unknown')
        .observe(durationSeconds);
      break;
    case 'websocket':
      performanceMetrics.websocketLatency
        .labels(labels.messageType || 'unknown')
        .observe(durationSeconds);
      break;
  }
};

export const recordBusinessMetric = (
  type: 'game' | 'player' | 'revenue' | 'error',
  value: number,
  labels: Record<string, string> = {}
) => {
  switch (type) {
    case 'game':
      businessMetrics.gamesPlayed
        .labels(labels.gameType || 'unknown', labels.outcome || 'unknown')
        .inc(value);
      break;
    case 'player':
      businessMetrics.playerActivity
        .labels(labels.activityType || 'unknown', labels.playerTier || 'unknown')
        .inc(value);
      break;
    case 'revenue':
      businessMetrics.revenue
        .labels(labels.source || 'unknown', labels.gameType || 'unknown')
        .inc(value);
      break;
    case 'error':
      businessMetrics.errorRate
        .labels(labels.errorType || 'unknown', labels.service || 'unknown', labels.severity || 'unknown')
        .inc(value);
      break;
  }
};

// Health check endpoint
export const getHealthMetrics = async () => {
  try {
    // Check if metrics are available
    await register.metrics();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        totalCostTracked: 'Available via /metrics endpoint',
        activeQueueSize: 'Available via /metrics endpoint',
        networkCongestion: 'Available via /metrics endpoint',
        activeConnections: 'Available via /metrics endpoint',
        metricsEndpoint: '/metrics'
      }
    };
  } catch (error) {
    logger.error('Error getting health metrics:', error);
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to retrieve metrics'
    };
  }
};

// Export the register for /metrics endpoint
export { register };

logger.info('Prometheus metrics initialized', {
  port: config.monitoring.prometheusPort,
  metricsCount: register.getMetricsAsArray().length
});