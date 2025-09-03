import { Router } from 'express';
import { prisma } from '@/config/database';
import { redisManager } from '@/config/redis';
import { logger } from '@/config/logger';
import { AuthenticatedRequest } from '@/middleware/auth';
import { NotFoundError, ValidationError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/middleware/errorHandler';
import { query, validationResult } from 'express-validator';

const router = Router();

const validatePlayerQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['totalEarnings', 'gamesWon', 'winRate', 'gamesPlayed'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
];

/**
 * @route   GET /api/players/me
 * @desc    Get current player profile
 * @access  Private
 */
router.get('/me', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const playerId = req.user!.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      sessions: {
        where: { isActive: true },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastUsedAt: true,
        },
        orderBy: { lastUsedAt: 'desc' },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          confirmedAt: true,
        },
      },
      _count: {
        select: {
          gamesAsPlayer1: true,
          gamesAsPlayer2: true,
        },
      },
    },
  });

  if (!player) {
    throw new NotFoundError('Player');
  }

  // Check if player is online
  const isOnline = await redisManager.isPlayerOnline(playerId);

  res.json({
    success: true,
    player: {
      id: player.id,
      walletId: player.walletId,
      username: player.username,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      createdAt: player.createdAt,
      updatedAt: player.updatedAt,
      gamesPlayed: player.gamesPlayed,
      gamesWon: player.gamesWon,
      gamesLost: player.gamesLost,
      totalEarnings: player.totalEarnings.toNumber(),
      totalSpent: player.totalSpent.toNumber(),
      winRate: player.winRate,
      lastActiveAt: player.lastActiveAt,
      streakDays: player.streakDays,
      longestStreak: player.longestStreak,
      totalPlayTime: player.totalPlayTime,
      isOnline,
      sessions: player.sessions,
      recentTransactions: player.transactions.map(tx => ({
        ...tx,
        amount: tx.amount.toNumber(),
      })),
      totalGames: player._count.gamesAsPlayer1 + player._count.gamesAsPlayer2,
    },
  });
}));

/**
 * @route   GET /api/players/:playerId
 * @desc    Get player profile by ID (public info only)
 * @access  Private
 */
router.get('/:playerId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { playerId } = req.params;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      createdAt: true,
      gamesPlayed: true,
      gamesWon: true,
      gamesLost: true,
      winRate: true,
      streakDays: true,
      longestStreak: true,
      totalPlayTime: true,
    },
  });

  if (!player) {
    throw new NotFoundError('Player');
  }

  // Check if player is online
  const isOnline = await redisManager.isPlayerOnline(playerId);

  // Get recent games (public info)
  const recentGames = await prisma.game.findMany({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
      status: 'COMPLETED',
    },
    select: {
      gameId: true,
      gameType: true,
      endedAt: true,
      winnerId: true,
      winReason: true,
      player1: {
        select: { id: true, username: true, displayName: true },
      },
      player2: {
        select: { id: true, username: true, displayName: true },
      },
    },
    orderBy: { endedAt: 'desc' },
    take: 10,
  });

  res.json({
    success: true,
    player: {
      ...player,
      isOnline,
      recentGames: recentGames.map(game => ({
        gameId: game.gameId,
        gameType: game.gameType,
        endedAt: game.endedAt,
        won: game.winnerId === playerId,
        winReason: game.winReason,
        opponent: game.player1Id === playerId ? game.player2 : game.player1,
      })),
    },
  });
}));

/**
 * @route   GET /api/players/search
 * @desc    Search players by username
 * @access  Private
 */
router.get('/search', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { q, limit = 20 } = req.query as any;

  if (!q || typeof q !== 'string' || q.length < 2) {
    return res.json({
      success: true,
      players: [],
      message: 'Search query must be at least 2 characters',
    });
  }

  const players = await prisma.player.findMany({
    where: {
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { displayName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      gamesPlayed: true,
      gamesWon: true,
      winRate: true,
      lastActiveAt: true,
    },
    take: parseInt(limit),
    orderBy: [
      { gamesPlayed: 'desc' },
      { winRate: 'desc' },
    ],
  });

  // Check online status for each player
  const playersWithStatus = await Promise.all(
    players.map(async (player) => ({
      ...player,
      isOnline: await redisManager.isPlayerOnline(player.id),
    }))
  );

  res.json({
    success: true,
    players: playersWithStatus,
    total: playersWithStatus.length,
  });
}));

/**
 * @route   GET /api/players/leaderboard
 * @desc    Get players leaderboard
 * @access  Private
 */
router.get('/leaderboard', validatePlayerQuery, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    page = 1,
    limit = 50,
    sortBy = 'totalEarnings',
    sortOrder = 'desc',
  } = req.query as any;

  // Try to get cached leaderboard first
  const cacheKey = `leaderboard:${sortBy}:${sortOrder}:${page}:${limit}`;
  const cached = await redisManager.get(cacheKey);
  
  if (cached) {
    return res.json({
      success: true,
      ...JSON.parse(cached),
    });
  }

  const orderBy: any = {};
  orderBy[sortBy] = sortOrder;

  const [players, total] = await Promise.all([
    prisma.player.findMany({
      where: {
        gamesPlayed: { gt: 0 }, // Only show players who have played games
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        gamesPlayed: true,
        gamesWon: true,
        gamesLost: true,
        totalEarnings: true,
        winRate: true,
        lastActiveAt: true,
      },
      orderBy: [orderBy, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.player.count({
      where: {
        gamesPlayed: { gt: 0 },
      },
    }),
  ]);

  const leaderboard = players.map((player, index) => ({
    ...player,
    totalEarnings: player.totalEarnings.toNumber(),
    rank: (page - 1) * limit + index + 1,
  }));

  const result = {
    leaderboard,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
    sortBy,
    sortOrder,
  };

  // Cache for 5 minutes
  await redisManager.set(cacheKey, JSON.stringify(result), 300);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * @route   GET /api/players/online
 * @desc    Get currently online players
 * @access  Private
 */
router.get('/online', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { limit = 50 } = req.query as any;

  // Get online player IDs from Redis
  const onlinePlayerIds = await redisManager.getOnlinePlayers();
  
  if (onlinePlayerIds.length === 0) {
    return res.json({
      success: true,
      players: [],
      total: 0,
    });
  }

  // Get player details
  const players = await prisma.player.findMany({
    where: {
      id: { in: onlinePlayerIds.slice(0, limit) },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      gamesPlayed: true,
      gamesWon: true,
      winRate: true,
      lastActiveAt: true,
    },
    orderBy: { lastActiveAt: 'desc' },
  });

  res.json({
    success: true,
    players: players.map(player => ({
      ...player,
      isOnline: true,
    })),
    total: players.length,
    totalOnline: onlinePlayerIds.length,
  });
}));

/**
 * @route   GET /api/players/stats/global
 * @desc    Get global player statistics
 * @access  Private
 */
router.get('/stats/global', asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Try cache first
  const cached = await redisManager.get('stats:global');
  if (cached) {
    return res.json({
      success: true,
      ...JSON.parse(cached),
    });
  }

  const [
    totalPlayers,
    activePlayers,
    totalGames,
    totalEarnings,
    avgWinRate,
    topPlayer,
  ] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({
      where: {
        lastActiveAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    }),
    prisma.game.count({
      where: { status: 'COMPLETED' },
    }),
    prisma.player.aggregate({
      _sum: { totalEarnings: true },
    }),
    prisma.player.aggregate({
      _avg: { winRate: true },
      where: { gamesPlayed: { gt: 0 } },
    }),
    prisma.player.findFirst({
      orderBy: { totalEarnings: 'desc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        totalEarnings: true,
        gamesWon: true,
      },
    }),
  ]);

  const onlineCount = (await redisManager.getOnlinePlayers()).length;

  const stats = {
    totalPlayers,
    activePlayers,
    onlinePlayers: onlineCount,
    totalGames,
    totalEarnings: totalEarnings._sum?.totalEarnings?.toNumber() || 0,
    averageWinRate: avgWinRate._avg?.winRate || 0,
    topEarner: topPlayer ? {
      ...topPlayer,
      totalEarnings: topPlayer.totalEarnings.toNumber(),
    } : null,
    updatedAt: new Date().toISOString(),
  };

  // Cache for 10 minutes
  await redisManager.set('stats:global', JSON.stringify(stats), 600);

  res.json({
    success: true,
    ...stats,
  });
}));

/**
 * @route   GET /api/players/:playerId/games
 * @desc    Get player's game history
 * @access  Private
 */
router.get('/:playerId/games', validatePlayerQuery, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { playerId } = req.params;
  const { page = 1, limit = 20 } = req.query as any;

  // Check if player exists
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true },
  });

  if (!player) {
    throw new NotFoundError('Player');
  }

  const where = {
    OR: [
      { player1Id: playerId },
      { player2Id: playerId },
    ],
    status: 'COMPLETED',
  };

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { endedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.game.count({ where }),
  ]);

  res.json({
    success: true,
    games: games.map(game => ({
      gameId: game.gameId,
      gameType: game.gameType,
      betAmount: game.betAmount.toNumber(),
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      winnerId: game.winnerId,
      winReason: game.winReason,
      won: game.winnerId === playerId,
      player1: game.player1,
      player2: game.player2,
      opponent: game.player1Id === playerId ? game.player2 : game.player1,
    })),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}));

export default router;