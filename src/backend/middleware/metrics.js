/**
 * Prometheus Metrics Middleware for Universal PVP
 * Comprehensive application performance monitoring
 */

const prometheus = require('prom-client');
const responseTime = require('response-time');

// Create a Registry to register the metrics
const register = new prometheus.Registry();

// Add default Node.js metrics
prometheus.collectDefaultMetrics({ 
  register,
  timeout: 5000,
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10,
});

// Custom metrics for Strategic Duel
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 5, 15, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000],
});

const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestsFailed = new prometheus.Counter({
  name: 'http_requests_failed_total',
  help: 'Total number of failed HTTP requests',
  labelNames: ['method', 'route', 'error_type'],
});

const httpRequestsRateLimited = new prometheus.Counter({
  name: 'http_requests_rate_limited_total',
  help: 'Total number of rate limited requests',
  labelNames: ['method', 'route', 'ip'],
});

// Strategic Duel specific metrics
const strategicDuelGamesStarted = new prometheus.Counter({
  name: 'strategic_duel_games_started_total',
  help: 'Total number of Strategic Duel games started',
  labelNames: ['priority'],
});

const strategicDuelGamesCompleted = new prometheus.Counter({
  name: 'strategic_duel_games_completed_total',  
  help: 'Total number of Strategic Duel games completed',
  labelNames: ['priority', 'winner_type'],
});

const strategicDuelGamesFailed = new prometheus.Counter({
  name: 'strategic_duel_games_failed_total',
  help: 'Total number of Strategic Duel games that failed',
  labelNames: ['priority', 'error_type'],
});

const strategicDuelActionLatency = new prometheus.Histogram({
  name: 'strategic_duel_action_latency_ms',
  help: 'Latency of Strategic Duel actions in milliseconds',
  labelNames: ['action_type', 'priority'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
});

const strategicDuelActionsTotal = new prometheus.Counter({
  name: 'strategic_duel_actions_total',
  help: 'Total number of Strategic Duel actions executed',
  labelNames: ['action', 'priority', 'success'],
});

const strategicDuelTransactionCost = new prometheus.Histogram({
  name: 'strategic_duel_transaction_cost_lamports',
  help: 'Transaction cost in lamports for Strategic Duel actions',
  labelNames: ['action_type', 'priority'],
  buckets: [1000, 5000, 10000, 25000, 50000, 100000, 200000, 500000],
});

const strategicDuelCostWithinTarget = new prometheus.Counter({
  name: 'strategic_duel_cost_within_target_total',
  help: 'Number of transactions within cost target',
  labelNames: ['action_type', 'target_met'],
});

const strategicDuelSessionInitDuration = new prometheus.Histogram({
  name: 'strategic_duel_session_init_duration_ms',
  help: 'Duration of Strategic Duel session initialization in milliseconds',
  labelNames: ['priority'],
  buckets: [100, 500, 1000, 2000, 5000, 10000, 20000],
});

const strategicDuelSessionInitCost = new prometheus.Histogram({
  name: 'strategic_duel_session_init_cost_lamports',
  help: 'Cost of Strategic Duel session initialization in lamports',
  labelNames: ['priority'],
  buckets: [5000, 10000, 25000, 50000, 100000, 200000],
});

// WebSocket metrics
const websocketConnections = new prometheus.Gauge({
  name: 'strategic_duel_websocket_connections',
  help: 'Number of active WebSocket connections',
  labelNames: ['room_type'],
});

const websocketConnectionsTotal = new prometheus.Counter({
  name: 'strategic_duel_websocket_connections_total',
  help: 'Total number of WebSocket connections established',
  labelNames: ['room_type'],
});

const websocketDisconnectionsTotal = new prometheus.Counter({
  name: 'strategic_duel_websocket_disconnections_total',
  help: 'Total number of WebSocket disconnections',
  labelNames: ['room_type', 'reason'],
});

const websocketMessagesSent = new prometheus.Counter({
  name: 'strategic_duel_websocket_messages_sent_total',
  help: 'Total number of WebSocket messages sent',
  labelNames: ['message_type', 'room_type'],
});

const websocketMessagesReceived = new prometheus.Counter({
  name: 'strategic_duel_websocket_messages_received_total',
  help: 'Total number of WebSocket messages received',
  labelNames: ['message_type', 'room_type'],
});

// Security metrics
const securityEventsTotal = new prometheus.Counter({
  name: 'security_events_total',
  help: 'Total number of security events detected',
  labelNames: ['event_type', 'severity', 'source_ip'],
});

const authenticationAttemptsTotal = new prometheus.Counter({
  name: 'authentication_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['method', 'success', 'source_ip'],
});

const suspiciousActivityTotal = new prometheus.Counter({
  name: 'suspicious_activity_total',
  help: 'Total number of suspicious activities detected',
  labelNames: ['activity_type', 'action_taken'],
});

// Database metrics
const databaseQueryDuration = new prometheus.Histogram({
  name: 'database_query_duration_ms',
  help: 'Duration of database queries in milliseconds',
  labelNames: ['query_type', 'table'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

const databaseConnectionsActive = new prometheus.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
});

const databaseConnectionsTotal = new prometheus.Counter({
  name: 'database_connections_total',
  help: 'Total number of database connections established',
  labelNames: ['status'],
});

// Cache metrics (Redis)
const cacheHitsTotal = new prometheus.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type', 'key_pattern'],
});

const cacheMissesTotal = new prometheus.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type', 'key_pattern'],
});

const cacheOperationDuration = new prometheus.Histogram({
  name: 'cache_operation_duration_ms',
  help: 'Duration of cache operations in milliseconds',
  labelNames: ['operation', 'cache_type'],
  buckets: [0.5, 1, 2, 5, 10, 25, 50, 100],
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(httpRequestsFailed);
register.registerMetric(httpRequestsRateLimited);
register.registerMetric(strategicDuelGamesStarted);
register.registerMetric(strategicDuelGamesCompleted);
register.registerMetric(strategicDuelGamesFailed);
register.registerMetric(strategicDuelActionLatency);
register.registerMetric(strategicDuelActionsTotal);
register.registerMetric(strategicDuelTransactionCost);
register.registerMetric(strategicDuelCostWithinTarget);
register.registerMetric(strategicDuelSessionInitDuration);
register.registerMetric(strategicDuelSessionInitCost);
register.registerMetric(websocketConnections);
register.registerMetric(websocketConnectionsTotal);
register.registerMetric(websocketDisconnectionsTotal);
register.registerMetric(websocketMessagesSent);
register.registerMetric(websocketMessagesReceived);
register.registerMetric(securityEventsTotal);
register.registerMetric(authenticationAttemptsTotal);
register.registerMetric(suspiciousActivityTotal);
register.registerMetric(databaseQueryDuration);
register.registerMetric(databaseConnectionsActive);
register.registerMetric(databaseConnectionsTotal);
register.registerMetric(cacheHitsTotal);
register.registerMetric(cacheMissesTotal);
register.registerMetric(cacheOperationDuration);

/**
 * HTTP Request metrics middleware
 */
const httpMetricsMiddleware = responseTime((req, res, time) => {
  const route = req.route?.path || req.url;
  const method = req.method;
  const statusCode = res.statusCode.toString();
  
  // Record request duration
  httpRequestDuration
    .labels(method, route, statusCode)
    .observe(time);
  
  // Record request count
  httpRequestTotal
    .labels(method, route, statusCode)
    .inc();
  
  // Record failures (4xx, 5xx)
  if (res.statusCode >= 400) {
    const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
    httpRequestsFailed
      .labels(method, route, errorType)
      .inc();
  }
});

/**
 * Rate limiting metrics middleware
 */
const rateLimitMetricsMiddleware = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (res.statusCode === 429) {
      const route = req.route?.path || req.url;
      const method = req.method;
      const ip = req.ip || req.connection.remoteAddress;
      
      httpRequestsRateLimited
        .labels(method, route, ip)
        .inc();
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Strategic Duel game metrics
 */
const strategicDuelMetrics = {
  recordGameStarted: (priority) => {
    strategicDuelGamesStarted.labels(priority).inc();
  },
  
  recordGameCompleted: (priority, winnerType) => {
    strategicDuelGamesCompleted.labels(priority, winnerType).inc();
  },
  
  recordGameFailed: (priority, errorType) => {
    strategicDuelGamesFailed.labels(priority, errorType).inc();
  },
  
  recordActionLatency: (actionType, priority, latency) => {
    strategicDuelActionLatency.labels(actionType, priority).observe(latency);
  },
  
  recordAction: (action, priority, success) => {
    strategicDuelActionsTotal.labels(action, priority, success ? 'true' : 'false').inc();
  },
  
  recordTransactionCost: (actionType, priority, cost) => {
    strategicDuelTransactionCost.labels(actionType, priority).observe(cost);
  },
  
  recordCostTargetCompliance: (actionType, withinTarget) => {
    strategicDuelCostWithinTarget.labels(actionType, withinTarget ? 'true' : 'false').inc();
  },
  
  recordSessionInitDuration: (priority, duration) => {
    strategicDuelSessionInitDuration.labels(priority).observe(duration);
  },
  
  recordSessionInitCost: (priority, cost) => {
    strategicDuelSessionInitCost.labels(priority).observe(cost);
  },
};

/**
 * WebSocket metrics
 */
const websocketMetrics = {
  recordConnection: (roomType) => {
    websocketConnections.labels(roomType).inc();
    websocketConnectionsTotal.labels(roomType).inc();
  },
  
  recordDisconnection: (roomType, reason) => {
    websocketConnections.labels(roomType).dec();
    websocketDisconnectionsTotal.labels(roomType, reason).inc();
  },
  
  recordMessageSent: (messageType, roomType) => {
    websocketMessagesSent.labels(messageType, roomType).inc();
  },
  
  recordMessageReceived: (messageType, roomType) => {
    websocketMessagesReceived.labels(messageType, roomType).inc();
  },
};

/**
 * Security metrics
 */
const securityMetrics = {
  recordSecurityEvent: (eventType, severity, sourceIp) => {
    securityEventsTotal.labels(eventType, severity, sourceIp).inc();
  },
  
  recordAuthenticationAttempt: (method, success, sourceIp) => {
    authenticationAttemptsTotal.labels(method, success ? 'true' : 'false', sourceIp).inc();
  },
  
  recordSuspiciousActivity: (activityType, actionTaken) => {
    suspiciousActivityTotal.labels(activityType, actionTaken).inc();
  },
};

/**
 * Database metrics
 */
const databaseMetrics = {
  recordQueryDuration: (queryType, table, duration) => {
    databaseQueryDuration.labels(queryType, table).observe(duration);
  },
  
  setActiveConnections: (count) => {
    databaseConnectionsActive.set(count);
  },
  
  recordConnection: (status) => {
    databaseConnectionsTotal.labels(status).inc();
  },
};

/**
 * Cache metrics  
 */
const cacheMetrics = {
  recordHit: (cacheType, keyPattern) => {
    cacheHitsTotal.labels(cacheType, keyPattern).inc();
  },
  
  recordMiss: (cacheType, keyPattern) => {
    cacheMissesTotal.labels(cacheType, keyPattern).inc();
  },
  
  recordOperationDuration: (operation, cacheType, duration) => {
    cacheOperationDuration.labels(operation, cacheType).observe(duration);
  },
};

/**
 * Metrics endpoint handler
 */
const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error.message);
  }
};

/**
 * Health metrics for the metrics system itself
 */
const metricsHealthHandler = (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metrics: {
      registered: register._metrics.size,
      defaultMetricsEnabled: true,
    },
  };
  
  res.json(health);
};

/**
 * Custom metrics for specific application events
 */
const customMetrics = {
  // Game-specific metrics
  recordMatchmakingDuration: (priority, duration) => {
    const matchmakingDuration = new prometheus.Histogram({
      name: 'strategic_duel_matchmaking_duration_ms',
      help: 'Duration of matchmaking process in milliseconds',
      labelNames: ['priority'],
      buckets: [100, 500, 1000, 2000, 5000, 10000, 30000],
    });
    
    if (!register.getSingleMetric('strategic_duel_matchmaking_duration_ms')) {
      register.registerMetric(matchmakingDuration);
    }
    
    matchmakingDuration.labels(priority).observe(duration);
  },
  
  recordPlayerCount: (count) => {
    const playerCount = new prometheus.Gauge({
      name: 'strategic_duel_active_players',
      help: 'Number of active players in the system',
    });
    
    if (!register.getSingleMetric('strategic_duel_active_players')) {
      register.registerMetric(playerCount);
    }
    
    playerCount.set(count);
  },
  
  recordMagicBlockLatency: (operation, latency) => {
    const magicBlockLatency = new prometheus.Histogram({
      name: 'magicblock_operation_latency_ms',
      help: 'Latency of MagicBlock operations in milliseconds',
      labelNames: ['operation'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
    });
    
    if (!register.getSingleMetric('magicblock_operation_latency_ms')) {
      register.registerMetric(magicBlockLatency);
    }
    
    magicBlockLatency.labels(operation).observe(latency);
  },
};

module.exports = {
  register,
  httpMetricsMiddleware,
  rateLimitMetricsMiddleware,
  strategicDuelMetrics,
  websocketMetrics,
  securityMetrics,
  databaseMetrics,
  cacheMetrics,
  customMetrics,
  metricsHandler,
  metricsHealthHandler,
  
  // Individual metrics for direct access if needed
  httpRequestDuration,
  httpRequestTotal,
  httpRequestsFailed,
  strategicDuelGamesStarted,
  strategicDuelGamesCompleted,
  strategicDuelActionLatency,
  strategicDuelTransactionCost,
  websocketConnections,
  securityEventsTotal,
};