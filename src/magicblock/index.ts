/**
 * MagicBlock Integration Main Entry Point
 * Real implementation replacing all mocks with functional devnet integration
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Core components
import { RealSessionKeyManager } from './core/real-session-key-manager';
import { GaslessTransactionManager } from './core/gasless-transaction-manager';
import { StateSync } from './core/state-sync';

// Rollup client
import { EphemeralRollupsClient } from './rollup/ephemeral-rollups-client';

// VRF plugin
import { DevNetVRFPlugin } from './vrf/devnet-vrf-plugin';

// Game engine
import { RollupGameEngine } from './game/rollup-game-engine';

// Configuration
import {
  createMagicBlockConnection,
  selectOptimalEndpoint,
  getMagicBlockPrograms,
  getEnvironmentConfig,
  MAGICBLOCK_DEVNET_CONFIG
} from './config/devnet-endpoints';

export interface MagicBlockSDKConfig {
  network?: 'devnet' | 'testnet' | 'mainnet';
  authority?: Keypair;
  enableVRF?: boolean;
  enableRollups?: boolean;
  enableGasless?: boolean;
  maxLatencyMs?: number;
  autoOptimize?: boolean;
}

export interface MagicBlockSDKInstance {
  // Core managers
  sessionManager: RealSessionKeyManager;
  gaslessManager: GaslessTransactionManager;
  stateSync: StateSync;
  
  // Rollup client
  rollupClient: EphemeralRollupsClient;
  
  // VRF plugin
  vrfPlugin: DevNetVRFPlugin;
  
  // Game engine
  gameEngine: RollupGameEngine;
  
  // Connection and config
  connection: Connection;
  network: 'devnet' | 'testnet' | 'mainnet';
  programs: ReturnType<typeof getMagicBlockPrograms>;
  
  // Utility methods
  getStatus(): Promise<MagicBlockStatus>;
  getMetrics(): MagicBlockMetrics;
  cleanup(): Promise<void>;
}

export interface MagicBlockStatus {
  connected: boolean;
  network: string;
  latency: number;
  rollupHealth: 'healthy' | 'degraded' | 'down';
  sessionCount: number;
  activeGames: number;
  performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface MagicBlockMetrics {
  sessions: {
    active: number;
    totalCreated: number;
    avgLatency: number;
  };
  rollups: {
    activeSessions: number;
    avgTransitionTime: number;
    transactionsPerSecond: number;
  };
  gasless: {
    totalTransactions: number;
    avgExecutionTime: number;
    gasSaved: number;
    successRate: number;
  };
  vrf: {
    activeRequests: number;
    avgFulfillmentTime: number;
    fulfillmentRate: number;
  };
  games: {
    activeGames: number;
    avgActionLatency: number;
    playersOnline: number;
  };
}

/**
 * Initialize MagicBlock SDK with all components
 */
export async function initializeMagicBlockSDK(
  config: MagicBlockSDKConfig = {}
): Promise<MagicBlockSDKInstance> {
  const startTime = performance.now();
  console.log('🚀 Initializing MagicBlock SDK for PvP gaming...');
  
  try {
    // Get environment configuration
    const envConfig = getEnvironmentConfig();
    const network = config.network || envConfig.network;
    const enableVRF = config.enableVRF ?? envConfig.enableVRF;
    const enableRollups = config.enableRollups ?? envConfig.enableRollups;
    const maxLatencyMs = config.maxLatencyMs || envConfig.maxLatencyMs;
    
    // Auto-select optimal endpoint if enabled
    let connection: Connection;
    let selectedNetwork = network;
    
    if (config.autoOptimize) {
      console.log('🔍 Auto-optimizing endpoint selection...');
      const optimal = await selectOptimalEndpoint(network);
      connection = optimal.connection;
      selectedNetwork = optimal.network;
    } else {
      connection = createMagicBlockConnection(network);
    }
    
    // Get program addresses
    const programs = getMagicBlockPrograms(selectedNetwork);
    
    // Generate or use provided authority
    const authority = config.authority || Keypair.generate();
    
    console.log(`✅ Connected to MagicBlock ${selectedNetwork}`);
    console.log(`🔑 Authority: ${authority.publicKey.toString()}`);
    
    // Initialize Session Key Manager
    console.log('⚡ Initializing Session Key Manager...');
    const sessionManager = new RealSessionKeyManager(connection, true);
    sessionManager.startAutoRenewal(300); // 5 minutes renewal threshold
    
    // Initialize Ephemeral Rollups Client
    console.log('⚡ Initializing Ephemeral Rollups Client...');
    const rollupClient = new EphemeralRollupsClient(connection, true);
    rollupClient.startAutoCleanup();
    
    // Initialize Gasless Transaction Manager
    console.log('⚡ Initializing Gasless Transaction Manager...');
    const gaslessManager = new GaslessTransactionManager(
      connection,
      sessionManager,
      rollupClient
    );
    
    // Initialize State Sync
    console.log('⚡ Initializing State Sync...');
    const stateSync = new StateSync(connection, rollupClient, {
      syncIntervalMs: 50, // 20 Hz for gaming
      conflictResolutionStrategy: 'rollup_priority',
      enableDeltaCompression: true,
      prefetchEnabled: true
    });
    
    // Initialize VRF Plugin (if enabled)
    let vrfPlugin: DevNetVRFPlugin;
    if (enableVRF) {
      console.log('⚡ Initializing VRF Plugin...');
      vrfPlugin = new DevNetVRFPlugin(connection, authority);
    } else {
      console.log('⚠️ VRF disabled, using pseudorandom for testing');
      vrfPlugin = new DevNetVRFPlugin(connection, authority);
    }
    
    // Initialize Rollup Game Engine
    console.log('⚡ Initializing Rollup Game Engine...');
    const gameEngine = new RollupGameEngine(
      connection,
      rollupClient,
      sessionManager,
      gaslessManager,
      stateSync,
      vrfPlugin
    );
    
    // Setup event forwarding and monitoring
    setupEventForwarding({
      sessionManager,
      rollupClient,
      gaslessManager,
      stateSync,
      gameEngine
    });
    
    // Create SDK instance
    const sdkInstance: MagicBlockSDKInstance = {
      sessionManager,
      gaslessManager,
      stateSync,
      rollupClient,
      vrfPlugin,
      gameEngine,
      connection,
      network: selectedNetwork,
      programs,
      
      // Utility methods
      async getStatus(): Promise<MagicBlockStatus> {
        return getMagicBlockStatus(this);
      },
      
      getMetrics(): MagicBlockMetrics {
        return getMagicBlockMetrics(this);
      },
      
      async cleanup(): Promise<void> {
        console.log('🧹 Cleaning up MagicBlock SDK...');
        
        // Stop all background processes
        sessionManager.cleanupExpiredSessions();
        stateSync.stopSync();
        gaslessManager.stopProcessing();
        gameEngine.cleanupCompletedGames();
        
        // Close active rollup sessions
        const rollupSessions = rollupClient.getActiveSessions();
        for (const session of rollupSessions) {
          await rollupClient.closeSession(session.id);
        }
        
        console.log('✅ MagicBlock SDK cleanup completed');
      }
    };
    
    const initTime = performance.now() - startTime;
    console.log(`🎉 MagicBlock SDK initialized successfully in ${initTime.toFixed(1)}ms`);
    console.log(`🎯 Target latency: <${maxLatencyMs}ms`);
    
    // Performance validation
    if (initTime > 5000) { // 5 second warning threshold
      console.warn(`⚠️ SDK initialization took ${initTime.toFixed(1)}ms, consider optimization`);
    }
    
    return sdkInstance;
    
  } catch (error) {
    const initTime = performance.now() - startTime;
    console.error(`❌ MagicBlock SDK initialization failed in ${initTime.toFixed(1)}ms:`, error);
    throw new Error(`MagicBlock SDK initialization failed: ${error.message}`);
  }
}

/**
 * Setup event forwarding between components
 */
function setupEventForwarding(components: {
  sessionManager: RealSessionKeyManager;
  rollupClient: EphemeralRollupsClient;
  gaslessManager: GaslessTransactionManager;
  stateSync: StateSync;
  gameEngine: RollupGameEngine;
}): void {
  const { sessionManager, rollupClient, gaslessManager, stateSync, gameEngine } = components;
  
  // Forward game events to state sync for real-time tracking
  gameEngine.on('game:created', async (gameState) => {
    const playerAccounts = gameState.players.map(p => p.publicKey.toString());
    await stateSync.enableRealTimeSync([gameState.gameId, ...playerAccounts]);
  });
  
  gameEngine.on('action:executed', (transition) => {
    console.log(`🎯 Game action: ${transition.action.type} (${transition.executionTime}ms)`);
  });
  
  // Monitor performance across components
  const performanceMonitor = setInterval(() => {
    const sessionMetrics = sessionManager.getLatencyMetrics();
    const rollupMetrics = rollupClient.getMetrics();
    const gaslessMetrics = gaslessManager.getMetrics();
    const syncMetrics = stateSync.getSyncMetrics();
    const gameMetrics = gameEngine.getEngineMetrics();
    
    const avgLatencies = [
      sessionMetrics.create_session || 0,
      rollupMetrics.averageLatency || 0,
      gaslessMetrics.averageExecutionTime || 0,
      syncMetrics.avgSyncLatency || 0,
      gameMetrics.avgTransitionTime || 0
    ].filter(lat => lat > 0);
    
    const overallAvg = avgLatencies.length > 0 
      ? avgLatencies.reduce((sum, lat) => sum + lat, 0) / avgLatencies.length 
      : 0;
    
    if (overallAvg > 50) { // 50ms warning threshold
      console.warn(`⚠️ High latency detected: ${overallAvg.toFixed(1)}ms average`);
    }
  }, 30000); // Check every 30 seconds
  
  // Cleanup monitor on process exit
  process.on('beforeExit', () => {
    clearInterval(performanceMonitor);
  });
}

/**
 * Get MagicBlock SDK status
 */
async function getMagicBlockStatus(sdk: MagicBlockSDKInstance): Promise<MagicBlockStatus> {
  try {
    // Test connection latency
    const latencyStart = performance.now();
    await sdk.connection.getSlot('processed');
    const latency = performance.now() - latencyStart;
    
    // Check rollup health
    const rollupHealth = await sdk.rollupClient.healthCheck();
    
    const sessionCount = sdk.sessionManager.getActiveSessions().length;
    const activeGames = sdk.gameEngine.getActiveGames().length;
    
    // Calculate performance grade based on latency
    let performanceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (latency < 20) performanceGrade = 'A';
    else if (latency < 50) performanceGrade = 'B';
    else if (latency < 100) performanceGrade = 'C';
    else if (latency < 200) performanceGrade = 'D';
    else performanceGrade = 'F';
    
    return {
      connected: rollupHealth.rollupConnected,
      network: sdk.network,
      latency,
      rollupHealth: rollupHealth.status,
      sessionCount,
      activeGames,
      performanceGrade
    };
    
  } catch (error) {
    console.error('Failed to get MagicBlock status:', error);
    return {
      connected: false,
      network: sdk.network,
      latency: 999,
      rollupHealth: 'down',
      sessionCount: 0,
      activeGames: 0,
      performanceGrade: 'F'
    };
  }
}

/**
 * Get comprehensive MagicBlock metrics
 */
function getMagicBlockMetrics(sdk: MagicBlockSDKInstance): MagicBlockMetrics {
  const sessionLatencies = sdk.sessionManager.getLatencyMetrics();
  const rollupMetrics = sdk.rollupClient.getMetrics();
  const gaslessMetrics = sdk.gaslessManager.getMetrics();
  const vrfMetrics = sdk.vrfPlugin.getVRFMetrics();
  const gameMetrics = sdk.gameEngine.getEngineMetrics();
  
  return {
    sessions: {
      active: sdk.sessionManager.getActiveSessions().length,
      totalCreated: Object.keys(sessionLatencies).length,
      avgLatency: sessionLatencies.create_session || 0
    },
    rollups: {
      activeSessions: rollupMetrics.rollupUtilization * 10, // Estimate based on utilization
      avgTransitionTime: rollupMetrics.averageLatency,
      transactionsPerSecond: rollupMetrics.transactionsPerSecond
    },
    gasless: {
      totalTransactions: gaslessMetrics.totalTransactions,
      avgExecutionTime: gaslessMetrics.averageExecutionTime,
      gasSaved: gaslessMetrics.gaslessSavings,
      successRate: gaslessMetrics.successRate
    },
    vrf: {
      activeRequests: vrfMetrics.activeRequests,
      avgFulfillmentTime: vrfMetrics.avgFulfillmentTime,
      fulfillmentRate: vrfMetrics.fulfillmentRate
    },
    games: {
      activeGames: gameMetrics.activeGames,
      avgActionLatency: gameMetrics.avgTransitionTime,
      playersOnline: sdk.gameEngine.getActiveGames()
        .reduce((total, game) => total + game.players.length, 0)
    }
  };
}

// Export all components for direct access
export {
  RealSessionKeyManager,
  GaslessTransactionManager,
  StateSync,
  EphemeralRollupsClient,
  DevNetVRFPlugin,
  RollupGameEngine,
  createMagicBlockConnection,
  selectOptimalEndpoint,
  getMagicBlockPrograms,
  getEnvironmentConfig,
  MAGICBLOCK_DEVNET_CONFIG
};

// Export types
export type {
  MagicBlockSDKConfig,
  MagicBlockSDKInstance,
  MagicBlockStatus,
  MagicBlockMetrics
};

export default {
  initializeMagicBlockSDK,
  createMagicBlockConnection,
  MAGICBLOCK_DEVNET_CONFIG
};