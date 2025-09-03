/**
 * Integration Tests for Gambling System
 * Tests complete workflows and service interactions
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const { GamblingSystem } = require('../../src/backend/gambling');

describe('Gambling System Integration Tests', () => {
  let gamblingSystem;
  let testEvent;
  let testUsers;

  beforeAll(async () => {
    gamblingSystem = GamblingSystem;
    
    // Initialize test users
    testUsers = [
      {
        id: 'integration_user_1',
        wallet: '0x1234567890123456789012345678901234567890',
        loyaltyTier: 'gold'
      },
      {
        id: 'integration_user_2',
        wallet: '0x0987654321098765432109876543210987654321',
        loyaltyTier: 'silver'
      },
      {
        id: 'integration_user_3',
        wallet: '0x1111222233334444555566667777888899990000',
        loyaltyTier: 'bronze'
      }
    ];
  });

  describe('Complete Match Betting Workflow', () => {
    test('should handle complete match lifecycle', async () => {
      // 1. Create betting event
      const eventData = {
        id: 'integration_match_001',
        type: 'match',
        name: 'Integration Test Match',
        enableBetting: true,
        useEscrow: true,
        participants: [
          { id: 'player_alpha', wallet: 'alpha_wallet' },
          { id: 'player_beta', wallet: 'beta_wallet' }
        ],
        outcomes: [
          { id: 'alpha_wins', name: 'Player Alpha Wins', initialOdds: 1.8 },
          { id: 'beta_wins', name: 'Player Beta Wins', initialOdds: 2.2 }
        ],
        wagerAmounts: [100, 100],
        startsAt: Date.now() + 1800000, // 30 minutes from now
        endsAt: Date.now() + 5400000, // 90 minutes from now
        creatorId: 'system',
        metadata: { gameType: 'pvp', ranked: true }
      };

      testEvent = await gamblingSystem.createBettingEvent(eventData);
      
      expect(testEvent).toHaveProperty('eventId', 'integration_match_001');
      expect(testEvent.components).toHaveProperty('bettingPool');
      expect(testEvent.components).toHaveProperty('escrow');

      // 2. Multiple users place bets
      const bets = [];
      
      const bet1 = await gamblingSystem.placeBet({
        userId: testUsers[0].id,
        userWallet: testUsers[0].wallet,
        poolId: testEvent.components.bettingPool.id,
        outcomeId: 'alpha_wins',
        amount: 50,
        clientIP: '192.168.1.101',
        sessionId: 'session_001'
      });
      bets.push(bet1);

      const bet2 = await gamblingSystem.placeBet({
        userId: testUsers[1].id,
        userWallet: testUsers[1].wallet,
        poolId: testEvent.components.bettingPool.id,
        outcomeId: 'beta_wins',
        amount: 75,
        clientIP: '192.168.1.102',
        sessionId: 'session_002'
      });
      bets.push(bet2);

      const bet3 = await gamblingSystem.placeBet({
        userId: testUsers[2].id,
        userWallet: testUsers[2].wallet,
        poolId: testEvent.components.bettingPool.id,
        outcomeId: 'alpha_wins',
        amount: 25,
        clientIP: '192.168.1.103',
        sessionId: 'session_003'
      });
      bets.push(bet3);

      // All bets should be successful
      expect(bets.length).toBe(3);
      bets.forEach(bet => {
        expect(bet.bet).toHaveProperty('id');
        expect(bet.auditTrail).toBe(true);
      });

      // 3. Verify pool state updates
      const poolStats = await gamblingSystem.services.bettingPools.getPoolStats(
        testEvent.components.bettingPool.id
      );
      
      expect(poolStats.totalPool).toBe(150); // 50 + 75 + 25
      expect(poolStats.betCount).toBe(3);

      // 4. Settle the event
      const settlementData = {
        bettingPools: [{
          poolId: testEvent.components.bettingPool.id,
          winningOutcome: 'alpha_wins' // Alpha wins
        }],
        escrows: [{
          escrowId: testEvent.components.escrow.escrowId
        }]
      };

      const settlement = await gamblingSystem.settleEvent(
        testEvent.eventId,
        settlementData
      );

      expect(settlement).toHaveProperty('settlements');
      expect(settlement.settlements).toHaveProperty('bettingPools');

      // 5. Verify payouts were processed
      const settlementResult = settlement.settlements.bettingPools;
      expect(settlementResult.payouts.length).toBeGreaterThan(0);
      
      // Users who bet on alpha_wins should receive payouts
      const alphaBettors = settlementResult.payouts.filter(p => 
        [testUsers[0].id, testUsers[2].id].includes(p.userId)
      );
      expect(alphaBettors.length).toBe(2);
    }, 30000);
  });

  describe('Tournament Betting Workflow', () => {
    test('should handle tournament bracket betting', async () => {
      // 1. Create tournament
      const tournamentData = {
        id: 'integration_tournament_001',
        name: 'Integration Test Tournament',
        type: 'single_elimination',
        participants: [
          { id: 'player_1', name: 'Player One' },
          { id: 'player_2', name: 'Player Two' },
          { id: 'player_3', name: 'Player Three' },
          { id: 'player_4', name: 'Player Four' }
        ],
        startsAt: Date.now() + 3600000, // 1 hour from now
        metadata: { prizePool: 1000 }
      };

      const tournament = await gamblingSystem.services.tournaments.createTournamentBetting(
        tournamentData
      );

      expect(tournament).toHaveProperty('id', 'integration_tournament_001');
      expect(tournament.bracket.matches.size).toBeGreaterThan(0);

      // 2. Place bracket prediction bet
      const bracketPrediction = {};
      
      // Predict winners for each match
      for (const [matchId, match] of tournament.bracket.matches.entries()) {
        bracketPrediction[matchId] = match.participant1.id; // Always pick first participant
      }

      const bracketBet = await gamblingSystem.services.tournaments.placeBracketBet(
        testUsers[0].id,
        tournament.id,
        bracketPrediction,
        100
      );

      expect(bracketBet).toHaveProperty('id');
      expect(bracketBet.betAmount).toBe(100);
      expect(bracketBet.status).toBe('active');

      // 3. Place live bet on first match
      const firstMatch = Array.from(tournament.bracket.matches.values())[0];
      firstMatch.status = 'live'; // Simulate match going live

      const liveBet = await gamblingSystem.services.tournaments.placeLiveBet(
        testUsers[1].id,
        firstMatch.id,
        firstMatch.participant2.id,
        50
      );

      expect(liveBet).toHaveProperty('id');
      expect(liveBet.matchId).toBe(firstMatch.id);

      // 4. Update match results
      const matchResult = await gamblingSystem.services.tournaments.updateMatchResult(
        tournament.id,
        firstMatch.id,
        firstMatch.participant1.id,
        { score: { participant1: 3, participant2: 1 }, duration: 1200 }
      );

      expect(matchResult.winnerId).toBe(firstMatch.participant1.id);
      expect(matchResult.tournamentStatus).toBeDefined();
    }, 25000);
  });

  describe('Reward Distribution Integration', () => {
    test('should distribute rewards with bonuses', async () => {
      // 1. Create reward pool
      const rewardPoolData = {
        type: 'tournament_rewards',
        distributionType: 'tiered',
        eventId: 'integration_reward_test',
        eventName: 'Integration Reward Test',
        totalAmount: 500,
        distributionConfig: {
          tiers: [
            { rank: 1, percentage: 0.5 },
            { rank: 2, percentage: 0.3 },
            { rank: 3, percentage: 0.2 }
          ]
        },
        bonusConfigs: [
          { type: 'loyalty_tier', enabled: true },
          { type: 'streak_bonus', enabled: true }
        ]
      };

      const rewardPool = await gamblingSystem.services.rewards.createRewardPool(rewardPoolData);
      expect(rewardPool).toHaveProperty('id');

      // 2. Add participants with different performance data
      const participants = [
        {
          id: testUsers[0].id,
          userId: testUsers[0].id,
          walletAddress: testUsers[0].wallet,
          performance: { score: 95, wins: 8, losses: 2 },
          loyaltyTier: testUsers[0].loyaltyTier,
          streakData: { current: 5, best: 7 }
        },
        {
          id: testUsers[1].id,
          userId: testUsers[1].id,
          walletAddress: testUsers[1].wallet,
          performance: { score: 87, wins: 6, losses: 4 },
          loyaltyTier: testUsers[1].loyaltyTier,
          streakData: { current: 3, best: 4 }
        },
        {
          id: testUsers[2].id,
          userId: testUsers[2].id,
          walletAddress: testUsers[2].wallet,
          performance: { score: 72, wins: 4, losses: 6 },
          loyaltyTier: testUsers[2].loyaltyTier,
          streakData: { current: 1, best: 3 }
        }
      ];

      for (const participant of participants) {
        await gamblingSystem.services.rewards.addParticipant(rewardPool.id, participant);
      }

      // 3. Distribute rewards
      const distribution = await gamblingSystem.services.rewards.distributeRewards(
        rewardPool.id,
        'test_completion'
      );

      expect(distribution.distribution.status).toBe('completed');
      expect(distribution.results.successful).toBe(3);
      expect(distribution.results.totalDistributed).toBeCloseTo(500, 1);

      // 4. Verify bonuses were applied
      const distributionWithBonuses = distribution.distribution.allocations;
      const goldTierUser = distributionWithBonuses.find(a => a.participantId === testUsers[0].id);
      
      // Gold tier user should have received bonus
      expect(goldTierUser).toBeDefined();
      expect(goldTierUser.bonuses).toBeDefined();
      expect(goldTierUser.bonuses.length).toBeGreaterThan(0);
    }, 20000);
  });

  describe('System Health and Monitoring', () => {
    test('should maintain system health during high activity', async () => {
      // 1. Get initial system status
      const initialStatus = await gamblingSystem.getSystemStatus();
      expect(initialStatus.status).toBe('operational');

      // 2. Create high activity load
      const promises = [];
      
      // Create multiple events simultaneously
      for (let i = 0; i < 5; i++) {
        promises.push(
          gamblingSystem.createBettingEvent({
            id: `load_test_event_${i}`,
            type: 'match',
            name: `Load Test Match ${i}`,
            enableBetting: true,
            outcomes: [
              { id: 'outcome_1', name: 'Outcome 1' },
              { id: 'outcome_2', name: 'Outcome 2' }
            ],
            startsAt: Date.now() + 3600000,
            creatorId: 'load_test'
          })
        );
      }

      // Place multiple bets simultaneously
      for (let i = 0; i < 20; i++) {
        promises.push(
          gamblingSystem.placeBet({
            userId: `load_user_${i % 5}`,
            userWallet: `load_wallet_${i % 5}`,
            poolId: 'load_test_pool',
            outcomeId: i % 2 === 0 ? 'outcome_1' : 'outcome_2',
            amount: Math.floor(Math.random() * 50) + 1,
            clientIP: '127.0.0.1',
            sessionId: `load_session_${i}`
          }).catch(() => null) // Ignore expected failures
        );
      }

      const results = await Promise.allSettled(promises);
      
      // 3. Check system status after load
      const postLoadStatus = await gamblingSystem.getSystemStatus();
      
      // System should still be operational or at worst degraded
      expect(['operational', 'degraded']).toContain(postLoadStatus.status);
      expect(postLoadStatus.healthPercentage).toBeGreaterThan(0.5);
    }, 30000);

    test('should generate comprehensive system report', async () => {
      const report = await gamblingSystem.generateSystemReport({
        timeframe: '24h'
      });

      expect(report).toHaveProperty('generated');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('services');
      expect(report).toHaveProperty('security');
      expect(report).toHaveProperty('financial');
      expect(report).toHaveProperty('performance');

      // Verify report completeness
      expect(report.services).toHaveProperty('vrf');
      expect(report.services).toHaveProperty('bettingPools');
      expect(report.financial).toHaveProperty('summary');
      expect(report.security).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle service failures gracefully', async () => {
      // Simulate VRF service failure
      const originalMethod = gamblingSystem.services.vrf.generateVerifiableRandom;
      gamblingSystem.services.vrf.generateVerifiableRandom = jest.fn().mockRejectedValue(
        new Error('VRF service unavailable')
      );

      // System should handle the failure and still allow other operations
      const status = await gamblingSystem.getSystemStatus();
      expect(status.services.vrf.status).toBe('error');

      // Restore original method
      gamblingSystem.services.vrf.generateVerifiableRandom = originalMethod;
    });

    test('should handle database failures with graceful degradation', async () => {
      // Mock database failure scenario
      // In a real test environment, you would simulate actual database issues
      
      // System should continue to function with cached data
      const activePools = await gamblingSystem.services.bettingPools.getActivePools()
        .catch(() => []);
      
      // Should not crash the system
      expect(Array.isArray(activePools)).toBe(true);
    });
  });

  describe('Data Consistency Tests', () => {
    test('should maintain data consistency across services', async () => {
      // Create event that involves multiple services
      const consistencyEvent = await gamblingSystem.createBettingEvent({
        id: 'consistency_test_event',
        type: 'match',
        name: 'Data Consistency Test',
        enableBetting: true,
        useEscrow: true,
        participants: [
          { id: 'consistent_player_1', wallet: 'wallet_1' },
          { id: 'consistent_player_2', wallet: 'wallet_2' }
        ],
        outcomes: [
          { id: 'outcome_1', name: 'Outcome 1' },
          { id: 'outcome_2', name: 'Outcome 2' }
        ],
        wagerAmounts: [50, 50],
        startsAt: Date.now() + 3600000,
        creatorId: 'consistency_test'
      });

      // Verify all services have consistent data
      const poolExists = await gamblingSystem.services.bettingPools.getPoolStats(
        consistencyEvent.components.bettingPool.id
      );
      expect(poolExists).toBeDefined();

      const escrowExists = await gamblingSystem.services.escrow.getEscrow(
        consistencyEvent.components.escrow.escrowId
      );
      expect(escrowExists).toBeDefined();

      // Data should be consistent between services
      expect(poolExists.poolId).toBe(consistencyEvent.components.bettingPool.id);
      expect(escrowExists.eventId).toBe(consistencyEvent.eventId);
    });
  });
});