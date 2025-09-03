# MagicBlock PvP Server

Backend API server for the MagicBlock PvP gaming platform, built with Node.js, Express, Prisma, and Solana integration.

## 🚀 Features

- **Real-time Gaming**: WebSocket-based game engine with sub-second response times
- **Blockchain Integration**: Solana and MagicBlock SDK integration for trustless gaming
- **VRF (Verifiable Random Function)**: Cryptographically secure randomness for fair gameplay
- **Advanced Matchmaking**: Skill-based matchmaking with multiple game modes
- **Cost Tracking**: Comprehensive cost analysis and optimization
- **Worker System**: BullMQ-powered background processing for settlements and proofs
- **Monitoring**: Prometheus metrics, OpenTelemetry tracing, and structured logging
- **Scalable Architecture**: Redis-backed session management and game state caching

## 📋 Prerequisites

- **Node.js**: 20.11+ LTS
- **PostgreSQL**: 16+
- **Redis**: 7.2+
- **npm/pnpm**: Latest version

## 🛠 Installation

1. **Clone and install dependencies**:
   ```bash
   cd apps/server
   npm install
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**:
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Run migrations
   npm run db:migrate
   
   # Seed database (optional)
   npm run db:seed
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

## 🏗 Architecture

### Core Components

```
├── src/
│   ├── config/          # Configuration and environment setup
│   ├── middleware/      # Express middleware (auth, error handling)
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── workers/         # Background job processors
│   ├── websocket/       # WebSocket event handlers
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
```

### Database Schema

The server uses Prisma ORM with a comprehensive schema supporting:

- **Players**: User profiles, stats, and authentication
- **Games**: Game instances with complete state tracking
- **GameActions**: Detailed action history with proof verification
- **Proofs**: VRF and ZK-proof storage for game integrity
- **Transactions**: Blockchain transaction tracking
- **Sessions**: Secure session management
- **CostMetrics**: Detailed cost tracking and analysis

### Services Architecture

#### Core Services
- **GameLogicService**: Handles game state management and rule enforcement
- **MagicBlockService**: Blockchain integration for escrow and settlements
- **VRFService**: Verifiable random number generation
- **CostTrackingService**: Comprehensive cost monitoring and optimization

#### Worker System
- **Settlement Worker**: Processes game settlements on blockchain
- **Proof Worker**: Verifies game proofs and action validity
- **Trending Worker**: Calculates trending games and player statistics

## 🎮 API Endpoints

### Authentication
- `POST /api/auth/wallet` - Wallet-based authentication
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - Logout and session cleanup
- `PUT /api/auth/profile` - Update player profile

### Game Management
- `POST /api/games` - Create new game
- `GET /api/games` - List player's games
- `GET /api/games/:gameId` - Get game details
- `POST /api/games/:gameId/actions` - Submit game action
- `POST /api/games/:gameId/forfeit` - Forfeit game

### Matchmaking
- `GET /api/matchmaking/queue/status` - Queue status
- `POST /api/matchmaking/queue/join` - Join matchmaking
- `GET /api/matchmaking/available` - Available games
- `GET /api/matchmaking/trending` - Trending games/players

### Player System
- `GET /api/players/me` - Current player profile
- `GET /api/players/:playerId` - Public player profile
- `GET /api/players/search` - Search players
- `GET /api/players/leaderboard` - Player rankings

### Metrics & Analytics
- `GET /api/metrics/dashboard` - Comprehensive metrics
- `GET /api/metrics/costs` - Cost analysis
- `GET /api/metrics/performance` - System performance

## 🔌 WebSocket Events

### Game Events
- `game:join` - Join game room
- `game:action` - Submit game action
- `game:state` - Receive game state updates
- `game:forfeit` - Forfeit game

### Matchmaking Events
- `matchmaking:join-queue` - Join matchmaking queue
- `matchmaking:match-found` - Match found notification
- `matchmaking:game-ready` - Game ready to start

## 📊 Monitoring & Observability

### Metrics (Prometheus)
- Game performance metrics
- WebSocket connection counts
- Database query performance
- Blockchain transaction costs
- Player engagement metrics

### Logging (Winston)
- Structured JSON logging
- Game-specific log contexts
- Performance and security logging
- Error tracking and alerting

### Tracing (OpenTelemetry)
- Distributed tracing across services
- Game action tracing
- Blockchain operation tracing
- Performance bottleneck identification

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix
```

## 🚀 Production Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Environment Variables**:
   Set production environment variables for:
   - Database connections
   - Redis configuration
   - Blockchain RPC endpoints
   - JWT secrets
   - Monitoring endpoints

3. **Database Migration**:
   ```bash
   npm run db:migrate
   ```

4. **Start Production Server**:
   ```bash
   npm start
   ```

## 🔧 Configuration

Key configuration options in `.env`:

```bash
# Database
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."

# Blockchain
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
MAGICBLOCK_PROGRAM_ID="..."

# Game Settings
MATCH_TIMEOUT_MS=300000
MIN_BET_AMOUNT=0.01
MAX_BET_AMOUNT=10

# Monitoring
PROMETHEUS_PORT=9464
COST_TRACKING_ENABLED=true
```

## 🛡 Security

- **Authentication**: JWT-based with wallet signature verification
- **Rate Limiting**: Configurable request rate limiting
- **Input Validation**: Comprehensive input sanitization
- **Session Management**: Secure session handling with Redis
- **Error Handling**: Secure error responses without information leakage

## 📈 Performance Optimization

- **Caching**: Redis-based game state and session caching
- **Connection Pooling**: Optimized database connection management
- **Background Processing**: Async job processing for heavy operations
- **Monitoring**: Real-time performance metrics and alerting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is part of the MagicBlock PvP platform.

---

For more information about the complete MagicBlock PvP platform, see the main project documentation.