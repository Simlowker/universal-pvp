import { PublicKey } from '@solana/web3.js';

// Program IDs (placeholder - replace with actual deployed program IDs)
export const PROGRAM_IDS = {
  GAME_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  TOKEN_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  NFT_PROGRAM: new PublicKey('11111111111111111111111111111111'),
  ECS_PROGRAM: new PublicKey('11111111111111111111111111111111'),
} as const;

// Network endpoints
export const RPC_ENDPOINTS = {
  DEVNET: 'https://api.devnet.solana.com',
  TESTNET: 'https://api.testnet.solana.com',
  MAINNET: 'https://api.mainnet-beta.solana.com',
  LOCAL: 'http://localhost:8899',
} as const;

// Game configuration
export const GAME_CONFIG = {
  MAX_PLAYERS_PER_MATCH: 2,
  TURN_TIMEOUT_SECONDS: 60,
  MAX_ACTIONS_PER_TURN: 3,
  MIN_BET_LAMPORTS: 1000000, // 0.001 SOL
  MAX_BET_LAMPORTS: 1000000000, // 1 SOL
} as const;

// Ephemeral Rollup configuration
export const ER_CONFIG = {
  DEVNET_VALIDATOR_URL: 'https://devnet.magicblock.app',
  SESSION_DURATION_SECONDS: 3600, // 1 hour
  MAX_CONCURRENT_SESSIONS: 10,
} as const;

// Account sizes (in bytes)
export const ACCOUNT_SIZES = {
  PLAYER: 256,
  MATCH: 512,
  GAME_STATE: 1024,
} as const;