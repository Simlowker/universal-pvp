const { Game, Player } = require('../database/models');
const { GameService } = require('../services/gameService');
const { logger } = require('../utils/logger');
const jwt = require('jsonwebtoken');

function gameSocketHandlers(socket, io) {
  // Authenticate socket connection
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const player = await Player.findById(decoded.playerId);
      
      if (!player) {
        socket.emit('auth_error', { message: 'Player not found' });
        return;
      }

      socket.playerId = player.id;
      socket.playerUsername = player.username;
      socket.emit('authenticated', { 
        playerId: player.id, 
        username: player.username 
      });

      logger.info(`Player ${player.username} authenticated on socket ${socket.id}`);

    } catch (error) {
      socket.emit('auth_error', { message: 'Invalid token' });
      logger.error('Socket authentication error:', error);
    }
  });

  // Join game room
  socket.on('join_game', async (gameId) => {
    try {
      if (!socket.playerId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const game = await Game.findById(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (!game.players.includes(socket.playerId)) {
        socket.emit('error', { message: 'Not a player in this game' });
        return;
      }

      socket.join(`game_${gameId}`);
      socket.currentGame = gameId;

      // Notify other players that this player joined
      socket.to(`game_${gameId}`).emit('player_joined', {
        playerId: socket.playerId,
        username: socket.playerUsername,
        gameId
      });

      // Send current game state
      socket.emit('game_state', {
        gameId,
        game: game,
        message: 'Joined game successfully'
      });

      logger.info(`Player ${socket.playerId} joined game ${gameId}`);

    } catch (error) {
      socket.emit('error', { message: 'Failed to join game' });
      logger.error('Join game error:', error);
    }
  });

  // Leave game room
  socket.on('leave_game', (gameId) => {
    try {
      socket.leave(`game_${gameId}`);
      socket.currentGame = null;

      // Notify other players
      socket.to(`game_${gameId}`).emit('player_left', {
        playerId: socket.playerId,
        username: socket.playerUsername,
        gameId
      });

      socket.emit('left_game', { gameId });
      logger.info(`Player ${socket.playerId} left game ${gameId}`);

    } catch (error) {
      socket.emit('error', { message: 'Failed to leave game' });
      logger.error('Leave game error:', error);
    }
  });

  // Make a move in the game
  socket.on('make_move', async (data) => {
    try {
      if (!socket.playerId || !socket.currentGame) {
        socket.emit('error', { message: 'Not in a game' });
        return;
      }

      const { moveType, moveData, timestamp } = data;
      const gameId = socket.currentGame;

      // Validate move data
      if (!moveType || !moveData || !timestamp) {
        socket.emit('error', { message: 'Invalid move data' });
        return;
      }

      // Process move through game service
      const result = await GameService.processMove(gameId, socket.playerId, {
        moveType,
        data: moveData,
        timestamp
      });

      if (!result.success) {
        socket.emit('move_error', { message: result.error });
        return;
      }

      // Broadcast move to all players in the game
      io.to(`game_${gameId}`).emit('move_made', {
        gameId,
        playerId: socket.playerId,
        username: socket.playerUsername,
        moveType,
        moveData,
        timestamp,
        gameState: result.gameState
      });

      // Check if game is completed
      if (result.gameComplete) {
        io.to(`game_${gameId}`).emit('game_completed', {
          gameId,
          winner: result.winner,
          finalScores: result.finalScores,
          eloChanges: result.eloChanges,
          rewards: result.rewards
        });
      }

      logger.info(`Move made in game ${gameId} by player ${socket.playerId}`);

    } catch (error) {
      socket.emit('error', { message: 'Failed to process move' });
      logger.error('Make move error:', error);
    }
  });

  // Chat message in game
  socket.on('game_chat', (data) => {
    try {
      if (!socket.playerId || !socket.currentGame) {
        socket.emit('error', { message: 'Not in a game' });
        return;
      }

      const { message, timestamp } = data;
      const gameId = socket.currentGame;

      // Validate message
      if (!message || message.trim().length === 0) {
        return;
      }

      if (message.length > 500) {
        socket.emit('error', { message: 'Message too long' });
        return;
      }

      // Broadcast chat message to all players in game
      io.to(`game_${gameId}`).emit('game_chat_message', {
        gameId,
        playerId: socket.playerId,
        username: socket.playerUsername,
        message: message.trim(),
        timestamp: timestamp || Date.now()
      });

    } catch (error) {
      logger.error('Game chat error:', error);
    }
  });

  // Player ready status
  socket.on('player_ready', async (gameId) => {
    try {
      if (!socket.playerId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const game = await Game.findById(gameId);
      if (!game || !game.players.includes(socket.playerId)) {
        socket.emit('error', { message: 'Invalid game or not a player' });
        return;
      }

      // Update player ready status
      await GameService.setPlayerReady(gameId, socket.playerId);

      // Notify all players in the game
      io.to(`game_${gameId}`).emit('player_ready_status', {
        gameId,
        playerId: socket.playerId,
        username: socket.playerUsername,
        ready: true
      });

      // Check if all players are ready
      const allReady = await GameService.checkAllPlayersReady(gameId);
      if (allReady && game.status === 'waiting') {
        await GameService.startGame(gameId);
        
        io.to(`game_${gameId}`).emit('game_started', {
          gameId,
          message: 'All players ready - game started!',
          startTime: Date.now()
        });
      }

      logger.info(`Player ${socket.playerId} ready in game ${gameId}`);

    } catch (error) {
      socket.emit('error', { message: 'Failed to set ready status' });
      logger.error('Player ready error:', error);
    }
  });

  // Request game state update
  socket.on('get_game_state', async (gameId) => {
    try {
      if (!socket.playerId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const game = await Game.findById(gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      if (!game.players.includes(socket.playerId)) {
        socket.emit('error', { message: 'Not a player in this game' });
        return;
      }

      socket.emit('game_state', {
        gameId,
        game: game,
        timestamp: Date.now()
      });

    } catch (error) {
      socket.emit('error', { message: 'Failed to get game state' });
      logger.error('Get game state error:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      if (socket.playerId && socket.currentGame) {
        // Notify other players about disconnection
        socket.to(`game_${socket.currentGame}`).emit('player_disconnected', {
          playerId: socket.playerId,
          username: socket.playerUsername,
          gameId: socket.currentGame,
          timestamp: Date.now()
        });

        // Handle game state for disconnected player
        await GameService.handlePlayerDisconnect(socket.currentGame, socket.playerId);
      }

      logger.info(`Socket ${socket.id} disconnected`);

    } catch (error) {
      logger.error('Socket disconnect error:', error);
    }
  });

  // Surrender game
  socket.on('surrender_game', async (gameId) => {
    try {
      if (!socket.playerId) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const result = await GameService.surrenderGame(gameId, socket.playerId);
      
      if (!result.success) {
        socket.emit('error', { message: result.error });
        return;
      }

      // Notify all players about surrender
      io.to(`game_${gameId}`).emit('game_surrendered', {
        gameId,
        surrenderedBy: socket.playerId,
        username: socket.playerUsername,
        winner: result.winner,
        timestamp: Date.now()
      });

      // Complete the game
      io.to(`game_${gameId}`).emit('game_completed', {
        gameId,
        reason: 'surrender',
        winner: result.winner,
        finalScores: result.finalScores,
        eloChanges: result.eloChanges,
        rewards: result.rewards
      });

      logger.info(`Player ${socket.playerId} surrendered game ${gameId}`);

    } catch (error) {
      socket.emit('error', { message: 'Failed to surrender game' });
      logger.error('Surrender game error:', error);
    }
  });
}

module.exports = gameSocketHandlers;