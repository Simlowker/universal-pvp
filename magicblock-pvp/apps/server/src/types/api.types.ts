import { Request } from 'express';
import { GameStatus, GameType, WinReason, ActionType, ProofType, TransactionType } from '@prisma/client';

// Authenticated request with player data
export interface AuthenticatedRequest extends Request {
  player: {
    id: string;
    walletId: string;
    username?: string;
  };
}

// Game API Types
export interface CreateGameRequest {
  gameType: GameType;
  betAmount: number;
  isPrivate?: boolean;
  password?: string;
}

export interface JoinGameRequest {
  gameId: string;
  password?: string;
}

export interface GameActionRequest {
  gameId: string;
  actionType: ActionType;
  actionData: any;
  clientTimestamp: string;
  signature?: string;
}

export interface SettleGameRequest {
  gameId: string;
  winnerId?: string;
  winReason: WinReason;
  finalProof: string;
  stateRoot: string;
}

// Matchmaking API Types
export interface JoinQueueRequest {
  gameType: GameType;
  betAmount: number;
  preferredOpponentRating?: number;
  maxRatingDifference?: number;
}

export interface QueueStatus {
  inQueue: boolean;
  queuedAt?: string;
  estimatedWaitTime?: number;
  queuePosition?: number;
}

// Profile API Types
export interface PlayerStats {
  playerId: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  winRate: number;
  rating: number;
  peakRating: number;
  totalEarnings: number;
  totalSpent: number;
  netPnL: number;
  dailyPnL: number;
  weeklyPnL: number;
  monthlyPnL: number;
  streakDays: number;
  longestStreak: number;
  lastActiveAt?: string;
}

export interface GameHistoryQuery {
  limit?: number;
  offset?: number;
  gameType?: GameType;
  status?: GameStatus;
  startDate?: string;
  endDate?: string;
}

export interface GameHistoryItem {
  id: string;
  gameId: string;
  gameType: GameType;
  status: GameStatus;
  betAmount: number;
  opponentId: string;
  opponentUsername?: string;
  isWinner: boolean;
  winReason?: WinReason;
  pnlAmount: number;
  duration?: number;
  createdAt: string;
  endedAt?: string;
}

export interface PnLQuery {
  period?: 'daily' | 'weekly' | 'monthly' | 'all';
  startDate?: string;
  endDate?: string;
  gameType?: GameType;
}

export interface PnLData {
  period: string;
  totalGames: number;
  winnings: number;
  losses: number;
  netPnL: number;
  winRate: number;
  avgWinAmount: number;
  avgLossAmount: number;
  bestStreak: number;
  worstStreak: number;
  gameBreakdown: Array<{
    gameType: GameType;
    games: number;
    netPnL: number;
    winRate: number;
  }>;
}

// Leaderboard API Types
export interface LeaderboardQuery {
  period?: 'daily' | 'weekly' | 'monthly' | 'all';
  gameType?: GameType;
  limit?: number;
  offset?: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username?: string;
  rating: number;
  gamesPlayed: number;
  winRate: number;
  netPnL: number;
  totalEarnings: number;
}

// Cost Metrics API Types
export interface CostMetricsQuery {
  startDate?: string;
  endDate?: string;
  category?: string;
  operation?: string;
  gameId?: string;
}

export interface CostSummary {
  totalCostUsd: number;
  totalSolanaFees: number;
  totalComputeUnits: number;
  operationCount: number;
  averageCostPerOperation: number;
  costBreakdown: Array<{
    category: string;
    costUsd: number;
    percentage: number;
    operationCount: number;
  }>;
  optimizationSuggestions: string[];
  potentialSavings: number;
}

// Fee Estimation Types
export interface FeeEstimationRequest {
  operation: string;
  complexity?: 'low' | 'medium' | 'high';
  urgency?: 'low' | 'normal' | 'high';
  computeUnits?: number;
}

export interface FeeEstimate {
  baseFee: number;
  priorityFee: number;
  totalFee: number;
  costUsd: number;
  estimatedConfirmationTime: number;
  congestionLevel: 'low' | 'medium' | 'high';
  alternatives: Array<{
    priority: string;
    fee: number;
    estimatedTime: number;
  }>;
}

// WebSocket Event Types
export interface WebSocketEvents {
  // Game events
  'game:created': {
    gameId: string;
    game: any;
  };
  'game:joined': {
    gameId: string;
    playerId: string;
  };
  'game:started': {
    gameId: string;
    startTime: string;
    gameData: any;
  };
  'game:action': {
    gameId: string;
    playerId: string;
    action: GameActionRequest;
  };
  'game:state_update': {
    gameId: string;
    gameState: any;
    timestamp: string;
  };
  'game:ended': {
    gameId: string;
    winnerId?: string;
    winReason: WinReason;
    finalState: any;
  };
  
  // Matchmaking events
  'matchmaking:joined': {
    playerId: string;
    gameType: GameType;
    betAmount: number;
  };
  'matchmaking:match_found': {
    gameId: string;
    opponentId: string;
    estimatedStartTime: string;
  };
  'matchmaking:left': {
    playerId: string;
  };
  
  // System events
  'odds:update': {
    gameId: string;
    player1Odds: number;
    player2Odds: number;
  };
  'latency:check': {
    timestamp: string;
    serverId: string;
  };
  'error': {
    code: string;
    message: string;
    details?: any;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    pagination?: {
      total: number;
      page: number;
      limit: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

// Error Types
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super('AUTHENTICATION_ERROR', message, 401);
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super('AUTHORIZATION_ERROR', message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: any) {
    super('CONFLICT', message, 409, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded') {
    super('RATE_LIMIT_EXCEEDED', message, 429);
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error', details?: any) {
    super('INTERNAL_SERVER_ERROR', message, 500, details);
  }
}