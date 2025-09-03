import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { PlayerStats, GameHistoryQuery, PnLQuery, NotFoundError } from '@/types/api.types';

export class ProfileService {
  
  async getPlayerStats(playerId: string): Promise<PlayerStats> {
    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId }
      });

      if (!player) {
        throw new NotFoundError('Player');
      }

      return {
        playerId: player.id,
        gamesPlayed: player.gamesPlayed,
        gamesWon: player.gamesWon,
        gamesLost: player.gamesLost,
        winRate: player.winRate,
        rating: player.rating,
        peakRating: player.peakRating,
        totalEarnings: Number(player.totalEarnings),
        totalSpent: Number(player.totalSpent),
        netPnL: Number(player.netPnL),
        dailyPnL: Number(player.dailyPnL),
        weeklyPnL: Number(player.weeklyPnL),
        monthlyPnL: Number(player.monthlyPnL),
        streakDays: player.streakDays,
        longestStreak: player.longestStreak,
        lastActiveAt: player.lastActiveAt?.toISOString()
      };
    } catch (error) {
      logger.error('Failed to get player stats:', error);
      throw error;
    }
  }

  async getPublicPlayerStats(playerId: string): Promise<Partial<PlayerStats>> {
    const stats = await this.getPlayerStats(playerId);
    
    // Return only public stats
    return {
      playerId: stats.playerId,
      gamesPlayed: stats.gamesPlayed,
      gamesWon: stats.gamesWon,
      gamesLost: stats.gamesLost,
      winRate: stats.winRate,
      rating: stats.rating,
      peakRating: stats.peakRating,
      streakDays: stats.streakDays,
      longestStreak: stats.longestStreak
    };
  }

  async getGameHistory(playerId: string, query: GameHistoryQuery) {
    try {
      const whereClause: any = {
        OR: [
          { player1Id: playerId },
          { player2Id: playerId }
        ]
      };

      if (query.gameType) {
        whereClause.gameType = query.gameType;
      }

      if (query.status) {
        whereClause.status = query.status;
      }

      if (query.startDate || query.endDate) {
        whereClause.createdAt = {};
        if (query.startDate) {
          whereClause.createdAt.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          whereClause.createdAt.lte = new Date(query.endDate);
        }
      }

      const [games, total] = await Promise.all([
        prisma.game.findMany({
          where: whereClause,
          include: {
            player1: { select: { id: true, username: true } },
            player2: { select: { id: true, username: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: query.limit || 50,
          skip: query.offset || 0
        }),
        prisma.game.count({ where: whereClause })
      ]);

      const gameHistory = games.map(game => {
        const isPlayer1 = game.player1Id === playerId;
        const opponent = isPlayer1 ? game.player2 : game.player1;
        const isWinner = game.winnerId === playerId;
        
        return {
          id: game.id,
          gameId: game.gameId,
          gameType: game.gameType,
          status: game.status,
          betAmount: Number(game.betAmount),
          opponentId: opponent?.id || '',
          opponentUsername: opponent?.username,
          isWinner,
          winReason: game.winReason,
          pnlAmount: isWinner ? Number(game.betAmount) : -Number(game.betAmount),
          duration: game.startedAt && game.endedAt 
            ? Math.round((game.endedAt.getTime() - game.startedAt.getTime()) / 1000) 
            : undefined,
          createdAt: game.createdAt.toISOString(),
          endedAt: game.endedAt?.toISOString()
        };
      });

      // Calculate summary
      const summary = {
        totalGames: total,
        wins: gameHistory.filter(g => g.isWinner).length,
        losses: gameHistory.filter(g => !g.isWinner && g.status === 'COMPLETED').length,
        totalPnL: gameHistory.reduce((sum, g) => sum + g.pnlAmount, 0)
      };

      return { games: gameHistory, total, summary };

    } catch (error) {
      logger.error('Failed to get game history:', error);
      throw error;
    }
  }

  async getPnLData(playerId: string, query: PnLQuery) {
    // Implementation would depend on how PnL data is stored and aggregated
    // For now, return a simplified version
    return {
      period: query.period || 'all',
      totalGames: 0,
      winnings: 0,
      losses: 0,
      netPnL: 0,
      winRate: 0,
      avgWinAmount: 0,
      avgLossAmount: 0,
      bestStreak: 0,
      worstStreak: 0,
      gameBreakdown: []
    };
  }

  async updatePlayerProfile(playerId: string, updates: any) {
    try {
      const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });

      return updatedPlayer;
    } catch (error) {
      logger.error('Failed to update player profile:', error);
      throw error;
    }
  }

  async getPlayerProfile(playerId: string) {
    return await prisma.player.findUnique({
      where: { id: playerId }
    });
  }

  async getPlayerAchievements(playerId: string) {
    // Mock implementation - in real system would track achievements
    return [];
  }

  async getRatingHistory(playerId: string, period: string, gameType?: any) {
    const player = await prisma.player.findUnique({
      where: { id: playerId }
    });

    if (!player) {
      throw new NotFoundError('Player');
    }

    // Mock implementation - would track rating changes over time
    return {
      currentRating: player.rating,
      peakRating: player.peakRating,
      history: [] // Array of { timestamp, rating, change, gameId? }
    };
  }

  async createSession(playerId: string, options: any) {
    const session = await prisma.session.create({
      data: {
        playerId,
        sessionToken: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        expiresAt: new Date(Date.now() + (options.expiresIn || 86400) * 1000),
        permissions: options.permissions || []
      }
    });

    return session;
  }

  async getActiveSessions(playerId: string) {
    return await prisma.session.findMany({
      where: {
        playerId,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async revokeSession(playerId: string, sessionId: string) {
    await prisma.session.update({
      where: {
        id: sessionId,
        playerId // Ensure player can only revoke their own sessions
      },
      data: {
        isActive: false
      }
    });
  }
}

export const profileService = new ProfileService();