import { Router } from 'express';
import { prisma } from '@/config/database';
import { redisManager } from '@/config/redis';
import { gameLogicService } from '@/services/gameLogic';
import { getTrendingData, getTrendingPlayers, getGameTypePopularity } from '@/workers/trendingWorker';
import { logger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { AuthenticatedRequest } from '@/middleware/auth';
import { ValidationError, GameError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/middleware/errorHandler';
import { body, query, validationResult } from 'express-validator';
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

const router = Router();

const validateMatchmakingJoin = [
  body('gameType')
    .isIn(Object.values(GameType))
    .withMessage('Invalid game type'),
  body('betAmount')
    .isFloat({ min: 0.01, max: 10 })
    .withMessage('Bet amount must be between 0.01 and 10 SOL'),
  body('maxWaitTime')
    .optional()
    .isInt({ min: 30, max: 600 })
    .withMessage('Max wait time must be between 30 and 600 seconds'),
];

/**
 * @route   GET /api/matchmaking/queue/status
 * @desc    Get matchmaking queue status
 * @access  Private
 */
router.get('/queue/status', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const playerId = req.user!.playerId;

  // Check if player is in queue
  const queueData = await redisManager.hGet('matchmaking:players', playerId);
  
  if (!queueData) {
    return res.json({
      success: true,
      inQueue: false,
      message: 'Not in matchmaking queue',
    });
  }

  const playerQueue = JSON.parse(queueData);
  const waitTime = Date.now() - playerQueue.queuedAt;
  
  res.json({
    success: true,
    inQueue: true,
    gameType: playerQueue.gameType,
    betAmount: playerQueue.betAmount,
    queuedAt: new Date(playerQueue.queuedAt),
    waitTime: Math.floor(waitTime / 1000), // seconds
    maxWaitTime: Math.floor(playerQueue.maxWaitTime / 1000),
    estimatedTimeRemaining: Math.max(0, Math.floor((playerQueue.maxWaitTime - waitTime) / 1000)),
  });
}));

/**
 * @route   POST /api/matchmaking/queue/join
 * @desc    Join matchmaking queue (REST endpoint for non-WebSocket clients)
 * @access  Private
 */
router.post('/queue/join', validateMatchmakingJoin, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { gameType, betAmount, maxWaitTime = 300 } = req.body;
  const playerId = req.user!.playerId;

  // Check if player is already in a queue
  const existingQueue = await redisManager.hGet('matchmaking:players', playerId);
  if (existingQueue) {
    throw new GameError('Already in matchmaking queue');
  }

  // Check if player is already in an active game
  const activeGame = await prisma.game.findFirst({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
      status: {
        in: [GameStatus.WAITING, GameStatus.STARTING, GameStatus.ACTIVE, GameStatus.PAUSED],
      },
    },
  });

  if (activeGame) {
    throw new GameError('You are already in an active game', activeGame.gameId);
  }

  // Store queue request
  const queueRequest = {
    playerId,
    gameType,
    betAmount,
    queuedAt: Date.now(),
    maxWaitTime: maxWaitTime * 1000,
    method: 'rest', // Distinguish from WebSocket requests
  };

  await redisManager.hSet(
    'matchmaking:players',
    playerId,
    JSON.stringify(queueRequest)
  );

  res.json({
    success: true,
    message: 'Successfully joined matchmaking queue',
    gameType,
    betAmount,
    estimatedWaitTime: 30, // Default estimate
    maxWaitTime,
    queuedAt: new Date(queueRequest.queuedAt),
  });

  logger.info('Player joined matchmaking queue via REST', {
    playerId,
    gameType,
    betAmount,
  });

  metricsUtils.recordWebSocketMessage('matchmaking:join-queue', 'in');
}));

/**
 * @route   POST /api/matchmaking/queue/leave
 * @desc    Leave matchmaking queue
 * @access  Private
 */
router.post('/queue/leave', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const playerId = req.user!.playerId;

  // Remove from queue
  await redisManager.hDel('matchmaking:players', playerId);

  res.json({
    success: true,
    message: 'Successfully left matchmaking queue',
  });

  logger.info('Player left matchmaking queue via REST', { playerId });
}));

/**
 * @route   GET /api/matchmaking/available
 * @desc    Get available games to join
 * @access  Private
 */
router.get('/available', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { gameType, minBet, maxBet, limit = 20 } = req.query as any;
  const playerId = req.user!.playerId;

  const where: any = {
    status: GameStatus.WAITING,
    player2Id: null, // Games waiting for a second player
    player1Id: { not: playerId }, // Exclude own games
  };

  if (gameType) {
    where.gameType = gameType;
  }

  if (minBet || maxBet) {
    where.betAmount = {};
    if (minBet) where.betAmount.gte = parseFloat(minBet);
    if (maxBet) where.betAmount.lte = parseFloat(maxBet);
  }

  const availableGames = await prisma.game.findMany({
    where,
    include: {
      player1: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          winRate: true,
          gamesPlayed: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit),
  });

  res.json({
    success: true,
    games: availableGames.map(game => ({
      gameId: game.gameId,
      gameType: game.gameType,
      betAmount: game.betAmount.toNumber(),
      createdAt: game.createdAt,
      waitingTime: Date.now() - game.createdAt.getTime(),
      player1: game.player1,
    })),
    total: availableGames.length,
  });
}));

/**
 * @route   POST /api/matchmaking/games/:gameId/join
 * @desc    Join a specific available game
 * @access  Private
 */
router.post('/games/:gameId/join', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { gameId } = req.params;
  const playerId = req.user!.playerId;

  // Check if game exists and is available
  const game = await prisma.game.findUnique({
    where: { gameId },
    include: {
      player1: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  if (!game) {
    throw new GameError('Game not found');
  }

  if (game.status !== GameStatus.WAITING) {
    throw new GameError('Game is not available for joining');
  }

  if (game.player2Id) {
    throw new GameError('Game already has two players');
  }

  if (game.player1Id === playerId) {
    throw new GameError('Cannot join your own game');
  }

  // Check if player is already in an active game
  const activeGame = await prisma.game.findFirst({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
      ],
      status: {
        in: [GameStatus.WAITING, GameStatus.STARTING, GameStatus.ACTIVE, GameStatus.PAUSED],
      },
    },
  });

  if (activeGame) {
    throw new GameError('You are already in an active game');
  }

  // Join the game
  const updatedGame = await prisma.game.update({
    where: { gameId },
    data: {
      player2Id: playerId,
      status: GameStatus.STARTING,
      startedAt: new Date(),
    },
    include: {
      player1: {
        select: { id: true, username: true, displayName: true },
      },
      player2: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  // Initialize game state
  const gameState = await gameLogicService.getGameState(gameId);

  res.json({
    success: true,
    message: 'Successfully joined game',
    game: {
      gameId: updatedGame.gameId,
      gameType: updatedGame.gameType,
      betAmount: updatedGame.betAmount.toNumber(),
      status: updatedGame.status,
      player1: updatedGame.player1,
      player2: updatedGame.player2,
      gameState,
    },
  });

  logger.info('Player joined game via matchmaking', {
    gameId,
    playerId,
    player1Id: game.player1Id,
  });
}));

/**
 * @route   GET /api/matchmaking/trending
 * @desc    Get trending games and players
 * @access  Private
 */
router.get('/trending', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { timeframe = '24h' } = req.query as any;

  const [trendingData, trendingPlayers, gameTypePopularity] = await Promise.all([
    getTrendingData(timeframe),
    getTrendingPlayers(timeframe === '7d' ? '7d' : '24h'),
    getGameTypePopularity(),
  ]);

  res.json({
    success: true,
    timeframe,
    trending: {
      games: trendingData,
      players: trendingPlayers.slice(0, 10), // Top 10 players
      gameTypes: gameTypePopularity.slice(0, 5), // Top 5 game types
    },
    updatedAt: new Date().toISOString(),
  });
}));

/**
 * @route   GET /api/matchmaking/stats
 * @desc    Get matchmaking statistics
 * @access  Private
 */
router.get('/stats', asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Try cache first
  const cached = await redisManager.get('matchmaking:stats');
  if (cached) {
    return res.json({
      success: true,
      ...JSON.parse(cached),
    });
  }

  const [
    totalWaitingGames,
    avgWaitTime,
    totalPlayersInQueue,
    gameTypeStats,
  ] = await Promise.all([
    // Games waiting for players
    prisma.game.count({
      where: {
        status: GameStatus.WAITING,
        player2Id: null,
      },
    }),
    // Average game creation to start time (last 24h)
    prisma.$queryRaw`
      SELECT AVG(EXTRACT(EPOCH FROM ("startedAt" - "createdAt"))) as avg_wait_seconds
      FROM games 
      WHERE "startedAt" IS NOT NULL 
      AND "createdAt" >= NOW() - INTERVAL '24 hours'
    `,
    // Players currently in matchmaking queue
    (async () => {
      const queueData = await redisManager.hGetAll('matchmaking:players');
      return Object.keys(queueData).length;
    })(),
    // Game type popularity (last 7 days)
    prisma.game.groupBy({
      by: ['gameType'],
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      _count: {
        id: true,
      },
      _avg: {
        betAmount: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    }),
  ]);

  const stats = {
    waitingGames: totalWaitingGames,
    averageWaitTime: (avgWaitTime as any)[0]?.avg_wait_seconds || 0,
    playersInQueue: totalPlayersInQueue,
    gameTypeStats: gameTypeStats.map(stat => ({
      gameType: stat.gameType,
      gamesCreated: stat._count.id,
      averageBet: stat._avg.betAmount?.toNumber() || 0,
    })),
    updatedAt: new Date().toISOString(),
  };

  // Cache for 2 minutes
  await redisManager.set('matchmaking:stats', JSON.stringify(stats), 120);

  res.json({
    success: true,
    ...stats,
  });
}));

/**
 * @route   GET /api/matchmaking/recommendations
 * @desc    Get game recommendations for the player
 * @access  Private
 */
router.get('/recommendations', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const playerId = req.user!.playerId;

  // Get player's game history and preferences
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: {
      gamesAsPlayer1: {
        where: { status: 'COMPLETED' },
        select: { gameType: true, betAmount: true },
        orderBy: { endedAt: 'desc' },
        take: 20,
      },
      gamesAsPlayer2: {
        where: { status: 'COMPLETED' },
        select: { gameType: true, betAmount: true },
        orderBy: { endedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!player) {
    return res.json({
      success: true,
      recommendations: [],
      message: 'Player not found',
    });
  }

  // Analyze player preferences
  const allGames = [...player.gamesAsPlayer1, ...player.gamesAsPlayer2];
  const gameTypePreference = getGameTypePreference(allGames);
  const betAmountPreference = getBetAmountPreference(allGames);

  // Get popular game types
  const popularGameTypes = await getGameTypePopularity();

  // Create recommendations
  const recommendations = [];

  // Recommend based on player's favorite game type
  if (gameTypePreference.favorite) {
    recommendations.push({
      type: 'favorite_game_type',
      title: `More ${gameTypePreference.favorite} Games`,
      description: `You've won ${gameTypePreference.winRate}% of your ${gameTypePreference.favorite} games`,
      gameType: gameTypePreference.favorite,
      suggestedBetAmount: betAmountPreference.preferred,
      reason: 'Based on your game history',
    });
  }

  // Recommend popular game types
  if (popularGameTypes.length > 0) {
    const topPopular = popularGameTypes[0];
    if (topPopular.gameType !== gameTypePreference.favorite) {
      recommendations.push({
        type: 'trending_game_type',
        title: `Try ${topPopular.gameType}`,
        description: `${topPopular.percentage.toFixed(1)}% of recent games are ${topPopular.gameType}`,
        gameType: topPopular.gameType,
        suggestedBetAmount: topPopular.averageBet,
        reason: 'Currently trending',
      });
    }
  }

  // Recommend bet amount optimization
  if (betAmountPreference.optimal !== betAmountPreference.preferred) {
    recommendations.push({
      type: 'bet_optimization',
      title: 'Optimize Your Betting',
      description: `You have a higher win rate with ${betAmountPreference.optimal} SOL bets`,
      gameType: gameTypePreference.favorite || GameType.QUICK_MATCH,
      suggestedBetAmount: betAmountPreference.optimal,
      reason: 'Based on your win rate analysis',
    });
  }

  res.json({
    success: true,
    recommendations,
    playerStats: {
      totalGames: allGames.length,
      favoriteGameType: gameTypePreference.favorite,
      preferredBetAmount: betAmountPreference.preferred,
      winRate: player.winRate,
    },
  });
}));

// Helper functions
function getGameTypePreference(games: any[]): {
  favorite: string | null;
  winRate: number;
} {
  if (games.length === 0) {
    return { favorite: null, winRate: 0 };
  }

  const gameTypeCounts = games.reduce((acc, game) => {
    acc[game.gameType] = (acc[game.gameType] || 0) + 1;
    return acc;
  }, {});

  const favorite = Object.entries(gameTypeCounts)
    .sort(([,a], [,b]) => (b as number) - (a as number))[0][0];

  // This is a simplified calculation - in reality, you'd need to track wins
  const winRate = 50; // Placeholder

  return { favorite, winRate };
}

function getBetAmountPreference(games: any[]): {
  preferred: number;
  optimal: number;
} {
  if (games.length === 0) {
    return { preferred: 0.1, optimal: 0.1 };
  }

  const amounts = games.map(g => g.betAmount.toNumber());
  const preferred = amounts.reduce((a, b) => a + b, 0) / amounts.length;

  // This is simplified - you'd want to analyze win rates by bet amount
  const optimal = preferred;

  return { 
    preferred: Math.round(preferred * 100) / 100,
    optimal: Math.round(optimal * 100) / 100,
  };
}

export default router;