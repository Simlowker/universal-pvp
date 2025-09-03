import { prisma } from '@/config/database';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { nanoid } from 'nanoid';
import { 
  CreateGameRequest, 
  JoinGameRequest, 
  GameActionRequest, 
  SettleGameRequest,
  NotFoundError,
  ConflictError,
  ValidationError 
} from '@/types/api.types';
import { GameType, GameStatus, ActionType, WinReason } from '@prisma/client';
import { settlementQueue } from '@/queues/settlement.queue';
import { proofQueue } from '@/queues/proof.queue';

export class GameService {
  
  async createGame(playerId: string, request: CreateGameRequest) {
    try {
      // Validate player exists and is not in another active game
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          gamesAsPlayer1: {
            where: {
              status: { in: ['WAITING', 'STARTING', 'ACTIVE', 'PAUSED'] }
            }
          },
          gamesAsPlayer2: {
            where: {
              status: { in: ['WAITING', 'STARTING', 'ACTIVE', 'PAUSED'] }
            }
          }
        }
      });

      if (!player) {
        throw new NotFoundError('Player');
      }

      // Check if player is already in an active game
      const activeGames = [...player.gamesAsPlayer1, ...player.gamesAsPlayer2];
      if (activeGames.length > 0) {
        throw new ConflictError('Player is already in an active game');
      }

      // Validate bet amount
      if (request.betAmount < 0.01 || request.betAmount > 10) {
        throw new ValidationError('Bet amount must be between 0.01 and 10 SOL');
      }

      // Create unique game ID
      const gameId = nanoid(12);

      // Create game in database
      const game = await prisma.game.create({
        data: {
          gameId,
          player1Id: playerId,
          gameType: request.gameType,
          betAmount: request.betAmount,
          status: 'WAITING',
          player1Odds: 1.0,
          player2Odds: 1.0,
          houseEdge: 0.05, // 5% house edge
          gameData: {
            isPrivate: request.isPrivate || false,
            password: request.password,
            createdBy: playerId
          }
        }
      });

      // Cache game state in Redis
      await redis.setex(
        `game:${gameId}:state`,
        3600, // 1 hour TTL
        JSON.stringify({
          gameId: game.gameId,
          status: game.status,
          player1Id: game.player1Id,
          player2Id: null,
          betAmount: game.betAmount,
          gameType: game.gameType,
          createdAt: game.createdAt
        })
      );

      // Add to active games set
      await redis.sadd('active_games', gameId);
      await redis.sadd(`game:${gameId}:players`, playerId);

      logger.info(`Game ${gameId} created by player ${playerId}`, {
        gameType: request.gameType,
        betAmount: request.betAmount
      });

      return game;

    } catch (error) {
      logger.error('Failed to create game:', error);
      throw error;
    }
  }

  async joinGame(playerId: string, request: JoinGameRequest) {
    try {
      const { gameId, password } = request;

      // Get game from database
      const game = await prisma.game.findUnique({
        where: { gameId },
        include: { 
          player1: true,
          player2: true
        }
      });

      if (!game) {
        throw new NotFoundError('Game');
      }

      // Validate game state
      if (game.status !== 'WAITING') {
        throw new ConflictError('Game is not accepting players');
      }

      if (game.player1Id === playerId) {
        throw new ConflictError('Cannot join own game');
      }

      if (game.player2Id) {
        throw new ConflictError('Game is already full');
      }

      // Check password for private games
      const gameData = game.gameData as any;
      if (gameData?.isPrivate && gameData?.password !== password) {
        throw new ValidationError('Incorrect game password');
      }

      // Check if player is already in another active game
      const playerGames = await prisma.game.findMany({
        where: {
          OR: [
            { player1Id: playerId },
            { player2Id: playerId }
          ],
          status: { in: ['WAITING', 'STARTING', 'ACTIVE', 'PAUSED'] }
        }
      });

      if (playerGames.length > 0) {
        throw new ConflictError('Player is already in an active game');
      }

      // Update game with second player
      const updatedGame = await prisma.game.update({
        where: { id: game.id },
        data: {
          player2Id: playerId,
          status: 'STARTING',
          startedAt: new Date()
        },
        include: {
          player1: true,
          player2: true
        }
      });

      // Update Redis cache
      const gameState = {
        gameId: updatedGame.gameId,
        status: updatedGame.status,
        player1Id: updatedGame.player1Id,
        player2Id: updatedGame.player2Id,
        betAmount: updatedGame.betAmount,
        gameType: updatedGame.gameType,
        startedAt: updatedGame.startedAt
      };

      await redis.setex(`game:${gameId}:state`, 3600, JSON.stringify(gameState));
      await redis.sadd(`game:${gameId}:players`, playerId);

      // Initialize game state
      await this.initializeGameState(updatedGame);

      logger.info(`Player ${playerId} joined game ${gameId}`);

      return updatedGame;

    } catch (error) {
      logger.error('Failed to join game:', error);
      throw error;
    }
  }

  async getGame(gameId: string, playerId: string) {
    try {
      // Try Redis cache first
      const cachedState = await redis.get(`game:${gameId}:state`);
      if (cachedState) {
        const gameState = JSON.parse(cachedState);
        
        // Verify player has access to this game
        const isPlayer = gameState.player1Id === playerId || gameState.player2Id === playerId;
        if (!isPlayer) {
          throw new ValidationError('Not authorized to view this game');
        }
        
        return gameState;
      }

      // Fallback to database
      const game = await prisma.game.findUnique({
        where: { gameId },
        include: {
          player1: { select: { id: true, username: true, rating: true } },
          player2: { select: { id: true, username: true, rating: true } },
          actions: {
            orderBy: { timestamp: 'desc' },
            take: 50
          }
        }
      });

      if (!game) {
        throw new NotFoundError('Game');
      }

      // Verify player has access
      const isPlayer = game.player1Id === playerId || game.player2Id === playerId;
      if (!isPlayer) {
        throw new ValidationError('Not authorized to view this game');
      }

      // Cache the result
      await redis.setex(`game:${gameId}:state`, 300, JSON.stringify(game));

      return game;

    } catch (error) {
      logger.error('Failed to get game:', error);
      throw error;
    }
  }

  async submitAction(playerId: string, request: GameActionRequest) {
    try {
      const { gameId, actionType, actionData, clientTimestamp, signature } = request;

      // Get game state
      const game = await prisma.game.findUnique({
        where: { gameId },
        include: { player1: true, player2: true }
      });

      if (!game) {
        throw new NotFoundError('Game');
      }

      // Validate player is in game
      if (game.player1Id !== playerId && game.player2Id !== playerId) {
        throw new ValidationError('Player is not part of this game');
      }

      // Validate game is active
      if (game.status !== 'ACTIVE') {
        throw new ConflictError('Game is not active');
      }

      // Calculate latencies
      const serverTimestamp = new Date();
      const clientTime = new Date(clientTimestamp);
      const serverLatency = serverTimestamp.getTime() - clientTime.getTime();
      const networkLatency = Math.abs(serverLatency) / 2; // Rough estimate

      // Validate action based on game rules
      const isValidAction = await this.validateGameAction(game, playerId, actionType, actionData);
      
      if (!isValidAction.valid) {
        throw new ValidationError(isValidAction.error || 'Invalid action');
      }

      // Create action record
      const action = await prisma.gameAction.create({
        data: {
          gameId: game.id,
          playerId,
          actionType,
          actionData,
          clientTimestamp: clientTime,
          timestamp: serverTimestamp,
          serverLatency: serverLatency > 0 ? serverLatency : null,
          networkLatency: networkLatency > 0 ? networkLatency : null,
          signature,
          isValid: isValidAction.valid
        }
      });

      // Update game state
      const newGameState = await this.updateGameStateWithAction(game, action, actionData);

      // Submit proof verification job if needed
      if (isValidAction.requiresProof) {
        await proofQueue.add('verify-action', {
          gameId: game.gameId,
          playerId,
          actionId: action.id,
          proofType: 'ACTION_VALID',
          proofData: {
            action: { type: actionType, data: actionData },
            gameState: newGameState,
            proof: isValidAction.proof
          }
        }, {
          priority: actionType === 'SURRENDER' ? 10 : 5, // Higher priority for surrenders
          delay: 0
        });
      }

      // Cache updated game state
      await redis.setex(`game:${gameId}:state`, 3600, JSON.stringify(newGameState));

      logger.info(`Action ${actionType} submitted by ${playerId} in game ${gameId}`, {
        serverLatency,
        networkLatency,
        isValid: isValidAction.valid
      });

      return {
        actionId: action.id,
        gameState: newGameState,
        latency: serverLatency,
        isValid: isValidAction.valid
      };

    } catch (error) {
      logger.error('Failed to submit action:', error);
      throw error;
    }
  }

  async settleGame(playerId: string, request: SettleGameRequest) {
    try {
      const { gameId, winnerId, winReason, finalProof, stateRoot } = request;

      // Get game
      const game = await prisma.game.findUnique({
        where: { gameId },
        include: { player1: true, player2: true }
      });

      if (!game) {
        throw new NotFoundError('Game');
      }

      // Validate player is in game
      if (game.player1Id !== playerId && game.player2Id !== playerId) {
        throw new ValidationError('Player is not part of this game');
      }

      // Validate game can be settled
      if (!['ACTIVE', 'PAUSED'].includes(game.status)) {
        throw new ConflictError('Game cannot be settled in current state');
      }

      // Update game status to settling
      await prisma.game.update({
        where: { id: game.id },
        data: { status: 'SETTLING' }
      });

      // Submit settlement job to queue
      const job = await settlementQueue.add('settle-game', {
        gameId: game.gameId,
        winnerId,
        winReason,
        finalProof,
        stateRoot
      }, {
        priority: 10, // High priority for settlements
        delay: 0,
        attempts: 3
      });

      logger.info(`Settlement initiated for game ${gameId}`, {
        winnerId,
        winReason,
        jobId: job.id
      });

      return {
        gameId: game.gameId,
        winnerId,
        winReason,
        payouts: null, // Will be calculated by worker
        transactionId: null, // Will be set by worker
        jobId: job.id
      };

    } catch (error) {
      logger.error('Failed to initiate settlement:', error);
      throw error;
    }
  }

  async getGameState(gameId: string, playerId: string) {
    try {
      // Check Redis cache first
      const cachedState = await redis.get(`game:${gameId}:state`);
      if (cachedState) {
        const gameState = JSON.parse(cachedState);
        
        // Verify access
        if (gameState.player1Id !== playerId && gameState.player2Id !== playerId) {
          throw new ValidationError('Not authorized to view game state');
        }
        
        return gameState;
      }

      // Fallback to database
      return await this.getGame(gameId, playerId);

    } catch (error) {
      logger.error('Failed to get game state:', error);
      throw error;
    }
  }

  async getGameActions(gameId: string, playerId: string, options: { limit: number; offset: number }) {
    try {
      // Verify access to game
      await this.getGame(gameId, playerId);

      const actions = await prisma.gameAction.findMany({
        where: { 
          game: { gameId } 
        },
        include: {
          player: { select: { id: true, username: true } }
        },
        orderBy: { timestamp: 'desc' },
        take: options.limit,
        skip: options.offset
      });

      return actions;

    } catch (error) {
      logger.error('Failed to get game actions:', error);
      throw error;
    }
  }

  async cancelGame(gameId: string, playerId: string) {
    try {
      const game = await prisma.game.findUnique({
        where: { gameId }
      });

      if (!game) {
        throw new NotFoundError('Game');
      }

      // Only allow cancellation by game creator if game hasn't started
      if (game.player1Id !== playerId) {
        throw new ValidationError('Only game creator can cancel');
      }

      if (game.status !== 'WAITING') {
        throw new ConflictError('Game has already started and cannot be cancelled');
      }

      // Update game status
      const cancelledGame = await prisma.game.update({
        where: { id: game.id },
        data: {
          status: 'CANCELLED',
          endedAt: new Date()
        }
      });

      // Clean up Redis
      await redis.del(`game:${gameId}:state`);
      await redis.srem('active_games', gameId);
      await redis.del(`game:${gameId}:players`);

      logger.info(`Game ${gameId} cancelled by ${playerId}`);

      return {
        gameId: cancelledGame.gameId,
        status: cancelledGame.status,
        refundAmount: 0 // No refund needed as game never started
      };

    } catch (error) {
      logger.error('Failed to cancel game:', error);
      throw error;
    }
  }

  async getPlayerGames(playerId: string, filters: any) {
    try {
      const games = await prisma.game.findMany({
        where: {
          OR: [
            { player1Id: playerId },
            { player2Id: playerId }
          ],
          ...(filters.status && { status: filters.status }),
          ...(filters.gameType && { gameType: filters.gameType })
        },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset
      });

      return games;

    } catch (error) {
      logger.error('Failed to get player games:', error);
      throw error;
    }
  }

  // Private helper methods
  private async initializeGameState(game: any) {
    try {
      // Initialize game-specific state
      const initialState = {
        player1Health: 100,
        player2Health: 100,
        turn: game.player1Id,
        round: 1,
        actions: [],
        lastAction: null
      };

      // Store initial state
      await redis.setex(
        `game:${game.gameId}:state`,
        3600,
        JSON.stringify({
          ...game,
          gameState: initialState
        })
      );

      // Update database
      await prisma.game.update({
        where: { id: game.id },
        data: {
          status: 'ACTIVE',
          gameData: initialState
        }
      });

      logger.info(`Game state initialized for ${game.gameId}`);

    } catch (error) {
      logger.error('Failed to initialize game state:', error);
      throw error;
    }
  }

  private async validateGameAction(
    game: any, 
    playerId: string, 
    actionType: ActionType, 
    actionData: any
  ): Promise<{ valid: boolean; error?: string; requiresProof?: boolean; proof?: any }> {
    try {
      // Basic validation
      if (!actionType || !actionData) {
        return { valid: false, error: 'Missing action type or data' };
      }

      // Get current game state
      const gameState = game.gameData as any;
      
      // Validate it's player's turn (for turn-based games)
      if (gameState?.turn && gameState.turn !== playerId) {
        return { valid: false, error: 'Not your turn' };
      }

      // Action-specific validation
      switch (actionType) {
        case 'MOVE':
          return this.validateMoveAction(gameState, playerId, actionData);
        
        case 'ATTACK':
          return this.validateAttackAction(gameState, playerId, actionData);
        
        case 'DEFEND':
          return this.validateDefendAction(gameState, playerId, actionData);
        
        case 'SPECIAL':
          return this.validateSpecialAction(gameState, playerId, actionData);
        
        case 'ITEM_USE':
          return this.validateItemUseAction(gameState, playerId, actionData);
        
        case 'SURRENDER':
          return { valid: true }; // Surrender is always valid
        
        default:
          return { valid: false, error: 'Unknown action type' };
      }

    } catch (error) {
      logger.error('Action validation failed:', error);
      return { valid: false, error: 'Action validation error' };
    }
  }

  private validateMoveAction(gameState: any, playerId: string, actionData: any) {
    // Implement move validation logic
    const { position } = actionData;
    
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      return { valid: false, error: 'Invalid position data' };
    }

    // Check if position is within bounds
    if (position.x < 0 || position.x > 10 || position.y < 0 || position.y > 10) {
      return { valid: false, error: 'Position out of bounds' };
    }

    return { valid: true, requiresProof: false };
  }

  private validateAttackAction(gameState: any, playerId: string, actionData: any) {
    const { target, damage } = actionData;
    
    if (!target || typeof damage !== 'number') {
      return { valid: false, error: 'Invalid attack data' };
    }

    if (damage < 0 || damage > 50) {
      return { valid: false, error: 'Invalid damage amount' };
    }

    return { valid: true, requiresProof: true };
  }

  private validateDefendAction(gameState: any, playerId: string, actionData: any) {
    // Implement defend validation
    return { valid: true, requiresProof: false };
  }

  private validateSpecialAction(gameState: any, playerId: string, actionData: any) {
    const { abilityId, cooldown } = actionData;
    
    if (!abilityId) {
      return { valid: false, error: 'Missing ability ID' };
    }

    // Check cooldown
    if (cooldown && cooldown > Date.now()) {
      return { valid: false, error: 'Ability on cooldown' };
    }

    return { valid: true, requiresProof: true };
  }

  private validateItemUseAction(gameState: any, playerId: string, actionData: any) {
    const { itemId, quantity } = actionData;
    
    if (!itemId || !quantity || quantity <= 0) {
      return { valid: false, error: 'Invalid item data' };
    }

    return { valid: true, requiresProof: false };
  }

  private async updateGameStateWithAction(game: any, action: any, actionData: any) {
    const currentState = game.gameData as any || {};
    
    // Update state based on action type
    switch (action.actionType) {
      case 'ATTACK':
        const damage = actionData.damage || 0;
        const isPlayer1 = action.playerId === game.player1Id;
        
        if (isPlayer1) {
          currentState.player2Health = Math.max(0, (currentState.player2Health || 100) - damage);
        } else {
          currentState.player1Health = Math.max(0, (currentState.player1Health || 100) - damage);
        }
        break;
        
      case 'MOVE':
        // Update player position
        currentState[`${action.playerId}_position`] = actionData.position;
        break;
        
      case 'SURRENDER':
        // Game ends
        currentState.gameEnded = true;
        currentState.winner = action.playerId === game.player1Id ? game.player2Id : game.player1Id;
        currentState.winReason = 'FORFEIT';
        break;
    }
    
    // Switch turns
    currentState.turn = action.playerId === game.player1Id ? game.player2Id : game.player1Id;
    currentState.lastAction = action.id;
    
    // Update database
    await prisma.game.update({
      where: { id: game.id },
      data: { gameData: currentState }
    });
    
    return { ...game, gameData: currentState };
  }
}

// Singleton instance
export const gameService = new GameService();