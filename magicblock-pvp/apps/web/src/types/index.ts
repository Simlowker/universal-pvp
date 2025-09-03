import { PublicKey } from '@solana/web3.js'

// User and Wallet Types
export interface User {
  id: string
  walletAddress: string
  username?: string
  avatar?: string
  stats: UserStats
  tier: UserTier
  createdAt: Date
  lastActive: Date
}

export interface UserStats {
  totalGames: number
  wins: number
  losses: number
  winRate: number
  totalWinnings: number
  totalLosses: number
  netPnL: number
  currentStreak: number
  bestStreak: number
  averageBetSize: number
  favoriteGame?: string
}

export type UserTier = 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary'

// Game Types
export interface Game {
  id: string
  type: GameType
  name: string
  description: string
  minBet: number
  maxBet: number
  houseEdge: number
  isActive: boolean
  playerCount: number
  maxPlayers: number
  totalVolume: number
  recentGames: GameResult[]
}

export type GameType = 'coinflip' | 'roulette' | 'dice' | 'blackjack' | 'poker' | 'crash' | 'mines'

export interface GameRoom {
  id: string
  gameType: GameType
  players: Player[]
  maxPlayers: number
  minBet: number
  maxBet: number
  status: GameStatus
  currentRound?: GameRound
  history: GameResult[]
  createdAt: Date
}

export type GameStatus = 'waiting' | 'starting' | 'in_progress' | 'finished' | 'cancelled'

export interface Player {
  id: string
  user: User
  isHost: boolean
  isReady: boolean
  betAmount?: number
  position?: number
  isConnected: boolean
  joinedAt: Date
}

export interface GameRound {
  id: string
  roundNumber: number
  startTime: Date
  endTime?: Date
  status: RoundStatus
  bets: Bet[]
  result?: GameResult
  randomSeed?: string
}

export type RoundStatus = 'betting' | 'playing' | 'revealing' | 'finished'

export interface Bet {
  id: string
  playerId: string
  amount: number
  prediction: any // Game-specific prediction data
  odds: number
  placedAt: Date
  status: BetStatus
}

export type BetStatus = 'pending' | 'active' | 'won' | 'lost' | 'cancelled' | 'refunded'

export interface GameResult {
  id: string
  gameType: GameType
  roundId: string
  result: any // Game-specific result data
  winningBets: string[]
  totalPayout: number
  houseWin: number
  finishedAt: Date
  participants: number
}

// Blockchain and MagicBlock Types
export interface EphemeralAccount {
  publicKey: PublicKey
  balance: number
  isActive: boolean
}

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  status: TransactionStatus
  fromAddress?: string
  toAddress?: string
  signature?: string
  blockTime?: Date
  confirmations: number
}

export type TransactionType = 'deposit' | 'withdrawal' | 'bet' | 'win' | 'refund'
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled'

// WebSocket Types
export interface WebSocketMessage {
  type: WSMessageType
  payload: any
  timestamp: Date
}

export type WSMessageType = 
  | 'game_update'
  | 'player_joined'
  | 'player_left'
  | 'bet_placed'
  | 'round_started'
  | 'round_finished'
  | 'user_update'
  | 'error'
  | 'heartbeat'

// API Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Store Types
export interface GameStore {
  // Current game state
  currentGame: Game | null
  currentRoom: GameRoom | null
  currentPlayer: Player | null
  
  // Game actions
  joinGame: (gameId: string, betAmount: number) => Promise<void>
  leaveGame: () => void
  placeBet: (amount: number, prediction: any) => Promise<void>
  
  // Game updates
  updateGame: (game: Partial<Game>) => void
  updateRoom: (room: Partial<GameRoom>) => void
  addPlayer: (player: Player) => void
  removePlayer: (playerId: string) => void
  
  // State flags
  isLoading: boolean
  error: string | null
}

export interface UserStore {
  user: User | null
  isConnected: boolean
  ephemeralAccount: EphemeralAccount | null
  balance: number
  
  // User actions
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  updateProfile: (updates: Partial<User>) => Promise<void>
  
  // Blockchain actions
  createEphemeralAccount: () => Promise<void>
  deposit: (amount: number) => Promise<void>
  withdraw: (amount: number) => Promise<void>
  
  setUser: (user: User | null) => void
  setBalance: (balance: number) => void
  setEphemeralAccount: (account: EphemeralAccount | null) => void
}

// Component Props Types
export interface GameTableProps {
  game: Game
  room: GameRoom
  onBet: (amount: number, prediction: any) => void
  disabled?: boolean
}

export interface OddsMeterProps {
  odds: number
  trend: 'up' | 'down' | 'stable'
  animated?: boolean
}

export interface ActionPadProps {
  gameType: GameType
  minBet: number
  maxBet: number
  balance: number
  onBet: (amount: number, prediction: any) => void
  disabled?: boolean
}

export interface LiveFeedProps {
  games: GameResult[]
  limit?: number
}

export interface TrendingGamesProps {
  games: Game[]
  onGameSelect: (game: Game) => void
}

export interface PnLChartProps {
  data: PnLDataPoint[]
  timeframe: '24h' | '7d' | '30d' | 'all'
  onTimeframeChange: (timeframe: string) => void
}

export interface PnLDataPoint {
  timestamp: Date
  value: number
  cumulative: number
}

export interface MatchHistoryProps {
  matches: GameResult[]
  loading?: boolean
  onLoadMore?: () => void
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys]