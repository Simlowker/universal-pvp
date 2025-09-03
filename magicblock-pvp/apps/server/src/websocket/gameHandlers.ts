import { Server as SocketIOServer, Socket } from 'socket.io';
import { gameLogicService } from '@/services/gameLogic';
// import { magicBlockService } from '@/services/magicblock';
import { redisManager } from '@/config/redis';
import { logger, gameLogger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { prisma } from '@/config/database';
// Prisma enum types - using string literals since direct enum imports are not working
type GameStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
type ActionType = 'MOVE' | 'ATTACK' | 'DEFEND' | 'SPECIAL' | 'ITEM_USE' | 'SURRENDER';

const GameStatus = {
  WAITING: 'WAITING' as const,
  STARTING: 'STARTING' as const,
  ACTIVE: 'ACTIVE' as const,
  PAUSED: 'PAUSED' as const,
  SETTLING: 'SETTLING' as const,
  COMPLETED: 'COMPLETED' as const,
  CANCELLED: 'CANCELLED' as const,
  DISPUTED: 'DISPUTED' as const,
};

const ActionType = {
  MOVE: 'MOVE' as const,
  ATTACK: 'ATTACK' as const,
  DEFEND: 'DEFEND' as const,
  SPECIAL: 'SPECIAL' as const,
  ITEM_USE: 'ITEM_USE' as const,
  SURRENDER: 'SURRENDER' as const,
};

interface GameSocketData {
  playerId: string;
  walletId: string;
  sessionId: string;
  currentGameId?: string;
}

interface GameActionPayload {
  gameId: string;
  action: {
    type: ActionType;
    targetPosition?: { x: number; y: number };
    direction?: 'left' | 'right' | 'up' | 'down';
    power?: number;
  };
}

interface JoinGamePayload {
  gameId: string;
}

export function initializeGameHandlers(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    const socketData = socket.data as GameSocketData;
    
    logger.info('Player connected to game socket', {
      socketId: socket.id,
      playerId: socketData.playerId,
    });

    // Update player online status
    redisManager.setPlayerOnline(socketData.playerId);
    metricsUtils.recordWebSocketConnection(1);

    // Join game room
    socket.on('game:join', async (payload: JoinGamePayload) => {
      await handleJoinGame(socket, payload);
    });

    // Leave game room
    socket.on('game:leave', async (payload: JoinGamePayload) => {
      await handleLeaveGame(socket, payload);
    });

    // Submit game action
    socket.on('game:action', async (payload: GameActionPayload) => {
      await handleGameAction(socket, payload);
    });

    // Request current game state
    socket.on('game:get-state', async (payload: { gameId: string }) => {
      await handleGetGameState(socket, payload);
    });

    // Forfeit game
    socket.on('game:forfeit', async (payload: { gameId: string }) => {
      await handleGameForfeit(socket, payload);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      handleDisconnection(socket, reason);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error('Game socket error', {
        socketId: socket.id,
        playerId: socketData.playerId,
        error: error.message,
      });
    });
  });
}

async function handleJoinGame(socket: Socket, payload: JoinGamePayload) {
  const socketData = socket.data as GameSocketData;
  
  try {
    const { gameId } = payload;
    
    // Verify player is part of this game
    const game = await prisma.game.findUnique({
      where: { gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) {
      socket.emit('game:error', { message: 'Game not found' });
      return;
    }

    if (game.player1Id !== socketData.playerId && game.player2Id !== socketData.playerId) {
      socket.emit('game:error', { message: 'You are not a player in this game' });
      return;
    }

    // Join game room
    socket.join(`game:${gameId}`);
    socketData.currentGameId = gameId;

    // Get current game state
    const gameState = await gameLogicService.getGameState(gameId);
    
    // Emit current state to player
    socket.emit('game:state', {
      gameId,
      gameState,
      playerRole: game.player1Id === socketData.playerId ? 'player1' : 'player2',
    });

    // Notify other players
    socket.to(`game:${gameId}`).emit('game:player-joined', {
      playerId: socketData.playerId,
      playerName: game.player1Id === socketData.playerId 
        ? game.player1.displayName || game.player1.username 
        : game.player2?.displayName || game.player2?.username,
    });

    gameLogger.playerAction(gameId, socketData.playerId, { type: 'joined_game' });
    metricsUtils.recordWebSocketMessage('game:join', 'in');

    logger.info('Player joined game room', {
      gameId,
      playerId: socketData.playerId,
      socketId: socket.id,
    });

  } catch (error) {
    logger.error('Failed to join game:', error);
    socket.emit('game:error', { 
      message: 'Failed to join game',
      error: (error as Error).message 
    });
  }
}

async function handleLeaveGame(socket: Socket, payload: JoinGamePayload) {
  const socketData = socket.data as GameSocketData;
  
  try {
    const { gameId } = payload;
    
    socket.leave(`game:${gameId}`);
    socketData.currentGameId = undefined;

    // Notify other players
    socket.to(`game:${gameId}`).emit('game:player-left', {
      playerId: socketData.playerId,
    });

    gameLogger.playerAction(gameId, socketData.playerId, { type: 'left_game' });
    metricsUtils.recordWebSocketMessage('game:leave', 'in');

    logger.info('Player left game room', {
      gameId,
      playerId: socketData.playerId,
      socketId: socket.id,
    });

  } catch (error) {
    logger.error('Failed to leave game:', error);
    socket.emit('game:error', { 
      message: 'Failed to leave game',
      error: (error as Error).message 
    });
  }
}

async function handleGameAction(socket: Socket, payload: GameActionPayload) {
  const socketData = socket.data as GameSocketData;
  
  try {
    const { gameId, action } = payload;

    // Validate action payload
    if (!action.type || !Object.values(ActionType).includes(action.type)) {
      socket.emit('game:error', { message: 'Invalid action type' });
      return;
    }

    // Process action through game logic service
    const updatedState = await gameLogicService.processAction(gameId, socketData.playerId, {
      type: action.type,
      playerId: socketData.playerId,
      targetPosition: action.targetPosition,
      direction: action.direction,
      power: action.power,
      timestamp: Date.now(),
    });

    // Broadcast updated state to all players in the game
    socket.to(`game:${gameId}`).emit('game:state-update', {
      gameId,
      gameState: updatedState,
      lastAction: {
        playerId: socketData.playerId,
        type: action.type,
        timestamp: Date.now(),
      },
    });

    // Send confirmation to action sender
    socket.emit('game:action-confirmed', {
      gameId,
      gameState: updatedState,
      action: {
        type: action.type,
        timestamp: Date.now(),
      },
    });

    // Check if game ended
    if (updatedState.status === GameStatus.COMPLETED) {
      await handleGameEnd(gameId, updatedState);
    }

    metricsUtils.recordWebSocketMessage('game:action', 'in');

  } catch (error) {
    logger.error('Failed to process game action:', error);
    socket.emit('game:error', { 
      message: 'Failed to process action',
      error: (error as Error).message 
    });
  }
}

async function handleGetGameState(socket: Socket, payload: { gameId: string }) {
  const socketData = socket.data as GameSocketData;
  
  try {
    const { gameId } = payload;
    
    // Verify player has access to this game
    const game = await prisma.game.findUnique({
      where: { gameId },
      select: {
        player1Id: true,
        player2Id: true,
        status: true,
      },
    });

    if (!game || (game.player1Id !== socketData.playerId && game.player2Id !== socketData.playerId)) {
      socket.emit('game:error', { message: 'Game not found or access denied' });
      return;
    }

    const gameState = await gameLogicService.getGameState(gameId);
    
    socket.emit('game:state', {
      gameId,
      gameState,
      playerRole: game.player1Id === socketData.playerId ? 'player1' : 'player2',
    });

    metricsUtils.recordWebSocketMessage('game:get-state', 'in');

  } catch (error) {
    logger.error('Failed to get game state:', error);
    socket.emit('game:error', { 
      message: 'Failed to get game state',
      error: (error as Error).message 
    });
  }
}

async function handleGameForfeit(socket: Socket, payload: { gameId: string }) {
  const socketData = socket.data as GameSocketData;
  
  try {
    const { gameId } = payload;

    // Process forfeit action
    await gameLogicService.processAction(gameId, socketData.playerId, {
      type: ActionType.SURRENDER,
      playerId: socketData.playerId,
      timestamp: Date.now(),
    });

    // Notify all players in the game
    socket.to(`game:${gameId}`).emit('game:forfeit', {
      gameId,
      playerId: socketData.playerId,
      timestamp: Date.now(),
    });

    gameLogger.playerAction(gameId, socketData.playerId, { type: 'forfeit' });
    metricsUtils.recordWebSocketMessage('game:forfeit', 'in');

  } catch (error) {
    logger.error('Failed to process forfeit:', error);
    socket.emit('game:error', { 
      message: 'Failed to forfeit game',
      error: (error as Error).message 
    });
  }
}

async function handleGameEnd(gameId: string, finalState: any) {
  try {
    const game = await prisma.game.findUnique({
      where: { gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) return;

    // Notify all players in the game room
    const io = require('socket.io-client'); // This would be passed from the main handler
    
    // Emit game end event
    const gameEndData = {
      gameId,
      finalState,
      winnerId: finalState.winnerId,
      endReason: finalState.endReason,
      timestamp: Date.now(),
    };

    // Notify players
    // io.to(`game:${gameId}`).emit('game:ended', gameEndData);

    // Update player presence
    await Promise.all([
      redisManager.setPlayerOffline(game.player1Id),
      game.player2Id ? redisManager.setPlayerOffline(game.player2Id) : Promise.resolve(),
    ]);

    gameLogger.gameEnd(gameId, finalState.winnerId, finalState.endReason);

  } catch (error) {
    logger.error('Failed to handle game end:', error);
  }
}

function handleDisconnection(socket: Socket, reason: string) {
  const socketData = socket.data as GameSocketData;
  
  logger.info('Player disconnected from game socket', {
    socketId: socket.id,
    playerId: socketData.playerId,
    reason,
    currentGameId: socketData.currentGameId,
  });

  // Update player offline status
  redisManager.setPlayerOffline(socketData.playerId);
  metricsUtils.recordWebSocketConnection(-1);

  // Notify other players in current game if applicable
  if (socketData.currentGameId) {
    socket.to(`game:${socketData.currentGameId}`).emit('game:player-disconnected', {
      playerId: socketData.playerId,
      reason,
      timestamp: Date.now(),
    });
  }

  // Clean up any game-specific state
  // This could include pausing the game, setting timeouts for reconnection, etc.
}

// Utility functions for game room management
export async function getGameRoomPlayers(gameId: string): Promise<string[]> {
  // This would integrate with Socket.IO to get current room members
  // For now, return empty array as placeholder
  return [];
}

export async function broadcastToGame(gameId: string, event: string, data: any) {
  // This would broadcast an event to all players in a game room
  // Implementation depends on having access to the io instance
  logger.debug('Broadcasting to game room', { gameId, event, data });
}

export async function notifyGameStart(gameId: string) {
  // Notify players that their game is starting
  logger.info('Game starting notification', { gameId });
  // io.to(`game:${gameId}`).emit('game:starting', { gameId, timestamp: Date.now() });
}

export async function notifyTurnTimeout(gameId: string, playerId: string) {
  // Notify players of turn timeout
  logger.info('Turn timeout notification', { gameId, playerId });
  // io.to(`game:${gameId}`).emit('game:turn-timeout', { gameId, playerId, timestamp: Date.now() });
}