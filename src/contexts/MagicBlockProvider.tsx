'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { DELEGATION_PROGRAM_ID, MAGIC_PROGRAM_ID } from '../../magicblock/rollup/ephemeral-rollups-client';

export interface GamePlayer {
  publicKey: string;
  health: number;
  mana: number;
  level: number;
  experience: number;
  wins: number;
  losses: number;
}

export interface GameState {
  matchId: string | null;
  players: GamePlayer[];
  currentTurn: number;
  phase: 'waiting' | 'battle' | 'completed';
  winner: string | null;
  actions: GameAction[];
}

export interface GameAction {
  id: string;
  playerId: string;
  type: 'attack' | 'defend' | 'special' | 'heal';
  target?: string;
  damage?: number;
  timestamp: number;
}

interface MagicBlockContextType {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Session key management
  sessionKey: Keypair | null;
  playerAddress: string | null;
  
  // Game state
  gameState: GameState;
  isInMatch: boolean;
  
  // Connection methods
  connect: () => Promise<void>;
  disconnect: () => void;
  
  // Game methods
  joinMatchmaking: () => Promise<void>;
  leaveMatchmaking: () => Promise<void>;
  performAction: (action: Omit<GameAction, 'id' | 'timestamp'>) => Promise<void>;
  
  // Real-time updates
  subscribeToUpdates: () => void;
  unsubscribeFromUpdates: () => void;
}

const MagicBlockContext = createContext<MagicBlockContextType | null>(null);

interface MagicBlockProviderProps {
  children: ReactNode;
  rpcEndpoint?: string;
  ephemeralRpcEndpoint?: string;
}

export const MagicBlockProvider: React.FC<MagicBlockProviderProps> = ({
  children,
  rpcEndpoint = 'https://api.mainnet-beta.solana.com',
  ephemeralRpcEndpoint = 'https://devnet.magicblock.app'
}) => {
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Connections
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ephemeralConnection, setEphemeralConnection] = useState<Connection | null>(null);
  const [magicBlockEngine, setMagicBlockEngine] = useState<any | null>(null);
  
  // Session management
  const [sessionKey, setSessionKey] = useState<Keypair | null>(null);
  const [playerAddress, setPlayerAddress] = useState<string | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    matchId: null,
    players: [],
    currentTurn: 0,
    phase: 'waiting',
    winner: null,
    actions: []
  });
  const [isInMatch, setIsInMatch] = useState(false);
  
  // WebSocket for real-time updates
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Generate or load session key
  const initializeSessionKey = useCallback(() => {
    try {
      const stored = localStorage.getItem('magicblock_session_key');
      if (stored) {
        const secretKey = new Uint8Array(JSON.parse(stored));
        const keypair = Keypair.fromSecretKey(secretKey);
        setSessionKey(keypair);
        setPlayerAddress(keypair.publicKey.toString());
        return keypair;
      } else {
        const newKeypair = Keypair.generate();
        localStorage.setItem('magicblock_session_key', JSON.stringify(Array.from(newKeypair.secretKey)));
        setSessionKey(newKeypair);
        setPlayerAddress(newKeypair.publicKey.toString());
        return newKeypair;
      }
    } catch (err) {
      console.error('Failed to initialize session key:', err);
      setError('Failed to initialize session key');
      return null;
    }
  }, []);

  // Initialize connections
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      // Initialize session key
      const keypair = initializeSessionKey();
      if (!keypair) throw new Error('Failed to initialize session key');
      
      // Create connections
      const mainnetConnection = new Connection(rpcEndpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 30000
      });
      
      const erConnection = new Connection(ephemeralRpcEndpoint, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 10000
      });
      
      // Initialize MagicBlock engine (placeholder implementation)
      const engine = {
        rpcUrl: rpcEndpoint,
        ephemeralRpcUrl: ephemeralRpcEndpoint,
        sessionKey: keypair,
        async sendTransaction(transaction: Transaction) {
          // Placeholder implementation
          console.log('Sending transaction:', transaction);
          return 'transaction_signature_placeholder';
        }
      };
      
      setConnection(mainnetConnection);
      setEphemeralConnection(erConnection);
      setMagicBlockEngine(engine);
      setIsConnected(true);
      
      console.log('MagicBlock connected successfully');
      console.log('Player address:', keypair.publicKey.toString());
      
    } catch (err) {
      console.error('Connection failed:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected, rpcEndpoint, ephemeralRpcEndpoint, initializeSessionKey]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
    
    setConnection(null);
    setEphemeralConnection(null);
    setMagicBlockEngine(null);
    setIsConnected(false);
    setError(null);
    
    // Reset game state
    setGameState({
      matchId: null,
      players: [],
      currentTurn: 0,
      phase: 'waiting',
      winner: null,
      actions: []
    });
    setIsInMatch(false);
    
    console.log('Disconnected from MagicBlock');
  }, [ws]);

  // Real-time WebSocket connection
  const subscribeToUpdates = useCallback(() => {
    if (!isConnected || !playerAddress || ws) return;
    
    try {
      const websocket = new WebSocket(`wss://api.magicblock.app/ws/${playerAddress}`);
      
      websocket.onopen = () => {
        console.log('WebSocket connected for real-time updates');
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'gameState':
              setGameState(data.payload);
              break;
            case 'matchFound':
              setIsInMatch(true);
              setGameState(prev => ({ ...prev, matchId: data.payload.matchId, phase: 'battle' }));
              break;
            case 'matchEnded':
              setIsInMatch(false);
              setGameState(prev => ({ ...prev, phase: 'completed', winner: data.payload.winner }));
              break;
            case 'playerAction':
              setGameState(prev => ({
                ...prev,
                actions: [...prev.actions, data.payload.action],
                players: data.payload.updatedPlayers || prev.players
              }));
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Real-time connection failed');
      };
      
      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setWs(null);
        // Auto-reconnect after 3 seconds if still connected to MagicBlock
        if (isConnected) {
          setTimeout(subscribeToUpdates, 3000);
        }
      };
      
      setWs(websocket);
    } catch (err) {
      console.error('Failed to establish WebSocket connection:', err);
      setError('Failed to establish real-time connection');
    }
  }, [isConnected, playerAddress, ws]);

  // Unsubscribe from updates
  const unsubscribeFromUpdates = useCallback(() => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  }, [ws]);

  // Join matchmaking
  const joinMatchmaking = useCallback(async () => {
    if (!magicBlockEngine || !sessionKey) {
      setError('Not connected to MagicBlock');
      return;
    }
    
    try {
      setError(null);
      
      // Create matchmaking transaction
      const transaction = new Transaction();
      // Add your game program instructions here
      
      await magicBlockEngine.sendTransaction(transaction);
      
      console.log('Joined matchmaking queue');
      subscribeToUpdates();
      
    } catch (err) {
      console.error('Failed to join matchmaking:', err);
      setError('Failed to join matchmaking');
    }
  }, [magicBlockEngine, sessionKey, subscribeToUpdates]);

  // Leave matchmaking
  const leaveMatchmaking = useCallback(async () => {
    if (!magicBlockEngine || !sessionKey) return;
    
    try {
      // Create leave matchmaking transaction
      const transaction = new Transaction();
      // Add your game program instructions here
      
      await magicBlockEngine.sendTransaction(transaction);
      
      unsubscribeFromUpdates();
      console.log('Left matchmaking queue');
      
    } catch (err) {
      console.error('Failed to leave matchmaking:', err);
      setError('Failed to leave matchmaking');
    }
  }, [magicBlockEngine, sessionKey, unsubscribeFromUpdates]);

  // Perform game action
  const performAction = useCallback(async (action: Omit<GameAction, 'id' | 'timestamp'>) => {
    if (!magicBlockEngine || !sessionKey || !isInMatch) {
      setError('Cannot perform action: not in active match');
      return;
    }
    
    // Optimistic update - immediately show the action locally
    const optimisticAction: GameAction = {
      ...action,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    };
    
    try {
      setError(null);
      
      setGameState(prev => ({
        ...prev,
        actions: [...prev.actions, optimisticAction]
      }));
      
      // Create and send transaction
      const transaction = new Transaction();
      // Add your game program instructions based on action type
      
      await magicBlockEngine.sendTransaction(transaction);
      
      console.log('Action performed:', action.type);
      
    } catch (err) {
      console.error('Failed to perform action:', err);
      setError('Failed to perform action');
      
      // Rollback optimistic update on error
      setGameState(prev => ({
        ...prev,
        actions: prev.actions.filter(a => a.id !== optimisticAction.id)
      }));
    }
  }, [magicBlockEngine, sessionKey, isInMatch]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  // Auto-reconnect on connection loss
  useEffect(() => {
    if (isConnected && !ws) {
      const reconnectTimer = setTimeout(subscribeToUpdates, 1000);
      return () => clearTimeout(reconnectTimer);
    }
  }, [isConnected, ws, subscribeToUpdates]);

  const contextValue: MagicBlockContextType = {
    // Connection state
    isConnected,
    isConnecting,
    error,
    
    // Session key management
    sessionKey,
    playerAddress,
    
    // Game state
    gameState,
    isInMatch,
    
    // Connection methods
    connect,
    disconnect,
    
    // Game methods
    joinMatchmaking,
    leaveMatchmaking,
    performAction,
    
    // Real-time updates
    subscribeToUpdates,
    unsubscribeFromUpdates
  };

  return (
    <MagicBlockContext.Provider value={contextValue}>
      {children}
    </MagicBlockContext.Provider>
  );
};

export const useMagicBlock = (): MagicBlockContextType => {
  const context = useContext(MagicBlockContext);
  if (!context) {
    throw new Error('useMagicBlock must be used within a MagicBlockProvider');
  }
  return context;
};