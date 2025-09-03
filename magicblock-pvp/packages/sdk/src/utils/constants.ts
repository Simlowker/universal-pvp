/**
 * Constants and configuration values for the MagicBlock SDK
 */

// VRF Constants
export const VRF_CONSTANTS = {
  // ECVRF Edwards25519 Suite ID per RFC 9381
  SUITE_ID: 0x04,
  
  // Curve parameters
  POINT_SIZE: 32,
  SCALAR_SIZE: 32,
  CHALLENGE_SIZE: 16,
  
  // Performance targets
  LATENCY_TARGET_MS: 10,
  BATCH_SIZE_LIMIT: 100,
  
  // Hash suite
  HASH_SUITE: 'sha512'
} as const;

// TEE Constants
export const TEE_CONSTANTS = {
  // Supported vendors
  SUPPORTED_VENDORS: ['intel-sgx', 'amd-sev', 'arm-trustzone', 'generic'] as const,
  
  // Attestation validation
  MAX_ATTESTATION_AGE_MS: 5 * 60 * 1000, // 5 minutes
  MIN_QUOTE_SIZE: 32,
  MIN_SIGNATURE_SIZE: 64,
  MIN_CERTIFICATE_SIZE: 32,
  
  // SGX specific
  SGX_QUOTE_MIN_SIZE: 432,
  SGX_MRENCLAVE_SIZE: 32,
  SGX_MRSIGNER_SIZE: 32,
  
  // SEV specific  
  SEV_REPORT_DATA_SIZE: 64
} as const;

// Session Constants
export const SESSION_CONSTANTS = {
  // Default timeouts
  DEFAULT_SESSION_TIMEOUT_MS: 60 * 60 * 1000, // 1 hour
  DEFAULT_AUTO_RENEW_THRESHOLD_MS: 5 * 60 * 1000, // 5 minutes
  
  // Batch sizes
  DEFAULT_BATCH_SIZE: 10,
  MAX_BATCH_SIZE: 100,
  
  // Cleanup intervals
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
  SESSION_HISTORY_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
  
  // Metrics
  METRICS_UPDATE_INTERVAL_MS: 5 * 1000, // 5 seconds
  HOURLY_SPEND_UPDATE_INTERVAL_MS: 60 * 60 * 1000 // 1 hour
} as const;

// Transaction Queue Constants
export const QUEUE_CONSTANTS = {
  // Processing intervals
  PROCESSING_INTERVAL_MS: 1000, // 1 second
  METRICS_UPDATE_INTERVAL_MS: 5000, // 5 seconds
  
  // Retry settings
  DEFAULT_MAX_RETRIES: 3,
  MAX_RETRY_DELAY_MS: 30000, // 30 seconds
  RETRY_BACKOFF_BASE: 2,
  
  // Timeouts
  DEFAULT_TRANSACTION_TIMEOUT_MS: 30000, // 30 seconds
  BATCH_PROCESSING_MAX_SIZE: 5,
  
  // Priority scores
  PRIORITY_SCORES: {
    critical: 1000,
    high: 750,
    medium: 500,
    low: 250
  },
  
  // Cleanup
  HISTORY_MAX_AGE_MS: 24 * 60 * 60 * 1000 // 24 hours
} as const;

// Cost Tracking Constants
export const COST_CONSTANTS = {
  // Fee estimation
  DEFAULT_BASE_FEE_LAMPORTS: 5000,
  FEE_HISTORY_MAX_SIZE: 100,
  COST_HISTORY_MAX_SIZE: 1000,
  
  // Priority multipliers
  PRIORITY_MULTIPLIERS: {
    low: 1,
    medium: 1.5,
    high: 2
  },
  
  // Compute unit estimates
  DEFAULT_COMPUTE_ESTIMATES: {
    transfer: 200000,
    swap: 400000,
    stake: 300000,
    unstake: 300000,
    game_action: 250000,
    nft_mint: 350000,
    program_invoke: 200000
  },
  
  // Analysis thresholds
  PEAK_HOUR_THRESHOLD: 1.2, // 20% above average
  FREQUENT_TX_THRESHOLD: 3, // At least 3 transactions
  
  // Update intervals
  FEE_UPDATE_INTERVAL_MS: 30000, // 30 seconds
  HOURLY_SPEND_UPDATE_INTERVAL_MS: 60 * 60 * 1000 // 1 hour
} as const;

// Rollup Proof Constants
export const PROOF_CONSTANTS = {
  // Proof component sizes
  STATE_ROOT_SIZE: 32,
  BLOCK_HASH_SIZE: 32,
  TRANSACTION_HASH_SIZE: 32,
  SIGNATURE_SIZE: 64,
  
  // Cache settings
  VERIFICATION_CACHE_MAX_AGE_MS: 5 * 60 * 1000, // 5 minutes
  CACHE_CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
  
  // Verification timeouts
  PROOF_VERIFICATION_TIMEOUT_MS: 10000, // 10 seconds
  BATCH_VERIFICATION_TIMEOUT_MS: 30000, // 30 seconds
  
  // L1 verification
  BLOCK_CONFIRMATION_TIMEOUT_MS: 60000 // 60 seconds
} as const;

// Game Client Constants
export const GAME_CONSTANTS = {
  // Match settings
  DEFAULT_MATCH_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  ACTION_TIMEOUT_MS: 10000, // 10 seconds
  
  // Player settings
  DEFAULT_USERNAME_LENGTH: 8,
  MAX_PLAYERS_PER_MATCH: 10,
  
  // VRF settings for games
  MATCH_SEED_PREFIX: 'match_',
  WINNER_SEED_PREFIX: 'winners_',
  ACTION_RANDOMNESS_THRESHOLD: 0.5,
  
  // Rollup settings
  DEFAULT_COMPUTE_BUDGET: 1_000_000,
  AUTO_COMMIT_ENABLED: true
} as const;

// Network Constants
export const NETWORK_CONSTANTS = {
  // Solana network endpoints
  MAINNET_RPC: 'https://api.mainnet-beta.solana.com',
  DEVNET_RPC: 'https://api.devnet.solana.com',
  TESTNET_RPC: 'https://api.testnet.solana.com',
  
  // MagicBlock endpoints (placeholder)
  MAGICBLOCK_MAINNET: 'https://rollup.magicblock.gg',
  MAGICBLOCK_DEVNET: 'https://rollup-dev.magicblock.gg',
  
  // Default program IDs (placeholder)
  ROLLUP_PROGRAM_ID: 'MagicB1ockRo11upProgram111111111111111111111',
  GAME_PROGRAM_ID: 'GameProgram11111111111111111111111111111111',
  
  // Connection settings
  DEFAULT_COMMITMENT: 'confirmed',
  DEFAULT_MAX_RETRIES: 3,
  DEFAULT_TIMEOUT_MS: 30000
} as const;

// Error Codes
export const ERROR_CODES = {
  // General errors
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  INVALID_CONFIG: 'INVALID_CONFIG',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  
  // VRF errors
  VRF_ERROR: 'VRF_ERROR',
  VRF_VERIFICATION_FAILED: 'VRF_VERIFICATION_FAILED',
  VRF_LATENCY_EXCEEDED: 'VRF_LATENCY_EXCEEDED',
  
  // TEE errors
  TEE_ERROR: 'TEE_ERROR',
  TEE_VERIFICATION_FAILED: 'TEE_VERIFICATION_FAILED',
  TEE_UNSUPPORTED_VENDOR: 'TEE_UNSUPPORTED_VENDOR',
  TEE_ATTESTATION_EXPIRED: 'TEE_ATTESTATION_EXPIRED',
  
  // Session errors
  SESSION_ERROR: 'SESSION_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NO_ACTIVE_SESSION: 'NO_ACTIVE_SESSION',
  
  // Transaction errors
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
  TRANSACTION_TIMEOUT: 'TRANSACTION_TIMEOUT',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  QUEUE_FULL: 'QUEUE_FULL',
  
  // Cost tracking errors
  COST_ESTIMATION_ERROR: 'COST_ESTIMATION_ERROR',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  
  // Proof errors
  PROOF_VERIFICATION_ERROR: 'PROOF_VERIFICATION_ERROR',
  INVALID_PROOF_FORMAT: 'INVALID_PROOF_FORMAT',
  PROOF_SIGNATURE_INVALID: 'PROOF_SIGNATURE_INVALID',
  
  // Game errors
  GAME_CLIENT_INIT_ERROR: 'GAME_CLIENT_INIT_ERROR',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_NOT_ACTIVE: 'MATCH_NOT_ACTIVE',
  INVALID_TURN: 'INVALID_TURN',
  MATCH_CREATION_ERROR: 'MATCH_CREATION_ERROR',
  WINNER_SELECTION_ERROR: 'WINNER_SELECTION_ERROR'
} as const;

// Performance Targets
export const PERFORMANCE_TARGETS = {
  // VRF performance
  VRF_GENERATION_MS: 10,
  VRF_VERIFICATION_MS: 10,
  VRF_BATCH_SIZE: 100,
  
  // Transaction processing
  TRANSACTION_QUEUE_MS: 1000,
  ROLLUP_SETTLEMENT_MS: 5000,
  L1_CONFIRMATION_MS: 30000,
  
  // Cost optimization
  FEE_ESTIMATION_ACCURACY: 0.95,
  COST_SAVINGS_TARGET: 0.2, // 20% savings
  
  // Throughput targets
  TRANSACTIONS_PER_SECOND: 1000,
  MATCHES_PER_MINUTE: 100,
  PLAYERS_CONCURRENT: 10000
} as const;

// Development and Testing
export const DEV_CONSTANTS = {
  // Test data sizes
  TEST_ARRAY_SIZE: 1000,
  BENCHMARK_ITERATIONS: 100,
  
  // Mock settings
  MOCK_LATENCY_MS: 10,
  MOCK_SUCCESS_RATE: 0.95,
  
  // Debugging
  ENABLE_VERBOSE_LOGGING: false,
  LOG_PERFORMANCE_METRICS: true,
  
  // Test accounts (placeholder)
  TEST_KEYPAIR_SEED: 'test_seed_12345678901234567890123456789012',
  TEST_PROGRAM_ID: 'Test1111111111111111111111111111111111111111'
} as const;

// Export all constants as a single object for convenience
export const SDK_CONSTANTS = {
  VRF: VRF_CONSTANTS,
  TEE: TEE_CONSTANTS,
  SESSION: SESSION_CONSTANTS,
  QUEUE: QUEUE_CONSTANTS,
  COST: COST_CONSTANTS,
  PROOF: PROOF_CONSTANTS,
  GAME: GAME_CONSTANTS,
  NETWORK: NETWORK_CONSTANTS,
  ERRORS: ERROR_CODES,
  PERFORMANCE: PERFORMANCE_TARGETS,
  DEV: DEV_CONSTANTS
} as const;

// Type for all error codes
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// Type for supported TEE vendors
export type TEEVendor = typeof TEE_CONSTANTS.SUPPORTED_VENDORS[number];

// Type for transaction priorities
export type TransactionPriority = keyof typeof QUEUE_CONSTANTS.PRIORITY_SCORES;

// Type for fee priority levels
export type FeePriorityLevel = keyof typeof COST_CONSTANTS.PRIORITY_MULTIPLIERS;"