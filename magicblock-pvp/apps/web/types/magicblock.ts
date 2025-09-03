import { PublicKey, Keypair } from '@solana/web3.js';

export interface SessionKey {
  publicKey: PublicKey;
  keypair: Keypair;
  expiresAt: number;
  permissions?: string[];
}

export interface GameState {
  gameId: string;
  players: string[];
  currentTurn: number;
  gameData: {
    playerHealth?: number;
    opponentHealth?: number;
    playerMana?: number;
    opponentMana?: number;
    battleLog?: string[];
    battleEnded?: boolean;
    winner?: string;
    endTime?: number;
    [key: string]: any;
  };
  lastUpdate: number;
}

export interface WebSocketGameMessage {
  type: 'connect' | 'authenticate' | 'gameAction' | 'optimisticUpdate' | 'syncRequest' | 'ping' | 'pong' | 'error';
  data?: any;
  timestamp?: number;
  signature?: string;
  sessionKey?: string;
  gameId?: string;
}

export interface GameAction {
  id: string;
  type: string;
  params: Record<string, any>;
  timestamp: number;
  playerId: string;
  gameId: string;
}

export interface OptimisticUpdate {
  actionId: string;
  result: any;
  timestamp: number;
  confirmed: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  latency: number;
  actionResponseTime: number;
  memoryUsage: number;
  connectionStatus: 'excellent' | 'good' | 'poor';
  networkType: 'ephemeral' | 'mainnet';
}

export interface MagicBlockConfig {
  enableEphemeralRollups: boolean;
  sessionKeyDuration: number;
  targetLatency: number;
  targetFps: number;
  autoReconnect: boolean;
  optimisticUpdates: boolean;
}