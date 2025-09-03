/**
 * 30ms Latency Target Verification Tests
 * Tests to ensure MagicBlock operations meet sub-30ms latency requirements
 */

const { expect } = require('@jest/globals');
const { performance } = require('perf_hooks');

// Mock MagicBlock latency-critical components
const EphemeralRollup = require('../../../src/magicblock/ephemeral_rollup');
const StateSync = require('../../../src/magicblock/state_sync');
const TransactionProcessor = require('../../../src/magicblock/transaction_processor');
const GameStateManager = require('../../../src/magicblock/game_state_manager');

describe('30ms Latency Target Verification', () => {
  let ephemeralRollup;
  let stateSync;
  let transactionProcessor;
  let gameStateManager;
  
  beforeEach(async () => {
    // Initialize components with performance optimizations
    ephemeralRollup = new EphemeralRollup({
      network: 'testnet',
      batchSize: 50,
      commitInterval: 25, // ms
      enableOptimizations: true
    });
    
    stateSync = new StateSync({
      maxSyncTime: 20, // ms target
      compressionEnabled: true,
      deltaUpdatesOnly: true
    });
    
    transactionProcessor = new TransactionProcessor({
      processingTarget: 15, // ms per transaction
      batchProcessing: true,
      priorityQueue: true
    });
    
    gameStateManager = new GameStateManager({
      updateFrequency: 60, // 60 FPS target
      maxUpdateTime: 16.67, // 16.67ms per frame
      optimizeForLatency: true
    });
    
    await ephemeralRollup.initialize();
    await stateSync.initialize();
    await transactionProcessor.initialize();
    await gameStateManager.initialize();
  });

  afterEach(async () => {
    await ephemeralRollup.shutdown();
    await stateSync.shutdown();
    await transactionProcessor.shutdown();
    await gameStateManager.shutdown();
  });

  describe('Single Transaction Processing', () => {
    test('should process move transaction under 30ms', async () => {
      const transaction = {
        type: 'move',
        playerId: 'player_latency_test_1',
        data: {
          fromX: 100,
          fromY: 200,
          toX: 120,
          toY: 220,
          speed: 5.5
        },
        timestamp: Date.now(),
        sessionId: 'session_move_test'
      };
      
      const startTime = performance.now();
      
      const result = await transactionProcessor.processTransaction(transaction);
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      expect(processingTime).toBeLessThan(30);
      expect(processingTime).toBeLessThan(15); // Target is even better
      expect(result.success).toBe(true);
      expect(result.newPosition).toEqual({ x: 120, y: 220 });
      expect(result.processingTime).toBeLessThan(processingTime + 1); // Internal timing consistent
    });

    test('should process attack transaction under 30ms', async () => {
      const attackTransaction = {
        type: 'attack',
        playerId: 'attacker_latency_test',
        data: {
          targetId: 'target_player_123',
          weapon: 'sword',
          damage: 25,
          position: { x: 150, y: 300 },
          attackType: 'melee'
        },
        timestamp: Date.now(),
        sessionId: 'session_attack_test'
      };
      
      const startTime = performance.now();
      
      const result = await transactionProcessor.processTransaction(attackTransaction);
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      expect(processingTime).toBeLessThan(30);
      expect(processingTime).toBeLessThan(20); // Attack should be faster than 20ms
      expect(result.success).toBe(true);
      expect(result.damageDealt).toBe(25);
      expect(result.hitConfirmed).toBe(true);
    });

    test('should process complex ability transaction under 30ms', async () => {
      const abilityTransaction = {
        type: 'special_ability',
        playerId: 'ability_test_player',
        data: {
          abilityId: 'fireball',
          targetPosition: { x: 200, y: 400 },
          manaCost: 50,
          areaOfEffect: 25,
          duration: 3000,
          effects: ['damage', 'burn', 'knockback']
        },
        timestamp: Date.now(),
        sessionId: 'session_ability_test'
      };
      
      const startTime = performance.now();
      
      const result = await transactionProcessor.processTransaction(abilityTransaction);
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      expect(processingTime).toBeLessThan(30);
      expect(result.success).toBe(true);
      expect(result.affectedEntities).toBeDefined();
      expect(result.abilityActivated).toBe(true);
    });
  });

  describe('Batch Transaction Processing', () => {
    test('should process batch of 10 transactions under 30ms total', async () => {
      const transactions = [];
      
      // Generate 10 mixed transactions
      for (let i = 0; i < 10; i++) {
        transactions.push({
          type: i % 3 === 0 ? 'move' : i % 3 === 1 ? 'attack' : 'use_item',
          playerId: `batch_player_${i}`,
          data: {
            x: i * 20,
            y: i * 30,
            value: i * 5
          },
          timestamp: Date.now() + i,
          sessionId: `batch_session_${i}`
        });
      }
      
      const startTime = performance.now();
      
      const results = await transactionProcessor.processBatch(transactions);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(30); // Entire batch under 30ms
      expect(results.length).toBe(10);
      expect(results.every(r => r.success)).toBe(true);
      
      const avgTimePerTx = totalTime / 10;
      expect(avgTimePerTx).toBeLessThan(3); // Each tx averages under 3ms
    });

    test('should maintain latency with varying batch sizes', async () => {
      const batchSizes = [5, 10, 20, 50];
      const results = [];
      
      for (const batchSize of batchSizes) {
        const transactions = [];
        
        for (let i = 0; i < batchSize; i++) {
          transactions.push({
            type: 'move',
            playerId: `varying_player_${i}`,
            data: { x: i, y: i * 2 },
            timestamp: Date.now() + i,
            sessionId: `varying_session_${i}`
          });
        }
        
        const startTime = performance.now();
        
        await transactionProcessor.processBatch(transactions);
        
        const endTime = performance.now();
        const processingTime = endTime - startTime;
        
        results.push({
          batchSize,
          processingTime,
          avgTimePerTx: processingTime / batchSize
        });
      }
      
      // All batch sizes should complete reasonably
      results.forEach(result => {
        if (result.batchSize <= 20) {
          expect(result.processingTime).toBeLessThan(30); // Smaller batches under 30ms
        } else {
          expect(result.processingTime).toBeLessThan(60); // Larger batches under 60ms
        }
        
        expect(result.avgTimePerTx).toBeLessThan(5); // Per-tx time should remain low
      });
      
      // Verify batch processing efficiency improves with size
      const smallBatchAvg = results[0].avgTimePerTx; // 5 transactions
      const largeBatchAvg = results[3].avgTimePerTx; // 50 transactions
      
      expect(largeBatchAvg).toBeLessThan(smallBatchAvg); // Batching should be more efficient
    });
  });

  describe('State Synchronization Latency', () => {
    test('should sync game state to Ephemeral Rollup under 30ms', async () => {
      // Create game state to sync
      const gameState = {
        players: {},
        entities: {},
        environment: {
          weather: 'clear',
          timeOfDay: 'noon'
        },
        timestamp: Date.now()
      };
      
      // Add 20 players with various states
      for (let i = 0; i < 20; i++) {
        gameState.players[`player_${i}`] = {
          id: `player_${i}`,
          position: { x: i * 25, y: i * 15 },
          health: 100 - i,
          energy: 50 + i,
          level: Math.floor(i / 5) + 1,
          equipment: ['sword', 'shield', 'boots'],
          status: i % 3 === 0 ? 'idle' : i % 3 === 1 ? 'moving' : 'combat'
        };
      }
      
      // Add 50 game entities
      for (let i = 0; i < 50; i++) {
        gameState.entities[`entity_${i}`] = {
          id: `entity_${i}`,
          type: i % 4 === 0 ? 'item' : i % 4 === 1 ? 'npc' : i % 4 === 2 ? 'obstacle' : 'effect',
          position: { x: i * 8, y: i * 12 },
          data: { value: i * 10, active: i % 2 === 0 }
        };
      }
      
      const startTime = performance.now();
      
      const syncResult = await stateSync.syncToEphemeralRollup(gameState);
      
      const endTime = performance.now();
      const syncTime = endTime - startTime;
      
      expect(syncTime).toBeLessThan(30); // Target under 30ms
      expect(syncTime).toBeLessThan(20); // Stretch goal under 20ms
      expect(syncResult.success).toBe(true);
      expect(syncResult.playersSync).toBe(20);
      expect(syncResult.entitiesSync).toBe(50);
      expect(syncResult.compressionRatio).toBeGreaterThan(0.3); // At least 30% compression
    });

    test('should handle incremental state updates efficiently', async () => {
      // Initialize base state
      const baseState = await gameStateManager.createInitialState();
      await stateSync.establishBaseline(baseState);
      
      // Create incremental updates
      const updates = [];
      for (let i = 0; i < 15; i++) {
        updates.push({
          type: 'player_update',
          playerId: `player_${i}`,
          changes: {
            position: { x: i * 10 + 100, y: i * 5 + 200 },
            health: 100 - (i * 2),
            lastAction: 'move'
          },
          timestamp: Date.now() + i
        });
      }
      
      const startTime = performance.now();
      
      const deltaSync = await stateSync.syncDeltaUpdates(updates);
      
      const endTime = performance.now();
      const deltaTime = endTime - startTime;
      
      expect(deltaTime).toBeLessThan(25); // Delta updates should be even faster
      expect(deltaSync.success).toBe(true);
      expect(deltaSync.updatesProcessed).toBe(15);
      expect(deltaSync.bytesTransferred).toBeLessThan(deltaSync.uncompressedSize);
    });

    test('should maintain sync performance under concurrent access', async () => {
      const concurrentUpdates = 10;
      const syncPromises = [];
      
      for (let i = 0; i < concurrentUpdates; i++) {
        const gameState = {
          sessionId: `concurrent_session_${i}`,
          players: {
            [`concurrent_player_${i}`]: {
              id: `concurrent_player_${i}`,
              position: { x: i * 50, y: i * 75 },
              health: 100,
              timestamp: Date.now() + i
            }
          },
          entities: {},
          updateId: i
        };
        
        syncPromises.push(stateSync.syncToEphemeralRollup(gameState));
      }
      
      const startTime = performance.now();
      
      const results = await Promise.all(syncPromises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(50); // All concurrent syncs under 50ms
      expect(results.length).toBe(concurrentUpdates);
      expect(results.every(r => r.success)).toBe(true);
      
      const avgSyncTime = totalTime / concurrentUpdates;
      expect(avgSyncTime).toBeLessThan(8); // Each sync averages under 8ms
    });
  });

  describe('Game State Updates', () => {
    test('should update game state at 60 FPS (16.67ms intervals)', async () => {
      const targetFrameTime = 16.67; // 60 FPS
      const frameCount = 10;
      const frameTimes = [];
      
      // Simulate 10 game frames
      for (let frame = 0; frame < frameCount; frame++) {
        const frameStartTime = performance.now();
        
        // Simulate frame update with multiple operations
        await gameStateManager.updateFrame({
          frameNumber: frame,
          deltaTime: targetFrameTime / 1000, // Convert to seconds
          playerActions: [
            { playerId: 'fps_player_1', action: 'move', data: { x: frame * 10, y: frame * 5 } },
            { playerId: 'fps_player_2', action: 'attack', data: { target: 'enemy' } },
            { playerId: 'fps_player_3', action: 'use_item', data: { item: 'potion' } }
          ],
          environmentUpdates: {
            weather: frame % 5 === 0 ? 'rain' : 'clear',
            effects: [`effect_${frame}`]
          }
        });
        
        const frameEndTime = performance.now();
        const frameTime = frameEndTime - frameStartTime;
        frameTimes.push(frameTime);
        
        expect(frameTime).toBeLessThan(targetFrameTime); // Each frame under 16.67ms
      }
      
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameCount;
      const maxFrameTime = Math.max(...frameTimes);
      
      expect(avgFrameTime).toBeLessThan(targetFrameTime * 0.8); // Average well under target
      expect(maxFrameTime).toBeLessThan(targetFrameTime); // No frame exceeds target
      
      // Verify frame time consistency (low variance)
      const variance = frameTimes.reduce((acc, time) => acc + Math.pow(time - avgFrameTime, 2), 0) / frameCount;
      const standardDeviation = Math.sqrt(variance);
      
      expect(standardDeviation).toBeLessThan(3); // Consistent frame times
    });

    test('should handle variable load while maintaining frame targets', async () => {
      const scenarios = [
        { name: 'light', players: 5, entities: 10, effects: 2 },
        { name: 'medium', players: 20, entities: 50, effects: 10 },
        { name: 'heavy', players: 50, entities: 100, effects: 25 },
        { name: 'extreme', players: 100, entities: 200, effects: 50 }
      ];
      
      const results = [];
      
      for (const scenario of scenarios) {
        const startTime = performance.now();
        
        await gameStateManager.updateFrame({
          frameNumber: 1,
          deltaTime: 0.0167, // 60 FPS
          playerCount: scenario.players,
          entityCount: scenario.entities,
          effectCount: scenario.effects,
          load: scenario.name
        });
        
        const endTime = performance.now();
        const updateTime = endTime - startTime;
        
        results.push({
          scenario: scenario.name,
          updateTime,
          players: scenario.players,
          entities: scenario.entities,
          effects: scenario.effects
        });
      }
      
      // Light and medium loads should easily meet targets
      expect(results[0].updateTime).toBeLessThan(10); // Light load under 10ms
      expect(results[1].updateTime).toBeLessThan(20); // Medium load under 20ms
      
      // Heavy load should still meet 30ms target
      expect(results[2].updateTime).toBeLessThan(30); // Heavy load under 30ms
      
      // Extreme load may exceed 30ms but should be reasonable
      expect(results[3].updateTime).toBeLessThan(50); // Extreme load under 50ms
    });
  });

  describe('End-to-End Latency', () => {
    test('should complete full transaction cycle under 30ms', async () => {
      const transaction = {
        type: 'player_action',
        playerId: 'e2e_test_player',
        action: 'complex_move_attack',
        data: {
          move: { fromX: 0, fromY: 0, toX: 50, toY: 75 },
          attack: { targetId: 'enemy_123', damage: 30 },
          useItem: { itemId: 'speed_boost', duration: 5000 }
        },
        timestamp: Date.now(),
        sessionId: 'e2e_test_session'
      };
      
      const startTime = performance.now();
      
      // Full cycle: validate -> process -> update state -> sync to ER
      const validationResult = await transactionProcessor.validateTransaction(transaction);
      expect(validationResult.isValid).toBe(true);
      
      const processResult = await transactionProcessor.processTransaction(transaction);
      expect(processResult.success).toBe(true);
      
      const stateUpdate = await gameStateManager.applyTransactionResult(processResult);
      expect(stateUpdate.success).toBe(true);
      
      const syncResult = await stateSync.syncToEphemeralRollup(stateUpdate.newState);
      expect(syncResult.success).toBe(true);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(30); // Complete cycle under 30ms
      expect(totalTime).toBeLessThan(25); // Stretch goal under 25ms
    });

    test('should handle multiple concurrent end-to-end transactions', async () => {
      const concurrentTransactions = 8;
      const transactions = [];
      
      for (let i = 0; i < concurrentTransactions; i++) {
        transactions.push({
          type: 'concurrent_action',
          playerId: `concurrent_e2e_player_${i}`,
          action: 'move_and_attack',
          data: {
            move: { toX: i * 25, toY: i * 30 },
            attack: { targetId: `enemy_${i}`, damage: 20 + i }
          },
          timestamp: Date.now() + i,
          sessionId: `concurrent_e2e_session_${i}`
        });
      }
      
      const startTime = performance.now();
      
      // Process all transactions concurrently through full pipeline
      const results = await Promise.all(
        transactions.map(async (tx) => {
          const validation = await transactionProcessor.validateTransaction(tx);
          const processing = await transactionProcessor.processTransaction(tx);
          const stateUpdate = await gameStateManager.applyTransactionResult(processing);
          const sync = await stateSync.syncToEphemeralRollup(stateUpdate.newState);
          
          return {
            transactionId: tx.playerId,
            validation: validation.isValid,
            processing: processing.success,
            stateUpdate: stateUpdate.success,
            sync: sync.success
          };
        })
      );
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(60); // 8 concurrent e2e under 60ms
      expect(results.length).toBe(concurrentTransactions);
      
      // All stages should succeed for all transactions
      results.forEach(result => {
        expect(result.validation).toBe(true);
        expect(result.processing).toBe(true);
        expect(result.stateUpdate).toBe(true);
        expect(result.sync).toBe(true);
      });
      
      const avgTimePerTransaction = totalTime / concurrentTransactions;
      expect(avgTimePerTransaction).toBeLessThan(12); // Each concurrent tx under 12ms average
    });
  });

  describe('Latency Monitoring and Alerts', () => {
    test('should track latency metrics accurately', async () => {
      const metricsCollector = ephemeralRollup.getMetricsCollector();
      
      // Perform various operations
      const operations = [
        () => transactionProcessor.processTransaction({ type: 'move', data: { x: 1, y: 1 } }),
        () => stateSync.syncToEphemeralRollup({ test: 'data' }),
        () => gameStateManager.updateFrame({ frameNumber: 1 })
      ];
      
      for (let i = 0; i < operations.length; i++) {
        await operations[i]();
      }
      
      const metrics = await metricsCollector.getLatencyMetrics();
      
      expect(metrics.transactionProcessing).toBeDefined();
      expect(metrics.stateSync).toBeDefined();
      expect(metrics.frameUpdate).toBeDefined();
      
      expect(metrics.transactionProcessing.avg).toBeLessThan(30);
      expect(metrics.stateSync.avg).toBeLessThan(30);
      expect(metrics.frameUpdate.avg).toBeLessThan(16.67);
      
      expect(metrics.transactionProcessing.p95).toBeLessThan(40); // 95th percentile
      expect(metrics.stateSync.p95).toBeLessThan(40);
      expect(metrics.frameUpdate.p95).toBeLessThan(25);
    });

    test('should trigger alerts when latency exceeds thresholds', async () => {
      const alertSystem = ephemeralRollup.getAlertSystem();
      const alerts = [];
      
      alertSystem.onAlert((alert) => {
        alerts.push(alert);
      });
      
      // Simulate slow operation that exceeds threshold
      const slowOperation = async () => {
        const startTime = performance.now();
        
        // Simulate work that takes longer than threshold
        await new Promise(resolve => setTimeout(resolve, 35)); // 35ms delay
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        alertSystem.recordLatency('test_operation', duration);
        
        return duration;
      };
      
      const operationTime = await slowOperation();
      
      expect(operationTime).toBeGreaterThan(30); // Should exceed threshold
      
      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toBe('LATENCY_THRESHOLD_EXCEEDED');
      expect(alerts[0].operation).toBe('test_operation');
      expect(alerts[0].actualLatency).toBeGreaterThan(30);
      expect(alerts[0].threshold).toBe(30);
    });
  });
});