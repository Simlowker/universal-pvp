/**
 * Jest Global Test Setup
 * Configures global test environment for MagicBlock testing
 */

// Mock console methods for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Suppress specific warnings during tests
console.error = (...args) => {
  const message = args[0];
  
  // Suppress known warnings from dependencies
  if (
    typeof message === 'string' &&
    (
      message.includes('Warning: ReactDOM.render is deprecated') ||
      message.includes('Warning: componentWillMount has been renamed') ||
      message.includes('Solana RPC connection warning')
    )
  ) {
    return;
  }
  
  originalConsoleError(...args);
};

console.warn = (...args) => {
  const message = args[0];
  
  // Suppress specific warnings
  if (
    typeof message === 'string' &&
    (
      message.includes('deprecated') ||
      message.includes('experimental feature')
    )
  ) {
    return;
  }
  
  originalConsoleWarn(...args);
};

// Global test configuration
global.testConfig = {
  // Solana test configuration
  solana: {
    rpcUrl: 'http://localhost:8899',
    commitment: 'confirmed',
    timeout: 30000,
  },
  
  // MagicBlock test configuration
  magicblock: {
    latencyTarget: 30, // 30ms target
    throughputTarget: 50, // 50 ops/second
    errorRateThreshold: 0.01, // 1% max error rate
  },
  
  // Test timeouts
  timeouts: {
    unit: 5000,      // 5 seconds
    integration: 30000,  // 30 seconds
    e2e: 120000,     // 2 minutes
    stress: 300000,  // 5 minutes
  },
};

// Mock performance.now for consistent timing in tests
if (typeof performance === 'undefined') {
  global.performance = {
    now: () => Date.now()
  };
}

// Mock WebSocket for tests that need it
if (typeof WebSocket === 'undefined') {
  global.WebSocket = class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1; // OPEN
      setTimeout(() => {
        if (this.onopen) this.onopen();
      }, 0);
    }
    
    send(data) {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({ data: JSON.stringify({ echo: JSON.parse(data) }) });
        }
      }, 10);
    }
    
    close() {
      this.readyState = 3; // CLOSED
      if (this.onclose) this.onclose();
    }
  };
}

// Global test utilities
global.testUtils = {
  // Generate random keypair for testing
  generateTestKeypair: () => {
    const { Keypair } = require('@solana/web3.js');
    return Keypair.generate();
  },
  
  // Wait for specified duration
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create mock transaction
  createMockTransaction: (type = 'test', data = {}) => ({
    type,
    data: {
      timestamp: Date.now(),
      nonce: Math.floor(Math.random() * 1000000),
      ...data,
    },
  }),
  
  // Measure execution time
  measureTime: async (fn) => {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  },
  
  // Generate test game state
  generateGameState: (playerCount = 5, entityCount = 10) => {
    const state = {
      id: `test_state_${Date.now()}`,
      timestamp: Date.now(),
      players: {},
      entities: {},
    };
    
    // Generate players
    for (let i = 0; i < playerCount; i++) {
      state.players[`player_${i}`] = {
        id: `player_${i}`,
        position: { x: Math.random() * 1000, y: Math.random() * 1000 },
        health: 100,
        energy: 50 + Math.random() * 50,
        level: Math.floor(Math.random() * 20) + 1,
      };
    }
    
    // Generate entities
    for (let i = 0; i < entityCount; i++) {
      state.entities[`entity_${i}`] = {
        id: `entity_${i}`,
        type: ['item', 'npc', 'obstacle'][i % 3],
        position: { x: Math.random() * 1000, y: Math.random() * 1000 },
        active: Math.random() > 0.3,
      };
    }
    
    return state;
  },
};

// Custom matchers for MagicBlock testing
expect.extend({
  // Check if latency is under target
  toBeFasterThan(received, target) {
    const pass = received < target;
    return {
      message: () => 
        `expected ${received}ms to be ${pass ? 'not ' : ''}faster than ${target}ms`,
      pass,
    };
  },
  
  // Check if throughput meets target
  toMeetThroughputTarget(received, target) {
    const pass = received >= target;
    return {
      message: () =>
        `expected ${received.toFixed(2)} ops/s to ${pass ? 'not ' : ''}meet target of ${target} ops/s`,
      pass,
    };
  },
  
  // Check if error rate is acceptable
  toHaveAcceptableErrorRate(received, threshold = 0.01) {
    const pass = received <= threshold;
    return {
      message: () =>
        `expected error rate ${(received * 100).toFixed(2)}% to be ${pass ? 'above' : 'at or below'} ${(threshold * 100).toFixed(2)}%`,
      pass,
    };
  },
  
  // Check if state is valid game state
  toBeValidGameState(received) {
    const pass = (
      received &&
      typeof received === 'object' &&
      received.id &&
      received.timestamp &&
      received.players &&
      received.entities
    );
    
    return {
      message: () =>
        `expected ${received} to ${pass ? 'not ' : ''}be a valid game state`,
      pass,
    };
  },
});

// Global error handler for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process during tests, but log the error
});

// Increase timeout for all tests by default
jest.setTimeout(30000);

console.log('🧪 Jest test environment configured for MagicBlock Universal PvP');
console.log(`📊 Latency target: ${global.testConfig.magicblock.latencyTarget}ms`);
console.log(`🚄 Throughput target: ${global.testConfig.magicblock.throughputTarget} ops/s`);
console.log(`❌ Max error rate: ${(global.testConfig.magicblock.errorRateThreshold * 100).toFixed(1)}%`);