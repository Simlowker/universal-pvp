/**
 * DevNet Integration Validator
 * Validates real MagicBlock devnet functionality and performance
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import {
  initializeMagicBlockSDK,
  MagicBlockSDKInstance,
  createMagicBlockConnection,
  selectOptimalEndpoint,
  checkMagicBlockHealth
} from '../index';

export interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  latency?: number;
  error?: string;
  details?: any;
}

export interface DevNetValidationSummary {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  totalTests: number;
  passedTests: number;
  avgLatency: number;
  maxLatency: number;
  results: ValidationResult[];
  recommendations: string[];
}

/**
 * Comprehensive DevNet validation suite
 */
export class DevNetValidator {
  private sdk: MagicBlockSDKInstance | null = null;
  private connection: Connection | null = null;
  private authority: Keypair;
  private results: ValidationResult[] = [];
  
  constructor(authority?: Keypair) {
    this.authority = authority || Keypair.generate();
  }

  /**
   * Run complete DevNet validation suite
   */
  async runCompleteValidation(): Promise<DevNetValidationSummary> {
    console.log('🧪 Starting comprehensive DevNet validation...');
    this.results = [];
    
    try {
      // Phase 1: Connection and Endpoint Validation
      await this.validateConnections();
      
      // Phase 2: SDK Initialization
      await this.validateSDKInitialization();
      
      if (this.sdk) {
        // Phase 3: Core Components
        await this.validateSessionManagement();
        await this.validateRollupIntegration();
        await this.validateGaslessTransactions();
        await this.validateStateSync();
        await this.validateVRFIntegration();
        
        // Phase 4: Game Engine
        await this.validateGameEngine();
        
        // Phase 5: Performance Tests
        await this.validatePerformance();
        
        // Phase 6: Stress Tests
        await this.validateStressTests();
      }
      
    } catch (error) {
      this.addResult('validation', 'complete_suite', false, undefined, error.message);
    } finally {
      if (this.sdk) {
        await this.sdk.cleanup();
      }
    }
    
    return this.generateSummary();
  }

  /**
   * Validate connections and endpoints
   */
  private async validateConnections(): Promise<void> {
    console.log('🔗 Validating connections...');
    
    // Test optimal endpoint selection
    try {
      const start = performance.now();
      const optimal = await selectOptimalEndpoint('devnet');
      const latency = performance.now() - start;
      
      this.connection = optimal.connection;
      this.addResult('connection', 'optimal_endpoint', true, latency, undefined, {
        network: optimal.network,
        endpoints: optimal.endpoints
      });
    } catch (error) {
      this.addResult('connection', 'optimal_endpoint', false, undefined, error.message);
    }
    
    // Test health check
    try {
      const start = performance.now();
      const health = await checkMagicBlockHealth('devnet');
      const latency = performance.now() - start;
      
      const healthy = health.rpc.status !== 'down' && 
                     health.rollup.status !== 'down' && 
                     health.router.status !== 'down';
      
      this.addResult('connection', 'health_check', healthy, latency, undefined, health);
    } catch (error) {
      this.addResult('connection', 'health_check', false, undefined, error.message);
    }
    
    // Test direct connection
    if (this.connection) {
      try {
        const start = performance.now();
        await this.connection.getSlot('processed');
        const latency = performance.now() - start;
        
        this.addResult('connection', 'rpc_connectivity', true, latency);
      } catch (error) {
        this.addResult('connection', 'rpc_connectivity', false, undefined, error.message);
      }
    }
  }

  /**
   * Validate SDK initialization
   */
  private async validateSDKInitialization(): Promise<void> {
    console.log('⚡ Validating SDK initialization...');
    
    try {
      const start = performance.now();
      
      this.sdk = await initializeMagicBlockSDK({
        network: 'devnet',
        authority: this.authority,
        enableVRF: true,
        enableRollups: true,
        enableGasless: true,
        maxLatencyMs: 30,
        autoOptimize: true
      });
      
      const latency = performance.now() - start;
      this.addResult('sdk', 'initialization', true, latency);
      
      // Test SDK status
      const status = await this.sdk.getStatus();
      this.addResult('sdk', 'status_check', status.connected, undefined, undefined, status);
      
      // Test SDK metrics
      const metrics = this.sdk.getMetrics();
      this.addResult('sdk', 'metrics_collection', true, undefined, undefined, metrics);
      
    } catch (error) {
      this.addResult('sdk', 'initialization', false, undefined, error.message);
    }
  }

  /**
   * Validate session management
   */
  private async validateSessionManagement(): Promise<void> {
    console.log('🔐 Validating session management...');
    
    if (!this.sdk) return;
    
    // Test session creation
    try {
      const start = performance.now();
      const session = await this.sdk.sessionManager.createSession(this.authority, {
        validUntil: Date.now() / 1000 + 3600,
        permissions: [{
          programId: this.sdk.programs.bolt,
          instruction: '*'
        }],
        gaslessEnabled: true
      });
      const latency = performance.now() - start;
      
      this.addResult('sessions', 'creation', true, latency, undefined, {
        sessionId: session.sessionKey.publicKey.toString()
      });
      
      // Test session validation
      const isValid = this.sdk.sessionManager.isSessionValid(
        session.sessionKey.publicKey.toString()
      );
      this.addResult('sessions', 'validation', isValid);
      
    } catch (error) {
      this.addResult('sessions', 'creation', false, undefined, error.message);
    }
    
    // Test PvP session creation
    try {
      const start = performance.now();
      const pvpSession = await this.sdk.sessionManager.createPvPSession(
        this.authority,
        this.sdk.programs.bolt,
        new BN(1000000)
      );
      const latency = performance.now() - start;
      
      this.addResult('sessions', 'pvp_creation', true, latency);
    } catch (error) {
      this.addResult('sessions', 'pvp_creation', false, undefined, error.message);
    }
  }

  /**
   * Validate rollup integration
   */
  private async validateRollupIntegration(): Promise<void> {
    console.log('🚀 Validating rollup integration...');
    
    if (!this.sdk) return;
    
    // Test rollup session creation
    try {
      const start = performance.now();
      const rollupSession = await this.sdk.rollupClient.createRollupSession(this.authority, {
        computeBudget: 1_000_000,
        lifetimeMs: 3600000,
        autoCommit: true,
        tickRateMs: 50
      });
      const latency = performance.now() - start;
      
      this.addResult('rollups', 'session_creation', true, latency, undefined, {
        sessionId: rollupSession.id
      });
      
      // Test rollup health
      const health = await this.sdk.rollupClient.healthCheck();
      this.addResult('rollups', 'health_check', health.status === 'healthy', undefined, undefined, health);
      
    } catch (error) {
      this.addResult('rollups', 'session_creation', false, undefined, error.message);
    }
  }

  /**
   * Validate gasless transactions
   */
  private async validateGaslessTransactions(): Promise<void> {
    console.log('💸 Validating gasless transactions...');
    
    if (!this.sdk) return;
    
    try {
      // Create test transaction
      const testTx = new (require('@solana/web3.js').Transaction)();
      const { blockhash } = await this.sdk.connection.getRecentBlockhash();
      testTx.recentBlockhash = blockhash;
      testTx.feePayer = this.authority.publicKey;
      
      // Queue gasless transaction
      const start = performance.now();
      const txId = await this.sdk.gaslessManager.queueGaslessTransaction(
        testTx,
        'test_session',
        this.sdk.programs.bolt,
        'test_instruction'
      );
      const latency = performance.now() - start;
      
      this.addResult('gasless', 'transaction_queue', true, latency, undefined, { txId });
      
      // Check queue metrics
      const metrics = this.sdk.gaslessManager.getMetrics();
      this.addResult('gasless', 'metrics', true, undefined, undefined, metrics);
      
    } catch (error) {
      this.addResult('gasless', 'transaction_queue', false, undefined, error.message);
    }
  }

  /**
   * Validate state synchronization
   */
  private async validateStateSync(): Promise<void> {
    console.log('🔄 Validating state synchronization...');
    
    if (!this.sdk) return;
    
    try {
      const testAccount = Keypair.generate().publicKey;
      
      const start = performance.now();
      await this.sdk.stateSync.trackAccount(testAccount);
      const latency = performance.now() - start;
      
      this.addResult('state_sync', 'account_tracking', true, latency);
      
      // Test sync metrics
      const metrics = this.sdk.stateSync.getSyncMetrics();
      this.addResult('state_sync', 'metrics', true, undefined, undefined, metrics);
      
    } catch (error) {
      this.addResult('state_sync', 'account_tracking', false, undefined, error.message);
    }
  }

  /**
   * Validate VRF integration
   */
  private async validateVRFIntegration(): Promise<void> {
    console.log('🎲 Validating VRF integration...');
    
    if (!this.sdk) return;
    
    try {
      // Test instant devnet random
      const start = performance.now();
      const vrfResult = await this.sdk.vrfPlugin.getInstantDevnetRandom(
        Keypair.generate().publicKey
      );
      const latency = performance.now() - start;
      
      this.addResult('vrf', 'instant_random', true, latency, undefined, {
        randomValue: vrfResult.randomValue.toString(),
        verified: this.sdk.vrfPlugin.verifyVRFProof(vrfResult)
      });
      
      // Test VRF metrics
      const metrics = this.sdk.vrfPlugin.getVRFMetrics();
      this.addResult('vrf', 'metrics', true, undefined, undefined, metrics);
      
    } catch (error) {
      this.addResult('vrf', 'instant_random', false, undefined, error.message);
    }
  }

  /**
   * Validate game engine
   */
  private async validateGameEngine(): Promise<void> {
    console.log('🎮 Validating game engine...');
    
    if (!this.sdk) return;
    
    try {
      const gameId = `validation_${Date.now()}`;
      
      // Test game creation
      const start = performance.now();
      const gameState = await this.sdk.gameEngine.createGame(gameId, this.authority.publicKey, {
        maxPlayers: 2,
        minBet: new BN(1000000),
        enableVRF: false // Disable for faster testing
      });
      const latency = performance.now() - start;
      
      this.addResult('game_engine', 'game_creation', true, latency, undefined, {
        gameId: gameState.gameId
      });
      
      // Test game metrics
      const metrics = this.sdk.gameEngine.getEngineMetrics();
      this.addResult('game_engine', 'metrics', true, undefined, undefined, metrics);
      
    } catch (error) {
      this.addResult('game_engine', 'game_creation', false, undefined, error.message);
    }
  }

  /**
   * Validate performance requirements
   */
  private async validatePerformance(): Promise<void> {
    console.log('⚡ Validating performance requirements...');
    
    if (!this.sdk) return;
    
    // Test latency requirements
    const latencyTests = [];
    
    for (let i = 0; i < 5; i++) {
      try {
        const start = performance.now();
        await this.sdk.connection.getSlot('processed');
        const latency = performance.now() - start;
        latencyTests.push(latency);
      } catch (error) {
        // Skip failed tests
      }
    }
    
    if (latencyTests.length > 0) {
      const avgLatency = latencyTests.reduce((sum, lat) => sum + lat, 0) / latencyTests.length;
      const maxLatency = Math.max(...latencyTests);
      
      this.addResult('performance', 'rpc_latency', avgLatency < 100, avgLatency, undefined, {
        average: avgLatency,
        maximum: maxLatency,
        samples: latencyTests.length
      });
    }
    
    // Test overall performance grade
    const status = await this.sdk.getStatus();
    this.addResult('performance', 'performance_grade', 
      ['A', 'B', 'C'].includes(status.performanceGrade), 
      status.latency, undefined, {
        grade: status.performanceGrade
      }
    );
  }

  /**
   * Validate stress test scenarios
   */
  private async validateStressTests(): Promise<void> {
    console.log('💪 Running stress tests...');
    
    if (!this.sdk) return;
    
    // Concurrent session creation
    try {
      const concurrentSessions = 5;
      const sessionPromises = [];
      
      const start = performance.now();
      
      for (let i = 0; i < concurrentSessions; i++) {
        const player = Keypair.generate();
        sessionPromises.push(
          this.sdk.sessionManager.createSession(player, {
            validUntil: Date.now() / 1000 + 3600,
            permissions: [{
              programId: this.sdk.programs.bolt,
              instruction: '*'
            }],
            gaslessEnabled: true
          })
        );
      }
      
      const results = await Promise.allSettled(sessionPromises);
      const latency = performance.now() - start;
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const avgLatency = latency / concurrentSessions;
      
      this.addResult('stress', 'concurrent_sessions', 
        successful === concurrentSessions, 
        avgLatency, 
        undefined, 
        { successful, total: concurrentSessions }
      );
      
    } catch (error) {
      this.addResult('stress', 'concurrent_sessions', false, undefined, error.message);
    }
  }

  /**
   * Add validation result
   */
  private addResult(
    category: string,
    test: string,
    passed: boolean,
    latency?: number,
    error?: string,
    details?: any
  ): void {
    this.results.push({
      category,
      test,
      passed,
      latency,
      error,
      details
    });
    
    const status = passed ? '✅' : '❌';
    const latencyStr = latency ? ` (${latency.toFixed(1)}ms)` : '';
    console.log(`  ${status} ${category}:${test}${latencyStr}`);
    
    if (!passed && error) {
      console.log(`    Error: ${error}`);
    }
  }

  /**
   * Generate validation summary
   */
  private generateSummary(): DevNetValidationSummary {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const latencies = this.results.filter(r => r.latency).map(r => r.latency!);
    const avgLatency = latencies.length > 0 
      ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
      : 0;
    const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    
    // Determine overall health
    const passRate = passedTests / totalTests;
    let overallHealth: 'healthy' | 'degraded' | 'critical';
    
    if (passRate >= 0.9 && avgLatency < 100) {
      overallHealth = 'healthy';
    } else if (passRate >= 0.7 && avgLatency < 200) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'critical';
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (avgLatency > 100) {
      recommendations.push('Consider using a faster RPC endpoint or optimizing network connection');
    }
    
    if (passRate < 0.8) {
      recommendations.push('Review failed test cases and address underlying issues');
    }
    
    const failedCategories = [...new Set(
      this.results.filter(r => !r.passed).map(r => r.category)
    )];
    
    if (failedCategories.length > 0) {
      recommendations.push(`Focus on improving: ${failedCategories.join(', ')}`);
    }
    
    if (maxLatency > 500) {
      recommendations.push('Investigate high-latency operations for optimization opportunities');
    }
    
    return {
      overallHealth,
      totalTests,
      passedTests,
      avgLatency,
      maxLatency,
      results: this.results,
      recommendations
    };
  }
}

/**
 * Quick validation for CI/CD
 */
export async function quickValidation(): Promise<boolean> {
  console.log('🚀 Running quick DevNet validation...');
  
  const validator = new DevNetValidator();
  
  try {
    // Test basic connectivity
    const health = await checkMagicBlockHealth('devnet');
    const basicConnectivity = health.rpc.status !== 'down';
    
    if (!basicConnectivity) {
      console.log('❌ Basic connectivity failed');
      return false;
    }
    
    // Test SDK initialization
    const sdk = await initializeMagicBlockSDK({
      network: 'devnet',
      enableVRF: false,
      enableRollups: false,
      maxLatencyMs: 100
    });
    
    const status = await sdk.getStatus();
    const initialized = status.connected && status.performanceGrade !== 'F';
    
    await sdk.cleanup();
    
    if (!initialized) {
      console.log('❌ SDK initialization failed');
      return false;
    }
    
    console.log('✅ Quick validation passed');
    return true;
    
  } catch (error) {
    console.log('❌ Quick validation failed:', error.message);
    return false;
  }
}

export default DevNetValidator;