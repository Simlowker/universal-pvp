import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { LeaderboardQuery } from '@/types/api.types';

export class LeaderboardService {

  async getLeaderboard(query: LeaderboardQuery, sortBy: string = 'rating', order: string = 'desc') {
    try {
      // Try cache first
      const cacheKey = `leaderboard:${JSON.stringify(query)}:${sortBy}:${order}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const whereClause: any = {};
      let orderByClause: any = {};

      // Set up ordering
      switch (sortBy) {
        case 'rating':
          orderByClause = { rating: order };
          break;
        case 'winRate':
          orderByClause = { winRate: order };
          break;
        case 'netPnL':
          orderByClause = { netPnL: order };
          break;
        case 'totalEarnings':
          orderByClause = { totalEarnings: order };
          break;
        case 'gamesPlayed':
          orderByClause = { gamesPlayed: order };
          break;
        default:
          orderByClause = { rating: 'desc' };
      }

      const [players, total] = await Promise.all([
        prisma.player.findMany({
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
          orderBy: orderByClause,
          take: query.limit || 50,
          skip: query.offset || 0
        }),
        prisma.player.count({ where: whereClause })
      ]);

      const entries = players.map((player, index) => ({
        rank: (query.offset || 0) + index + 1,
        playerId: player.id,
        username: player.username,
        rating: player.rating,
        gamesPlayed: player.gamesPlayed,
        winRate: player.winRate,
        netPnL: Number(player.netPnL),
        totalEarnings: Number(player.totalEarnings)
      }));

      const result = {
        entries,
        total,
        lastUpdated: new Date().toISOString()
      };

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(result));

      return result;

    } catch (error) {
      logger.error('Failed to get leaderboard:', error);
      throw error;
    }
  }

  async getTopPlayers(count: number = 10, gameType?: any) {
    try {
      const cacheKey = `top_players:${count}:${gameType || 'all'}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const players = await prisma.player.findMany({
        select: {
          id: true,
          username: true,
          rating: true,
          gamesPlayed: true,
          winRate: true
        },
        orderBy: { rating: 'desc' },
        take: count
      });

      // Cache for 10 minutes
      await redis.setex(cacheKey, 600, JSON.stringify(players));

      return players;

    } catch (error) {
      logger.error('Failed to get top players:', error);
      throw error;
    }
  }

  async getPlayerRank(playerId: string, gameType?: any, period: string = 'all') {
    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { rating: true, username: true }
      });

      if (!player) {
        return null;
      }

      // Count players with higher rating
      const rank = await prisma.player.count({
        where: {
          rating: { gt: player.rating }
        }
      }) + 1;

      const total = await prisma.player.count();

      return {
        rank,
        rating: player.rating,
        totalPlayers: total,
        percentile: Math.round(((total - rank) / total) * 100)
      };

    } catch (error) {
      logger.error('Failed to get player rank:', error);
      throw error;
    }
  }

  async getNearbyPlayers(playerId: string, range: number = 5, gameType?: any, period: string = 'all') {
    try {
      const playerRank = await this.getPlayerRank(playerId, gameType, period);
      
      if (!playerRank) {
        return { players: [], playerRank: null, totalPlayers: 0 };
      }

      const startRank = Math.max(1, playerRank.rank - range);
      const endRank = playerRank.rank + range;

      const players = await prisma.player.findMany({
        select: {
          id: true,
          username: true,
          rating: true,
          gamesPlayed: true,
          winRate: true
        },
        orderBy: { rating: 'desc' },
        skip: startRank - 1,
        take: endRank - startRank + 1
      });

      const playersWithRank = players.map((player, index) => ({
        ...player,
        rank: startRank + index,
        isCurrentPlayer: player.id === playerId
      }));

      return {
        players: playersWithRank,
        playerRank: playerRank.rank,
        totalPlayers: playerRank.totalPlayers
      };

    } catch (error) {
      logger.error('Failed to get nearby players:', error);
      throw error;
    }
  }

  async getSeasonalLeaderboard(season: string = 'current', limit: number = 50, offset: number = 0) {
    // Mock implementation - would require seasonal tracking
    return {
      entries: [],
      total: 0,
      season,
      seasonInfo: {
        name: 'Season 1',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      }
    };
  }

  async getTournamentLeaderboard(tournamentId?: string, status: string = 'active', limit: number = 50, offset: number = 0) {
    // Mock implementation - would require tournament system
    return {
      entries: [],
      total: 0,
      tournament: tournamentId ? {
        id: tournamentId,
        name: 'Tournament',
        status,
        startDate: new Date().toISOString()
      } : null
    };
  }

  async getLeaderboardStats(period: string = 'all') {
    try {
      const cacheKey = `leaderboard_stats:${period}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const [
        totalPlayers,
        activePlayers,
        avgRating,
        topRating,
        totalGames
      ] = await Promise.all([
        prisma.player.count(),
        prisma.player.count({
          where: {
            lastActiveAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          }
        }),
        prisma.player.aggregate({
          _avg: { rating: true }
        }),
        prisma.player.findFirst({
          select: { rating: true },
          orderBy: { rating: 'desc' }
        }),
        prisma.game.count({
          where: { status: 'COMPLETED' }
        })
      ]);

      const stats = {
        totalPlayers,
        activePlayers,
        averageRating: Math.round(avgRating._avg.rating || 0),
        topRating: topRating?.rating || 0,
        totalGames,
        period
      };

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(stats));

      return stats;

    } catch (error) {
      logger.error('Failed to get leaderboard stats:', error);
      throw error;
    }
  }
}

export const leaderboardService = new LeaderboardService();