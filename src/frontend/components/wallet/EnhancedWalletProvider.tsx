'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useMagicBlock } from '../contexts/MagicBlockContext';
import { 
  WalletContextType, 
  TokenBalance, 
  NFTMetadata, 
  Transaction, 
  BettingSession,
  GamblingPreferences,
  WalletSecurity,
  NetworkStatus,
  SessionKey,
  WalletError
} from '../types/wallet';
import toast from 'react-hot-toast';

const EnhancedWalletContext = createContext<WalletContextType | undefined>(undefined);

export const useEnhancedWallet = () => {
  const context = useContext(EnhancedWalletContext);
  if (context === undefined) {
    throw new Error('useEnhancedWallet must be used within EnhancedWalletProvider');
  }
  return context;
};

interface EnhancedWalletProviderProps {
  children: React.ReactNode;
}

const DEFAULT_GAMBLING_PREFERENCES: GamblingPreferences = {
  maxBetAmount: 1.0, // 1 SOL
  dailyLossLimit: 5.0, // 5 SOL
  sessionTimeLimit: 120, // 2 hours in minutes
  enableLossLimitAlerts: true,
  enableTimeAlerts: true,
  preferredGames: [],
  riskLevel: 'moderate'
};

export const EnhancedWalletProvider: React.FC<EnhancedWalletProviderProps> = ({ children }) => {
  const { connection } = useConnection();
  const { wallet, publicKey, connected, connecting, connect, disconnect, sendTransaction } = useWallet();
  const { 
    sessionKey: magicBlockSessionKey,
    createSessionKey: createMagicBlockSessionKey,
    revokeSessionKey: revokeMagicBlockSessionKey,
    isConnected,
    isEphemeralActive,
    isRealTimeConnected,
    latency,
    executeAction
  } = useMagicBlock();
  
  // Wallet state
  const [balance, setBalance] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [nfts, setNfts] = useState<NFTMetadata[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<WalletError[]>([]);

  // Gambling features
  const [bettingSession, setBettingSession] = useState<BettingSession | undefined>();
  const [gamblingPreferences, setGamblingPreferences] = useState<GamblingPreferences>(DEFAULT_GAMBLING_PREFERENCES);
  
  // Security state
  const [security, setSecurity] = useState<WalletSecurity>({
    twoFactorEnabled: false,
    lastSecurityCheck: new Date(),
    suspiciousActivity: false,
    ipWhitelist: []
  });

  // Network status
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    rpcLatency: 0,
    wsConnected: false,
    ephemeralActive: false,
    blockHeight: 0,
    lastUpdate: new Date(),
    errors: 0,
    quality: 'offline'
  });

  // Load preferences from localStorage
  useEffect(() => {
    const savedPreferences = localStorage.getItem('gambling_preferences');
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences);
        setGamblingPreferences({ ...DEFAULT_GAMBLING_PREFERENCES, ...parsed });
      } catch (error) {
        console.error('Failed to load gambling preferences:', error);
      }
    }
  }, []);

  // Update network status
  useEffect(() => {
    setNetworkStatus({
      rpcLatency: latency,
      wsConnected: isRealTimeConnected,
      ephemeralActive: isEphemeralActive,
      blockHeight: networkStatus.blockHeight, // Would need to fetch this
      lastUpdate: new Date(),
      errors: networkStatus.errors,
      quality: latency < 50 ? 'excellent' : latency < 150 ? 'good' : latency < 500 ? 'poor' : 'offline'
    });
  }, [latency, isRealTimeConnected, isEphemeralActive]);

  // Fetch SOL balance with error handling
  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) return;
    
    try {
      const balance = await connection.getBalance(publicKey);
      setBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Error fetching balance:', error);
      addError('BALANCE_FETCH_ERROR', 'Failed to fetch wallet balance', error);
    }
  }, [publicKey, connection]);

  // Enhanced token balance fetching
  const fetchTokenBalances = useCallback(async () => {
    if (!publicKey || !connection) return;

    try {
      const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      });

      const balances: TokenBalance[] = [];
      
      for (const account of tokenAccounts.value) {
        try {
          const accountInfo = await connection.getParsedAccountInfo(account.pubkey);
          if (accountInfo.value?.data && 'parsed' in accountInfo.value.data) {
            const parsedInfo = accountInfo.value.data.parsed.info;
            const tokenAmount = parsedInfo.tokenAmount;
            
            if (parseFloat(tokenAmount.amount) > 0) {
              balances.push({
                mint: parsedInfo.mint,
                amount: parseFloat(tokenAmount.uiAmountString || '0'),
                decimals: tokenAmount.decimals,
                symbol: 'Unknown', // Would fetch from token registry
                name: 'Unknown Token',
                usdValue: 0, // Would fetch from price API
                change24h: 0 // Would calculate from price history
              });
            }
          }
        } catch (error) {
          console.error('Error parsing token account:', error);
        }
      }
      
      setTokenBalances(balances);
    } catch (error) {
      console.error('Error fetching token balances:', error);
      addError('TOKEN_FETCH_ERROR', 'Failed to fetch token balances', error);
    }
  }, [publicKey, connection]);

  // Fetch NFTs with enhanced metadata
  const fetchNFTs = useCallback(async () => {
    if (!publicKey) return;

    try {
      // Enhanced NFT fetching would use services like Metaplex, Magic Eden, or Helius
      // This is a placeholder for the actual implementation
      setNfts([]);
    } catch (error) {
      console.error('Error fetching NFTs:', error);
      addError('NFT_FETCH_ERROR', 'Failed to fetch NFTs', error);
    }
  }, [publicKey]);

  // Refresh all wallet data
  const refreshData = useCallback(async () => {
    if (!connected || !publicKey) return;

    setIsLoading(true);
    try {
      await Promise.all([
        fetchBalance(),
        fetchTokenBalances(),
        fetchNFTs(),
      ]);
    } catch (error) {
      console.error('Error refreshing wallet data:', error);
      addError('REFRESH_ERROR', 'Failed to refresh wallet data', error);
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey, fetchBalance, fetchTokenBalances, fetchNFTs]);

  // Enhanced transaction handling with gambling features
  const handleSendTransaction = useCallback(async (transaction: any) => {
    if (!publicKey || !sendTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await sendTransaction(transaction, connection);
      
      const newTransaction: Transaction = {
        signature,
        type: 'token_transfer',
        amount: 0,
        status: 'pending',
        timestamp: new Date(),
        description: 'Transaction',
        fee: 0,
        confirmations: 0
      };
      
      setTransactions(prev => [newTransaction, ...prev]);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }

      // Update transaction status
      setTransactions(prev => 
        prev.map(tx => 
          tx.signature === signature 
            ? { ...tx, status: 'confirmed' as const, confirmations: 1 }
            : tx
        )
      );

      toast.success('Transaction confirmed!');
      await refreshData();
      
      return signature;
    } catch (error) {
      console.error('Transaction error:', error);
      addError('TRANSACTION_ERROR', 'Transaction failed', error);
      throw error;
    }
  }, [publicKey, sendTransaction, connection, refreshData]);

  // Gambling-specific betting function
  const placeBet = useCallback(async (amount: number, gameType: string, odds?: number): Promise<string> => {
    if (!magicBlockSessionKey) {
      throw new Error('Session key required for betting');
    }

    // Check betting limits
    if (amount > gamblingPreferences.maxBetAmount) {
      throw new Error(`Bet amount exceeds maximum limit of ${gamblingPreferences.maxBetAmount} SOL`);
    }

    // Check daily loss limit
    const todayLosses = getTodayLosses();
    if (todayLosses + amount > gamblingPreferences.dailyLossLimit) {
      throw new Error('Daily loss limit would be exceeded');
    }

    try {
      // Use MagicBlock gasless transaction
      const signature = await executeAction('place_bet', {
        amount,
        gameType,
        odds,
        timestamp: Date.now()
      });

      const betTransaction: Transaction = {
        signature,
        type: 'bet',
        amount: -amount, // Negative because it's a bet (spending)
        status: 'pending',
        timestamp: new Date(),
        description: `${gameType} bet`,
        fee: 0 // Gasless transaction
      };

      setTransactions(prev => [betTransaction, ...prev]);

      // Update betting session
      if (bettingSession) {
        setBettingSession(prev => prev ? {
          ...prev,
          totalBets: prev.totalBets + amount,
          transactions: [betTransaction, ...prev.transactions]
        } : prev);
      }

      return signature;
    } catch (error) {
      addError('BET_ERROR', 'Failed to place bet', error);
      throw error;
    }
  }, [magicBlockSessionKey, gamblingPreferences, executeAction, bettingSession]);

  // Claim reward function
  const claimReward = useCallback(async (rewardId: string): Promise<string> => {
    try {
      const signature = await executeAction('claim_reward', { rewardId });
      
      const rewardTransaction: Transaction = {
        signature,
        type: 'reward',
        amount: 0, // Would be set based on reward amount
        status: 'pending',
        timestamp: new Date(),
        description: 'Reward claim',
        fee: 0
      };

      setTransactions(prev => [rewardTransaction, ...prev]);
      return signature;
    } catch (error) {
      addError('REWARD_ERROR', 'Failed to claim reward', error);
      throw error;
    }
  }, [executeAction]);

  // Session key management
  const createSessionKey = useCallback(async (permissions?: string[], maxUsage?: number): Promise<SessionKey> => {
    try {
      const magicBlockSession = await createMagicBlockSessionKey();
      
      const sessionKey: SessionKey = {
        publicKey: magicBlockSession.publicKey,
        expiresAt: magicBlockSession.expiresAt,
        permissions: permissions || ['place_bet', 'claim_reward', 'game_action'],
        created: new Date(),
        usageCount: 0,
        maxUsage
      };

      setSecurity(prev => ({ ...prev, sessionKey }));
      return sessionKey;
    } catch (error) {
      addError('SESSION_KEY_ERROR', 'Failed to create session key', error);
      throw error;
    }
  }, [createMagicBlockSessionKey]);

  const revokeSessionKey = useCallback(() => {
    revokeMagicBlockSessionKey();
    setSecurity(prev => ({ ...prev, sessionKey: undefined }));
  }, [revokeMagicBlockSessionKey]);

  // Betting session management
  const startBettingSession = useCallback(() => {
    const sessionId = `session_${Date.now()}`;
    setBettingSession({
      sessionId,
      startTime: new Date(),
      totalBets: 0,
      totalWins: 0,
      netProfitLoss: 0,
      transactions: [],
      averageBet: 0,
      largestWin: 0,
      largestLoss: 0
    });
  }, []);

  const endBettingSession = useCallback(() => {
    if (bettingSession) {
      setBettingSession(prev => prev ? { ...prev, endTime: new Date() } : prev);
      
      // Store session in history (would typically save to backend)
      const sessionHistory = localStorage.getItem('betting_sessions') || '[]';
      const sessions = JSON.parse(sessionHistory);
      sessions.push(bettingSession);
      localStorage.setItem('betting_sessions', JSON.stringify(sessions.slice(-50))); // Keep last 50 sessions
    }
    setBettingSession(undefined);
  }, [bettingSession]);

  // Utility functions
  const addError = (code: string, message: string, details?: any) => {
    const error: WalletError = {
      code,
      message,
      details,
      timestamp: new Date()
    };
    setErrors(prev => [error, ...prev.slice(0, 9)]); // Keep last 10 errors
  };

  const updateGamblingPreferences = useCallback((preferences: Partial<GamblingPreferences>) => {
    const newPreferences = { ...gamblingPreferences, ...preferences };
    setGamblingPreferences(newPreferences);
    localStorage.setItem('gambling_preferences', JSON.stringify(newPreferences));
  }, [gamblingPreferences]);

  const getTodayLosses = (): number => {
    const today = new Date().toDateString();
    return transactions
      .filter(tx => tx.timestamp.toDateString() === today && tx.type === 'bet' && tx.status === 'confirmed')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  };

  const checkSecurity = useCallback(async (): Promise<boolean> => {
    // Implement security checks
    const now = new Date();
    setSecurity(prev => ({ ...prev, lastSecurityCheck: now }));
    return true;
  }, []);

  const getSpendingAnalytics = useCallback(async (timeframe: 'day' | 'week' | 'month') => {
    // Implement spending analytics
    return {
      totalSpent: 0,
      totalWon: 0,
      netProfitLoss: 0,
      transactionCount: 0
    };
  }, []);

  const getPerformanceMetrics = useCallback(async () => {
    // Implement performance metrics
    return {
      winRate: 0,
      averageBet: 0,
      largestWin: 0,
      largestLoss: 0
    };
  }, []);

  // Handle wallet connection
  const handleConnect = useCallback(async (walletName: any) => {
    try {
      if (wallet?.adapter.name !== walletName) {
        // Switch wallet if different
      }
      await connect();
      toast.success('Wallet connected successfully!');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      addError('CONNECTION_ERROR', 'Failed to connect wallet', error);
    }
  }, [wallet, connect]);

  // Handle wallet disconnection
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      setBalance(0);
      setTokenBalances([]);
      setNfts([]);
      setTransactions([]);
      setBettingSession(undefined);
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      addError('DISCONNECT_ERROR', 'Failed to disconnect wallet', error);
    }
  }, [disconnect]);

  // Fetch data when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      refreshData();
    }
  }, [connected, publicKey, refreshData]);

  const value: WalletContextType = {
    wallet: {
      connected,
      connecting,
      publicKey: publicKey?.toBase58() || null,
      balance,
      walletName: wallet?.adapter.name || null,
    },
    connect: handleConnect,
    disconnect: handleDisconnect,
    balance,
    tokenBalances,
    nfts,
    transactions,
    refreshData,
    sendTransaction: handleSendTransaction,
    
    // Gambling features
    bettingSession,
    startBettingSession,
    endBettingSession,
    gamblingPreferences,
    updateGamblingPreferences,
    
    // Session key management
    sessionKey: security.sessionKey,
    createSessionKey,
    revokeSessionKey,
    
    // Security features
    security,
    checkSecurity,
    
    // Network monitoring
    networkStatus,
    
    // Enhanced transaction methods
    placeBet,
    claimReward,
    
    // Analytics
    getSpendingAnalytics,
    getPerformanceMetrics,
  };

  return (
    <EnhancedWalletContext.Provider value={value}>
      {children}
    </EnhancedWalletContext.Provider>
  );
};