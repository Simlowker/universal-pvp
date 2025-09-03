const request = require('supertest');
const app = require('../../../src/backend/server');
const { createTestUser, createTestToken } = require('../../helpers/testHelpers');

describe('Edge Case and Attack Vector Security Tests', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only-minimum-256-bits';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-different-from-access-token-also-very-long-and-secure';

    testUser = await createTestUser({
      username: 'edgecaseuser',
      email: 'edgecase@test.com',
      password: 'Password123!',
      walletAddress: '77777777777777777777777777777777'
    });

    authToken = createTestToken(testUser.id);
  });

  describe('Unicode and Character Encoding Attacks', () => {
    test('should handle Unicode normalization attacks', async () => {
      const unicodeAttacks = [
        'café', // é as single character
        'cafe\u0301', // e + combining accent
        'c\u0061\u0300fe\u0301', // Multiple combining characters
        '\u2028\u2029', // Line/paragraph separators
        '\uFEFF', // Byte order mark
        '\u00AD', // Soft hyphen
        '\u200B', // Zero width space
        '\u2060', // Word joiner
        'test\u0000user', // Null byte injection
        'admin\uD83D\uDE00user' // Emoji injection
      ];

      for (const maliciousUsername of unicodeAttacks) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: maliciousUsername,
            email: `unicode${Date.now()}@test.com`,
            password: 'Password123!',
            walletAddress: '88888888888888888888888888888888'
          });

        expect([200, 201, 400]).toContain(response.status);
        
        if (response.status === 400) {
          expect(response.body.error).toBe('Security Violation');
        }
      }
    });

    test('should prevent homograph attacks', async () => {
      const homographAttacks = [
        'аdmin', // Cyrillic 'а' instead of Latin 'a'
        'admin', // Normal admin
        'аdmіn', // Cyrillic 'а' and 'і'
        'αdmin', // Greek alpha
        '℃°admin', // Special characters that look similar
        'admin⁰¹', // Superscript numbers
        'admin︀', // Variation selectors
        '𝐚𝐝𝐦𝐢𝐧' // Mathematical alphanumeric symbols
      ];

      for (const maliciousUsername of homographAttacks) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: maliciousUsername,
            email: `homograph${Date.now()}@test.com`,
            password: 'Password123!',
            walletAddress: '99999999999999999999999999999999'
          });

        expect([200, 201, 400]).toContain(response.status);
        
        // Should detect and prevent suspicious character combinations
        if (maliciousUsername !== 'admin' && response.status === 400) {
          expect(response.body.error).toBe('Security Violation');
        }
      }
    });

    test('should handle RTL/LTR override attacks', async () => {
      const directionalAttacks = [
        'user\u202Eadmin', // Right-to-left override
        'admin\u202Duser', // Left-to-right override
        'test\u2066admin\u2069', // Left-to-right isolate
        'user\u2067admin\u2069', // Right-to-left isolate
        'admin\u2068test\u2069' // First strong isolate
      ];

      for (const maliciousText of directionalAttacks) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            gameType: maliciousText,
            wagerAmount: 1.0,
            isPrivate: false,
            maxPlayers: 2
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
      }
    });
  });

  describe('HTTP Protocol Attacks', () => {
    test('should prevent HTTP request smuggling', async () => {
      const smugglingPayloads = [
        'GET /api/games HTTP/1.1\r\nHost: evil.com\r\n\r\nGET /api/admin',
        'POST /api/games HTTP/1.1\r\nContent-Length: 0\r\n\r\nGET /secret',
        'GET /api/games HTTP/1.1\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n'
      ];

      for (const payload of smugglingPayloads) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .set('X-Malicious-Header', payload);

        expect(response.status).toBe(200); // Should process normally, ignoring malicious header
        expect(response.body.success).toBe(true);
      }
    });

    test('should prevent HTTP response splitting', async () => {
      const responseSplittingPayloads = [
        'test\r\nSet-Cookie: admin=true',
        'game\r\nLocation: http://evil.com',
        'value\r\n\r\n<script>alert(1)</script>',
        'data\nContent-Type: text/html\n\n<html><script>alert(1)</script></html>'
      ];

      for (const payload of responseSplittingPayloads) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: payload });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Security Violation');
        
        // Verify no malicious headers were set
        expect(response.headers['set-cookie']).not.toContain('admin=true');
        expect(response.headers['location']).not.toContain('evil.com');
      }
    });

    test('should handle oversized headers', async () => {
      const largeHeader = 'A'.repeat(8192); // 8KB header

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Large-Header', largeHeader);

      // Should either process normally or reject with 431
      expect([200, 431]).toContain(response.status);
    });

    test('should prevent header injection attacks', async () => {
      const headerInjectionPayloads = [
        'value\r\nX-Injected-Header: malicious',
        'test\nSet-Cookie: session=hijacked',
        'data\r\nContent-Length: 0\r\n\r\nHTTP/1.1 200 OK',
        'payload\x00\r\nX-Evil: true'
      ];

      for (const payload of headerInjectionPayloads) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .set('X-Custom-Header', payload)
          .send({
            gameType: 'duel',
            wagerAmount: 1.0,
            isPrivate: false,
            maxPlayers: 2
          });

        expect([200, 201, 400]).toContain(response.status);
        
        // Verify no malicious headers were injected
        expect(response.headers['x-injected-header']).toBeUndefined();
        expect(response.headers['x-evil']).toBeUndefined();
      }
    });
  });

  describe('Race Condition and Concurrency Attacks', () => {
    test('should prevent race conditions in game creation', async () => {
      const concurrentRequests = Array(10).fill().map(() => 
        request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            gameType: 'duel',
            wagerAmount: 1.0,
            isPrivate: false,
            maxPlayers: 2
          })
      );

      const responses = await Promise.all(concurrentRequests);
      const successfulCreations = responses.filter(res => res.status === 201);

      // Should have proper rate limiting or resource constraints
      expect(successfulCreations.length).toBeLessThan(10);
    });

    test('should handle concurrent user registrations', async () => {
      const timestamp = Date.now();
      const concurrentRegistrations = Array(5).fill().map((_, index) =>
        request(app)
          .post('/api/auth/register')
          .send({
            username: `concurrent${timestamp}${index}`,
            email: `concurrent${timestamp}${index}@test.com`,
            password: 'Password123!',
            walletAddress: `${timestamp}${index}`.padStart(32, '0').substr(0, 32)
          })
      );

      const responses = await Promise.all(concurrentRegistrations);
      const successful = responses.filter(res => res.status === 201);

      // All should succeed as they have unique data
      expect(successful.length).toBe(5);
    });

    test('should prevent double-spending in game joins', async () => {
      // Create a game first
      const gameResponse = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 5.0,
          isPrivate: false,
          maxPlayers: 2
        });

      expect(gameResponse.status).toBe(201);
      const gameId = gameResponse.body.data.game.id;

      // Create second user
      const testUser2 = await createTestUser({
        username: 'raceuser2',
        email: 'race2@test.com',
        password: 'Password123!',
        walletAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      });
      const authToken2 = createTestToken(testUser2.id);

      // Attempt concurrent joins
      const concurrentJoins = Array(3).fill().map(() =>
        request(app)
          .post(`/api/games/${gameId}/join`)
          .set('Authorization', `Bearer ${authToken2}`)
          .send({ wagerAmount: 5.0 })
      );

      const responses = await Promise.all(concurrentJoins);
      const successful = responses.filter(res => res.status === 200);

      // Only one should succeed
      expect(successful.length).toBe(1);
    });
  });

  describe('Memory and Resource Exhaustion', () => {
    test('should prevent memory exhaustion through large payloads', async () => {
      const largeArray = Array(10000).fill().map((_, i) => ({
        id: i,
        data: 'A'.repeat(1000)
      }));

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'tournament',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 8,
          settings: {
            participants: largeArray
          }
        });

      expect(response.status).toBe(413); // Payload too large
    });

    test('should prevent ReDoS (Regular Expression Denial of Service)', async () => {
      const redosPayloads = [
        'a'.repeat(10000) + '!', // For email validation
        '(' + 'a'.repeat(100) + ')*b', // Catastrophic backtracking
        'a'.repeat(50000), // Very long string
        'x'.repeat(1000) + 'y' // Pattern that might cause backtracking
      ];

      for (const payload of redosPayloads) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: 'redostest',
            email: payload + '@test.com',
            password: 'Password123!',
            walletAddress: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
          });

        const duration = Date.now() - startTime;

        // Should complete quickly regardless of input
        expect(duration).toBeLessThan(5000);
        expect([400, 413]).toContain(response.status);
      }
    });

    test('should limit recursive operations', async () => {
      const deepNestedObject = {};
      let current = deepNestedObject;
      
      // Create deeply nested object
      for (let i = 0; i < 1000; i++) {
        current.nested = {};
        current = current.nested;
      }

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2,
          settings: deepNestedObject
        });

      expect([400, 413]).toContain(response.status);
    });
  });

  describe('Timing and Side-Channel Attacks', () => {
    test('should have consistent response times for authentication failures', async () => {
      const invalidCredentials = [
        { email: 'nonexistent@test.com', password: 'wrongpassword' },
        { email: testUser.email, password: 'wrongpassword' },
        { email: 'invalid-email', password: 'Password123!' },
        { email: '', password: '' }
      ];

      const responseTimes = [];

      for (const creds of invalidCredentials) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/auth/login')
          .send(creds);

        const duration = Date.now() - startTime;
        responseTimes.push(duration);

        expect(response.status).toBe(401);
      }

      // Response times should be relatively consistent (within 500ms)
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      expect(maxTime - minTime).toBeLessThan(500);
    });

    test('should prevent information disclosure through error timing', async () => {
      const queries = [
        { gameType: 'existing-type' },
        { gameType: 'nonexistent-type' },
        { gameType: '' },
        { gameType: null }
      ];

      const responseTimes = [];

      for (const query of queries) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query(query);

        const duration = Date.now() - startTime;
        responseTimes.push(duration);

        expect([200, 400]).toContain(response.status);
      }

      // Similar response times regardless of query validity
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      expect(maxTime - minTime).toBeLessThan(200);
    });

    test('should prevent cache timing attacks', async () => {
      // First request (cache miss)
      const startTime1 = Date.now();
      const response1 = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'waiting', gameType: 'duel' });
      const duration1 = Date.now() - startTime1;

      expect(response1.status).toBe(200);

      // Second request (cache hit)
      const startTime2 = Date.now();
      const response2 = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'waiting', gameType: 'duel' });
      const duration2 = Date.now() - startTime2;

      expect(response2.status).toBe(200);

      // Timing differences should not reveal caching behavior
      const timingDifference = Math.abs(duration1 - duration2);
      expect(timingDifference).toBeLessThan(100);
    });
  });

  describe('Business Logic Attacks', () => {
    test('should prevent negative value attacks', async () => {
      const negativeValues = [-1, -100, -0.01, Number.MIN_SAFE_INTEGER];

      for (const value of negativeValues) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            gameType: 'duel',
            wagerAmount: value,
            isPrivate: false,
            maxPlayers: 2
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Validation Error|Invalid/);
      }
    });

    test('should prevent integer overflow attacks', async () => {
      const overflowValues = [
        Number.MAX_SAFE_INTEGER + 1,
        Number.MAX_VALUE,
        Infinity,
        Number.POSITIVE_INFINITY,
        2**53,
        999999999999999999999
      ];

      for (const value of overflowValues) {
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            gameType: 'duel',
            wagerAmount: value,
            isPrivate: false,
            maxPlayers: 2
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Validation Error|Invalid/);
      }
    });

    test('should prevent state manipulation attacks', async () => {
      // Create a game
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

      // Attempt to directly manipulate game state
      const manipulationAttempts = [
        { status: 'completed', winner: testUser.id },
        { wagerAmount: 100.0 },
        { maxPlayers: 1 },
        { createdBy: 'different-user-id' }
      ];

      for (const manipulation of manipulationAttempts) {
        const response = await request(app)
          .put(`/api/games/${gameId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(manipulation);

        expect([403, 404, 405]).toContain(response.status); // Should not allow direct updates
      }
    });

    test('should prevent workflow bypass attacks', async () => {
      // Create a game
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

      // Attempt to make moves before joining
      const prematureMove = await request(app)
        .post(`/api/games/${gameId}/move`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          moveType: 'attack',
          data: { target: 'opponent' },
          timestamp: Date.now()
        });

      expect(prematureMove.status).toBe(400);
      expect(prematureMove.body.error).toMatch(/Game Not Active|Invalid/);

      // Attempt to surrender before game starts
      const prematureSurrender = await request(app)
        .post(`/api/games/${gameId}/surrender`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(prematureSurrender.status).toBe(400);
      expect(prematureSurrender.body.error).toMatch(/Game Not Active|Invalid/);
    });
  });

  afterAll(async () => {
    // Cleanup
  });
});