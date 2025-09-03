// Prisma enum types - using string literals since direct enum imports are not working
type GameStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
type GameType = 'QUICK_MATCH' | 'RANKED_MATCH' | 'TOURNAMENT' | 'PRACTICE';
type ActionType = 'MOVE' | 'ATTACK' | 'DEFEND' | 'SPECIAL' | 'ITEM_USE' | 'SURRENDER';
type WinReason = 'ELIMINATION' | 'TIMEOUT' | 'FORFEIT' | 'DISPUTE';

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

const GameType = {
  QUICK_MATCH: 'QUICK_MATCH' as const,
  RANKED_MATCH: 'RANKED_MATCH' as const,
  TOURNAMENT: 'TOURNAMENT' as const,
  PRACTICE: 'PRACTICE' as const,
};

const ActionType = {
  MOVE: 'MOVE' as const,
  ATTACK: 'ATTACK' as const,
  DEFEND: 'DEFEND' as const,
  SPECIAL: 'SPECIAL' as const,
  ITEM_USE: 'ITEM_USE' as const,
  SURRENDER: 'SURRENDER' as const,
};

const WinReason = {
  ELIMINATION: 'ELIMINATION' as const,
  TIMEOUT: 'TIMEOUT' as const,
  FORFEIT: 'FORFEIT' as const,
  DISPUTE: 'DISPUTE' as const,
};
import { prisma } from '@/config/database';
import { logger, gameLogger } from '@/config/logger';
import { vrfService } from './vrf';
import { magicBlockService } from './magicblock';
import { redisManager } from '@/config/redis';
import { metricsUtils } from '@/config/metrics';
import { tracing } from '@/config/tracing';
import { GameError, NotFoundError } from '@/middleware/errorHandler';

export interface PlayerStats {
  health: number;
  maxHealth: number;
  position: { x: number; y: number };
  facing: 'left' | 'right';
  isBlocking: boolean;
  combo: number;
  specialMeter: number;
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  player1: PlayerStats;
  player2: PlayerStats;
  currentTurn: string;
  turnTimeLeft: number;
  roundNumber: number;
  randomSeed: string;
  lastActionTime: number;
}

export interface GameAction {
  type: ActionType;
  playerId: string;
  targetPosition?: { x: number; y: number };
  direction?: 'left' | 'right' | 'up' | 'down';
  power?: number;
  timestamp: number;
}

export class GameLogicService {
  private static readonly INITIAL_HEALTH = 100;
  private static readonly TURN_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_COMBO = 5;
  private static readonly SPECIAL_METER_MAX = 100;

  async createGame(player1Id: string, player2Id: string, gameType: GameType, betAmount: number): Promise<string> {
    const span = tracing.createGameSpan('create_game', 'new_game');
    
    try {
      // Generate VRF seed for the game
      const vrfResult = vrfService.generateGameSequence(
        `temp_${Date.now()}`,
        player1Id,
        player2Id
      );

      const game = await prisma.game.create({
        data: {
          gameId: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          player1Id,
          player2Id,
          gameType,
          betAmount,
          status: GameStatus.STARTING,
          seed: vrfResult.seed,
          gameData: this.createInitialGameState(player1Id, player2Id, vrfResult.seed),
        },
        include: {
          player1: true,
          player2: true,
        },
      });

      // Initialize game state in Redis for fast access
      await redisManager.setGameState(game.gameId, {
        ...this.createInitialGameState(player1Id, player2Id, vrfResult.seed),
        gameId: game.gameId,
      });

      // Initialize on MagicBlock
      await magicBlockService.initializeGameState(
        game.gameId,
        { toBase58: () => game.player1.walletId } as any,
        { toBase58: () => game.player2!.walletId } as any,
        game.gameData
      );

      gameLogger.gameStart(game.gameId, [player1Id, player2Id]);
      metricsUtils.recordGameStart(gameType);

      span.setAttributes({
        'game.id': game.gameId,
        'game.type': gameType,
        'game.bet_amount': betAmount,
      });

      return game.gameId;
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to create game:', error);
      throw new GameError('Failed to create game');
    } finally {
      span.end();
    }
  }

  async processAction(gameId: string, playerId: string, action: GameAction): Promise<GameState> {
    const span = tracing.createGameSpan('process_action', gameId, playerId);
    
    try {
      // Get current game state
      const gameState = await this.getGameState(gameId);
      if (!gameState) {
        throw new NotFoundError('Game');
      }

      // Validate action
      if (!this.isValidAction(gameState, playerId, action)) {
        throw new GameError('Invalid action', gameId);
      }

      // Process the action
      const updatedState = await this.executeAction(gameState, action);

      // Check for win conditions
      const winResult = this.checkWinCondition(updatedState);
      if (winResult) {
        await this.endGame(gameId, winResult.winnerId, winResult.reason);
      }

      // Update game state in database and Redis
      await this.updateGameState(gameId, updatedState);

      // Record action in database
      await prisma.gameAction.create({
        data: {
          gameId,
          playerId,
          actionType: action.type,
          actionData: action,
          timestamp: new Date(),
        },
      });

      // Submit action to MagicBlock for verification
      await magicBlockService.submitGameAction(gameId, playerId, action);

      gameLogger.playerAction(gameId, playerId, action);

      span.setAttributes({
        'game.action.type': action.type,
        'game.current_turn': updatedState.currentTurn,
        'game.round': updatedState.roundNumber,
      });

      return updatedState;
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to process action:', error);
      throw error;
    } finally {
      span.end();
    }
  }

  async getGameState(gameId: string): Promise<GameState | null> {
    // Try Redis first for fast access
    const cachedState = await redisManager.getGameState(gameId);
    if (cachedState) {
      return cachedState;
    }

    // Fallback to database
    const game = await prisma.game.findUnique({
      where: { gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) {
      return null;
    }

    const gameState = game.gameData as GameState;
    
    // Cache in Redis
    await redisManager.setGameState(gameId, gameState);
    
    return gameState;
  }

  private createInitialGameState(player1Id: string, player2Id: string, seed: string): GameState {
    return {
      gameId: '',
      status: GameStatus.STARTING,
      player1: {
        health: GameLogicService.INITIAL_HEALTH,
        maxHealth: GameLogicService.INITIAL_HEALTH,
        position: { x: 100, y: 300 },
        facing: 'right',
        isBlocking: false,
        combo: 0,
        specialMeter: 0,
      },
      player2: {
        health: GameLogicService.INITIAL_HEALTH,
        maxHealth: GameLogicService.INITIAL_HEALTH,
        position: { x: 700, y: 300 },
        facing: 'left',
        isBlocking: false,
        combo: 0,
        specialMeter: 0,
      },
      currentTurn: player1Id,
      turnTimeLeft: GameLogicService.TURN_TIMEOUT,
      roundNumber: 1,
      randomSeed: seed,
      lastActionTime: Date.now(),
    };
  }

  private isValidAction(gameState: GameState, playerId: string, action: GameAction): boolean {
    // Check if it's the player's turn
    if (gameState.currentTurn !== playerId) {
      return false;
    }

    // Check if game is in a playable state
    if (gameState.status !== GameStatus.ACTIVE) {
      return false;
    }

    // Check turn timeout
    if (Date.now() - gameState.lastActionTime > GameLogicService.TURN_TIMEOUT) {
      return false;
    }

    // Validate action-specific rules
    switch (action.type) {
      case ActionType.MOVE:
        return this.isValidMove(gameState, playerId, action);
      case ActionType.ATTACK:
        return this.isValidAttack(gameState, playerId, action);
      case ActionType.DEFEND:
        return this.isValidDefend(gameState, playerId);
      case ActionType.SPECIAL:
        return this.isValidSpecial(gameState, playerId);
      default:
        return true;
    }
  }

  private isValidMove(gameState: GameState, playerId: string, action: GameAction): boolean {
    const player = gameState.currentTurn === playerId ? 
      (gameState.player1.health > 0 ? gameState.player1 : gameState.player2) :
      (gameState.player1.health > 0 ? gameState.player2 : gameState.player1);

    if (!action.targetPosition) return false;

    const distance = Math.sqrt(
      Math.pow(action.targetPosition.x - player.position.x, 2) +
      Math.pow(action.targetPosition.y - player.position.y, 2)
    );

    // Max movement distance per turn
    return distance <= 100;
  }

  private isValidAttack(gameState: GameState, playerId: string, action: GameAction): boolean {
    const attacker = gameState.currentTurn === playerId ? gameState.player1 : gameState.player2;
    const defender = gameState.currentTurn === playerId ? gameState.player2 : gameState.player1;

    // Check if players are within attack range
    const distance = Math.sqrt(
      Math.pow(defender.position.x - attacker.position.x, 2) +
      Math.pow(defender.position.y - attacker.position.y, 2)
    );

    return distance <= 150; // Attack range
  }

  private isValidDefend(gameState: GameState, playerId: string): boolean {
    // Defend is always valid when it's your turn
    return true;
  }

  private isValidSpecial(gameState: GameState, playerId: string): boolean {
    const player = gameState.currentTurn === playerId ? gameState.player1 : gameState.player2;
    return player.specialMeter >= GameLogicService.SPECIAL_METER_MAX;
  }

  private async executeAction(gameState: GameState, action: GameAction): Promise<GameState> {
    const newState = { ...gameState };
    const isPlayer1Turn = newState.currentTurn === action.playerId;
    const currentPlayer = isPlayer1Turn ? newState.player1 : newState.player2;
    const otherPlayer = isPlayer1Turn ? newState.player2 : newState.player1;

    // Get random values from VRF for this action
    const randomness = vrfService.generateGameRandomness(gameState.gameId, gameState.roundNumber);

    switch (action.type) {
      case ActionType.MOVE:
        if (action.targetPosition) {
          currentPlayer.position = action.targetPosition;
          
          // Update facing direction
          if (action.targetPosition.x > otherPlayer.position.x) {
            currentPlayer.facing = 'right';
          } else {
            currentPlayer.facing = 'left';
          }
        }
        break;

      case ActionType.ATTACK:
        await this.processAttack(currentPlayer, otherPlayer, randomness, action.power || 1);
        break;

      case ActionType.DEFEND:
        currentPlayer.isBlocking = true;
        currentPlayer.specialMeter = Math.min(
          currentPlayer.specialMeter + 10,
          GameLogicService.SPECIAL_METER_MAX
        );
        break;

      case ActionType.SPECIAL:
        if (currentPlayer.specialMeter >= GameLogicService.SPECIAL_METER_MAX) {
          await this.processSpecialAttack(currentPlayer, otherPlayer, randomness);
          currentPlayer.specialMeter = 0;
        }
        break;

      case ActionType.SURRENDER:
        // Handle surrender
        newState.status = GameStatus.COMPLETED;
        break;
    }

    // Reset blocking state after each turn
    otherPlayer.isBlocking = false;

    // Switch turns
    newState.currentTurn = isPlayer1Turn ? 
      (await this.getOtherPlayerId(gameState.gameId, action.playerId)) : 
      action.playerId;
    
    newState.turnTimeLeft = GameLogicService.TURN_TIMEOUT;
    newState.lastActionTime = Date.now();
    newState.roundNumber++;

    return newState;
  }

  private async processAttack(
    attacker: PlayerStats, 
    defender: PlayerStats, 
    randomness: any, 
    powerMultiplier: number = 1
  ): Promise<void> {
    let damage = 15 * powerMultiplier; // Base damage

    // Check for critical hit
    if (randomness.criticalChance > 85) {
      damage *= 2;
      attacker.combo++;
    } else {
      attacker.combo = 0;
    }

    // Check for dodge
    if (randomness.dodgeChance > 90 && !defender.isBlocking) {
      damage = 0; // Complete dodge
    } else if (defender.isBlocking) {
      damage = Math.floor(damage * 0.3); // Blocking reduces damage by 70%
    }

    // Apply combo bonus
    if (attacker.combo > 0) {
      damage += attacker.combo * 3;
    }

    // Apply damage
    defender.health = Math.max(0, defender.health - damage);

    // Increase special meter
    attacker.specialMeter = Math.min(
      attacker.specialMeter + 5,
      GameLogicService.SPECIAL_METER_MAX
    );
  }

  private async processSpecialAttack(
    attacker: PlayerStats, 
    defender: PlayerStats, 
    randomness: any
  ): Promise<void> {
    let damage = 35; // High base damage for special

    // Special attacks have higher crit chance
    if (randomness.criticalChance > 70) {
      damage *= 1.5;
    }

    // Special attacks bypass blocking partially
    if (defender.isBlocking) {
      damage = Math.floor(damage * 0.6); // Only 40% damage reduction
    }

    defender.health = Math.max(0, defender.health - damage);
  }

  private checkWinCondition(gameState: GameState): { winnerId: string; reason: WinReason } | null {
    // Check for elimination
    if (gameState.player1.health <= 0) {
      return { winnerId: 'player2', reason: WinReason.ELIMINATION };
    }
    
    if (gameState.player2.health <= 0) {
      return { winnerId: 'player1', reason: WinReason.ELIMINATION };
    }

    // Check for timeout (would be handled by a separate timeout mechanism)
    
    return null;
  }

  private async endGame(gameId: string, winnerId: string, reason: WinReason): Promise<void> {
    const game = await prisma.game.findUnique({
      where: { gameId },
      include: { player1: true, player2: true },
    });

    if (!game) return;

    const actualWinnerId = winnerId === 'player1' ? game.player1Id : game.player2Id;

    // Update game in database
    await prisma.game.update({
      where: { gameId },
      data: {
        status: GameStatus.COMPLETED,
        winnerId: actualWinnerId,
        winReason: reason,
        endedAt: new Date(),
      },
    });

    // Update player stats
    await this.updatePlayerStats(game.player1Id, actualWinnerId === game.player1Id);
    if (game.player2Id) {
      await this.updatePlayerStats(game.player2Id, actualWinnerId === game.player2Id);
    }

    // Settle on blockchain
    if (game.escrowTx) {
      await magicBlockService.settleGame(gameId, actualWinnerId, game.escrowTx);
    }

    gameLogger.gameEnd(gameId, actualWinnerId, reason);
    metricsUtils.recordGameEnd(game.gameType, Date.now() - game.createdAt.getTime(), reason);

    // Clean up Redis cache
    await redisManager.del(`game:${gameId}`);
  }

  private async updatePlayerStats(playerId: string, won: boolean): Promise<void> {
    await prisma.player.update({
      where: { id: playerId },
      data: {
        gamesPlayed: { increment: 1 },
        gamesWon: won ? { increment: 1 } : undefined,
        gamesLost: !won ? { increment: 1 } : undefined,
      },
    });
  }

  private async updateGameState(gameId: string, state: GameState): Promise<void> {
    // Update Redis cache
    await redisManager.setGameState(gameId, state);

    // Update database
    await prisma.game.update({
      where: { gameId },
      data: {
        gameData: state,
        status: state.status,
      },
    });
  }

  private async getOtherPlayerId(gameId: string, currentPlayerId: string): Promise<string> {
    const game = await prisma.game.findUnique({
      where: { gameId },
      select: { player1Id: true, player2Id: true },
    });

    if (!game) throw new NotFoundError('Game');

    return game.player1Id === currentPlayerId ? game.player2Id! : game.player1Id;
  }
}

export const gameLogicService = new GameLogicService();