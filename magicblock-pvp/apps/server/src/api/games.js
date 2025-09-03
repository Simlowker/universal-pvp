const express = require('express');
const Joi = require('joi');
const { Game, Player } = require('../database/models');
const { GameService } = require('../services/gameService');
const { MatchmakingService } = require('../services/matchmakingService');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const createGameSchema = Joi.object({
  gameType: Joi.string().valid('duel', 'tournament', 'practice').required(),
  wagerAmount: Joi.number().min(0).required(),
  isPrivate: Joi.boolean().default(false),
  maxPlayers: Joi.number().min(2).max(8).default(2),
  timeLimit: Joi.number().min(60).max(3600).default(300), // 5 minutes default
  settings: Joi.object().default({})
});

const joinGameSchema = Joi.object({
  wagerAmount: Joi.number().min(0).required()
});

const moveSchema = Joi.object({
  moveType: Joi.string().required(),
  data: Joi.object().required(),
  timestamp: Joi.number().required()
});

// Get all games (with filters)
router.get('/', async (req, res) => {
  try {
    const {
      status = 'waiting',
      gameType,
      minWager,
      maxWager,
      page = 1,
      limit = 20
    } = req.query;

    const filters = {
      status,
      gameType,
      minWager: minWager ? parseFloat(minWager) : undefined,
      maxWager: maxWager ? parseFloat(maxWager) : undefined
    };

    const games = await Game.findMany({
      filters,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    const totalCount = await Game.count(filters);

    res.json({
      success: true,
      data: {
        games,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get games error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch games'
    });
  }
});

// Create new game
router.post('/', async (req, res) => {
  try {
    const { error, value } = createGameSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const playerId = req.player.id;
    const player = await Player.findById(playerId);

    if (!player.isVerified) {
      return res.status(403).json({
        error: 'Wallet Not Verified',
        message: 'Please verify your wallet before creating games'
      });
    }

    // Check if player has enough balance for wager
    if (player.balance < value.wagerAmount) {
      return res.status(400).json({
        error: 'Insufficient Balance',
        message: 'Not enough SOL to cover the wager'
      });
    }

    const gameData = {
      ...value,
      createdBy: playerId,
      players: [playerId],
      status: 'waiting',
      createdAt: new Date()
    };

    const gameId = await Game.create(gameData);
    const game = await Game.findById(gameId);

    // Escrow the wager amount
    await Player.updateBalance(playerId, -value.wagerAmount);

    logger.info(`Game created: ${gameId} by player ${playerId}`);

    res.status(201).json({
      success: true,
      message: 'Game created successfully',
      data: { game }
    });

  } catch (error) {
    logger.error('Create game error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create game'
    });
  }
});

// Get specific game
router.get('/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    const game = await Game.findById(gameId);

    if (!game) {
      return res.status(404).json({
        error: 'Game Not Found',
        message: 'Game does not exist'
      });
    }

    // Check if player has access to view this game
    const playerId = req.player.id;
    if (game.isPrivate && !game.players.includes(playerId)) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'You do not have access to view this game'
      });
    }

    res.json({
      success: true,
      data: { game }
    });

  } catch (error) {
    logger.error('Get game error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch game'
    });
  }
});

// Join game
router.post('/:id/join', async (req, res) => {
  try {
    const { error, value } = joinGameSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const gameId = req.params.id;
    const playerId = req.player.id;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        error: 'Game Not Found',
        message: 'Game does not exist'
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({
        error: 'Game Not Available',
        message: 'Game is not accepting new players'
      });
    }

    if (game.players.includes(playerId)) {
      return res.status(400).json({
        error: 'Already Joined',
        message: 'You are already in this game'
      });
    }

    if (game.players.length >= game.maxPlayers) {
      return res.status(400).json({
        error: 'Game Full',
        message: 'Game has reached maximum players'
      });
    }

    if (value.wagerAmount !== game.wagerAmount) {
      return res.status(400).json({
        error: 'Wager Mismatch',
        message: 'Wager amount must match game requirements'
      });
    }

    const player = await Player.findById(playerId);
    if (!player.isVerified) {
      return res.status(403).json({
        error: 'Wallet Not Verified',
        message: 'Please verify your wallet before joining games'
      });
    }

    if (player.balance < value.wagerAmount) {
      return res.status(400).json({
        error: 'Insufficient Balance',
        message: 'Not enough SOL to cover the wager'
      });
    }

    // Add player to game and escrow wager
    await Game.addPlayer(gameId, playerId);
    await Player.updateBalance(playerId, -value.wagerAmount);

    // Check if game is ready to start
    const updatedGame = await Game.findById(gameId);
    if (updatedGame.players.length === updatedGame.maxPlayers) {
      await GameService.startGame(gameId);
    }

    logger.info(`Player ${playerId} joined game ${gameId}`);

    res.json({
      success: true,
      message: 'Successfully joined game',
      data: { game: updatedGame }
    });

  } catch (error) {
    logger.error('Join game error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to join game'
    });
  }
});

// Make a move in game
router.post('/:id/move', async (req, res) => {
  try {
    const { error, value } = moveSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.details[0].message
      });
    }

    const gameId = req.params.id;
    const playerId = req.player.id;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        error: 'Game Not Found',
        message: 'Game does not exist'
      });
    }

    if (!game.players.includes(playerId)) {
      return res.status(403).json({
        error: 'Not In Game',
        message: 'You are not a player in this game'
      });
    }

    if (game.status !== 'active') {
      return res.status(400).json({
        error: 'Game Not Active',
        message: 'Game is not currently active'
      });
    }

    // Process the move through game service
    const result = await GameService.processMove(gameId, playerId, value);

    res.json({
      success: true,
      message: 'Move processed successfully',
      data: result
    });

  } catch (error) {
    logger.error('Make move error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process move'
    });
  }
});

// Surrender/forfeit game
router.post('/:id/surrender', async (req, res) => {
  try {
    const gameId = req.params.id;
    const playerId = req.player.id;

    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        error: 'Game Not Found',
        message: 'Game does not exist'
      });
    }

    if (!game.players.includes(playerId)) {
      return res.status(403).json({
        error: 'Not In Game',
        message: 'You are not a player in this game'
      });
    }

    if (game.status !== 'active') {
      return res.status(400).json({
        error: 'Game Not Active',
        message: 'Cannot surrender - game is not active'
      });
    }

    // Process surrender through game service
    const result = await GameService.surrenderGame(gameId, playerId);

    logger.info(`Player ${playerId} surrendered in game ${gameId}`);

    res.json({
      success: true,
      message: 'Game surrendered successfully',
      data: result
    });

  } catch (error) {
    logger.error('Surrender game error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to surrender game'
    });
  }
});

// Get game history for player
router.get('/player/history', async (req, res) => {
  try {
    const playerId = req.player.id;
    const { page = 1, limit = 20, status } = req.query;

    const games = await Game.findByPlayer(playerId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    });

    const totalCount = await Game.countByPlayer(playerId, status);

    res.json({
      success: true,
      data: {
        games,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get player game history error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch game history'
    });
  }
});

// Quick match (find/create game automatically)
router.post('/quickmatch', async (req, res) => {
  try {
    const playerId = req.player.id;
    const { wagerAmount = 0.1, gameType = 'duel' } = req.body;

    const player = await Player.findById(playerId);
    if (!player.isVerified) {
      return res.status(403).json({
        error: 'Wallet Not Verified',
        message: 'Please verify your wallet before playing'
      });
    }

    if (player.balance < wagerAmount) {
      return res.status(400).json({
        error: 'Insufficient Balance',
        message: 'Not enough SOL for quick match'
      });
    }

    // Use matchmaking service to find or create a game
    const game = await MatchmakingService.findMatch(playerId, {
      wagerAmount,
      gameType,
      eloRating: player.eloRating
    });

    logger.info(`Quick match created/joined: ${game.id} for player ${playerId}`);

    res.json({
      success: true,
      message: 'Quick match successful',
      data: { game }
    });

  } catch (error) {
    logger.error('Quick match error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to find quick match'
    });
  }
});

module.exports = router;