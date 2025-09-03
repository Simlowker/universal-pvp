import { WalletName } from '@solana/wallet-adapter-base';
import { PublicKey } from '@solana/web3.js';

export interface WalletState {
  connected: boolean;
  connecting: boolean;
  publicKey: string | null;
  balance: number;
  walletName: WalletName | null;
}

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  symbol: string;
  name: string;
  logo?: string;
  usdValue?: number;
  change24h?: number;
}

export interface NFTMetadata {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  collection?: {
    name: string;
    family: string;
  };
  rarity?: {
    rank: number;
    score: number;
  };
  floorPrice?: number;
}

export interface Transaction {
  signature: string;
  type: 'bet' | 'reward' | 'nft_trade' | 'token_transfer' | 'session_key' | 'game_action';
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: Date;
  description: string;
  fee?: number;
  confirmations?: number;
  slot?: number;
  blockTime?: number;
  error?: string;
}

// Gambling-specific interfaces
export interface BettingSession {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  totalBets: number;
  totalWins: number;
  netProfitLoss: number;
  transactions: Transaction[];
  averageBet: number;
  largestWin: number;
  largestLoss: number;
}

export interface GamblingPreferences {
  maxBetAmount: number;
  dailyLossLimit: number;
  sessionTimeLimit: number; // minutes
  enableLossLimitAlerts: boolean;
  enableTimeAlerts: boolean;
  preferredGames: string[];
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
}

export interface SessionKey {
  publicKey: PublicKey;
  expiresAt: number;
  permissions: string[];
  created: Date;
  lastUsed?: Date;
  usageCount: number;
  maxUsage?: number;
}

export interface WalletSecurity {
  sessionKey?: SessionKey;
  twoFactorEnabled: boolean;
  lastSecurityCheck: Date;
  suspiciousActivity: boolean;
  ipWhitelist: string[];
}

export interface NetworkStatus {
  rpcLatency: number;
  wsConnected: boolean;
  ephemeralActive: boolean;
  blockHeight: number;
  lastUpdate: Date;
  errors: number;
  quality: 'excellent' | 'good' | 'poor' | 'offline';
}

export interface WalletContextType {
  wallet: WalletState;
  connect: (walletName: WalletName) => Promise<void>;
  disconnect: () => Promise<void>;
  balance: number;
  tokenBalances: TokenBalance[];
  nfts: NFTMetadata[];
  transactions: Transaction[];
  refreshData: () => Promise<void>;
  sendTransaction: (transaction: any) => Promise<string>;
  
  // Gambling-specific features
  bettingSession?: BettingSession;
  startBettingSession: () => void;
  endBettingSession: () => void;
  gamblingPreferences: GamblingPreferences;
  updateGamblingPreferences: (preferences: Partial<GamblingPreferences>) => void;
  
  // Session key management
  sessionKey?: SessionKey;
  createSessionKey: (permissions?: string[], maxUsage?: number) => Promise<SessionKey>;
  revokeSessionKey: () => void;
  
  // Security features
  security: WalletSecurity;
  checkSecurity: () => Promise<boolean>;
  
  // Network monitoring
  networkStatus: NetworkStatus;
  
  // Enhanced transaction methods
  placeBet: (amount: number, gameType: string, odds?: number) => Promise<string>;
  claimReward: (rewardId: string) => Promise<string>;
  
  // Wallet analysis
  getSpendingAnalytics: (timeframe: 'day' | 'week' | 'month') => Promise<any>;
  getPerformanceMetrics: () => Promise<any>;
}

// Utility types for wallet operations
export interface WalletError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export interface WalletCapabilities {
  supportsSessionKeys: boolean;
  supportsMultiSign: boolean;
  supportsHardwareWallet: boolean;
  supportsMobile: boolean;
  supportsWeb: boolean;
  maxTransactionSize: number;
}

export interface ConnectedWallet {
  name: string;
  publicKey: PublicKey;
  capabilities: WalletCapabilities;
  version?: string;
  connected: boolean;
}