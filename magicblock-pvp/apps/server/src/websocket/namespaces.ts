import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { WebSocketEvents } from '@/types/api.types';
import { redis } from '@/config/redis';

// Authenticated socket interface
export interface AuthenticatedSocket extends Socket {
  data: {
    playerId: string;
    walletId: string;
    username?: string;
    rating?: number;
  };
}

// WebSocket authentication middleware
export const authenticateSocket = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    // Add user data to socket
    socket.data.playerId = decoded.playerId;
    socket.data.walletId = decoded.walletId;
    socket.data.username = decoded.username;
    socket.data.rating = decoded.rating;
    
    // Check if session is still valid
    const sessionKey = `session:${decoded.playerId}:${decoded.sessionId}`;
    const session = await redis.get(sessionKey);
    
    if (!session) {
      return next(new Error('Session expired or invalid'));
    }
    
    logger.info(`Socket authenticated for player ${decoded.playerId}`, {
      socketId: socket.id,
      walletId: decoded.walletId
    });
    
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error);
    next(new Error('Authentication failed'));
  }
};

// Rate limiting for socket events
const rateLimits = new Map<string, { count: number; resetTime: number }>();

export const rateLimitSocket = (eventsPerMinute: number = 60) => {
  return (socket: Socket, next: (err?: Error) => void) => {
    const now = Date.now();
    const key = `${socket.data.playerId}:${Math.floor(now / 60000)}`; // Per minute window
    
    const current = rateLimits.get(key) || { count: 0, resetTime: now + 60000 };
    
    if (now > current.resetTime) {
      // Reset counter
      current.count = 0;
      current.resetTime = now + 60000;
    }
    
    if (current.count >= eventsPerMinute) {
      return next(new Error('Rate limit exceeded'));
    }
    
    current.count++;
    rateLimits.set(key, current);
    next();
  };
};

// Game namespace setup
export function setupGameNamespace(io: Server) {
  const gameNamespace = io.of('/game');
  
  // Authentication for game namespace
  gameNamespace.use(authenticateSocket);
  gameNamespace.use(rateLimitSocket(120)); // 120 events per minute for games
  
  gameNamespace.on('connection', (socket: AuthenticatedSocket) => {
    const playerId = socket.data.playerId;
    
    logger.info(`Player ${playerId} connected to game namespace`, {
      socketId: socket.id,
      totalConnections: gameNamespace.sockets.size
    });
    
    // Join player to their personal room
    socket.join(`player:${playerId}`);
    
    // Handle joining game rooms
    socket.on('game:join', async (gameId: string) => {
      try {
        // Verify player is part of this game
        const gameKey = `game:${gameId}:players`;
        const isPlayer = await redis.sismember(gameKey, playerId);
        
        if (!isPlayer) {
          socket.emit('error', {
            code: 'UNAUTHORIZED',
            message: 'Not authorized to join this game'
          });
          return;
        }
        
        await socket.join(`game:${gameId}`);
        logger.info(`Player ${playerId} joined game room ${gameId}`);
        
        // Broadcast player joined
        socket.to(`game:${gameId}`).emit('game:player_joined', {
          playerId,
          username: socket.data.username
        });
        
        // Send current game state
        const gameState = await redis.get(`game:${gameId}:state`);
        if (gameState) {
          socket.emit('game:state_update', JSON.parse(gameState));
        }
        
      } catch (error) {
        logger.error('Failed to join game room:', error);
        socket.emit('error', {
          code: 'GAME_JOIN_FAILED',
          message: 'Failed to join game room'
        });
      }
    });
    
    // Handle leaving game rooms
    socket.on('game:leave', async (gameId: string) => {
      await socket.leave(`game:${gameId}`);
      logger.info(`Player ${playerId} left game room ${gameId}`);
      
      // Broadcast player left
      socket.to(`game:${gameId}`).emit('game:player_left', {
        playerId,
        username: socket.data.username
      });
    });
    
    // Handle game actions
    socket.on('game:action', async (data: WebSocketEvents['game:action']) => {
      try {
        const { gameId, action } = data;
        
        // Verify player is in game
        const rooms = Array.from(socket.rooms);
        if (!rooms.includes(`game:${gameId}`)) {
          socket.emit('error', {
            code: 'NOT_IN_GAME',
            message: 'Not currently in this game'
          });
          return;
        }
        
        // Add latency tracking
        const serverTimestamp = new Date().toISOString();
        const clientLatency = Date.now() - new Date(action.clientTimestamp).getTime();
        
        // Broadcast action to other players in game
        socket.to(`game:${gameId}`).emit('game:action', {
          ...data,
          serverTimestamp,
          latency: clientLatency
        });
        
        // Store action for processing
        await redis.lpush(`game:${gameId}:actions`, JSON.stringify({
          ...action,
          playerId,
          serverTimestamp,
          latency: clientLatency
        }));
        
        logger.info(`Game action received from ${playerId} in game ${gameId}`, {
          actionType: action.actionType,
          latency: clientLatency
        });
        
      } catch (error) {
        logger.error('Failed to process game action:', error);
        socket.emit('error', {
          code: 'ACTION_FAILED',
          message: 'Failed to process game action'
        });
      }
    });
    
    // Handle latency checks
    socket.on('latency:ping', (timestamp: string) => {
      socket.emit('latency:pong', {
        clientTimestamp: timestamp,
        serverTimestamp: new Date().toISOString()
      });
    });
    
    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      logger.info(`Player ${playerId} disconnected from game namespace`, {
        reason,
        socketId: socket.id
      });
      
      // Notify all games this player was in
      const rooms = Array.from(socket.rooms);
      const gameRooms = rooms.filter(room => room.startsWith('game:'));
      
      for (const gameRoom of gameRooms) {
        socket.to(gameRoom).emit('game:player_disconnected', {
          playerId,
          username: socket.data.username,
          reason
        });
      }
    });
  });
  
  return gameNamespace;
}

// Lobby namespace setup  
export function setupLobbyNamespace(io: Server) {
  const lobbyNamespace = io.of('/lobby');
  
  // Authentication for lobby namespace
  lobbyNamespace.use(authenticateSocket);
  lobbyNamespace.use(rateLimitSocket(60)); // 60 events per minute for lobby
  
  lobbyNamespace.on('connection', (socket: AuthenticatedSocket) => {
    const playerId = socket.data.playerId;
    
    logger.info(`Player ${playerId} connected to lobby namespace`, {
      socketId: socket.id,
      totalConnections: lobbyNamespace.sockets.size
    });
    
    // Join general lobby
    socket.join('general');
    
    // Broadcast player online
    socket.to('general').emit('player:online', {
      playerId,
      username: socket.data.username,
      rating: socket.data.rating
    });
    
    // Handle matchmaking events
    socket.on('matchmaking:join_queue', async (data: WebSocketEvents['matchmaking:joined']) => {
      try {
        await socket.join(`queue:${data.gameType}`);
        
        // Broadcast to queue
        socket.to(`queue:${data.gameType}`).emit('matchmaking:player_queued', {
          playerId,
          username: socket.data.username,
          rating: socket.data.rating,
          betAmount: data.betAmount
        });
        
        // Update queue count
        const queueCount = await lobbyNamespace.in(`queue:${data.gameType}`).fetchSockets();
        lobbyNamespace.to(`queue:${data.gameType}`).emit('matchmaking:queue_update', {
          gameType: data.gameType,
          count: queueCount.length
        });
        
        logger.info(`Player ${playerId} joined ${data.gameType} queue`);
        
      } catch (error) {
        logger.error('Failed to join matchmaking queue:', error);
        socket.emit('error', {
          code: 'QUEUE_JOIN_FAILED',
          message: 'Failed to join matchmaking queue'
        });
      }
    });
    
    socket.on('matchmaking:leave_queue', async () => {
      try {
        // Leave all queue rooms
        const rooms = Array.from(socket.rooms);
        const queueRooms = rooms.filter(room => room.startsWith('queue:'));
        
        for (const queueRoom of queueRooms) {
          await socket.leave(queueRoom);
          const gameType = queueRoom.replace('queue:', '');
          
          // Broadcast player left queue
          socket.to(queueRoom).emit('matchmaking:player_left_queue', {
            playerId,
            username: socket.data.username
          });
          
          // Update queue count
          const queueCount = await lobbyNamespace.in(queueRoom).fetchSockets();
          lobbyNamespace.to(queueRoom).emit('matchmaking:queue_update', {
            gameType,
            count: queueCount.length
          });
        }
        
        logger.info(`Player ${playerId} left matchmaking queues`);
        
      } catch (error) {
        logger.error('Failed to leave matchmaking queue:', error);
      }
    });
    
    // Handle challenge system
    socket.on('challenge:send', async (data: { targetPlayerId: string; gameType: string; betAmount: number; message?: string }) => {
      try {
        const targetSocket = await findPlayerSocket(lobbyNamespace, data.targetPlayerId);
        
        if (!targetSocket) {
          socket.emit('error', {
            code: 'PLAYER_NOT_FOUND',
            message: 'Target player not online'
          });
          return;
        }
        
        // Send challenge to target player
        targetSocket.emit('challenge:received', {
          challengerId: playerId,
          challengerName: socket.data.username,
          gameType: data.gameType,
          betAmount: data.betAmount,
          message: data.message,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
        });
        
        socket.emit('challenge:sent', {
          targetPlayerId: data.targetPlayerId
        });
        
        logger.info(`Challenge sent from ${playerId} to ${data.targetPlayerId}`, {
          gameType: data.gameType,
          betAmount: data.betAmount
        });
        
      } catch (error) {
        logger.error('Failed to send challenge:', error);
        socket.emit('error', {
          code: 'CHALLENGE_SEND_FAILED',
          message: 'Failed to send challenge'
        });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      logger.info(`Player ${playerId} disconnected from lobby namespace`, {
        reason,
        socketId: socket.id
      });
      
      // Broadcast player offline
      socket.to('general').emit('player:offline', {
        playerId,
        username: socket.data.username
      });
    });
  });
  
  return lobbyNamespace;
}

// Utility function to find a player's socket
async function findPlayerSocket(namespace: any, playerId: string): Promise<Socket | null> {
  const sockets = await namespace.fetchSockets();
  return sockets.find((socket: AuthenticatedSocket) => socket.data.playerId === playerId) || null;
}

// Broadcast system events to all namespaces
export function broadcastSystemEvent(io: Server, event: string, data: any) {
  io.of('/game').emit(event, data);
  io.of('/lobby').emit(event, data);
  
  logger.info(`System event broadcasted: ${event}`, { data });
}

// Get connection stats
export function getConnectionStats(io: Server) {
  return {
    game: io.of('/game').sockets.size,
    lobby: io.of('/lobby').sockets.size,
    total: io.engine.clientsCount
  };
}