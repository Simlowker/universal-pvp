import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { nanoid } from 'nanoid';
import { 
  JoinQueueRequest,
  QueueStatus,
  LeaderboardQuery,
  NotFoundError,
  ConflictError,
  ValidationError 
} from '@/types/api.types';
import { GameType } from '@prisma/client';
import { gameService } from '@/services/game.service';

interface QueueEntry {
  playerId: string;
  gameType: GameType;
  betAmount: number;
  preferredOpponentRating?: number;
  maxRatingDifference?: number;
  queuedAt: Date;
  queueId: string;
}

interface Challenge {
  id: string;
  challengerId: string;
  targetPlayerId: string;
  gameType: GameType;
  betAmount: number;
  message?: string;
  expiresAt: Date;
  status: 'sent' | 'accepted' | 'declined' | 'expired';
  createdAt: Date;
}

export class MatchmakingService {
  
  async joinQueue(playerId: string, request: JoinQueueRequest) {
    try {
      // Validate player exists
      const player = await prisma.player.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        throw new NotFoundError('Player');
      }

      // Check if player is already in queue
      const existingQueue = await redis.get(`queue:${playerId}`);
      if (existingQueue) {
        throw new ConflictError('Player is already in matchmaking queue');
      }

      // Check if player is in an active game
      const activeGame = await prisma.game.findFirst({
        where: {
          OR: [
            { player1Id: playerId },
            { player2Id: playerId }
          ],
          status: { in: ['WAITING', 'STARTING', 'ACTIVE', 'PAUSED'] }
        }
      });

      if (activeGame) {
        throw new ConflictError('Player is already in an active game');
      }

      const queueId = nanoid(12);
      const queueEntry: QueueEntry = {
        playerId,
        gameType: request.gameType,
        betAmount: request.betAmount,
        preferredOpponentRating: request.preferredOpponentRating,
        maxRatingDifference: request.maxRatingDifference || 200,
        queuedAt: new Date(),
        queueId
      };

      // Add to Redis queue
      const queueKey = `matchmaking:${request.gameType}:${request.betAmount}`;
      await redis.zadd(queueKey, Date.now(), JSON.stringify(queueEntry));
      await redis.setex(`queue:${playerId}`, 3600, queueId); // 1 hour TTL

      // Get queue position
      const position = await redis.zrank(queueKey, JSON.stringify(queueEntry));

      // Estimate wait time based on queue size and historical data
      const queueSize = await redis.zcard(queueKey);
      const estimatedWaitTime = this.estimateWaitTime(queueSize, request.gameType);

      // Try immediate matching
      setTimeout(() => this.tryMatchmaking(request.gameType, request.betAmount), 1000);

      logger.info(`Player ${playerId} joined matchmaking queue`, {
        gameType: request.gameType,
        betAmount: request.betAmount,
        queuePosition: position,
        queueSize
      });

      return {
        queueId,
        position: position || 0,
        estimatedWaitTime
      };

    } catch (error) {
      logger.error('Failed to join matchmaking queue:', error);
      throw error;
    }
  }

  async leaveQueue(playerId: string) {
    try {
      const queueId = await redis.get(`queue:${playerId}`);
      
      if (!queueId) {
        throw new NotFoundError('Player not in queue');
      }

      // Find and remove from all possible queues
      const gameTypes = ['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE'];
      const betAmounts = [0.01, 0.1, 1, 5, 10]; // Common bet amounts
      
      let removed = false;
      for (const gameType of gameTypes) {
        for (const betAmount of betAmounts) {
          const queueKey = `matchmaking:${gameType}:${betAmount}`;
          const entries = await redis.zrange(queueKey, 0, -1);
          
          for (const entry of entries) {
            const queueEntry: QueueEntry = JSON.parse(entry);
            if (queueEntry.playerId === playerId) {
              await redis.zrem(queueKey, entry);
              removed = true;
              break;
            }
          }
          if (removed) break;
        }
        if (removed) break;
      }

      // Remove from player queue tracking
      await redis.del(`queue:${playerId}`);

      logger.info(`Player ${playerId} left matchmaking queue`);

      return {
        refundAmount: 0 // No refund needed as no escrow was created
      };

    } catch (error) {
      logger.error('Failed to leave matchmaking queue:', error);
      throw error;
    }
  }

  async getQueueStatus(playerId: string): Promise<QueueStatus> {
    try {
      const queueId = await redis.get(`queue:${playerId}`);
      
      if (!queueId) {
        return { inQueue: false };
      }

      // Find queue entry
      const gameTypes = ['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE'];
      const betAmounts = [0.01, 0.1, 1, 5, 10];
      
      for (const gameType of gameTypes) {
        for (const betAmount of betAmounts) {
          const queueKey = `matchmaking:${gameType}:${betAmount}`;
          const entries = await redis.zrange(queueKey, 0, -1);
          
          for (const [index, entry] of entries.entries()) {
            const queueEntry: QueueEntry = JSON.parse(entry);
            if (queueEntry.playerId === playerId) {
              const estimatedWaitTime = this.estimateWaitTime(entries.length, gameType as GameType);
              
              return {
                inQueue: true,
                queuedAt: queueEntry.queuedAt.toISOString(),
                estimatedWaitTime,
                queuePosition: index + 1
              };
            }
          }
        }
      }

      // Player has queue ID but not found in any queue (cleanup case)
      await redis.del(`queue:${playerId}`);
      return { inQueue: false };

    } catch (error) {
      logger.error('Failed to get queue status:', error);
      throw error;
    }
  }

  async getQueueStats(gameType?: GameType, betRange?: string) {
    try {
      const stats: any = {
        totalQueued: 0,
        byGameType: {},
        byBetRange: {},
        averageWaitTime: 0
      };

      const gameTypes = gameType ? [gameType] : ['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE'];
      const betAmounts = [0.01, 0.1, 1, 5, 10];

      for (const gt of gameTypes) {
        stats.byGameType[gt] = 0;
        
        for (const betAmount of betAmounts) {
          const queueKey = `matchmaking:${gt}:${betAmount}`;
          const queueSize = await redis.zcard(queueKey);
          
          stats.totalQueued += queueSize;
          stats.byGameType[gt] += queueSize;
          
          // Group by bet ranges
          const range = this.getBetRange(betAmount);
          stats.byBetRange[range] = (stats.byBetRange[range] || 0) + queueSize;
        }
      }

      // Calculate average wait time (simplified)
      stats.averageWaitTime = this.estimateWaitTime(stats.totalQueued, gameTypes[0] as GameType);

      return stats;

    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  async createChallenge(
    challengerId: string, 
    targetPlayerId: string, 
    options: { gameType: GameType; betAmount: number; message?: string; expiresIn?: number }
  ) {
    try {
      // Validate both players exist
      const [challenger, target] = await Promise.all([
        prisma.player.findUnique({ where: { id: challengerId } }),
        prisma.player.findUnique({ where: { id: targetPlayerId } })
      ]);

      if (!challenger) {
        throw new NotFoundError('Challenger');
      }
      if (!target) {
        throw new NotFoundError('Target player');
      }

      if (challengerId === targetPlayerId) {
        throw new ValidationError('Cannot challenge yourself');
      }

      // Check for existing challenges
      const existingChallenge = await redis.get(`challenge:${challengerId}:${targetPlayerId}`);
      if (existingChallenge) {
        throw new ConflictError('Challenge already exists');
      }

      const challengeId = nanoid(12);
      const expiresAt = new Date(Date.now() + (options.expiresIn || 300) * 1000); // Default 5 minutes

      const challenge: Challenge = {
        id: challengeId,
        challengerId,
        targetPlayerId,
        gameType: options.gameType,
        betAmount: options.betAmount,
        message: options.message,
        expiresAt,
        status: 'sent',
        createdAt: new Date()
      };

      // Store challenge
      await redis.setex(
        `challenge:${challengeId}`, 
        options.expiresIn || 300,
        JSON.stringify(challenge)
      );

      // Track for both players
      await redis.setex(`challenge:${challengerId}:${targetPlayerId}`, options.expiresIn || 300, challengeId);
      await redis.lpush(`challenges:sent:${challengerId}`, challengeId);
      await redis.lpush(`challenges:received:${targetPlayerId}`, challengeId);

      logger.info(`Challenge created from ${challengerId} to ${targetPlayerId}`, {
        challengeId,
        gameType: options.gameType,
        betAmount: options.betAmount
      });

      return { ...challenge, expiresAt };

    } catch (error) {
      logger.error('Failed to create challenge:', error);
      throw error;
    }
  }

  async acceptChallenge(challengeId: string, playerId: string) {
    try {
      const challengeData = await redis.get(`challenge:${challengeId}`);
      
      if (!challengeData) {
        throw new NotFoundError('Challenge not found or expired');
      }

      const challenge: Challenge = JSON.parse(challengeData);

      if (challenge.targetPlayerId !== playerId) {
        throw new ValidationError('Not authorized to accept this challenge');
      }

      if (challenge.status !== 'sent') {
        throw new ConflictError('Challenge is no longer available');
      }

      if (new Date() > challenge.expiresAt) {
        throw new ConflictError('Challenge has expired');
      }

      // Create game
      const game = await gameService.createGame(challenge.challengerId, {
        gameType: challenge.gameType,
        betAmount: challenge.betAmount,
        isPrivate: true
      });

      // Join the challenger to the game
      await gameService.joinGame(playerId, {
        gameId: game.gameId
      });

      // Update challenge status
      challenge.status = 'accepted';
      await redis.setex(`challenge:${challengeId}`, 60, JSON.stringify(challenge));

      // Clean up challenge tracking
      await redis.del(`challenge:${challenge.challengerId}:${challenge.targetPlayerId}`);

      logger.info(`Challenge ${challengeId} accepted by ${playerId}`);

      return {
        gameId: game.gameId
      };

    } catch (error) {
      logger.error('Failed to accept challenge:', error);
      throw error;
    }
  }

  async declineChallenge(challengeId: string, playerId: string, reason?: string) {
    try {
      const challengeData = await redis.get(`challenge:${challengeId}`);
      
      if (!challengeData) {
        throw new NotFoundError('Challenge not found or expired');
      }

      const challenge: Challenge = JSON.parse(challengeData);

      if (challenge.targetPlayerId !== playerId) {
        throw new ValidationError('Not authorized to decline this challenge');
      }

      // Update challenge status
      challenge.status = 'declined';
      await redis.setex(`challenge:${challengeId}`, 300, JSON.stringify({ ...challenge, declineReason: reason }));

      // Clean up challenge tracking
      await redis.del(`challenge:${challenge.challengerId}:${challenge.targetPlayerId}`);

      logger.info(`Challenge ${challengeId} declined by ${playerId}`, { reason });

    } catch (error) {
      logger.error('Failed to decline challenge:', error);
      throw error;
    }
  }

  async getChallenges(playerId: string, filters: any) {
    try {
      const challenges: Challenge[] = [];

      // Get sent challenges
      if (!filters.type || filters.type === 'sent') {
        const sentIds = await redis.lrange(`challenges:sent:${playerId}`, 0, filters.limit || 20);
        for (const id of sentIds) {
          const challengeData = await redis.get(`challenge:${id}`);
          if (challengeData) {
            const challenge: Challenge = JSON.parse(challengeData);
            if (!filters.status || challenge.status === filters.status) {
              challenges.push({ ...challenge, type: 'sent' as any });
            }
          }
        }
      }

      // Get received challenges
      if (!filters.type || filters.type === 'received') {
        const receivedIds = await redis.lrange(`challenges:received:${playerId}`, 0, filters.limit || 20);
        for (const id of receivedIds) {
          const challengeData = await redis.get(`challenge:${id}`);
          if (challengeData) {
            const challenge: Challenge = JSON.parse(challengeData);
            if (!filters.status || challenge.status === filters.status) {
              challenges.push({ ...challenge, type: 'received' as any });
            }
          }
        }
      }

      // Sort by creation date
      challenges.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return challenges.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 20));

    } catch (error) {
      logger.error('Failed to get challenges:', error);
      throw error;
    }
  }

  async getLeaderboard(filters: LeaderboardQuery) {
    try {
      const whereClause: any = {};

      // Apply game type filter
      if (filters.gameType) {
        // This would require tracking game stats per game type
        // For now, we'll use overall stats
      }

      // Get players with stats
      const players = await prisma.player.findMany({
        where: whereClause,
        select: {
          id: true,
          username: true,
          rating: true,
          gamesPlayed: true,
          gamesWon: true,
          winRate: true,
          netPnL: true,
          totalEarnings: true
        },
        orderBy: { rating: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0
      });

      return players.map((player, index) => ({
        rank: (filters.offset || 0) + index + 1,
        playerId: player.id,
        username: player.username,
        rating: player.rating,
        gamesPlayed: player.gamesPlayed,
        winRate: player.winRate,
        netPnL: Number(player.netPnL),
        totalEarnings: Number(player.totalEarnings)
      }));

    } catch (error) {
      logger.error('Failed to get leaderboard:', error);
      throw error;
    }
  }

  // Private helper methods
  private estimateWaitTime(queueSize: number, gameType: GameType): number {
    // Base wait time estimation (in seconds)
    const baseWaitTime = {
      'QUICK_MATCH': 30,
      'RANKED_MATCH': 60,
      'TOURNAMENT': 120,
      'PRACTICE': 15
    };

    const base = baseWaitTime[gameType] || 60;
    
    // Increase wait time based on queue size
    const multiplier = Math.min(1 + (queueSize / 10), 5); // Max 5x multiplier
    
    return Math.round(base * multiplier);
  }

  private getBetRange(betAmount: number): string {
    if (betAmount <= 0.1) return 'micro';
    if (betAmount <= 1) return 'low';
    if (betAmount <= 5) return 'medium';
    return 'high';
  }

  // Background matchmaking process
  private async tryMatchmaking(gameType: GameType, betAmount: number) {
    try {
      const queueKey = `matchmaking:${gameType}:${betAmount}`;
      const entries = await redis.zrange(queueKey, 0, -1);

      if (entries.length < 2) {
        return; // Need at least 2 players
      }

      // Parse entries
      const queueEntries: QueueEntry[] = entries.map(entry => JSON.parse(entry));

      // Find compatible matches
      for (let i = 0; i < queueEntries.length - 1; i++) {
        const player1 = queueEntries[i];
        
        for (let j = i + 1; j < queueEntries.length; j++) {
          const player2 = queueEntries[j];

          if (this.arePlayersCompatible(player1, player2)) {
            await this.createMatch(player1, player2, gameType, betAmount);
            
            // Remove both players from queue
            await redis.zrem(queueKey, entries[i]);
            await redis.zrem(queueKey, entries[j]);
            await redis.del(`queue:${player1.playerId}`);
            await redis.del(`queue:${player2.playerId}`);

            logger.info('Match created via matchmaking', {
              player1Id: player1.playerId,
              player2Id: player2.playerId,
              gameType,
              betAmount
            });

            return; // Only create one match per call
          }
        }
      }
    } catch (error) {
      logger.error('Matchmaking process failed:', error);
    }
  }

  private arePlayersCompatible(player1: QueueEntry, player2: QueueEntry): boolean {
    // Same game type and bet amount
    if (player1.gameType !== player2.gameType || player1.betAmount !== player2.betAmount) {
      return false;
    }

    // Rating compatibility (if specified)
    if (player1.maxRatingDifference && player2.maxRatingDifference) {
      // Would need to fetch player ratings from database
      // For now, assume compatible
    }

    return true;
  }

  private async createMatch(player1: QueueEntry, player2: QueueEntry, gameType: GameType, betAmount: number) {
    try {
      // Create game
      const game = await gameService.createGame(player1.playerId, {
        gameType,
        betAmount,
        isPrivate: false
      });

      // Join second player
      await gameService.joinGame(player2.playerId, {
        gameId: game.gameId
      });

      logger.info('Matchmaking game created', {
        gameId: game.gameId,
        player1: player1.playerId,
        player2: player2.playerId
      });

    } catch (error) {
      logger.error('Failed to create matchmaking game:', error);
      throw error;
    }
  }
}

// Singleton instance
export const matchmakingService = new MatchmakingService();