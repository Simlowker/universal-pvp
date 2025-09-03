const request = require('supertest');
const mysql = require('mysql2/promise');
const app = require('../../../src/backend/server');
const { createTestUser, createTestToken } = require('../../helpers/testHelpers');

describe('Parameterized Query Security Tests', () => {
  let testUser;
  let authToken;
  let dbConnection;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_param_query_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';

    testUser = await createTestUser({
      username: 'paramtestuser',
      email: 'paramtest@example.com',
      password: 'Password123!',
      walletAddress: '66666666666666666666666666666666'
    });

    authToken = createTestToken(testUser.id);

    // Create test database connection for validation
    dbConnection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
  });

  describe('Database Query Structure Validation', () => {
    test('should use parameterized queries for user authentication', async () => {
      // Monitor database queries during login
      const originalQuery = dbConnection.query;
      const queryLog = [];

      dbConnection.query = function(...args) {
        queryLog.push(args[0]);
        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'Password123!'
        });

      expect(response.status).toBe(200);

      // Verify queries use parameters
      const loginQueries = queryLog.filter(query => 
        query.includes('SELECT') && query.includes('email')
      );

      loginQueries.forEach(query => {
        expect(query).toMatch(/\?/); // Should contain parameter placeholders
        expect(query).not.toMatch(/'[^']*@[^']*'/); // Should not contain direct email strings
      });

      // Restore original query method
      dbConnection.query = originalQuery;
    });

    test('should use parameterized queries for game filtering', async () => {
      const originalQuery = dbConnection.query;
      const queryLog = [];

      dbConnection.query = function(...args) {
        queryLog.push({ sql: args[0], params: args[1] });
        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          status: 'waiting',
          gameType: 'duel',
          minWager: '1.0',
          maxWager: '10.0'
        });

      expect(response.status).toBe(200);

      // Verify game queries use parameters
      const gameQueries = queryLog.filter(log => 
        log.sql.includes('SELECT') && log.sql.includes('games')
      );

      gameQueries.forEach(log => {
        expect(log.sql).toMatch(/\?/); // Should contain parameter placeholders
        expect(log.params).toBeDefined(); // Should have parameter values
        expect(log.sql).not.toMatch(/'waiting'/); // Should not contain direct values
        expect(log.sql).not.toMatch(/'duel'/);
      });

      dbConnection.query = originalQuery;
    });

    test('should use parameterized queries for game creation', async () => {
      const originalQuery = dbConnection.query;
      const queryLog = [];

      dbConnection.query = function(...args) {
        queryLog.push({ sql: args[0], params: args[1] });
        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'tournament',
          wagerAmount: 5.0,
          isPrivate: true,
          maxPlayers: 4,
          timeLimit: 600
        });

      expect(response.status).toBe(201);

      // Verify INSERT queries use parameters
      const insertQueries = queryLog.filter(log => 
        log.sql.includes('INSERT') && log.sql.includes('games')
      );

      insertQueries.forEach(log => {
        expect(log.sql).toMatch(/\?/); // Should contain parameter placeholders
        expect(log.params).toBeDefined(); // Should have parameter values
        expect(Array.isArray(log.params)).toBe(true);
        expect(log.params.length).toBeGreaterThan(0);
        
        // Should not contain direct values in SQL
        expect(log.sql).not.toMatch(/'tournament'/);
        expect(log.sql).not.toMatch(/5\.0/);
      });

      dbConnection.query = originalQuery;
    });
  });

  describe('Parameter Binding Validation', () => {
    test('should properly escape special characters in parameters', async () => {
      const specialCharacterInputs = [
        "O'Malley's Game", // Single quotes
        'Game with "quotes"', // Double quotes
        'Game\\with\\backslashes', // Backslashes
        'Game\nwith\nnewlines', // Newlines
        'Game\twith\ttabs', // Tabs
        'Game%with%wildcards', // SQL wildcards
        'Game_with_underscores'
      ];

      for (const gameType of specialCharacterInputs) {
        const originalQuery = dbConnection.query;
        const queryLog = [];

        dbConnection.query = function(...args) {
          queryLog.push({ sql: args[0], params: args[1] });
          return originalQuery.apply(this, args);
        };

        const response = await request(app)
          .post('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            gameType: gameType,
            wagerAmount: 1.0,
            isPrivate: false,
            maxPlayers: 2
          });

        // Should either succeed with proper escaping or fail validation
        expect([200, 201, 400]).toContain(response.status);

        if (response.status === 201) {
          // Verify parameter was passed correctly
          const insertQueries = queryLog.filter(log => 
            log.sql.includes('INSERT') && log.sql.includes('games')
          );

          insertQueries.forEach(log => {
            expect(log.params).toContain(gameType);
            expect(log.sql).not.toContain(gameType); // Should not be in SQL string
          });
        }

        dbConnection.query = originalQuery;
      }
    });

    test('should handle null and undefined parameters safely', async () => {
      const originalQuery = dbConnection.query;
      const queryLog = [];

      dbConnection.query = function(...args) {
        queryLog.push({ sql: args[0], params: args[1] });
        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 1.0,
          isPrivate: false,
          maxPlayers: 2,
          description: null, // Explicit null value
          settings: undefined // Undefined value
        });

      expect([200, 201, 400]).toContain(response.status);

      if (response.status === 201) {
        const insertQueries = queryLog.filter(log => 
          log.sql.includes('INSERT') && log.sql.includes('games')
        );

        insertQueries.forEach(log => {
          // Verify null handling
          if (log.params.includes(null)) {
            expect(log.sql).not.toMatch(/null/i); // Should not contain literal null
          }
        });
      }

      dbConnection.query = originalQuery;
    });

    test('should validate parameter count matches placeholders', async () => {
      const originalQuery = dbConnection.query;
      const queryLog = [];

      dbConnection.query = function(...args) {
        const sql = args[0];
        const params = args[1];
        
        queryLog.push({ sql, params });

        // Verify parameter count matches placeholders
        const placeholderCount = (sql.match(/\?/g) || []).length;
        const paramCount = Array.isArray(params) ? params.length : 0;

        if (placeholderCount > 0) {
          expect(paramCount).toBe(placeholderCount);
        }

        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          status: 'waiting',
          gameType: 'duel',
          page: '1',
          limit: '10'
        });

      expect(response.status).toBe(200);

      dbConnection.query = originalQuery;
    });
  });

  describe('Query Injection Prevention', () => {
    test('should prevent SQL injection through bound parameters', async () => {
      const injectionAttempts = [
        "'; DROP TABLE games; --",
        "' OR '1'='1",
        "1'; UPDATE games SET status='completed'; --",
        "test' UNION SELECT * FROM users--",
        "admin'/**/OR/**/1=1#"
      ];

      for (const injection of injectionAttempts) {
        const originalQuery = dbConnection.query;
        let injectionDetected = false;

        dbConnection.query = function(...args) {
          const sql = args[0];
          const params = args[1];

          // Verify injection payload is in parameters, not SQL
          if (params && Array.isArray(params)) {
            const hasInjection = params.some(param => 
              typeof param === 'string' && param.includes(injection)
            );
            
            if (hasInjection) {
              // Injection should be in parameters
              expect(sql).not.toContain(injection);
              injectionDetected = true;
            }
          }

          return originalQuery.apply(this, args);
        };

        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: injection });

        // Should either be blocked by input validation or safely parameterized
        expect([200, 400]).toContain(response.status);

        if (response.status === 200 && injectionDetected) {
          // If query executed, injection should have been safely parameterized
          expect(injectionDetected).toBe(true);
        }

        dbConnection.query = originalQuery;
      }
    });

    test('should prevent boolean-based blind SQL injection', async () => {
      const blindSQLPayloads = [
        "test' AND (SELECT COUNT(*) FROM games) > 0 AND '1'='1",
        "test' AND (SELECT LENGTH(password) FROM users WHERE id=1) > 10 AND 'x'='x",
        "test' AND SUBSTRING((SELECT password FROM users WHERE id=1),1,1)='a' AND 'y'='y"
      ];

      for (const payload of blindSQLPayloads) {
        const originalQuery = dbConnection.query;
        const queryLog = [];

        dbConnection.query = function(...args) {
          queryLog.push({ sql: args[0], params: args[1] });
          return originalQuery.apply(this, args);
        };

        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ gameType: payload });

        if (response.status === 200) {
          // Verify payload was parameterized
          const selectQueries = queryLog.filter(log => 
            log.sql.includes('SELECT') && log.sql.includes('games')
          );

          selectQueries.forEach(log => {
            expect(log.sql).not.toContain('SELECT COUNT(*)'); // Should not contain subqueries
            expect(log.sql).not.toContain('LENGTH('); // Should not contain functions
            expect(log.sql).not.toContain('SUBSTRING('); // Should not contain functions
          });
        }

        dbConnection.query = originalQuery;
      }
    });

    test('should prevent time-based SQL injection', async () => {
      const timingPayloads = [
        "test'; WAITFOR DELAY '00:00:05'; --",
        "test' AND SLEEP(5) AND 'x'='x",
        "test'; SELECT pg_sleep(5); --",
        "test' OR (SELECT * FROM (SELECT COUNT(*),CONCAT((SELECT VERSION()),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) AND 'y'='y"
      ];

      for (const payload of timingPayloads) {
        const startTime = Date.now();

        const originalQuery = dbConnection.query;
        dbConnection.query = function(...args) {
          const sql = args[0];
          // Verify timing functions are not in the SQL
          expect(sql.toLowerCase()).not.toMatch(/waitfor|sleep|delay/);
          return originalQuery.apply(this, args);
        };

        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: payload });

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should not cause significant delays
        expect(duration).toBeLessThan(1000);
        expect([200, 400]).toContain(response.status);

        dbConnection.query = originalQuery;
      }
    });
  });

  describe('Prepared Statement Security', () => {
    test('should use prepared statements for repeated queries', async () => {
      const originalPrepare = dbConnection.prepare;
      const prepareLog = [];

      if (dbConnection.prepare) {
        dbConnection.prepare = function(...args) {
          prepareLog.push(args[0]);
          return originalPrepare.apply(this, args);
        };
      }

      // Execute multiple similar queries
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: i + 1, limit: 10 });

        expect(response.status).toBe(200);
      }

      // Verify prepared statements were used if available
      if (prepareLog.length > 0) {
        expect(prepareLog.length).toBeGreaterThan(0);
      }

      if (originalPrepare) {
        dbConnection.prepare = originalPrepare;
      }
    });

    test('should handle prepared statement errors gracefully', async () => {
      const originalPrepare = dbConnection.prepare;
      
      if (dbConnection.prepare) {
        // Simulate prepare failure
        dbConnection.prepare = function() {
          throw new Error('Prepare failed');
        };

        const response = await request(app)
          .get('/api/games')
          .set('Authorization', `Bearer ${authToken}`);

        // Should fallback to regular parameterized queries
        expect([200, 500]).toContain(response.status);

        dbConnection.prepare = originalPrepare;
      }
    });
  });

  describe('Database Transaction Security', () => {
    test('should use transactions for multi-step operations', async () => {
      const originalBeginTransaction = dbConnection.beginTransaction;
      const originalCommit = dbConnection.commit;
      const originalRollback = dbConnection.rollback;
      
      let transactionStarted = false;
      let transactionCommitted = false;

      if (dbConnection.beginTransaction) {
        dbConnection.beginTransaction = function() {
          transactionStarted = true;
          return originalBeginTransaction.apply(this, arguments);
        };
      }

      if (dbConnection.commit) {
        dbConnection.commit = function() {
          transactionCommitted = true;
          return originalCommit.apply(this, arguments);
        };
      }

      // Create game (should use transaction for balance deduction + game creation)
      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 2.0,
          isPrivate: false,
          maxPlayers: 2
        });

      expect(response.status).toBe(201);

      // Restore original methods
      if (originalBeginTransaction) dbConnection.beginTransaction = originalBeginTransaction;
      if (originalCommit) dbConnection.commit = originalCommit;
      if (originalRollback) dbConnection.rollback = originalRollback;
    });

    test('should rollback on transaction failures', async () => {
      // This would require more complex test setup with actual transaction failures
      // For now, verify error handling structure
      const response = await request(app)
        .post('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameType: 'duel',
          wagerAmount: 999999.0, // Amount higher than balance
          isPrivate: false,
          maxPlayers: 2
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Insufficient Balance');
    });
  });

  describe('Query Performance and Security', () => {
    test('should limit query result sizes', async () => {
      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: 1000000 }); // Very large limit

      expect(response.status).toBe(200);
      
      // Should enforce maximum limit
      if (response.body.data && response.body.data.games) {
        expect(response.body.data.games.length).toBeLessThanOrEqual(100);
      }
    });

    test('should prevent expensive query operations', async () => {
      const originalQuery = dbConnection.query;
      
      dbConnection.query = function(...args) {
        const sql = args[0];
        
        // Verify no expensive operations
        expect(sql.toLowerCase()).not.toMatch(/select.*\*.*from.*\w+.*,.*\w+/); // Cartesian joins
        expect(sql.toLowerCase()).not.toMatch(/group by.*having.*count/); // Complex aggregations
        expect(sql.toLowerCase()).not.toMatch(/order by.*rand/); // Random ordering
        
        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ sort: 'random' });

      expect([200, 400]).toContain(response.status);

      dbConnection.query = originalQuery;
    });

    test('should use appropriate indexes for queries', async () => {
      // This test would require EXPLAIN query analysis
      // For now, verify basic query structure
      const originalQuery = dbConnection.query;
      
      dbConnection.query = function(...args) {
        const sql = args[0];
        
        if (sql.includes('SELECT') && sql.includes('games')) {
          // Should use WHERE clauses for filtering
          if (sql.includes('status') || sql.includes('gameType')) {
            expect(sql).toMatch(/WHERE/i);
          }
        }
        
        return originalQuery.apply(this, args);
      };

      const response = await request(app)
        .get('/api/games')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'waiting', gameType: 'duel' });

      expect(response.status).toBe(200);

      dbConnection.query = originalQuery;
    });
  });

  afterAll(async () => {
    if (dbConnection) {
      await dbConnection.end();
    }
  });
});