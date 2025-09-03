# SOL Duel WebSocket API Documentation

## Overview

SOL Duel uses WebSocket connections for real-time game communication, providing instant updates for match events, player actions, and game state changes.

**WebSocket Endpoint:** `wss://api.solduel.game/socket.io`

## Connection Management

### Authentication

WebSocket connections must be authenticated using a valid JWT token obtained from the REST API.

```javascript
const socket = io('wss://api.solduel.game', {
  auth: {
    token: 'your_jwt_token_here'
  }
});
```

### Connection Lifecycle

#### Connection Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `connect` | Server → Client | Connection established successfully |
| `connect_error` | Server → Client | Connection failed with error details |
| `disconnect` | Server → Client | Connection terminated |
| `authenticated` | Server → Client | Authentication successful |
| `auth_error` | Server → Client | Authentication failed |

#### Authentication Flow

```javascript
// Client sends authentication
socket.emit('authenticate', jwt_token);

// Server responses
socket.on('authenticated', (data) => {
  console.log('Authenticated as:', data.username);
  // { playerId: "12345", username: "player1" }
});

socket.on('auth_error', (error) => {
  console.error('Authentication failed:', error.message);
});
```

## Game Room Management

### Joining and Leaving Rooms

#### Join Game Room
```javascript
// Client joins a specific game
socket.emit('join_game', gameId);

// Server confirms join
socket.on('game_state', (data) => {
  console.log('Joined game:', data.gameId);
  console.log('Current state:', data.game);
});
```

#### Leave Game Room
```javascript
// Client leaves current game
socket.emit('leave_game', gameId);

// Server confirms leave
socket.on('left_game', (data) => {
  console.log('Left game:', data.gameId);
});
```

#### Player Join/Leave Notifications
```javascript
// When another player joins
socket.on('player_joined', (data) => {
  console.log(`${data.username} joined the game`);
  // {
  //   playerId: "67890",
  //   username: "player2",
  //   gameId: "game_12345"
  // }
});

// When another player leaves
socket.on('player_left', (data) => {
  console.log(`${data.username} left the game`);
});
```

## Match Lifecycle Events

### Match Creation and Starting

#### Match Created (Lobby Event)
```javascript
// Broadcast to lobby when new match is created
socket.on('match_created', (data) => {
  console.log('New match available:', data);
  // {
  //   matchId: "game_12345",
  //   creator: {
  //     id: "player_123",
  //     username: "creator_name"
  //   },
  //   config: {
  //     gameType: "duel",
  //     wagerAmount: 0.1,
  //     maxPlayers: 2
  //   },
  //   timestamp: 1609459200000
  // }
});
```

#### Match Started
```javascript
// When match has enough players and begins
socket.on('match_started', (data) => {
  console.log('Match starting!', data);
  // {
  //   matchId: "game_12345",
  //   players: [
  //     { id: "player_123", username: "player1", ready: true },
  //     { id: "player_456", username: "player2", ready: true }
  //   ],
  //   startTime: 1609459200000,
  //   firstTurn: "player_123"
  // }
});
```

### Player Readiness

#### Set Player Ready
```javascript
// Client indicates readiness
socket.emit('player_ready', gameId);

// Broadcast ready status to all players
socket.on('player_ready_status', (data) => {
  console.log(`${data.username} is ready`);
  // {
  //   gameId: "game_12345",
  //   playerId: "player_456",
  //   username: "player2",
  //   ready: true
  // }
});
```

## Real-Time Gameplay Events

### Combat Actions

#### Execute Move/Action
```javascript
// Client sends combat action
socket.emit('make_move', {
  moveType: 'attack',
  moveData: {
    target: 1,        // Target player index
    power: 50,        // Attack power
    weaponType: 'sword'
  },
  timestamp: Date.now()
});

// Server validates and broadcasts move
socket.on('move_made', (data) => {
  console.log('Move executed:', data);
  // {
  //   gameId: "game_12345",
  //   playerId: "player_123",
  //   username: "attacker",
  //   moveType: "attack",
  //   moveData: { target: 1, power: 50, weaponType: "sword" },
  //   timestamp: 1609459200000,
  //   gameState: {
  //     players: [...],
  //     currentTurn: "player_456",
  //     turnTimeRemaining: 30
  //   }
  // }
});

// If move is invalid
socket.on('move_error', (error) => {
  console.error('Invalid move:', error.message);
});
```

#### Combat Action Types

| Action Type | Data Structure | Description |
|-------------|----------------|-------------|
| `attack` | `{ target: number, power: number, weaponType?: string }` | Basic attack action |
| `heal` | `{ healAmount: number, manaCost: number }` | Self-healing action |
| `special_attack` | `{ target: number, skillId: string, manaCost: number }` | Special skill attack |
| `defend` | `{ defenseBonus: number }` | Defensive stance |
| `use_item` | `{ itemId: string, target?: number }` | Use consumable item |

### Game State Updates

#### Health and Status Updates
```javascript
// When player health changes
socket.on('player_health_updated', (data) => {
  console.log('Health update:', data);
  // {
  //   playerId: "player_456",
  //   newHealth: 75,
  //   maxHealth: 100,
  //   damage: 25,
  //   source: "player_123"
  // }
});

// When player status effects change
socket.on('player_status_updated', (data) => {
  console.log('Status update:', data);
  // {
  //   playerId: "player_456",
  //   statusEffects: [
  //     { type: "poison", duration: 3, power: 5 }
  //   ]
  // }
});
```

#### Turn Management
```javascript
// Turn change notification
socket.on('turn_changed', (data) => {
  console.log('New turn:', data);
  // {
  //   gameId: "game_12345",
  //   currentPlayer: "player_456",
  //   turnNumber: 5,
  //   timeRemaining: 30,
  //   previousPlayer: "player_123"
  // }
});

// Turn timeout warning
socket.on('turn_timeout_warning', (data) => {
  console.log('Turn ending soon:', data.timeRemaining);
  // { timeRemaining: 10 }
});
```

### Match Completion

#### Game Completed
```javascript
socket.on('game_completed', (data) => {
  console.log('Game finished:', data);
  // {
  //   gameId: "game_12345",
  //   winner: "player_123",
  //   reason: "victory", // "victory", "surrender", "timeout"
  //   finalScores: {
  //     "player_123": { health: 45, damage_dealt: 120, actions: 8 },
  //     "player_456": { health: 0, damage_dealt: 95, actions: 7 }
  //   },
  //   eloChanges: {
  //     "player_123": +25,
  //     "player_456": -15
  //   },
  //   rewards: {
  //     "player_123": 0.18, // SOL earned
  //     "player_456": 0.0
  //   },
  //   duration: 245, // seconds
  //   endedAt: 1609459445000
  // }
});
```

#### Game Surrendered
```javascript
// Client surrenders
socket.emit('surrender_game', gameId);

// Broadcast surrender to all players
socket.on('game_surrendered', (data) => {
  console.log('Player surrendered:', data);
  // {
  //   gameId: "game_12345",
  //   surrenderedBy: "player_456",
  //   username: "player2",
  //   winner: "player_123",
  //   timestamp: 1609459300000
  // }
});
```

## Chat and Communication

### In-Game Chat
```javascript
// Send chat message
socket.emit('game_chat', {
  message: 'Good luck!',
  timestamp: Date.now()
});

// Receive chat messages
socket.on('game_chat_message', (data) => {
  console.log('Chat:', data);
  // {
  //   gameId: "game_12345",
  //   playerId: "player_456",
  //   username: "player2",
  //   message: "Good luck!",
  //   timestamp: 1609459200000
  // }
});
```

### Chat Limitations
- Maximum message length: 500 characters
- Rate limit: 10 messages per minute per player
- Profanity filtering applied automatically

## Error Handling and Recovery

### Connection Errors
```javascript
// Handle connection errors
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error);
  // Implement reconnection logic
});

// Handle disconnections
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, reconnect manually
    socket.connect();
  }
  // 'io client disconnect' means client initiated
});
```

### Game State Recovery
```javascript
// Request current game state after reconnection
socket.emit('get_game_state', gameId);

socket.on('game_state', (data) => {
  // Restore game state
  console.log('Current game state:', data.game);
});
```

### Player Disconnection Handling
```javascript
// When another player disconnects
socket.on('player_disconnected', (data) => {
  console.log('Player disconnected:', data);
  // {
  //   playerId: "player_456",
  //   username: "player2",
  //   gameId: "game_12345",
  //   timestamp: 1609459300000
  // }
});

// Reconnection notification
socket.on('player_reconnected', (data) => {
  console.log('Player reconnected:', data);
});
```

## Rate Limiting and Performance

### Rate Limits
- **Game Actions**: 1 action per turn (enforced by game logic)
- **Chat Messages**: 10 messages per minute
- **State Requests**: 5 per minute
- **Connection Attempts**: 10 per hour per IP

### Performance Optimization
```javascript
// Use acknowledgments for critical events
socket.emit('make_move', moveData, (response) => {
  if (response.success) {
    console.log('Move confirmed');
  } else {
    console.error('Move failed:', response.error);
  }
});

// Implement client-side timeout handling
const moveTimeout = setTimeout(() => {
  console.error('Move acknowledgment timeout');
}, 5000);

socket.emit('make_move', moveData, (response) => {
  clearTimeout(moveTimeout);
  // Handle response
});
```

### Heartbeat and Keep-Alive
```javascript
// Ping-pong for connection health
socket.emit('ping', { timestamp: Date.now() }, (response) => {
  const latency = Date.now() - response.timestamp;
  console.log('Latency:', latency + 'ms');
});
```

## Room Management Events

### Lobby Events
```javascript
// Join game lobby
socket.emit('join_lobby');

// Leave game lobby  
socket.emit('leave_lobby');

// Lobby updates
socket.on('lobby_updated', (data) => {
  console.log('Available games:', data.availableGames);
});
```

### Private Room Events
```javascript
// Create private room
socket.emit('create_private_room', {
  roomId: 'custom_room_123',
  password: 'optional_password'
});

// Join private room
socket.emit('join_private_room', {
  roomId: 'custom_room_123', 
  password: 'optional_password'
});
```

## Example Usage

### Complete Game Flow Example
```javascript
const io = require('socket.io-client');
const socket = io('wss://api.solduel.game', {
  auth: { token: 'your_jwt_token' }
});

// Authentication
socket.on('authenticated', (data) => {
  console.log('Connected as:', data.username);
  
  // Join a game
  socket.emit('join_game', 'game_12345');
});

// Game events
socket.on('game_state', (data) => {
  console.log('Game state:', data.game);
});

socket.on('match_started', (data) => {
  console.log('Match started!');
  
  // Set ready if needed
  socket.emit('player_ready', data.matchId);
});

socket.on('turn_changed', (data) => {
  if (data.currentPlayer === socket.playerId) {
    console.log('My turn!');
    
    // Make a move
    socket.emit('make_move', {
      moveType: 'attack',
      moveData: { target: 0, power: 50 },
      timestamp: Date.now()
    });
  }
});

socket.on('game_completed', (data) => {
  console.log('Game finished! Winner:', data.winner);
  console.log('ELO change:', data.eloChanges[socket.playerId]);
});

// Error handling
socket.on('error', (error) => {
  console.error('Game error:', error);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

This WebSocket API provides real-time, low-latency communication essential for competitive gaming experiences on the SOL Duel platform.