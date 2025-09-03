const request = require('supertest');
const app = require('../../../src/backend/server');
const { createTestUser, createTestToken } = require('../../helpers/testHelpers');

describe('SQL Injection Security Tests', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_pvp_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
    
    // Create test user and authentication token
    testUser = await createTestUser({
      username: 'sqltestuser',
      email: 'sqltest@example.com',
      password: 'Password123!',
      walletAddress: '11111111111111111111111111111111'
    });
    
    authToken = createTestToken(testUser.id);
  });

  describe('Games API SQL Injection Tests', () => {
    test('should prevent SQL injection in games list query parameters', async () => {
      const maliciousInputs = [
        "'; DROP TABLE games; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM players--",
        "'; UPDATE players SET balance = 999999; --",
        "' AND (SELECT COUNT(*) FROM players) > 0; --",
        "' OR EXISTS(SELECT * FROM players WHERE email='admin@example.com'); --"
      ];

      for (const maliciousInput of maliciousInputs) {
        // Test status parameter
        const response1 = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: maliciousInput });

        expect(response1.status).toBe(400);
        expect(response1.body.error).toBe('Security Violation');

        // Test gameType parameter
        const response2 = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ gameType: maliciousInput });

        expect(response2.status).toBe(400);
        expect(response2.body.error).toBe('Security Violation');

        // Test minWager parameter
        const response3 = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ minWager: maliciousInput });

        expect(response3.status).toBe(400);
        expect(response3.body.error).toBe('Security Violation');
      }
    });

    test('should prevent SQL injection in game ID parameter', async () => {
      const maliciousGameIds = [
        "1'; DROP TABLE games; --",
        "1' OR '1'='1",
        "1 UNION SELECT password FROM players",
        "1'; UPDATE games SET status='completed'; --"
      ];

      for (const maliciousId of maliciousGameIds) {
        const response = await request(app)
          .get(`/api/games/${maliciousId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent SQL injection in game creation', async () => {
      const maliciousGameData = [
        {
          gameType: "'; DROP TABLE games; --",
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2
        },
        {
          gameType: "duel",
          wagerAmount: "1.0'; UPDATE players SET balance = 999999; --",
          isPrivate: false,
          maxPlayers: 2
        },
        {
          gameType: "duel",
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: "2'; DELETE FROM players; --"
        },
        {
          gameType: "duel",
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2,
          settings: {
            maliciousField: "'; DROP TABLE games; --"
          }
        }
      ];

      for (const gameData of maliciousGameData) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send(gameData);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent SQL injection in join game requests', async () => {
      // First create a legitimate game
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2
        });

      expect(gameResponse.status).toBe(201);
      const gameId = gameResponse.body.data.game.id;

      const maliciousJoinData = [
        {
          wagerAmount: "1.0'; DROP TABLE players; --"
        },
        {
          wagerAmount: "1.0' OR '1'='1"
        },
        {
          wagerAmount: "1.0'; UPDATE games SET status='completed'; --"
        }
      ];

      for (const joinData of maliciousJoinData) {
        const response = await request(app)
          .post(`/api/games/${gameId}/join`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(joinData);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent SQL injection in game moves', async () => {
      // Create and join a game
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2
        });

      const gameId = gameResponse.body.data.game.id;

      const maliciousMoves = [
        {
          moveType: "'; DROP TABLE game_moves; --",
          data: { action: 'attack', target: 'player2' },
          timestamp: Date.now()
        },
        {
          moveType: 'attack',
          data: { 
            action: "'; UPDATE games SET winner = 'hacker'; --",
            target: 'player2'
          },
          timestamp: Date.now()
        },
        {
          moveType: 'attack',
          data: { action: 'attack', target: 'player2' },
          timestamp: "1234567890'; DELETE FROM games; --"
        }
      ];

      for (const move of maliciousMoves) {
        const response = await request(app)
          .post(`/api/games/${gameId}/move`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(move);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent SQL injection in player history queries', async () => {
      const maliciousHistoryParams = [
        { page: "1'; DROP TABLE games; --" },
        { limit: "20' OR '1'='1" },
        { status: "'; UPDATE games SET status='hacked'; --" },
        { page: "1 UNION SELECT password FROM players" }
      ];

      for (const params of maliciousHistoryParams) {
        const response = await request(app)
          .get('/api/games/player/history')
          .set('Authorization', `Bearer ${authToken}`)
          .query(params);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent SQL injection in quickmatch requests', async () => {
      const maliciousQuickmatchData = [
        {
          wagerAmount: "0.1'; DROP TABLE players; --",
          gameType: 'duel'
        },
        {
          wagerAmount: 0.1,
          gameType: "'; DELETE FROM games; --"
        },
        {
          wagerAmount: "0.1' UNION SELECT * FROM players--",
          gameType: 'duel'
        }
      ];

      for (const data of maliciousQuickmatchData) {
        const response = await request(app)
          .post('/api/games/quickmatch')
          .set('Authorization', `Bearer ${authToken}`)
          .send(data);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });
  });

  describe('Parameterized Query Validation', () => {
    test('should use parameterized queries for game filtering', async () => {
      // Test legitimate filter values work correctly
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          status: 'waiting',
          gameType: 'duel',
          minWager: '1.0',
          maxWager: '10.0',
          page: '1',
          limit: '10'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.games)).toBe(true);
    });

    test('should use parameterized queries for game creation', async () => {
      const validGameData = {
        gameType: 'tournament',
        wagerAmount: 5.0,
        isPrivate: true,
        maxPlayers: 4,
        timeLimit: 600,
        settings: { rounds: 3 }
      };

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validGameData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.game).toBeDefined();
    });

    test('should validate input data types before database queries', async () => {
      // Test type coercion attacks
      const typeCoercionAttacks = [
        { wagerAmount: { $ne: null } }, // NoSQL injection style
        { maxPlayers: { $gt: 0 } },
        { gameType: { $regex: ".*" } },
        { isPrivate: { $exists: true } }
      ];

      for (const attackData of typeCoercionAttacks) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            gameType: 'duel',
            wagerAmount: 1.0,
            isPrivate: false,
            maxPlayers: 2,
            ...attackData
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Validation Error|Security Violation/);
      }
    });
  });

  describe('Second-Order SQL Injection Tests', () => {
    test('should prevent second-order SQL injection through stored data', async () => {
      // Attempt to store malicious data that could be executed later
      const maliciousUsername = "admin'; DROP TABLE players; --";
      
      const userResponse = await request(app)
        .post('/api/auth/register')
        .send({
          username: maliciousUsername,
          email: 'secondorder@test.com',
          password: 'Password123!',
          walletAddress: '22222222222222222222222222222222'
        });

      expect(userResponse.status).toBe(400);
      expect(userResponse.body.error).toBe('Security Violation');
    });

    test('should sanitize data retrieved from database', async () => {
      // Create a game and verify stored data is safe
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2
        });

      expect(gameResponse.status).toBe(201);
      const gameId = gameResponse.body.data.game.id;

      // Retrieve the game and verify data integrity
      const retrieveResponse = await request(app)
        .get(`/api/games/${gameId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(retrieveResponse.status).toBe(200);
      expect(retrieveResponse.body.data.game).toBeDefined();
      expect(typeof retrieveResponse.body.data.game.gameType).toBe('string');
      expect(typeof retrieveResponse.body.data.game.wagerAmount).toBe('number');
    });
  });

  describe('Blind SQL Injection Tests', () => {
    test('should prevent boolean-based blind SQL injection', async () => {
      const blindSQLTests = [
        "' AND (SELECT COUNT(*) FROM players) > 0; --",
        "' AND (SELECT LENGTH(password) FROM players WHERE id=1) > 5; --",
        "' AND SUBSTRING((SELECT password FROM players WHERE id=1),1,1)='a'; --",
        "' AND (SELECT COUNT(*) FROM games WHERE status='waiting') > (SELECT COUNT(*) FROM games WHERE status='active'); --"
      ];

      for (const blindTest of blindSQLTests) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: blindTest });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent time-based blind SQL injection', async () => {
      const timingAttacks = [
        "'; WAITFOR DELAY '00:00:05'; --",
        "' AND (SELECT COUNT(*) FROM players) = 1; WAITFOR DELAY '00:00:05'; --",
        "'; IF (1=1) WAITFOR DELAY '00:00:05'; --",
        "' OR SLEEP(5); --",
        "' UNION SELECT SLEEP(5); --"
      ];

      for (const timingAttack of timingAttacks) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ gameType: timingAttack });

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
        expect(duration).toBeLessThan(1000); // Should not cause delays
      }
    });
  });

  describe('Database-Specific SQL Injection Tests', () => {
    test('should prevent PostgreSQL-specific injection attacks', async () => {
      const postgresAttacks = [
        "'; COPY (SELECT * FROM players) TO '/tmp/dump.txt'; --",
        "'; CREATE FUNCTION malicious() RETURNS void AS $$ BEGIN DROP TABLE players; END; $$ LANGUAGE plpgsql; --",
        "' UNION SELECT version(), current_database(), current_user; --",
        "'; SELECT pg_sleep(5); --"
      ];

      for (const attack of postgresAttacks) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: attack });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should prevent MySQL-specific injection attacks', async () => {
      const mysqlAttacks = [
        "'; SELECT @@version; --",
        "'; SELECT LOAD_FILE('/etc/passwd'); --",
        "' UNION SELECT user(), database(), version(); --",
        "'; SELECT * FROM mysql.user; --"
      ];

      for (const attack of mysqlAttacks) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ gameType: attack });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });
  });

  describe('Error Message Information Disclosure', () => {
    test('should not leak database schema information in error messages', async () => {
      const response = await request(app)
        .get('/api/games/invalid-game-id-format')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.message).not.toMatch(/table|column|database|sql|query|syntax/i);
    });

    test('should not expose internal database errors', async () => {
      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'invalid-type',
          wagerAmount: 'invalid-amount',
          maxPlayers: 'invalid-number'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).not.toMatch(/constraint|foreign key|primary key|duplicate/i);
      expect(response.body.error).toMatch(/Validation Error|Invalid Input/);
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testUser) {
      // Clean up test user and related data
    }
  });
});