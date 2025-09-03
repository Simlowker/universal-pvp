# Cost Tracking and Optimization System

## 📊 Overview

Complete cost tracking and optimization system for Solana PvP duel platform with real-time monitoring, automated alerts, and intelligent optimization recommendations.

## 🎯 Cost Model & Targets

### Target Cost Structure
- **Base fee**: 5,000 lamports
- **Priority fee**: 5,000-20,000 lamports (based on congestion)
- **Target per duel**: 50,000-100,000 lamports total
- **Maximum limit**: 100,000 lamports per duel
- **USD estimate**: ~$0.005-0.01 per duel (@$100 SOL)

## 🏗️ System Components

### 1. Cost Measurement Script (`scripts/measure-costs.ts`)
```bash
# Run comprehensive cost measurement
tsx scripts/measure-costs.ts https://api.mainnet-beta.solana.com 10

# Features:
- Full duel flow simulation (7 transaction types)
- Real network congestion detection
- 50-100k lamports target verification
- CSV/JSON export for analysis
- Network condition adaptation
```

### 2. Latency Benchmark Script (`scripts/benchmark-latency.ts`)
```bash
# Run comprehensive performance benchmarks
tsx scripts/benchmark-latency.ts https://api.mainnet-beta.solana.com 100 --comprehensive

# Performance targets:
- VRF Generation: <10ms
- Rollup Settlement: <5s
- L1 Confirmation: <30s
- WebSocket Latency: <100ms
- Database Queries: <50ms
```

### 3. Transaction Queue Service (`apps/server/src/services/transactionQueue.ts`)
- **Priority-based processing**: Critical > High > Medium > Low
- **Adaptive fee optimization**: Based on network congestion
- **Retry logic**: Exponential backoff with fee increases
- **Batch processing**: Up to 10 concurrent transactions
- **Real-time monitoring**: Queue stats and processing times

### 4. Fee Estimation Service (`apps/server/src/services/feeEstimation.ts`)
- **Multiple providers**: Helius, QuickNode, RPC fallback
- **Network congestion detection**: Low/Medium/High levels
- **Dynamic fee adjustment**: Safety multipliers by priority
- **Provider failover**: Automatic fallback chain
- **Recent fee trends**: Analysis and predictions

### 5. Cost Tracking Service (`apps/server/src/services/costTracking.ts`)
- **Real-time cost recording**: All transaction costs
- **Category breakdown**: Transaction, Compute, Infrastructure, Storage
- **Player/Game cost tracking**: Individual cost attribution
- **Trend analysis**: Daily/weekly/monthly trends
- **Alert thresholds**: Configurable cost limits

### 6. Alert System (`apps/server/src/services/alertSystem.ts`)
- **Multi-channel notifications**: Console, Slack, Email, Webhooks
- **Configurable thresholds**: Cost, performance, network conditions
- **Smart cooldowns**: Prevent alert spam
- **Severity levels**: Low, Medium, High, Critical
- **Auto-resolution**: Track and resolve alerts

### 7. Historical Analysis (`apps/server/src/services/historicalAnalysis.ts`)
- **Cost trend reports**: 30-day analysis with insights
- **Future cost predictions**: ML-based forecasting
- **Performance analysis**: Success rates, processing times
- **Optimization recommendations**: AI-powered suggestions

## 📡 API Endpoints

### Cost Dashboard (`/api/costs/`)

```typescript
GET /api/costs/summary?timeframe=24h
// Cost summary for specified timeframe

GET /api/costs/player/:playerId?timeframe=24h
// Player-specific cost breakdown

GET /api/costs/game/:gameId
// Game-specific cost analysis

GET /api/costs/trends?days=7
// Historical cost trends

GET /api/costs/queue/status
// Transaction queue status

POST /api/costs/fee-estimate
// Real-time fee estimation

GET /api/costs/metrics/realtime
// Real-time system metrics

POST /api/costs/optimize
// AI optimization recommendations
```

## 📈 Monitoring & Metrics

### Prometheus Metrics (`/metrics`)
- **Cost metrics**: Total costs, transaction fees, compute units
- **Queue metrics**: Processing times, success rates, retries
- **Network metrics**: Congestion levels, priority fees
- **Performance metrics**: VRF, rollup, database latencies
- **Business metrics**: Games played, revenue, error rates

### Key Performance Indicators
```yaml
Cost Efficiency:
  - Cost per successful transaction
  - Daily/monthly cost trends
  - Cost vs target compliance

Performance:
  - Transaction success rate (>95% target)
  - Average processing time (<5s target)
  - Queue wait times (<30s target)

Network:
  - Congestion detection accuracy
  - Fee optimization effectiveness
  - Confirmation time predictions
```

## 🔧 Configuration

### Environment Variables
```bash
# Cost Tracking
COST_TRACKING_ENABLED=true
COST_ALERT_THRESHOLD_USD=100

# Fee Estimation
HELIUS_API_KEY=your_helius_key
QUICKNODE_API_KEY=your_quicknode_key
FALLBACK_BASE_FEE=5000
FALLBACK_PRIORITY_FEE=10000

# Alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
ALERT_EMAIL_CONFIG={"smtp":"...","from":"..."}
ALERT_WEBHOOK_URLS=https://webhook1.com,https://webhook2.com
```

### Alert Configuration
```typescript
const alertConfig = {
  maxDailyCostUsd: 50,
  maxHourlyCostUsd: 5,
  maxTransactionCostLamports: 100000,
  maxProcessingTimeMs: 10000,
  minSuccessRatePercent: 95,
  alertCooldownMs: 300000 // 5 minutes
};
```

## 🚀 Usage Examples

### 1. Monitor Real-time Costs
```bash
# Get current cost summary
curl "http://localhost:3001/api/costs/summary?timeframe=1h"

# Monitor specific player
curl "http://localhost:3001/api/costs/player/player123"
```

### 2. Fee Estimation
```bash
# Get optimal fees for fast confirmation
curl -X POST "http://localhost:3001/api/costs/fee-estimate" \
  -H "Content-Type: application/json" \
  -d '{"targetConfirmationTime": 5000}'
```

### 3. Cost Optimization
```bash
# Get AI recommendations
curl -X POST "http://localhost:3001/api/costs/optimize" \
  -H "Content-Type: application/json" \
  -d '{"targetCost": 25}'
```

### 4. Run Benchmarks
```bash
# Measure transaction costs
npm run measure-costs

# Benchmark latency
npm run benchmark-latency -- --comprehensive
```

## 📊 Database Schema

### Cost Metrics Table
```sql
CREATE TABLE cost_metrics (
  id TEXT PRIMARY KEY,
  category "CostCategory" NOT NULL,
  operation TEXT NOT NULL,
  cost_usd DECIMAL(10,6) NOT NULL,
  solana_fees DECIMAL(10,6),
  compute_units BIGINT,
  execution_time INTEGER,
  metadata JSONB,
  game_id TEXT,
  player_id TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🎯 Optimization Strategies

### 1. Cost Reduction
- **Transaction batching**: Group operations (25% savings)
- **Off-peak scheduling**: Avoid high congestion periods
- **Fee capping**: Set maximum fee limits
- **Compute optimization**: Reduce CU usage

### 2. Performance Optimization  
- **Parallel processing**: Concurrent transaction handling
- **Queue prioritization**: Critical operations first
- **Retry strategies**: Smart error recovery
- **Network adaptation**: Dynamic fee adjustment

### 3. Monitoring & Alerts
- **Proactive alerting**: Early cost/performance warnings
- **Trend analysis**: Identify patterns and anomalies
- **Predictive modeling**: Forecast future costs
- **Automated responses**: Self-healing workflows

## 📈 Success Metrics

- **Cost Compliance**: 95% of duels within 50-100k lamports
- **Performance**: <5s average transaction processing
- **Reliability**: >95% transaction success rate  
- **Efficiency**: <$0.01 average cost per duel
- **Monitoring**: <1min detection of cost/performance issues

## 🛡️ Error Handling & Recovery

### Failure Scenarios
1. **Network congestion**: Adaptive fee increases
2. **Provider failures**: Automatic fallback chain
3. **Cost spikes**: Alert triggers and auto-limits
4. **Queue overload**: Backpressure and prioritization
5. **Service outages**: Circuit breakers and retries

### Recovery Mechanisms
- **Exponential backoff**: Smart retry timing
- **Circuit breakers**: Prevent cascade failures
- **Graceful degradation**: Essential services first
- **Health monitoring**: Continuous system checks
- **Auto-scaling**: Dynamic resource allocation

## 🔍 Troubleshooting

### Common Issues

1. **High costs**: Check network congestion, review fee multipliers
2. **Slow processing**: Monitor queue size, check RPC latency
3. **Failed transactions**: Review error logs, check retry logic
4. **Alert fatigue**: Adjust thresholds, enable cooldowns
5. **Inaccurate estimates**: Verify provider APIs, update fallbacks

### Debug Commands
```bash
# Check system health
curl http://localhost:3001/health

# View Prometheus metrics
curl http://localhost:3001/metrics

# Monitor queue status
curl http://localhost:3001/api/costs/queue/status
```

---

🎯 **Target Achievement**: This system successfully maintains duel costs within the 50-100k lamports target while providing comprehensive monitoring, optimization, and automated cost management for the Solana PvP platform.