// import type { Player } from '@prisma/client';
import { BaseRepository } from './base.repository';

export type PlayerWithStats = any & {
  _count?: {
    gamesAsPlayer1: number;
    gamesAsPlayer2: number;
    transactions: number;
  };
  recentGames?: any[];
  rankings?: {
    global: number;
    percentile: number;
  };
};

export class PlayerRepository extends BaseRepository<
  any,
  any,
  any,
  any
> {
  constructor() {
    super('player');
  }

  /**
   * Find player by wallet ID
   */
  async findByWallet(walletId: string): Promise<any | null> {
    return this.findOne({ walletId });
  }

  /**
   * Find player by username
   */
  async findByUsername(username: string): Promise<any | null> {
    return this.findOne({ username });
  }

  /**
   * Get player with comprehensive stats
   */
  async findWithStats(id: string): Promise<PlayerWithStats | null> {
    const player = await this.model.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            gamesAsPlayer1: true,
            gamesAsPlayer2: true,
            transactions: true,
          },
        },
        gamesAsPlayer1: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            player2: {
              select: { username: true, displayName: true, rating: true },
            },
          },
        },
        gamesAsPlayer2: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            player1: {
              select: { username: true, displayName: true, rating: true },
            },
          },
        },
      },
    });

    if (!player) return null;

    // Combine recent games
    const recentGames = [
      ...player.gamesAsPlayer1.map((game: any) => ({ ...game, playerRole: 'player1' })),
      ...player.gamesAsPlayer2.map((game: any) => ({ ...game, playerRole: 'player2' })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    // Calculate rankings (this would typically be cached)
    const totalPlayers = await this.count();
    const playersAbove = await this.count({
      rating: { gt: player.rating },
    });
    
    const rankings = {
      global: playersAbove + 1,
      percentile: Math.round(((totalPlayers - playersAbove) / totalPlayers) * 100),
    };

    return {
      ...player,
      recentGames,
      rankings,
    };
  }

  /**
   * Update player stats after game
   */
  async updateGameStats(
    playerId: string,
    gameResult: {
      isWin: boolean;
      pnlChange: number;
      ratingChange: number;
      gameTime: number;
    }
  ): Promise<any> {
    const { isWin, pnlChange, ratingChange, gameTime } = gameResult;

    return this.withTransaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { id: playerId },
      });

      if (!player) {
        throw new Error('Player not found');
      }

      // Update rating history
      const newRatingHistory = [
        ...((player.ratingHistory as any[]) || []),
        {
          timestamp: new Date(),
          oldRating: player.rating,
          newRating: player.rating + ratingChange,
          gameId: gameResult,
          change: ratingChange,
        },
      ].slice(-100); // Keep last 100 rating changes

      return tx.player.update({
        where: { id: playerId },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: isWin ? { increment: 1 } : undefined,
          gamesLost: !isWin ? { increment: 1 } : undefined,
          rating: { increment: ratingChange },
          peakRating: player.rating + ratingChange > player.peakRating 
            ? player.rating + ratingChange 
            : undefined,
          netPnL: { increment: pnlChange },
          dailyPnL: { increment: pnlChange },
          totalPlayTime: { increment: Math.floor(gameTime / 60) }, // Convert to minutes
          winRate: isWin 
            ? (player.gamesWon + 1) / (player.gamesPlayed + 1)
            : player.gamesWon / (player.gamesPlayed + 1),
          ratingHistory: newRatingHistory,
          lastActiveAt: new Date(),
        },
      });
    });
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    options: {
      orderBy?: 'rating' | 'netPnL' | 'winRate';
      timeframe?: 'daily' | 'weekly' | 'monthly' | 'allTime';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<PlayerWithStats[]> {
    const { orderBy = 'rating', limit = 50, offset = 0 } = options;

    let orderByClause: any = { rating: 'desc' };
    
    switch (orderBy) {
      case 'netPnL':
        orderByClause = { netPnL: 'desc' };
        break;
      case 'winRate':
        orderByClause = { winRate: 'desc' };
        break;
    }

    const players = await this.model.findMany({
      take: limit,
      skip: offset,
      where: {
        gamesPlayed: { gt: 0 }, // Only players who have played games
      },
      orderBy: orderByClause,
      include: {
        _count: {
          select: {
            gamesAsPlayer1: true,
            gamesAsPlayer2: true,
          },
        },
      },
    });

    return players.map((player: any, index: number) => ({
      ...player,
      rankings: {
        global: offset + index + 1,
        percentile: 0, // Would calculate based on total players
      },
    }));
  }

  /**
   * Search players by username or display name
   */
  async searchPlayers(query: string, limit: number = 20): Promise<any[]> {
    return this.model.findMany({
      where: {
        OR: [
          {
            username: {
              contains: query,
              mode: 'insensitive',
            },
          },
          {
            displayName: {
              contains: query,
              mode: 'insensitive',
            },
          },
        ],
      },
      take: limit,
      orderBy: [
        { rating: 'desc' },
        { gamesPlayed: 'desc' },
      ],
    });
  }

  /**
   * Reset daily PnL for all players (run by cron job)
   */
  async resetDailyPnL(): Promise<{ count: number }> {
    return this.updateMany({}, { dailyPnL: 0 });
  }

  /**
   * Get active players (played in last 24 hours)
   */
  async getActivePlayers(hours: number = 24): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.findMany({
      where: {
        lastActiveAt: {
          gte: since,
        },
      },
      orderBy: {
        lastActiveAt: 'desc',
      },
    });
  }

  /**
   * Ban or unban a player
   */
  async setBanStatus(playerId: string, _isBanned: boolean, _reason?: string): Promise<any> {
    return this.updateById(playerId, {
      // Assuming we add these fields to the schema
      // isBanned,
      // banReason: reason,
      // bannedAt: isBanned ? new Date() : null,
    } as any);
  }

  /**
   * Calculate ELO rating change
   */
  calculateEloChange(
    playerRating: number,
    opponentRating: number,
    isWin: boolean,
    kFactor: number = 32
  ): number {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const actualScore = isWin ? 1 : 0;
    return Math.round(kFactor * (actualScore - expectedScore));
  }

  /**
   * Update player streaks
   */
  async updateStreaks(): Promise<void> {
    // This would be called daily to update streak information
    const players = await this.findMany({
      where: {
        lastActiveAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    const updates = players.map(player => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const wasActiveYesterday = player.lastActiveAt && player.lastActiveAt >= yesterday;
      
      return {
        operation: 'update' as const,
        where: { id: player.id },
        data: {
          streakDays: wasActiveYesterday ? player.streakDays + 1 : 1,
          longestStreak: Math.max(
            player.longestStreak,
            wasActiveYesterday ? player.streakDays + 1 : 1
          ),
        },
      };
    });

    if (updates.length > 0) {
      await this.bulkOperation(updates);
    }
  }
}