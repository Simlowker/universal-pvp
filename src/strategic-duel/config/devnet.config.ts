import { PublicKey, Connection } from '@solana/web3.js';

// Strategic Duel Program Configuration for Devnet
export const STRATEGIC_DUEL_CONFIG = {
  // Network Configuration
  network: 'devnet' as const,
  rpcEndpoint: 'https://api.devnet.solana.com',
  wsEndpoint: 'wss://api.devnet.solana.com',
  
  // Program Addresses
  programId: new PublicKey('6gaBQmha1o6u26PWb9quyzhcxufGWAWBYr71m6e6F3GD'),
  
  // Game Configuration
  gameSettings: {
    maxRounds: 10,
    minBet: 1_000_000, // 0.001 SOL in lamports
    maxBet: 1_000_000_000, // 1 SOL in lamports
    defaultEntryFee: 10_000_000, // 0.01 SOL
    timeoutDuration: 60, // seconds
  },
  
  // UI Configuration
  ui: {
    confirmationTimeout: 30_000, // 30 seconds
    refreshInterval: 5_000, // 5 seconds
    maxRetries: 3,
  },
  
  // Deployment Info
  deployment: {
    version: '1.0.0',
    deployedAt: '2025-09-01T13:00:00Z',
    signature: '3p8Yr5zaD7dEMrxZThK9J3bWCNqViWjXcU42CKihfWFfvXRCeBE3tXcJfNbPGFw5ZKFoqnhRobZLQfT6xTAkycA2',
    features: ['create_duel', 'join_duel', 'make_action', 'settle_game'],
  },
};

// Connection helper
export const getConnection = () => {
  return new Connection(STRATEGIC_DUEL_CONFIG.rpcEndpoint, 'confirmed');
};

// Program helpers
export const PROGRAM_ACCOUNTS = {
  // Seed constants for PDAs
  DUEL_SEED: 'duel',
  PLAYER_SEED: 'player',
  STATS_SEED: 'stats',
} as const;

// Action Types enum matching the program
export enum ActionType {
  Raise = 'Raise',
  Call = 'Call', 
  Fold = 'Fold',
}

// Game State enum matching the program
export enum GameState {
  WaitingForOpponent = 'WaitingForOpponent',
  InProgress = 'InProgress',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

// Type definitions for frontend
export interface DuelAccount {
  duelId: number;
  creator: PublicKey;
  opponent: PublicKey;
  maxRounds: number;
  currentRound: number;
  minBet: number;
  maxBet: number;
  entryFee: number;
  totalPot: number;
  gameState: GameState;
  createdAt: number;
  winner?: PublicKey;
}

export interface CreateDuelParams {
  maxRounds: number;
  minBet: number;
  maxBet: number;
  entryFee: number;
}

export interface JoinDuelParams {
  entryFee: number;
}

export interface MakeActionParams {
  actionType: ActionType;
  betAmount: number;
}

export default STRATEGIC_DUEL_CONFIG;