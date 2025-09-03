import { Router } from 'express';
import { prisma } from '@/config/database';
import { costTrackingService } from '@/services/costTracking';
import { getQueueStats } from '@/workers';
import { logger } from '@/config/logger';
import { AuthenticatedRequest } from '@/middleware/auth';
import { ValidationError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/middleware/errorHandler';
import { query, validationResult } from 'express-validator';

const router = Router();

const validateTimeframe = [
  query('timeframe')
    .optional()
    .isIn(['1h', '24h', '7d', '30d'])
    .withMessage('Invalid timeframe. Must be 1h, 24h, 7d, or 30d'),
];

/**
 * @route   GET /api/metrics/dashboard
 * @desc    Get comprehensive dashboard metrics
 * @access  Private
 */
router.get('/dashboard', validateTimeframe, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { timeframe = '24h' } = req.query as any;
  const playerId = req.user!.playerId;

  try {
    // Get time boundaries
    const hoursMap = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };
    const hours = hoursMap[timeframe as keyof typeof hoursMap];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [
      playerStats,
      gameStats,
      systemStats,
      costStats,
      queueStats,
    ] = await Promise.all([
      getPlayerMetrics(playerId, since),
      getGameMetrics(since),
      getSystemMetrics(since),
      costTrackingService.getCostSummary(timeframe as any),
      getQueueStats(),
    ]);

    res.json({
      success: true,
      timeframe,
      period: {
        from: since.toISOString(),
        to: new Date().toISOString(),
      },
      metrics: {
        player: playerStats,
        games: gameStats,
        system: systemStats,
        costs: costStats,
        queues: queueStats,
      },
    });

  } catch (error) {
    logger.error('Dashboard metrics failed:', error);
    throw error;
  }
}));

/**
 * @route   GET /api/metrics/costs
 * @desc    Get detailed cost metrics
 * @access  Private
 */
router.get('/costs', validateTimeframe, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { timeframe = '24h' } = req.query as any;
  const playerId = req.user!.playerId;

  const [costSummary, playerCosts, costTrends] = await Promise.all([
    costTrackingService.getCostSummary(timeframe as any),
    costTrackingService.getPlayerCosts(playerId, timeframe as any),
    costTrackingService.getCostTrends(timeframe === '30d' ? 30 : 7),
  ]);

  res.json({
    success: true,
    timeframe,
    costs: {
      summary: costSummary,
      player: playerCosts,
      trends: costTrends,
    },
  });
}));

/**
 * @route   GET /api/metrics/performance
 * @desc    Get system performance metrics
 * @access  Private
 */
router.get('/performance', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const [queueStats, systemMetrics] = await Promise.all([
    getQueueStats(),
    getSystemPerformanceMetrics(),
  ]);

  res.json({
    success: true,
    performance: {
      queues: queueStats,
      system: systemMetrics,
      timestamp: new Date().toISOString(),
    },
  });
}));

/**
 * @route   GET /api/metrics/games/trends
 * @desc    Get game trend analysis
 * @access  Private
 */
router.get('/games/trends', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { days = 7 } = req.query as any;
  const numDays = Math.min(Math.max(parseInt(days), 1), 30);

  const trends = await getGameTrends(numDays);

  res.json({
    success: true,
    trends,
    period: `${numDays} days`,
  });
}));

/**
 * @route   GET /api/metrics/player/detailed
 * @desc    Get detailed player metrics
 * @access  Private
 */
router.get('/player/detailed', validateTimeframe, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { timeframe = '7d' } = req.query as any;
  const playerId = req.user!.playerId;

  const hoursMap = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };
  const hours = hoursMap[timeframe as keyof typeof hoursMap];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [
    playerMetrics,
    gameHistory,
    performanceByGameType,
    winRateOverTime,
  ] = await Promise.all([
    getPlayerMetrics(playerId, since),
    getPlayerGameHistory(playerId, since),
    getPlayerPerformanceByGameType(playerId, since),
    getPlayerWinRateOverTime(playerId, Math.min(hours / 24, 30)),
  ]);

  res.json({
    success: true,
    timeframe,
    player: {
      metrics: playerMetrics,
      gameHistory,
      performanceByType: performanceByGameType,
      winRateHistory: winRateOverTime,
    },
  });
}));

// Helper functions
async function getPlayerMetrics(playerId: string, since: Date) {
  const [player, recentGames, transactions] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        gamesPlayed: true,
        gamesWon: true,
        gamesLost: true,
        totalEarnings: true,
        totalSpent: true,
        winRate: true,
        streakDays: true,
        totalPlayTime: true,
      },
    }),
    prisma.game.findMany({
      where: {
        OR: [{ player1Id: playerId }, { player2Id: playerId }],
        createdAt: { gte: since },
        status: 'COMPLETED',
      },
      select: {
        winnerId: true,
        betAmount: true,
        endedAt: true,
        startedAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        playerId,
        createdAt: { gte: since },
        status: 'CONFIRMED',
      },
      select: {
        type: true,
        amount: true,
      },
    }),
  ]);

  if (!player) {
    return null;
  }

  const gamesInPeriod = recentGames.length;
  const winsInPeriod = recentGames.filter(g => g.winnerId === playerId).length;
  const winRateInPeriod = gamesInPeriod > 0 ? (winsInPeriod / gamesInPeriod) * 100 : 0;
  
  const totalBetInPeriod = recentGames.reduce((sum, g) => sum + g.betAmount.toNumber(), 0);
  const earningsInPeriod = transactions
    .filter(t => t.type === 'WINNINGS')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0);
  
  const avgGameDuration = recentGames
    .filter(g => g.startedAt && g.endedAt)
    .reduce((sum, g) => sum + (g.endedAt!.getTime() - g.startedAt!.getTime()), 0) / gamesInPeriod || 0;

  return {
    overall: {
      gamesPlayed: player.gamesPlayed,
      gamesWon: player.gamesWon,
      gamesLost: player.gamesLost,
      winRate: player.winRate,
      totalEarnings: player.totalEarnings.toNumber(),
      totalSpent: player.totalSpent.toNumber(),
      netProfit: player.totalEarnings.sub(player.totalSpent).toNumber(),
      currentStreak: player.streakDays,
      totalPlayTime: player.totalPlayTime,
    },
    period: {
      gamesPlayed: gamesInPeriod,
      gamesWon: winsInPeriod,
      winRate: winRateInPeriod,
      totalBet: totalBetInPeriod,
      totalEarnings: earningsInPeriod,
      netProfit: earningsInPeriod - totalBetInPeriod,
      averageGameDuration: Math.floor(avgGameDuration / 1000 / 60), // minutes
    },
  };
}

async function getGameMetrics(since: Date) {
  const [totalGames, gamesByType, gamesByStatus] = await Promise.all([
    prisma.game.count({
      where: { createdAt: { gte: since } },
    }),
    prisma.game.groupBy({
      by: ['gameType'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      _avg: { betAmount: true },
    }),
    prisma.game.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const completionRate = gamesByStatus.find(s => s.status === 'COMPLETED')?._count.id || 0;
  const totalCreated = totalGames;

  return {
    totalGames,
    completionRate: totalCreated > 0 ? (completionRate / totalCreated) * 100 : 0,
    byType: gamesByType.map(gt => ({
      gameType: gt.gameType,
      count: gt._count.id,
      averageBet: gt._avg.betAmount?.toNumber() || 0,
    })),
    byStatus: gamesByStatus.map(gs => ({
      status: gs.status,
      count: gs._count.id,
    })),
  };
}

async function getSystemMetrics(since: Date) {
  const [activeUsers, totalTransactions, errors] = await Promise.all([
    prisma.player.count({
      where: { lastActiveAt: { gte: since } },
    }),
    prisma.transaction.count({
      where: { createdAt: { gte: since } },
    }),
    // In a real system, you'd have an error log table
    Promise.resolve(0),
  ]);

  return {
    activeUsers,
    totalTransactions,
    errorCount: errors,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  };
}

async function getSystemPerformanceMetrics() {
  return {
    process: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    },
    timestamp: new Date().toISOString(),
  };
}

async function getGameTrends(days: number) {
  const trends = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    
    const dayStats = await prisma.game.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: date, lt: nextDate },
      },
      _count: { id: true },
    });

    const totalGames = dayStats.reduce((sum, s) => sum + s._count.id, 0);
    const completedGames = dayStats.find(s => s.status === 'COMPLETED')?._count.id || 0;

    trends.push({
      date: date.toISOString().split('T')[0],
      totalGames,
      completedGames,
      completionRate: totalGames > 0 ? (completedGames / totalGames) * 100 : 0,
    });
  }

  return trends;
}

async function getPlayerGameHistory(playerId: string, since: Date) {
  const games = await prisma.game.findMany({
    where: {
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
      createdAt: { gte: since },
      status: 'COMPLETED',
    },
    select: {
      gameId: true,
      gameType: true,
      betAmount: true,
      winnerId: true,
      winReason: true,
      createdAt: true,
      endedAt: true,
      player1Id: true,
      player2Id: true,
    },
    orderBy: { endedAt: 'desc' },
    take: 50,
  });

  return games.map(game => ({
    gameId: game.gameId,
    gameType: game.gameType,
    betAmount: game.betAmount.toNumber(),
    won: game.winnerId === playerId,
    winReason: game.winReason,
    duration: game.endedAt && game.createdAt ? 
      Math.floor((game.endedAt.getTime() - game.createdAt.getTime()) / 1000 / 60) : null,
    endedAt: game.endedAt,
  }));
}

async function getPlayerPerformanceByGameType(playerId: string, since: Date) {
  const performance = await prisma.game.groupBy({
    by: ['gameType'],
    where: {
      OR: [{ player1Id: playerId }, { player2Id: playerId }],
      createdAt: { gte: since },
      status: 'COMPLETED',
    },
    _count: { id: true },
  });

  const wins = await prisma.game.groupBy({
    by: ['gameType'],
    where: {
      winnerId: playerId,
      createdAt: { gte: since },
      status: 'COMPLETED',
    },
    _count: { id: true },
  });

  const winsByType = wins.reduce((acc, w) => {
    acc[w.gameType] = w._count.id;
    return acc;
  }, {} as Record<string, number>);

  return performance.map(p => ({
    gameType: p.gameType,
    totalGames: p._count.id,
    wins: winsByType[p.gameType] || 0,
    winRate: p._count.id > 0 ? ((winsByType[p.gameType] || 0) / p._count.id) * 100 : 0,
  }));
}

async function getPlayerWinRateOverTime(playerId: string, days: number) {
  const history = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    
    const [totalGames, wins] = await Promise.all([
      prisma.game.count({
        where: {
          OR: [{ player1Id: playerId }, { player2Id: playerId }],
          createdAt: { gte: date, lt: nextDate },
          status: 'COMPLETED',
        },
      }),
      prisma.game.count({
        where: {
          winnerId: playerId,
          createdAt: { gte: date, lt: nextDate },
          status: 'COMPLETED',
        },
      }),
    ]);

    history.push({
      date: date.toISOString().split('T')[0],
      totalGames,
      wins,
      winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
    });
  }

  return history;
}

export default router;