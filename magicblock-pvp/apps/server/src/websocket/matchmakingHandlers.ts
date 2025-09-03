import { Server as SocketIOServer, Socket } from 'socket.io';
import { prisma } from '@/config/database';
import { redisManager } from '@/config/redis';
import { logger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { gameLogicService } from '@/services/gameLogic';
// Prisma enum types - using string literals since direct enum imports are not working
type GameType = 'QUICK_MATCH' | 'RANKED_MATCH' | 'TOURNAMENT' | 'PRACTICE';
type GameStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

const GameType = {
  QUICK_MATCH: 'QUICK_MATCH' as const,
  RANKED_MATCH: 'RANKED_MATCH' as const,
  TOURNAMENT: 'TOURNAMENT' as const,
  PRACTICE: 'PRACTICE' as const,
};

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
import { nanoid } from 'nanoid';

interface MatchmakingSocketData {
  playerId: string;
  walletId: string;
  sessionId: string;
  isInQueue?: boolean;
  queuedAt?: number;
}

interface QueueJoinPayload {
  gameType: GameType;
  betAmount: number;
  maxWaitTime?: number; // seconds
}

interface QueueLeavePayload {
  gameType?: GameType;
}

interface MatchRequest {
  playerId: string;
  gameType: GameType;
  betAmount: number;
  queuedAt: number;
  maxWaitTime: number;
  socketId: string;
  skill?: number;
}

export function initializeMatchmakingHandlers(io: SocketIOServer) {
  // Matchmaking queues stored in Redis
  const matchmakingQueues = new Map<string, MatchRequest[]>();
  
  io.on('connection', (socket: Socket) => {
    const socketData = socket.data as MatchmakingSocketData;
    
    logger.info('Player connected to matchmaking', {
      socketId: socket.id,
      playerId: socketData.playerId,
    });

    // Join matchmaking queue
    socket.on('matchmaking:join-queue', async (payload: QueueJoinPayload) => {
      await handleJoinQueue(socket, payload, matchmakingQueues);
    });

    // Leave matchmaking queue
    socket.on('matchmaking:leave-queue', async (payload: QueueLeavePayload) => {
      await handleLeaveQueue(socket, payload, matchmakingQueues);
    });

    // Cancel match search
    socket.on('matchmaking:cancel', async () => {
      await handleCancelMatchmaking(socket, matchmakingQueues);
    });

    // Accept match
    socket.on('matchmaking:accept', async (payload: { matchId: string }) => {
      await handleMatchAccept(socket, payload);
    });

    // Decline match
    socket.on('matchmaking:decline', async (payload: { matchId: string }) => {
      await handleMatchDecline(socket, payload);
    });

    // Request queue status
    socket.on('matchmaking:queue-status', async () => {
      await handleQueueStatus(socket, matchmakingQueues);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      handleMatchmakingDisconnection(socket, reason, matchmakingQueues);
    });
  });

  // Start matchmaking process loop
  setInterval(() => {
    processMatchmaking(io, matchmakingQueues);
  }, 2000); // Run every 2 seconds
}

async function handleJoinQueue(
  socket: Socket, 
  payload: QueueJoinPayload, 
  queues: Map<string, MatchRequest[]>
) {
  const socketData = socket.data as MatchmakingSocketData;
  
  try {
    const { gameType, betAmount, maxWaitTime = 300 } = payload; // Default 5 min wait

    // Validate bet amount
    if (betAmount < 0.01 || betAmount > 10) {
      socket.emit('matchmaking:error', { message: 'Invalid bet amount' });
      return;
    }

    // Check if player is already in a queue
    if (socketData.isInQueue) {
      socket.emit('matchmaking:error', { message: 'Already in matchmaking queue' });
      return;
    }

    // Check if player is already in an active game
    const activeGame = await prisma.game.findFirst({
      where: {
        OR: [
          { player1Id: socketData.playerId },
          { player2Id: socketData.playerId },
        ],
        status: {
          in: [GameStatus.WAITING, GameStatus.STARTING, GameStatus.ACTIVE, GameStatus.PAUSED],
        },
      },
    });

    if (activeGame) {
      socket.emit('matchmaking:error', { 
        message: 'You are already in an active game',
        gameId: activeGame.gameId 
      });
      return;
    }

    // Get player's skill rating for matchmaking
    const player = await prisma.player.findUnique({
      where: { id: socketData.playerId },
      select: { winRate: true, gamesPlayed: true },
    });

    const skill = calculateSkillRating(player?.winRate || 0, player?.gamesPlayed || 0);

    // Add to queue
    const queueKey = `${gameType}_${betAmount}`;
    if (!queues.has(queueKey)) {
      queues.set(queueKey, []);
    }

    const matchRequest: MatchRequest = {
      playerId: socketData.playerId,
      gameType,
      betAmount,
      queuedAt: Date.now(),
      maxWaitTime: maxWaitTime * 1000,
      socketId: socket.id,
      skill,
    };

    queues.get(queueKey)!.push(matchRequest);
    socketData.isInQueue = true;
    socketData.queuedAt = Date.now();

    // Store in Redis for persistence
    await redisManager.hSet(
      'matchmaking:players',
      socketData.playerId,
      JSON.stringify({
        ...matchRequest,
        queueKey,
      })
    );

    socket.emit('matchmaking:queue-joined', {
      gameType,
      betAmount,
      estimatedWaitTime: await estimateWaitTime(queueKey, queues),
      position: queues.get(queueKey)!.length,
    });

    logger.info('Player joined matchmaking queue', {
      playerId: socketData.playerId,
      gameType,
      betAmount,
      queueKey,
      skill,
    });

    metricsUtils.recordWebSocketMessage('matchmaking:join-queue', 'in');

  } catch (error) {
    logger.error('Failed to join matchmaking queue:', error);
    socket.emit('matchmaking:error', { 
      message: 'Failed to join queue',
      error: (error as Error).message 
    });
  }
}

async function handleLeaveQueue(
  socket: Socket, 
  payload: QueueLeavePayload, 
  queues: Map<string, MatchRequest[]>
) {
  const socketData = socket.data as MatchmakingSocketData;
  
  try {
    if (!socketData.isInQueue) {
      socket.emit('matchmaking:error', { message: 'Not in matchmaking queue' });
      return;
    }

    // Remove from all queues
    for (const [queueKey, queue] of queues.entries()) {
      const index = queue.findIndex(req => req.playerId === socketData.playerId);
      if (index !== -1) {
        queue.splice(index, 1);
        break;
      }
    }

    // Remove from Redis
    await redisManager.hDel('matchmaking:players', socketData.playerId);

    socketData.isInQueue = false;
    socketData.queuedAt = undefined;

    socket.emit('matchmaking:queue-left');

    logger.info('Player left matchmaking queue', {
      playerId: socketData.playerId,
    });

    metricsUtils.recordWebSocketMessage('matchmaking:leave-queue', 'in');

  } catch (error) {
    logger.error('Failed to leave matchmaking queue:', error);
    socket.emit('matchmaking:error', { 
      message: 'Failed to leave queue',
      error: (error as Error).message 
    });
  }
}

async function handleCancelMatchmaking(
  socket: Socket, 
  queues: Map<string, MatchRequest[]>
) {
  await handleLeaveQueue(socket, {}, queues);
}

async function handleMatchAccept(socket: Socket, payload: { matchId: string }) {
  const socketData = socket.data as MatchmakingSocketData;
  
  try {
    const { matchId } = payload;
    
    // Check if match still exists and is waiting for acceptance
    const matchData = await redisManager.hGet('matchmaking:matches', matchId);
    if (!matchData) {
      socket.emit('matchmaking:error', { message: 'Match not found or expired' });
      return;
    }

    const match = JSON.parse(matchData);
    
    if (!match.players.includes(socketData.playerId)) {
      socket.emit('matchmaking:error', { message: 'You are not part of this match' });
      return;
    }

    // Mark player as accepted
    const acceptanceKey = `match:${matchId}:acceptances`;
    await redisManager.hSet(acceptanceKey, socketData.playerId, 'accepted');

    // Check if all players have accepted
    const acceptances = await redisManager.hGetAll(acceptanceKey);
    const allAccepted = match.players.every((playerId: string) => acceptances[playerId] === 'accepted');

    if (allAccepted) {
      // Create the game
      const gameId = await gameLogicService.createGame(
        match.players[0],
        match.players[1],
        match.gameType,
        match.betAmount
      );

      // Notify all players
      for (const playerId of match.players) {
        const playerSocket = await getPlayerSocket(playerId);
        if (playerSocket) {
          playerSocket.emit('matchmaking:game-ready', {
            matchId,
            gameId,
            gameType: match.gameType,
            betAmount: match.betAmount,
            opponent: match.players.find((id: string) => id !== playerId),
          });
        }
      }

      // Clean up match data
      await redisManager.hDel('matchmaking:matches', matchId);
      await redisManager.del(acceptanceKey);

    } else {
      socket.emit('matchmaking:waiting-for-acceptance', {
        matchId,
        acceptedPlayers: Object.keys(acceptances).length,
        totalPlayers: match.players.length,
      });
    }

    metricsUtils.recordWebSocketMessage('matchmaking:accept', 'in');

  } catch (error) {
    logger.error('Failed to accept match:', error);
    socket.emit('matchmaking:error', { 
      message: 'Failed to accept match',
      error: (error as Error).message 
    });
  }
}

async function handleMatchDecline(socket: Socket, payload: { matchId: string }) {
  const socketData = socket.data as MatchmakingSocketData;
  
  try {
    const { matchId } = payload;
    
    // Cancel the match for all players
    const matchData = await redisManager.hGet('matchmaking:matches', matchId);
    if (matchData) {
      const match = JSON.parse(matchData);
      
      // Notify all players that match was declined
      for (const playerId of match.players) {
        const playerSocket = await getPlayerSocket(playerId);
        if (playerSocket) {
          playerSocket.emit('matchmaking:match-cancelled', {
            matchId,
            reason: 'Player declined',
          });
        }
      }

      // Clean up match data
      await redisManager.hDel('matchmaking:matches', matchId);
      await redisManager.del(`match:${matchId}:acceptances`);
    }

    metricsUtils.recordWebSocketMessage('matchmaking:decline', 'in');

  } catch (error) {
    logger.error('Failed to decline match:', error);
    socket.emit('matchmaking:error', { 
      message: 'Failed to decline match',
      error: (error as Error).message 
    });
  }
}

async function handleQueueStatus(socket: Socket, queues: Map<string, MatchRequest[]>) {
  const socketData = socket.data as MatchmakingSocketData;
  
  try {
    if (!socketData.isInQueue) {
      socket.emit('matchmaking:queue-status', { inQueue: false });
      return;
    }

    // Find player's queue
    let queueInfo = null;
    for (const [queueKey, queue] of queues.entries()) {
      const index = queue.findIndex(req => req.playerId === socketData.playerId);
      if (index !== -1) {
        const [gameType, betAmount] = queueKey.split('_');
        queueInfo = {
          gameType,
          betAmount: parseFloat(betAmount),
          position: index + 1,
          queueSize: queue.length,
          waitTime: Date.now() - socketData.queuedAt!,
          estimatedWaitTime: await estimateWaitTime(queueKey, queues),
        };
        break;
      }
    }

    socket.emit('matchmaking:queue-status', {
      inQueue: true,
      ...queueInfo,
    });

  } catch (error) {
    logger.error('Failed to get queue status:', error);
    socket.emit('matchmaking:error', { 
      message: 'Failed to get queue status',
      error: (error as Error).message 
    });
  }
}

function handleMatchmakingDisconnection(
  socket: Socket, 
  reason: string, 
  queues: Map<string, MatchRequest[]>
) {
  const socketData = socket.data as MatchmakingSocketData;
  
  logger.info('Player disconnected from matchmaking', {
    socketId: socket.id,
    playerId: socketData.playerId,
    reason,
    wasInQueue: socketData.isInQueue,
  });

  // Remove from queues if in queue
  if (socketData.isInQueue) {
    handleLeaveQueue(socket, {}, queues).catch(error => {
      logger.error('Error removing disconnected player from queue:', error);
    });
  }
}

async function processMatchmaking(io: SocketIOServer, queues: Map<string, MatchRequest[]>) {
  try {
    for (const [queueKey, queue] of queues.entries()) {
      if (queue.length < 2) continue;

      // Remove expired requests
      const now = Date.now();
      for (let i = queue.length - 1; i >= 0; i--) {
        if (now - queue[i].queuedAt > queue[i].maxWaitTime) {
          const expiredRequest = queue.splice(i, 1)[0];
          const playerSocket = await getPlayerSocket(expiredRequest.playerId);
          if (playerSocket) {
            playerSocket.emit('matchmaking:timeout');
          }
        }
      }

      // Sort by wait time (longest waiting first) and skill
      queue.sort((a, b) => {
        const waitTimeDiff = (now - a.queuedAt) - (now - b.queuedAt);
        if (Math.abs(waitTimeDiff) < 30000) { // If wait times are similar (within 30s)
          return Math.abs(a.skill! - 50) - Math.abs(b.skill! - 50); // Prefer balanced matches
        }
        return waitTimeDiff;
      });

      // Try to match players
      while (queue.length >= 2) {
        const player1 = queue.shift()!;
        let bestMatch: MatchRequest | null = null;
        let bestMatchIndex = -1;

        // Find best match based on skill and wait time
        for (let i = 0; i < Math.min(queue.length, 5); i++) { // Check up to 5 candidates
          const candidate = queue[i];
          if (isGoodMatch(player1, candidate)) {
            bestMatch = candidate;
            bestMatchIndex = i;
            break;
          }
        }

        if (bestMatch) {
          queue.splice(bestMatchIndex, 1);
          await createMatch(io, player1, bestMatch);
        } else {
          // Put player back in queue if no good match found
          queue.unshift(player1);
          break;
        }
      }
    }
  } catch (error) {
    logger.error('Error processing matchmaking:', error);
  }
}

function isGoodMatch(player1: MatchRequest, player2: MatchRequest): boolean {
  // Skill difference threshold (adjust based on wait time)
  const waitTime = Math.max(
    Date.now() - player1.queuedAt,
    Date.now() - player2.queuedAt
  );
  
  let maxSkillDiff = 20; // Base skill difference
  if (waitTime > 60000) maxSkillDiff = 30; // 1 minute wait
  if (waitTime > 120000) maxSkillDiff = 40; // 2 minutes wait
  if (waitTime > 300000) maxSkillDiff = 100; // 5 minutes wait - match anyone

  const skillDiff = Math.abs(player1.skill! - player2.skill!);
  return skillDiff <= maxSkillDiff;
}

async function createMatch(io: SocketIOServer, player1: MatchRequest, player2: MatchRequest) {
  try {
    const matchId = nanoid(10);
    const match = {
      id: matchId,
      players: [player1.playerId, player2.playerId],
      gameType: player1.gameType,
      betAmount: player1.betAmount,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30000, // 30 seconds to accept
    };

    // Store match in Redis
    await redisManager.hSet(
      'matchmaking:matches',
      matchId,
      JSON.stringify(match)
    );
    // Set expiry separately
    await redisManager.expire(`matchmaking:matches`, 30);

    // Notify players
    const player1Socket = await getPlayerSocket(player1.playerId);
    const player2Socket = await getPlayerSocket(player2.playerId);

    if (player1Socket) {
      player1Socket.emit('matchmaking:match-found', {
        matchId,
        opponent: player2.playerId,
        gameType: match.gameType,
        betAmount: match.betAmount,
        acceptDeadline: match.expiresAt,
      });
    }

    if (player2Socket) {
      player2Socket.emit('matchmaking:match-found', {
        matchId,
        opponent: player1.playerId,
        gameType: match.gameType,
        betAmount: match.betAmount,
        acceptDeadline: match.expiresAt,
      });
    }

    logger.info('Match created', {
      matchId,
      player1: player1.playerId,
      player2: player2.playerId,
      gameType: match.gameType,
      betAmount: match.betAmount,
    });

    // Clean up Redis
    await Promise.all([
      redisManager.hDel('matchmaking:players', player1.playerId),
      redisManager.hDel('matchmaking:players', player2.playerId),
    ]);

  } catch (error) {
    logger.error('Failed to create match:', error);
  }
}

// Helper functions
function calculateSkillRating(winRate: number, gamesPlayed: number): number {
  if (gamesPlayed === 0) return 50; // Default rating
  
  // Simple skill calculation based on win rate and experience
  const baseRating = winRate * 100;
  const experienceBonus = Math.min(gamesPlayed / 10, 5); // Up to 5 points for experience
  
  return Math.max(0, Math.min(100, baseRating + experienceBonus));
}

async function estimateWaitTime(queueKey: string, queues: Map<string, MatchRequest[]>): Promise<number> {
  const queue = queues.get(queueKey);
  if (!queue || queue.length === 0) return 0;
  
  // Simple estimation based on queue size
  const queueSize = queue.length;
  const baseWaitTime = 30; // 30 seconds base
  
  return baseWaitTime * Math.ceil(queueSize / 2); // Estimate based on pairing
}

async function getPlayerSocket(playerId: string): Promise<Socket | null> {
  // This would need access to the Socket.IO server instance to find connected sockets
  // For now, return null as placeholder
  return null;
}