const request = require('supertest');
const app = require('../../../src/backend/server');
const { createTestUser, createTestToken, performanceMonitor } = require('../../helpers/testHelpers');

describe('Security Performance Impact Tests', () => {
  let testUser;
  let authToken;
  let performanceBaseline = {};

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only-minimum-256-bits';
    
    testUser = await createTestUser({
      username: 'perfuser',
      email: 'perf@test.com',
      password: 'Password123!',
      walletAddress: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    });

    authToken = createTestToken(testUser.id);

    // Establish performance baselines
    await establishBaselines();
  });

  async function establishBaselines() {
    // Measure baseline performance without security overhead
    const iterations = 10;
    const endpoints = [
      { method: 'GET', path: '/api/games', data: null },
      { method: 'POST', path: '/api/games', data: { gameType: 'duel', wagerAmount: 1.0, isPrivate: false, maxPlayers: 2 }},
      { method: 'POST', path: '/api/auth/login', data: { email: testUser.email, password: 'Password123!' }}
    ];

    for (const endpoint of endpoints) {
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        let req = request(app)[endpoint.method.toLowerCase()](endpoint.path);
        
        if (endpoint.path !== '/api/auth/login') {
          req = req.set('Authorization', `Bearer ${authToken}`);
        }
        
        if (endpoint.data) {
          req = req.send(endpoint.data);
        }

        await req;
        
        const endTime = process.hrtime.bigint();
        times.push(Number(endTime - startTime) / 1000000); // Convert to milliseconds
      }

      performanceBaseline[`${endpoint.method}_${endpoint.path.replace(/[^a-zA-Z]/g, '_')}`] = {
        average: times.reduce((a, b) => a + b) / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        p95: times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]
      };
    }
  }

  describe('Authentication Performance Impact', () => {
    test('should not significantly impact response times with JWT validation', async () => {
      const iterations = 50;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`);

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        responseTimes.push(duration);
        expect(response.status).toBe(200);
      }

      const avgResponseTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      const baseline = performanceBaseline.GET__api_games;
      
      // JWT validation should not increase response time by more than 50%
      expect(avgResponseTime).toBeLessThan(baseline.average * 1.5);
      expect(p95ResponseTime).toBeLessThan(baseline.p95 * 1.5);
      
      console.log(`JWT Validation Impact: ${avgResponseTime.toFixed(2)}ms avg (baseline: ${baseline.average.toFixed(2)}ms)`);
    });

    test('should handle high concurrency with JWT validation', async () => {
      const concurrency = 20;
      const requestsPerClient = 5;

      const startTime = process.hrtime.bigint();
      
      const clients = Array(concurrency).fill().map(async () => {
        const clientTimes = [];
        
        for (let i = 0; i < requestsPerClient; i++) {
          const reqStart = process.hrtime.bigint();
          
          const response = await request(app)
            .get('/api/games')
            .set('Authorization', `Bearer ${authToken}`);
          
          const reqEnd = process.hrtime.bigint();
          clientTimes.push(Number(reqEnd - reqStart) / 1000000);
          
          expect(response.status).toBe(200);
        }
        
        return clientTimes;
      });

      const allResults = await Promise.all(clients);
      const endTime = process.hrtime.bigint();
      
      const totalDuration = Number(endTime - startTime) / 1000000;
      const totalRequests = concurrency * requestsPerClient;
      const throughput = totalRequests / (totalDuration / 1000); // Requests per second

      // Should maintain reasonable throughput
      expect(throughput).toBeGreaterThan(10); // At least 10 req/s
      
      // Individual request times should remain reasonable
      const allTimes = allResults.flat();
      const avgTime = allTimes.reduce((a, b) => a + b) / allTimes.length;
      expect(avgTime).toBeLessThan(1000); // Less than 1 second average

      console.log(`Concurrent JWT Performance: ${throughput.toFixed(2)} req/s, ${avgTime.toFixed(2)}ms avg`);
    });

    test('should efficiently handle token refresh operations', async () => {
      const refreshCycles = 10;
      const refreshTimes = [];

      let currentRefreshToken;
      
      // Get initial refresh token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });
      
      currentRefreshToken = loginResponse.body.data.refreshToken;

      for (let i = 0; i < refreshCycles; i++) {
        const startTime = process.hrtime.bigint();
        
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: currentRefreshToken });

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        refreshTimes.push(duration);
        expect(response.status).toBe(200);
        
        currentRefreshToken = response.body.data.refreshToken;
      }

      const avgRefreshTime = refreshTimes.reduce((a, b) => a + b) / refreshTimes.length;
      const maxRefreshTime = Math.max(...refreshTimes);

      // Token refresh should be fast
      expect(avgRefreshTime).toBeLessThan(100); // Less than 100ms average
      expect(maxRefreshTime).toBeLessThan(500); // Less than 500ms maximum

      console.log(`Token Refresh Performance: ${avgRefreshTime.toFixed(2)}ms avg, ${maxRefreshTime.toFixed(2)}ms max`);
    });
  });

  describe('Input Validation Performance Impact', () => {
    test('should efficiently validate and sanitize inputs', async () => {
      const validationTests = [
        {
          name: 'Simple validation',
          data: { gameType: 'duel', wagerAmount: 1.0, isPrivate: false, maxPlayers: 2 }
        },
        {
          name: 'Complex validation',
          data: {
            gameType: 'tournament',
            wagerAmount: 5.0,
            isPrivate: true,
            maxPlayers: 8,
            timeLimit: 1800,
            settings: {
              rounds: 3,
              elimination: true,
              rewards: [50, 30, 20],
              restrictions: ['no-bots', 'verified-only']
            }
          }
        },
        {
          name: 'Large data validation',
          data: {
            gameType: 'custom',
            wagerAmount: 2.5,
            isPrivate: false,
            maxPlayers: 4,
            settings: {
              customRules: 'A'.repeat(1000), // Large text field
              participants: Array(100).fill().map((_, i) => ({ id: i, name: `Player${i}` }))
            }
          }
        }
      ];

      for (const test of validationTests) {
        const iterations = 20;
        const times = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = process.hrtime.bigint();
          
          const response = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${authToken}`)
            .send(test.data);

          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000;
          
          times.push(duration);
          expect([200, 201, 400, 413]).toContain(response.status);
        }

        const avgTime = times.reduce((a, b) => a + b) / times.length;
        const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

        // Validation should not add more than 100ms overhead
        expect(avgTime).toBeLessThan(performanceBaseline.POST__api_games.average + 100);
        expect(p95Time).toBeLessThan(1000); // P95 under 1 second

        console.log(`${test.name}: ${avgTime.toFixed(2)}ms avg, ${p95Time.toFixed(2)}ms p95`);
      }
    });

    test('should handle malicious input efficiently', async () => {
      const maliciousInputs = [
        { gameType: "'; DROP TABLE games; --", wagerAmount: 1.0 },
        { gameType: '<script>alert("xss")</script>', wagerAmount: 1.0 },
        { gameType: 'A'.repeat(10000), wagerAmount: 1.0 }, // Very long string
        { gameType: 'normal', wagerAmount: "'; UPDATE players SET balance=999999; --" }
      ];

      const detectionTimes = [];

      for (const maliciousData of maliciousInputs) {
        const startTime = process.hrtime.bigint();
        
        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            ...maliciousData,
            isPrivate: false,
            maxPlayers: 2
          });

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        detectionTimes.push(duration);
        expect(response.status).toBe(400); // Should be rejected
        expect(response.body.error).toBe('Security Violation');
      }

      const avgDetectionTime = detectionTimes.reduce((a, b) => a + b) / detectionTimes.length;
      const maxDetectionTime = Math.max(...detectionTimes);

      // Malicious input detection should be fast
      expect(avgDetectionTime).toBeLessThan(50); // Under 50ms average
      expect(maxDetectionTime).toBeLessThan(200); // Under 200ms maximum

      console.log(`Malicious Input Detection: ${avgDetectionTime.toFixed(2)}ms avg, ${maxDetectionTime.toFixed(2)}ms max`);
    });
  });

  describe('Database Security Performance', () => {
    test('should maintain query performance with parameterization', async () => {
      const queryTypes = [
        { name: 'Simple SELECT', params: { status: 'waiting' } },
        { name: 'Filtered SELECT', params: { status: 'waiting', gameType: 'duel', minWager: '1.0' } },
        { name: 'Paginated SELECT', params: { page: '1', limit: '20' } },
        { name: 'Complex SELECT', params: { status: 'active', gameType: 'tournament', minWager: '5.0', maxWager: '50.0' } }
      ];

      for (const query of queryTypes) {
        const iterations = 30;
        const queryTimes = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = process.hrtime.bigint();
          
          const response = await request(app)
            .get('/api/games')
            .set('Authorization', `Bearer ${authToken}`)
            .query(query.params);

          const endTime = process.hrtime.bigint();
          const duration = Number(endTime - startTime) / 1000000;
          
          queryTimes.push(duration);
          expect(response.status).toBe(200);
        }

        const avgQueryTime = queryTimes.reduce((a, b) => a + b) / queryTimes.length;
        const p95QueryTime = queryTimes.sort((a, b) => a - b)[Math.floor(queryTimes.length * 0.95)];

        // Parameterized queries should not significantly impact performance
        expect(avgQueryTime).toBeLessThan(500); // Under 500ms
        expect(p95QueryTime).toBeLessThan(1000); // P95 under 1 second

        console.log(`${query.name}: ${avgQueryTime.toFixed(2)}ms avg, ${p95QueryTime.toFixed(2)}ms p95`);
      }
    });

    test('should efficiently handle connection pooling with security constraints', async () => {
      const concurrentQueries = 50;
      const startTime = process.hrtime.bigint();

      const queries = Array(concurrentQueries).fill().map(async (_, index) => {
        const queryStart = process.hrtime.bigint();
        
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ 
            status: index % 2 === 0 ? 'waiting' : 'active',
            page: Math.floor(index / 10) + 1
          });

        const queryEnd = process.hrtime.bigint();
        
        expect(response.status).toBe(200);
        return Number(queryEnd - queryStart) / 1000000;
      });

      const queryTimes = await Promise.all(queries);
      const endTime = process.hrtime.bigint();
      
      const totalDuration = Number(endTime - startTime) / 1000000;
      const avgQueryTime = queryTimes.reduce((a, b) => a + b) / queryTimes.length;
      const throughput = concurrentQueries / (totalDuration / 1000);

      // Should handle concurrent queries efficiently
      expect(avgQueryTime).toBeLessThan(1000); // Average under 1 second
      expect(throughput).toBeGreaterThan(5); // At least 5 queries/second

      console.log(`Concurrent Query Performance: ${throughput.toFixed(2)} q/s, ${avgQueryTime.toFixed(2)}ms avg`);
    });
  });

  describe('Rate Limiting Performance Impact', () => {
    test('should efficiently implement rate limiting', async () => {
      const iterations = 30;
      const rateLimitTimes = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@test.com',
            password: 'wrongpassword'
          });

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        rateLimitTimes.push(duration);
        
        if (i < 10) {
          expect(response.status).toBe(401); // Normal failures
        } else {
          expect([401, 429]).toContain(response.status); // May hit rate limit
        }
      }

      const avgTime = rateLimitTimes.reduce((a, b) => a + b) / rateLimitTimes.length;
      const rateLimitedRequests = rateLimitTimes.slice(10); // Later requests
      const avgRateLimitedTime = rateLimitedRequests.reduce((a, b) => a + b) / rateLimitedRequests.length;

      // Rate limiting should not significantly increase response time
      expect(avgTime).toBeLessThan(200); // Under 200ms average
      expect(avgRateLimitedTime).toBeLessThan(avgTime * 1.5); // Rate limited responses shouldn't be much slower

      console.log(`Rate Limiting Impact: ${avgTime.toFixed(2)}ms avg, ${avgRateLimitedTime.toFixed(2)}ms rate-limited avg`);
    });

    test('should handle burst traffic efficiently', async () => {
      const burstSize = 100;
      const burstInterval = 100; // 100ms between bursts
      const burstsCount = 5;

      const allResponseTimes = [];
      const burstResults = [];

      for (let burst = 0; burst < burstsCount; burst++) {
        const burstStartTime = process.hrtime.bigint();
        
        // Create burst of requests
        const burstPromises = Array(burstSize).fill().map(async () => {
          const reqStart = process.hrtime.bigint();
          
          const response = await request(app)
            .get('/api/games')
            .set('Authorization', `Bearer ${authToken}`);

          const reqEnd = process.hrtime.bigint();
          const duration = Number(reqEnd - reqStart) / 1000000;
          
          allResponseTimes.push(duration);
          return { status: response.status, duration };
        });

        const burstResponses = await Promise.all(burstPromises);
        const burstEndTime = process.hrtime.bigint();
        const burstDuration = Number(burstEndTime - burstStartTime) / 1000000;
        
        burstResults.push({
          burst: burst + 1,
          duration: burstDuration,
          successful: burstResponses.filter(r => r.status === 200).length,
          rateLimited: burstResponses.filter(r => r.status === 429).length
        });

        // Wait between bursts
        if (burst < burstsCount - 1) {
          await new Promise(resolve => setTimeout(resolve, burstInterval));
        }
      }

      const avgResponseTime = allResponseTimes.reduce((a, b) => a + b) / allResponseTimes.length;
      const totalSuccessful = burstResults.reduce((sum, b) => sum + b.successful, 0);
      const totalRateLimited = burstResults.reduce((sum, b) => sum + b.rateLimited, 0);

      // Should handle bursts reasonably well
      expect(avgResponseTime).toBeLessThan(2000); // Under 2 seconds average
      expect(totalSuccessful).toBeGreaterThan(burstSize * burstsCount * 0.5); // At least 50% success
      expect(totalRateLimited).toBeGreaterThan(0); // Should have some rate limiting

      console.log(`Burst Traffic: ${avgResponseTime.toFixed(2)}ms avg, ${totalSuccessful}/${burstSize * burstsCount} successful`);
    });
  });

  describe('Security Headers Performance Impact', () => {
    test('should add security headers without significant overhead', async () => {
      const iterations = 50;
      const headerTimes = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`);

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        headerTimes.push(duration);
        expect(response.status).toBe(200);
        
        // Verify security headers are present
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-xss-protection']).toBe('1; mode=block');
        expect(response.headers['x-frame-options']).toBe('DENY');
      }

      const avgHeaderTime = headerTimes.reduce((a, b) => a + b) / headerTimes.length;
      const baseline = performanceBaseline.GET__api_games.average;

      // Security headers should add minimal overhead
      expect(avgHeaderTime).toBeLessThan(baseline + 10); // Less than 10ms additional overhead

      console.log(`Security Headers Impact: ${avgHeaderTime.toFixed(2)}ms (baseline: ${baseline.toFixed(2)}ms)`);
    });
  });

  describe('Memory Usage Impact', () => {
    test('should maintain reasonable memory usage under security load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Perform security-intensive operations
      const operations = Array(100).fill().map(async (_, index) => {
        // Mix of operations that engage security features
        const operations = [
          () => request(app).post('/api/auth/login').send({ email: `user${index}@test.com`, password: 'wrong' }),
          () => request(app).get('/api/games').set('Authorization', `Bearer ${authToken}`).query({ status: `malicious'; DROP TABLE games; --` }),
          () => request(app).post('/api/games').set('Authorization', `Bearer ${authToken}`).send({ gameType: '<script>alert(1)</script>', wagerAmount: 1.0, isPrivate: false, maxPlayers: 2 })
        ];

        const randomOp = operations[index % operations.length];
        await randomOp();
      });

      await Promise.all(operations);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      // Memory usage should not increase dramatically
      expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

      console.log(`Memory Impact: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase (${memoryIncreasePercent.toFixed(1)}%)`);
    });
  });

  afterAll(async () => {
    // Generate performance summary report
    console.log('\n=== Security Performance Summary ===');
    console.log('Baseline Performance:');
    Object.entries(performanceBaseline).forEach(([key, stats]) => {
      console.log(`  ${key}: ${stats.average.toFixed(2)}ms avg, ${stats.p95.toFixed(2)}ms p95`);
    });
  });
});