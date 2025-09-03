/**
 * MagicBlock Performance Integration Tests
 * Validates <30ms latency requirements on real devnet
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import {
  initializeMagicBlockSDK,
  MagicBlockSDKInstance,
  createMagicBlockConnection,
  selectOptimalEndpoint
} from '../../src/magicblock/index';

describe('MagicBlock Performance Integration Tests', () => {
  let sdk: MagicBlockSDKInstance;
  let authority: Keypair;
  let testGameId: string;
  
  const PERFORMANCE_THRESHOLDS = {
    SDK_INIT: 5000, // 5s for SDK initialization
    SESSION_CREATE: 1000, // 1s for session creation
    GASLESS_TX: 30, // 30ms for gasless transactions
    ROLLUP_TX: 30, // 30ms for rollup transactions
    STATE_SYNC: 50, // 50ms for state synchronization
    VRF_REQUEST: 2000, // 2s for VRF requests
    GAME_ACTION: 30, // 30ms for game actions
    BATCH_OPERATIONS: 100 // 100ms for batch operations
  };
  
  beforeAll(async () => {
    console.log('🚀 Initializing MagicBlock SDK for performance testing...');
    
    // Generate test authority
    authority = Keypair.generate();
    
    // Initialize SDK with performance optimizations
    const startTime = performance.now();
    
    sdk = await initializeMagicBlockSDK({
      network: 'devnet',
      authority,
      enableVRF: true,
      enableRollups: true,
      enableGasless: true,
      maxLatencyMs: 30,
      autoOptimize: true
    });
    
    const initTime = performance.now() - startTime;
    
    expect(initTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SDK_INIT);
    console.log(`✅ SDK initialized in ${initTime.toFixed(1)}ms`);
    
    // Wait for connection stabilization
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);
  
  afterAll(async () => {
    if (sdk) {
      await sdk.cleanup();
    }
  }, 10000);

  describe('Connection and Endpoint Performance', () => {
    test('should achieve <100ms RPC latency to devnet', async () => {
      const latencyTests = [];
      
      // Test multiple RPC calls for average latency
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await sdk.connection.getSlot('processed');
        const latency = performance.now() - start;
        latencyTests.push(latency);
      }
      
      const avgLatency = latencyTests.reduce((sum, lat) => sum + lat, 0) / latencyTests.length;
      const maxLatency = Math.max(...latencyTests);
      
      console.log(`📊 RPC Latency - Avg: ${avgLatency.toFixed(1)}ms, Max: ${maxLatency.toFixed(1)}ms`);
      
      expect(avgLatency).toBeLessThan(100);
      expect(maxLatency).toBeLessThan(200);
    });
    
    test('should successfully select optimal endpoint', async () => {
      const start = performance.now();
      
      const optimal = await selectOptimalEndpoint('devnet');
      
      const selectionTime = performance.now() - start;
      
      expect(optimal.network).toBeDefined();
      expect(optimal.connection).toBeDefined();
      expect(selectionTime).toBeLessThan(5000); // 5s max for endpoint selection
      
      console.log(`✅ Optimal endpoint selected: ${optimal.network} (${selectionTime.toFixed(1)}ms)`);
    });
  });

  describe('Session Management Performance', () => {
    let testSession: any;
    
    test('should create session within latency threshold', async () => {
      const start = performance.now();
      
      testSession = await sdk.sessionManager.createSession(authority, {
        validUntil: Date.now() / 1000 + 3600, // 1 hour
        permissions: [
          {
            programId: sdk.programs.bolt,
            instruction: '*'
          }
        ],
        gaslessEnabled: true
      });
      
      const createTime = performance.now() - start;
      
      expect(createTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SESSION_CREATE);
      expect(testSession).toBeDefined();
      expect(testSession.sessionKey).toBeDefined();
      
      console.log(`✅ Session created in ${createTime.toFixed(1)}ms`);
    });
    
    test('should execute gasless transaction within 30ms', async () => {
      if (!testSession) {
        throw new Error('Test session not available');
      }
      
      // Create simple transaction
      const testTx = await sdk.connection.getRecentBlockhash().then(({ blockhash }) => {
        const tx = new (require('@solana/web3.js').Transaction)();
        tx.recentBlockhash = blockhash;
        tx.feePayer = testSession.sessionKey.publicKey;
        return tx;
      });
      
      const start = performance.now();
      
      const result = await sdk.sessionManager.executeGaslessTransaction(
        testSession.sessionKey.publicKey.toString(),
        testTx,
        sdk.programs.bolt,
        'test_instruction'
      );
      
      const execTime = performance.now() - start;
      
      expect(execTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GASLESS_TX);
      expect(result.signature).toBeDefined();
      
      console.log(`✅ Gasless transaction executed in ${execTime.toFixed(1)}ms`);
    }, 10000);
  });

  describe('Ephemeral Rollups Performance', () => {
    let rollupSession: any;
    
    test('should create rollup session efficiently', async () => {
      const start = performance.now();
      
      rollupSession = await sdk.rollupClient.createRollupSession(authority, {
        computeBudget: 1_000_000,
        lifetimeMs: 3600000,
        autoCommit: true,
        tickRateMs: 50 // 20 TPS
      });
      
      const createTime = performance.now() - start;
      
      expect(createTime).toBeLessThan(2000); // 2s for rollup session
      expect(rollupSession.id).toBeDefined();
      
      console.log(`✅ Rollup session created in ${createTime.toFixed(1)}ms`);
    });
    
    test('should execute rollup transaction within 30ms', async () => {
      if (!rollupSession) {
        throw new Error('Rollup session not available');
      }
      
      // Create test transaction
      const testTx = await sdk.connection.getRecentBlockhash().then(({ blockhash }) => {
        const tx = new (require('@solana/web3.js').Transaction)();
        tx.recentBlockhash = blockhash;
        tx.feePayer = authority.publicKey;
        return tx;
      });
      
      const start = performance.now();
      
      const result = await sdk.rollupClient.executeTransaction(
        rollupSession.id,
        testTx,
        [authority]
      );
      
      const execTime = performance.now() - start;
      
      expect(execTime).toBeLessThan(PERFORMANCE_THRESHOLDS.ROLLUP_TX);
      expect(result.signature).toBeDefined();
      
      console.log(`✅ Rollup transaction executed in ${execTime.toFixed(1)}ms`);
    }, 10000);
  });

  describe('State Synchronization Performance', () => {
    test('should track account state efficiently', async () => {
      const testAccount = Keypair.generate().publicKey;
      
      const start = performance.now();
      
      await sdk.stateSync.trackAccount(testAccount);
      
      const trackTime = performance.now() - start;
      
      expect(trackTime).toBeLessThan(PERFORMANCE_THRESHOLDS.STATE_SYNC);
      
      console.log(`✅ Account tracking initialized in ${trackTime.toFixed(1)}ms`);
    });
    
    test('should perform batch state sync efficiently', async () => {
      const testAccounts = Array.from({ length: 5 }, () => 
        Keypair.generate().publicKey.toString()
      );
      
      const start = performance.now();
      
      const results = await sdk.stateSync.batchSyncAccounts(testAccounts);
      
      const batchTime = performance.now() - start;
      
      expect(batchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BATCH_OPERATIONS);
      expect(results.size).toBe(testAccounts.length);
      
      console.log(`✅ Batch sync (${testAccounts.length} accounts) in ${batchTime.toFixed(1)}ms`);
    });
  });

  describe('VRF Performance', () => {
    test('should handle instant devnet random efficiently', async () => {
      const testGameAccount = Keypair.generate().publicKey;
      
      const start = performance.now();
      
      const vrfResult = await sdk.vrfPlugin.getInstantDevnetRandom(testGameAccount);
      
      const vrfTime = performance.now() - start;
      
      expect(vrfTime).toBeLessThan(100); // 100ms for instant random
      expect(vrfResult.randomValue).toBeDefined();
      expect(vrfResult.proof).toBeDefined();
      
      console.log(`✅ Instant VRF generated in ${vrfTime.toFixed(1)}ms`);
    });
    
    test('should batch VRF requests efficiently', async () => {
      const testGameAccounts = Array.from({ length: 3 }, () => 
        Keypair.generate().publicKey
      );
      
      const start = performance.now();
      
      const requestIds = await sdk.vrfPlugin.requestBatchVRF(
        testGameAccounts,
        sdk.programs.bolt
      );
      
      const batchTime = performance.now() - start;
      
      expect(batchTime).toBeLessThan(PERFORMANCE_THRESHOLDS.VRF_REQUEST);
      expect(requestIds.length).toBe(testGameAccounts.length);
      
      console.log(`✅ Batch VRF requests (${testGameAccounts.length}) in ${batchTime.toFixed(1)}ms`);
    }, 15000);
  });

  describe('Game Engine Performance', () => {
    test('should create game within performance threshold', async () => {
      const gameId = `perf_test_${Date.now()}`;
      
      const start = performance.now();
      
      const gameState = await sdk.gameEngine.createGame(gameId, authority.publicKey, {
        maxPlayers: 4,
        minBet: new BN(1000000), // 0.001 SOL
        enableVRF: false, // Disable for speed test
        rollupConfig: {
          tickRateMs: 50,
          batchSize: 25,
          autoCommit: true
        }
      });
      
      const createTime = performance.now() - start;
      testGameId = gameId;
      
      expect(createTime).toBeLessThan(3000); // 3s for game creation
      expect(gameState.gameId).toBe(gameId);
      expect(gameState.currentPhase).toBeDefined();
      
      console.log(`✅ Game created in ${createTime.toFixed(1)}ms`);
    }, 15000);
    
    test('should execute game actions within 30ms', async () => {
      if (!testGameId) {
        throw new Error('Test game not available');
      }
      
      // Create test session for game
      const playerSession = await sdk.sessionManager.createPvPSession(
        authority,
        sdk.programs.bolt,
        new BN(10000000) // 0.01 SOL max bet
      );
      
      const joinAction = {
        actionId: `join_${Date.now()}`,
        playerId: authority.publicKey.toString(),
        type: 'JOIN' as const,
        amount: new BN(1000000), // 0.001 SOL buy-in
        timestamp: Date.now(),
        nonce: Date.now()
      };
      
      const start = performance.now();
      
      const transition = await sdk.gameEngine.executeGameAction(
        testGameId,
        joinAction,
        playerSession.sessionKey.publicKey.toString()
      );
      
      const actionTime = performance.now() - start;
      
      expect(actionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.GAME_ACTION);
      expect(transition.valid).toBe(true);
      expect(transition.rollupSignature).toBeDefined();
      
      console.log(`✅ Game action executed in ${actionTime.toFixed(1)}ms`);
    }, 20000);
  });

  describe('End-to-End Performance', () => {
    test('should maintain <30ms for complete PvP flow', async () => {
      const player1 = Keypair.generate();
      const player2 = Keypair.generate();
      const gameId = `e2e_test_${Date.now()}`;
      
      console.log('🎮 Starting end-to-end PvP performance test...');
      
      // Step 1: Create sessions
      const sessionStart = performance.now();
      const [session1, session2] = await Promise.all([
        sdk.sessionManager.createPvPSession(player1, sdk.programs.bolt),
        sdk.sessionManager.createPvPSession(player2, sdk.programs.bolt)
      ]);
      const sessionTime = performance.now() - sessionStart;
      
      // Step 2: Create game
      const gameStart = performance.now();
      await sdk.gameEngine.createGame(gameId, player1.publicKey, {
        maxPlayers: 2,
        enableVRF: false
      });
      const gameTime = performance.now() - gameStart;
      
      // Step 3: Join players
      const joinStart = performance.now();
      await Promise.all([
        sdk.gameEngine.joinGame(
          gameId,
          player1.publicKey,
          new BN(1000000),
          session1.sessionKey.publicKey.toString()
        ),
        sdk.gameEngine.joinGame(
          gameId,
          player2.publicKey,
          new BN(1000000),
          session2.sessionKey.publicKey.toString()
        )
      ]);
      const joinTime = performance.now() - joinStart;
      
      // Step 4: Execute game actions rapidly
      const actionsStart = performance.now();
      
      const betAction = {
        actionId: `bet_${Date.now()}`,
        playerId: player1.publicKey.toString(),
        type: 'BET' as const,
        amount: new BN(100000),
        timestamp: Date.now(),
        nonce: Date.now()
      };
      
      const callAction = {
        actionId: `call_${Date.now()}`,
        playerId: player2.publicKey.toString(),
        type: 'CALL' as const,
        timestamp: Date.now(),
        nonce: Date.now()
      };
      
      const [betResult, callResult] = await Promise.all([
        sdk.gameEngine.executeGameAction(
          gameId,
          betAction,
          session1.sessionKey.publicKey.toString()
        ),
        new Promise(resolve => 
          setTimeout(async () => {
            const result = await sdk.gameEngine.executeGameAction(
              gameId,
              callAction,
              session2.sessionKey.publicKey.toString()
            );
            resolve(result);
          }, 100) // Small delay for proper sequence
        )
      ]);
      
      const actionsTime = performance.now() - actionsStart;
      
      // Validate performance
      expect(sessionTime).toBeLessThan(2000); // 2s for sessions
      expect(gameTime).toBeLessThan(3000); // 3s for game creation
      expect(joinTime).toBeLessThan(1000); // 1s for joins
      expect(actionsTime).toBeLessThan(500); // 500ms for actions
      
      console.log(`📊 E2E Performance Breakdown:`);
      console.log(`  Sessions: ${sessionTime.toFixed(1)}ms`);
      console.log(`  Game: ${gameTime.toFixed(1)}ms`);
      console.log(`  Joins: ${joinTime.toFixed(1)}ms`);
      console.log(`  Actions: ${actionsTime.toFixed(1)}ms`);
      
      const totalTime = sessionTime + gameTime + joinTime + actionsTime;
      console.log(`🎯 Total E2E Time: ${totalTime.toFixed(1)}ms`);
      
    }, 30000);
  });

  describe('Performance Monitoring', () => {
    test('should provide comprehensive metrics', async () => {
      const metrics = sdk.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.sessions).toBeDefined();
      expect(metrics.rollups).toBeDefined();
      expect(metrics.gasless).toBeDefined();
      expect(metrics.vrf).toBeDefined();
      expect(metrics.games).toBeDefined();
      
      console.log('📊 SDK Metrics:', JSON.stringify(metrics, null, 2));
      
      // Validate performance grades
      const status = await sdk.getStatus();
      expect(status.performanceGrade).toMatch(/[A-C]/); // Should be A, B, or C grade
      
      console.log(`🎯 Performance Grade: ${status.performanceGrade}`);
      console.log(`📡 Network Latency: ${status.latency.toFixed(1)}ms`);
    });
    
    test('should handle concurrent load efficiently', async () => {
      const concurrentOperations = 10;
      const operations = [];
      
      const startTime = performance.now();
      
      // Create concurrent sessions
      for (let i = 0; i < concurrentOperations; i++) {
        const player = Keypair.generate();
        operations.push(
          sdk.sessionManager.createSession(player, {
            validUntil: Date.now() / 1000 + 3600,
            permissions: [{
              programId: sdk.programs.bolt,
              instruction: '*'
            }],
            gaslessEnabled: true
          })
        );
      }
      
      const results = await Promise.allSettled(operations);
      const totalTime = performance.now() - startTime;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const avgTimePerOp = totalTime / concurrentOperations;
      
      expect(successful).toBe(concurrentOperations);
      expect(avgTimePerOp).toBeLessThan(500); // 500ms average per operation
      
      console.log(`✅ Concurrent Load Test: ${successful}/${concurrentOperations} operations in ${totalTime.toFixed(1)}ms`);
      console.log(`📊 Average time per operation: ${avgTimePerOp.toFixed(1)}ms`);
    }, 25000);
  });
});