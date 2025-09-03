'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { WalletContextType, TokenBalance, NFTMetadata, Transaction } from '../types/wallet';
import toast from 'react-hot-toast';

const WalletGameContext = createContext<WalletContextType | undefined>(undefined);

export const useWalletContext = () => {
  const context = useContext(WalletGameContext);
  if (context === undefined) {
    throw new Error('useWalletContext must be used within a WalletGameProvider');
  }
  return context;
};

interface WalletGameProviderProps {
  children: React.ReactNode;
}

export const WalletGameProvider: React.FC<WalletGameProviderProps> = ({ children }) => {
  const { connection } = useConnection();
  const { wallet, publicKey, connected, connecting, connect, disconnect, sendTransaction } = useWallet();
  
  const [balance, setBalance] = useState<number>(0);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [nfts, setNfts] = useState<NFTMetadata[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Session management for auto-renewal
  const [sessionExpiry, setSessionExpiry] = useState<Date | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  
  // Performance tracking
  const [responseTime, setResponseTime] = useState<number>(0);

  // Fetch SOL balance
  const fetchBalance = async () => {
    if (!publicKey || !connection) {
      console.log('Cannot fetch balance - missing publicKey or connection');
      return;
    }
    
    try {
      console.log('Fetching balance for:', publicKey.toBase58());
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      console.log('Balance fetched:', solBalance, 'SOL');
      setBalance(solBalance);
    } catch (error) {
      console.error('Error fetching balance:', error);
      toast.error('Failed to fetch wallet balance');
    }
  };

  // Fetch token balances
  const fetchTokenBalances = async () => {
    if (!publicKey || !connection) return;

    try {
      // This is a simplified implementation
      // In production, you'd use a service like Jupiter or Token List
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
    }
  };

  // Fetch NFTs (simplified)
  const fetchNFTs = async () => {
    if (!publicKey) return;

    try {
      // In production, you'd use a service like Metaplex or Magic Eden API
      // This is a placeholder implementation
      setNfts([]);
    } catch (error) {
      console.error('Error fetching NFTs:', error);
    }
  };

  // Refresh all wallet data
  const refreshData = async () => {
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
      toast.error('Failed to refresh wallet data');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle wallet connection
  const handleConnect = async (walletName: any) => {
    try {
      if (wallet?.adapter.name !== walletName) {
        // Switch wallet if different
      }
      await connect();
      toast.success('Wallet connected successfully!');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    }
  };

  // Handle wallet disconnection
  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(0);
      setTokenBalances([]);
      setNfts([]);
      setTransactions([]);
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  // Custom send transaction with better error handling
  const handleSendTransaction = async (transaction: any) => {
    if (!publicKey || !sendTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await sendTransaction(transaction, connection);
      
      // Add to local transactions
      const newTransaction: Transaction = {
        signature,
        type: 'bet', // Default, should be passed as parameter
        amount: 0, // Should be calculated from transaction
        status: 'pending',
        timestamp: new Date(),
        description: 'Game transaction',
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
            ? { ...tx, status: 'confirmed' as const }
            : tx
        )
      );

      toast.success('Transaction confirmed!');
      refreshData(); // Refresh balances
      
      return signature;
    } catch (error) {
      console.error('Transaction error:', error);
      toast.error('Transaction failed');
      throw error;
    }
  };

  // Fetch data when wallet connects
  useEffect(() => {
    console.log('WalletContext state change:', {
      connected,
      publicKey: publicKey?.toBase58(),
      walletName: wallet?.adapter.name,
    });
    
    if (connected && publicKey) {
      console.log('Wallet connected, refreshing data...');
      refreshData();
    } else if (!connected) {
      console.log('Wallet disconnected, clearing data...');
      setBalance(0);
      setTokenBalances([]);
      setNfts([]);
      setTransactions([]);
    }
  }, [connected, publicKey, wallet?.adapter.name]);

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
    
    // Gambling-specific features
    startBettingSession: () => console.log('Betting session started'),
    endBettingSession: () => console.log('Betting session ended'),
    gamblingPreferences: {
      maxBetAmount: 1.0,
      dailyLossLimit: 5.0,
      sessionTimeLimit: 120,
      enableLossLimitAlerts: true,
      enableTimeAlerts: true,
      preferredGames: [],
      riskLevel: 'moderate',
    },
    updateGamblingPreferences: () => console.log('Preferences updated'),
    
    // Session key management
    createSessionKey: async () => ({ publicKey: publicKey!, expiresAt: Date.now() + 86400000, permissions: [], created: new Date(), usageCount: 0 }),
    revokeSessionKey: () => console.log('Session key revoked'),
    
    // Security features
    security: {
      twoFactorEnabled: false,
      lastSecurityCheck: new Date(),
      suspiciousActivity: false,
      ipWhitelist: [],
    },
    checkSecurity: async () => true,
    
    // Network monitoring
    networkStatus: {
      rpcLatency: responseTime,
      wsConnected: true,
      ephemeralActive: false,
      blockHeight: 0,
      lastUpdate: new Date(),
      errors: 0,
      quality: 'good',
    },
    
    // Enhanced transaction methods
    placeBet: async (amount: number) => await handleSendTransaction({}),
    claimReward: async (rewardId: string) => await handleSendTransaction({}),
    
    // Wallet analysis
    getSpendingAnalytics: async () => ({}),
    getPerformanceMetrics: async () => ({}),
  };

  return (
    <WalletGameContext.Provider value={value}>
      {children}
    </WalletGameContext.Provider>
  );
};