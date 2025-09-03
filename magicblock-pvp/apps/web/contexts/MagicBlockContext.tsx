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
}) => {
  const { publicKey, signTransaction, connected } = useWallet();
  
  // Connection states
  const [ephemeralConnection, setEphemeralConnection] = useState<Connection | null>(null);
  const [mainnetConnection, setMainnetConnection] = useState<Connection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isEphemeralActive, setIsEphemeralActive] = useState(false);
  
  // Session management
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  
  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  
  // Transaction state
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  
  // WebSocket
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);
  
  // Performance metrics
  const [latency, setLatency] = useState(0);
  const [lastActionTime, setLastActionTime] = useState(0);

  // Initialize connections
  useEffect(() => {
    const initializeConnections = async () => {
      try {
        // Initialize mainnet connection
        const mainnet = new Connection(
          process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
          {
            commitment: 'confirmed',
            wsEndpoint: process.env.NEXT_PUBLIC_WS_URL,
          }
        );
        setMainnetConnection(mainnet);

        // Try to initialize ephemeral rollups
        try {
          const ephemeral = new Connection(
            process.env.NEXT_PUBLIC_EPHEMERAL_RPC_URL || 'https://devnet.ephemeral-rollups.magicblock.app',
            { commitment: 'confirmed' }
          );
          
          // Test ephemeral connection
          const startTime = Date.now();
          await ephemeral.getLatestBlockhash();
          const ephemeralLatency = Date.now() - startTime;
          
          // Test mainnet connection
          const mainnetStart = Date.now();
          await mainnet.getLatestBlockhash();
          const mainnetLatency = Date.now() - mainnetStart;
          
          // Use ephemeral if it's faster and available
          if (ephemeralLatency < mainnetLatency && ephemeralLatency < 100) {
            setEphemeralConnection(ephemeral);
            setIsEphemeralActive(true);
            setLatency(ephemeralLatency);
            console.log('🚀 Connected to Ephemeral Rollups (faster)');
          } else {
            setLatency(mainnetLatency);
            console.log('📡 Using mainnet connection');
          }
        } catch (error) {
          console.log('⚠️ Ephemeral rollups unavailable, using mainnet');
          setLatency(Date.now() - Date.now()); // Will be set by mainnet test
        }

        setIsConnected(true);
      } catch (error) {
        console.error('Failed to initialize connections:', error);
      }
    };

    initializeConnections();
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isConnected) return;

    const connectWebSocket = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_GAME_URL || 'ws://localhost:8080/game';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('🔗 WebSocket connected');
        setIsRealTimeConnected(true);
        setWsConnection(ws);
        
        // Send initial connection message
        if (publicKey) {
          ws.send(JSON.stringify({
            type: 'connect',
            playerKey: publicKey.toString(),
            sessionKey: sessionKey?.publicKey.toString(),
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'gameStateUpdate':
              setGameState(prevState => ({
                ...prevState,
                ...message.data,
                lastUpdate: Date.now(),
              }));
              break;
              
            case 'actionConfirmed':
              setIsTransactionPending(false);
              setLastActionTime(Date.now());
              break;
              
            case 'latencyTest':
              const latency = Date.now() - message.timestamp;
              setLatency(latency);
              break;
              
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsRealTimeConnected(false);
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsRealTimeConnected(false);
        setWsConnection(null);
        
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
    };
  }, [isConnected, publicKey, sessionKey]);

  // Create session key for gasless transactions
  const createSessionKey = useCallback(async (): Promise<SessionKey> => {
    if (!publicKey || !signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      const keypair = Keypair.generate();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      // Create session key delegation transaction
      const connection = ephemeralConnection || mainnetConnection;
      if (!connection) throw new Error('No connection available');

      const { blockhash } = await connection.getLatestBlockhash();
      
      // In a real implementation, this would create a proper delegation instruction
      const transaction = new Transaction({
        feePayer: publicKey,
        recentBlockhash: blockhash,
      });

      // Add session key delegation instruction (mock for now)
      // transaction.add(createSessionKeyInstruction(publicKey, keypair.publicKey, expiresAt));

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      await connection.confirmTransaction(signature);

      const newSessionKey = {
        publicKey: keypair.publicKey,
        keypair,
        expiresAt,
      };

      setSessionKey(newSessionKey);
      
      // Store in localStorage for persistence
      localStorage.setItem('magicblock_session_key', JSON.stringify({
        publicKey: keypair.publicKey.toString(),
        secretKey: Array.from(keypair.secretKey),
        expiresAt,
      }));

      console.log('✅ Session key created successfully');
      return newSessionKey;
      
    } catch (error) {
      console.error('Failed to create session key:', error);
      throw error;
    }
  }, [publicKey, signTransaction, ephemeralConnection, mainnetConnection]);

  // Load session key from storage on mount
  useEffect(() => {
    const storedSessionKey = localStorage.getItem('magicblock_session_key');
    if (storedSessionKey) {
      try {
        const parsed = JSON.parse(storedSessionKey);
        if (parsed.expiresAt > Date.now()) {
          const keypair = Keypair.fromSecretKey(new Uint8Array(parsed.secretKey));
          setSessionKey({
            publicKey: new PublicKey(parsed.publicKey),
            keypair,
            expiresAt: parsed.expiresAt,
          });
        } else {
          localStorage.removeItem('magicblock_session_key');
        }
      } catch (error) {
        console.error('Failed to load session key:', error);
        localStorage.removeItem('magicblock_session_key');
      }
    }
  }, []);

  // Revoke session key
  const revokeSessionKey = useCallback(() => {
    setSessionKey(null);
    localStorage.removeItem('magicblock_session_key');
    console.log('🔑 Session key revoked');
  }, []);

  // Execute game action with optimistic updates
  const executeAction = useCallback(async (action: string, params: any): Promise<string> => {
    if (!sessionKey) {
      throw new Error('No session key available');
    }

    const startTime = Date.now();
    setIsTransactionPending(true);

    try {
      const connection = ephemeralConnection || mainnetConnection;
      if (!connection) throw new Error('No connection available');

      // Send optimistic update via WebSocket
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'optimisticAction',
          action,
          params,
          timestamp: startTime,
          sessionKey: sessionKey.publicKey.toString(),
        }));
      }

      // Create and send transaction using session key
      const { blockhash } = await connection.getLatestBlockhash();
      const transaction = new Transaction({
        feePayer: sessionKey.publicKey,
        recentBlockhash: blockhash,
      });

      // Add game action instruction (mock for now)
      // transaction.add(createGameActionInstruction(action, params));

      // Sign with session key (gasless for user)
      transaction.sign(sessionKey.keypair);
      
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true, // For speed
        maxRetries: 3,
      });

      // Don't wait for confirmation to maintain responsiveness
      connection.confirmTransaction(signature).then(() => {
        setIsTransactionPending(false);
        setLastActionTime(Date.now());
        
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({
            type: 'actionConfirmed',
            signature,
            action,
            timestamp: Date.now(),
          }));
        }
      });

      console.log(`⚡ Action ${action} executed in ${Date.now() - startTime}ms`);
      return signature;

    } catch (error) {
      setIsTransactionPending(false);
      console.error('Failed to execute action:', error);
      throw error;
    }
  }, [sessionKey, ephemeralConnection, mainnetConnection, wsConnection]);

  // Update game state
  const updateGameState = useCallback((newState: Partial<GameState>) => {
    setGameState(prevState => ({
      gameId: prevState?.gameId || '',
      players: prevState?.players || [],
      currentTurn: prevState?.currentTurn || 0,
      gameData: prevState?.gameData || {},
      lastUpdate: Date.now(),
      ...prevState,
      ...newState,
    }));
  }, []);

  // Periodic latency testing
  useEffect(() => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) return;

    const latencyTest = setInterval(() => {
      wsConnection.send(JSON.stringify({
        type: 'latencyTest',
        timestamp: Date.now(),
      }));
    }, 5000);

    return () => clearInterval(latencyTest);
  }, [wsConnection]);

  const value: MagicBlockContextType = {
    ephemeralConnection,
    mainnetConnection,
    isConnected,
    isEphemeralActive,
    sessionKey,
    createSessionKey,
    revokeSessionKey,
    gameState,
    updateGameState,
    executeAction,
    isTransactionPending,
    wsConnection,
    isRealTimeConnected,
    latency,
    lastActionTime,
  };

  return (
    <MagicBlockContext.Provider value={value}>
      {children}
    </MagicBlockContext.Provider>
  );
};

export const useMagicBlock = () => {
  const context = useContext(MagicBlockContext);
  if (!context) {
    throw new Error('useMagicBlock must be used within MagicBlockProvider');
  }
  return context;
};