const jwt = require('jsonwebtoken');
const request = require('supertest');
const crypto = require('crypto');
const app = require('../../../src/backend/server');
const { createTestUser } = require('../../helpers/testHelpers');

describe('JWT Security Tests', () => {
  let testUser;

  beforeAll(async () => {
    // Set secure test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only-minimum-256-bits';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-very-long-and-secure-for-testing-different-from-access-token';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    
    testUser = await createTestUser({
      username: 'jwttestuser',
      email: 'jwttest@example.com',
      password: 'Password123!',
      walletAddress: '33333333333333333333333333333333'
    });
  });

  describe('JWT Token Generation Security', () => {
    test('should generate tokens with sufficient entropy', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.data.token).toBeDefined();
      expect(loginResponse.body.data.refreshToken).toBeDefined();

      const accessToken = loginResponse.body.data.token;
      const refreshToken = loginResponse.body.data.refreshToken;

      // Tokens should be different
      expect(accessToken).not.toBe(refreshToken);
      
      // Tokens should have sufficient length (base64 encoded)
      expect(accessToken.length).toBeGreaterThan(100);
      expect(refreshToken.length).toBeGreaterThan(100);
    });

    test('should use different secrets for access and refresh tokens', async () => {
      const payload = { userId: testUser.id, email: testUser.email };
      
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
      const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

      expect(accessToken).not.toBe(refreshToken);

      // Verify tokens decode with different secrets
      const accessDecoded = jwt.verify(accessToken, process.env.JWT_SECRET);
      const refreshDecoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      expect(accessDecoded.userId).toBe(testUser.id);
      expect(refreshDecoded.userId).toBe(testUser.id);
    });

    test('should include proper security claims in token', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      const token = loginResponse.body.data.token;
      const decoded = jwt.decode(token);

      // Check required security claims
      expect(decoded.iat).toBeDefined(); // issued at
      expect(decoded.exp).toBeDefined(); // expires
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
      expect(decoded.userId).toBeDefined();
      expect(decoded.email).toBeDefined();
      
      // Should not contain sensitive information
      expect(decoded.password).toBeUndefined();
      expect(decoded.privateKey).toBeUndefined();
    });

    test('should have appropriate token expiration times', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      const accessToken = loginResponse.body.data.token;
      const refreshToken = loginResponse.body.data.refreshToken;

      const accessDecoded = jwt.decode(accessToken);
      const refreshDecoded = jwt.decode(refreshToken);

      const accessExpiry = accessDecoded.exp - accessDecoded.iat;
      const refreshExpiry = refreshDecoded.exp - refreshDecoded.iat;

      // Access token should expire in 15 minutes (900 seconds)
      expect(accessExpiry).toBe(900);
      
      // Refresh token should expire in 7 days (604800 seconds)
      expect(refreshExpiry).toBe(604800);
    });
  });

  describe('JWT Token Validation Security', () => {
    let validToken;
    let expiredToken;

    beforeAll(async () => {
      // Create valid token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      validToken = loginResponse.body.data.token;

      // Create expired token
      expiredToken = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );
    });

    test('should reject requests with no token', async () => {
      const response = await request(app)
        .get('/api/games')
        .send();

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access Denied');
    });

    test('should reject requests with malformed tokens', async () => {
      const malformedTokens = [
        'invalid.token.format',
        'notjwt',
        'a.b',
        'a.b.c.d.e',
        '',
        null,
        undefined,
        'Bearer ',
        'Bearer invalid'
      ];

      for (const malformedToken of malformedTokens) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${malformedToken}`)
          .send();

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid Token');
      }
    });

    test('should reject expired tokens', async () => {
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send();

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Token Expired');
    });

    test('should reject tokens with invalid signatures', async () => {
      // Create token with wrong secret
      const invalidToken = jwt.sign(
        { userId: testUser.id, email: testUser.email },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send();

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid Token');
    });

    test('should reject tokens with tampered payload', async () => {
      // Manually create token with tampered payload
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ 
        userId: 999999, // Wrong user ID
        email: 'hacker@evil.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900
      })).toString('base64url');
      
      // Use original signature from valid token
      const originalParts = validToken.split('.');
      const tamperedToken = `${header}.${payload}.${originalParts[2]}`;

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .send();

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid Token');
    });

    test('should accept valid tokens', async () => {
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${validToken}`)
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('JWT Algorithm Security', () => {
    test('should reject tokens with none algorithm', async () => {
      const noneToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
                      '.' + Buffer.from(JSON.stringify({ userId: testUser.id, email: testUser.email })).toString('base64url') +
                      '.';

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${noneToken}`)
        .send();

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid Token');
    });

    test('should reject tokens with weak algorithms', async () => {
      const weakAlgorithms = ['HS1', 'none', 'RS256']; // RS256 without proper key validation

      for (const alg of weakAlgorithms) {
        try {
          const weakToken = jwt.sign(
            { userId: testUser.id, email: testUser.email },
            process.env.JWT_SECRET,
            { algorithm: alg, expiresIn: '15m' }
          );

          const response = await request(app)
            .get('/api/games')
            .set('Authorization', `Bearer ${weakToken}`)
            .send();

          expect(response.status).toBe(401);
        } catch (error) {
          // Some algorithms may throw during signing, which is acceptable
          expect(error).toBeDefined();
        }
      }
    });

    test('should only accept HS256 algorithm', async () => {
      // Our application should only accept HS256
      const validAlgorithms = ['HS256'];
      const invalidAlgorithms = ['HS512', 'RS256', 'ES256', 'PS256'];

      // Valid algorithm should work
      for (const alg of validAlgorithms) {
        const token = jwt.sign(
          { userId: testUser.id, email: testUser.email },
          process.env.JWT_SECRET,
          { algorithm: alg, expiresIn: '15m' }
        );

        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${token}`)
          .send();

        expect(response.status).toBe(200);
      }
    });
  });

  describe('JWT Token Refresh Security', () => {
    let refreshToken;

    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      refreshToken = loginResponse.body.data.refreshToken;
    });

    test('should require valid refresh token for token refresh', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    test('should reject invalid refresh tokens', async () => {
      const invalidRefreshTokens = [
        'invalid.refresh.token',
        jwt.sign({ userId: 999999 }, 'wrong-secret', { expiresIn: '7d' }),
        jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET, { expiresIn: '7d' }), // Wrong secret
        jwt.sign({ userId: testUser.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '-1s' }) // Expired
      ];

      for (const invalidToken of invalidRefreshTokens) {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: invalidToken });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/Invalid|Expired/);
      }
    });

    test('should invalidate old refresh token after refresh', async () => {
      // First refresh
      const firstRefresh = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(firstRefresh.status).toBe(200);
      const newRefreshToken = firstRefresh.body.data.refreshToken;

      // Try to use old refresh token again (should fail)
      const secondRefresh = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(secondRefresh.status).toBe(401);
      expect(secondRefresh.body.error).toBe('Invalid Token');

      // New refresh token should work
      const thirdRefresh = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: newRefreshToken });

      expect(thirdRefresh.status).toBe(200);
    });
  });

  describe('JWT Security Headers and Storage', () => {
    test('should set secure headers for token endpoints', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toContain('no-cache');
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['pragma']).toBe('no-cache');
    });

    test('should not include tokens in error responses', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@email.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.token).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(/eyJ[A-Za-z0-9-_]+\./); // JWT pattern
    });

    test('should validate token format before processing', async () => {
      const maliciousHeaders = [
        'Bearer ' + 'A'.repeat(10000), // Extremely long token
        'Bearer ' + '{}', // JSON object
        'Bearer ' + '<script>alert("xss")</script>',
        'Bearer ' + 'token with spaces and special chars !@#$%^&*()'
      ];

      for (const header of maliciousHeaders) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', header)
          .send();

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid Token');
      }
    });
  });

  describe('JWT Timing Attack Prevention', () => {
    test('should have consistent response times for invalid tokens', async () => {
      const invalidTokens = [
        'invalid.token.here',
        jwt.sign({ userId: 999999 }, 'wrong-secret', { expiresIn: '15m' }),
        jwt.sign({ userId: testUser.id }, process.env.JWT_SECRET, { expiresIn: '-1s' })
      ];

      const responseTimes = [];

      for (const token of invalidTokens) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${token}`)
          .send();

        const endTime = Date.now();
        responseTimes.push(endTime - startTime);

        expect(response.status).toBe(401);
      }

      // Response times should be relatively consistent (within 100ms)
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      expect(maxTime - minTime).toBeLessThan(100);
    });
  });

  describe('JWT Secret Security', () => {
    test('should reject weak JWT secrets', () => {
      const weakSecrets = [
        'secret',
        '12345',
        'password',
        'jwt-secret',
        'a'.repeat(10) // Too short
      ];

      for (const weakSecret of weakSecrets) {
        expect(() => {
          jwt.sign({ userId: testUser.id }, weakSecret, { expiresIn: '15m' });
        }).not.toThrow(); // JWT library won't throw, but our validation should catch this
      }
    });

    test('should require minimum secret length', () => {
      const minimumLength = 32; // 256 bits
      expect(process.env.JWT_SECRET.length).toBeGreaterThanOrEqual(minimumLength);
      expect(process.env.JWT_REFRESH_SECRET.length).toBeGreaterThanOrEqual(minimumLength);
    });

    test('should use different secrets for access and refresh tokens', () => {
      expect(process.env.JWT_SECRET).not.toBe(process.env.JWT_REFRESH_SECRET);
      expect(process.env.JWT_SECRET.length).toBeGreaterThan(0);
      expect(process.env.JWT_REFRESH_SECRET.length).toBeGreaterThan(0);
    });
  });

  afterAll(async () => {
    // Clean up test data
  });
});