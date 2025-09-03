// import { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { Decimal } from 'decimal.js';

export type GameWithPlayers = any & {
  player1: {
    id: string;
    username?: string;
    displayName?: string;
    rating: number;
    avatarUrl?: string;
  };
  player2?: {
    id: string;
    username?: string;
    displayName?: string;
    rating: number;
    avatarUrl?: string;
  } | null;
  actions?: any[];
  proofs?: any[];
  _count?: {
    actions: number;
    proofs: number;
  };
};

export type GameStats = {
  totalGames: number;
  activeGames: number;
  completedToday: number;
  totalVolume: Decimal;
  averageGameDuration: number;
  topGameTypes: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
};

export class GameRepository extends BaseRepository<
  any,
  any,
  any,
  any
> {
  constructor() {
    super('game');
  }

  /**
   * Find game by public game ID
   */
  async findByGameId(gameId: string): Promise<GameWithPlayers | null> {
    return this.model.findUnique({
      where: { gameId },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            actions: true,
            proofs: true,
          },
        },
      },
    });
  }

  /**
   * Find games for a specific player
   */
  async findPlayerGames(
    playerId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
      includeActions?: boolean;
    } = {}
  ): Promise<GameWithPlayers[]> {
    const { status, limit = 20, offset = 0, includeActions = false } = options;

    const where: any = {
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
    };

    if (status) {
      where.status = status;
    }

    return this.model.findMany({
      where,
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        actions: includeActions
          ? {
              orderBy: { timestamp: 'asc' },
              include: {
                player: {
                  select: { username: true, displayName: true },
                },
              },
            }
          : false,
        _count: {
          select: {
            actions: true,
            proofs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find available games waiting for players
   */
  async findAvailableGames(
    options: {
      gameType?: string;
      betAmountMin?: Decimal;
      betAmountMax?: Decimal;
      excludePlayerId?: string;
      limit?: number;
    } = {}
  ): Promise<GameWithPlayers[]> {
    const {
      gameType,
      betAmountMin,
      betAmountMax,
      excludePlayerId,
      limit = 10,
    } = options;

    const where: any = {
      status: 'WAITING',
      player2Id: null,
    };

    if (gameType) {
      where.gameType = gameType;
    }

    if (betAmountMin || betAmountMax) {
      where.betAmount = {};
      if (betAmountMin) where.betAmount.gte = betAmountMin;
      if (betAmountMax) where.betAmount.lte = betAmountMax;
    }

    if (excludePlayerId) {
      where.player1Id = { not: excludePlayerId };
    }

    return this.model.findMany({
      where,
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ betAmount: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  /**
   * Create a new game
   */
  async createGame(data: {
    gameId: string;
    player1Id: string;
    gameType: string;
    betAmount: Decimal;
    player1Odds?: Decimal;
    player2Odds?: Decimal;
    gameData?: any;
  }): Promise<GameWithPlayers> {
    return this.model.create({
      data: {
        gameId: data.gameId,
        player1Id: data.player1Id,
        gameType: data.gameType,
        betAmount: data.betAmount,
        player1Odds: data.player1Odds || new Decimal(1.0),
        player2Odds: data.player2Odds || new Decimal(1.0),
        gameData: data.gameData || {},
        status: 'WAITING',
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Join an existing game
   */
  async joinGame(
    gameId: string,
    player2Id: string,
    player2Odds?: Decimal
  ): Promise<GameWithPlayers> {
    return this.withTransaction(async (tx) => {
      // Check if game is still available
      const game = await tx.game.findUnique({
        where: { gameId },
      });

      if (!game || game.status !== 'WAITING' || game.player2Id) {
        throw new Error('Game is no longer available');
      }

      // Update game with second player
      return tx.game.update({
        where: { gameId },
        data: {
          player2Id,
          player2Odds: player2Odds || new Decimal(1.0),
          status: 'STARTING',
          startedAt: new Date(),
        },
        include: {
          player1: {
            select: {
              id: true,
              username: true,
              displayName: true,
              rating: true,
              avatarUrl: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              displayName: true,
              rating: true,
              avatarUrl: true,
            },
          },
        },
      });
    });
  }

  /**
   * Start a game (move from STARTING to ACTIVE)
   */
  async startGame(
    gameId: string,
    gameData: any,
    seed?: string,
    vrfProof?: string
  ): Promise<GameWithPlayers> {
    return this.model.update({
      where: { gameId },
      data: {
        status: 'ACTIVE',
        gameData,
        seed,
        vrfProof,
        startedAt: new Date(),
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * End a game with result
   */
  async endGame(
    gameId: string,
    result: {
      winnerId?: string;
      winReason?: string;
      finalGameData?: any;
      stateRoot?: string;
      attestation?: any;
      finalProof?: string;
      settlementTx?: string;
    }
  ): Promise<GameWithPlayers> {
    return this.model.update({
      where: { gameId },
      data: {
        status: 'COMPLETED',
        winnerId: result.winnerId,
        winReason: result.winReason as any,
        gameData: result.finalGameData,
        stateRoot: result.stateRoot,
        attestation: result.attestation,
        finalProof: result.finalProof,
        settlementTx: result.settlementTx,
        endedAt: new Date(),
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Cancel a game
   */
  async cancelGame(gameId: string, reason?: string): Promise<GameWithPlayers> {
    return this.model.update({
      where: { gameId },
      data: {
        status: 'CANCELLED',
        gameData: {
          cancelReason: reason,
          cancelledAt: new Date(),
        },
        endedAt: new Date(),
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            rating: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Update game state
   */
  async updateGameState(gameId: string, gameData: any): Promise<any> {
    return this.model.update({
      where: { gameId },
      data: { gameData },
    });
  }

  /**
   * Get active games count
   */
  async getActiveGamesCount(): Promise<number> {
    return this.count({
      status: { in: ['ACTIVE', 'STARTING'] },
    });
  }

  /**
   * Get game statistics
   */
  async getGameStats(timeframe?: {
    from: Date;
    to: Date;
  }): Promise<GameStats> {
    const where: any = {};
    
    if (timeframe) {
      where.createdAt = {
        gte: timeframe.from,
        lte: timeframe.to,
      };
    }

    const [
      totalGames,
      activeGames,
      completedToday,
      volumeData,
      durationData,
      gameTypeStats,
    ] = await Promise.all([
      // Total games
      this.count(where),

      // Active games
      this.count({
        status: { in: ['ACTIVE', 'STARTING'] },
      }),

      // Completed today
      this.count({
        ...where,
        status: 'COMPLETED',
        endedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      }),

      // Total volume
      this.raw<Array<{ sum: string }>>(`
        SELECT SUM(bet_amount) as sum 
        FROM games 
        WHERE status = 'COMPLETED'
        ${timeframe ? `AND created_at BETWEEN $1 AND $2` : ''}
      `, timeframe ? [timeframe.from, timeframe.to] : []),

      // Average game duration
      this.raw<Array<{ avg: number }>>(`
        SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg
        FROM games 
        WHERE status = 'COMPLETED' 
        AND started_at IS NOT NULL 
        AND ended_at IS NOT NULL
        ${timeframe ? `AND created_at BETWEEN $1 AND $2` : ''}
      `, timeframe ? [timeframe.from, timeframe.to] : []),

      // Game type statistics
      this.raw<Array<{ game_type: string; count: number }>>(`
        SELECT game_type, COUNT(*) as count
        FROM games 
        WHERE 1=1
        ${timeframe ? `AND created_at BETWEEN $1 AND $2` : ''}
        GROUP BY game_type
        ORDER BY count DESC
      `, timeframe ? [timeframe.from, timeframe.to] : []),
    ]);

    const totalVolume = new Decimal(volumeData[0]?.sum || '0');
    const averageGameDuration = Math.round(durationData[0]?.avg || 0);

    // Calculate percentages for game types
    const topGameTypes = gameTypeStats.map((stat) => ({
      type: stat.game_type,
      count: stat.count,
      percentage: totalGames > 0 ? Math.round((stat.count / totalGames) * 100) : 0,
    }));

    return {
      totalGames,
      activeGames,
      completedToday,
      totalVolume,
      averageGameDuration,
      topGameTypes,
    };
  }

  /**
   * Find games that have been stuck in a status for too long
   */
  async findStaleGames(
    statusTimeout: Record<string, number> = {
      'WAITING': 30 * 60 * 1000, // 30 minutes
      'STARTING': 5 * 60 * 1000, // 5 minutes
      'ACTIVE': 60 * 60 * 1000, // 1 hour
      'PAUSED': 15 * 60 * 1000, // 15 minutes
      'SETTLING': 10 * 60 * 1000, // 10 minutes
      'COMPLETED': 0,
      'CANCELLED': 0,
      'DISPUTED': 24 * 60 * 60 * 1000, // 24 hours
    }
  ): Promise<any[]> {
    const now = new Date();
    const staleGames: any[] = [];

    for (const [status, timeout] of Object.entries(statusTimeout)) {
      if (timeout > 0) {
        const cutoff = new Date(now.getTime() - timeout);
        const games = await this.findMany({
          where: {
            status: status as any,
            updatedAt: { lt: cutoff },
          },
        });
        staleGames.push(...games);
      }
    }

    return staleGames;
  }

  /**
   * Get games by status with pagination
   */
  async getGamesByStatus(
    status: string | string[],
    options: {
      page?: number;
      limit?: number;
      includePlayers?: boolean;
    } = {}
  ): Promise<{
    games: GameWithPlayers[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, includePlayers = true } = options;
    const where: any = {
      status: Array.isArray(status) ? { in: status } : status,
    };

    const include = includePlayers
      ? {
          player1: {
            select: {
              id: true,
              username: true,
              displayName: true,
              rating: true,
              avatarUrl: true,
            },
          },
          player2: {
            select: {
              id: true,
              username: true,
              displayName: true,
              rating: true,
              avatarUrl: true,
            },
          },
        }
      : undefined;

    const [games, total] = await Promise.all([
      this.model.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.count(where),
    ]);

    return {
      games,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get recent games with caching
   */
  async getRecentGames(limit: number = 10): Promise<GameWithPlayers[]> {
    return this.findWithCache(
      `recent_games:${limit}`,
      async () => {
        return this.model.findMany({
          where: {
            status: 'COMPLETED',
          },
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                displayName: true,
                rating: true,
                avatarUrl: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                displayName: true,
                rating: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { endedAt: 'desc' },
          take: limit,
        });
      },
      300 // 5 minutes cache
    );
  }
}