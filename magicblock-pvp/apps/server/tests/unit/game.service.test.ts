import { GameService } from '../../src/services/game.service';
import { DatabaseService } from '../../src/services/database.service';
import { RedisService } from '../../src/services/redis.service';
import { VRFService } from '../../src/services/vrf.service';
import { WebSocketService } from '../../src/services/websocket.service';

// Mock all dependencies
jest.mock('../../src/services/database.service');
jest.mock('../../src/services/redis.service');
jest.mock('../../src/services/vrf.service');
jest.mock('../../src/services/websocket.service');

describe('GameService', () => {
  let gameService: GameService;
  let mockDbService: jest.Mocked<DatabaseService>;
  let mockRedisService: jest.Mocked<RedisService>;
  let mockVRFService: jest.Mocked<VRFService>;
  let mockWebSocketService: jest.Mocked<WebSocketService>;

  beforeEach(() => {
    mockDbService = new DatabaseService() as jest.Mocked<DatabaseService>;
    mockRedisService = new RedisService() as jest.Mocked<RedisService>;
    mockVRFService = new VRFService() as jest.Mocked<VRFService>;
    mockWebSocketService = new WebSocketService() as jest.Mocked<WebSocketService>;

    gameService = new GameService(
      mockDbService,
      mockRedisService,
      mockVRFService,
      mockWebSocketService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createGame', () => {
    it('should create a new game successfully', async () => {
      const gameData = {
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000,
        createdBy: 'user-123'
      };

      const expectedGame = {
        id: 'game-123',
        ...gameData,
        status: 'waiting' as const,
        players: [],
        createdAt: new Date(),
        escrowAccount: 'escrow-123'
      };

      mockDbService.games.create.mockResolvedValue(expectedGame);
      mockRedisService.setGame.mockResolvedValue(undefined);

      const result = await gameService.createGame(gameData);

      expect(result).toEqual(expectedGame);
      expect(mockDbService.games.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...gameData,
          status: 'waiting'
        })
      );
      expect(mockRedisService.setGame).toHaveBeenCalledWith(expectedGame);
    });

    it('should validate game parameters', async () => {
      const invalidGameData = {
        gameType: 'INVALID' as any,
        betAmount: -1000,
        maxPlayers: 0,
        timeLimit: 100,
        createdBy: ''
      };

      await expect(gameService.createGame(invalidGameData))
        .rejects.toThrow('Invalid game parameters');

      expect(mockDbService.games.create).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const gameData = {
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000,
        createdBy: 'user-123'
      };

      mockDbService.games.create.mockRejectedValue(new Error('Database error'));

      await expect(gameService.createGame(gameData))
        .rejects.toThrow('Failed to create game');

      expect(mockRedisService.setGame).not.toHaveBeenCalled();
    });

    it('should set game expiration in cache', async () => {
      const gameData = {
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000,
        createdBy: 'user-123'
      };

      const game = {
        id: 'game-123',
        ...gameData,
        status: 'waiting' as const,
        players: [],
        createdAt: new Date(),
        escrowAccount: 'escrow-123'
      };

      mockDbService.games.create.mockResolvedValue(game);
      mockRedisService.setGame.mockResolvedValue(undefined);

      await gameService.createGame(gameData);

      expect(mockRedisService.setGame).toHaveBeenCalledWith(
        game,
        expect.any(Number) // TTL
      );
    });
  });

  describe('joinGame', () => {
    it('should allow player to join waiting game', async () => {
      const gameId = 'game-123';
      const playerId = 'player-456';
      const betAmount = 1000000;

      const existingGame = {
        id: gameId,
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        status: 'waiting' as const,
        players: [{ id: 'player-123', betAmount: 1000000 }],
        createdBy: 'player-123'
      };

      const updatedGame = {
        ...existingGame,
        status: 'active' as const,
        players: [
          ...existingGame.players,
          { id: playerId, betAmount: betAmount }
        ]
      };

      mockDbService.games.findById.mockResolvedValue(existingGame);
      mockDbService.games.update.mockResolvedValue(updatedGame);
      mockRedisService.setGame.mockResolvedValue(undefined);

      const result = await gameService.joinGame(gameId, playerId, betAmount);

      expect(result).toEqual(updatedGame);
      expect(mockDbService.games.update).toHaveBeenCalledWith(
        gameId,
        expect.objectContaining({
          status: 'active',
          players: expect.arrayContaining([
            expect.objectContaining({ id: playerId })
          ])
        })
      );
      expect(mockWebSocketService.broadcastToGame).toHaveBeenCalledWith(
        gameId,
        expect.objectContaining({
          type: 'player_joined',
          playerId: playerId
        })
      );
    });

    it('should prevent joining full games', async () => {
      const gameId = 'game-123';
      const playerId = 'player-789';

      const fullGame = {
        id: gameId,
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        status: 'active' as const,
        players: [
          { id: 'player-123', betAmount: 1000000 },
          { id: 'player-456', betAmount: 1000000 }
        ],
        createdBy: 'player-123'
      };

      mockDbService.games.findById.mockResolvedValue(fullGame);

      await expect(gameService.joinGame(gameId, playerId, 1000000))
        .rejects.toThrow('Game is full');

      expect(mockDbService.games.update).not.toHaveBeenCalled();
    });

    it('should prevent creator from joining own game', async () => {
      const gameId = 'game-123';
      const creatorId = 'creator-123';

      const game = {
        id: gameId,
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        status: 'waiting' as const,
        players: [],
        createdBy: creatorId
      };

      mockDbService.games.findById.mockResolvedValue(game);

      await expect(gameService.joinGame(gameId, creatorId, 1000000))
        .rejects.toThrow('Cannot join own game');
    });

    it('should validate bet amount', async () => {
      const gameId = 'game-123';
      const playerId = 'player-456';

      const game = {
        id: gameId,
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        status: 'waiting' as const,
        players: [],
        createdBy: 'creator-123'
      };

      mockDbService.games.findById.mockResolvedValue(game);

      await expect(gameService.joinGame(gameId, playerId, 500000))
        .rejects.toThrow('Bet amount must match game requirement');
    });

    it('should handle concurrent joins atomically', async () => {
      const gameId = 'game-123';
      const player1Id = 'player-456';
      const player2Id = 'player-789';

      const game = {
        id: gameId,
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        status: 'waiting' as const,
        players: [],
        createdBy: 'creator-123'
      };

      mockDbService.games.findById.mockResolvedValue(game);
      
      // Mock atomic update that prevents race conditions
      mockDbService.games.atomicUpdate.mockImplementation(async (id, updateFn) => {
        const currentGame = await mockDbService.games.findById(id);
        const updatedGame = updateFn(currentGame);
        
        if (updatedGame.players.length > currentGame.maxPlayers) {
          throw new Error('Game is full');
        }
        
        return updatedGame;
      });

      // Simulate concurrent joins
      const promises = [
        gameService.joinGame(gameId, player1Id, 1000000),
        gameService.joinGame(gameId, player2Id, 1000000)
      ];

      const results = await Promise.allSettled(promises);
      
      // One should succeed, one should fail
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);
    });
  });

  describe('submitMove', () => {
    it('should accept valid moves in active games', async () => {
      const gameId = 'game-123';
      const playerId = 'player-123';
      const move = {
        type: 'attack' as const,
        target: 'player-456',
        damage: 50
      };

      const activeGame = {
        id: gameId,
        gameType: 'PVP' as const,
        status: 'active' as const,
        players: [
          { id: 'player-123', betAmount: 1000000 },
          { id: 'player-456', betAmount: 1000000 }
        ],
        moves: [],
        currentTurn: 'player-123'
      };

      const expectedMoveResult = {
        moveId: 'move-123',
        gameId: gameId,
        playerId: playerId,
        move: move,
        accepted: true,
        timestamp: new Date()
      };

      mockDbService.games.findById.mockResolvedValue(activeGame);
      mockDbService.moves.create.mockResolvedValue(expectedMoveResult);
      mockRedisService.setGame.mockResolvedValue(undefined);

      const result = await gameService.submitMove(gameId, playerId, move);

      expect(result).toEqual(expectedMoveResult);
      expect(mockDbService.moves.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: gameId,
          playerId: playerId,
          move: move
        })
      );
      expect(mockWebSocketService.broadcastToGame).toHaveBeenCalledWith(
        gameId,
        expect.objectContaining({
          type: 'move_submitted',
          move: expectedMoveResult
        })
      );
    });

    it('should reject moves from non-players', async () => {
      const gameId = 'game-123';
      const nonPlayerId = 'intruder-789';
      const move = { type: 'attack' as const, target: 'player-456', damage: 50 };

      const activeGame = {
        id: gameId,
        status: 'active' as const,
        players: [
          { id: 'player-123', betAmount: 1000000 },
          { id: 'player-456', betAmount: 1000000 }
        ]
      };

      mockDbService.games.findById.mockResolvedValue(activeGame);

      await expect(gameService.submitMove(gameId, nonPlayerId, move))
        .rejects.toThrow('Player not in game');

      expect(mockDbService.moves.create).not.toHaveBeenCalled();
    });

    it('should reject moves in non-active games', async () => {
      const gameId = 'game-123';
      const playerId = 'player-123';
      const move = { type: 'attack' as const, target: 'player-456', damage: 50 };

      const waitingGame = {
        id: gameId,
        status: 'waiting' as const,
        players: [{ id: playerId, betAmount: 1000000 }]
      };

      mockDbService.games.findById.mockResolvedValue(waitingGame);

      await expect(gameService.submitMove(gameId, playerId, move))
        .rejects.toThrow('Game is not active');
    });

    it('should validate move structure', async () => {
      const gameId = 'game-123';
      const playerId = 'player-123';
      const invalidMove = {
        type: 'invalid' as any,
        damage: -50 // Negative damage
      };

      const activeGame = {
        id: gameId,
        status: 'active' as const,
        players: [{ id: playerId, betAmount: 1000000 }]
      };

      mockDbService.games.findById.mockResolvedValue(activeGame);

      await expect(gameService.submitMove(gameId, playerId, invalidMove))
        .rejects.toThrow('Invalid move');

      expect(mockDbService.moves.create).not.toHaveBeenCalled();
    });

    it('should handle move validation with game rules', async () => {
      const gameId = 'game-123';
      const playerId = 'player-123';
      const move = {
        type: 'attack' as const,
        target: 'player-456',
        damage: 1000 // Exceeds max damage
      };

      const activeGame = {
        id: gameId,
        status: 'active' as const,
        players: [
          { id: 'player-123', betAmount: 1000000, health: 100 },
          { id: 'player-456', betAmount: 1000000, health: 100 }
        ],
        rules: { maxDamage: 100 }
      };

      mockDbService.games.findById.mockResolvedValue(activeGame);

      await expect(gameService.submitMove(gameId, playerId, move))
        .rejects.toThrow('Move exceeds game limits');
    });
  });

  describe('getGame', () => {
    it('should return game from cache if available', async () => {
      const gameId = 'game-123';
      const cachedGame = {
        id: gameId,
        gameType: 'PVP' as const,
        status: 'active' as const,
        players: []
      };

      mockRedisService.getGame.mockResolvedValue(cachedGame);

      const result = await gameService.getGame(gameId);

      expect(result).toEqual(cachedGame);
      expect(mockDbService.games.findById).not.toHaveBeenCalled();
    });

    it('should fallback to database if not in cache', async () => {
      const gameId = 'game-123';
      const dbGame = {
        id: gameId,
        gameType: 'PVP' as const,
        status: 'finished' as const,
        players: []
      };

      mockRedisService.getGame.mockResolvedValue(null);
      mockDbService.games.findById.mockResolvedValue(dbGame);
      mockRedisService.setGame.mockResolvedValue(undefined);

      const result = await gameService.getGame(gameId);

      expect(result).toEqual(dbGame);
      expect(mockDbService.games.findById).toHaveBeenCalledWith(gameId);
      expect(mockRedisService.setGame).toHaveBeenCalledWith(dbGame, expect.any(Number));
    });

    it('should return null for non-existent games', async () => {
      const gameId = 'non-existent';

      mockRedisService.getGame.mockResolvedValue(null);
      mockDbService.games.findById.mockResolvedValue(null);

      const result = await gameService.getGame(gameId);

      expect(result).toBeNull();
    });

    it('should handle cache errors gracefully', async () => {
      const gameId = 'game-123';
      const dbGame = {
        id: gameId,
        gameType: 'PVP' as const,
        status: 'active' as const,
        players: []
      };

      mockRedisService.getGame.mockRejectedValue(new Error('Redis error'));
      mockDbService.games.findById.mockResolvedValue(dbGame);

      const result = await gameService.getGame(gameId);

      expect(result).toEqual(dbGame);
    });
  });

  describe('VRF Integration', () => {
    it('should request VRF for game events', async () => {
      const gameId = 'game-123';
      const eventType = 'critical_hit';

      const vrfRequest = {
        requestId: 'vrf-123',
        gameId: gameId,
        eventType: eventType,
        status: 'pending' as const
      };

      mockVRFService.requestRandomness.mockResolvedValue(vrfRequest);

      const result = await gameService.requestVRF(gameId, eventType);

      expect(result).toEqual(vrfRequest);
      expect(mockVRFService.requestRandomness).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: gameId,
          eventType: eventType
        })
      );
    });

    it('should handle VRF callbacks and update game state', async () => {
      const vrfResult = {
        requestId: 'vrf-123',
        gameId: 'game-123',
        randomValue: new Uint8Array([1, 2, 3, 4]),
        eventType: 'critical_hit'
      };

      const game = {
        id: 'game-123',
        status: 'active' as const,
        players: [
          { id: 'player-123', health: 100 },
          { id: 'player-456', health: 100 }
        ]
      };

      mockDbService.games.findById.mockResolvedValue(game);
      mockDbService.games.update.mockResolvedValue({
        ...game,
        lastVRFResult: vrfResult
      });

      await gameService.handleVRFCallback(vrfResult);

      expect(mockDbService.games.update).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          lastVRFResult: vrfResult
        })
      );
      expect(mockWebSocketService.broadcastToGame).toHaveBeenCalledWith(
        'game-123',
        expect.objectContaining({
          type: 'vrf_result',
          result: vrfResult
        })
      );
    });
  });

  describe('Game Cleanup', () => {
    it('should clean up expired games', async () => {
      const expiredGames = [
        { id: 'game-1', status: 'waiting', createdAt: new Date(Date.now() - 3600000) },
        { id: 'game-2', status: 'waiting', createdAt: new Date(Date.now() - 3600000) }
      ];

      mockDbService.games.findExpired.mockResolvedValue(expiredGames);
      mockDbService.games.updateMany.mockResolvedValue(undefined);
      mockRedisService.deleteGame.mockResolvedValue(undefined);

      await gameService.cleanupExpiredGames();

      expect(mockDbService.games.updateMany).toHaveBeenCalledWith(
        ['game-1', 'game-2'],
        { status: 'expired' }
      );
      expect(mockRedisService.deleteGame).toHaveBeenCalledTimes(2);
    });

    it('should archive completed games', async () => {
      const completedGames = [
        { id: 'game-1', status: 'finished', completedAt: new Date(Date.now() - 86400000) }
      ];

      mockDbService.games.findCompleted.mockResolvedValue(completedGames);
      mockDbService.archives.create.mockResolvedValue(undefined);
      mockDbService.games.delete.mockResolvedValue(undefined);

      await gameService.archiveCompletedGames();

      expect(mockDbService.archives.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 'game-1',
          gameData: completedGames[0]
        })
      );
      expect(mockDbService.games.delete).toHaveBeenCalledWith('game-1');
    });
  });

  describe('Performance Monitoring', () => {
    it('should track operation latencies', async () => {
      const gameData = {
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000,
        createdBy: 'user-123'
      };

      const game = {
        id: 'game-123',
        ...gameData,
        status: 'waiting' as const,
        players: [],
        createdAt: new Date()
      };

      mockDbService.games.create.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return game;
      });

      const startTime = Date.now();
      await gameService.createGame(gameData);
      const latency = Date.now() - startTime;

      const metrics = gameService.getMetrics();
      expect(metrics.createGameLatency).toBeGreaterThan(45);
      expect(metrics.createGameLatency).toBeLessThan(100);
    });

    it('should track success/failure rates', async () => {
      const gameData = {
        gameType: 'PVP' as const,
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000,
        createdBy: 'user-123'
      };

      // Successful operation
      mockDbService.games.create.mockResolvedValueOnce({
        id: 'game-1',
        ...gameData,
        status: 'waiting' as const,
        players: []
      });

      await gameService.createGame(gameData);

      // Failed operation
      mockDbService.games.create.mockRejectedValueOnce(new Error('DB error'));

      try {
        await gameService.createGame(gameData);
      } catch (error) {
        // Expected failure
      }

      const metrics = gameService.getMetrics();
      expect(metrics.createGameSuccessRate).toBe(0.5);
    });
  });
});