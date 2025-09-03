/**
 * Ephemeral Rollup 30ms Latency Verification Tests
 * Ensures all ER operations meet strict latency requirements
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  // Note: These types are not exported from the SDK
  // Using placeholder types for testing
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { useSessionKeyManager } from '@magicblock-labs/gum-react-sdk';

describe('Ephemeral Rollup 30ms Latency Tests', () => {
  let connection: Connection;
  let erSDK: EphemeralRollupSDK;
  let stateManager: StateManager;
  let transactionBatcher: TransactionBatcher;
  let latencyMonitor: LatencyMonitor;
  let sessionKeyManager: SessionKeyManager;
  let testKeypair: Keypair;

  beforeEach(async () => {
    // Initialize test environment
    connection = new Connection('http://localhost:8899', 'confirmed');
    testKeypair = Keypair.generate();

    // Initialize ER SDK with aggressive performance settings
    erSDK = new EphemeralRollupSDK({
      connection,
      commitment: 'confirmed',
      maxRetries: 1, // Minimize retry delays
      retryDelay: 5, // 5ms retry delay
      batchSize: 25, // Smaller batches for lower latency
      flushInterval: 10, // 10ms flush interval
      compressionEnabled: true,
      priorityFees: true, // Use priority fees for faster inclusion
    });

    stateManager = new StateManager({
      sdk: erSDK,
      cacheSize: 1000,
      cacheTTL: 30000, // 30s cache
      enableDeltaUpdates: true,
      compressionLevel: 6, // Balance between speed and size
    });

    transactionBatcher = new TransactionBatcher({
      sdk: erSDK,
      maxBatchSize: 50,
      maxBatchTime: 15, // 15ms max batch time
      prioritizeLatency: true,
    });

    latencyMonitor = new LatencyMonitor({
      targets: {
        stateUpdate: 20, // 20ms target
        transactionProcessing: 15, // 15ms target
        stateSync: 25, // 25ms target
        endToEnd: 30, // 30ms end-to-end target
      },
      alertThresholds: {
        warning: 25, // 25ms warning
        critical: 35, // 35ms critical
      },
    });

    sessionKeyManager = new SessionKeyManager({
      connection,
      masterKeypair: testKeypair,
      sessionDuration: 3600, // 1 hour sessions
      autoRefresh: true,
    });

    await erSDK.initialize();
    await stateManager.initialize();
    await sessionKeyManager.initialize();
    await latencyMonitor.start();
  });

  afterEach(async () => {
    await latencyMonitor.stop();
    await sessionKeyManager.cleanup();
    await stateManager.cleanup();
    await erSDK.shutdown();
  });

  describe('Single Transaction Latency', () => {
    test('should process player move transaction under 30ms', async () => {
      const sessionKey = await sessionKeyManager.createSessionKey({
        permissions: ['move', 'attack'],
        duration: 3600,
      });

      const moveTransaction = {
        type: 'player_move',
        player: testKeypair.publicKey,
        sessionKey: sessionKey.publicKey,
        data: {
          fromPosition: { x: 100, y: 150 },
          toPosition: { x: 120, y: 175 },
          speed: 5.0,
          direction: 45, // degrees
        },
        timestamp: Date.now(),
        nonce: 1,
      };

      const startTime = performance.now();
      
      const result = await erSDK.processTransaction(moveTransaction);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(30);
      expect(latency).toBeLessThan(20); // Target under 20ms
      expect(result.success).toBe(true);
      expect(result.finalPosition).toEqual({ x: 120, y: 175 });
      expect(result.transactionHash).toBeDefined();
      expect(result.blockHeight).toBeDefined();

      // Verify latency was recorded
      const metrics = await latencyMonitor.getMetrics();
      expect(metrics.transactionProcessing.latest).toBeLessThan(30);
    });

    test('should process combat action under 30ms', async () => {
      const sessionKey = await sessionKeyManager.createSessionKey({
        permissions: ['attack', 'use_ability'],
        duration: 3600,
      });

      const attackTransaction = {
        type: 'combat_action',
        player: testKeypair.publicKey,
        sessionKey: sessionKey.publicKey,
        data: {
          actionType: 'melee_attack',
          target: Keypair.generate().publicKey,
          damage: 35,
          position: { x: 200, y: 250 },
          weaponId: 'sword_001',
          criticalHit: false,
        },
        timestamp: Date.now(),
        nonce: 2,
      };

      const startTime = performance.now();
      
      const result = await erSDK.processTransaction(attackTransaction);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(30);
      expect(latency).toBeLessThan(18); // Combat should be very fast
      expect(result.success).toBe(true);
      expect(result.damageDealt).toBe(35);
      expect(result.targetHit).toBe(true);
      expect(result.blockHeight).toBeDefined();
    });

    test('should handle gasless transaction under 30ms', async () => {
      const sessionKey = await sessionKeyManager.createSessionKey({
        permissions: ['move', 'use_item'],
        duration: 3600,
        gasless: true, // Enable gasless transactions
      });

      const gaslessTransaction = {
        type: 'use_item',
        player: testKeypair.publicKey,
        sessionKey: sessionKey.publicKey,
        data: {
          itemId: 'health_potion',
          quantity: 1,
          targetSelf: true,
          healAmount: 50,
        },
        timestamp: Date.now(),
        nonce: 3,
        gasless: true,
      };

      const startTime = performance.now();
      
      const result = await erSDK.processGaslessTransaction(gaslessTransaction);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(30);
      expect(latency).toBeLessThan(25); // Gasless should be fast
      expect(result.success).toBe(true);
      expect(result.gasless).toBe(true);
      expect(result.feePaid).toBe(0);
      expect(result.healingApplied).toBe(50);
    });

    test('should process state query under 10ms', async () => {
      // Setup initial state
      await stateManager.setState('player_123', {
        position: { x: 300, y: 400 },
        health: 100,
        energy: 75,
        inventory: ['sword', 'shield', 'potion'],
        level: 15,
      });

      const startTime = performance.now();
      
      const playerState = await stateManager.getState('player_123');
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(10); // State queries very fast
      expect(latency).toBeLessThan(5); // Target under 5ms
      expect(playerState).toBeDefined();
      expect(playerState.position).toEqual({ x: 300, y: 400 });
      expect(playerState.health).toBe(100);
      expect(playerState.inventory).toHaveLength(3);
    });
  });

  describe('Batch Transaction Processing', () => {
    test('should process batch of 20 transactions under 30ms', async () => {
      const sessionKey = await sessionKeyManager.createSessionKey({
        permissions: ['move', 'attack', 'use_item'],
        duration: 3600,
      });

      const transactions = [];
      for (let i = 0; i < 20; i++) {
        transactions.push({
          type: i % 3 === 0 ? 'player_move' : i % 3 === 1 ? 'combat_action' : 'use_item',
          player: testKeypair.publicKey,
          sessionKey: sessionKey.publicKey,
          data: {
            ...(i % 3 === 0 && {
              fromPosition: { x: i * 10, y: i * 15 },
              toPosition: { x: i * 10 + 25, y: i * 15 + 30 },
            }),
            ...(i % 3 === 1 && {
              actionType: 'ranged_attack',
              damage: 20 + i,
              target: Keypair.generate().publicKey,
            }),
            ...(i % 3 === 2 && {
              itemId: `item_${i}`,
              quantity: 1,
            }),
          },
          timestamp: Date.now() + i,
          nonce: 100 + i,
        });
      }

      const startTime = performance.now();
      
      const results = await transactionBatcher.processBatch(transactions);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(30); // Entire batch under 30ms
      expect(results.length).toBe(20);
      expect(results.every(r => r.success)).toBe(true);
      
      const avgLatencyPerTx = latency / 20;
      expect(avgLatencyPerTx).toBeLessThan(2); // Each tx under 2ms average
    });

    test('should handle mixed priority transactions efficiently', async () => {
      const sessionKey = await sessionKeyManager.createSessionKey({
        permissions: ['move', 'attack', 'use_ability'],
        duration: 3600,
      });

      // Create transactions with different priorities
      const highPriorityTx = {
        type: 'combat_action',
        player: testKeypair.publicKey,
        sessionKey: sessionKey.publicKey,
        priority: 'high',
        data: { actionType: 'ultimate_ability', damage: 100 },
        timestamp: Date.now(),
        nonce: 200,
      };

      const mediumPriorityTxs = Array(10).fill(null).map((_, i) => ({
        type: 'player_move',
        player: testKeypair.publicKey,
        sessionKey: sessionKey.publicKey,
        priority: 'medium',
        data: { fromPosition: { x: i * 5, y: i * 8 }, toPosition: { x: i * 5 + 10, y: i * 8 + 15 } },
        timestamp: Date.now() + i,
        nonce: 201 + i,
      }));

      const lowPriorityTxs = Array(5).fill(null).map((_, i) => ({
        type: 'use_item',
        player: testKeypair.publicKey,
        sessionKey: sessionKey.publicKey,
        priority: 'low',
        data: { itemId: `consumable_${i}`, quantity: 1 },
        timestamp: Date.now() + 10 + i,
        nonce: 211 + i,
      }));

      const allTransactions = [highPriorityTx, ...mediumPriorityTxs, ...lowPriorityTxs];

      const startTime = performance.now();
      
      const results = await transactionBatcher.processPriorityBatch(allTransactions);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(35); // Mixed priority batch under 35ms
      expect(results.length).toBe(16); // 1 high + 10 medium + 5 low
      expect(results.every(r => r.success)).toBe(true);

      // High priority transaction should be processed first
      expect(results[0].originalIndex).toBe(0); // High priority tx
      expect(results[0].priority).toBe('high');
    });
  });

  describe('State Synchronization Latency', () => {
    test('should sync state updates under 25ms', async () => {
      const gameState = {
        players: {},
        entities: {},
        worldState: {
          time: Date.now(),
          weather: 'sunny',
          events: [],
        },
      };

      // Add 30 players with realistic game state
      for (let i = 0; i < 30; i++) {
        gameState.players[`player_${i}`] = {
          id: `player_${i}`,
          position: { x: i * 50, y: i * 30 },
          health: 100 - (i % 20),
          energy: 50 + (i % 30),
          level: Math.floor(i / 3) + 1,
          equipment: {
            weapon: `weapon_${i % 5}`,
            armor: `armor_${i % 3}`,
            accessory: `acc_${i % 2}`,
          },
          status: i % 4 === 0 ? 'idle' : i % 4 === 1 ? 'moving' : i % 4 === 2 ? 'combat' : 'casting',
          buffs: [`buff_${i % 6}`],
          lastAction: Date.now() - (i * 100),
        };
      }

      // Add 50 entities
      for (let i = 0; i < 50; i++) {
        gameState.entities[`entity_${i}`] = {
          id: `entity_${i}`,
          type: i % 5 === 0 ? 'npc' : i % 5 === 1 ? 'item' : i % 5 === 2 ? 'obstacle' : 'effect',
          position: { x: i * 20, y: i * 25 },
          state: i % 2 === 0 ? 'active' : 'inactive',
          data: { value: i * 10, metadata: `meta_${i}` },
        };
      }

      const startTime = performance.now();
      
      const syncResult = await stateManager.syncState(gameState);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(25); // Target under 25ms
      expect(latency).toBeLessThan(20); // Stretch goal under 20ms
      expect(syncResult.success).toBe(true);
      expect(syncResult.playersSync).toBe(30);
      expect(syncResult.entitiesSync).toBe(50);
      expect(syncResult.compressionRatio).toBeGreaterThan(0.4); // Good compression
      expect(syncResult.blockHeight).toBeDefined();
    });

    test('should handle delta state updates efficiently', async () => {
      // Establish baseline state
      const baselineState = {
        players: {
          player_delta_1: { position: { x: 0, y: 0 }, health: 100 },
          player_delta_2: { position: { x: 50, y: 50 }, health: 90 },
          player_delta_3: { position: { x: 100, y: 100 }, health: 80 },
        },
        timestamp: Date.now(),
      };

      await stateManager.syncState(baselineState);

      // Create delta updates
      const deltaUpdates = {
        players: {
          player_delta_1: { position: { x: 25, y: 15 } }, // Only position changed
          player_delta_2: { health: 75 }, // Only health changed
          player_delta_3: { position: { x: 125, y: 130 }, health: 70 }, // Both changed
        },
        newPlayers: {
          player_delta_4: { position: { x: 200, y: 200 }, health: 100 },
        },
        timestamp: Date.now(),
        deltaFrom: baselineState.timestamp,
      };

      const startTime = performance.now();
      
      const deltaResult = await stateManager.syncDeltaState(deltaUpdates);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(15); // Delta updates very fast
      expect(latency).toBeLessThan(12); // Target under 12ms
      expect(deltaResult.success).toBe(true);
      expect(deltaResult.updatesApplied).toBe(4); // 3 updated + 1 new
      expect(deltaResult.bytesSaved).toBeGreaterThan(0); // Should save bandwidth
    });

    test('should maintain sync performance under concurrent load', async () => {
      const concurrentSyncs = 15;
      const syncPromises = [];

      for (let i = 0; i < concurrentSyncs; i++) {
        const concurrentState = {
          sessionId: `concurrent_session_${i}`,
          players: {
            [`concurrent_player_${i}`]: {
              id: `concurrent_player_${i}`,
              position: { x: i * 30, y: i * 40 },
              health: 100 - (i % 10),
              timestamp: Date.now() + i,
            },
          },
          entities: {
            [`concurrent_entity_${i}`]: {
              id: `concurrent_entity_${i}`,
              type: 'dynamic',
              position: { x: i * 15, y: i * 20 },
            },
          },
        };

        syncPromises.push(stateManager.syncState(concurrentState));
      }

      const startTime = performance.now();
      
      const results = await Promise.all(syncPromises);
      
      const endTime = performance.now();
      const latency = endTime - startTime;

      expect(latency).toBeLessThan(40); // All concurrent syncs under 40ms
      expect(results.length).toBe(concurrentSyncs);
      expect(results.every(r => r.success)).toBe(true);

      const avgLatencyPerSync = latency / concurrentSyncs;
      expect(avgLatencyPerSync).toBeLessThan(4); // Each sync under 4ms average
    });
  });

  describe('End-to-End Latency Verification', () => {
    test('should complete full PvP action cycle under 30ms', async () => {
      // Setup two players
      const player1Key = await sessionKeyManager.createSessionKey({
        permissions: ['move', 'attack', 'use_ability'],
        duration: 3600,
      });

      const player2Key = await sessionKeyManager.createSessionKey({
        permissions: ['move', 'defend', 'counter_attack'],
        duration: 3600,
      });

      // Initial state setup
      const initialState = {
        players: {
          player_1: {
            position: { x: 100, y: 100 },
            health: 100,
            energy: 100,
            inCombat: false,
          },
          player_2: {
            position: { x: 150, y: 120 },
            health: 100,
            energy: 100,
            inCombat: false,
          },
        },
      };

      await stateManager.syncState(initialState);

      const startTime = performance.now();

      // Step 1: Player 1 moves into range
      const moveResult = await erSDK.processTransaction({
        type: 'player_move',
        player: testKeypair.publicKey,
        sessionKey: player1Key.publicKey,
        data: {
          fromPosition: { x: 100, y: 100 },
          toPosition: { x: 140, y: 110 },
        },
        timestamp: Date.now(),
        nonce: 300,
      });

      expect(moveResult.success).toBe(true);

      // Step 2: Player 1 attacks Player 2
      const attackResult = await erSDK.processTransaction({
        type: 'combat_action',
        player: testKeypair.publicKey,
        sessionKey: player1Key.publicKey,
        data: {
          actionType: 'melee_attack',
          target: player2Key.publicKey,
          damage: 30,
          position: { x: 140, y: 110 },
        },
        timestamp: Date.now() + 5,
        nonce: 301,
      });

      expect(attackResult.success).toBe(true);

      // Step 3: Update game state with combat results
      const updatedState = {
        players: {
          player_1: {
            position: attackResult.attackerPosition,
            health: initialState.players.player_1.health,
            energy: initialState.players.player_1.energy - 10, // Attack cost
            inCombat: true,
            lastAction: 'attack',
          },
          player_2: {
            position: initialState.players.player_2.position,
            health: initialState.players.player_2.health - attackResult.damageDealt,
            energy: initialState.players.player_2.energy,
            inCombat: true,
            lastDamage: attackResult.damageDealt,
          },
        },
        combatLog: [{
          attacker: 'player_1',
          defender: 'player_2',
          action: 'melee_attack',
          damage: attackResult.damageDealt,
          timestamp: Date.now(),
        }],
      };

      // Step 4: Sync final state
      const finalSync = await stateManager.syncState(updatedState);

      const endTime = performance.now();
      const totalLatency = endTime - startTime;

      expect(totalLatency).toBeLessThan(30); // Complete PvP cycle under 30ms
      expect(totalLatency).toBeLessThan(28); // Target under 28ms
      expect(finalSync.success).toBe(true);
      expect(attackResult.damageDealt).toBe(30);
      expect(updatedState.players.player_2.health).toBe(70);
    });

    test('should handle complex multi-player interactions under 35ms', async () => {
      const playerCount = 8;
      const players = [];

      // Create session keys for all players
      for (let i = 0; i < playerCount; i++) {
        const sessionKey = await sessionKeyManager.createSessionKey({
          permissions: ['move', 'attack', 'use_ability', 'use_item'],
          duration: 3600,
        });
        players.push({
          id: `multi_player_${i}`,
          sessionKey,
          position: { x: i * 75, y: i * 50 },
        });
      }

      const startTime = performance.now();

      // Simultaneous actions from multiple players
      const simultaneousActions = players.map((player, index) => {
        const actionType = index % 4;
        return erSDK.processTransaction({
          type: actionType === 0 ? 'player_move' : 
                actionType === 1 ? 'combat_action' :
                actionType === 2 ? 'use_ability' : 'use_item',
          player: testKeypair.publicKey,
          sessionKey: player.sessionKey.publicKey,
          data: {
            ...(actionType === 0 && {
              fromPosition: player.position,
              toPosition: { x: player.position.x + 20, y: player.position.y + 15 },
            }),
            ...(actionType === 1 && {
              actionType: 'area_attack',
              damage: 25,
              radius: 50,
              centerPosition: player.position,
            }),
            ...(actionType === 2 && {
              abilityId: 'heal_burst',
              radius: 30,
              healAmount: 40,
            }),
            ...(actionType === 3 && {
              itemId: 'mana_potion',
              quantity: 1,
            }),
          },
          timestamp: Date.now() + index,
          nonce: 400 + index,
        });
      });

      // Process all actions concurrently
      const actionResults = await Promise.all(simultaneousActions);

      // Sync final state with all results
      const finalState = {
        players: players.reduce((acc, player, index) => {
          acc[player.id] = {
            position: actionResults[index].finalPosition || player.position,
            health: 100 - (actionResults[index].damageTaken || 0) + (actionResults[index].healingReceived || 0),
            energy: 100 - (actionResults[index].energyCost || 0) + (actionResults[index].energyGain || 0),
            lastAction: actionResults[index].actionType,
          };
          return acc;
        }, {}),
        interactions: actionResults.map((result, index) => ({
          player: players[index].id,
          action: result.actionType,
          success: result.success,
          timestamp: Date.now(),
        })),
      };

      const syncResult = await stateManager.syncState(finalState);

      const endTime = performance.now();
      const totalLatency = endTime - startTime;

      expect(totalLatency).toBeLessThan(35); // Multi-player interaction under 35ms
      expect(actionResults.length).toBe(playerCount);
      expect(actionResults.every(r => r.success)).toBe(true);
      expect(syncResult.success).toBe(true);

      const avgLatencyPerPlayer = totalLatency / playerCount;
      expect(avgLatencyPerPlayer).toBeLessThan(6); // Each player action under 6ms average
    });
  });

  describe('Latency Monitoring and Alerting', () => {
    test('should accurately track and report latency metrics', async () => {
      // Perform various operations to generate metrics
      const operations = [
        () => erSDK.processTransaction({
          type: 'test_operation',
          player: testKeypair.publicKey,
          data: { test: 'data' },
          timestamp: Date.now(),
          nonce: 500,
        }),
        () => stateManager.setState('test_key', { test: 'value' }),
        () => stateManager.getState('test_key'),
        () => transactionBatcher.processBatch([{
          type: 'batch_test',
          player: testKeypair.publicKey,
          data: { batch: true },
          timestamp: Date.now(),
          nonce: 501,
        }]),
      ];

      // Execute operations
      for (const operation of operations) {
        await operation();
      }

      // Allow metrics collection
      await new Promise(resolve => setTimeout(resolve, 50));

      const metrics = await latencyMonitor.getComprehensiveMetrics();

      expect(metrics.transactionProcessing).toBeDefined();
      expect(metrics.stateUpdate).toBeDefined();
      expect(metrics.stateQuery).toBeDefined();
      expect(metrics.batchProcessing).toBeDefined();

      // All metrics should be under targets
      expect(metrics.transactionProcessing.average).toBeLessThan(15);
      expect(metrics.stateUpdate.average).toBeLessThan(20);
      expect(metrics.stateQuery.average).toBeLessThan(5);
      expect(metrics.batchProcessing.average).toBeLessThan(30);

      // Percentile checks
      expect(metrics.transactionProcessing.p95).toBeLessThan(25);
      expect(metrics.stateUpdate.p95).toBeLessThan(35);
      expect(metrics.stateQuery.p95).toBeLessThan(8);
    });

    test('should trigger alerts for latency violations', async () => {
      const alerts = [];
      
      latencyMonitor.onAlert((alert) => {
        alerts.push(alert);
      });

      // Simulate slow operation by adding artificial delay
      const slowOperationPromise = new Promise(async (resolve) => {
        const start = performance.now();
        
        // Add delay to exceed threshold
        await new Promise(delayResolve => setTimeout(delayResolve, 40));
        
        const end = performance.now();
        const duration = end - start;
        
        // Record the slow operation
        latencyMonitor.recordLatency('test_slow_operation', duration);
        
        resolve(duration);
      });

      const operationDuration = await slowOperationPromise;

      expect(operationDuration).toBeGreaterThan(35); // Should exceed critical threshold

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(alerts.length).toBeGreaterThan(0);
      
      const criticalAlert = alerts.find(a => a.severity === 'critical');
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert.operation).toBe('test_slow_operation');
      expect(criticalAlert.actualLatency).toBeGreaterThan(35);
      expect(criticalAlert.threshold).toBe(35);
      expect(criticalAlert.timestamp).toBeDefined();
    });

    test('should provide latency optimization recommendations', async () => {
      // Generate diverse latency data
      const latencyData = [
        { operation: 'state_query', latency: 8, target: 5 },
        { operation: 'transaction_processing', latency: 22, target: 15 },
        { operation: 'state_sync', latency: 28, target: 25 },
        { operation: 'batch_processing', latency: 35, target: 30 },
      ];

      for (const data of latencyData) {
        latencyMonitor.recordLatency(data.operation, data.latency);
      }

      const recommendations = await latencyMonitor.getOptimizationRecommendations();

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);

      const stateQueryRec = recommendations.find(r => r.operation === 'state_query');
      const transactionRec = recommendations.find(r => r.operation === 'transaction_processing');
      
      if (stateQueryRec) {
        expect(stateQueryRec.recommendations).toContain('cache');
      }
      
      if (transactionRec) {
        expect(transactionRec.recommendations).toContain('batch');
      }
    });
  });

  describe('Network and Infrastructure Latency', () => {
    test('should maintain latency under varying network conditions', async () => {
      const networkConditions = ['optimal', 'good', 'fair', 'poor'];
      const results = [];

      for (const condition of networkConditions) {
        // Configure SDK for network condition
        const conditionConfig = {
          optimal: { timeout: 1000, retries: 1, batchSize: 50 },
          good: { timeout: 2000, retries: 2, batchSize: 40 },
          fair: { timeout: 3000, retries: 3, batchSize: 30 },
          poor: { timeout: 5000, retries: 3, batchSize: 20 },
        };

        erSDK.updateConfig(conditionConfig[condition]);

        const startTime = performance.now();
        
        const result = await erSDK.processTransaction({
          type: 'network_test',
          player: testKeypair.publicKey,
          data: { condition },
          timestamp: Date.now(),
          nonce: 600 + networkConditions.indexOf(condition),
        });

        const endTime = performance.now();
        const latency = endTime - startTime;

        results.push({
          condition,
          latency,
          success: result.success,
        });
      }

      // Even under poor conditions, should maintain reasonable performance
      expect(results[0].latency).toBeLessThan(20); // Optimal
      expect(results[1].latency).toBeLessThan(25); // Good
      expect(results[2].latency).toBeLessThan(35); // Fair
      expect(results[3].latency).toBeLessThan(50); // Poor

      expect(results.every(r => r.success)).toBe(true);
    });
  });
});