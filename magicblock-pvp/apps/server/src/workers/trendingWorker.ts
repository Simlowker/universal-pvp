import { Job } from 'bullmq';
import { prisma } from '@/config/database';
import { redisManager } from '@/config/redis';
import { logger } from '@/config/logger';
import { tracing } from '@/config/tracing';

interface TrendingCalculationJobData {
  timeframe?: '1h' | '24h' | '7d';
  forceRecalculation?: boolean;
}

export async function processTrendingCalculation(job: Job<TrendingCalculationJobData>) {
  const { timeframe = '24h', forceRecalculation = false } = job.data || {};
  const span = tracing.createGameSpan('calculate_trending', 'system');
  
  try {
    logger.info('Processing trending calculation', {
      timeframe,
      forceRecalculation,
      jobId: job.id,
    });

    // Calculate trending for different timeframes
    const timeframes = timeframe ? [timeframe] : ['1h', '24h', '7d'];
    
    for (const tf of timeframes) {
      await calculateTrendingForTimeframe(tf as '1h' | '24h' | '7d');
    }

    // Calculate trending players
    await calculateTrendingPlayers();

    // Calculate game type popularity
    await calculateGameTypePopularity();

    // Update leaderboards
    await updateLeaderboards();

    logger.info('Trending calculation completed', {
      timeframe,
      processedTimeframes: timeframes,
    });

  } catch (error) {
    tracing.recordException(error as Error);
    logger.error('Trending calculation failed', {
      timeframe,
      error: (error as Error).message,
      jobId: job.id,
    });
    throw error;
  } finally {
    span.end();
  }
}

async function calculateTrendingForTimeframe(timeframe: '1h' | '24h' | '7d') {
  const timeframeHours = { '1h': 1, '24h': 24, '7d': 168 };
  const hours = timeframeHours[timeframe];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get game statistics
  const gameStats = await prisma.game.groupBy({
    by: ['gameType', 'status'],
    where: {
      createdAt: { gte: since },
    },
    _count: {
      id: true,
    },
    _sum: {
      betAmount: true,
    },
  });

  // Calculate trending metrics
  const trendingData = {
    timeframe,
    updatedAt: new Date().toISOString(),
    totalGames: gameStats.reduce((sum, stat) => sum + stat._count.id, 0),
    totalVolume: gameStats.reduce((sum, stat) => sum + (stat._sum.betAmount?.toNumber() || 0), 0),
    gameTypes: {} as Record<string, any>,
    completionRate: 0,
  };

  // Process by game type
  const gameTypeMap = new Map<string, any>();
  
  for (const stat of gameStats) {
    if (!gameTypeMap.has(stat.gameType)) {
      gameTypeMap.set(stat.gameType, {
        type: stat.gameType,
        totalGames: 0,
        completedGames: 0,
        totalVolume: 0,
        averageBet: 0,
      });
    }

    const typeData = gameTypeMap.get(stat.gameType);
    typeData.totalGames += stat._count.id;
    typeData.totalVolume += stat._sum.betAmount?.toNumber() || 0;
    
    if (stat.status === 'COMPLETED') {
      typeData.completedGames += stat._count.id;
    }
  }

  // Calculate averages and completion rates
  for (const [type, data] of gameTypeMap) {
    data.averageBet = data.totalGames > 0 ? data.totalVolume / data.totalGames : 0;
    data.completionRate = data.totalGames > 0 ? data.completedGames / data.totalGames : 0;
    trendingData.gameTypes[type] = data;
  }

  // Calculate overall completion rate
  const totalCompleted = Array.from(gameTypeMap.values())
    .reduce((sum, data) => sum + data.completedGames, 0);
  trendingData.completionRate = trendingData.totalGames > 0 
    ? totalCompleted / trendingData.totalGames 
    : 0;

  // Cache in Redis
  await redisManager.set(
    `trending:${timeframe}`,
    JSON.stringify(trendingData),
    3600 // Cache for 1 hour
  );

  logger.debug('Trending data calculated', {
    timeframe,
    totalGames: trendingData.totalGames,
    totalVolume: trendingData.totalVolume,
    gameTypes: Object.keys(trendingData.gameTypes),
  });
}

async function calculateTrendingPlayers() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get player statistics for last 24h
  const playerStats24h = await prisma.$queryRaw`
    SELECT 
      p.id,
      p.username,
      p.displayName,
      p.walletId,
      COUNT(g.id) as games_played,
      SUM(CASE WHEN g."winnerId" = p.id THEN 1 ELSE 0 END) as games_won,
      SUM(CASE WHEN g."winnerId" = p.id THEN g."betAmount" * 2 ELSE 0 END) as total_winnings,
      AVG(g."betAmount") as avg_bet
    FROM players p
    LEFT JOIN games g ON (g."player1Id" = p.id OR g."player2Id" = p.id)
    WHERE g."createdAt" >= ${since24h} AND g.status = 'COMPLETED'
    GROUP BY p.id, p.username, p."displayName", p."walletId"
    HAVING COUNT(g.id) > 0
    ORDER BY games_won DESC, total_winnings DESC
    LIMIT 50
  `;

  // Get player statistics for last 7d
  const playerStats7d = await prisma.$queryRaw`
    SELECT 
      p.id,
      p.username,
      p.displayName,
      p.walletId,
      COUNT(g.id) as games_played,
      SUM(CASE WHEN g."winnerId" = p.id THEN 1 ELSE 0 END) as games_won,
      SUM(CASE WHEN g."winnerId" = p.id THEN g."betAmount" * 2 ELSE 0 END) as total_winnings,
      AVG(g."betAmount") as avg_bet
    FROM players p
    LEFT JOIN games g ON (g."player1Id" = p.id OR g."player2Id" = p.id)
    WHERE g."createdAt" >= ${since7d} AND g.status = 'COMPLETED'
    GROUP BY p.id, p.username, p."displayName", p."walletId"
    HAVING COUNT(g.id) > 0
    ORDER BY games_won DESC, total_winnings DESC
    LIMIT 50
  `;

  // Cache trending players
  await Promise.all([
    redisManager.set(
      'trending:players:24h',
      JSON.stringify(playerStats24h),
      3600
    ),
    redisManager.set(
      'trending:players:7d',
      JSON.stringify(playerStats7d),
      3600
    ),
  ]);

  logger.debug('Trending players calculated', {
    players24h: (playerStats24h as any[]).length,
    players7d: (playerStats7d as any[]).length,
  });
}

async function calculateGameTypePopularity() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Get game type popularity data
  const popularity = await prisma.game.groupBy({
    by: ['gameType'],
    where: {
      createdAt: { gte: since7d },
    },
    _count: {
      id: true,
    },
    _avg: {
      betAmount: true,
    },
    _sum: {
      betAmount: true,
    },
  });

  const totalGames = popularity.reduce((sum, pop) => sum + pop._count.id, 0);
  
  const popularityData = popularity.map(pop => ({
    gameType: pop.gameType,
    gamesCount: pop._count.id,
    percentage: totalGames > 0 ? (pop._count.id / totalGames) * 100 : 0,
    averageBet: pop._avg.betAmount?.toNumber() || 0,
    totalVolume: pop._sum.betAmount?.toNumber() || 0,
  })).sort((a, b) => b.gamesCount - a.gamesCount);

  await redisManager.set(
    'trending:game-types',
    JSON.stringify(popularityData),
    3600
  );

  logger.debug('Game type popularity calculated', {
    types: popularityData.length,
    totalGames,
    mostPopular: popularityData[0]?.gameType,
  });
}

async function updateLeaderboards() {
  // All-time leaderboard
  const allTimeLeaders = await prisma.player.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      walletId: true,
      gamesPlayed: true,
      gamesWon: true,
      totalEarnings: true,
      winRate: true,
    },
    where: {
      gamesPlayed: { gt: 0 },
    },
    orderBy: [
      { totalEarnings: 'desc' },
      { gamesWon: 'desc' },
      { winRate: 'desc' },
    ],
    take: 100,
  });

  // Calculate win rates
  const leaderboard = allTimeLeaders.map(player => ({
    ...player,
    winRate: player.gamesPlayed > 0 ? (player.gamesWon / player.gamesPlayed) * 100 : 0,
    totalEarnings: player.totalEarnings.toNumber(),
  }));

  // Monthly leaderboard
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthlyStats = await prisma.$queryRaw`
    SELECT 
      p.id,
      p.username,
      p."displayName",
      p."walletId",
      COUNT(g.id) as games_played,
      SUM(CASE WHEN g."winnerId" = p.id THEN 1 ELSE 0 END) as games_won,
      SUM(CASE WHEN g."winnerId" = p.id THEN g."betAmount" * 2 ELSE 0 END) as total_winnings
    FROM players p
    LEFT JOIN games g ON (g."player1Id" = p.id OR g."player2Id" = p.id)
    WHERE g."createdAt" >= ${monthStart} AND g.status = 'COMPLETED'
    GROUP BY p.id, p.username, p."displayName", p."walletId"
    HAVING COUNT(g.id) > 0
    ORDER BY total_winnings DESC, games_won DESC
    LIMIT 100
  `;

  // Cache leaderboards
  await Promise.all([
    redisManager.set('leaderboard:all-time', JSON.stringify(leaderboard), 3600),
    redisManager.set('leaderboard:monthly', JSON.stringify(monthlyStats), 3600),
  ]);

  logger.debug('Leaderboards updated', {
    allTimeEntries: leaderboard.length,
    monthlyEntries: (monthlyStats as any[]).length,
  });
}

// Helper function to get cached trending data
export async function getTrendingData(timeframe: '1h' | '24h' | '7d' = '24h') {
  const cached = await redisManager.get(`trending:${timeframe}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // If not cached, trigger calculation
  const { trendingQueue } = await import('./index');
  await trendingQueue.add('calculate-trending', { timeframe });
  
  return {
    timeframe,
    message: 'Trending data is being calculated, please try again in a moment',
    updatedAt: new Date().toISOString(),
  };
}

export async function getTrendingPlayers(timeframe: '24h' | '7d' = '24h') {
  const cached = await redisManager.get(`trending:players:${timeframe}`);
  if (cached) {
    return JSON.parse(cached);
  }

  return [];
}

export async function getGameTypePopularity() {
  const cached = await redisManager.get('trending:game-types');
  if (cached) {
    return JSON.parse(cached);
  }

  return [];
}

export async function getLeaderboard(type: 'all-time' | 'monthly' = 'all-time') {
  const cached = await redisManager.get(`leaderboard:${type}`);
  if (cached) {
    return JSON.parse(cached);
  }

  return [];
}