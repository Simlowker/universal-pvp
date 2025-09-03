/**
 * Gasless Transaction Validation Test Suite
 * Tests gasless transaction mechanisms for MagicBlock integration
 */

const { expect } = require('@jest/globals');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

// Mock MagicBlock gasless transaction components
const GaslessTransactionManager = require('../../../src/magicblock/gasless_transaction_manager');
const SessionKeyManager = require('../../../src/magicblock/session_key_manager');
const TransactionBatcher = require('../../../src/magicblock/transaction_batcher');

describe('Gasless Transaction System', () => {
  let gaslessManager;
  let sessionKeyManager;
  let transactionBatcher;
  
  beforeEach(() => {
    gaslessManager = new GaslessTransactionManager({
      network: 'testnet',
      endpoint: 'https://api.testnet.magicblock.gg',
      maxBatchSize: 10,
      batchInterval: 100 // ms
    });
    
    sessionKeyManager = new SessionKeyManager();
    transactionBatcher = new TransactionBatcher({
      maxBatchSize: 20,
      maxWaitTime: 50 // ms
    });
  });

  afterEach(async () => {
    await gaslessManager.cleanup();
    await sessionKeyManager.cleanup();
    await transactionBatcher.cleanup();
  });

  describe('Session Key Management', () => {
    test('should generate valid session keys within 5ms', () => {
      const startTime = performance.now();
      
      const sessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        duration: 3600, // 1 hour
        permissions: ['move', 'attack', 'use_item']
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5);
      expect(sessionKey).toBeDefined();
      expect(sessionKey.publicKey).toBeDefined();
      expect(sessionKey.privateKey).toBeDefined();
      expect(sessionKey.expiresAt).toBeGreaterThan(Date.now());
      expect(sessionKey.permissions).toEqual(['move', 'attack', 'use_item']);
    });

    test('should validate session key signatures correctly', () => {
      const sessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        duration: 3600,
        permissions: ['move', 'attack']
      });
      
      const startTime = performance.now();
      
      // Create a transaction to sign
      const transaction = {
        type: 'move',
        data: { x: 100, y: 200 },
        timestamp: Date.now(),
        nonce: Math.random()
      };
      
      // Sign with session key
      const signature = sessionKeyManager.signTransaction(sessionKey, transaction);
      
      // Validate signature
      const isValid = sessionKeyManager.validateSignature(
        sessionKey.publicKey,
        transaction,
        signature
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(2); // Validation should be very fast
      expect(isValid).toBe(true);
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
    });

    test('should reject expired session keys', () => {
      const expiredSessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        duration: -1, // Already expired
        permissions: ['move']
      });
      
      const transaction = {
        type: 'move',
        data: { x: 50, y: 75 },
        timestamp: Date.now()
      };
      
      expect(() => {
        sessionKeyManager.signTransaction(expiredSessionKey, transaction);
      }).toThrow('Session key expired');
    });

    test('should reject unauthorized actions', () => {
      const limitedSessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        duration: 3600,
        permissions: ['move'] // Only move permission
      });
      
      const attackTransaction = {
        type: 'attack',
        data: { targetId: 'enemy_123', damage: 25 },
        timestamp: Date.now()
      };
      
      expect(() => {
        sessionKeyManager.signTransaction(limitedSessionKey, attackTransaction);
      }).toThrow('Action not permitted');
    });
  });

  describe('Transaction Batching', () => {
    test('should batch transactions efficiently within time limits', async () => {
      const transactions = [];
      
      // Generate multiple small transactions
      for (let i = 0; i < 15; i++) {
        transactions.push({
          type: 'move',
          playerId: `player_${i}`,
          data: { x: i * 10, y: i * 5 },
          timestamp: Date.now() + i
        });
      }
      
      const startTime = performance.now();
      
      // Submit all transactions for batching
      const batchPromises = transactions.map(tx => 
        transactionBatcher.submitTransaction(tx)
      );
      
      const results = await Promise.all(batchPromises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(results.length).toBe(15);
      
      // All transactions should be successfully batched
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.batchId).toBeDefined();
      });
      
      // Should have created appropriate number of batches
      const uniqueBatches = new Set(results.map(r => r.batchId));
      expect(uniqueBatches.size).toBeLessThanOrEqual(2); // 15 txs, max 10 per batch
    });

    test('should handle batch size limits correctly', async () => {
      const largeBatch = [];
      
      // Create more transactions than batch limit
      for (let i = 0; i < 25; i++) {
        largeBatch.push({
          type: 'move',
          playerId: `player_${i}`,
          data: { x: i, y: i },
          timestamp: Date.now() + i
        });
      }
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        largeBatch.map(tx => transactionBatcher.submitTransaction(tx))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(150); // Allow more time for multiple batches
      
      // Check batch distribution
      const batchCounts = {};
      results.forEach(result => {
        batchCounts[result.batchId] = (batchCounts[result.batchId] || 0) + 1;
      });
      
      // No batch should exceed the limit
      Object.values(batchCounts).forEach(count => {
        expect(count).toBeLessThanOrEqual(20); // Batch size limit
      });
    });

    test('should prioritize transactions by type and urgency', async () => {
      const mixedTransactions = [
        { type: 'move', priority: 'normal', playerId: 'p1', data: { x: 1, y: 1 } },
        { type: 'attack', priority: 'high', playerId: 'p2', data: { target: 'enemy' } },
        { type: 'heal', priority: 'urgent', playerId: 'p3', data: { amount: 50 } },
        { type: 'move', priority: 'normal', playerId: 'p4', data: { x: 2, y: 2 } },
        { type: 'special_ability', priority: 'high', playerId: 'p5', data: { ability: 'fireball' } }
      ];
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        mixedTransactions.map(tx => transactionBatcher.submitTransaction(tx))
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(80);
      
      // Verify all transactions were processed
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.processingOrder).toBeDefined();
      });
      
      // High priority transactions should be processed first
      const urgentResult = results.find(r => r.transaction.priority === 'urgent');
      const normalResults = results.filter(r => r.transaction.priority === 'normal');
      
      expect(urgentResult.processingOrder).toBeLessThan(
        Math.max(...normalResults.map(r => r.processingOrder))
      );
    });
  });

  describe('Gasless Execution', () => {
    test('should execute gasless transactions without user gas payment', async () => {
      const sessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        duration: 3600,
        permissions: ['move', 'attack', 'use_item']
      });
      
      const transaction = {
        type: 'move',
        playerId: 'player_123',
        data: { x: 150, y: 250 },
        timestamp: Date.now()
      };
      
      const startTime = performance.now();
      
      // Execute gasless transaction
      const result = await gaslessManager.executeGaslessTransaction({
        transaction,
        sessionKey,
        sponsorWallet: 'sponsor_wallet_address'
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(30); // 30ms target
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBeDefined();
      expect(result.gasUsed).toBeGreaterThan(0);
      expect(result.gasSponsor).toBe('sponsor_wallet_address');
      expect(result.userGasPaid).toBe(0); // User paid no gas
    });

    test('should handle gas estimation accurately', async () => {
      const transactions = [
        { type: 'move', data: { x: 10, y: 20 } },
        { type: 'attack', data: { target: 'enemy', damage: 25 } },
        { type: 'use_item', data: { itemId: 'potion', amount: 1 } },
        { type: 'special_ability', data: { ability: 'teleport', x: 100, y: 100 } }
      ];
      
      const estimates = [];
      const startTime = performance.now();
      
      for (const tx of transactions) {
        const estimate = await gaslessManager.estimateGas(tx);
        estimates.push(estimate);
      }
      
      const endTime = performance.now();
      const totalEstimationTime = endTime - startTime;
      
      expect(totalEstimationTime).toBeLessThan(20); // All estimates under 20ms
      
      // Verify estimates are reasonable
      expect(estimates[0]).toBeLessThan(estimates[1]); // move < attack
      expect(estimates[1]).toBeLessThan(estimates[3]); // attack < special_ability
      
      estimates.forEach(estimate => {
        expect(estimate).toBeGreaterThan(0);
        expect(estimate).toBeLessThan(1000000); // Reasonable gas limit
      });
    });

    test('should handle transaction failures gracefully', async () => {
      const invalidTransaction = {
        type: 'invalid_action',
        playerId: 'nonexistent_player',
        data: { invalid: 'data' },
        timestamp: Date.now()
      };
      
      const sessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: '5J1F7GHAvpWXrF5VK2VZ8k4yJ3X8X8X8X8X8X8X8X8X8',
        duration: 3600,
        permissions: ['move']
      });
      
      const startTime = performance.now();
      
      const result = await gaslessManager.executeGaslessTransaction({
        transaction: invalidTransaction,
        sessionKey,
        sponsorWallet: 'sponsor_wallet_address'
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(15); // Should fail quickly
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid transaction type');
      expect(result.gasUsed).toBe(0); // No gas used on validation failure
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high-throughput transaction processing', async () => {
      const concurrentTransactions = 100;
      const transactions = [];
      
      // Generate many concurrent transactions
      for (let i = 0; i < concurrentTransactions; i++) {
        const sessionKey = sessionKeyManager.generateSessionKey({
          playerPublicKey: `player_key_${i}`,
          duration: 3600,
          permissions: ['move', 'attack']
        });
        
        transactions.push({
          sessionKey,
          transaction: {
            type: 'move',
            playerId: `player_${i}`,
            data: { x: i % 100, y: Math.floor(i / 100) },
            timestamp: Date.now() + i
          }
        });
      }
      
      const startTime = performance.now();
      
      // Process all transactions concurrently
      const results = await Promise.all(
        transactions.map(({ sessionKey, transaction }) => 
          gaslessManager.executeGaslessTransaction({
            transaction,
            sessionKey,
            sponsorWallet: 'high_volume_sponsor'
          })
        )
      );
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should process 100 transactions in under 200ms (2ms per tx average)
      expect(totalTime).toBeLessThan(200);
      
      const successfulTxs = results.filter(r => r.success).length;
      const avgTimePerTx = totalTime / concurrentTransactions;
      
      expect(successfulTxs).toBeGreaterThanOrEqual(95); // 95% success rate minimum
      expect(avgTimePerTx).toBeLessThan(5); // Under 5ms average per transaction
      
      // Check for any performance outliers
      const processingTimes = results
        .filter(r => r.success)
        .map(r => r.processingTime);
      
      const maxProcessingTime = Math.max(...processingTimes);
      expect(maxProcessingTime).toBeLessThan(50); // No single tx over 50ms
    });

    test('should maintain performance under memory pressure', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create memory pressure with many session keys
      const sessionKeys = [];
      for (let i = 0; i < 1000; i++) {
        const key = sessionKeyManager.generateSessionKey({
          playerPublicKey: `test_key_${i}`,
          duration: 3600,
          permissions: ['move', 'attack']
        });
        sessionKeys.push(key);
      }
      
      const memoryAfterKeys = process.memoryUsage().heapUsed;
      
      // Process transactions under memory pressure
      const transactions = sessionKeys.slice(0, 50).map((sessionKey, i) => ({
        sessionKey,
        transaction: {
          type: 'move',
          playerId: `stressed_player_${i}`,
          data: { x: i * 2, y: i * 3 },
          timestamp: Date.now() + i
        }
      }));
      
      const startTime = performance.now();
      
      const results = await Promise.all(
        transactions.map(({ sessionKey, transaction }) => 
          gaslessManager.executeGaslessTransaction({
            transaction,
            sessionKey,
            sponsorWallet: 'memory_test_sponsor'
          })
        )
      );
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      const finalMemory = process.memoryUsage().heapUsed;
      
      expect(processingTime).toBeLessThan(150); // Still under 150ms
      
      const successRate = results.filter(r => r.success).length / results.length;
      expect(successRate).toBeGreaterThanOrEqual(0.9); // 90% success under pressure
      
      // Memory usage should be reasonable
      const memoryGrowth = finalMemory - initialMemory;
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary network failures', async () => {
      // Simulate network failure
      gaslessManager.simulateNetworkFailure(true);
      
      const transaction = {
        type: 'move',
        playerId: 'network_test_player',
        data: { x: 50, y: 60 },
        timestamp: Date.now()
      };
      
      const sessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: 'test_network_key',
        duration: 3600,
        permissions: ['move']
      });
      
      // First attempt should fail
      const firstResult = await gaslessManager.executeGaslessTransaction({
        transaction,
        sessionKey,
        sponsorWallet: 'resilience_test_sponsor'
      });
      
      expect(firstResult.success).toBe(false);
      expect(firstResult.error).toContain('Network failure');
      
      // Restore network and retry
      gaslessManager.simulateNetworkFailure(false);
      
      const retryResult = await gaslessManager.executeGaslessTransaction({
        transaction,
        sessionKey,
        sponsorWallet: 'resilience_test_sponsor'
      });
      
      expect(retryResult.success).toBe(true);
      expect(retryResult.retryCount).toBeGreaterThan(0);
    });

    test('should handle sponsor wallet insufficient funds', async () => {
      const transaction = {
        type: 'expensive_operation',
        playerId: 'expensive_test_player',
        data: { complexity: 'high' },
        timestamp: Date.now()
      };
      
      const sessionKey = sessionKeyManager.generateSessionKey({
        playerPublicKey: 'test_expensive_key',
        duration: 3600,
        permissions: ['expensive_operation']
      });
      
      const result = await gaslessManager.executeGaslessTransaction({
        transaction,
        sessionKey,
        sponsorWallet: 'empty_sponsor_wallet' // Simulated empty wallet
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient sponsor funds');
      expect(result.suggestedAction).toBe('retry_with_different_sponsor');
      expect(result.alternativeSponsor).toBeDefined();
    });
  });
});