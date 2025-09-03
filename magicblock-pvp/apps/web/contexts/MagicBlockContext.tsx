'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
// import { EphemeralRollups } from '../../magicblock/rollup/ephemeral-rollups-client';
// 
import {
  initializeMagicBlockSDK,
  MagicBlockSDKInstance,
  MagicBlockStatus,
  MagicBlockMetrics
} from '../magicblock/index';
import { useWallet } from '@solana/wallet-adapter-react';

interface SessionKey {
  publicKey: PublicKey;
  keypair: Keypair;
  expiresAt: number;
}

interface GameState {
  gameId: string;
  players: string[];
  currentTurn: number;
  gameData: any;
  lastUpdate: number;
}

interface MagicBlockContextType {
  // Connection Management
  ephemeralConnection: Connection | null;
  mainnetConnection: Connection | null;
  isConnected: boolean;
  isEphemeralActive: boolean;
  
  // Session Management
  sessionKey: SessionKey | null;
  createSessionKey: () => Promise<SessionKey>;
  revokeSessionKey: () => void;
  
  // Game State
  gameState: GameState | null;
  updateGameState: (newState: Partial<GameState>) => void;
  
  // Transactions
  executeAction: (action: string, params: any) => Promise<string>;
  isTransactionPending: boolean;
  
  // WebSocket
  wsConnection: WebSocket | null;
  isRealTimeConnected: boolean;
  
  // Performance
  latency: number;
  lastActionTime: number;
}

const MagicBlockContext = createContext<MagicBlockContextType | null>(null);

interface MagicBlockProviderProps {
  children: ReactNode;
}

export const MagicBlockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sdk, setSdk] = useState<MagicBlockSDKInstance | null>(null);
  const [status, setStatus] = useState<MagicBlockStatus | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const initializeSDK = useCallback(async () => {
    if (isInitializing || sdk) return;
    
    setIsInitializing(true);
    try {
      const newSDK = await initializeMagicBlockSDK({
        network: 'devnet',
        enableVRF: true,
        enableRollups: true,
        enableGasless: true,
        maxLatencyMs: 30,
        autoOptimize: true
      });
      
      setSdk(newSDK);
      
      // Update status periodically
      const updateStatus = async () => {
        const currentStatus = await newSDK.getStatus();
        setStatus(currentStatus);
      };
      
      updateStatus();
      const statusInterval = setInterval(updateStatus, 5000);
      
      return () => {
        clearInterval(statusInterval);
        newSDK.cleanup();
      };
      
    } catch (error) {
      console.error('Failed to initialize MagicBlock SDK:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing, sdk]);
  
  useEffect(() => {
    initializeSDK();
  }, [initializeSDK]);
  
  return (
    <MagicBlockContext.Provider value={{
      sdk,
      status,
      isInitializing,
      initializeSDK
    }}>
      {children}
    </MagicBlockContext.Provider>
  );
};

export const useMagicBlock = () => {
  const context = useContext(MagicBlockContext);
  if (!context) {
    throw new Error('useMagicBlock must be used within a MagicBlockProvider');
  }
  return context;
};
