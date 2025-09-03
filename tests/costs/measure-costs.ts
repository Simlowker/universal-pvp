/**
 * Cost Measurement and Validation System
 * Comprehensive testing of transaction costs with MagicBlock devnet
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BoltSDK, SessionKeyManager } from '@magicblock-labs/bolt-sdk';
import MagicBlockService, { GameAction, GameState } from '../../src/strategic-duel/services/MagicBlockService';

interface CostScenario {
  name: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  hasExistingSession: boolean;
  actionCount: number;
  expectedCostRange: {
    min: number; // lamports
    max: number; // lamports
  };
}

interface CostMeasurement {
  scenario: string;
  timestamp: Date;
  totalCost: number;
  breakdown: {
    sessionInit?: number;
    actions: number[];
    sessionClose?: number;
  };
  rentExempt: number;
  networkFees: number;
  gasFees: number;
  success: boolean;
  error?: string;
  performanceMetrics: {
    avgLatency: number;
    maxLatency: number;
    minLatency: number;
  };
}

export class CostMeasurementService {
  private connection: Connection;
  private magicBlockService: MagicBlockService;
  private gameProgram: PublicKey;
  private measurements: CostMeasurement[] = [];
  
  // Cost thresholds (in lamports)
  private readonly COST_THRESHOLDS = {
    SESSION_INIT_MAX: 50000,        // 0.05 SOL max for session init
    ACTION_MAX: 10000,              // 0.01 SOL max per action
    RENT_EXEMPT_ACCOUNT: 2039280,   // ~0.002 SOL for rent-exempt account
    TOTAL_GAME_MAX: 100000,         // 0.1 SOL max for complete game
    STRATEGIC_FOLD_REFUND: 0.5,     // 50% refund ratio
  };

  // Test scenarios covering all use cases
  private readonly SCENARIOS: CostScenario[] = [
    // New session scenarios
    {
      name: 'New Session - LOW Priority - Quick Game',
      priority: 'LOW',
      hasExistingSession: false,
      actionCount: 3,
      expectedCostRange: { min: 15000, max: 40000 }
    },
    {
      name: 'New Session - MEDIUM Priority - Standard Game',
      priority: 'MEDIUM',
      hasExistingSession: false,
      actionCount: 7,
      expectedCostRange: { min: 25000, max: 70000 }
    },
    {
      name: 'New Session - HIGH Priority - Extended Game',
      priority: 'HIGH',
      hasExistingSession: false,
      actionCount: 15,
      expectedCostRange: { min: 45000, max: 120000 }
    },
    
    // Existing session scenarios
    {
      name: 'Existing Session - LOW Priority',
      priority: 'LOW',
      hasExistingSession: true,
      actionCount: 5,
      expectedCostRange: { min: 8000, max: 25000 }
    },
    {
      name: 'Existing Session - MEDIUM Priority',
      priority: 'MEDIUM',
      hasExistingSession: true,
      actionCount: 10,
      expectedCostRange: { min: 15000, max: 45000 }
    },
    {
      name: 'Existing Session - HIGH Priority',
      priority: 'HIGH',
      hasExistingSession: true,
      actionCount: 20,
      expectedCostRange: { min: 30000, max: 80000 }
    },

    // Strategic fold scenarios
    {
      name: 'Strategic Fold - Early Game',
      priority: 'MEDIUM',
      hasExistingSession: true,
      actionCount: 2, // 1 raise + 1 strategic fold
      expectedCostRange: { min: 5000, max: 15000 }
    },
    {
      name: 'Strategic Fold - Mid Game',
      priority: 'HIGH',
      hasExistingSession: true,
      actionCount: 5, // Multiple actions + strategic fold
      expectedCostRange: { min: 12000, max: 30000 }
    },

    // Stress test scenarios
    {
      name: 'Maximum Actions - Endurance Test',
      priority: 'HIGH',
      hasExistingSession: false,
      actionCount: 50, // Maximum possible actions
      expectedCostRange: { min: 100000, max: 250000 }
    }
  ];

  constructor() {
    // Connect to MagicBlock devnet
    this.connection = new Connection(
      process.env.MAGICBLOCK_RPC_URL || 'https://devnet.magicblock.app',
      'confirmed'
    );
    
    this.gameProgram = new PublicKey(
      process.env.GAME_PROGRAM_ID || 'GameProgram1111111111111111111111111111111'
    );

    this.magicBlockService = new MagicBlockService(
      this.connection,
      this.gameProgram,
      process.env.EPHEMERAL_ROLLUP_ENDPOINT || 'ws://devnet-er.magicblock.app'
    );
  }

  /**
   * Run comprehensive cost analysis across all scenarios
   */
  async runCostAnalysis(): Promise<{
    summary: any;
    measurements: CostMeasurement[];
    recommendations: string[];
  }> {
    console.log('🔍 Starting comprehensive cost analysis...');
    console.log(`📊 Testing ${this.SCENARIOS.length} scenarios on MagicBlock devnet`);

    const results: CostMeasurement[] = [];
    const errors: string[] = [];

    for (const scenario of this.SCENARIOS) {
      try {
        console.log(`\n⚡ Testing: ${scenario.name}`);
        const measurement = await this.measureScenarioCost(scenario);
        results.push(measurement);
        
        console.log(`✅ Completed: ${measurement.totalCost} lamports (${(measurement.totalCost / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
      } catch (error) {
        console.error(`❌ Failed: ${scenario.name} - ${error.message}`);
        errors.push(`${scenario.name}: ${error.message}`);
      }
      
      // Small delay between scenarios to avoid rate limiting
      await this.delay(1000);
    }

    this.measurements = results;
    const summary = this.generateCostSummary(results, errors);
    const recommendations = this.generateRecommendations(results);

    return { summary, measurements: results, recommendations };
  }

  /**
   * Measure costs for a specific scenario
   */
  private async measureScenarioCost(scenario: CostScenario): Promise<CostMeasurement> {
    const startTime = Date.now();
    const playerWallet = Keypair.generate();
    const breakdown: any = { actions: [] };
    let sessionKey: Keypair | null = null;
    let gameStateAccount: PublicKey | null = null;
    const latencies: number[] = [];

    try {
      // Fund test wallet for devnet testing
      await this.fundTestWallet(playerWallet.publicKey);

      // Measure session initialization cost (if new session)
      if (!scenario.hasExistingSession) {
        const sessionStartTime = Date.now();
        const balanceBefore = await this.connection.getBalance(playerWallet.publicKey);
        
        const sessionResult = await this.magicBlockService.initializeSession(
          playerWallet.publicKey,
          3600 // 1 hour
        );
        
        sessionKey = sessionResult.sessionKey;
        const balanceAfter = await this.connection.getBalance(playerWallet.publicKey);
        breakdown.sessionInit = balanceBefore - balanceAfter;
        
        const sessionLatency = Date.now() - sessionStartTime;
        latencies.push(sessionLatency);
      } else {
        // Simulate existing session
        sessionKey = Keypair.generate();
      }

      // Create game state account for testing
      gameStateAccount = Keypair.generate().publicKey;

      // Execute game actions and measure individual costs
      for (let i = 0; i < scenario.actionCount; i++) {
        const actionStartTime = Date.now();
        const balanceBefore = await this.connection.getBalance(playerWallet.publicKey);

        const action = this.generateTestAction(i, scenario, playerWallet.publicKey.toString());
        
        try {
          await this.magicBlockService.executeAction(action, sessionKey!, gameStateAccount);
          
          const balanceAfter = await this.connection.getBalance(playerWallet.publicKey);
          const actionCost = balanceBefore - balanceAfter;
          breakdown.actions.push(actionCost);
          
          const actionLatency = Date.now() - actionStartTime;
          latencies.push(actionLatency);
          
        } catch (actionError) {
          console.warn(`Action ${i} failed: ${actionError.message}`);
          breakdown.actions.push(0); // No cost if action failed
        }

        // Small delay between actions
        await this.delay(100);
      }

      // Calculate total cost and performance metrics
      const totalCost = (breakdown.sessionInit || 0) + 
                       breakdown.actions.reduce((sum: number, cost: number) => sum + cost, 0);

      const performanceMetrics = {
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        maxLatency: Math.max(...latencies),
        minLatency: Math.min(...latencies)
      };

      // Validate against expected range
      const withinRange = totalCost >= scenario.expectedCostRange.min && 
                         totalCost <= scenario.expectedCostRange.max;

      return {
        scenario: scenario.name,
        timestamp: new Date(),
        totalCost,
        breakdown,
        rentExempt: await this.calculateRentExemption(),
        networkFees: this.estimateNetworkFees(scenario.actionCount),
        gasFees: this.estimateGasFees(scenario),
        success: withinRange,
        performanceMetrics,
        error: withinRange ? undefined : `Cost ${totalCost} outside expected range ${scenario.expectedCostRange.min}-${scenario.expectedCostRange.max}`
      };

    } catch (error) {
      return {
        scenario: scenario.name,
        timestamp: new Date(),
        totalCost: 0,
        breakdown,
        rentExempt: 0,
        networkFees: 0,
        gasFees: 0,
        success: false,
        error: error.message,
        performanceMetrics: { avgLatency: 0, maxLatency: 0, minLatency: 0 }
      };
    }
  }

  /**
   * Generate test action based on scenario and action index
   */
  private generateTestAction(index: number, scenario: CostScenario, playerId: string): GameAction {
    const actions = ['CHECK', 'RAISE', 'CALL', 'FOLD', 'STRATEGIC_FOLD'];
    
    // Strategic fold scenarios
    if (scenario.name.includes('Strategic Fold') && index === scenario.actionCount - 1) {
      return {
        type: 'STRATEGIC_FOLD',
        amount: 0,
        timestamp: Date.now(),
        sessionId: `test_session_${scenario.name}`,
        playerId
      };
    }
    
    // Priority-based action selection
    let actionType: 'CHECK' | 'RAISE' | 'CALL' | 'FOLD' | 'STRATEGIC_FOLD';
    let amount = 0;

    switch (scenario.priority) {
      case 'HIGH':
        actionType = index % 3 === 0 ? 'RAISE' : 'CALL';
        amount = actionType === 'RAISE' ? 10000 + (index * 5000) : 0;
        break;
      case 'MEDIUM':
        actionType = index % 4 === 0 ? 'RAISE' : (index % 4 === 1 ? 'CALL' : 'CHECK');
        amount = actionType === 'RAISE' ? 5000 + (index * 2000) : 0;
        break;
      default: // LOW
        actionType = index % 2 === 0 ? 'CHECK' : 'CALL';
        amount = 0;
    }

    return {
      type: actionType,
      amount,
      timestamp: Date.now(),
      sessionId: `test_session_${scenario.name}`,
      playerId
    };
  }

  /**
   * Generate cost analysis summary
   */
  private generateCostSummary(measurements: CostMeasurement[], errors: string[]): any {
    const successful = measurements.filter(m => m.success);
    const failed = measurements.filter(m => !m.success);

    const totalCosts = successful.map(m => m.totalCost);
    const avgCost = totalCosts.reduce((a, b) => a + b, 0) / totalCosts.length;
    const maxCost = Math.max(...totalCosts);
    const minCost = Math.min(...totalCosts);

    return {
      timestamp: new Date().toISOString(),
      summary: {
        totalScenarios: measurements.length,
        successful: successful.length,
        failed: failed.length,
        successRate: (successful.length / measurements.length) * 100,
      },
      costAnalysis: {
        averageCost: Math.round(avgCost),
        maxCost,
        minCost,
        costInSOL: {
          average: avgCost / LAMPORTS_PER_SOL,
          max: maxCost / LAMPORTS_PER_SOL,
          min: minCost / LAMPORTS_PER_SOL,
        }
      },
      performanceAnalysis: {
        avgLatency: Math.round(successful.reduce((sum, m) => sum + m.performanceMetrics.avgLatency, 0) / successful.length),
        maxLatency: Math.max(...successful.map(m => m.performanceMetrics.maxLatency)),
        thresholdCompliance: {
          sessionInit: successful.filter(m => (m.breakdown.sessionInit || 0) <= this.COST_THRESHOLDS.SESSION_INIT_MAX).length,
          actionCosts: successful.filter(m => Math.max(...(m.breakdown.actions || [0])) <= this.COST_THRESHOLDS.ACTION_MAX).length,
          totalGameCost: successful.filter(m => m.totalCost <= this.COST_THRESHOLDS.TOTAL_GAME_MAX).length,
        }
      },
      errors: errors,
      scenarios: successful.map(m => ({
        name: m.scenario,
        cost: m.totalCost,
        costSOL: m.totalCost / LAMPORTS_PER_SOL,
        withinBudget: m.totalCost <= this.COST_THRESHOLDS.TOTAL_GAME_MAX,
        avgLatency: m.performanceMetrics.avgLatency
      }))
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(measurements: CostMeasurement[]): string[] {
    const recommendations: string[] = [];
    const successful = measurements.filter(m => m.success);

    // Cost optimization recommendations
    const highCostScenarios = successful.filter(m => m.totalCost > this.COST_THRESHOLDS.TOTAL_GAME_MAX);
    if (highCostScenarios.length > 0) {
      recommendations.push(`🔴 ${highCostScenarios.length} scenarios exceed cost threshold. Consider transaction batching.`);
    }

    const highSessionInitCosts = successful.filter(m => (m.breakdown.sessionInit || 0) > this.COST_THRESHOLDS.SESSION_INIT_MAX);
    if (highSessionInitCosts.length > 0) {
      recommendations.push(`🟡 Session initialization costs high in ${highSessionInitCosts.length} scenarios. Optimize session setup.`);
    }

    // Performance recommendations
    const highLatencyScenarios = successful.filter(m => m.performanceMetrics.avgLatency > 100);
    if (highLatencyScenarios.length > 0) {
      recommendations.push(`⚡ ${highLatencyScenarios.length} scenarios have high latency. Consider RPC optimization.`);
    }

    // Success rate recommendations
    const successRate = successful.length / measurements.length;
    if (successRate < 0.9) {
      recommendations.push(`🚨 Success rate ${(successRate * 100).toFixed(1)}% below 90%. Investigate error patterns.`);
    }

    // Positive recommendations
    const lowCostScenarios = successful.filter(m => m.totalCost < this.COST_THRESHOLDS.TOTAL_GAME_MAX * 0.5);
    if (lowCostScenarios.length > 0) {
      recommendations.push(`✅ ${lowCostScenarios.length} scenarios are highly cost-efficient.`);
    }

    if (recommendations.length === 0) {
      recommendations.push(`🎉 All cost targets met! System is optimally configured.`);
    }

    return recommendations;
  }

  /**
   * Fund test wallet for devnet testing
   */
  private async fundTestWallet(wallet: PublicKey): Promise<void> {
    try {
      const balance = await this.connection.getBalance(wallet);
      if (balance < LAMPORTS_PER_SOL * 0.1) { // Less than 0.1 SOL
        // In a real implementation, you'd request an airdrop or use a funded wallet
        console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      }
    } catch (error) {
      console.warn(`Failed to check wallet balance: ${error.message}`);
    }
  }

  /**
   * Calculate rent exemption costs
   */
  private async calculateRentExemption(): Promise<number> {
    try {
      return await this.connection.getMinimumBalanceForRentExemption(1000); // Estimated account size
    } catch {
      return this.COST_THRESHOLDS.RENT_EXEMPT_ACCOUNT;
    }
  }

  /**
   * Estimate network fees based on action count
   */
  private estimateNetworkFees(actionCount: number): number {
    return actionCount * 5000; // 5000 lamports per transaction (estimated)
  }

  /**
   * Estimate gas fees for priority levels
   */
  private estimateGasFees(scenario: CostScenario): number {
    const baseFee = 5000;
    const priorityMultipliers = { LOW: 1, MEDIUM: 1.5, HIGH: 2.5 };
    return baseFee * priorityMultipliers[scenario.priority] * scenario.actionCount;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Daily cost validation for CRON monitoring
   */
  async dailyCostValidation(): Promise<{
    status: 'PASS' | 'WARN' | 'FAIL';
    summary: any;
    alerts: string[];
  }> {
    console.log('📅 Running daily cost validation...');
    
    const { summary, measurements, recommendations } = await this.runCostAnalysis();
    const alerts: string[] = [];
    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';

    // Check critical thresholds
    if (summary.costAnalysis.averageCost > this.COST_THRESHOLDS.TOTAL_GAME_MAX) {
      alerts.push(`🚨 CRITICAL: Average cost ${summary.costAnalysis.averageCost} exceeds threshold`);
      status = 'FAIL';
    }

    if (summary.summary.successRate < 90) {
      alerts.push(`⚠️ WARNING: Success rate ${summary.summary.successRate}% below 90%`);
      if (status === 'PASS') status = 'WARN';
    }

    if (summary.performanceAnalysis.avgLatency > 100) {
      alerts.push(`⚠️ WARNING: Average latency ${summary.performanceAnalysis.avgLatency}ms exceeds 100ms`);
      if (status === 'PASS') status = 'WARN';
    }

    // Log results for monitoring
    console.log(`\n📊 DAILY COST VALIDATION COMPLETE`);
    console.log(`Status: ${status}`);
    console.log(`Average Cost: ${summary.costAnalysis.averageCost} lamports`);
    console.log(`Success Rate: ${summary.summary.successRate}%`);
    console.log(`Recommendations: ${recommendations.length}`);

    return { status, summary, alerts };
  }

  /**
   * Export results for monitoring integration
   */
  exportResults(format: 'json' | 'prometheus' | 'csv' = 'json'): string {
    switch (format) {
      case 'prometheus':
        return this.exportPrometheusMetrics();
      case 'csv':
        return this.exportCsvResults();
      default:
        return JSON.stringify(this.measurements, null, 2);
    }
  }

  private exportPrometheusMetrics(): string {
    const successful = this.measurements.filter(m => m.success);
    const avgCost = successful.reduce((sum, m) => sum + m.totalCost, 0) / successful.length;
    const avgLatency = successful.reduce((sum, m) => sum + m.performanceMetrics.avgLatency, 0) / successful.length;

    return `
# HELP strategic_duel_transaction_cost_lamports Average transaction cost in lamports
# TYPE strategic_duel_transaction_cost_lamports gauge
strategic_duel_transaction_cost_lamports ${avgCost || 0}

# HELP strategic_duel_action_latency_ms Average action latency in milliseconds
# TYPE strategic_duel_action_latency_ms gauge
strategic_duel_action_latency_ms ${avgLatency || 0}

# HELP strategic_duel_success_rate Success rate of cost measurements
# TYPE strategic_duel_success_rate gauge
strategic_duel_success_rate ${successful.length / this.measurements.length}

# HELP strategic_duel_cost_threshold_compliance Compliance with cost thresholds
# TYPE strategic_duel_cost_threshold_compliance gauge
strategic_duel_cost_threshold_compliance ${successful.filter(m => m.totalCost <= this.COST_THRESHOLDS.TOTAL_GAME_MAX).length / successful.length}
    `.trim();
  }

  private exportCsvResults(): string {
    const headers = 'Scenario,Timestamp,Total Cost,Success,Average Latency,Max Latency,Error\n';
    const rows = this.measurements.map(m => 
      `"${m.scenario}","${m.timestamp.toISOString()}",${m.totalCost},${m.success},${m.performanceMetrics.avgLatency},${m.performanceMetrics.maxLatency},"${m.error || ''}"`
    ).join('\n');
    
    return headers + rows;
  }
}

// CLI interface for running cost analysis
if (require.main === module) {
  const costService = new CostMeasurementService();
  
  async function runAnalysis() {
    try {
      const { summary, recommendations } = await costService.runCostAnalysis();
      
      console.log('\n📋 COST ANALYSIS COMPLETE');
      console.log('=' .repeat(50));
      console.log(JSON.stringify(summary, null, 2));
      console.log('\n💡 RECOMMENDATIONS:');
      recommendations.forEach(rec => console.log(rec));
      
    } catch (error) {
      console.error('❌ Cost analysis failed:', error.message);
      process.exit(1);
    }
  }

  // Support command line arguments
  const command = process.argv[2];
  
  switch (command) {
    case 'daily':
      costService.dailyCostValidation().then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.status === 'FAIL' ? 1 : 0);
      });
      break;
    case 'export':
      const format = process.argv[3] as 'json' | 'prometheus' | 'csv' || 'json';
      runAnalysis().then(() => {
        console.log(costService.exportResults(format));
      });
      break;
    default:
      runAnalysis();
  }
}

export default CostMeasurementService;