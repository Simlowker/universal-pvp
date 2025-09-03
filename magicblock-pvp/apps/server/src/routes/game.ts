import { Router } from 'express';
import { prisma } from '@/config/database';
import { gameLogicService } from '@/services/gameLogic';
import { magicBlockService } from '@/services/magicblock';
import { costTrackingService } from '@/services/costTracking';
import { logger, gameLogger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { AuthenticatedRequest } from '@/middleware/auth';
import { ValidationError, NotFoundError, GameError } from '@/middleware/errorHandler';
import { asyncHandler } from '@/middleware/errorHandler';
import { body, query, param, validationResult } from 'express-validator';
// Prisma enum types - using string literals since direct enum imports are not working
type GameType = 'QUICK_MATCH' | 'RANKED_MATCH' | 'TOURNAMENT' | 'PRACTICE';
type GameStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
type ActionType = 'MOVE' | 'ATTACK' | 'DEFEND' | 'SPECIAL' | 'ITEM_USE' | 'SURRENDER';

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

const ActionType = {
  MOVE: 'MOVE' as const,
  ATTACK: 'ATTACK' as const,
  DEFEND: 'DEFEND' as const,
  SPECIAL: 'SPECIAL' as const,
  ITEM_USE: 'ITEM_USE' as const,
  SURRENDER: 'SURRENDER' as const,
};

const router = Router();

// Validation middleware
const validateGameCreation = [
  body('gameType')
    .isIn(Object.values(GameType))
    .withMessage('Invalid game type'),
  body('betAmount')
    .isFloat({ min: 0.01, max: 10 })
    .withMessage('Bet amount must be between 0.01 and 10 SOL'),
  body('isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean'),
];

const validateGameAction = [
  body('action.type')
    .isIn(Object.values(ActionType))
    .withMessage('Invalid action type'),
  body('action.targetPosition')
    .optional()
    .isObject()
    .withMessage('Target position must be an object'),
  body('action.direction')
    .optional()
    .isIn(['left', 'right', 'up', 'down'])
    .withMessage('Invalid direction'),
  body('action.power')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Power must be between 1 and 10'),
];

const validateGameQuery = [
  query('status')
    .optional()
    .isIn(Object.values(GameStatus))
    .withMessage('Invalid game status'),
  query('gameType')
    .optional()
    .isIn(Object.values(GameType))
    .withMessage('Invalid game type'),
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
];

/**
 * @route   POST /api/games
 * @desc    Create a new game
 * @access  Private
 */
router.post('/', validateGameCreation, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { gameType, betAmount, isPrivate = false } = req.body;
  const playerId = req.user!.playerId;

  try {
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

    // Create game (initially with only player1)
    const gameId = await gameLogicService.createGame(
      playerId,
      '', // No player2 yet - will be filled by matchmaking
      gameType,
      betAmount
    );

    const game = await prisma.game.findUnique({
      where: { gameId },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      game: {
        id: game!.id,
        gameId: game!.gameId,
        gameType: game!.gameType,
        betAmount: game!.betAmount.toNumber(),
        status: game!.status,
        createdAt: game!.createdAt,
        player1: game!.player1,
        player2: null,
        isPrivate,
      },
    });

    gameLogger.gameStart(gameId, [playerId]);

  } catch (error) {
    logger.error('Game creation failed:', error);
    throw error;
  }
}));

/**
 * @route   GET /api/games
 * @desc    Get games list (filtered)
 * @access  Private
 */
router.get('/', validateGameQuery, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    status,
    gameType,
    page = 1,
    limit = 20,
  } = req.query as any;

  const playerId = req.user!.playerId;

  const where: any = {
    OR: [
      { player1Id: playerId },
      { player2Id: playerId },
    ],
  };

  if (status) {
    where.status = status;
  }

  if (gameType) {
    where.gameType = gameType;
  }

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
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.game.count({ where }),
  ]);

  res.json({
    success: true,
    games: games.map(game => ({
      id: game.id,
      gameId: game.gameId,
      gameType: game.gameType,
      betAmount: game.betAmount.toNumber(),
      status: game.status,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      winnerId: game.winnerId,
      winReason: game.winReason,
      player1: game.player1,
      player2: game.player2,
    })),
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}));

/**
 * @route   GET /api/games/:gameId
 * @desc    Get specific game details
 * @access  Private
 */
router.get('/:gameId', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { gameId } = req.params;
  const playerId = req.user!.playerId;

  const game = await prisma.game.findUnique({
    where: { gameId },
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
      player2: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          winRate: true,
          gamesPlayed: true,
        },
      },
      actions: {
        orderBy: { timestamp: 'asc' },
        include: {
          player: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (!game) {
    throw new NotFoundError('Game');
  }

  // Check if player has access to this game
  if (game.player1Id !== playerId && game.player2Id !== playerId) {
    throw new GameError('You do not have access to this game');
  }

  // Get current game state
  const gameState = await gameLogicService.getGameState(gameId);

  // Get game costs if available
  const gameCosts = await costTrackingService.getGameCosts(gameId);

  res.json({
    success: true,
    game: {
      id: game.id,
      gameId: game.gameId,
      gameType: game.gameType,
      betAmount: game.betAmount.toNumber(),
      status: game.status,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      winnerId: game.winnerId,
      winReason: game.winReason,
      escrowTx: game.escrowTx,
      settlementTx: game.settlementTx,
      player1: game.player1,
      player2: game.player2,
      gameState,
      actions: game.actions.map(action => ({
        id: action.id,
        actionType: action.actionType,
        actionData: action.actionData,
        timestamp: action.timestamp,
        isValid: action.isValid,
        player: action.player,
      })),
      costs: gameCosts,
    },
  });
}));

/**
 * @route   POST /api/games/:gameId/actions
 * @desc    Submit a game action
 * @access  Private
 */
router.post('/:gameId/actions', validateGameAction, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { gameId } = req.params;
  const { action } = req.body;
  const playerId = req.user!.playerId;

  try {
    // Process the action
    const updatedState = await gameLogicService.processAction(gameId, playerId, {
      type: action.type,
      playerId,
      targetPosition: action.targetPosition,
      direction: action.direction,
      power: action.power,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      gameState: updatedState,
      action: {
        type: action.type,
        timestamp: Date.now(),
        processed: true,
      },
    });

    // Record operation cost
    await costTrackingService.recordGameOperationCost('action_process', 100, gameId);

  } catch (error) {
    logger.error('Game action failed:', error);
    throw error;
  }
}));

/**
 * @route   POST /api/games/:gameId/forfeit
 * @desc    Forfeit a game
 * @access  Private
 */
router.post('/:gameId/forfeit', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { gameId } = req.params;
  const playerId = req.user!.playerId;

  try {
    // Process forfeit action
    await gameLogicService.processAction(gameId, playerId, {
      type: ActionType.SURRENDER,
      playerId,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      message: 'Game forfeited successfully',
    });

    gameLogger.playerAction(gameId, playerId, { type: 'forfeit' });

  } catch (error) {
    logger.error('Game forfeit failed:', error);
    throw error;
  }
}));

/**
 * @route   GET /api/games/:gameId/state
 * @desc    Get current game state
 * @access  Private
 */
router.get('/:gameId/state', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { gameId } = req.params;
  const playerId = req.user!.playerId;

  // Verify player has access to this game
  const game = await prisma.game.findUnique({
    where: { gameId },
    select: {
      player1Id: true,
      player2Id: true,
      status: true,
    },
  });

  if (!game) {
    throw new NotFoundError('Game');
  }

  if (game.player1Id !== playerId && game.player2Id !== playerId) {
    throw new GameError('You do not have access to this game');
  }

  const gameState = await gameLogicService.getGameState(gameId);

  res.json({
    success: true,
    gameId,
    gameState,
    playerRole: game.player1Id === playerId ? 'player1' : 'player2',
  });
}));

/**
 * @route   GET /api/games/:gameId/actions
 * @desc    Get game action history
 * @access  Private
 */
router.get('/:gameId/actions', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { gameId } = req.params;
  const playerId = req.user!.playerId;

  // Verify player has access to this game
  const game = await prisma.game.findUnique({
    where: { gameId },
    select: {
      player1Id: true,
      player2Id: true,
    },
  });

  if (!game) {
    throw new NotFoundError('Game');
  }

  if (game.player1Id !== playerId && game.player2Id !== playerId) {
    throw new GameError('You do not have access to this game');
  }

  const actions = await prisma.gameAction.findMany({
    where: { gameId },
    include: {
      player: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: { timestamp: 'asc' },
  });

  res.json({
    success: true,
    gameId,
    actions: actions.map(action => ({
      id: action.id,
      actionType: action.actionType,
      actionData: action.actionData,
      timestamp: action.timestamp,
      isValid: action.isValid,
      proofHash: action.proofHash,
      player: action.player,
    })),
  });
}));

/**
 * @route   GET /api/games/stats/summary
 * @desc    Get player's game statistics summary
 * @access  Private
 */
router.get('/stats/summary', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const playerId = req.user!.playerId;

  const [playerStats, recentGames, costs] = await Promise.all([
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
        longestStreak: true,
        totalPlayTime: true,
      },
    }),
    prisma.game.findMany({
      where: {
        OR: [
          { player1Id: playerId },
          { player2Id: playerId },
        ],
        status: GameStatus.COMPLETED,
      },
      orderBy: { endedAt: 'desc' },
      take: 10,
      include: {
        player1: {
          select: { id: true, username: true, displayName: true },
        },
        player2: {
          select: { id: true, username: true, displayName: true },
        },
      },
    }),
    costTrackingService.getPlayerCosts(playerId, '30d'),
  ]);

  if (!playerStats) {
    throw new NotFoundError('Player');
  }

  res.json({
    success: true,
    stats: {
      ...playerStats,
      totalEarnings: playerStats.totalEarnings.toNumber(),
      totalSpent: playerStats.totalSpent.toNumber(),
      netProfit: playerStats.totalEarnings.sub(playerStats.totalSpent).toNumber(),
    },
    recentGames: recentGames.map(game => ({
      gameId: game.gameId,
      gameType: game.gameType,
      betAmount: game.betAmount.toNumber(),
      endedAt: game.endedAt,
      won: game.winnerId === playerId,
      opponent: game.player1Id === playerId ? game.player2 : game.player1,
      winReason: game.winReason,
    })),
    costs,
  });
}));

export default router;