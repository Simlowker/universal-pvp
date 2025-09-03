const { expect } = require('chai');
const sinon = require('sinon');
const MatchmakingService = require('../../../src/backend/services/MatchmakingService');
const { setupTestDB, clearTestDB } = require('../helpers/db');
const { createTestUser } = require('../helpers/auth');

/**
 * Matchmaking Algorithm Tests
 * Tests the sophisticated matchmaking system for fair and balanced matches
 */

describe('Matchmaking Algorithm Tests', () => {
  let matchmakingService;
  let testDB;
  
  before(async () => {
    testDB = await setupTestDB();
    matchmakingService = new MatchmakingService();
  });
  
  after(async () => {
    await clearTestDB();
  });
  
  beforeEach(async () => {
    await clearTestDB();
    await matchmakingService.reset();
  });
  
  describe('Player Rating System', () => {
    it('should calculate initial rating correctly', () => {
      const newPlayer = {
        id: 1,
        totalMatches: 0,
        wins: 0,
        losses: 0,
        rating: null
      };
      
      const initialRating = matchmakingService.calculateInitialRating(newPlayer);
      expect(initialRating).to.equal(1000); // Default starting rating
    });
    
    it('should adjust rating based on match outcome', () => {
      const player1 = { id: 1, rating: 1200, totalMatches: 50 };
      const player2 = { id: 2, rating: 1100, totalMatches: 45 };
      
      // Player 1 (higher rated) wins against Player 2
      const { player1NewRating, player2NewRating } = matchmakingService.calculateRatingChange(
        player1, player2, 1 // player1 wins
      );
      
      expect(player1NewRating).to.be.above(player1.rating);
      expect(player2NewRating).to.be.below(player2.rating);
      
      // Rating change should be smaller for higher rated player winning
      const player1Change = player1NewRating - player1.rating;
      const player2Change = player2.rating - player2NewRating;
      expect(player1Change).to.be.below(player2Change);
    });
    
    it('should handle upset victories with larger rating changes', () => {
      const strongPlayer = { id: 1, rating: 1500, totalMatches: 100 };
      const weakPlayer = { id: 2, rating: 800, totalMatches: 20 };
      
      // Weak player beats strong player (upset)
      const { player1NewRating, player2NewRating } = matchmakingService.calculateRatingChange(
        strongPlayer, weakPlayer, 2 // weakPlayer wins
      );
      
      const strongPlayerLoss = strongPlayer.rating - player1NewRating;
      const weakPlayerGain = player2NewRating - weakPlayer.rating;
      
      expect(strongPlayerLoss).to.be.above(20); // Significant loss for strong player
      expect(weakPlayerGain).to.be.above(30);   // Large gain for weak player
    });
    
    it('should use K-factor based on player experience', () => {
      const veteran = { id: 1, rating: 1200, totalMatches: 200 };
      const novice = { id: 2, rating: 1200, totalMatches: 5 };
      const opponent = { id: 3, rating: 1200, totalMatches: 50 };
      
      // Both win against same opponent
      const veteranResult = matchmakingService.calculateRatingChange(veteran, opponent, 1);
      const noviceResult = matchmakingService.calculateRatingChange(novice, opponent, 1);
      
      const veteranChange = veteranResult.player1NewRating - veteran.rating;
      const noviceChange = noviceResult.player1NewRating - novice.rating;
      
      // Novice should have larger rating changes
      expect(noviceChange).to.be.above(veteranChange);
    });
  });
  
  describe('Match Quality Assessment', () => {
    it('should calculate match quality based on rating difference', () => {
      const scenarios = [
        { p1Rating: 1000, p2Rating: 1000, expectedQuality: 1.0 },
        { p1Rating: 1000, p2Rating: 1100, expectedQuality: 0.86 },
        { p1Rating: 1000, p2Rating: 1200, expectedQuality: 0.76 },
        { p1Rating: 1000, p2Rating: 1400, expectedQuality: 0.64 }
      ];
      
      scenarios.forEach(({ p1Rating, p2Rating, expectedQuality }) => {
        const quality = matchmakingService.calculateMatchQuality(p1Rating, p2Rating);
        expect(quality).to.be.closeTo(expectedQuality, 0.05);
      });
    });
    
    it('should consider player class compatibility', () => {
      const warriors = [
        { id: 1, rating: 1000, playerClass: 'warrior' },
        { id: 2, rating: 1000, playerClass: 'warrior' }
      ];
      
      const mixed = [
        { id: 1, rating: 1000, playerClass: 'warrior' },
        { id: 2, rating: 1000, playerClass: 'mage' }
      ];
      
      const warriorQuality = matchmakingService.calculateTeamBalance(warriors);
      const mixedQuality = matchmakingService.calculateTeamBalance(mixed);
      
      expect(mixedQuality).to.be.above(warriorQuality); // Diverse teams preferred
    });
    
    it('should factor in recent performance trends', () => {
      const hotStreak = {
        id: 1,
        rating: 1200,
        recentMatches: [1, 1, 1, 1, 1] // 5 wins
      };
      
      const coldStreak = {
        id: 2,
        rating: 1200,
        recentMatches: [0, 0, 0, 0, 0] // 5 losses
      };
      
      const hotEffectiveRating = matchmakingService.calculateEffectiveRating(hotStreak);
      const coldEffectiveRating = matchmakingService.calculateEffectiveRating(coldStreak);
      
      expect(hotEffectiveRating).to.be.above(hotStreak.rating);
      expect(coldEffectiveRating).to.be.below(coldStreak.rating);
    });
  });
  
  describe('Queue Management', () => {
    let players;
    
    beforeEach(async () => {
      // Create test players with different ratings
      players = await Promise.all([
        createTestUser({ username: 'player1', rating: 900, playerClass: 'warrior' }),
        createTestUser({ username: 'player2', rating: 1000, playerClass: 'mage' }),
        createTestUser({ username: 'player3', rating: 1100, playerClass: 'rogue' }),
        createTestUser({ username: 'player4', rating: 1200, playerClass: 'archer' }),
        createTestUser({ username: 'player5', rating: 1300, playerClass: 'warrior' })
      ]);
    });
    
    it('should add players to appropriate queues', async () => {
      await matchmakingService.addToQueue(players[0], { maxPlayers: 2, entryFee: 1000000 });
      await matchmakingService.addToQueue(players[1], { maxPlayers: 2, entryFee: 1000000 });
      
      const queueState = matchmakingService.getQueueState();
      expect(queueState.totalPlayersInQueue).to.equal(2);
      expect(queueState.averageWaitTime).to.be.a('number');
    });
    
    it('should prioritize fair matches over quick matches initially', async () => {
      // Add players with varying ratings
      for (const player of players) {
        await matchmakingService.addToQueue(player, { maxPlayers: 2, entryFee: 1000000 });
      }
      
      const match = await matchmakingService.findMatch();
      
      if (match) {
        const ratingDiff = Math.abs(match.players[0].rating - match.players[1].rating);
        expect(ratingDiff).to.be.below(200); // Should prefer closer ratings
      }
    });
    
    it('should expand search criteria as wait time increases', async () => {
      const player1 = players[0]; // Rating 900
      const player2 = players[4]; // Rating 1300
      
      await matchmakingService.addToQueue(player1, { maxPlayers: 2, entryFee: 1000000 });
      
      // Simulate time passing
      const clock = sinon.useFakeTimers();
      
      // Initially, should not match (too far apart)
      let match = await matchmakingService.findMatch();
      expect(match).to.be.null;
      
      // After 30 seconds, add second player
      clock.tick(30000);
      await matchmakingService.addToQueue(player2, { maxPlayers: 2, entryFee: 1000000 });
      
      // Should still not match immediately
      match = await matchmakingService.findMatch();
      expect(match).to.be.null;
      
      // After 60 seconds total, search should expand
      clock.tick(30000);
      matchmakingService.expandSearchCriteria();
      match = await matchmakingService.findMatch();
      
      expect(match).to.not.be.null;
      expect(match.players).to.have.length(2);
      
      clock.restore();
    });
    
    it('should handle queue cancellations gracefully', async () => {
      await matchmakingService.addToQueue(players[0], { maxPlayers: 2, entryFee: 1000000 });
      await matchmakingService.addToQueue(players[1], { maxPlayers: 2, entryFee: 1000000 });
      
      const initialQueueSize = matchmakingService.getQueueState().totalPlayersInQueue;
      expect(initialQueueSize).to.equal(2);
      
      await matchmakingService.removeFromQueue(players[0].id);
      
      const finalQueueSize = matchmakingService.getQueueState().totalPlayersInQueue;
      expect(finalQueueSize).to.equal(1);
    });
  });
  
  describe('Team Formation for Multiplayer', () => {
    let multiplayerPlayers;
    
    beforeEach(async () => {
      // Create 8 players for 4v4 matches
      multiplayerPlayers = await Promise.all([
        createTestUser({ username: 'mp1', rating: 1000, playerClass: 'warrior' }),
        createTestUser({ username: 'mp2', rating: 1050, playerClass: 'mage' }),
        createTestUser({ username: 'mp3', rating: 1100, playerClass: 'rogue' }),
        createTestUser({ username: 'mp4', rating: 1150, playerClass: 'archer' }),
        createTestUser({ username: 'mp5', rating: 1200, playerClass: 'warrior' }),
        createTestUser({ username: 'mp6', rating: 1250, playerClass: 'mage' }),
        createTestUser({ username: 'mp7', rating: 1300, playerClass: 'rogue' }),
        createTestUser({ username: 'mp8', rating: 1350, playerClass: 'archer' })
      ]);
    });
    
    it('should balance team average ratings', async () => {
      const teams = matchmakingService.formBalancedTeams(multiplayerPlayers, 2);
      
      expect(teams).to.have.length(2);
      expect(teams[0]).to.have.length(4);
      expect(teams[1]).to.have.length(4);
      
      const team1AvgRating = teams[0].reduce((sum, p) => sum + p.rating, 0) / 4;
      const team2AvgRating = teams[1].reduce((sum, p) => sum + p.rating, 0) / 4;
      
      const ratingDifference = Math.abs(team1AvgRating - team2AvgRating);
      expect(ratingDifference).to.be.below(50); // Teams should be closely matched
    });
    
    it('should ensure class diversity within teams', async () => {
      const teams = matchmakingService.formBalancedTeams(multiplayerPlayers, 2);
      
      teams.forEach(team => {
        const classes = team.map(p => p.playerClass);
        const uniqueClasses = new Set(classes);
        
        // Each team should have class diversity
        expect(uniqueClasses.size).to.be.at.least(2);
      });
    });
    
    it('should handle odd team sizes gracefully', async () => {
      const players6 = multiplayerPlayers.slice(0, 6);
      const teams = matchmakingService.formBalancedTeams(players6, 2);
      
      expect(teams).to.have.length(2);
      expect(teams[0].length + teams[1].length).to.equal(6);
      
      // Team sizes should differ by at most 1
      const sizeDifference = Math.abs(teams[0].length - teams[1].length);
      expect(sizeDifference).to.be.at.most(1);
    });
  });
  
  describe('Anti-Smurf Detection', () => {
    it('should detect suspiciously skilled new players', () => {
      const suspiciousPlayer = {
        id: 1,
        rating: 1000,
        totalMatches: 5,
        wins: 5,
        averagePerformance: {
          damagePerMatch: 300,
          accuracyRate: 0.95,
          killsPerMatch: 4.2
        }
      };
      
      const normalNewPlayer = {
        id: 2,
        rating: 1000,
        totalMatches: 5,
        wins: 2,
        averagePerformance: {
          damagePerMatch: 120,
          accuracyRate: 0.65,
          killsPerMatch: 1.4
        }
      };
      
      const suspiciousScore = matchmakingService.calculateSmurfProbability(suspiciousPlayer);
      const normalScore = matchmakingService.calculateSmurfProbability(normalNewPlayer);
      
      expect(suspiciousScore).to.be.above(0.7); // High smurf probability
      expect(normalScore).to.be.below(0.3);     // Low smurf probability
    });
    
    it('should adjust effective rating for suspected smurfs', () => {
      const suspectedSmurf = {
        id: 1,
        rating: 1000,
        totalMatches: 3,
        wins: 3,
        averagePerformance: { damagePerMatch: 400, accuracyRate: 0.98 }
      };
      
      const effectiveRating = matchmakingService.calculateEffectiveRating(suspectedSmurf);
      expect(effectiveRating).to.be.above(suspectedSmurf.rating);
      
      // Should match against higher-rated players
      const matchRange = matchmakingService.getMatchingRange(suspectedSmurf);
      expect(matchRange.min).to.be.above(1000);
    });
  });
  
  describe('Geographic and Latency Considerations', () => {
    it('should prioritize low-latency matches', async () => {
      const players = [
        { id: 1, rating: 1000, region: 'us-east', avgLatency: 50 },
        { id: 2, rating: 1000, region: 'us-east', avgLatency: 60 },
        { id: 3, rating: 1000, region: 'eu-west', avgLatency: 150 },
        { id: 4, rating: 1000, region: 'asia', avgLatency: 200 }
      ];
      
      for (const player of players) {
        await matchmakingService.addToQueue(player, { maxPlayers: 2, entryFee: 1000000 });
      }
      
      const match = await matchmakingService.findMatch();
      
      if (match) {
        // Should prefer players from same region
        const regions = match.players.map(p => p.region);
        const uniqueRegions = new Set(regions);
        expect(uniqueRegions.size).to.equal(1); // Same region preferred
      }
    });
    
    it('should calculate expected match latency', () => {
      const match = {
        players: [
          { avgLatency: 50, region: 'us-east' },
          { avgLatency: 60, region: 'us-east' }
        ]
      };
      
      const expectedLatency = matchmakingService.calculateMatchLatency(match);
      expect(expectedLatency).to.be.below(100); // Should be reasonable
    });
  });
  
  describe('Match History and Stalking Prevention', () => {
    it('should avoid matching recent opponents', async () => {
      const player1 = { id: 1, rating: 1000, recentOpponents: [2, 3, 4] };
      const player2 = { id: 2, rating: 1000, recentOpponents: [1, 3, 5] };
      const player3 = { id: 3, rating: 1000, recentOpponents: [5, 6, 7] };
      
      const compatibility = matchmakingService.checkPlayerCompatibility(player1, player2);
      const freshMatch = matchmakingService.checkPlayerCompatibility(player1, player3);
      
      expect(compatibility).to.be.below(freshMatch); // Recent opponents less compatible
    });
    
    it('should detect and prevent targeted harassment', () => {
      const victim = { id: 1, rating: 1200 };
      const stalker = { 
        id: 2, 
        rating: 1200,
        matchHistory: [
          { opponentId: 1, timestamp: Date.now() - 3600000 }, // 1 hour ago
          { opponentId: 1, timestamp: Date.now() - 7200000 }, // 2 hours ago
          { opponentId: 1, timestamp: Date.now() - 10800000 }  // 3 hours ago
        ]
      };
      
      const isTargeting = matchmakingService.detectTargetedMatching(stalker, victim);
      expect(isTargeting).to.be.true;
      
      const shouldBlock = matchmakingService.shouldBlockMatching(stalker, victim);
      expect(shouldBlock).to.be.true;
    });
  });
  
  describe('Performance and Scalability', () => {
    it('should handle large queue sizes efficiently', async () => {
      // Create 1000 players
      const largeBatch = [];
      for (let i = 0; i < 1000; i++) {
        largeBatch.push({
          id: i,
          rating: 800 + Math.random() * 800,
          playerClass: ['warrior', 'mage', 'rogue', 'archer'][i % 4],
          username: `player${i}`
        });
      }
      
      const startTime = Date.now();
      
      // Add all to queue
      for (const player of largeBatch) {
        await matchmakingService.addToQueue(player, { maxPlayers: 2, entryFee: 1000000 });
      }
      
      const addTime = Date.now() - startTime;
      expect(addTime).to.be.below(5000); // Should complete in <5 seconds
      
      // Find matches
      const matchStart = Date.now();
      let matchCount = 0;
      
      while (matchmakingService.getQueueState().totalPlayersInQueue > 100) {
        const match = await matchmakingService.findMatch();
        if (match) {
          matchCount++;
          if (matchCount > 100) break; // Prevent infinite loop
        } else {
          break;
        }
      }
      
      const matchTime = Date.now() - matchStart;
      expect(matchTime).to.be.below(10000); // Should find many matches quickly
      expect(matchCount).to.be.above(100);  // Should create many matches
    });
    
    it('should maintain performance under concurrent operations', async () => {
      const concurrentOperations = 50;
      const operations = [];
      
      // Simulate concurrent queue operations
      for (let i = 0; i < concurrentOperations; i++) {
        operations.push(
          matchmakingService.addToQueue({
            id: i,
            rating: 1000 + Math.random() * 400,
            playerClass: 'warrior',
            username: `concurrent${i}`
          }, { maxPlayers: 2, entryFee: 1000000 })
        );
      }
      
      const startTime = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - startTime;
      
      expect(duration).to.be.below(2000); // Should handle concurrency well
      
      const queueState = matchmakingService.getQueueState();
      expect(queueState.totalPlayersInQueue).to.equal(concurrentOperations);
    });
  });
  
  describe('Configuration and Tuning', () => {
    it('should allow matchmaking parameter adjustments', () => {
      const defaultConfig = matchmakingService.getConfig();
      
      const newConfig = {
        maxRatingDifference: 150,
        searchExpansionRate: 2.0,
        maxWaitTime: 120000,
        qualityThreshold: 0.7
      };
      
      matchmakingService.updateConfig(newConfig);
      const updatedConfig = matchmakingService.getConfig();
      
      expect(updatedConfig.maxRatingDifference).to.equal(newConfig.maxRatingDifference);
      expect(updatedConfig.searchExpansionRate).to.equal(newConfig.searchExpansionRate);
    });
    
    it('should validate configuration parameters', () => {
      const invalidConfigs = [
        { maxRatingDifference: -100 },  // Negative
        { searchExpansionRate: 0 },      // Zero
        { qualityThreshold: 1.5 },       // Over 1.0
        { maxWaitTime: -5000 }           // Negative
      ];
      
      invalidConfigs.forEach(config => {
        expect(() => {
          matchmakingService.updateConfig(config);
        }).to.throw();
      });
    });
  });
});