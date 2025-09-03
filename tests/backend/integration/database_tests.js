const { expect } = require('chai');
const { Pool } = require('pg');
const { setupTestDB, clearTestDB, getTestDB } = require('../helpers/db');
const UserModel = require('../../../src/backend/models/User');
const MatchModel = require('../../../src/backend/models/Match');
const PlayerStatsModel = require('../../../src/backend/models/PlayerStats');

/**
 * Database Integration Tests
 * Tests database operations, transactions, and data integrity
 */

describe('Database Integration Tests', () => {
  let testDB;
  
  before(async () => {
    testDB = await setupTestDB();
  });
  
  after(async () => {
    await clearTestDB();
  });
  
  beforeEach(async () => {
    await clearTestDB();
  });
  
  describe('User Model Integration', () => {
    describe('User Creation and Retrieval', () => {
      it('should create and retrieve user correctly', async () => {
        const userData = {
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'testuser',
          playerClass: 'warrior'
        };
        
        const createdUser = await UserModel.create(userData);
        
        expect(createdUser).to.have.property('id');
        expect(createdUser.wallet).to.equal(userData.wallet);
        expect(createdUser.username).to.equal(userData.username);
        expect(createdUser.playerClass).to.equal(userData.playerClass);
        expect(createdUser.createdAt).to.be.a('date');
        
        const retrievedUser = await UserModel.findById(createdUser.id);
        expect(retrievedUser.id).to.equal(createdUser.id);
        expect(retrievedUser.wallet).to.equal(userData.wallet);
      });
      
      it('should enforce unique wallet addresses', async () => {
        const userData = {
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'user1',
          playerClass: 'warrior'
        };
        
        await UserModel.create(userData);
        
        // Try to create another user with same wallet
        try {
          await UserModel.create({
            ...userData,
            username: 'user2'
          });
          throw new Error('Should have thrown unique constraint error');
        } catch (error) {
          expect(error.message).to.contain('duplicate key value');
        }
      });
      
      it('should enforce unique usernames', async () => {
        const userData1 = {
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'testuser',
          playerClass: 'warrior'
        };
        
        const userData2 = {
          wallet: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'testuser',
          playerClass: 'mage'
        };
        
        await UserModel.create(userData1);
        
        try {
          await UserModel.create(userData2);
          throw new Error('Should have thrown unique constraint error');
        } catch (error) {
          expect(error.message).to.contain('duplicate key value');
        }
      });
    });
    
    describe('User Updates', () => {
      let testUser;
      
      beforeEach(async () => {
        testUser = await UserModel.create({
          wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'testuser',
          playerClass: 'warrior'
        });
      });
      
      it('should update user profile correctly', async () => {
        const updateData = {
          username: 'newusername',
          bio: 'Updated bio text',
          avatar: 'new-avatar-url'
        };
        
        const updatedUser = await UserModel.update(testUser.id, updateData);
        
        expect(updatedUser.username).to.equal(updateData.username);
        expect(updatedUser.bio).to.equal(updateData.bio);
        expect(updatedUser.avatar).to.equal(updateData.avatar);
        expect(updatedUser.updatedAt).to.be.above(testUser.updatedAt);
      });
      
      it('should not update immutable fields', async () => {
        const originalWallet = testUser.wallet;
        const originalCreatedAt = testUser.createdAt;
        
        await UserModel.update(testUser.id, {
          wallet: '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          createdAt: new Date(),
          id: 999999
        });
        
        const retrievedUser = await UserModel.findById(testUser.id);
        expect(retrievedUser.wallet).to.equal(originalWallet);
        expect(retrievedUser.createdAt.getTime()).to.equal(originalCreatedAt.getTime());
        expect(retrievedUser.id).to.equal(testUser.id);
      });
    });
  });
  
  describe('Match Model Integration', () => {
    let testCreator;
    
    beforeEach(async () => {
      testCreator = await UserModel.create({
        wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
        username: 'creator',
        playerClass: 'warrior'
      });
    });
    
    describe('Match Creation', () => {
      it('should create match with valid configuration', async () => {
        const matchConfig = {
          creatorId: testCreator.id,
          maxPlayers: 4,
          entryFee: 1000000,
          turnTimeout: 60,
          matchDuration: 1800,
          rewardDistribution: [50, 30, 20]
        };
        
        const match = await MatchModel.create(matchConfig);
        
        expect(match).to.have.property('id');
        expect(match.creatorId).to.equal(testCreator.id);
        expect(match.status).to.equal('waiting');
        expect(match.currentPlayers).to.be.an('array').with.length(1);
        expect(match.currentPlayers[0]).to.equal(testCreator.id);
        expect(match.config.maxPlayers).to.equal(matchConfig.maxPlayers);
        expect(match.createdAt).to.be.a('date');
      });
      
      it('should validate match configuration', async () => {
        const invalidConfigs = [
          { maxPlayers: 0 },
          { maxPlayers: 17 }, // Over limit
          { entryFee: -1000 },
          { turnTimeout: 0 },
          { matchDuration: -100 }
        ];
        
        for (const config of invalidConfigs) {
          try {
            await MatchModel.create({
              creatorId: testCreator.id,
              maxPlayers: 2,
              entryFee: 1000000,
              turnTimeout: 60,
              matchDuration: 1800,
              ...config
            });
            throw new Error(`Should have failed validation for ${JSON.stringify(config)}`);
          } catch (error) {
            expect(error.message).to.contain('validation');
          }
        }
      });
    });
    
    describe('Match State Management', () => {
      let testMatch;
      let player2;
      
      beforeEach(async () => {
        testMatch = await MatchModel.create({
          creatorId: testCreator.id,
          maxPlayers: 2,
          entryFee: 1000000,
          turnTimeout: 60,
          matchDuration: 1800
        });
        
        player2 = await UserModel.create({
          wallet: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'player2',
          playerClass: 'mage'
        });
      });
      
      it('should add player to match', async () => {
        const updatedMatch = await MatchModel.addPlayer(testMatch.id, player2.id);
        
        expect(updatedMatch.currentPlayers).to.have.length(2);
        expect(updatedMatch.currentPlayers).to.include(player2.id);
        expect(updatedMatch.status).to.equal('in_progress'); // Auto-start when full
      });
      
      it('should prevent adding player to full match', async () => {
        // Fill the match
        await MatchModel.addPlayer(testMatch.id, player2.id);
        
        // Try to add another player
        const player3 = await UserModel.create({
          wallet: '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
          username: 'player3',
          playerClass: 'rogue'
        });
        
        try {
          await MatchModel.addPlayer(testMatch.id, player3.id);
          throw new Error('Should have thrown match full error');
        } catch (error) {
          expect(error.message).to.contain('full');
        }
      });
      
      it('should update match status correctly', async () => {
        await MatchModel.updateStatus(testMatch.id, 'in_progress');
        
        const updatedMatch = await MatchModel.findById(testMatch.id);
        expect(updatedMatch.status).to.equal('in_progress');
        expect(updatedMatch.startedAt).to.be.a('date');
      });
      
      it('should complete match with results', async () => {
        const matchResults = {
          winnerId: testCreator.id,
          finalStats: {
            [testCreator.id]: { damage: 150, healingDone: 50 },
            [player2.id]: { damage: 120, healingDone: 30 }
          },
          rewards: {
            [testCreator.id]: 1800000, // Winner gets 90%
            [player2.id]: 200000       // Loser gets 10%
          }
        };
        
        const completedMatch = await MatchModel.complete(testMatch.id, matchResults);
        
        expect(completedMatch.status).to.equal('completed');
        expect(completedMatch.winnerId).to.equal(testCreator.id);
        expect(completedMatch.completedAt).to.be.a('date');
        expect(completedMatch.results).to.deep.equal(matchResults);
      });
    });
  });
  
  describe('Player Stats Integration', () => {
    let testUser;
    
    beforeEach(async () => {
      testUser = await UserModel.create({
        wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
        username: 'statuser',
        playerClass: 'warrior'
      });
    });
    
    describe('Stats Tracking', () => {
      it('should initialize player stats', async () => {
        const stats = await PlayerStatsModel.initializeStats(testUser.id);
        
        expect(stats.userId).to.equal(testUser.id);
        expect(stats.level).to.equal(1);
        expect(stats.experience).to.equal(0);
        expect(stats.totalMatches).to.equal(0);
        expect(stats.wins).to.equal(0);
        expect(stats.losses).to.equal(0);
        expect(stats.rating).to.equal(1000); // Default ELO rating
      });
      
      it('should update stats after match', async () => {
        await PlayerStatsModel.initializeStats(testUser.id);
        
        const matchResult = {
          won: true,
          experienceGained: 150,
          damageDealt: 200,
          damageTaken: 80,
          ratingChange: 25
        };
        
        const updatedStats = await PlayerStatsModel.updateAfterMatch(testUser.id, matchResult);
        
        expect(updatedStats.totalMatches).to.equal(1);
        expect(updatedStats.wins).to.equal(1);
        expect(updatedStats.losses).to.equal(0);
        expect(updatedStats.experience).to.equal(150);
        expect(updatedStats.totalDamageDealt).to.equal(200);
        expect(updatedStats.totalDamageTaken).to.equal(80);
        expect(updatedStats.rating).to.equal(1025);
      });
      
      it('should calculate level from experience', async () => {
        const stats = await PlayerStatsModel.initializeStats(testUser.id);
        
        // Add enough experience for level 3
        await PlayerStatsModel.updateExperience(testUser.id, 2500);
        
        const updatedStats = await PlayerStatsModel.findByUserId(testUser.id);
        const expectedLevel = PlayerStatsModel.calculateLevel(2500);
        
        expect(updatedStats.level).to.equal(expectedLevel);
        expect(expectedLevel).to.be.above(2);
      });
      
      it('should calculate win rate correctly', async () => {
        await PlayerStatsModel.initializeStats(testUser.id);
        
        // Simulate multiple matches
        for (let i = 0; i < 10; i++) {
          await PlayerStatsModel.updateAfterMatch(testUser.id, {
            won: i < 7, // Win 7 out of 10
            experienceGained: 100,
            damageDealt: 150,
            damageTaken: 100,
            ratingChange: i < 7 ? 10 : -10
          });
        }
        
        const stats = await PlayerStatsModel.findByUserId(testUser.id);
        const winRate = stats.wins / stats.totalMatches;
        
        expect(stats.totalMatches).to.equal(10);
        expect(stats.wins).to.equal(7);
        expect(stats.losses).to.equal(3);
        expect(winRate).to.equal(0.7);
      });
    });
    
    describe('Leaderboard Queries', () => {
      beforeEach(async () => {
        // Create multiple users with different stats
        const users = await Promise.all([
          UserModel.create({ wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9', username: 'player1', playerClass: 'warrior' }),
          UserModel.create({ wallet: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9', username: 'player2', playerClass: 'mage' }),
          UserModel.create({ wallet: '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9', username: 'player3', playerClass: 'rogue' })
        ]);
        
        for (const user of users) {
          await PlayerStatsModel.initializeStats(user.id);
        }
        
        // Set different ratings
        await PlayerStatsModel.updateRating(users[0].id, 1200);
        await PlayerStatsModel.updateRating(users[1].id, 1500);
        await PlayerStatsModel.updateRating(users[2].id, 1100);
      });
      
      it('should return leaderboard by rating', async () => {
        const leaderboard = await PlayerStatsModel.getLeaderboard('rating', 10);
        
        expect(leaderboard).to.have.length(3);
        expect(leaderboard[0].rating).to.equal(1500);
        expect(leaderboard[1].rating).to.equal(1200);
        expect(leaderboard[2].rating).to.equal(1100);
        
        // Check ranking
        expect(leaderboard[0].rank).to.equal(1);
        expect(leaderboard[1].rank).to.equal(2);
        expect(leaderboard[2].rank).to.equal(3);
      });
      
      it('should return leaderboard by wins', async () => {
        // Add some wins
        await PlayerStatsModel.updateAfterMatch(testUser.id, { won: true, experienceGained: 100, damageDealt: 100, damageTaken: 50, ratingChange: 10 });
        
        const leaderboard = await PlayerStatsModel.getLeaderboard('wins', 10);
        
        expect(leaderboard).to.have.length.at.least(1);
        const topPlayer = leaderboard.find(p => p.userId === testUser.id);
        expect(topPlayer).to.exist;
        expect(topPlayer.wins).to.equal(1);
      });
    });
  });
  
  describe('Transaction Management', () => {
    it('should handle database transactions correctly', async () => {
      const client = await testDB.connect();
      
      try {
        await client.query('BEGIN');
        
        // Create user in transaction
        const userResult = await client.query(`
          INSERT INTO users (wallet, username, player_class)
          VALUES ($1, $2, $3)
          RETURNING id
        `, ['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9', 'txuser', 'warrior']);
        
        const userId = userResult.rows[0].id;
        
        // Create stats in same transaction
        await client.query(`
          INSERT INTO player_stats (user_id, level, experience, rating)
          VALUES ($1, $2, $3, $4)
        `, [userId, 1, 0, 1000]);
        
        await client.query('COMMIT');
        
        // Verify both records exist
        const user = await UserModel.findById(userId);
        const stats = await PlayerStatsModel.findByUserId(userId);
        
        expect(user).to.exist;
        expect(stats).to.exist;
        expect(stats.userId).to.equal(userId);
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
    
    it('should rollback transaction on error', async () => {
      const client = await testDB.connect();
      
      try {
        await client.query('BEGIN');
        
        // Create valid user
        const userResult = await client.query(`
          INSERT INTO users (wallet, username, player_class)
          VALUES ($1, $2, $3)
          RETURNING id
        `, ['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9', 'rollbackuser', 'warrior']);
        
        const userId = userResult.rows[0].id;
        
        // Intentionally cause error (invalid foreign key)
        await client.query(`
          INSERT INTO player_stats (user_id, level, experience, rating)
          VALUES ($1, $2, $3, $4)
        `, [999999, 1, 0, 1000]); // Non-existent user_id
        
        await client.query('COMMIT');
        
      } catch (error) {
        await client.query('ROLLBACK');
        
        // Verify user was not created due to rollback
        const userCheck = await client.query('SELECT * FROM users WHERE username = $1', ['rollbackuser']);
        expect(userCheck.rows).to.have.length(0);
        
      } finally {
        client.release();
      }
    });
  });
  
  describe('Database Performance', () => {
    it('should handle concurrent operations', async () => {
      const concurrentOps = 20;
      const promises = [];
      
      for (let i = 0; i < concurrentOps; i++) {
        promises.push(
          UserModel.create({
            wallet: `${i}xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU${i}`,
            username: `concurrent_user_${i}`,
            playerClass: 'warrior'
          })
        );
      }
      
      const results = await Promise.all(promises);
      
      expect(results).to.have.length(concurrentOps);
      results.forEach((user, index) => {
        expect(user.username).to.equal(`concurrent_user_${index}`);
        expect(user.id).to.be.a('number');
      });
    });
    
    it('should perform efficient queries on large datasets', async () => {
      // Create many users for performance testing
      const users = [];
      for (let i = 0; i < 1000; i++) {
        users.push({
          wallet: `${i}xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgH${i.toString().padStart(2, '0')}`,
          username: `perf_user_${i}`,
          playerClass: ['warrior', 'mage', 'rogue', 'archer'][i % 4]
        });
      }
      
      // Batch insert for performance
      await UserModel.bulkCreate(users);
      
      // Test query performance
      const startTime = Date.now();
      const results = await UserModel.findAll({ limit: 50, offset: 100 });
      const queryTime = Date.now() - startTime;
      
      expect(results).to.have.length(50);
      expect(queryTime).to.be.below(100); // Should complete in <100ms
      
      console.log(`Query time for paginated results: ${queryTime}ms`);
    });
  });
  
  describe('Data Integrity', () => {
    it('should maintain referential integrity', async () => {
      const user = await UserModel.create({
        wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
        username: 'integrity_user',
        playerClass: 'warrior'
      });
      
      await PlayerStatsModel.initializeStats(user.id);
      
      // Try to delete user with existing stats (should fail or cascade)
      try {
        await UserModel.delete(user.id);
        
        // If deletion succeeds, stats should also be deleted (cascade)
        const stats = await PlayerStatsModel.findByUserId(user.id);
        expect(stats).to.be.null;
        
      } catch (error) {
        // If deletion fails, it's due to foreign key constraint
        expect(error.message).to.contain('foreign key');
      }
    });
    
    it('should validate data constraints', async () => {
      // Test various constraint violations
      const invalidData = [
        { wallet: null }, // NOT NULL violation
        { wallet: 'invalid_wallet', username: '' }, // Empty username
        { wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9', playerClass: 'invalid_class' }
      ];
      
      for (const data of invalidData) {
        try {
          await UserModel.create({
            wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
            username: 'test',
            playerClass: 'warrior',
            ...data
          });
          throw new Error(`Should have failed validation for ${JSON.stringify(data)}`);
        } catch (error) {
          expect(error.message).to.match(/(constraint|validation|null|invalid)/i);
        }
      }
    });
  });
});