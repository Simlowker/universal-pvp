# SOL Duel Game Integration Tutorial

## Tutorial Overview

This comprehensive tutorial will guide you through building a complete game client that integrates with SOL Duel's API. We'll create a fully functional PvP battle interface with real-time updates, combat mechanics, and wallet integration.

**What we'll build:**
- Real-time PvP battle interface
- Wallet authentication system  
- Live combat with animations
- Chat system and player statistics
- Match history and leaderboard integration

## Prerequisites

- Node.js 16+ and npm/yarn
- React 18+ (we'll use React, but concepts apply to any framework)
- Basic understanding of TypeScript
- Solana wallet for testing

## Project Setup

### 1. Initialize Project

```bash
npx create-react-app sol-duel-client --template typescript
cd sol-duel-client

# Install required dependencies
npm install @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-wallets
npm install socket.io-client axios uuid
npm install @types/uuid

# Install UI components (optional)
npm install @headlessui/react @heroicons/react
```

### 2. Project Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── WalletConnect.tsx
│   ├── game/
│   │   ├── GameLobby.tsx
│   │   ├── BattleInterface.tsx
│   │   ├── PlayerCard.tsx
│   │   └── ActionButtons.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   └── Modal.tsx
│   └── layout/
│       └── Header.tsx
├── lib/
│   ├── api.ts
│   ├── websocket.ts
│   ├── auth.ts
│   └── types.ts
├── hooks/
│   ├── useAuth.ts
│   ├── useGame.ts
│   └── useWebSocket.ts
├── contexts/
│   ├── AuthContext.tsx
│   └── GameContext.tsx
└── styles/
    └── globals.css
```

### 3. Configure Environment

Create `.env.local`:

```bash
REACT_APP_API_URL=https://api.solduel.game
REACT_APP_WS_URL=wss://api.solduel.game
REACT_APP_SOLANA_NETWORK=mainnet-beta
REACT_APP_SOLANA_RPC=https://api.mainnet-beta.solana.com
```

## Step 1: Core API Client

### API Types Definition

```typescript
// src/lib/types.ts
export interface Player {
  id: string;
  username: string;
  walletAddress: string;
  eloRating: number;
  isVerified: boolean;
  stats: PlayerStats;
}

export interface PlayerStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  averageDamage: number;
  totalEarnings: number;
}

export interface Game {
  id: string;
  gameType: 'duel' | 'tournament' | 'practice';
  status: 'waiting' | 'active' | 'finished';
  wagerAmount: number;
  maxPlayers: number;
  currentPlayers: number;
  creator: Player;
  players: GamePlayer[];
  createdAt: string;
  startedAt?: string;
}

export interface GamePlayer {
  id: string;
  username: string;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  isAlive: boolean;
  isReady: boolean;
}

export interface CombatAction {
  type: 'attack' | 'heal' | 'special' | 'defend';
  target?: number;
  power?: number;
  manaCost?: number;
}

export interface GameState {
  gameId: string;
  status: 'waiting' | 'active' | 'finished';
  currentTurn: string;
  turnTimeRemaining: number;
  players: GamePlayer[];
  round: number;
}
```

### API Client Implementation

```typescript
// src/lib/api.ts
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Player, Game, GameState, CombatAction } from './types';

export class SolDuelAPI {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.loadStoredAuth();
  }

  private setupInterceptors() {
    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.clearAuth();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  private loadStoredAuth() {
    const token = localStorage.getItem('sol_duel_token');
    if (token) {
      this.authToken = token;
    }
  }

  private clearAuth() {
    this.authToken = null;
    localStorage.removeItem('sol_duel_token');
    localStorage.removeItem('sol_duel_user');
  }

  setAuthToken(token: string) {
    this.authToken = token;
    localStorage.setItem('sol_duel_token', token);
  }

  // Authentication methods
  async register(data: {
    username: string;
    email: string;
    password: string;
    walletAddress: string;
  }) {
    const response = await this.client.post('/api/auth/register', data);
    
    if (response.data.success) {
      this.setAuthToken(response.data.token);
      localStorage.setItem('sol_duel_user', JSON.stringify(response.data.player));
    }
    
    return response.data;
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/api/auth/login', {
      email,
      password,
    });
    
    if (response.data.success) {
      this.setAuthToken(response.data.token);
      localStorage.setItem('sol_duel_user', JSON.stringify(response.data.player));
    }
    
    return response.data;
  }

  async verifyWallet(walletAddress: string, signature: string, message: string) {
    const response = await this.client.post('/api/auth/verify-wallet', {
      walletAddress,
      signature,
      message,
    });
    
    if (response.data.success) {
      this.setAuthToken(response.data.token);
      localStorage.setItem('sol_duel_user', JSON.stringify(response.data.player));
    }
    
    return response.data;
  }

  // Game methods
  async getAvailableGames(): Promise<Game[]> {
    const response = await this.client.get('/api/games?status=waiting');
    return response.data.data.games;
  }

  async createGame(config: {
    gameType: 'duel' | 'tournament' | 'practice';
    wagerAmount: number;
    maxPlayers?: number;
    timeLimit?: number;
  }): Promise<Game> {
    const response = await this.client.post('/api/games', config);
    return response.data.data.game;
  }

  async joinGame(gameId: string, wagerAmount: number): Promise<Game> {
    const response = await this.client.post(`/api/games/${gameId}/join`, {
      wagerAmount,
    });
    return response.data.data.game;
  }

  async getGameDetails(gameId: string): Promise<Game> {
    const response = await this.client.get(`/api/games/${gameId}`);
    return response.data.data.game;
  }

  async makeMove(gameId: string, action: CombatAction): Promise<any> {
    const response = await this.client.post(`/api/games/${gameId}/move`, {
      moveType: action.type,
      data: {
        target: action.target,
        power: action.power,
        manaCost: action.manaCost,
      },
      timestamp: Date.now(),
    });
    return response.data;
  }

  async surrenderGame(gameId: string): Promise<any> {
    const response = await this.client.post(`/api/games/${gameId}/surrender`);
    return response.data;
  }

  async findQuickMatch(): Promise<Game> {
    const response = await this.client.post('/api/games/quickmatch', {
      wagerAmount: 0.1,
      gameType: 'duel',
    });
    return response.data.data.game;
  }

  // Player methods
  async getPlayerProfile(): Promise<Player> {
    const response = await this.client.get('/api/players/profile');
    return response.data.data;
  }

  async getLeaderboard(): Promise<any[]> {
    const response = await this.client.get('/api/leaderboard');
    return response.data;
  }
}

export const apiClient = new SolDuelAPI(
  process.env.REACT_APP_API_URL || 'http://localhost:5000'
);
```

## Step 2: WebSocket Integration

```typescript
// src/lib/websocket.ts
import { io, Socket } from 'socket.io-client';
import { GameState, GamePlayer } from './types';

export interface GameEvents {
  gameStateUpdate: (state: GameState) => void;
  playerJoined: (player: GamePlayer) => void;
  playerLeft: (player: GamePlayer) => void;
  matchStarted: (data: { gameId: string; players: GamePlayer[] }) => void;
  moveExecuted: (data: { 
    playerId: string; 
    action: any; 
    result: any; 
    newState: GameState;
  }) => void;
  turnChanged: (data: { 
    currentPlayer: string; 
    timeRemaining: number;
  }) => void;
  gameCompleted: (data: { 
    winner: string; 
    rewards: any; 
    eloChanges: any;
  }) => void;
  chatMessage: (data: { 
    playerId: string; 
    username: string; 
    message: string;
  }) => void;
  error: (error: { message: string }) => void;
}

export class GameWebSocket {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(token: string, baseUrl?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(baseUrl || process.env.REACT_APP_WS_URL!, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      this.socket.on('connect', () => {
        console.log('Connected to SOL Duel WebSocket');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('authenticated', (data) => {
        console.log('WebSocket authenticated:', data.username);
      });

      this.socket.on('auth_error', (error) => {
        console.error('WebSocket auth error:', error);
        reject(new Error('Authentication failed'));
      });

      this.setupReconnection();
    });
  }

  private setupReconnection() {
    if (!this.socket) return;

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.attemptReconnect();
      }
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected successfully');
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_error', () => {
      this.reconnectAttempts++;
      console.log(`Reconnection attempt ${this.reconnectAttempts} failed`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        this.socket?.connect();
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
    }
  }

  on<K extends keyof GameEvents>(event: K, handler: GameEvents[K]) {
    this.socket?.on(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler?: GameEvents[K]) {
    if (handler) {
      this.socket?.off(event, handler);
    } else {
      this.socket?.off(event);
    }
  }

  // Game actions
  joinGame(gameId: string) {
    this.socket?.emit('join_game', gameId);
  }

  leaveGame(gameId: string) {
    this.socket?.emit('leave_game', gameId);
  }

  makeMove(action: any) {
    this.socket?.emit('make_move', action);
  }

  sendChatMessage(message: string) {
    this.socket?.emit('game_chat', {
      message,
      timestamp: Date.now(),
    });
  }

  setPlayerReady(gameId: string) {
    this.socket?.emit('player_ready', gameId);
  }

  requestGameState(gameId: string) {
    this.socket?.emit('get_game_state', gameId);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const gameWebSocket = new GameWebSocket();
```

## Step 3: Authentication Context

```typescript
// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { apiClient } from '../lib/api';
import { Player } from '../lib/types';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

interface AuthContextType {
  user: Player | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    walletAddress: string;
  }) => Promise<void>;
  connectWallet: (walletKeypair: Keypair) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing authentication on mount
    const checkAuth = () => {
      const token = localStorage.getItem('sol_duel_token');
      const userData = localStorage.getItem('sol_duel_user');

      if (token && userData) {
        try {
          const parsedUser = JSON.parse(userData);
          setUser(parsedUser);
        } catch (error) {
          console.error('Failed to parse user data:', error);
          logout();
        }
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.login(email, password);
      setUser(response.player);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    walletAddress: string;
  }) => {
    setIsLoading(true);
    try {
      const response = await apiClient.register(data);
      setUser(response.player);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const connectWallet = async (walletKeypair: Keypair) => {
    setIsLoading(true);
    try {
      // Create challenge message
      const message = `Login to SOL Duel - ${Date.now()}`;
      const messageBytes = new TextEncoder().encode(message);
      
      // Sign message
      const signature = nacl.sign.detached(messageBytes, walletKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const response = await apiClient.verifyWallet(
        walletKeypair.publicKey.toString(),
        signatureBase58,
        message
      );
      
      setUser(response.player);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Wallet connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('sol_duel_token');
    localStorage.removeItem('sol_duel_user');
    apiClient.setAuthToken('');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    connectWallet,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

## Step 4: Game Interface Components

### Battle Interface Component

```typescript
// src/components/game/BattleInterface.tsx
import React, { useState, useEffect } from 'react';
import { gameWebSocket } from '../../lib/websocket';
import { apiClient } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { GameState, GamePlayer, CombatAction } from '../../lib/types';
import PlayerCard from './PlayerCard';
import ActionButtons from './ActionButtons';
import ChatPanel from './ChatPanel';

interface BattleInterfaceProps {
  gameId: string;
  onGameEnd: () => void;
}

const BattleInterface: React.FC<BattleInterfaceProps> = ({ gameId, onGameEnd }) => {
  const { user } = useAuth();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    if (!user) return;

    const initializeGame = async () => {
      try {
        // Connect to WebSocket if not already connected
        if (!gameWebSocket.isConnected) {
          const token = localStorage.getItem('sol_duel_token');
          if (token) {
            await gameWebSocket.connect(token);
          }
        }

        // Set up event listeners
        gameWebSocket.on('gameStateUpdate', handleGameStateUpdate);
        gameWebSocket.on('matchStarted', handleMatchStarted);
        gameWebSocket.on('moveExecuted', handleMoveExecuted);
        gameWebSocket.on('turnChanged', handleTurnChanged);
        gameWebSocket.on('gameCompleted', handleGameCompleted);
        gameWebSocket.on('error', handleError);

        // Join the game room
        gameWebSocket.joinGame(gameId);
        
        // Request initial game state
        gameWebSocket.requestGameState(gameId);

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize game:', error);
        setIsLoading(false);
      }
    };

    initializeGame();

    // Cleanup on unmount
    return () => {
      gameWebSocket.leaveGame(gameId);
      gameWebSocket.off('gameStateUpdate');
      gameWebSocket.off('matchStarted');
      gameWebSocket.off('moveExecuted');
      gameWebSocket.off('turnChanged');
      gameWebSocket.off('gameCompleted');
      gameWebSocket.off('error');
    };
  }, [gameId, user]);

  // Timer effect for turn countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (turnTimeRemaining > 0) {
      interval = setInterval(() => {
        setTurnTimeRemaining(prev => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [turnTimeRemaining]);

  const handleGameStateUpdate = (state: GameState) => {
    setGameState(state);
    setIsMyTurn(state.currentTurn === user?.id);
    setTurnTimeRemaining(state.turnTimeRemaining);
  };

  const handleMatchStarted = (data: { gameId: string; players: GamePlayer[] }) => {
    console.log('Match started with players:', data.players);
  };

  const handleMoveExecuted = (data: { 
    playerId: string; 
    action: any; 
    result: any; 
    newState: GameState;
  }) => {
    setGameState(data.newState);
    setActionInProgress(false);
    
    // Show move animation or feedback
    console.log(`${data.playerId} executed ${data.action.type}:`, data.result);
  };

  const handleTurnChanged = (data: { 
    currentPlayer: string; 
    timeRemaining: number;
  }) => {
    setIsMyTurn(data.currentPlayer === user?.id);
    setTurnTimeRemaining(data.timeRemaining);
  };

  const handleGameCompleted = (data: { 
    winner: string; 
    rewards: any; 
    eloChanges: any;
  }) => {
    const isWinner = data.winner === user?.id;
    const eloChange = data.eloChanges[user?.id || ''];
    
    alert(`Game Over! ${isWinner ? 'You Won!' : 'You Lost'} ELO Change: ${eloChange > 0 ? '+' : ''}${eloChange}`);
    
    setTimeout(() => {
      onGameEnd();
    }, 2000);
  };

  const handleError = (error: { message: string }) => {
    console.error('Game error:', error.message);
    setActionInProgress(false);
  };

  const executeAction = async (action: CombatAction) => {
    if (!isMyTurn || actionInProgress) return;

    setActionInProgress(true);

    try {
      // Send action via WebSocket for real-time response
      gameWebSocket.makeMove({
        moveType: action.type,
        moveData: {
          target: action.target,
          power: action.power,
          manaCost: action.manaCost,
        },
        timestamp: Date.now(),
      });

      // Also send via REST API as backup
      await apiClient.makeMove(gameId, action);
    } catch (error) {
      console.error('Failed to execute action:', error);
      setActionInProgress(false);
    }
  };

  const handleSurrender = async () => {
    if (window.confirm('Are you sure you want to surrender?')) {
      try {
        await apiClient.surrenderGame(gameId);
      } catch (error) {
        console.error('Failed to surrender:', error);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500">Failed to load game state</p>
        <button 
          onClick={() => gameWebSocket.requestGameState(gameId)}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.id === user?.id);
  const opponents = gameState.players.filter(p => p.id !== user?.id);

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Game Header */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">SOL Duel Battle</h1>
          <div className="text-right">
            <p className="text-white">Round: {gameState.round}</p>
            <p className={`text-lg font-bold ${isMyTurn ? 'text-green-400' : 'text-yellow-400'}`}>
              {isMyTurn ? 'Your Turn!' : 'Opponent\'s Turn'}
            </p>
            {turnTimeRemaining > 0 && (
              <p className={`text-sm ${turnTimeRemaining <= 10 ? 'text-red-400' : 'text-gray-400'}`}>
                Time: {turnTimeRemaining}s
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Opponents */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Opponents</h2>
          {opponents.map((opponent, index) => (
            <PlayerCard 
              key={opponent.id}
              player={opponent}
              isCurrentTurn={gameState.currentTurn === opponent.id}
              canTarget={isMyTurn}
              onTarget={() => executeAction({ 
                type: 'attack', 
                target: index, 
                power: 50 
              })}
            />
          ))}
        </div>

        {/* Current Player */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">You</h2>
          {currentPlayer && (
            <PlayerCard 
              player={currentPlayer}
              isCurrentTurn={isMyTurn}
              canTarget={false}
            />
          )}

          {/* Action Buttons */}
          <ActionButtons
            canAct={isMyTurn && !actionInProgress}
            currentPlayer={currentPlayer}
            onAction={executeAction}
            onSurrender={handleSurrender}
            actionInProgress={actionInProgress}
          />
        </div>

        {/* Chat Panel */}
        <div>
          <ChatPanel gameId={gameId} />
        </div>
      </div>
    </div>
  );
};

export default BattleInterface;
```

### Player Card Component

```typescript
// src/components/game/PlayerCard.tsx
import React from 'react';
import { GamePlayer } from '../../lib/types';

interface PlayerCardProps {
  player: GamePlayer;
  isCurrentTurn: boolean;
  canTarget: boolean;
  onTarget?: () => void;
}

const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isCurrentTurn,
  canTarget,
  onTarget,
}) => {
  const healthPercentage = (player.health / player.maxHealth) * 100;
  const manaPercentage = (player.mana / player.maxMana) * 100;

  return (
    <div 
      className={`
        bg-white rounded-lg shadow-md p-4 border-2 transition-all duration-200
        ${isCurrentTurn ? 'border-green-400 shadow-green-200' : 'border-gray-200'}
        ${canTarget ? 'hover:border-red-400 hover:shadow-red-200 cursor-pointer' : ''}
        ${!player.isAlive ? 'opacity-50 grayscale' : ''}
      `}
      onClick={canTarget && player.isAlive ? onTarget : undefined}
    >
      {/* Player Info */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          {player.username}
        </h3>
        <div className="flex space-x-2">
          {isCurrentTurn && (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              Active
            </span>
          )}
          {!player.isAlive && (
            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
              Defeated
            </span>
          )}
          {canTarget && player.isAlive && (
            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
              Target
            </span>
          )}
        </div>
      </div>

      {/* Health Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Health</span>
          <span>{player.health}/{player.maxHealth}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className={`h-3 rounded-full transition-all duration-300 ${
              healthPercentage > 60 ? 'bg-green-500' :
              healthPercentage > 30 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${healthPercentage}%` }}
          />
        </div>
      </div>

      {/* Mana Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Mana</span>
          <span>{player.mana}/{player.maxMana}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${manaPercentage}%` }}
          />
        </div>
      </div>

      {/* Status Indicators */}
      <div className="flex justify-between items-center text-sm text-gray-500">
        <span className={player.isReady ? 'text-green-600' : 'text-yellow-600'}>
          {player.isReady ? '✓ Ready' : '⏳ Not Ready'}
        </span>
        {canTarget && player.isAlive && (
          <span className="text-red-600 font-medium">
            Click to Attack
          </span>
        )}
      </div>
    </div>
  );
};

export default PlayerCard;
```

### Action Buttons Component

```typescript
// src/components/game/ActionButtons.tsx
import React, { useState } from 'react';
import { GamePlayer, CombatAction } from '../../lib/types';

interface ActionButtonsProps {
  canAct: boolean;
  currentPlayer: GamePlayer | undefined;
  onAction: (action: CombatAction) => void;
  onSurrender: () => void;
  actionInProgress: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
  canAct,
  currentPlayer,
  onAction,
  onSurrender,
  actionInProgress,
}) => {
  const [selectedAction, setSelectedAction] = useState<string>('attack');

  if (!currentPlayer) return null;

  const canHeal = currentPlayer.health < currentPlayer.maxHealth;
  const canUseSpecial = currentPlayer.mana >= 30;
  const hasEnoughManaForHeal = currentPlayer.mana >= 20;

  const handleAction = (actionType: string) => {
    let action: CombatAction;

    switch (actionType) {
      case 'attack':
        action = { type: 'attack', power: 50 };
        break;
      case 'heal':
        action = { type: 'heal', power: 30, manaCost: 20 };
        break;
      case 'special':
        action = { type: 'special', power: 80, manaCost: 30 };
        break;
      case 'defend':
        action = { type: 'defend', power: 25 };
        break;
      default:
        return;
    }

    onAction(action);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Actions</h3>
      
      {/* Action Selection */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => handleAction('attack')}
          disabled={!canAct || actionInProgress}
          className={`
            p-3 rounded-lg font-medium transition-all duration-200
            ${canAct && !actionInProgress
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {actionInProgress ? (
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mx-auto" />
          ) : (
            <>
              ⚔️ Attack
              <div className="text-xs opacity-75">50 damage</div>
            </>
          )}
        </button>

        <button
          onClick={() => handleAction('heal')}
          disabled={!canAct || !canHeal || !hasEnoughManaForHeal || actionInProgress}
          className={`
            p-3 rounded-lg font-medium transition-all duration-200
            ${canAct && canHeal && hasEnoughManaForHeal && !actionInProgress
              ? 'bg-green-500 hover:bg-green-600 text-white shadow-md hover:shadow-lg' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          💚 Heal
          <div className="text-xs opacity-75">+30 HP, -20 MP</div>
        </button>

        <button
          onClick={() => handleAction('special')}
          disabled={!canAct || !canUseSpecial || actionInProgress}
          className={`
            p-3 rounded-lg font-medium transition-all duration-200
            ${canAct && canUseSpecial && !actionInProgress
              ? 'bg-purple-500 hover:bg-purple-600 text-white shadow-md hover:shadow-lg' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          ✨ Special
          <div className="text-xs opacity-75">80 damage, -30 MP</div>
        </button>

        <button
          onClick={() => handleAction('defend')}
          disabled={!canAct || actionInProgress}
          className={`
            p-3 rounded-lg font-medium transition-all duration-200
            ${canAct && !actionInProgress
              ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          🛡️ Defend
          <div className="text-xs opacity-75">+25 defense</div>
        </button>
      </div>

      {/* Turn Status */}
      <div className="text-center mb-4">
        {canAct ? (
          <p className="text-green-600 font-medium">🎯 Your turn - choose an action!</p>
        ) : (
          <p className="text-yellow-600">⏳ Waiting for your turn...</p>
        )}
      </div>

      {/* Surrender Button */}
      <button
        onClick={onSurrender}
        className="w-full py-2 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors duration-200"
      >
        🏳️ Surrender
      </button>

      {/* Mana Warning */}
      {currentPlayer.mana < 20 && (
        <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 text-sm rounded">
          ⚠️ Low mana! Some actions may be unavailable.
        </div>
      )}
    </div>
  );
};

export default ActionButtons;
```

## Step 5: Main Application Integration

```typescript
// src/App.tsx
import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginForm from './components/auth/LoginForm';
import GameLobby from './components/game/GameLobby';
import BattleInterface from './components/game/BattleInterface';
import './styles/globals.css';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  if (currentGameId) {
    return (
      <BattleInterface 
        gameId={currentGameId} 
        onGameEnd={() => setCurrentGameId(null)} 
      />
    );
  }

  return <GameLobby onJoinGame={setCurrentGameId} />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="App">
        <AppContent />
      </div>
    </AuthProvider>
  );
};

export default App;
```

## Testing Your Integration

### 1. Unit Tests

```typescript
// src/__tests__/gameWebSocket.test.ts
import { GameWebSocket } from '../lib/websocket';

describe('GameWebSocket', () => {
  let websocket: GameWebSocket;
  
  beforeEach(() => {
    websocket = new GameWebSocket();
  });

  afterEach(() => {
    websocket.disconnect();
  });

  test('should connect successfully with valid token', async () => {
    const mockToken = 'valid_token_here';
    
    // Mock socket.io
    jest.mock('socket.io-client');
    
    await expect(websocket.connect(mockToken)).resolves.not.toThrow();
  });

  test('should handle move execution', () => {
    const mockHandler = jest.fn();
    websocket.on('moveExecuted', mockHandler);
    
    // Simulate move execution event
    // This would be handled by the actual socket connection
    expect(mockHandler).toBeDefined();
  });
});
```

### 2. Integration Testing

Create a test script to verify the complete flow:

```bash
#!/bin/bash
echo "Starting SOL Duel Integration Tests..."

# Start the development server
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 5

# Run Cypress or Playwright tests
npx cypress run

# Cleanup
kill $SERVER_PID

echo "Integration tests completed!"
```

## Deployment and Production Considerations

### 1. Environment Configuration

```typescript
// src/config/environment.ts
export const config = {
  apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  wsUrl: process.env.REACT_APP_WS_URL || 'ws://localhost:5000',
  solanaNetwork: process.env.REACT_APP_SOLANA_NETWORK || 'devnet',
  solanaRpc: process.env.REACT_APP_SOLANA_RPC || 'https://api.devnet.solana.com',
  isDevelopment: process.env.NODE_ENV === 'development',
  enableLogging: process.env.REACT_APP_ENABLE_LOGGING === 'true',
};
```

### 2. Performance Optimization

```typescript
// src/hooks/useOptimizedWebSocket.ts
import { useCallback, useRef, useMemo } from 'react';
import { gameWebSocket } from '../lib/websocket';

export const useOptimizedWebSocket = () => {
  const eventHandlersRef = useRef(new Map());

  const optimizedOn = useCallback((event: string, handler: Function) => {
    // Debounce rapid events
    const debouncedHandler = debounce(handler, 100);
    eventHandlersRef.current.set(event, debouncedHandler);
    gameWebSocket.on(event as any, debouncedHandler);
  }, []);

  return useMemo(() => ({
    on: optimizedOn,
    emit: gameWebSocket.makeMove.bind(gameWebSocket),
    isConnected: gameWebSocket.isConnected,
  }), [optimizedOn]);
};

function debounce(func: Function, delay: number) {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}
```

### 3. Error Boundaries

```typescript
// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    
    // Report to error tracking service
    // reportError(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              Something went wrong!
            </h2>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

This comprehensive tutorial provides a complete foundation for building sophisticated game clients that integrate with SOL Duel's API. The modular architecture allows for easy customization and extension based on specific requirements.