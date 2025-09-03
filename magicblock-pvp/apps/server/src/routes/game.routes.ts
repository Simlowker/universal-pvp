import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { 
  AuthenticatedRequest,
  CreateGameRequest, 
  JoinGameRequest,
  GameActionRequest,
  SettleGameRequest,
  ApiResponse 
} from '@/types/api.types';
import { gameService } from '@/services/game.service';
import { validationErrorHandler } from '@/middleware/validation';
import { logger } from '@/config/logger';

const router = Router();

// Validation middleware
const createGameValidation = [
  body('gameType').isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  body('betAmount').isFloat({ min: 0.01, max: 10 }),
  body('isPrivate').optional().isBoolean(),
  body('password').optional().isString().isLength({ min: 4, max: 50 }),
  validationErrorHandler
];

const joinGameValidation = [
  param('gameId').isString().notEmpty(),
  body('password').optional().isString(),
  validationErrorHandler
];

const gameActionValidation = [
  param('gameId').isString().notEmpty(),
  body('actionType').isIn(['MOVE', 'ATTACK', 'DEFEND', 'SPECIAL', 'ITEM_USE', 'SURRENDER']),
  body('actionData').isObject(),
  body('clientTimestamp').isISO8601(),
  body('signature').optional().isString(),
  validationErrorHandler
];

const settleGameValidation = [
  param('gameId').isString().notEmpty(),
  body('winnerId').optional().isString(),
  body('winReason').isIn(['ELIMINATION', 'TIMEOUT', 'FORFEIT', 'DISPUTE']),
  body('finalProof').isString().notEmpty(),
  body('stateRoot').isString().notEmpty(),
  validationErrorHandler
];

// POST /api/games - Create new game
router.post('/', createGameValidation, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const createGameRequest: CreateGameRequest = req.body;
    const playerId = req.player.id;

    logger.info(`Creating game for player ${playerId}`, { gameType: createGameRequest.gameType, betAmount: createGameRequest.betAmount });

    const game = await gameService.createGame(playerId, createGameRequest);

    res.status(201).json({
      success: true,
      data: {
        gameId: game.gameId,
        game: {
          id: game.id,
          gameId: game.gameId,
          gameType: game.gameType,
          status: game.status,
          betAmount: game.betAmount,
          player1Id: game.player1Id,
          createdAt: game.createdAt
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to create game:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_CREATION_FAILED',
        message: error.message || 'Failed to create game'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/games/:gameId/join - Join existing game
router.post('/:gameId/join', joinGameValidation, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;
    const joinRequest: JoinGameRequest = { gameId, ...req.body };

    logger.info(`Player ${playerId} joining game ${gameId}`);

    const game = await gameService.joinGame(playerId, joinRequest);

    res.json({
      success: true,
      data: {
        gameId: game.gameId,
        game: {
          id: game.id,
          gameId: game.gameId,
          gameType: game.gameType,
          status: game.status,
          betAmount: game.betAmount,
          player1Id: game.player1Id,
          player2Id: game.player2Id,
          startedAt: game.startedAt
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to join game:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_JOIN_FAILED',
        message: error.message || 'Failed to join game'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/games/:gameId - Get game details
router.get('/:gameId', [
  param('gameId').isString().notEmpty(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;

    const game = await gameService.getGame(gameId, playerId);

    if (!game) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'GAME_NOT_FOUND',
          message: 'Game not found'
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }

    res.json({
      success: true,
      data: { game },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get game:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_FETCH_FAILED',
        message: error.message || 'Failed to fetch game'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/games/:gameId/actions - Submit game action
router.post('/:gameId/actions', gameActionValidation, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;
    const actionRequest: GameActionRequest = { gameId, ...req.body };

    logger.info(`Player ${playerId} submitting action for game ${gameId}`, { actionType: actionRequest.actionType });

    const result = await gameService.submitAction(playerId, actionRequest);

    res.json({
      success: true,
      data: {
        actionId: result.actionId,
        gameState: result.gameState,
        latency: result.latency,
        isValid: result.isValid
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to submit action:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'ACTION_SUBMIT_FAILED',
        message: error.message || 'Failed to submit action'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// POST /api/games/:gameId/settle - Settle game
router.post('/:gameId/settle', settleGameValidation, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;
    const settleRequest: SettleGameRequest = { gameId, ...req.body };

    logger.info(`Settling game ${gameId}`, { winnerId: settleRequest.winnerId, winReason: settleRequest.winReason });

    const result = await gameService.settleGame(playerId, settleRequest);

    res.json({
      success: true,
      data: {
        gameId: result.gameId,
        winnerId: result.winnerId,
        winReason: result.winReason,
        payouts: result.payouts,
        transactionId: result.transactionId
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to settle game:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_SETTLEMENT_FAILED',
        message: error.message || 'Failed to settle game'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/games/:gameId/state - Get current game state
router.get('/:gameId/state', [
  param('gameId').isString().notEmpty(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;

    const gameState = await gameService.getGameState(gameId, playerId);

    res.json({
      success: true,
      data: { gameState },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to get game state:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_STATE_FETCH_FAILED',
        message: error.message || 'Failed to fetch game state'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/games/:gameId/actions - Get game action history
router.get('/:gameId/actions', [
  param('gameId').isString().notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const actions = await gameService.getGameActions(gameId, playerId, { limit, offset });

    res.json({
      success: true,
      data: { actions },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: actions.length,
          page: Math.floor(offset / limit) + 1,
          limit,
          hasNext: actions.length === limit,
          hasPrev: offset > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get game actions:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_ACTIONS_FETCH_FAILED',
        message: error.message || 'Failed to fetch game actions'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// DELETE /api/games/:gameId - Cancel/forfeit game
router.delete('/:gameId', [
  param('gameId').isString().notEmpty(),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const gameId = req.params.gameId;
    const playerId = req.player.id;

    const result = await gameService.cancelGame(gameId, playerId);

    res.json({
      success: true,
      data: {
        gameId: result.gameId,
        status: result.status,
        refundAmount: result.refundAmount
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });

  } catch (error: any) {
    logger.error('Failed to cancel game:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'GAME_CANCEL_FAILED',
        message: error.message || 'Failed to cancel game'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

// GET /api/games - Get player's games
router.get('/', [
  query('status').optional().isIn(['WAITING', 'STARTING', 'ACTIVE', 'PAUSED', 'SETTLING', 'COMPLETED', 'CANCELLED', 'DISPUTED']),
  query('gameType').optional().isIn(['QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  validationErrorHandler
], async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const playerId = req.player.id;
    const filters = {
      status: req.query.status as any,
      gameType: req.query.gameType as any,
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0
    };

    const games = await gameService.getPlayerGames(playerId, filters);

    res.json({
      success: true,
      data: { games },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID'),
        pagination: {
          total: games.length,
          page: Math.floor(filters.offset / filters.limit) + 1,
          limit: filters.limit,
          hasNext: games.length === filters.limit,
          hasPrev: filters.offset > 0
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get player games:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      error: {
        code: error.code || 'PLAYER_GAMES_FETCH_FAILED',
        message: error.message || 'Failed to fetch player games'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
});

export default router;