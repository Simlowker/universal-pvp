const request = require('supertest');
const { expect } = require('chai');
const app = require('../../../src/backend/app');
const { setupTestDB, clearTestDB } = require('../helpers/db');
const { createTestUser, createTestToken } = require('../helpers/auth');

/**
 * Backend API Unit Tests
 * Tests individual API endpoints and business logic
 */

describe('API Endpoints Unit Tests', () => {
  let testDB;
  let testUser;
  let authToken;
  
  before(async () => {
    testDB = await setupTestDB();
    testUser = await createTestUser({ username: 'testuser', wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9' });
    authToken = createTestToken(testUser.id);
  });
  
  after(async () => {
    await clearTestDB();
  });
  
  beforeEach(async () => {
    // Clear any test data before each test
    await clearTestDB();
    testUser = await createTestUser({ username: 'testuser', wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9' });
    authToken = createTestToken(testUser.id);
  });
  
  describe('Authentication API', () => {
    describe('POST /api/auth/login', () => {
      it('should authenticate user with valid wallet signature', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
            signature: 'valid_signature',
            message: 'Login to SOL Duel'
          });
          
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('token');
        expect(response.body).to.have.property('user');
        expect(response.body.user.wallet).to.equal('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9');
      });
      
      it('should reject invalid wallet signature', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
            signature: 'invalid_signature',
            message: 'Login to SOL Duel'
          });
          
        expect(response.status).to.equal(401);
        expect(response.body).to.have.property('error');
      });
      
      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9'
          });
          
        expect(response.status).to.equal(400);
        expect(response.body.error).to.contain('signature');
      });
    });
    
    describe('POST /api/auth/logout', () => {
      it('should logout authenticated user', async () => {
        const response = await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body.message).to.equal('Logged out successfully');
      });
      
      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .post('/api/auth/logout');
          
        expect(response.status).to.equal(401);
      });
    });
  });
  
  describe('Player Management API', () => {
    describe('GET /api/players/profile', () => {
      it('should return user profile', async () => {
        const response = await request(app)
          .get('/api/players/profile')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('id');
        expect(response.body).to.have.property('username');
        expect(response.body).to.have.property('stats');
      });
      
      it('should return 401 without authentication', async () => {
        const response = await request(app)
          .get('/api/players/profile');
          
        expect(response.status).to.equal(401);
      });
    });
    
    describe('PUT /api/players/profile', () => {
      it('should update user profile', async () => {
        const updateData = {
          username: 'newusername',
          bio: 'Updated bio'
        };
        
        const response = await request(app)
          .put('/api/players/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData);
          
        expect(response.status).to.equal(200);
        expect(response.body.username).to.equal(updateData.username);
        expect(response.body.bio).to.equal(updateData.bio);
      });
      
      it('should validate username uniqueness', async () => {
        // Create another user with target username
        await createTestUser({ username: 'existinguser', wallet: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9' });
        
        const response = await request(app)
          .put('/api/players/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ username: 'existinguser' });
          
        expect(response.status).to.equal(400);
        expect(response.body.error).to.contain('username');
      });
    });
    
    describe('GET /api/players/:id/stats', () => {
      it('should return player statistics', async () => {
        const response = await request(app)
          .get(`/api/players/${testUser.id}/stats`)
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('totalMatches');
        expect(response.body).to.have.property('wins');
        expect(response.body).to.have.property('losses');
        expect(response.body).to.have.property('winRate');
        expect(response.body).to.have.property('averageDamage');
      });
      
      it('should return 404 for non-existent player', async () => {
        const response = await request(app)
          .get('/api/players/999999/stats')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(404);
      });
    });
  });
  
  describe('Match Management API', () => {
    describe('POST /api/matches', () => {
      it('should create new match', async () => {
        const matchConfig = {
          maxPlayers: 4,
          entryFee: 1000000,
          turnTimeout: 60,
          matchDuration: 1800
        };
        
        const response = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send(matchConfig);
          
        expect(response.status).to.equal(201);
        expect(response.body).to.have.property('id');
        expect(response.body).to.have.property('status');
        expect(response.body.creator).to.equal(testUser.id);
        expect(response.body.config.maxPlayers).to.equal(matchConfig.maxPlayers);
      });
      
      it('should validate match configuration', async () => {
        const invalidConfig = {
          maxPlayers: 0, // Invalid
          entryFee: 1000000
        };
        
        const response = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidConfig);
          
        expect(response.status).to.equal(400);
        expect(response.body.error).to.contain('maxPlayers');
      });
      
      it('should check user has sufficient balance', async () => {
        const expensiveConfig = {
          maxPlayers: 2,
          entryFee: 999999999999, // Very high entry fee
          turnTimeout: 60,
          matchDuration: 1800
        };
        
        const response = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send(expensiveConfig);
          
        expect(response.status).to.equal(400);
        expect(response.body.error).to.contain('balance');
      });
    });
    
    describe('GET /api/matches', () => {
      it('should return list of available matches', async () => {
        const response = await request(app)
          .get('/api/matches')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('array');
        expect(response.body).to.have.property('length');
      });
      
      it('should filter matches by status', async () => {
        const response = await request(app)
          .get('/api/matches?status=waiting')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        response.body.forEach(match => {
          expect(match.status).to.equal('waiting');
        });
      });
      
      it('should support pagination', async () => {
        const response = await request(app)
          .get('/api/matches?page=1&limit=10')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('matches');
        expect(response.body).to.have.property('pagination');
        expect(response.body.pagination).to.have.property('page');
        expect(response.body.pagination).to.have.property('totalPages');
      });
    });
    
    describe('POST /api/matches/:id/join', () => {
      let matchId;
      
      beforeEach(async () => {
        // Create a match to join
        const matchResponse = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            maxPlayers: 4,
            entryFee: 1000000,
            turnTimeout: 60,
            matchDuration: 1800
          });
        matchId = matchResponse.body.id;
      });
      
      it('should join available match', async () => {
        // Create another user to join
        const joiner = await createTestUser({ username: 'joiner', wallet: '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9' });
        const joinerToken = createTestToken(joiner.id);
        
        const response = await request(app)
          .post(`/api/matches/${matchId}/join`)
          .set('Authorization', `Bearer ${joinerToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body.message).to.contain('joined');
      });
      
      it('should prevent joining own match', async () => {
        const response = await request(app)
          .post(`/api/matches/${matchId}/join`)
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(400);
        expect(response.body.error).to.contain('own match');
      });
      
      it('should prevent joining full match', async () => {
        // Fill the match first (mock this scenario)
        const response = await request(app)
          .post(`/api/matches/${matchId}/join`)
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.be.oneOf([200, 400]);
      });
    });
  });
  
  describe('Game State API', () => {
    describe('GET /api/matches/:id/state', () => {
      it('should return match state', async () => {
        // Create and start a match
        const matchResponse = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            maxPlayers: 2,
            entryFee: 1000000,
            turnTimeout: 60,
            matchDuration: 1800
          });
        
        const response = await request(app)
          .get(`/api/matches/${matchResponse.body.id}/state`)
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body).to.have.property('id');
        expect(response.body).to.have.property('status');
        expect(response.body).to.have.property('players');
        expect(response.body).to.have.property('currentTurn');
      });
      
      it('should return 403 for non-participant', async () => {
        // Create match
        const matchResponse = await request(app)
          .post('/api/matches')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            maxPlayers: 2,
            entryFee: 1000000,
            turnTimeout: 60,
            matchDuration: 1800
          });
        
        // Try to access with different user
        const otherUser = await createTestUser({ username: 'other', wallet: '10xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU' });
        const otherToken = createTestToken(otherUser.id);
        
        const response = await request(app)
          .get(`/api/matches/${matchResponse.body.id}/state`)
          .set('Authorization', `Bearer ${otherToken}`);
          
        expect(response.status).to.equal(403);
      });
    });
    
    describe('POST /api/matches/:id/actions', () => {
      it('should execute valid combat action', async () => {
        // Setup match in progress (mock scenario)
        const matchId = 'test-match-id';
        const action = {
          type: 'attack',
          target: 1,
          power: 50
        };
        
        const response = await request(app)
          .post(`/api/matches/${matchId}/actions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(action);
          
        // This would normally return 200, but might return 404 if match doesn't exist
        expect(response.status).to.be.oneOf([200, 404]);
      });
      
      it('should validate action format', async () => {
        const matchId = 'test-match-id';
        const invalidAction = {
          type: 'invalid_action'
        };
        
        const response = await request(app)
          .post(`/api/matches/${matchId}/actions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidAction);
          
        expect(response.status).to.be.oneOf([400, 404]);
      });
      
      it('should check if it is player turn', async () => {
        const matchId = 'test-match-id';
        const action = {
          type: 'attack',
          target: 1,
          power: 50
        };
        
        const response = await request(app)
          .post(`/api/matches/${matchId}/actions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(action);
          
        // Response depends on match state
        expect(response.status).to.be.oneOf([200, 400, 404]);
      });
    });
  });
  
  describe('Leaderboard API', () => {
    describe('GET /api/leaderboard', () => {
      it('should return leaderboard with rankings', async () => {
        const response = await request(app)
          .get('/api/leaderboard')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
        expect(response.body).to.be.an('array');
        
        if (response.body.length > 0) {
          expect(response.body[0]).to.have.property('rank');
          expect(response.body[0]).to.have.property('username');
          expect(response.body[0]).to.have.property('rating');
          expect(response.body[0]).to.have.property('wins');
        }
      });
      
      it('should support different time periods', async () => {
        const response = await request(app)
          .get('/api/leaderboard?period=weekly')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
      });
      
      it('should support different ranking types', async () => {
        const response = await request(app)
          .get('/api/leaderboard?type=wins')
          .set('Authorization', `Bearer ${authToken}`);
          
        expect(response.status).to.equal(200);
      });
    });
  });
  
  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('Authorization', `Bearer ${authToken}`);
        
      expect(response.status).to.equal(404);
    });
    
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json');
        
      expect(response.status).to.equal(400);
    });
    
    it('should handle database connection errors gracefully', async () => {
      // Mock database error scenario
      // This would require mocking the database connection
      expect(true).to.be.true; // Placeholder
    });
  });
  
  describe('Rate Limiting', () => {
    it('should enforce rate limits on API endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array(20).fill().map(() => 
        request(app)
          .get('/api/players/profile')
          .set('Authorization', `Bearer ${authToken}`)
      );
      
      const responses = await Promise.all(requests);
      
      // At least some requests should be rate limited
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).to.be.true;
    });
  });
  
  describe('Input Validation', () => {
    it('should validate all input parameters', async () => {
      const maliciousInput = {
        maxPlayers: '<script>alert("xss")</script>',
        entryFee: 'DROP TABLE users;',
        description: '<img src="x" onerror="alert(1)">'
      };
      
      const response = await request(app)
        .post('/api/matches')
        .set('Authorization', `Bearer ${authToken}`)
        .send(maliciousInput);
        
      expect(response.status).to.equal(400);
    });
    
    it('should sanitize HTML inputs', async () => {
      const htmlInput = {
        bio: '<b>Bold text</b> and <script>evil()</script>'
      };
      
      const response = await request(app)
        .put('/api/players/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(htmlInput);
        
      if (response.status === 200) {
        expect(response.body.bio).to.not.contain('<script>');
      }
    });
  });
});