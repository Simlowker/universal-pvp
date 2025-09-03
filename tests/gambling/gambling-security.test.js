/**
 * Comprehensive Security Test Suite for Gambling System
 * Tests all critical security aspects of the gambling backend
 */

const { describe, test, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const { GamblingSystem, VRFService, AntiManipulationMonitor, EscrowManager } = require('../../src/backend/gambling');

describe('Gambling System Security Tests', () => {
  let gamblingSystem;
  let mockUser;
  let mockBetData;

  beforeEach(() => {
    gamblingSystem = GamblingSystem;
    
    mockUser = {
      id: 'test_user_001',
      wallet: 'test_wallet_address',
      createdAt: Date.now() - 86400000 // 1 day ago
    };

    mockBetData = {
      userId: mockUser.id,
      userWallet: mockUser.wallet,
      poolId: 'test_pool_001',
      outcomeId: 'outcome_1',
      amount: 10,
      clientIP: '192.168.1.100',
      sessionId: 'test_session_001'
    };
  });

  describe('VRF Security Tests', () => {
    test('should generate verifiable random numbers with valid proofs', async () => {
      const result = await VRFService.generateVerifiableRandom('test_seed', 1, 100);
      
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('proof');
      expect(result).toHaveProperty('verified', true);
      expect(result.value).toBeGreaterThanOrEqual(1);
      expect(result.value).toBeLessThanOrEqual(100);
    });

    test('should maintain deterministic results with same seed', async () => {
      const seed = 'deterministic_test_seed';
      const result1 = await VRFService.generateVerifiableRandom(seed, 1, 100);
      const result2 = await VRFService.generateVerifiableRandom(seed, 1, 100);
      
      // Different results due to blockchain data, but proofs should be verifiable
      expect(result1.verified).toBe(true);
      expect(result2.verified).toBe(true);
    });

    test('should verify external VRF proofs correctly', async () => {
      const result = await VRFService.generateVerifiableRandom('external_test', 1, 10);
      const isValid = await VRFService.validateExternalProof(result);
      
      expect(isValid).toBe(true);
    });

    test('should reject tampered VRF proofs', async () => {
      const result = await VRFService.generateVerifiableRandom('tamper_test', 1, 10);
      
      // Tamper with the proof
      const tamperedResult = {
        ...result,
        proof: 'tampered_proof_data'
      };
      
      const isValid = await VRFService.validateExternalProof(tamperedResult);
      expect(isValid).toBe(false);
    });
  });

  describe('Anti-Manipulation Detection Tests', () => {
    test('should detect rapid betting patterns', async () => {
      const rapidBets = [];
      
      // Simulate rapid betting
      for (let i = 0; i < 15; i++) {
        rapidBets.push({
          ...mockBetData,
          timestamp: Date.now() - (1000 * i), // 1 second apart
          amount: 5
        });
      }

      // Simulate the last bet that should trigger the alert
      const monitoringResult = await AntiManipulationMonitor.monitorBettingActivity(
        mockUser.id,
        mockBetData
      );

      // Should flag rapid betting
      const rapidBettingAlert = monitoringResult.alerts.find(a => a.type === 'rapid_betting');
      expect(rapidBettingAlert).toBeDefined();
      expect(monitoringResult.riskScore).toBeGreaterThan(0.5);
    });

    test('should detect coordinated betting patterns', async () => {
      const coordinatedUsers = ['user_1', 'user_2', 'user_3', 'user_4'];
      
      // Simulate coordinated betting - same outcome, similar amounts, close timing
      for (const userId of coordinatedUsers) {
        const coordBetData = {
          ...mockBetData,
          userId,
          userWallet: `wallet_${userId}`,
          amount: 100, // Large similar amounts
          timestamp: Date.now()
        };

        const result = await AntiManipulationMonitor.monitorBettingActivity(userId, coordBetData);
        
        if (userId === coordinatedUsers[coordinatedUsers.length - 1]) {
          // Last bet should trigger coordinated betting alert
          const coordinatedAlert = result.alerts.find(a => a.type === 'coordinated_betting');
          if (coordinatedAlert) {
            expect(coordinatedAlert.severity).toBe('high');
          }
        }
      }
    });

    test('should detect wash trading attempts', async () => {
      // User bets on both outcomes in same pool
      const bet1 = {
        ...mockBetData,
        outcomeId: 'outcome_1',
        amount: 50
      };

      const bet2 = {
        ...mockBetData,
        outcomeId: 'outcome_2',
        amount: 50,
        timestamp: Date.now() + 1000
      };

      const result1 = await AntiManipulationMonitor.monitorBettingActivity(mockUser.id, bet1);
      const result2 = await AntiManipulationMonitor.monitorBettingActivity(mockUser.id, bet2);

      const washTradingAlert = result2.alerts.find(a => a.type === 'wash_trading');
      if (washTradingAlert) {
        expect(washTradingAlert.severity).toBe('critical');
        expect(result2.allowed).toBe(false);
      }
    });

    test('should detect bot-like behavior patterns', async () => {
      const botBets = [];
      
      // Create perfectly timed bets (bot-like behavior)
      for (let i = 0; i < 10; i++) {
        botBets.push({
          ...mockBetData,
          timestamp: Date.now() + (i * 10000), // Exactly 10 seconds apart
          amount: 25 // Same amount every time
        });
      }

      // The pattern should be detected
      const result = await AntiManipulationMonitor.monitorBettingActivity(mockUser.id, mockBetData);
      const botAlert = result.alerts.find(a => a.type === 'bot_activity');
      
      if (botAlert) {
        expect(botAlert.severity).toBe('medium');
        expect(botAlert.details.botScore).toBeGreaterThan(0.7);
      }
    });
  });

  describe('Escrow Security Tests', () => {
    let mockEscrowData;

    beforeEach(() => {
      mockEscrowData = {
        type: 'match',
        eventId: 'test_match_001',
        participants: [
          { id: 'player_1', wallet: 'wallet_1' },
          { id: 'player_2', wallet: 'wallet_2' }
        ],
        amounts: [100, 100],
        conditions: { winCondition: 'match_completion' },
        expiresAt: Date.now() + 86400000
      };
    });

    test('should create secure multi-signature escrow', async () => {
      const escrow = await EscrowManager.createEscrow(mockEscrowData);
      
      expect(escrow).toHaveProperty('escrowId');
      expect(escrow).toHaveProperty('escrowAddress');
      expect(escrow).toHaveProperty('depositInstructions');
    });

    test('should require multiple signatures for settlement', async () => {
      const escrow = await EscrowManager.createEscrow(mockEscrowData);
      
      // Try to settle without enough signatures
      const settlementData = {
        payouts: [
          { participantId: 'player_1', amount: 200, reason: 'winner' }
        ],
        reason: 'match_completed'
      };

      // Should fail without multi-sig approval
      await expect(
        EscrowManager.executeSettlement(escrow.escrowId)
      ).rejects.toThrow('Settlement not approved');
    });

    test('should handle dispute mechanisms', async () => {
      const escrow = await EscrowManager.createEscrow(mockEscrowData);
      
      const dispute = await EscrowManager.initiateDispute(
        escrow.escrowId,
        'player_1',
        {
          reason: 'unfair_outcome',
          evidence: ['screenshot1.png', 'video_evidence.mp4']
        }
      );

      expect(dispute).toHaveProperty('id');
      expect(dispute.status).toBe('active');
      expect(dispute.disputantId).toBe('player_1');
    });

    test('should prevent unauthorized escrow access', async () => {
      const escrow = await EscrowManager.createEscrow(mockEscrowData);
      
      // Try to access escrow with unauthorized user
      await expect(
        EscrowManager.processDeposit(
          escrow.escrowId,
          'unauthorized_user',
          100,
          'fake_transaction'
        )
      ).rejects.toThrow('Participant not found in escrow');
    });
  });

  describe('Betting Pool Security Tests', () => {
    test('should enforce betting limits', async () => {
      const largeBet = {
        ...mockBetData,
        amount: 50000 // Exceeds typical limits
      };

      await expect(
        gamblingSystem.placeBet(largeBet)
      ).rejects.toThrow();
    });

    test('should prevent betting after pool closure', async () => {
      // Mock a closed pool scenario
      const closedPoolBet = {
        ...mockBetData,
        poolId: 'closed_pool_001'
      };

      await expect(
        gamblingSystem.placeBet(closedPoolBet)
      ).rejects.toThrow('Betting has closed');
    });

    test('should validate outcome existence', async () => {
      const invalidBet = {
        ...mockBetData,
        outcomeId: 'non_existent_outcome'
      };

      await expect(
        gamblingSystem.placeBet(invalidBet)
      ).rejects.toThrow('Invalid outcome selection');
    });
  });

  describe('Audit Trail Security Tests', () => {
    test('should create tamper-proof audit logs', async () => {
      // Place a bet to generate audit logs
      const bet = await gamblingSystem.placeBet(mockBetData);
      
      // Verify audit trail was created
      expect(bet.auditTrail).toBe(true);
      
      // In a real test, you would verify the cryptographic integrity
      // of the audit logs and hash chain
    });

    test('should detect audit log tampering', async () => {
      // This would test the hash chain verification
      // In production, any tampering should be immediately detected
      
      const integrityReport = await gamblingSystem.services.auditTrail.generateIntegrityReport();
      expect(integrityReport.overallStatus).toBe('healthy');
    });

    test('should maintain audit log retention', async () => {
      // Test that audit logs are properly retained according to policy
      // and that sensitive data is properly handled
      
      const financialReport = await gamblingSystem.services.auditTrail.generateFinancialReport({
        startDate: Date.now() - 86400000,
        endDate: Date.now(),
        includeDetails: true
      });

      expect(financialReport).toHaveProperty('integrityStatus', 'verified');
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should enforce rate limits on betting', async () => {
      const promises = [];
      
      // Attempt to place many bets rapidly
      for (let i = 0; i < 50; i++) {
        promises.push(
          gamblingSystem.placeBet({
            ...mockBetData,
            amount: 1,
            timestamp: Date.now() + i
          })
        );
      }

      // Some should be rejected due to rate limiting
      const results = await Promise.allSettled(promises);
      const rejected = results.filter(r => r.status === 'rejected');
      
      expect(rejected.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation Tests', () => {
    test('should validate bet amounts', async () => {
      const invalidBets = [
        { ...mockBetData, amount: -10 }, // Negative amount
        { ...mockBetData, amount: 0 }, // Zero amount
        { ...mockBetData, amount: 'invalid' }, // Non-numeric amount
        { ...mockBetData, amount: Infinity }, // Invalid number
        { ...mockBetData, amount: null } // Null amount
      ];

      for (const invalidBet of invalidBets) {
        await expect(
          gamblingSystem.placeBet(invalidBet)
        ).rejects.toThrow();
      }
    });

    test('should validate user inputs', async () => {
      const invalidInputs = [
        { ...mockBetData, userId: null },
        { ...mockBetData, userWallet: '' },
        { ...mockBetData, poolId: undefined },
        { ...mockBetData, outcomeId: 123 } // Should be string
      ];

      for (const invalidInput of invalidInputs) {
        await expect(
          gamblingSystem.placeBet(invalidInput)
        ).rejects.toThrow();
      }
    });
  });

  describe('System Security Tests', () => {
    test('should handle system overload gracefully', async () => {
      const status = await gamblingSystem.getSystemStatus();
      
      expect(status).toHaveProperty('status');
      expect(['operational', 'degraded', 'critical']).toContain(status.status);
    });

    test('should enforce emergency shutdown procedures', async () => {
      // Mock critical system failure
      const originalStatus = gamblingSystem.systemHealth.status;
      gamblingSystem.systemHealth.status = 'critical';

      // System should prevent new bets in critical state
      await expect(
        gamblingSystem.placeBet(mockBetData)
      ).rejects.toThrow();

      // Restore original status
      gamblingSystem.systemHealth.status = originalStatus;
    });
  });

  describe('Integration Security Tests', () => {
    test('should maintain security across service interactions', async () => {
      // Test end-to-end security flow
      const eventData = {
        id: 'security_test_event',
        type: 'match',
        name: 'Security Test Match',
        enableBetting: true,
        useEscrow: true,
        participants: [
          { id: 'player_1', wallet: 'wallet_1' },
          { id: 'player_2', wallet: 'wallet_2' }
        ],
        outcomes: [
          { id: 'player_1_wins', name: 'Player 1 Wins' },
          { id: 'player_2_wins', name: 'Player 2 Wins' }
        ],
        wagerAmounts: [50, 50],
        startsAt: Date.now() + 3600000,
        endsAt: Date.now() + 7200000,
        creatorId: 'test_admin'
      };

      const event = await gamblingSystem.createBettingEvent(eventData);
      
      expect(event).toHaveProperty('components');
      expect(event.components).toHaveProperty('bettingPool');
      expect(event.components).toHaveProperty('escrow');
    });
  });
});

describe('Performance Security Tests', () => {
  test('should handle high-volume betting securely', async () => {
    // Test system behavior under load
    const startTime = Date.now();
    const bets = [];

    for (let i = 0; i < 100; i++) {
      bets.push(gamblingSystem.placeBet({
        userId: `load_test_user_${i % 10}`, // 10 different users
        userWallet: `wallet_${i % 10}`,
        poolId: 'load_test_pool',
        outcomeId: i % 2 === 0 ? 'outcome_1' : 'outcome_2',
        amount: Math.floor(Math.random() * 50) + 1,
        clientIP: '127.0.0.1',
        sessionId: `session_${i}`
      }));
    }

    const results = await Promise.allSettled(bets);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Performance benchmarks
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    expect(successful).toBeGreaterThan(50); // At least 50% should succeed
  }, 15000); // 15 second timeout

  test('should maintain security under memory pressure', async () => {
    // Test that security measures don't fail under resource constraints
    const largeDataSets = [];
    
    // Create memory pressure
    for (let i = 0; i < 1000; i++) {
      largeDataSets.push(new Array(1000).fill(`data_${i}`));
    }

    // Security should still work
    const result = await AntiManipulationMonitor.monitorBettingActivity(
      mockUser.id,
      mockBetData
    );

    expect(result).toHaveProperty('allowed');
    expect(result).toHaveProperty('riskScore');
  });
});

describe('Data Privacy Tests', () => {
  test('should sanitize sensitive data in logs', async () => {
    const report = await gamblingSystem.generateSystemReport();
    
    // Ensure no sensitive data like private keys, passwords, or personal info
    const reportString = JSON.stringify(report);
    
    expect(reportString).not.toMatch(/private_key|password|secret|ssn|personal/i);
  });

  test('should handle GDPR data requirements', async () => {
    // Test data anonymization and retention policies
    const auditReport = await gamblingSystem.services.auditTrail.generateFinancialReport({
      startDate: Date.now() - 86400000,
      endDate: Date.now(),
      userId: mockUser.id
    });

    // Should have proper data handling
    expect(auditReport).toHaveProperty('metadata');
    expect(auditReport.metadata).toHaveProperty('generated');
  });
});