import request from 'supertest';
import { app } from '../../src/app';
import { GameService } from '../../src/services/game.service';
import { DatabaseService } from '../../src/services/database.service';
import { RedisService } from '../../src/services/redis.service';
import { setupTestDatabase, teardownTestDatabase } from '../utils/test-db';
import { createTestUser, createTestGame } from '../utils/test-factories';

describe('Game Integration Tests', () => {
  let dbService: DatabaseService;
  let redisService: RedisService;
  let gameService: GameService;

  beforeAll(async () => {
    await setupTestDatabase();
    dbService = new DatabaseService();
    redisService = new RedisService();
    gameService = new GameService(dbService, redisService);
    
    await dbService.connect();
    await redisService.connect();
  });

  afterAll(async () => {
    await dbService.disconnect();
    await redisService.disconnect();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    // Clean up before each test
    await dbService.truncateAllTables();
    await redisService.flushAll();
  });

  describe('POST /api/games', () => {
    it('should create a new game successfully', async () => {
      const user = await createTestUser();
      const gameData = {
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000,
        isPrivate: false
      };

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${user.token}`)
        .send(gameData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        status: 'waiting',
        players: [],
        createdBy: user.id
      });

      // Verify game exists in database
      const gameInDb = await dbService.games.findById(response.body.id);
      expect(gameInDb).toBeDefined();
      expect(gameInDb.status).toBe('waiting');
    });

    it('should validate game creation parameters', async () => {
      const user = await createTestUser();
      
      // Test invalid bet amount
      await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          gameType: 'PVP',
          betAmount: 0, // Invalid
          maxPlayers: 2,
          timeLimit: 30000
        })
        .expect(400);

      // Test invalid player count
      await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          gameType: 'PVP',
          betAmount: 1000000,
          maxPlayers: 10, // Too many
          timeLimit: 30000
        })
        .expect(400);

      // Test invalid time limit
      await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          gameType: 'PVP',
          betAmount: 1000000,
          maxPlayers: 2,
          timeLimit: 1000 // Too short
        })
        .expect(400);
    });

    it('should handle concurrent game creation', async () => {
      const users = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser()
      ]);

      const gameData = {
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000
      };

      // Create games concurrently
      const requests = users.map(user =>
        request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${user.token}`)
          .send(gameData)
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.id).toBeDefined();
      });

      // Verify all games have unique IDs
      const gameIds = responses.map(r => r.body.id);
      const uniqueIds = new Set(gameIds);
      expect(uniqueIds.size).toBe(gameIds.length);
    });
  });

  describe('POST /api/games/:id/join', () => {
    it('should allow player to join waiting game', async () => {
      const creator = await createTestUser();
      const joiner = await createTestUser();
      
      const game = await createTestGame(creator.id);

      const response = await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${joiner.token}`)
        .send({ betAmount: game.betAmount })
        .expect(200);

      expect(response.body).toMatchObject({
        id: game.id,
        status: 'active',
        players: expect.arrayContaining([
          expect.objectContaining({ id: creator.id }),
          expect.objectContaining({ id: joiner.id })
        ])
      });

      // Verify game state in database
      const updatedGame = await dbService.games.findById(game.id);
      expect(updatedGame.status).toBe('active');
      expect(updatedGame.players).toHaveLength(2);
    });

    it('should prevent joining full games', async () => {
      const users = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser()
      ]);

      const game = await createTestGame(users[0].id, { maxPlayers: 2 });
      
      // First join should succeed
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${users[1].token}`)
        .send({ betAmount: game.betAmount })
        .expect(200);

      // Second join should fail (game full)
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${users[2].token}`)
        .send({ betAmount: game.betAmount })
        .expect(400);
    });

    it('should prevent creator from joining their own game', async () => {
      const creator = await createTestUser();
      const game = await createTestGame(creator.id);

      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${creator.token}`)
        .send({ betAmount: game.betAmount })
        .expect(400);
    });

    it('should validate bet amount matches game requirement', async () => {
      const creator = await createTestUser();
      const joiner = await createTestUser();
      
      const game = await createTestGame(creator.id, { betAmount: 1000000 });

      // Wrong bet amount
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${joiner.token}`)
        .send({ betAmount: 500000 })
        .expect(400);

      // Correct bet amount
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${joiner.token}`)
        .send({ betAmount: 1000000 })
        .expect(200);
    });
  });

  describe('POST /api/games/:id/moves', () => {
    it('should accept valid moves during active game', async () => {
      const users = await Promise.all([createTestUser(), createTestUser()]);
      const game = await createTestGame(users[0].id);
      
      // Join game to make it active
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${users[1].token}`)
        .send({ betAmount: game.betAmount });

      const move = {
        type: 'attack',
        target: users[1].id,
        damage: 50
      };

      const response = await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .send(move)
        .expect(200);

      expect(response.body).toMatchObject({
        moveId: expect.any(String),
        gameId: game.id,
        playerId: users[0].id,
        type: 'attack',
        accepted: true
      });
    });

    it('should reject moves from non-players', async () => {
      const users = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser()
      ]);
      
      const game = await createTestGame(users[0].id);
      
      // Join game
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${users[1].token}`)
        .send({ betAmount: game.betAmount });

      const move = { type: 'attack', target: users[1].id, damage: 50 };

      // Non-player tries to make move
      await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[2].token}`)
        .send(move)
        .expect(403);
    });

    it('should reject moves in non-active games', async () => {
      const users = await Promise.all([createTestUser(), createTestUser()]);
      const game = await createTestGame(users[0].id, { status: 'waiting' });

      const move = { type: 'attack', target: users[1].id, damage: 50 };

      await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .send(move)
        .expect(400);
    });

    it('should validate move structure and limits', async () => {
      const users = await Promise.all([createTestUser(), createTestUser()]);
      const game = await createTestGame(users[0].id);
      
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${users[1].token}`)
        .send({ betAmount: game.betAmount });

      // Invalid move type
      await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .send({ type: 'invalid_move', target: users[1].id })
        .expect(400);

      // Invalid damage amount
      await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .send({ type: 'attack', target: users[1].id, damage: 1000 })
        .expect(400);

      // Missing required fields
      await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .send({ type: 'attack' })
        .expect(400);
    });
  });

  describe('GET /api/games/:id', () => {
    it('should return game details for participants', async () => {
      const users = await Promise.all([createTestUser(), createTestUser()]);
      const game = await createTestGame(users[0].id);

      const response = await request(app)
        .get(`/api/games/${game.id}`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: game.id,
        gameType: 'PVP',
        status: 'waiting',
        players: expect.any(Array),
        createdAt: expect.any(String)
      });
    });

    it('should hide sensitive information from non-participants', async () => {
      const users = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser()
      ]);
      
      const game = await createTestGame(users[0].id, { isPrivate: true });

      // Non-participant should get limited info
      const response = await request(app)
        .get(`/api/games/${game.id}`)
        .set('Authorization', `Bearer ${users[2].token}`)
        .expect(200);

      expect(response.body).not.toHaveProperty('escrowAccount');
      expect(response.body).not.toHaveProperty('vrfSeed');
      expect(response.body.players).toHaveLength(0); // Masked
    });

    it('should return 404 for non-existent games', async () => {
      const user = await createTestUser();
      
      await request(app)
        .get('/api/games/non-existent-id')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(404);
    });
  });

  describe('WebSocket Game Events', () => {
    it('should broadcast game events to participants', (done) => {
      // Note: This would require WebSocket testing setup
      // Implementation would test real-time events during game play
      done();
    });

    it('should handle client disconnections gracefully', (done) => {
      // Test graceful handling of player disconnections
      done();
    });
  });

  describe('Game State Persistence', () => {
    it('should persist game state across server restarts', async () => {
      const users = await Promise.all([createTestUser(), createTestUser()]);
      const game = await createTestGame(users[0].id);

      // Join game
      await request(app)
        .post(`/api/games/${game.id}/join`)
        .set('Authorization', `Bearer ${users[1].token}`)
        .send({ betAmount: game.betAmount });

      // Make some moves
      await request(app)
        .post(`/api/games/${game.id}/moves`)
        .set('Authorization', `Bearer ${users[0].token}`)
        .send({ type: 'attack', target: users[1].id, damage: 30 });

      // Simulate server restart by creating new service instance
      const newGameService = new GameService(dbService, redisService);
      
      // Verify game state persisted
      const persistedGame = await newGameService.getGame(game.id);
      expect(persistedGame).toBeDefined();
      expect(persistedGame.status).toBe('active');
      expect(persistedGame.moves).toHaveLength(1);
    });

    it('should handle Redis cache misses gracefully', async () => {
      const user = await createTestUser();
      const game = await createTestGame(user.id);

      // Clear Redis cache
      await redisService.flushAll();

      // Should still return game from database
      const response = await request(app)
        .get(`/api/games/${game.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(response.body.id).toBe(game.id);
    });
  });

  describe('Performance and Load', () => {
    it('should handle high concurrent game creation', async () => {
      const concurrency = 50;
      const users = await Promise.all(
        Array(concurrency).fill(null).map(() => createTestUser())
      );

      const gameData = {
        gameType: 'PVP',
        betAmount: 1000000,
        maxPlayers: 2,
        timeLimit: 30000
      };

      const startTime = Date.now();
      
      const requests = users.map(user =>
        request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${user.token}`)
          .send(gameData)
      );

      const responses = await Promise.all(requests);
      const endTime = Date.now();

      const successCount = responses.filter(r => r.status === 201).length;
      const successRate = successCount / concurrency;
      const avgResponseTime = (endTime - startTime) / concurrency;

      expect(successRate).toBeGreaterThan(0.95); // > 95% success rate
      expect(avgResponseTime).toBeLessThan(100); // < 100ms average
    });

    it('should maintain response times under load', async () => {
      const user = await createTestUser();
      const game = await createTestGame(user.id);

      const iterations = 100;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await request(app)
          .get(`/api/games/${game.id}`)
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200);

        responseTimes.push(Date.now() - startTime);
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

      expect(avgResponseTime).toBeLessThan(50); // < 50ms average
      expect(p95ResponseTime).toBeLessThan(100); // P95 < 100ms
    });
  });
});