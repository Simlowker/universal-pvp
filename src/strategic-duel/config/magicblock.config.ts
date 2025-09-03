/**
 * MagicBlock Configuration - Optimized for Strategic Duel 10-50ms gameplay
 * Contains all performance and network configurations for MagicBlock integration
 */

import { PublicKey, Cluster } from '@solana/web3.js';

export type NetworkEnvironment = 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';

export interface MagicBlockConfig {
  // Network Configuration
  network: {
    environment: NetworkEnvironment;
    rpcEndpoint: string;
    wsEndpoint: string;
    ephemeralRollupEndpoint: string;
    commitment: 'processed' | 'confirmed' | 'finalized';
  };
  
  // Program Addresses
  programs: {
    strategicDuel: PublicKey;
    gameState: PublicKey;
    sessionManager: PublicKey;
    vrfOracle: PublicKey;
  };
  
  // Performance Optimization
  performance: {
    // Latency targets (milliseconds)
    targets: {
      actionExecution: number;
      stateSync: number;
      uiResponse: number;
      networkRoundTrip: number;
    };
    
    // Compute optimization
    compute: {
      defaultBudget: number;
      maxBudget: number;
      priorityFee: number;
      maxPriorityFee: number;
    };
    
    // Transaction optimization
    transactions: {
      maxRetries: number;
      retryDelay: number;
      batchSize: number;
      enableBatching: boolean;
      skipPreflight: boolean;
    };
    
    // Connection optimization
    connection: {
      maxSockets: number;
      keepAlive: boolean;
      timeout: number;
      reconnectDelay: number;
    };
  };
  
  // Session Management
  session: {
    defaultDuration: number; // seconds
    autoExtend: boolean;
    extensionThreshold: number; // seconds before expiry
    maxConcurrentSessions: number;
    cleanupInterval: number; // seconds
  };
  
  // Ephemeral Rollup Configuration
  ephemeralRollup: {
    enabled: boolean;
    syncInterval: number; // milliseconds
    maxStateSize: number; // bytes
    compressionEnabled: boolean;
    batchTransactions: boolean;
    optimisticUpdates: boolean;
  };
  
  // Game-specific Settings
  game: {
    maxPlayers: number;
    roundTimeout: number; // seconds
    actionTimeout: number; // seconds
    minBet: number; // lamports
    maxBet: number; // lamports
    strategicFoldRefundPercent: number; // 0-100
    psychProfilingEnabled: boolean;
  };
  
  // VRF Configuration
  vrf: {
    queueAccount: PublicKey;
    authority: PublicKey;
    requestTimeout: number; // seconds
    callbackGasLimit: number;
    enableProofVerification: boolean;
  };
  
  // Monitoring and Analytics
  monitoring: {
    enabled: boolean;
    metricsInterval: number; // seconds
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    performanceAlerts: {
      latencyThreshold: number;
      errorRateThreshold: number;
      memoryThreshold: number;
    };
  };
  
  // Development Features
  development: {
    mockMode: boolean;
    simulateLatency: boolean;
    debugMode: boolean;
    testnetFaucet: string;
  };
}

// Environment-specific configurations

export const DEVNET_CONFIG: MagicBlockConfig = {
  network: {
    environment: 'devnet',
    rpcEndpoint: 'https://api.devnet.solana.com',
    wsEndpoint: 'wss://api.devnet.solana.com',
    ephemeralRollupEndpoint: 'https://ephemeral-rollup-devnet.magicblock.app',
    commitment: 'processed'
  },
  
  programs: {
    strategicDuel: new PublicKey('6gaBQmha1o6u26PWb9quyzhcxufGWAWBYr71m6e6F3GD'),
    gameState: new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'),
    sessionManager: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    vrfOracle: new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR')
  },
  
  performance: {
    targets: {
      actionExecution: 50, // 50ms max for actions
      stateSync: 25,       // 25ms max for state sync  
      uiResponse: 16,      // 16ms for 60 FPS
      networkRoundTrip: 100 // 100ms max network latency
    },
    
    compute: {
      defaultBudget: 400000,   // High compute for fast execution
      maxBudget: 1000000,      // Maximum allowed compute
      priorityFee: 10000,      // High priority for instant confirmation
      maxPriorityFee: 50000    // Emergency priority fee
    },
    
    transactions: {
      maxRetries: 3,
      retryDelay: 5,           // 5ms between retries
      batchSize: 8,            // Optimal batch size for ER
      enableBatching: true,
      skipPreflight: true      // Skip preflight for speed
    },
    
    connection: {
      maxSockets: 10,
      keepAlive: true,
      timeout: 5000,           // 5 second timeout
      reconnectDelay: 1000     // 1 second reconnect delay
    }
  },
  
  session: {
    defaultDuration: 3600,     // 1 hour sessions
    autoExtend: true,
    extensionThreshold: 300,   // Extend 5 minutes before expiry
    maxConcurrentSessions: 100,
    cleanupInterval: 30        // Cleanup every 30 seconds
  },
  
  ephemeralRollup: {
    enabled: true,
    syncInterval: 100,         // Sync every 100ms
    maxStateSize: 10240,       // 10KB max state
    compressionEnabled: true,
    batchTransactions: true,
    optimisticUpdates: true
  },
  
  game: {
    maxPlayers: 2,             // 1v1 strategic duels
    roundTimeout: 30,          // 30 seconds per round
    actionTimeout: 15,         // 15 seconds per action
    minBet: 1000,              // 0.000001 SOL minimum
    maxBet: 1000000000,        // 1 SOL maximum  
    strategicFoldRefundPercent: 50, // 50% refund on strategic fold
    psychProfilingEnabled: true
  },
  
  vrf: {
    queueAccount: new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR'),
    authority: new PublicKey('8CvwxZ9Db6XbLD46NZwwmVDZZMPzMZfBMzreXeMbWqMf'),
    requestTimeout: 30,
    callbackGasLimit: 200000,
    enableProofVerification: true
  },
  
  monitoring: {
    enabled: true,
    metricsInterval: 5,        // Update metrics every 5 seconds
    logLevel: 'info',
    performanceAlerts: {
      latencyThreshold: 100,   // Alert if latency > 100ms
      errorRateThreshold: 5,   // Alert if error rate > 5%
      memoryThreshold: 80      // Alert if memory usage > 80%
    }
  },
  
  development: {
    mockMode: false,
    simulateLatency: false,
    debugMode: true,
    testnetFaucet: 'https://faucet.solana.com'
  }
};

export const MAINNET_CONFIG: MagicBlockConfig = {
  ...DEVNET_CONFIG,
  network: {
    environment: 'mainnet-beta',
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    wsEndpoint: 'wss://api.mainnet-beta.solana.com', 
    ephemeralRollupEndpoint: 'https://ephemeral-rollup.magicblock.app',
    commitment: 'confirmed' // Slightly higher commitment for mainnet
  },
  
  programs: {
    // Mainnet program addresses (placeholder - update with actual addresses)
    strategicDuel: new PublicKey('MainnetStrategicDuelProgramAddress11111111111'),
    gameState: new PublicKey('MainnetGameStateProgramAddress1111111111111'),
    sessionManager: new PublicKey('MainnetSessionManagerProgramAddress111111111'),
    vrfOracle: new PublicKey('MainnetVRFOracleProgramAddress11111111111111')
  },
  
  performance: {
    ...DEVNET_CONFIG.performance,
    targets: {
      actionExecution: 30,     // Tighter targets for mainnet
      stateSync: 20,
      uiResponse: 16,
      networkRoundTrip: 80
    },
    
    compute: {
      ...DEVNET_CONFIG.performance.compute,
      priorityFee: 25000,      // Higher priority fees for mainnet
      maxPriorityFee: 100000
    }
  },
  
  monitoring: {
    ...DEVNET_CONFIG.monitoring,
    logLevel: 'warn',          // Less verbose logging for production
    performanceAlerts: {
      latencyThreshold: 50,    // Stricter alerts for mainnet
      errorRateThreshold: 1,
      memoryThreshold: 70
    }
  },
  
  development: {
    mockMode: false,
    simulateLatency: false,
    debugMode: false,          // Disable debug mode in production
    testnetFaucet: ''
  }
};

export const LOCALNET_CONFIG: MagicBlockConfig = {
  ...DEVNET_CONFIG,
  network: {
    environment: 'localnet',
    rpcEndpoint: 'http://localhost:8899',
    wsEndpoint: 'ws://localhost:8900',
    ephemeralRollupEndpoint: 'http://localhost:3001',
    commitment: 'processed'
  },
  
  programs: {
    // Local development program addresses
    strategicDuel: new PublicKey('11111111111111111111111111111112'),
    gameState: new PublicKey('11111111111111111111111111111113'),
    sessionManager: new PublicKey('11111111111111111111111111111114'),
    vrfOracle: new PublicKey('11111111111111111111111111111115')
  },
  
  performance: {
    ...DEVNET_CONFIG.performance,
    targets: {
      actionExecution: 10,     // Ultra-fast targets for local development
      stateSync: 5,
      uiResponse: 16,
      networkRoundTrip: 20
    },
    
    compute: {
      ...DEVNET_CONFIG.performance.compute,
      priorityFee: 0,          // No fees needed for local development
      maxPriorityFee: 0
    }
  },
  
  development: {
    mockMode: true,            // Enable mock mode for local testing
    simulateLatency: true,     // Simulate network conditions
    debugMode: true,
    testnetFaucet: 'http://localhost:9999/airdrop'
  }
};

// Performance optimization presets

export const PERFORMANCE_PRESETS = {
  ULTRA_LOW_LATENCY: {
    compute: {
      defaultBudget: 1000000,
      priorityFee: 50000,
    },
    transactions: {
      maxRetries: 1,
      retryDelay: 0,
      skipPreflight: true
    },
    ephemeralRollup: {
      syncInterval: 50,
      optimisticUpdates: true,
      batchTransactions: false // Disable batching for minimum latency
    }
  },
  
  BALANCED: {
    compute: {
      defaultBudget: 400000,
      priorityFee: 10000,
    },
    transactions: {
      maxRetries: 3,
      retryDelay: 5,
      skipPreflight: true
    },
    ephemeralRollup: {
      syncInterval: 100,
      optimisticUpdates: true,
      batchTransactions: true
    }
  },
  
  HIGH_THROUGHPUT: {
    compute: {
      defaultBudget: 200000,
      priorityFee: 5000,
    },
    transactions: {
      maxRetries: 5,
      retryDelay: 10,
      skipPreflight: false,
      batchSize: 16
    },
    ephemeralRollup: {
      syncInterval: 200,
      optimisticUpdates: false,
      batchTransactions: true
    }
  }
};

// Utility functions for configuration management

export function getConfigForEnvironment(env: NetworkEnvironment): MagicBlockConfig {
  switch (env) {
    case 'mainnet-beta':
      return MAINNET_CONFIG;
    case 'localnet':
      return LOCALNET_CONFIG;
    case 'devnet':
    case 'testnet':
    default:
      return DEVNET_CONFIG;
  }
}

export function applyPerformancePreset(
  config: MagicBlockConfig, 
  preset: keyof typeof PERFORMANCE_PRESETS
): MagicBlockConfig {
  const presetConfig = PERFORMANCE_PRESETS[preset];
  
  return {
    ...config,
    performance: {
      ...config.performance,
      ...presetConfig
    },
    ephemeralRollup: {
      ...config.ephemeralRollup,
      ...presetConfig.ephemeralRollup
    }
  };
}

export function createCustomConfig(
  baseEnv: NetworkEnvironment,
  overrides: Partial<MagicBlockConfig>
): MagicBlockConfig {
  const baseConfig = getConfigForEnvironment(baseEnv);
  
  return {
    ...baseConfig,
    ...overrides,
    // Deep merge for nested objects
    network: { ...baseConfig.network, ...overrides.network },
    programs: { ...baseConfig.programs, ...overrides.programs },
    performance: { ...baseConfig.performance, ...overrides.performance },
    session: { ...baseConfig.session, ...overrides.session },
    ephemeralRollup: { ...baseConfig.ephemeralRollup, ...overrides.ephemeralRollup },
    game: { ...baseConfig.game, ...overrides.game },
    vrf: { ...baseConfig.vrf, ...overrides.vrf },
    monitoring: { ...baseConfig.monitoring, ...overrides.monitoring },
    development: { ...baseConfig.development, ...overrides.development }
  };
}

// Default export for convenience
export default {
  DEVNET: DEVNET_CONFIG,
  MAINNET: MAINNET_CONFIG,
  LOCALNET: LOCALNET_CONFIG,
  PERFORMANCE_PRESETS,
  getConfigForEnvironment,
  applyPerformancePreset,
  createCustomConfig
};