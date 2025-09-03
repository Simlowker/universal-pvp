/**
 * Session Key Management and Validation Tests
 * Comprehensive testing of session key lifecycle and security
 */

const { expect } = require('@jest/globals');
const { performance } = require('perf_hooks');
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');

// Mock MagicBlock session key components
const SessionKeyManager = require('../../../src/magicblock/session_key_manager');
const SessionKeyValidator = require('../../../src/magicblock/session_key_validator');
const SessionKeyStore = require('../../../src/magicblock/session_key_store');
const PermissionManager = require('../../../src/magicblock/permission_manager');

describe('Session Key Management System', () => {
  let sessionManager;
  let validator;
  let store;
  let permissionManager;
  let playerKeypair;
  
  beforeEach(() => {
    sessionManager = new SessionKeyManager({
      network: 'testnet',
      keyDerivationRounds: 1000,
      maxSessionDuration: 86400, // 24 hours
      cleanupInterval: 3600 // 1 hour
    });
    
    validator = new SessionKeyValidator();
    store = new SessionKeyStore({ storageType: 'memory' });
    permissionManager = new PermissionManager();
    
    // Generate a test player keypair
    playerKeypair = Keypair.generate();
  });

  afterEach(async () => {
    await sessionManager.cleanup();
    await store.cleanup();
  });

  describe('Session Key Generation', () => {
    test('should generate cryptographically secure session keys within 10ms', () => {
      const startTime = performance.now();
      
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600, // 1 hour
        permissions: ['move', 'attack', 'use_item', 'chat'],
        metadata: {
          gameMode: 'battle_royale',
          region: 'us-west',
          clientVersion: '1.2.3'
        }
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10); // Target under 10ms
      
      // Validate session key structure
      expect(sessionKey).toHaveProperty('publicKey');
      expect(sessionKey).toHaveProperty('privateKey');
      expect(sessionKey).toHaveProperty('sessionId');
      expect(sessionKey).toHaveProperty('playerPublicKey');
      expect(sessionKey).toHaveProperty('createdAt');
      expect(sessionKey).toHaveProperty('expiresAt');
      expect(sessionKey).toHaveProperty('permissions');
      expect(sessionKey).toHaveProperty('metadata');
      
      // Verify key format and length
      expect(sessionKey.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
      expect(sessionKey.privateKey.length).toBe(64); // 32 bytes hex
      expect(sessionKey.sessionId).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      
      // Verify expiration is set correctly
      const expectedExpiry = sessionKey.createdAt + 3600000; // 1 hour in ms
      expect(sessionKey.expiresAt).toBe(expectedExpiry);
      
      // Verify permissions are preserved
      expect(sessionKey.permissions).toEqual(['move', 'attack', 'use_item', 'chat']);
    });

    test('should generate unique session keys for concurrent requests', async () => {
      const concurrentRequests = 50;
      const promises = [];
      
      const startTime = performance.now();
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          Promise.resolve().then(() => sessionManager.generateSessionKey({
            playerPublicKey: playerKeypair.publicKey.toBase58(),
            duration: 1800,
            permissions: ['move', 'attack'],
            metadata: { requestId: i }
          }))
        );
      }
      
      const sessionKeys = await Promise.all(promises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(100); // All generations under 100ms
      
      // Verify all keys are unique
      const sessionIds = sessionKeys.map(key => key.sessionId);
      const uniqueIds = new Set(sessionIds);
      expect(uniqueIds.size).toBe(concurrentRequests);
      
      // Verify all public keys are unique
      const publicKeys = sessionKeys.map(key => key.publicKey);
      const uniquePublicKeys = new Set(publicKeys);
      expect(uniquePublicKeys.size).toBe(concurrentRequests);
    });

    test('should enforce maximum session duration limits', () => {
      const maxDuration = 86400; // 24 hours
      
      // Test valid duration
      const validSession = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: maxDuration,
        permissions: ['move']
      });
      
      expect(validSession.expiresAt - validSession.createdAt).toBe(maxDuration * 1000);
      
      // Test excessive duration (should be clamped)
      const longSession = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: maxDuration * 2, // 48 hours
        permissions: ['move']
      });
      
      expect(longSession.expiresAt - longSession.createdAt).toBe(maxDuration * 1000);
    });

    test('should handle key derivation parameter variations', () => {
      const rounds = [100, 1000, 5000, 10000];
      const times = [];
      
      rounds.forEach(roundCount => {
        sessionManager.setKeyDerivationRounds(roundCount);
        
        const startTime = performance.now();
        
        const sessionKey = sessionManager.generateSessionKey({
          playerPublicKey: playerKeypair.publicKey.toBase58(),
          duration: 3600,
          permissions: ['move']
        });
        
        const endTime = performance.now();
        times.push(endTime - startTime);
        
        expect(sessionKey).toBeDefined();
        expect(sessionKey.publicKey).toBeDefined();
      });
      
      // Higher rounds should take more time but still be reasonable
      expect(times[0]).toBeLessThan(times[3]); // 100 < 10000 rounds
      expect(times[3]).toBeLessThan(50); // Even 10k rounds under 50ms
    });
  });

  describe('Session Key Validation', () => {
    test('should validate session key signatures within 2ms', () => {
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move', 'attack']
      });
      
      const transaction = {
        type: 'move',
        playerId: 'player_123',
        data: { x: 100, y: 200 },
        timestamp: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex')
      };
      
      // Sign transaction
      const signature = sessionManager.signTransaction(sessionKey, transaction);
      
      const startTime = performance.now();
      
      // Validate signature
      const isValid = validator.validateSignature(
        sessionKey.publicKey,
        transaction,
        signature
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(2); // Target under 2ms
      expect(isValid).toBe(true);
      
      // Test with invalid signature
      const invalidSignature = signature.slice(0, -10) + '0'.repeat(10);
      
      const invalidStartTime = performance.now();
      const isInvalid = validator.validateSignature(
        sessionKey.publicKey,
        transaction,
        invalidSignature
      );
      const invalidEndTime = performance.now();
      
      expect(invalidEndTime - invalidStartTime).toBeLessThan(2);
      expect(isInvalid).toBe(false);
    });

    test('should detect and reject expired session keys', () => {
      // Create an already expired session key
      const expiredSessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: -3600, // Expired 1 hour ago
        permissions: ['move']
      });
      
      const transaction = {
        type: 'move',
        playerId: 'player_123',
        data: { x: 50, y: 75 },
        timestamp: Date.now()
      };
      
      const startTime = performance.now();
      
      const validationResult = validator.validateSessionKey(expiredSessionKey);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1); // Should be very fast
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.error).toBe('SESSION_EXPIRED');
      expect(validationResult.expirationTime).toBeLessThan(Date.now());
    });

    test('should validate permission-based access control', () => {
      const restrictedSessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move', 'chat'] // No attack permission
      });
      
      const transactions = [
        { type: 'move', data: { x: 10, y: 20 }, allowed: true },
        { type: 'chat', data: { message: 'hello' }, allowed: true },
        { type: 'attack', data: { target: 'enemy' }, allowed: false },
        { type: 'use_item', data: { item: 'potion' }, allowed: false }
      ];
      
      transactions.forEach(tx => {
        const startTime = performance.now();
        
        const hasPermission = permissionManager.hasPermission(
          restrictedSessionKey.permissions,
          tx.type
        );
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(1); // Permission check should be instant
        expect(hasPermission).toBe(tx.allowed);
      });
    });

    test('should handle malformed session key data', () => {
      const malformedKeys = [
        null,
        undefined,
        {},
        { publicKey: null },
        { publicKey: 'invalid_key_format' },
        { publicKey: 'valid_key', expiresAt: 'not_a_number' },
        { publicKey: 'valid_key', permissions: 'not_an_array' }
      ];
      
      malformedKeys.forEach((malformedKey, index) => {
        const startTime = performance.now();
        
        const validationResult = validator.validateSessionKey(malformedKey);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(duration).toBeLessThan(1); // Should fail fast
        expect(validationResult.isValid).toBe(false);
        expect(validationResult.error).toBeDefined();
      });
    });
  });

  describe('Session Key Storage and Retrieval', () => {
    test('should store and retrieve session keys efficiently', async () => {
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move', 'attack', 'use_item']
      });
      
      const storeStartTime = performance.now();
      
      // Store session key
      await store.storeSessionKey(sessionKey.sessionId, sessionKey);
      
      const storeEndTime = performance.now();
      const storeTime = storeEndTime - storeStartTime;
      
      expect(storeTime).toBeLessThan(5); // Store under 5ms
      
      const retrieveStartTime = performance.now();
      
      // Retrieve session key
      const retrievedKey = await store.getSessionKey(sessionKey.sessionId);
      
      const retrieveEndTime = performance.now();
      const retrieveTime = retrieveEndTime - retrieveStartTime;
      
      expect(retrieveTime).toBeLessThan(2); // Retrieve under 2ms
      expect(retrievedKey).toEqual(sessionKey);
    });

    test('should handle concurrent storage operations', async () => {
      const concurrentSessions = 20;
      const sessionKeys = [];
      
      // Generate session keys
      for (let i = 0; i < concurrentSessions; i++) {
        sessionKeys.push(sessionManager.generateSessionKey({
          playerPublicKey: playerKeypair.publicKey.toBase58(),
          duration: 3600,
          permissions: ['move'],
          metadata: { index: i }
        }));
      }
      
      const startTime = performance.now();
      
      // Store all keys concurrently
      await Promise.all(
        sessionKeys.map(key => 
          store.storeSessionKey(key.sessionId, key)
        )
      );
      
      // Retrieve all keys concurrently
      const retrievedKeys = await Promise.all(
        sessionKeys.map(key => 
          store.getSessionKey(key.sessionId)
        )
      );
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(50); // All operations under 50ms
      expect(retrievedKeys.length).toBe(concurrentSessions);
      
      // Verify all keys were stored and retrieved correctly
      retrievedKeys.forEach((retrievedKey, index) => {
        expect(retrievedKey).toEqual(sessionKeys[index]);
      });
    });

    test('should automatically clean up expired session keys', async () => {
      // Create mix of expired and valid session keys
      const expiredKey1 = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: -3600, // Expired
        permissions: ['move']
      });
      
      const expiredKey2 = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: -1800, // Expired
        permissions: ['attack']
      });
      
      const validKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600, // Valid
        permissions: ['move', 'attack']
      });
      
      // Store all keys
      await store.storeSessionKey(expiredKey1.sessionId, expiredKey1);
      await store.storeSessionKey(expiredKey2.sessionId, expiredKey2);
      await store.storeSessionKey(validKey.sessionId, validKey);
      
      const cleanupStartTime = performance.now();
      
      // Run cleanup
      const cleanupResult = await store.cleanupExpiredKeys();
      
      const cleanupEndTime = performance.now();
      const cleanupTime = cleanupEndTime - cleanupStartTime;
      
      expect(cleanupTime).toBeLessThan(10); // Cleanup under 10ms
      expect(cleanupResult.removedCount).toBe(2);
      expect(cleanupResult.remainingCount).toBe(1);
      
      // Verify expired keys are gone
      const expiredResult1 = await store.getSessionKey(expiredKey1.sessionId);
      const expiredResult2 = await store.getSessionKey(expiredKey2.sessionId);
      const validResult = await store.getSessionKey(validKey.sessionId);
      
      expect(expiredResult1).toBeNull();
      expect(expiredResult2).toBeNull();
      expect(validResult).toEqual(validKey);
    });
  });

  describe('Advanced Security Features', () => {
    test('should detect and prevent replay attacks', () => {
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move', 'attack']
      });
      
      const transaction = {
        type: 'attack',
        playerId: 'player_123',
        data: { target: 'enemy_456', damage: 25 },
        timestamp: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex')
      };
      
      // Sign and execute transaction once
      const signature = sessionManager.signTransaction(sessionKey, transaction);
      
      const firstResult = validator.validateAndExecute(
        sessionKey,
        transaction,
        signature
      );
      
      expect(firstResult.success).toBe(true);
      expect(firstResult.transactionId).toBeDefined();
      
      // Attempt replay attack with same transaction
      const replayResult = validator.validateAndExecute(
        sessionKey,
        transaction, // Same transaction
        signature   // Same signature
      );
      
      expect(replayResult.success).toBe(false);
      expect(replayResult.error).toBe('REPLAY_ATTACK_DETECTED');
      expect(replayResult.originalTransactionId).toBe(firstResult.transactionId);
    });

    test('should implement rate limiting per session key', async () => {
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move'],
        rateLimit: { maxRequests: 5, windowMs: 1000 } // 5 requests per second
      });
      
      const transactions = [];
      
      // Generate rapid transactions
      for (let i = 0; i < 10; i++) {
        transactions.push({
          type: 'move',
          playerId: 'rate_test_player',
          data: { x: i * 10, y: i * 5 },
          timestamp: Date.now() + i,
          nonce: crypto.randomBytes(8).toString('hex')
        });
      }
      
      const startTime = performance.now();
      const results = [];
      
      // Submit all transactions rapidly
      for (const tx of transactions) {
        const signature = sessionManager.signTransaction(sessionKey, tx);
        const result = await validator.validateAndExecute(sessionKey, tx, signature);
        results.push(result);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(100); // Should process quickly
      
      const successfulResults = results.filter(r => r.success);
      const rateLimitedResults = results.filter(r => r.error === 'RATE_LIMIT_EXCEEDED');
      
      expect(successfulResults.length).toBe(5); // First 5 allowed
      expect(rateLimitedResults.length).toBe(5); // Last 5 rate limited
    });

    test('should validate session key binding to player wallet', () => {
      const playerKeypair1 = Keypair.generate();
      const playerKeypair2 = Keypair.generate();
      
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair1.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move', 'attack']
      });
      
      const transaction = {
        type: 'move',
        playerId: 'binding_test_player',
        data: { x: 100, y: 200 },
        timestamp: Date.now(),
        nonce: crypto.randomBytes(8).toString('hex')
      };
      
      // Sign transaction with correct player key
      const validSignature = sessionManager.signTransaction(sessionKey, transaction);
      
      const validResult = validator.validateSessionBinding(
        sessionKey,
        playerKeypair1.publicKey.toBase58(),
        transaction,
        validSignature
      );
      
      expect(validResult.isValid).toBe(true);
      expect(validResult.playerMatch).toBe(true);
      
      // Attempt to use session key with wrong player key
      const invalidResult = validator.validateSessionBinding(
        sessionKey,
        playerKeypair2.publicKey.toBase58(), // Wrong player
        transaction,
        validSignature
      );
      
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.error).toBe('PLAYER_KEY_MISMATCH');
    });

    test('should handle session key revocation immediately', async () => {
      const sessionKey = sessionManager.generateSessionKey({
        playerPublicKey: playerKeypair.publicKey.toBase58(),
        duration: 3600,
        permissions: ['move', 'attack', 'use_item']
      });
      
      // Store session key
      await store.storeSessionKey(sessionKey.sessionId, sessionKey);
      
      // Verify key is valid
      const initialValidation = await validator.validateSessionKey(sessionKey);
      expect(initialValidation.isValid).toBe(true);
      
      const revokeStartTime = performance.now();
      
      // Revoke session key
      const revocationResult = await sessionManager.revokeSessionKey(
        sessionKey.sessionId,
        'PLAYER_REQUEST' // Revocation reason
      );
      
      const revokeEndTime = performance.now();
      const revokeTime = revokeEndTime - revokeStartTime;
      
      expect(revokeTime).toBeLessThan(5); // Revocation under 5ms
      expect(revocationResult.success).toBe(true);
      expect(revocationResult.revokedAt).toBeDefined();
      
      // Verify key is now invalid
      const postRevocationValidation = await validator.validateSessionKey(sessionKey);
      expect(postRevocationValidation.isValid).toBe(false);
      expect(postRevocationValidation.error).toBe('SESSION_REVOKED');
      
      // Attempt to use revoked key should fail
      const transaction = {
        type: 'move',
        data: { x: 10, y: 20 },
        timestamp: Date.now()
      };
      
      expect(() => {
        sessionManager.signTransaction(sessionKey, transaction);
      }).toThrow('Session key has been revoked');
    });
  });

  describe('Performance Under Load', () => {
    test('should maintain performance with large number of active session keys', async () => {
      const numSessions = 1000;
      const sessionKeys = [];
      
      // Generate many session keys
      const generationStartTime = performance.now();
      
      for (let i = 0; i < numSessions; i++) {
        const key = sessionManager.generateSessionKey({
          playerPublicKey: `player_key_${i}`,
          duration: 3600,
          permissions: ['move', 'attack'],
          metadata: { playerId: i }
        });
        sessionKeys.push(key);
      }
      
      const generationEndTime = performance.now();
      const generationTime = generationEndTime - generationStartTime;
      
      expect(generationTime).toBeLessThan(500); // 1000 keys under 500ms
      expect(generationTime / numSessions).toBeLessThan(1); // Under 1ms per key
      
      // Store all session keys
      const storageStartTime = performance.now();
      
      await Promise.all(
        sessionKeys.map(key => store.storeSessionKey(key.sessionId, key))
      );
      
      const storageEndTime = performance.now();
      const storageTime = storageEndTime - storageStartTime;
      
      expect(storageTime).toBeLessThan(200); // Storage under 200ms
      
      // Test random access performance
      const randomAccessStartTime = performance.now();
      const randomKeys = [];
      
      for (let i = 0; i < 100; i++) {
        const randomIndex = Math.floor(Math.random() * numSessions);
        const randomSessionId = sessionKeys[randomIndex].sessionId;
        const retrievedKey = await store.getSessionKey(randomSessionId);
        randomKeys.push(retrievedKey);
      }
      
      const randomAccessEndTime = performance.now();
      const randomAccessTime = randomAccessEndTime - randomAccessStartTime;
      
      expect(randomAccessTime).toBeLessThan(50); // 100 random accesses under 50ms
      expect(randomKeys.length).toBe(100);
      
      // Verify all retrieved keys are valid
      randomKeys.forEach(key => {
        expect(key).toBeDefined();
        expect(key.sessionId).toBeDefined();
        expect(key.publicKey).toBeDefined();
      });
    });
  });
});