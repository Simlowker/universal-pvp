# SOL Duel API Documentation

Welcome to the comprehensive API documentation for **SOL Duel**, a real-time PvP gaming platform built on the Solana blockchain.

## 📚 Documentation Overview

This documentation suite provides everything you need to integrate with SOL Duel's gaming ecosystem:

### Core API Documentation
- **[OpenAPI Specification](./openapi.yaml)** - Complete REST API reference with schemas and examples
- **[Quick Start Guide](./quick-start.md)** - Get up and running in minutes
- **[Authentication Guide](./authentication.md)** - JWT tokens and wallet verification flows

### Real-Time Features
- **[WebSocket Events](./websocket-events.md)** - Real-time game communication and events
- **[Game Integration Tutorial](./game-integration-tutorial.md)** - Step-by-step integration guide

### Blockchain Integration  
- **[Solana Program Documentation](./solana-program.md)** - On-chain program instructions and accounts
- **[Error Codes Reference](./error-codes.md)** - Comprehensive error handling guide

## 🚀 Quick Links

| Resource | Description | Link |
|----------|-------------|------|
| **API Base URL** | Production API endpoint | `https://api.solduel.game` |
| **WebSocket URL** | Real-time events endpoint | `wss://api.solduel.game` |
| **Program ID** | Solana program address | `GAMExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| **Status Page** | Service status and uptime | `https://status.solduel.game` |

## 🎮 What is SOL Duel?

SOL Duel is a competitive PvP gaming platform that combines:

- **Real-time Combat**: Fast-paced turn-based battles
- **Blockchain Integration**: Trustless wagering and rewards on Solana  
- **Wallet Authentication**: Secure authentication via wallet signatures
- **Tournament System**: Organized competitive play
- **NFT Equipment**: Collectible game items and characters

## 📖 Getting Started

### 1. Authentication
Choose your authentication method:

```javascript
// Option A: Email/Password Authentication
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'player@example.com',
    password: 'securepassword'
  })
});

// Option B: Wallet Signature Authentication
const message = `Login to SOL Duel - ${Date.now()}`;
const signature = await wallet.signMessage(message);
const response = await fetch('/api/auth/verify-wallet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: wallet.publicKey.toString(),
    signature: signature,
    message: message
  })
});
```

### 2. Create or Join a Game

```javascript
// Create a new game
const game = await fetch('/api/games', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    gameType: 'duel',
    wagerAmount: 0.1,
    maxPlayers: 2,
    timeLimit: 300
  })
});

// Or find a quick match
const quickMatch = await fetch('/api/games/quickmatch', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    wagerAmount: 0.1,
    gameType: 'duel'
  })
});
```

### 3. Real-time Game Updates

```javascript
import { io } from 'socket.io-client';

const socket = io('wss://api.solduel.game', {
  auth: { token: yourJWTToken }
});

// Join game room
socket.emit('join_game', gameId);

// Listen for game events
socket.on('match_started', (data) => {
  console.log('Match started!', data);
});

socket.on('turn_changed', (data) => {
  console.log('New turn:', data.currentPlayer);
});

socket.on('move_made', (data) => {
  console.log('Move executed:', data);
});

// Make a move
socket.emit('make_move', {
  moveType: 'attack',
  moveData: { target: 0, power: 50 },
  timestamp: Date.now()
});
```

## 🏗️ API Architecture

### REST API Structure

```
/api/
├── auth/           # Authentication endpoints
│   ├── register    # Player registration
│   ├── login       # Email/password login
│   ├── verify-wallet # Wallet signature verification
│   └── refresh     # Token refresh
├── games/          # Game management
│   ├── [GET]       # List available games
│   ├── [POST]      # Create new game
│   ├── {id}/join   # Join specific game
│   ├── {id}/move   # Make game move
│   ├── quickmatch  # Find quick match
│   └── player/history # Player's game history
├── players/        # Player management
│   ├── profile     # Get/update profile
│   └── {id}/stats  # Player statistics
└── leaderboard     # Rankings and leaderboards
```

### WebSocket Event Categories

| Category | Events | Purpose |
|----------|---------|---------|
| **Connection** | `connect`, `disconnect`, `authenticated` | Connection management |
| **Match Lifecycle** | `match_started`, `game_completed` | Match state changes |
| **Gameplay** | `move_made`, `turn_changed`, `player_health_updated` | Real-time game actions |
| **Chat** | `game_chat_message` | In-game communication |
| **Errors** | `error`, `move_error` | Error handling |

### Solana Program Instructions

| Instruction | Purpose | Accounts Required |
|-------------|---------|------------------|
| `register_player` | Register new player profile | player_profile, player, system_program |
| `create_match` | Create new match with escrow | match_account, creator_profile, token_accounts |
| `join_match` | Join existing match | match_account, player_profile, token_accounts |
| `execute_action` | Perform combat action | match_account, player_profile, player |
| `finish_match` | Complete match and distribute rewards | match_account, token_program |

## 🔧 Integration Examples

### React Hook for Game State

```typescript
import { useState, useEffect } from 'react';
import { gameWebSocket } from './websocket';

function useGameState(gameId: string) {
  const [gameState, setGameState] = useState(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  
  useEffect(() => {
    gameWebSocket.on('gameStateUpdate', setGameState);
    gameWebSocket.on('turnChanged', (data) => {
      setIsMyTurn(data.currentPlayer === userId);
    });
    
    gameWebSocket.joinGame(gameId);
    
    return () => {
      gameWebSocket.leaveGame(gameId);
      gameWebSocket.off('gameStateUpdate');
      gameWebSocket.off('turnChanged');
    };
  }, [gameId]);
  
  const makeMove = (action) => {
    gameWebSocket.makeMove(action);
  };
  
  return { gameState, isMyTurn, makeMove };
}
```

### Python Client Example

```python
import requests
import websocket
import json

class SolDuelClient:
    def __init__(self, api_url="https://api.solduel.game"):
        self.api_url = api_url
        self.token = None
        self.ws = None
    
    def login(self, email, password):
        response = requests.post(f"{self.api_url}/api/auth/login", json={
            "email": email,
            "password": password
        })
        
        if response.status_code == 200:
            data = response.json()
            self.token = data["token"]
            return data["player"]
        else:
            raise Exception(f"Login failed: {response.json()}")
    
    def create_game(self, game_type="duel", wager_amount=0.1):
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.post(f"{self.api_url}/api/games", 
            headers=headers,
            json={
                "gameType": game_type,
                "wagerAmount": wager_amount,
                "maxPlayers": 2
            }
        )
        
        if response.status_code == 201:
            return response.json()["data"]["game"]
        else:
            raise Exception(f"Game creation failed: {response.json()}")

# Usage
client = SolDuelClient()
player = client.login("player@example.com", "password")
game = client.create_game()
print(f"Created game: {game['id']}")
```

## 📊 Rate Limits and Quotas

| Endpoint Category | Requests per Minute | Burst Limit |
|------------------|-------------------|-------------|
| Authentication | 10 | 20 |
| Game Actions | 60 | 100 |
| Profile Updates | 5 | 10 |
| Leaderboard | 30 | 50 |
| WebSocket Events | 120 | 200 |

## 🛡️ Security Best Practices

### API Security
- Always use HTTPS for API requests
- Store JWT tokens securely (avoid localStorage for sensitive data)
- Implement proper token refresh logic
- Validate all user inputs client-side and server-side

### Wallet Security
- Verify signatures on both client and server
- Use unique nonces or timestamps in signed messages
- Never expose private keys in client code
- Implement proper key management practices

### Game Security  
- Validate all moves server-side
- Use escrow for wagers
- Implement anti-cheat measures
- Monitor for suspicious patterns

## 🔍 Testing Your Integration

### Test Endpoints
```bash
# Health check
curl https://api.solduel.game/health

# API documentation
curl https://api.solduel.game/api/docs

# Test authentication (replace with your credentials)
curl -X POST https://api.solduel.game/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'
```

### Development Tools
- **[Postman Collection](./postman_collection.json)** - Pre-configured API requests
- **[Insomnia Collection](./insomnia_collection.json)** - Alternative REST client setup
- **[WebSocket Tester](https://websocket.king/)** - Test WebSocket connections

## 📈 Performance Optimization

### Caching Strategy
- Cache static data (leaderboards, player profiles) for 5 minutes
- Use ETags for conditional requests
- Implement client-side request deduplication

### WebSocket Optimization
- Use compression for large payloads
- Implement heartbeat/ping-pong for connection health
- Batch non-critical updates

### Database Queries
- Paginate large result sets
- Use appropriate indexes
- Implement query result caching

## 🐛 Troubleshooting

### Common Issues

**Authentication Errors**
- Check token format and expiration
- Verify wallet signature implementation
- Ensure proper message encoding

**WebSocket Connection Issues**  
- Verify firewall settings
- Check for proxy interference
- Implement reconnection logic

**Game State Desync**
- Request fresh game state from server
- Implement conflict resolution logic
- Monitor for network issues

### Debug Mode
Enable detailed logging by setting debug headers:

```javascript
headers: {
  'X-Debug-Mode': 'true',
  'X-Request-ID': 'unique-request-id'
}
```

## 📞 Support and Community

- **Documentation Issues**: [GitHub Issues](https://github.com/solduel/api-docs/issues)
- **API Support**: [support@solduel.game](mailto:support@solduel.game)  
- **Developer Discord**: [discord.gg/solduel-dev](https://discord.gg/solduel-dev)
- **Status Updates**: [@SolDuelAPI](https://twitter.com/SolDuelAPI)

## 📝 Changelog

### Version 1.0.0 (Current)
- Initial API release
- Core authentication and game management
- WebSocket real-time features
- Solana program integration

### Upcoming Features
- Tournament brackets API
- NFT equipment system
- Advanced statistics API
- Mobile SDK support

---

**Happy Building! 🎮⚔️**

*This documentation is actively maintained. For the most up-to-date information, please check our [API status page](https://status.solduel.game).*