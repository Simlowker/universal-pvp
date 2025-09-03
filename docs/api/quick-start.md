# SOL Duel Developer Quick Start Guide

## Overview

This guide will help you quickly integrate with the SOL Duel platform and start building applications that interact with our gaming ecosystem.

## Prerequisites

- Node.js 16+ installed
- Basic knowledge of JavaScript/TypeScript
- Solana wallet (for testing)
- Understanding of REST APIs and WebSockets

## 1. Environment Setup

### Install Dependencies

```bash
# Core dependencies
npm install @solana/web3.js @solana/wallet-adapter-base
npm install socket.io-client axios
npm install @coral-xyz/anchor

# Development dependencies  
npm install --save-dev typescript @types/node
```

### Environment Configuration

Create a `.env` file:

```bash
# API Configuration
API_BASE_URL=https://api.solduel.game
WS_BASE_URL=wss://api.solduel.game

# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta

# Your Application
APP_NAME=MyGameApp
APP_VERSION=1.0.0
```

## 2. Basic API Client Setup

### Create API Client

```typescript
// src/lib/apiClient.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

class SolDuelAPIClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor(baseURL: string = 'https://api.solduel.game') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.authToken = null;
          // Handle token refresh or redirect to login
        }
        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  async get(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get(url, config);
    return response.data;
  }

  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.post(url, data, config);
    return response.data;
  }

  async put(url: string, data?: any, config?: AxiosRequestConfig) {
    const response = await this.client.put(url, data, config);
    return response.data;
  }
}

export const apiClient = new SolDuelAPIClient();
```

### Authentication Service

```typescript
// src/lib/auth.ts
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { apiClient } from './apiClient';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export class AuthService {
  private connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl);
  }

  async registerPlayer(
    username: string,
    email: string,
    password: string,
    walletAddress: string
  ) {
    try {
      const response = await apiClient.post('/api/auth/register', {
        username,
        email,
        password,
        walletAddress,
      });

      if (response.success) {
        apiClient.setAuthToken(response.token);
        localStorage.setItem('sol_duel_token', response.token);
        localStorage.setItem('sol_duel_user', JSON.stringify(response.player));
      }

      return response;
    } catch (error) {
      throw new Error(`Registration failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async loginWithPassword(email: string, password: string) {
    try {
      const response = await apiClient.post('/api/auth/login', {
        email,
        password,
      });

      if (response.success) {
        apiClient.setAuthToken(response.token);
        localStorage.setItem('sol_duel_token', response.token);
        localStorage.setItem('sol_duel_user', JSON.stringify(response.player));
      }

      return response;
    } catch (error) {
      throw new Error(`Login failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async verifyWallet(walletKeypair: Keypair) {
    try {
      const message = `Login to SOL Duel - Timestamp: ${Date.now()}`;
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, walletKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const response = await apiClient.post('/api/auth/verify-wallet', {
        walletAddress: walletKeypair.publicKey.toString(),
        signature: signatureBase58,
        message,
      });

      if (response.success) {
        apiClient.setAuthToken(response.token);
        localStorage.setItem('sol_duel_token', response.token);
        localStorage.setItem('sol_duel_user', JSON.stringify(response.player));
      }

      return response;
    } catch (error) {
      throw new Error(`Wallet verification failed: ${error.response?.data?.message || error.message}`);
    }
  }

  loadStoredAuth(): boolean {
    const token = localStorage.getItem('sol_duel_token');
    const user = localStorage.getItem('sol_duel_user');

    if (token && user) {
      apiClient.setAuthToken(token);
      return true;
    }

    return false;
  }

  logout() {
    apiClient.setAuthToken('');
    localStorage.removeItem('sol_duel_token');
    localStorage.removeItem('sol_duel_user');
  }

  getCurrentUser() {
    const userStr = localStorage.getItem('sol_duel_user');
    return userStr ? JSON.parse(userStr) : null;
  }
}

export const authService = new AuthService(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
);
```

## 3. Game Management

### Game Service

```typescript
// src/lib/gameService.ts
import { apiClient } from './apiClient';

export interface CreateGameRequest {
  gameType: 'duel' | 'tournament' | 'practice';
  wagerAmount: number;
  isPrivate?: boolean;
  maxPlayers?: number;
  timeLimit?: number;
  settings?: Record<string, any>;
}

export interface GameMove {
  moveType: string;
  data: Record<string, any>;
  timestamp: number;
}

export class GameService {
  async getAvailableGames(filters?: {
    status?: string;
    gameType?: string;
    minWager?: number;
    maxWager?: number;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString());
        }
      });
    }

    return await apiClient.get(`/api/games?${params.toString()}`);
  }

  async createGame(gameConfig: CreateGameRequest) {
    return await apiClient.post('/api/games', gameConfig);
  }

  async joinGame(gameId: string, wagerAmount: number) {
    return await apiClient.post(`/api/games/${gameId}/join`, {
      wagerAmount,
    });
  }

  async getGameDetails(gameId: string) {
    return await apiClient.get(`/api/games/${gameId}`);
  }

  async makeMove(gameId: string, move: GameMove) {
    return await apiClient.post(`/api/games/${gameId}/move`, move);
  }

  async surrenderGame(gameId: string) {
    return await apiClient.post(`/api/games/${gameId}/surrender`);
  }

  async findQuickMatch(wagerAmount: number = 0.1, gameType: string = 'duel') {
    return await apiClient.post('/api/games/quickmatch', {
      wagerAmount,
      gameType,
    });
  }

  async getPlayerHistory(page: number = 1, limit: number = 20) {
    return await apiClient.get(`/api/games/player/history?page=${page}&limit=${limit}`);
  }
}

export const gameService = new GameService();
```

## 4. WebSocket Integration

### WebSocket Client

```typescript
// src/lib/websocketClient.ts
import { io, Socket } from 'socket.io-client';

export interface GameEventHandlers {
  onGameStateUpdate?: (data: any) => void;
  onPlayerJoined?: (data: any) => void;
  onPlayerLeft?: (data: any) => void;
  onMatchStarted?: (data: any) => void;
  onMoveExecuted?: (data: any) => void;
  onTurnChanged?: (data: any) => void;
  onGameCompleted?: (data: any) => void;
  onChatMessage?: (data: any) => void;
  onError?: (error: any) => void;
}

export class WebSocketClient {
  private socket: Socket | null = null;
  private handlers: GameEventHandlers = {};

  connect(token: string, baseUrl: string = 'wss://api.solduel.game') {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    this.setupEventListeners();
    return this.socket;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to SOL Duel WebSocket');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from SOL Duel WebSocket:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.handlers.onError?.(error);
    });

    // Authentication events
    this.socket.on('authenticated', (data) => {
      console.log('WebSocket authenticated:', data.username);
    });

    this.socket.on('auth_error', (error) => {
      console.error('WebSocket auth error:', error);
      this.handlers.onError?.(error);
    });

    // Game events
    this.socket.on('game_state', (data) => {
      this.handlers.onGameStateUpdate?.(data);
    });

    this.socket.on('player_joined', (data) => {
      this.handlers.onPlayerJoined?.(data);
    });

    this.socket.on('player_left', (data) => {
      this.handlers.onPlayerLeft?.(data);
    });

    this.socket.on('match_started', (data) => {
      this.handlers.onMatchStarted?.(data);
    });

    this.socket.on('move_made', (data) => {
      this.handlers.onMoveExecuted?.(data);
    });

    this.socket.on('turn_changed', (data) => {
      this.handlers.onTurnChanged?.(data);
    });

    this.socket.on('game_completed', (data) => {
      this.handlers.onGameCompleted?.(data);
    });

    this.socket.on('game_chat_message', (data) => {
      this.handlers.onChatMessage?.(data);
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.handlers.onError?.(error);
    });
  }

  setEventHandlers(handlers: GameEventHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  joinGame(gameId: string) {
    this.socket?.emit('join_game', gameId);
  }

  leaveGame(gameId: string) {
    this.socket?.emit('leave_game', gameId);
  }

  makeMove(moveData: any) {
    this.socket?.emit('make_move', moveData);
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
}

export const wsClient = new WebSocketClient();
```

## 5. Complete Integration Example

### React Component Example

```typescript
// src/components/GameInterface.tsx
import React, { useState, useEffect } from 'react';
import { gameService } from '../lib/gameService';
import { wsClient } from '../lib/websocketClient';
import { authService } from '../lib/auth';

interface GameInterfaceProps {
  gameId?: string;
}

export const GameInterface: React.FC<GameInterfaceProps> = ({ gameId }) => {
  const [gameState, setGameState] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (!gameId) return;

    // Load stored auth
    const isAuthenticated = authService.loadStoredAuth();
    if (!isAuthenticated) {
      console.error('Not authenticated');
      return;
    }

    // Connect to WebSocket
    const token = localStorage.getItem('sol_duel_token');
    if (token) {
      wsClient.connect(token);
      
      // Set up event handlers
      wsClient.setEventHandlers({
        onGameStateUpdate: (data) => {
          setGameState(data.game);
          setIsConnected(true);
        },
        
        onMatchStarted: (data) => {
          console.log('Match started!', data);
        },
        
        onTurnChanged: (data) => {
          const currentUser = authService.getCurrentUser();
          setIsMyTurn(data.currentPlayer === currentUser.id);
        },
        
        onMoveExecuted: (data) => {
          console.log('Move executed:', data);
          // Update local game state
        },
        
        onGameCompleted: (data) => {
          console.log('Game completed:', data);
          alert(`Game finished! Winner: ${data.winner}`);
        },
        
        onChatMessage: (data) => {
          setChatMessages(prev => [...prev, data]);
        },
        
        onError: (error) => {
          console.error('Game error:', error);
        },
      });

      // Join the game room
      wsClient.joinGame(gameId);
    }

    return () => {
      wsClient.leaveGame(gameId);
      wsClient.disconnect();
    };
  }, [gameId]);

  const handleAttack = async () => {
    if (!isMyTurn || !gameId) return;

    const moveData = {
      moveType: 'attack',
      moveData: {
        target: 0, // Target first opponent
        power: 50,
        weaponType: 'sword',
      },
      timestamp: Date.now(),
    };

    try {
      // Send via WebSocket for real-time response
      wsClient.makeMove(moveData);
      
      // Also send via REST API as backup/validation
      await gameService.makeMove(gameId, moveData);
    } catch (error) {
      console.error('Failed to make move:', error);
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    
    wsClient.sendChatMessage(chatInput);
    setChatInput('');
  };

  if (!isConnected) {
    return <div>Connecting to game...</div>;
  }

  return (
    <div className="game-interface">
      <h2>SOL Duel Game</h2>
      
      {/* Game State Display */}
      <div className="game-state">
        <h3>Game Status: {gameState?.status}</h3>
        <p>Current Turn: {isMyTurn ? 'Your Turn!' : 'Waiting...'}</p>
        
        {/* Player Health Bars */}
        <div className="players">
          {gameState?.players?.map((player: any, index: number) => (
            <div key={player.id} className="player">
              <h4>{player.username}</h4>
              <div className="health-bar">
                <div 
                  className="health-fill"
                  style={{
                    width: `${(player.health / player.maxHealth) * 100}%`
                  }}
                />
                <span>{player.health}/{player.maxHealth}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Game Actions */}
      <div className="game-actions">
        <button 
          onClick={handleAttack}
          disabled={!isMyTurn}
          className="action-button attack"
        >
          Attack
        </button>
        
        <button 
          onClick={() => wsClient.setPlayerReady(gameId!)}
          className="action-button ready"
        >
          Ready
        </button>
      </div>

      {/* Chat */}
      <div className="chat">
        <h4>Chat</h4>
        <div className="chat-messages">
          {chatMessages.map((msg, index) => (
            <div key={index} className="chat-message">
              <strong>{msg.username}:</strong> {msg.message}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
            placeholder="Type a message..."
          />
          <button onClick={handleSendChat}>Send</button>
        </div>
      </div>
    </div>
  );
};
```

### Main App Setup

```typescript
// src/App.tsx
import React, { useState, useEffect } from 'react';
import { authService } from './lib/auth';
import { gameService } from './lib/gameService';
import { GameInterface } from './components/GameInterface';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentGame, setCurrentGame] = useState<string | null>(null);
  const [availableGames, setAvailableGames] = useState([]);

  useEffect(() => {
    // Check for stored authentication
    const hasAuth = authService.loadStoredAuth();
    setIsAuthenticated(hasAuth);

    if (hasAuth) {
      loadAvailableGames();
    }
  }, []);

  const loadAvailableGames = async () => {
    try {
      const response = await gameService.getAvailableGames({
        status: 'waiting',
        limit: 10,
      });
      setAvailableGames(response.data.games);
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  };

  const handleQuickMatch = async () => {
    try {
      const response = await gameService.findQuickMatch(0.1, 'duel');
      setCurrentGame(response.data.game.id);
    } catch (error) {
      console.error('Quick match failed:', error);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      await authService.loginWithPassword(email, password);
      setIsAuthenticated(true);
      loadAvailableGames();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <h1>SOL Duel</h1>
        <p>Please login to continue</p>
        <button onClick={() => handleLogin('demo@example.com', 'password')}>
          Demo Login
        </button>
      </div>
    );
  }

  if (currentGame) {
    return <GameInterface gameId={currentGame} />;
  }

  return (
    <div className="game-lobby">
      <h1>SOL Duel Lobby</h1>
      
      <div className="quick-actions">
        <button onClick={handleQuickMatch} className="quick-match-btn">
          Quick Match
        </button>
      </div>

      <div className="available-games">
        <h2>Available Games</h2>
        {availableGames.map((game: any) => (
          <div key={game.id} className="game-card">
            <h3>{game.gameType}</h3>
            <p>Wager: {game.wagerAmount} SOL</p>
            <p>Players: {game.currentPlayers}/{game.maxPlayers}</p>
            <button onClick={() => setCurrentGame(game.id)}>
              Join Game
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
```

## 6. Testing Your Integration

### Unit Tests

```typescript
// src/__tests__/gameService.test.ts
import { gameService } from '../lib/gameService';
import { authService } from '../lib/auth';

describe('GameService', () => {
  beforeAll(async () => {
    // Setup test authentication
    await authService.loginWithPassword(
      'test@example.com',
      'testpassword'
    );
  });

  test('should fetch available games', async () => {
    const response = await gameService.getAvailableGames({
      status: 'waiting',
      limit: 5,
    });
    
    expect(response.success).toBe(true);
    expect(Array.isArray(response.data.games)).toBe(true);
  });

  test('should create a new game', async () => {
    const gameConfig = {
      gameType: 'duel' as const,
      wagerAmount: 0.1,
      maxPlayers: 2,
      timeLimit: 300,
    };

    const response = await gameService.createGame(gameConfig);
    
    expect(response.success).toBe(true);
    expect(response.data.game.id).toBeDefined();
  });
});
```

### Integration Testing

```bash
# Create test script
echo "#!/bin/bash
echo 'Testing SOL Duel Integration...'

# Test API endpoints
curl -X GET 'https://api.solduel.game/health'
curl -X GET 'https://api.solduel.game/api/docs'

echo 'Integration tests completed!'
" > test-integration.sh

chmod +x test-integration.sh
./test-integration.sh
```

## 7. Production Deployment

### Build Configuration

```json
{
  "scripts": {
    "build": "tsc && webpack --mode=production",
    "start": "node dist/index.js",
    "test": "jest",
    "lint": "eslint src/**/*.ts"
  }
}
```

### Environment Variables

```bash
# Production .env
API_BASE_URL=https://api.solduel.game
WS_BASE_URL=wss://api.solduel.game
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_NETWORK=mainnet-beta
NODE_ENV=production
```

## Next Steps

1. **Explore Advanced Features**: Tournament management, NFT integration, leaderboards
2. **Implement Error Handling**: Comprehensive error handling and retry logic
3. **Add Monitoring**: Application performance monitoring and logging
4. **Security Review**: Security best practices and audit considerations
5. **Scaling Considerations**: Load balancing and performance optimization

## Support and Resources

- **API Documentation**: `/docs/api/openapi.yaml`
- **WebSocket Events**: `/docs/api/websocket-events.md`
- **Solana Program**: `/docs/api/solana-program.md`
- **Community Discord**: [discord.gg/solduel](https://discord.gg/solduel)
- **GitHub Issues**: [github.com/solduel/api/issues](https://github.com/solduel/api/issues)

This quick start guide provides everything needed to begin building applications on the SOL Duel platform. The modular architecture allows for easy customization and extension based on your specific use case.