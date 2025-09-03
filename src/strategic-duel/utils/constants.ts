import { PublicKey } from '@solana/web3.js';

// Strategic Duel Program Constants
export const STRATEGIC_DUEL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_STRATEGIC_DUEL_PROGRAM_ID || 
  '6gaBQmha1o6u26PWb9quyzhcxufGWAWBYr71m6e6F3GD'
);

export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_HOST || 'https://api.devnet.solana.com';

// Game Constants
export const GAME_CONSTANTS = {
  MAX_ROUNDS: 10,
  MIN_BET_LAMPORTS: 1_000_000, // 0.001 SOL
  MAX_BET_LAMPORTS: 1_000_000_000, // 1 SOL
  DEFAULT_ENTRY_FEE: 10_000_000, // 0.01 SOL
  TIMEOUT_SECONDS: 60,
  LAMPORTS_PER_SOL: 1_000_000_000,
} as const;

// PDA Seeds
export const PDA_SEEDS = {
  DUEL: 'duel',
  PLAYER: 'player',
  STATS: 'stats',
} as const;

// Action Types (matching Rust enum)
export enum ActionType {
  Raise = 0,
  Call = 1,
  Fold = 2,
}

// Game States (matching Rust enum)
export enum GameState {
  WaitingForOpponent = 0,
  InProgress = 1,
  Completed = 2,
  Cancelled = 3,
}

// Helper functions
export const lamportsToSol = (lamports: number): number => {
  return lamports / GAME_CONSTANTS.LAMPORTS_PER_SOL;
};

export const solToLamports = (sol: number): number => {
  return Math.round(sol * GAME_CONSTANTS.LAMPORTS_PER_SOL);
};

export const formatSol = (lamports: number, decimals: number = 4): string => {
  return lamportsToSol(lamports).toFixed(decimals);
};

export const getProgramExplorerUrl = (): string => {
  const network = SOLANA_NETWORK === 'mainnet-beta' ? '' : `?cluster=${SOLANA_NETWORK}`;
  return `https://explorer.solana.com/address/${STRATEGIC_DUEL_PROGRAM_ID.toString()}${network}`;
};