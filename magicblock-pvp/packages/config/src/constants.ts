/**
 * Application constants
 */

import { PublicKey } from '@solana/web3.js';

// Program IDs
export const PROGRAM_IDS = {
  PVP_PROGRAM: new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHfC'),
  VRF_PROGRAM: new PublicKey('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y'),
  TEE_PROGRAM: new PublicKey('TEEzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y'),
} as const;

// Transaction Costs (in lamports)
export const COSTS = {
  BASE_FEE: 5000,
  PRIORITY_FEE_MIN: 5000,
  PRIORITY_FEE_MAX: 20000,
  DUEL_MIN: 50000,
  DUEL_MAX: 100000,
  VRF_REQUEST: 10000,
  TEE_ATTESTATION: 15000,
} as const;

// Game Configuration
export const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  DEFAULT_MATCH_DURATION: 300000, // 5 minutes
  MAX_MATCH_DURATION: 1800000, // 30 minutes
  MIN_BET_AMOUNT: 0.01, // SOL
  MAX_BET_AMOUNT: 10, // SOL
  RAKE_PERCENTAGE: 2.5, // Platform fee
} as const;

// Rollup Configuration
export const ROLLUP_CONFIG = {
  DEFAULT_COMPUTE_BUDGET: 1000000,
  MAX_COMPUTE_BUDGET: 10000000,
  DEFAULT_LIFETIME_MS: 600000, // 10 minutes
  MAX_LIFETIME_MS: 3600000, // 1 hour
  COMMITMENT_INTERVAL: 30000, // 30 seconds
} as const;

// VRF Configuration
export const VRF_CONFIG = {
  SEED_LENGTH: 32,
  PROOF_LENGTH: 64,
  BETA_LENGTH: 64,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
} as const;

// WebSocket Configuration
export const WEBSOCKET_CONFIG = {
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: 10,
  HEARTBEAT_INTERVAL: 30000,
  MESSAGE_TIMEOUT: 10000,
} as const;

// API Configuration
export const API_CONFIG = {
  REQUEST_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  RATE_LIMIT_PER_MINUTE: 60,
} as const;

// Error Codes
export const ERROR_CODES = {
  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  
  // Game errors
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  INVALID_TURN: 'INVALID_TURN',
  MATCH_NOT_ACTIVE: 'MATCH_NOT_ACTIVE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  
  // Rollup errors
  ROLLUP_INIT_ERROR: 'ROLLUP_INIT_ERROR',
  ROLLUP_SESSION_ERROR: 'ROLLUP_SESSION_ERROR',
  ROLLUP_COMMIT_ERROR: 'ROLLUP_COMMIT_ERROR',
  
  // VRF errors
  VRF_INIT_ERROR: 'VRF_INIT_ERROR',
  VRF_GENERATION_ERROR: 'VRF_GENERATION_ERROR',
  VRF_VERIFICATION_ERROR: 'VRF_VERIFICATION_ERROR',
  
  // TEE errors
  TEE_ATTESTATION_ERROR: 'TEE_ATTESTATION_ERROR',
  TEE_VERIFICATION_ERROR: 'TEE_VERIFICATION_ERROR',
} as const;

// Event Names
export const EVENTS = {
  // Connection events
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  
  // Match events
  MATCH_CREATED: 'match:created',
  MATCH_STARTED: 'match:started',
  MATCH_ENDED: 'match:ended',
  MATCH_CANCELLED: 'match:cancelled',
  
  // Player events
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  PLAYER_ACTION: 'player:action',
  
  // Game events
  TURN_STARTED: 'turn:started',
  TURN_ENDED: 'turn:ended',
  ACTION_EXECUTED: 'action:executed',
  
  // System events
  ERROR: 'error',
  WARNING: 'warning',
} as const;