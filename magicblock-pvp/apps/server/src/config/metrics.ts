import promClient from 'prom-client';
// import promApiMetrics from 'prometheus-api-metrics'; // Reserved for future API metrics middleware
import express from 'express';
import { logger } from './logger';
import { config } from './environment';

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'magicblock_pvp_',
});

// Custom metrics for the game
export const metrics = {
  // Game metrics
  gamesTotal: new promClient.Counter({
    name: 'magicblock_pvp_games_total',
    help: 'Total number of games played',
    labelNames: ['type', 'status'],
    registers: [register],
  }),

  gameDuration: new promClient.Histogram({
    name: 'magicblock_pvp_game_duration_seconds',
    help: 'Duration of games in seconds',
    labelNames: ['type', 'result'],
    buckets: [30, 60, 120, 300, 600, 1200, 1800, 3600],
    registers: [register],
  }),

  playersOnline: new promClient.Gauge({
    name: 'magicblock_pvp_players_online',
    help: 'Number of players currently online',
    registers: [register],
  }),

  // Blockchain metrics
  solanaTransactions: new promClient.Counter({
    name: 'magicblock_pvp_solana_transactions_total',
    help: 'Total number of Solana transactions',
    labelNames: ['type', 'status'],
    registers: [register],
  }),

  solanaTransactionFees: new promClient.Histogram({
    name: 'magicblock_pvp_solana_transaction_fees_sol',
    help: 'Solana transaction fees in SOL',
    labelNames: ['type'],
    buckets: [0.000005, 0.00001, 0.00005, 0.0001, 0.0005, 0.001, 0.005, 0.01],
    registers: [register],
  }),

  // WebSocket metrics
  websocketConnections: new promClient.Gauge({
    name: 'magicblock_pvp_websocket_connections',
    help: 'Number of active WebSocket connections',
    registers: [register],
  }),

  websocketMessages: new promClient.Counter({
    name: 'magicblock_pvp_websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['type', 'direction'],
    registers: [register],
  }),

  // Queue metrics
  queueJobs: new promClient.Gauge({
    name: 'magicblock_pvp_queue_jobs',
    help: 'Number of jobs in queue',
    labelNames: ['queue', 'status'],
    registers: [register],
  }),

  queueJobDuration: new promClient.Histogram({
    name: 'magicblock_pvp_queue_job_duration_seconds',
    help: 'Duration of queue job processing',
    labelNames: ['queue', 'job_type'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register],
  }),

  // Cost tracking metrics
  costTotal: new promClient.Counter({
    name: 'magicblock_pvp_cost_total_usd',
    help: 'Total cost in USD',
    labelNames: ['category', 'operation'],
    registers: [register],
  }),

  // Performance metrics
  databaseQueries: new promClient.Counter({
    name: 'magicblock_pvp_database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['table', 'operation'],
    registers: [register],
  }),

  databaseQueryDuration: new promClient.Histogram({
    name: 'magicblock_pvp_database_query_duration_seconds',
    help: 'Database query duration',
    labelNames: ['table', 'operation'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  redisOperations: new promClient.Counter({
    name: 'magicblock_pvp_redis_operations_total',
    help: 'Total number of Redis operations',
    labelNames: ['operation', 'status'],
    registers: [register],
  }),

  // Error metrics
  errors: new promClient.Counter({
    name: 'magicblock_pvp_errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'endpoint'],
    registers: [register],
  }),

  // Business metrics
  playerRegistrations: new promClient.Counter({
    name: 'magicblock_pvp_player_registrations_total',
    help: 'Total number of player registrations',
    registers: [register],
  }),

  betsTotal: new promClient.Counter({
    name: 'magicblock_pvp_bets_total_sol',
    help: 'Total amount bet in SOL',
    labelNames: ['game_type'],
    registers: [register],
  }),

  winningsTotal: new promClient.Counter({
    name: 'magicblock_pvp_winnings_total_sol',
    help: 'Total winnings paid out in SOL',
    labelNames: ['game_type'],
    registers: [register],
  }),
};

// Initialize metrics collection
export function initializeMetrics() {
  const app = express();
  
  // Prometheus metrics endpoint
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      res.status(500).end();
    }
  });

  // Health endpoint for metrics server
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Start metrics server
  const server = app.listen(config.monitoring.prometheusPort, () => {
    logger.info(`📊 Metrics server running on port ${config.monitoring.prometheusPort}`);
  });

  return server;
}

// Utility functions for common metric operations
export const metricsUtils = {
  recordGameStart: (gameType: string) => {
    metrics.gamesTotal.inc({ type: gameType, status: 'started' });
  },

  recordGameEnd: (gameType: string, duration: number, result: string) => {
    metrics.gamesTotal.inc({ type: gameType, status: 'completed' });
    metrics.gameDuration.observe({ type: gameType, result }, duration);
  },

  updatePlayersOnline: (count: number) => {
    metrics.playersOnline.set(count);
  },

  recordSolanaTransaction: (type: string, status: string, fee: number) => {
    metrics.solanaTransactions.inc({ type, status });
    metrics.solanaTransactionFees.observe({ type }, fee);
  },

  recordWebSocketConnection: (delta: number) => {
    metrics.websocketConnections.inc(delta);
  },

  recordWebSocketMessage: (type: string, direction: 'in' | 'out') => {
    metrics.websocketMessages.inc({ type, direction });
  },

  recordQueueJob: (queue: string, jobType: string, duration: number, status: 'completed' | 'failed') => {
    metrics.queueJobDuration.observe({ queue, job_type: jobType }, duration);
    metrics.queueJobs.dec({ queue, status: 'active' });
    metrics.queueJobs.inc({ queue, status });
  },

  recordCost: (category: string, operation: string, costUsd: number) => {
    metrics.costTotal.inc({ category, operation }, costUsd);
  },

  recordDatabaseQuery: (table: string, operation: string, duration: number) => {
    metrics.databaseQueries.inc({ table, operation });
    metrics.databaseQueryDuration.observe({ table, operation }, duration);
  },

  recordRedisOperation: (operation: string, status: 'success' | 'error') => {
    metrics.redisOperations.inc({ operation, status });
  },

  recordError: (type: string, endpoint?: string) => {
    metrics.errors.inc({ type, endpoint: endpoint || 'unknown' });
  },

  recordPlayerRegistration: () => {
    metrics.playerRegistrations.inc();
  },

  recordBet: (gameType: string, amount: number) => {
    metrics.betsTotal.inc({ game_type: gameType }, amount);
  },

  recordWinnings: (gameType: string, amount: number) => {
    metrics.winningsTotal.inc({ game_type: gameType }, amount);
  },
};

export { register };
export default metrics;