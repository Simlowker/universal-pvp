# Universal PvP Test Suite

Comprehensive testing suite for MagicBlock Universal PvP platform, covering BOLT ECS components, Ephemeral Rollups, PvP flow integration, and performance benchmarking.

## 🎯 Overview

This test suite validates:
- **BOLT Combat System**: ECS components, combat mechanics, turn systems
- **Ephemeral Rollup Performance**: 30ms latency targets, gasless transactions
- **PvP Flow Integration**: Complete battle flows from matchmaking to rewards
- **Stress Testing**: 1000+ concurrent battles performance
- **Session Keys**: Authentication and authorization systems
- **State Synchronization**: Real-time state management and persistence

## 📁 Test Structure

```
tests/
├── bolt/
│   └── combat.test.ts           # BOLT ECS combat system tests
├── er/
│   └── latency.test.ts          # Ephemeral Rollup latency verification
├── integration/
│   └── pvp-flow.test.ts         # Full PvP battle flow tests
├── performance/
│   └── stress.test.ts           # 1000 concurrent battle stress tests
├── setup.js                    # Global test configuration
└── README.md                   # This file

scripts/
├── test-er.js                  # ER local testing script
├── benchmark.js                # Performance benchmarking script
└── run-tests.sh               # Complete test runner
```

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+** and **npm 8+**
2. **Rust and Cargo** (for BOLT Rust tests)
3. **Solana CLI** with test validator
4. **Git** for version control

### Installation

```bash
# Install dependencies
npm install

# Install Solana CLI (if not installed)
sh -c "$(curl -sSfL https://release.solana.com/v1.16.0/install)"

# Start Solana test validator (in separate terminal)
solana-test-validator --reset
```

### Running Tests

```bash
# Run all core tests
npm test

# Run specific test suites
npm run test:bolt              # BOLT combat system tests
npm run test:er:latency        # ER latency verification
npm run test:pvp-flow          # PvP integration tests
npm run test:stress            # Stress tests (long-running)

# Run with coverage
npm run test:coverage

# Run comprehensive test suite
./scripts/run-tests.sh

# Run with stress tests and benchmarks
./scripts/run-tests.sh --stress --benchmark
```

## 🧪 Test Categories

### 1. BOLT Combat System Tests (`tests/bolt/combat.test.ts`)

Tests the BOLT ECS (Entity Component System) combat implementation:

**Components Tested:**
- `CombatStats` - Combat performance tracking
- `ActiveEffects` - Status effects and buffs/debuffs
- `AbilityCooldowns` - Ability timing and restrictions
- `CombatResult` - Battle outcome tracking

**Systems Tested:**
- `CombatSystem` - Damage calculation and application
- `EffectSystem` - Status effect processing
- `TurnSystem` - Turn-based combat flow

**Key Metrics:**
- Component operations under 5ms
- Combat calculations under 10ms
- System updates at 60 FPS (16.67ms per frame)
- Memory efficiency with 1000+ entities

**Example:**
```bash
npm run test:bolt
```

### 2. Ephemeral Rollup Latency Tests (`tests/er/latency.test.ts`)

Validates that all ER operations meet the strict 30ms latency requirement:

**Operations Tested:**
- Single transaction processing (< 30ms)
- Batch transaction handling (20+ txs in 30ms)
- State synchronization (< 25ms)
- Gasless transactions (< 25ms)
- End-to-end transaction flow (< 30ms)

**Performance Targets:**
- P50 latency: < 20ms
- P95 latency: < 30ms
- P99 latency: < 50ms
- Throughput: > 50 tx/second
- Error rate: < 1%

**Example:**
```bash
npm run test:er:latency
```

### 3. PvP Flow Integration Tests (`tests/integration/pvp-flow.test.ts`)

Tests complete PvP scenarios from matchmaking to victory:

**Flow Tested:**
1. Player registration and matchmaking
2. Battle initialization and setup
3. Turn-based combat execution
4. Battle completion and rewards
5. Leaderboard updates

**Battle Types:**
- 1v1 ranked matches
- 2v2 team battles
- Tournament brackets (8 players)
- Server-wide events

**Performance Requirements:**
- Complete 1v1 match: < 15 seconds
- Team battle: < 20 seconds
- Tournament: < 1 minute
- 20 concurrent matches: < 30 seconds

**Example:**
```bash
npm run test:pvp-flow
```

### 4. Stress Tests (`tests/performance/stress.test.ts`)

Performance and reliability testing under extreme load:

**Stress Scenarios:**
- 1000 concurrent simple battles
- 500 mixed battle types
- Sustained load (60 seconds)
- Memory leak detection
- Resource contention handling
- Cascading failure recovery

**Resource Monitoring:**
- CPU usage (< 90%)
- Memory usage (< 1GB)
- Network I/O efficiency
- Error rates and recovery

**Example:**
```bash
npm run test:stress
# Warning: This test takes 5+ minutes
```

## 🛠️ Testing Scripts

### ER Local Testing (`scripts/test-er.js`)

Comprehensive ER integration testing script:

```bash
# Run ER local tests
npm run test:er

# With verbose output
VERBOSE=true npm run test:er
```

**Features:**
- Connection verification
- Transaction latency testing
- Gasless transaction validation
- State synchronization benchmarks
- Session key functionality
- Error recovery testing

### Performance Benchmarking (`scripts/benchmark.js`)

Advanced performance analysis and optimization recommendations:

```bash
# Run benchmarks
npm run benchmark

# Full benchmark with detailed analysis
npm run benchmark:full
```

**Benchmark Categories:**
- Latency percentiles (P50, P90, P95, P99)
- Throughput under various loads
- Concurrency scaling (1-100 concurrent ops)
- Resource usage patterns
- BOLT ECS performance
- State synchronization efficiency

### Complete Test Runner (`scripts/run-tests.sh`)

Automated test execution with environment setup:

```bash
# Basic test suite
./scripts/run-tests.sh

# With coverage reporting
./scripts/run-tests.sh --coverage

# Include stress tests
./scripts/run-tests.sh --stress

# Full suite with benchmarks
./scripts/run-tests.sh --stress --benchmark --verbose
```

## 🎯 Performance Targets

### Latency Requirements
| Operation | Target | Maximum |
|-----------|--------|---------|
| Transaction Processing | < 20ms | < 30ms |
| State Synchronization | < 15ms | < 25ms |
| Combat Calculation | < 10ms | < 20ms |
| Component Updates | < 5ms | < 10ms |

### Throughput Requirements
| Metric | Target | Stress Test |
|--------|--------|-------------|
| Transactions/Second | > 50 | > 100 |
| Battles/Second | > 10 | > 25 |
| State Updates/Second | > 60 | > 120 |
| Concurrent Users | > 100 | > 1000 |

### Resource Requirements
| Resource | Normal Load | Stress Load |
|----------|-------------|-------------|
| CPU Usage | < 50% | < 80% |
| Memory Usage | < 500MB | < 1GB |
| Network I/O | < 10MB/s | < 50MB/s |
| Error Rate | < 0.1% | < 1% |

## 🔧 Configuration

### Test Environment Variables

```bash
# Solana configuration
export RPC_URL="http://localhost:8899"
export SOLANA_COMMITMENT="confirmed"

# Performance targets
export LATENCY_TARGET=30
export THROUGHPUT_TARGET=50
export ERROR_RATE_THRESHOLD=0.01

# Test configuration
export VERBOSE=true
export COVERAGE=true
export STRESS_TEST=true
export BENCHMARK=true
```

### Jest Configuration

The test suite uses Jest with TypeScript support. Key configuration:

- **Test Environment**: Node.js
- **Timeout**: 30 seconds (configurable per test)
- **Coverage**: 75% minimum threshold
- **Parallel Execution**: 50% of available cores

## 🐛 Troubleshooting

### Common Issues

**1. Solana Test Validator Not Running**
```bash
# Start test validator
solana-test-validator --reset

# Verify it's running
solana cluster-version
```

**2. TypeScript Compilation Errors**
```bash
# Run type check
npm run type-check

# Install missing types
npm install --save-dev @types/node @types/jest
```

**3. Test Timeouts**
```bash
# Increase timeout for specific tests
jest --testTimeout=60000

# Or set in environment
export JEST_TIMEOUT=60000
```

**4. Memory Issues During Stress Tests**
```bash
# Run with more memory
node --max-old-space-size=4096 node_modules/.bin/jest tests/performance/stress.test.ts
```

**5. Port Conflicts**
```bash
# Kill processes using default ports
pkill -f "solana-test-validator"
pkill -f "node"

# Restart with different ports
solana-test-validator --rpc-port 8900
```

### Performance Issues

**Slow Test Execution:**
1. Run tests in parallel: `jest --maxWorkers=50%`
2. Use test isolation: `jest --runInBand` (for debugging)
3. Skip heavy tests: `jest --testPathIgnorePatterns=stress`

**High Memory Usage:**
1. Enable garbage collection: `node --expose-gc`
2. Monitor memory: `npm run test:coverage -- --detectOpenHandles`
3. Use memory profiling: `node --inspect`

### Test Failures

**Intermittent Failures:**
1. Check network stability
2. Verify Solana validator is stable
3. Increase test timeouts
4. Add retry mechanisms

**Consistent Failures:**
1. Check dependency versions
2. Verify environment setup
3. Review error logs
4. Run individual test suites

## 📊 Test Reports

### Coverage Reports

Coverage reports are generated in `coverage/` directory:

```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

### Performance Reports

Benchmark reports are saved in `benchmark-results/`:

```bash
npm run benchmark
ls benchmark-results/
```

### ER Test Reports

ER testing generates detailed reports in `test-results/`:

```bash
npm run test:er
ls test-results/
```

## 🤝 Contributing

### Adding New Tests

1. **Unit Tests**: Add to appropriate category directory
2. **Integration Tests**: Use `tests/integration/`
3. **Performance Tests**: Use `tests/performance/`
4. **Follow Naming Convention**: `*.test.ts` or `*.test.js`

### Test Best Practices

1. **Descriptive Names**: Test names should explain what and why
2. **Isolation**: Each test should be independent
3. **Setup/Teardown**: Use `beforeEach`/`afterEach` properly
4. **Assertions**: One logical assertion per test
5. **Performance**: Include timing assertions where relevant

### Performance Test Guidelines

1. **Warm-up**: Include warm-up iterations
2. **Multiple Runs**: Average results over multiple runs
3. **Resource Monitoring**: Track CPU/memory usage
4. **Baseline Comparison**: Compare against performance targets
5. **Error Handling**: Test failure scenarios

## 📈 Continuous Integration

### GitHub Actions Integration

The test suite is designed to work with CI/CD pipelines:

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: ./scripts/run-tests.sh --coverage
      - run: npm run benchmark
```

### Performance Monitoring

Set up alerts for performance regressions:
- Latency increases > 20%
- Throughput decreases > 15%
- Error rates > 1%
- Memory usage > 1GB

## 📚 Resources

- [MagicBlock Documentation](https://docs.magicblock.gg/)
- [BOLT SDK Documentation](https://github.com/magicblock-labs/bolt)
- [Ephemeral Rollups Guide](https://github.com/magicblock-labs/ephemeral-rollups)
- [Solana Testing Guide](https://docs.solana.com/developing/test-validator)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

## 🔄 Updates and Maintenance

This test suite is actively maintained. Key maintenance tasks:

1. **Weekly**: Update performance baselines
2. **Monthly**: Review and update test cases
3. **Per Release**: Add tests for new features
4. **Quarterly**: Performance benchmark analysis

---

**Happy Testing! 🚀**

For questions or issues, please check the troubleshooting section or create an issue in the repository.