/**
 * SOL Duel TypeScript SDK Type Definitions
 * Version: 1.0.0
 * 
 * This file contains comprehensive type definitions for the SOL Duel API
 * Use these types for full TypeScript support in your integration
 */

// =============================================================================
// Core Types
// =============================================================================

export type GameType = 'duel' | 'tournament' | 'practice';
export type GameStatus = 'waiting' | 'active' | 'finished' | 'cancelled';
export type PlayerClass = 'warrior' | 'mage' | 'rogue' | 'paladin' | 'berserker';
export type CombatActionType = 'attack' | 'heal' | 'special' | 'defend' | 'use_item';
export type MatchCompletionReason = 'victory' | 'surrender' | 'timeout' | 'disconnection';

// =============================================================================
// Authentication Types
// =============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  walletAddress: string;
}

export interface WalletVerifyRequest {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  player: PlayerProfile;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  token: string;
  refreshToken: string;
}

// =============================================================================
// Player Types
// =============================================================================

export interface PlayerProfile {
  id: string;
  username: string;
  email: string;
  walletAddress: string;
  eloRating: number;
  isVerified: boolean;
  bio?: string;
  avatar?: string;
  stats: PlayerStats;
  createdAt: string;
  lastLoginAt: string;
}

export interface PlayerStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  averageDamage: number;
  totalEarnings: number;
  currentStreak: number;
  longestWinStreak: number;
  level: number;
  experience: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
}

export interface UpdateProfileRequest {
  username?: string;
  bio?: string;
  avatar?: string;
}

export interface LeaderboardEntry {
  rank: number;
  player: {
    id: string;
    username: string;
    avatar?: string;
  };
  eloRating: number;
  wins: number;
  totalMatches: number;
  winRate: number;
  totalEarnings: number;
}

// =============================================================================
// Game Types
// =============================================================================

export interface CreateGameRequest {
  gameType: GameType;
  wagerAmount: number;
  isPrivate?: boolean;
  maxPlayers?: number;
  timeLimit?: number;
  settings?: Record<string, any>;
}

export interface Game {
  id: string;
  gameType: GameType;
  status: GameStatus;
  wagerAmount: number;
  maxPlayers: number;
  currentPlayers: number;
  timeLimit: number;
  isPrivate: boolean;
  creator: {
    id: string;
    username: string;
    eloRating: number;
  };
  players: GamePlayer[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

export interface GameDetails extends Game {
  currentTurn?: string;
  turnTimeRemaining?: number;
  gameState?: GameState;
  rewardPool: number;
  round: number;
}

export interface GamePlayer {
  id: string;
  username: string;
  eloRating: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  isAlive: boolean;
  isReady: boolean;
  joinedAt: string;
  stats?: PlayerGameStats;
}

export interface PlayerGameStats {
  level: number;
  attack: number;
  defense: number;
  speed: number;
  health: number;
  mana: number;
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  currentTurn: string;
  turnTimeRemaining: number;
  players: GamePlayer[];
  round: number;
  turnNumber: number;
}

export interface JoinGameRequest {
  wagerAmount: number;
}

export interface GameMoveRequest {
  moveType: CombatActionType;
  data: CombatActionData;
  timestamp: number;
}

export interface CombatActionData {
  target?: number;
  power?: number;
  manaCost?: number;
  itemId?: string;
  skillId?: string;
  weaponType?: string;
}

export interface CombatAction {
  type: CombatActionType;
  target?: number;
  power?: number;
  manaCost?: number;
  itemId?: string;
  skillId?: string;
}

export interface GameMoveResponse {
  success: boolean;
  message: string;
  data: {
    moveResult: CombatResult;
    gameState: GameState;
    nextTurn?: string;
    gameComplete: boolean;
  };
}

export interface CombatResult {
  attacker: string;
  target?: string;
  damage?: number;
  healing?: number;
  criticalHit: boolean;
  targetDefeated: boolean;
  experienceGained: number;
  effects?: StatusEffect[];
}

export interface StatusEffect {
  type: string;
  duration: number;
  power: number;
  description: string;
}

export interface GameResult {
  gameId: string;
  winner?: string;
  reason: MatchCompletionReason;
  finalScores: Record<string, PlayerMatchResult>;
  eloChanges: Record<string, number>;
  rewards: Record<string, number>;
  duration: number;
  endedAt: string;
}

export interface PlayerMatchResult {
  health: number;
  damageDealt: number;
  damageTaken: number;
  actionsPerformed: number;
  survivedRounds: number;
}

export interface GameHistory {
  id: string;
  gameType: GameType;
  status: GameStatus;
  wagerAmount: number;
  result: 'won' | 'lost' | 'draw';
  opponent?: {
    id: string;
    username: string;
  };
  eloChange: number;
  reward: number;
  duration: number;
  createdAt: string;
  endedAt: string;
}

export interface QuickMatchRequest {
  wagerAmount?: number;
  gameType?: GameType;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface APIError {
  error: string;
  message: string;
  code: string;
  details?: string;
  timestamp: string;
  path: string;
  requestId: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    pagination: PaginationInfo;
  };
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

export interface WebSocketEvents {
  // Connection events
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: any) => void;
  authenticated: (data: { playerId: string; username: string }) => void;
  auth_error: (error: { message: string }) => void;

  // Game lifecycle events
  game_state: (data: { gameId: string; game: GameDetails }) => void;
  match_created: (data: MatchCreatedEvent) => void;
  player_joined: (data: PlayerJoinedEvent) => void;
  player_left: (data: PlayerLeftEvent) => void;
  match_started: (data: MatchStartedEvent) => void;
  game_completed: (data: GameCompletedEvent) => void;

  // Gameplay events
  move_made: (data: MoveExecutedEvent) => void;
  turn_changed: (data: TurnChangedEvent) => void;
  player_health_updated: (data: HealthUpdateEvent) => void;
  player_status_updated: (data: StatusUpdateEvent) => void;
  game_chat_message: (data: ChatMessageEvent) => void;

  // Player events
  player_ready_status: (data: PlayerReadyEvent) => void;
  player_disconnected: (data: PlayerDisconnectedEvent) => void;
  player_reconnected: (data: PlayerReconnectedEvent) => void;

  // Error events
  error: (error: { message: string; code?: string }) => void;
  move_error: (error: { message: string }) => void;
  rate_limit_exceeded: (data: { message: string; resetTime: string }) => void;
}

export interface MatchCreatedEvent {
  matchId: string;
  creator: {
    id: string;
    username: string;
  };
  config: {
    gameType: GameType;
    wagerAmount: number;
    maxPlayers: number;
    timeLimit: number;
  };
  timestamp: number;
}

export interface PlayerJoinedEvent {
  playerId: string;
  username: string;
  gameId: string;
  timestamp: number;
}

export interface PlayerLeftEvent {
  playerId: string;
  username: string;
  gameId: string;
  timestamp: number;
}

export interface MatchStartedEvent {
  matchId: string;
  players: GamePlayer[];
  startTime: number;
  firstTurn: string;
}

export interface GameCompletedEvent {
  gameId: string;
  winner?: string;
  reason: MatchCompletionReason;
  finalScores: Record<string, PlayerMatchResult>;
  eloChanges: Record<string, number>;
  rewards: Record<string, number>;
  duration: number;
  endedAt: number;
}

export interface MoveExecutedEvent {
  gameId: string;
  playerId: string;
  username: string;
  moveType: CombatActionType;
  moveData: CombatActionData;
  timestamp: number;
  gameState: GameState;
  result?: CombatResult;
}

export interface TurnChangedEvent {
  gameId: string;
  currentPlayer: string;
  turnNumber: number;
  timeRemaining: number;
  previousPlayer?: string;
}

export interface HealthUpdateEvent {
  playerId: string;
  newHealth: number;
  maxHealth: number;
  damage?: number;
  healing?: number;
  source?: string;
}

export interface StatusUpdateEvent {
  playerId: string;
  statusEffects: StatusEffect[];
}

export interface ChatMessageEvent {
  gameId: string;
  playerId: string;
  username: string;
  message: string;
  timestamp: number;
}

export interface PlayerReadyEvent {
  gameId: string;
  playerId: string;
  username: string;
  ready: boolean;
}

export interface PlayerDisconnectedEvent {
  playerId: string;
  username: string;
  gameId: string;
  timestamp: number;
}

export interface PlayerReconnectedEvent {
  playerId: string;
  username: string;
  gameId: string;
  timestamp: number;
}

// =============================================================================
// Client Configuration Types
// =============================================================================

export interface APIClientConfig {
  baseURL: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface WebSocketConfig {
  url: string;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

export interface ClientConfig {
  api: APIClientConfig;
  websocket: WebSocketConfig;
  solana?: {
    network: 'mainnet-beta' | 'testnet' | 'devnet';
    rpcUrl: string;
  };
}

// =============================================================================
// Solana Program Types
// =============================================================================

export interface SolanaGameState {
  upgradeAuthority: string;
  totalMatches: number;
  totalPlayers: number;
  totalRewardsDistributed: number;
  paused: boolean;
}

export interface SolanaPlayerProfile {
  owner: string;
  username: string;
  playerClass: PlayerClass;
  baseStats: PlayerGameStats;
  level: number;
  experience: number;
  totalMatches: number;
  wins: number;
  losses: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  createdAt: number;
  lastMatchAt: number;
  isActive: boolean;
}

export interface SolanaMatch {
  creator: string;
  matchId: string;
  config: SolanaMatchConfig;
  state: GameStatus;
  players: SolanaMatchPlayer[];
  currentTurn: number;
  turnDeadline: number;
  rewardPool: number;
  winner?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface SolanaMatchConfig {
  entryFee: number;
  maxPlayers: number;
  turnTimeout: number;
  matchDuration: number;
  gameMode: string;
  allowSpectators: boolean;
}

export interface SolanaMatchPlayer {
  player: string;
  stats: PlayerGameStats;
  currentHealth: number;
  currentMana: number;
  isAlive: boolean;
  actionsTaken: number;
  damageDealt: number;
  damageTaken: number;
  joinedAt: number;
}

// =============================================================================
// Utility Types
// =============================================================================

export type EventHandler<T = any> = (data: T) => void;

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export type FilterOptions<T> = Partial<T> & {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
};

export interface GameFilters {
  status?: GameStatus;
  gameType?: GameType;
  minWager?: number;
  maxWager?: number;
  creatorId?: string;
}

export interface PlayerFilters {
  minRating?: number;
  maxRating?: number;
  minLevel?: number;
  maxLevel?: number;
  playerClass?: PlayerClass;
}

// =============================================================================
// SDK Class Interface Types
// =============================================================================

export interface SolDuelAPIInterface {
  // Authentication methods
  login(email: string, password: string): Promise<AuthResponse>;
  register(data: RegisterRequest): Promise<AuthResponse>;
  verifyWallet(data: WalletVerifyRequest): Promise<AuthResponse>;
  refreshToken(refreshToken: string): Promise<RefreshTokenResponse>;
  logout(): void;

  // Game methods
  getAvailableGames(filters?: FilterOptions<GameFilters>): Promise<Game[]>;
  createGame(config: CreateGameRequest): Promise<Game>;
  joinGame(gameId: string, wagerAmount: number): Promise<Game>;
  getGameDetails(gameId: string): Promise<GameDetails>;
  makeMove(gameId: string, move: GameMoveRequest): Promise<GameMoveResponse>;
  surrenderGame(gameId: string): Promise<GameResult>;
  findQuickMatch(options?: QuickMatchRequest): Promise<Game>;
  getPlayerHistory(filters?: FilterOptions<{}>): Promise<GameHistory[]>;

  // Player methods
  getPlayerProfile(): Promise<PlayerProfile>;
  updatePlayerProfile(data: UpdateProfileRequest): Promise<PlayerProfile>;
  getPlayerStats(playerId: string): Promise<PlayerStats>;
  getLeaderboard(options?: {
    period?: string;
    type?: string;
    limit?: number;
  }): Promise<LeaderboardEntry[]>;

  // Utility methods
  setAuthToken(token: string): void;
  getAuthToken(): string | null;
  isAuthenticated(): boolean;
}

export interface WebSocketClientInterface {
  // Connection methods
  connect(token: string, url?: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;

  // Event methods
  on<K extends keyof WebSocketEvents>(event: K, handler: WebSocketEvents[K]): void;
  off<K extends keyof WebSocketEvents>(event: K, handler?: WebSocketEvents[K]): void;
  emit(event: string, data?: any): void;

  // Game methods
  joinGame(gameId: string): void;
  leaveGame(gameId: string): void;
  makeMove(moveData: GameMoveRequest): void;
  sendChatMessage(message: string): void;
  setPlayerReady(gameId: string): void;
  requestGameState(gameId: string): void;
}

// =============================================================================
// Module Exports
// =============================================================================

export default interface SolDuelSDK {
  api: SolDuelAPIInterface;
  websocket: WebSocketClientInterface;
  config: ClientConfig;
}

// Type guards for runtime type checking
export function isAPIError(error: any): error is APIError {
  return error && typeof error.error === 'string' && typeof error.code === 'string';
}

export function isGamePlayer(obj: any): obj is GamePlayer {
  return obj && typeof obj.id === 'string' && typeof obj.username === 'string';
}

export function isGameState(obj: any): obj is GameState {
  return obj && typeof obj.gameId === 'string' && typeof obj.status === 'string';
}

// Generic event type for custom events
export interface CustomWebSocketEvent<T = any> {
  event: string;
  data: T;
  timestamp: number;
}

// Constants
export const GAME_TYPES: readonly GameType[] = ['duel', 'tournament', 'practice'] as const;
export const GAME_STATUSES: readonly GameStatus[] = ['waiting', 'active', 'finished', 'cancelled'] as const;
export const PLAYER_CLASSES: readonly PlayerClass[] = ['warrior', 'mage', 'rogue', 'paladin', 'berserker'] as const;
export const COMBAT_ACTIONS: readonly CombatActionType[] = ['attack', 'heal', 'special', 'defend', 'use_item'] as const;