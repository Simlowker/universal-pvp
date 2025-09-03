#!/usr/bin/env tsx

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as csv from 'csv-stringify/sync';

interface CostMetrics {
  computeUnits: number;
  lamports: number;
  timestamp: number;
  operation: string;
  priorityFee?: number;
  baseFee?: number;
  totalCost?: number;
  networkCongestion?: 'low' | 'medium' | 'high';
  success: boolean;
  simulationTime?: number;
}

interface DuelFlowCosts {
  gameInitialization: CostMetrics;
  playerJoin: CostMetrics;
  vrfGeneration: CostMetrics;
  gameExecution: CostMetrics;
  resultSubmission: CostMetrics;
  rewardDistribution: CostMetrics;
  gameFinalization: CostMetrics;
  totalCost: number;
  meetsTarget: boolean;
  exceedsMax: boolean;
}

class CostMeasurer {
  private connection: Connection;
  private metrics: CostMetrics[] = [];
  private duelFlowResults: DuelFlowCosts[] = [];
  private readonly TARGET_MIN_LAMPORTS = 50000; // 50k lamports
  private readonly TARGET_MAX_LAMPORTS = 100000; // 100k lamports
  private readonly BASE_FEE = 5000; // 5k lamports base
  private readonly PRIORITY_FEE_MIN = 5000; // 5k lamports min priority
  private readonly PRIORITY_FEE_MAX = 20000; // 20k lamports max priority

  constructor(rpcUrl: string = 'https://api.devnet.solana.com') {
    this.connection = new Connection(rpcUrl);
  }

  async measureTransactionCost(
    transaction: Transaction,
    operation: string
  ): Promise<CostMetrics> {
    const startTime = performance.now();
    
    try {
      // Simulate transaction to get cost
      const simulation = await this.connection.simulateTransaction(transaction);
      const simulationTime = performance.now() - startTime;
      
      if (simulation.value.err) {
        const failedMetrics: CostMetrics = {
          computeUnits: 0,
          lamports: 0,
          timestamp: Date.now(),
          operation,
          success: false,
          simulationTime
        };
        this.metrics.push(failedMetrics);
        throw new Error(`Simulation failed: ${simulation.value.err}`);
      }

      const computeUnits = simulation.value.unitsConsumed || 0;
      const networkCongestion = await this.detectNetworkCongestion();
      const priorityFee = this.calculatePriorityFee(networkCongestion);
      const baseFee = this.BASE_FEE;
      const totalCost = baseFee + priorityFee + (computeUnits * 0.000001 * LAMPORTS_PER_SOL);
      
      const metrics: CostMetrics = {
        computeUnits,
        lamports: totalCost,
        baseFee,
        priorityFee,
        totalCost,
        networkCongestion,
        timestamp: Date.now(),
        operation,
        success: true,
        simulationTime
      };

      this.metrics.push(metrics);
      return metrics;
    } catch (error) {
      console.error(`Failed to measure cost for ${operation}:`, error);
      throw error;
    }
  }

  private async detectNetworkCongestion(): Promise<'low' | 'medium' | 'high'> {
    try {
      const recentPriorityFees = await this.connection.getRecentPrioritizationFees();
      if (recentPriorityFees.length === 0) return 'low';
      
      const avgFee = recentPriorityFees.reduce((sum, fee) => sum + fee.prioritizationFee, 0) / recentPriorityFees.length;
      
      if (avgFee < 10000) return 'low';
      if (avgFee < 50000) return 'medium';
      return 'high';
    } catch {
      return 'medium'; // Default to medium if detection fails
    }
  }

  private calculatePriorityFee(congestion: 'low' | 'medium' | 'high'): number {
    switch (congestion) {
      case 'low': return this.PRIORITY_FEE_MIN;
      case 'medium': return Math.floor((this.PRIORITY_FEE_MIN + this.PRIORITY_FEE_MAX) / 2);
      case 'high': return this.PRIORITY_FEE_MAX;
    }
  }

  async simulateFullDuelFlow(): Promise<DuelFlowCosts> {
    console.log('\nSimulating full duel flow...');
    
    const duelFlow: Partial<DuelFlowCosts> = {};
    
    try {
      // Game Initialization
      const gameInitTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: PublicKey.default,
          newAccountPubkey: PublicKey.default,
          lamports: 1000000,
          space: 256,
          programId: PublicKey.default
        })
      );
      duelFlow.gameInitialization = await this.measureTransactionCost(gameInitTx, 'game_initialization');
      
      // Player Join
      const playerJoinTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: PublicKey.default,
          toPubkey: PublicKey.default,
          lamports: 10000
        })
      );
      duelFlow.playerJoin = await this.measureTransactionCost(playerJoinTx, 'player_join');
      
      // VRF Generation (simulated as compute-intensive operation)
      const vrfTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: PublicKey.default,
          newAccountPubkey: PublicKey.default,
          lamports: 2000000,
          space: 512,
          programId: PublicKey.default
        })
      );
      duelFlow.vrfGeneration = await this.measureTransactionCost(vrfTx, 'vrf_generation');
      
      // Game Execution
      const gameExecTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: PublicKey.default,
          toPubkey: PublicKey.default,
          lamports: 50000
        })
      );
      duelFlow.gameExecution = await this.measureTransactionCost(gameExecTx, 'game_execution');
      
      // Result Submission
      const resultTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: PublicKey.default,
          toPubkey: PublicKey.default,
          lamports: 5000
        })
      );
      duelFlow.resultSubmission = await this.measureTransactionCost(resultTx, 'result_submission');
      
      // Reward Distribution
      const rewardTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: PublicKey.default,
          toPubkey: PublicKey.default,
          lamports: 100000
        })
      );
      duelFlow.rewardDistribution = await this.measureTransactionCost(rewardTx, 'reward_distribution');
      
      // Game Finalization
      const finalizeTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: PublicKey.default,
          toPubkey: PublicKey.default,
          lamports: 1000
        })
      );
      duelFlow.gameFinalization = await this.measureTransactionCost(finalizeTx, 'game_finalization');
      
      // Calculate totals
      const totalCost = [
        duelFlow.gameInitialization!.lamports,
        duelFlow.playerJoin!.lamports,
        duelFlow.vrfGeneration!.lamports,
        duelFlow.gameExecution!.lamports,
        duelFlow.resultSubmission!.lamports,
        duelFlow.rewardDistribution!.lamports,
        duelFlow.gameFinalization!.lamports
      ].reduce((sum, cost) => sum + cost, 0);
      
      const result: DuelFlowCosts = {
        ...duelFlow as Required<Omit<DuelFlowCosts, 'totalCost' | 'meetsTarget' | 'exceedsMax'>>,
        totalCost,
        meetsTarget: totalCost >= this.TARGET_MIN_LAMPORTS && totalCost <= this.TARGET_MAX_LAMPORTS,
        exceedsMax: totalCost > this.TARGET_MAX_LAMPORTS
      };
      
      this.duelFlowResults.push(result);
      return result;
      
    } catch (error) {
      console.error('Failed to simulate duel flow:', error);
      throw error;
    }
  }

  generateReport(): void {
    if (this.metrics.length === 0) {
      console.log('No metrics collected');
      return;
    }

    console.log('\n=== COST ANALYSIS REPORT ===\n');
    
    const summary = this.metrics.reduce((acc, metric) => {
      const { operation, computeUnits, lamports } = metric;
      
      if (!acc[operation]) {
        acc[operation] = {
          count: 0,
          totalCompute: 0,
          totalLamports: 0,
          maxCompute: 0,
          minCompute: Infinity
        };
      }
      
      const op = acc[operation];
      op.count++;
      op.totalCompute += computeUnits;
      op.totalLamports += lamports;
      op.maxCompute = Math.max(op.maxCompute, computeUnits);
      op.minCompute = Math.min(op.minCompute, computeUnits);
      
      return acc;
    }, {} as Record<string, any>);

    Object.entries(summary).forEach(([operation, stats]) => {
      const avgCompute = Math.round(stats.totalCompute / stats.count);
      const avgLamports = Math.round(stats.totalLamports / stats.count);
      
      console.log(`${operation}:`);
      console.log(`  Transactions: ${stats.count}`);
      console.log(`  Avg Compute Units: ${avgCompute.toLocaleString()}`);
      console.log(`  Min/Max Compute: ${stats.minCompute}/${stats.maxCompute}`);
      console.log(`  Avg Cost: ${avgLamports} lamports (~$${(avgLamports * 0.000001).toFixed(6)})`);
      console.log('');
    });

    const totalCost = this.metrics.reduce((sum, m) => sum + m.lamports, 0);
    const totalCompute = this.metrics.reduce((sum, m) => sum + m.computeUnits, 0);
    
    console.log('TOTALS:');
    console.log(`  Total Transactions: ${this.metrics.length}`);
    console.log(`  Total Compute Units: ${totalCompute.toLocaleString()}`);
    console.log(`  Total Cost: ${totalCost} lamports (~$${(totalCost * 0.000001).toFixed(4)})`);
  }

  exportMetrics(filename?: string): void {
    const timestamp = Date.now();
    const data = {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      duelFlowResults: this.duelFlowResults,
      summary: this.generateSummary(),
      targets: {
        minLamports: this.TARGET_MIN_LAMPORTS,
        maxLamports: this.TARGET_MAX_LAMPORTS,
        baseFee: this.BASE_FEE,
        priorityFeeRange: [this.PRIORITY_FEE_MIN, this.PRIORITY_FEE_MAX]
      }
    };
    
    // Export JSON
    const jsonPath = filename || `cost-metrics-${timestamp}.json`;
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`Metrics exported to ${jsonPath}`);
    
    // Export CSV for analysis
    const csvPath = `cost-metrics-${timestamp}.csv`;
    const csvData = this.metrics.map(m => ({
      operation: m.operation,
      computeUnits: m.computeUnits,
      lamports: m.lamports,
      baseFee: m.baseFee || 0,
      priorityFee: m.priorityFee || 0,
      totalCost: m.totalCost || 0,
      networkCongestion: m.networkCongestion || 'unknown',
      success: m.success,
      simulationTime: m.simulationTime || 0,
      timestamp: new Date(m.timestamp).toISOString()
    }));
    
    fs.writeFileSync(csvPath, csv.stringify(csvData, { header: true }));
    console.log(`CSV data exported to ${csvPath}`);
  }

  generateDuelFlowAnalysis(): void {
    if (this.duelFlowResults.length === 0) {
      console.log('No duel flow results to analyze');
      return;
    }

    console.log('\n🎮 DUEL FLOW COST ANALYSIS');
    console.log('===========================');

    const results = this.duelFlowResults;
    const totalDuels = results.length;
    const successfulDuels = results.filter(r => r.meetsTarget).length;
    const exceedingDuels = results.filter(r => r.exceedsMax).length;
    
    console.log(`Total simulations: ${totalDuels}`);
    console.log(`Meeting target (50-100k): ${successfulDuels} (${(successfulDuels/totalDuels*100).toFixed(1)}%)`);
    console.log(`Exceeding max (>100k): ${exceedingDuels} (${(exceedingDuels/totalDuels*100).toFixed(1)}%)`);
    console.log();

    // Cost breakdown by operation
    const operations = ['gameInitialization', 'playerJoin', 'vrfGeneration', 
                       'gameExecution', 'resultSubmission', 'rewardDistribution', 'gameFinalization'];
    
    console.log('Average costs by operation:');
    operations.forEach(op => {
      const avgCost = results.reduce((sum, r) => sum + r[op as keyof DuelFlowCosts].lamports, 0) / totalDuels;
      const percentage = (avgCost / (results[0]?.totalCost || 1)) * 100;
      console.log(`  ${op.padEnd(20)}: ${Math.round(avgCost).toString().padStart(6)} lamports (${percentage.toFixed(1)}%)`);
    });

    // Cost statistics
    const costs = results.map(r => r.totalCost);
    costs.sort((a, b) => a - b);
    
    const min = costs[0];
    const max = costs[costs.length - 1];
    const median = costs[Math.floor(costs.length / 2)];
    const avg = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    
    console.log('\nCost distribution:');
    console.log(`  Minimum: ${min} lamports`);
    console.log(`  Maximum: ${max} lamports`);
    console.log(`  Average: ${Math.round(avg)} lamports`);
    console.log(`  Median:  ${median} lamports`);
    
    // Network congestion impact
    const congestionImpact = this.metrics.reduce((acc, m) => {
      if (!m.networkCongestion) return acc;
      if (!acc[m.networkCongestion]) acc[m.networkCongestion] = [];
      acc[m.networkCongestion].push(m.lamports);
      return acc;
    }, {} as Record<string, number[]>);
    
    console.log('\nNetwork congestion impact:');
    Object.entries(congestionImpact).forEach(([level, costs]) => {
      const avgCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
      console.log(`  ${level.padEnd(8)}: ${Math.round(avgCost)} lamports avg (${costs.length} samples)`);
    });
  }

  private generateSummary() {
    const successful = this.metrics.filter(m => m.success);
    const failed = this.metrics.filter(m => !m.success);
    
    return {
      totalTransactions: this.metrics.length,
      successfulTransactions: successful.length,
      failedTransactions: failed.length,
      successRate: this.metrics.length > 0 ? (successful.length / this.metrics.length * 100) : 0,
      totalComputeUnits: successful.reduce((sum, m) => sum + m.computeUnits, 0),
      totalLamports: successful.reduce((sum, m) => sum + m.lamports, 0),
      averageComputeUnits: successful.length > 0 
        ? Math.round(successful.reduce((sum, m) => sum + m.computeUnits, 0) / successful.length)
        : 0,
      averageLamports: successful.length > 0
        ? Math.round(successful.reduce((sum, m) => sum + m.lamports, 0) / successful.length)
        : 0,
      duelFlowStats: {
        totalDuels: this.duelFlowResults.length,
        successfulDuels: this.duelFlowResults.filter(r => r.meetsTarget).length,
        exceedingDuels: this.duelFlowResults.filter(r => r.exceedsMax).length
      }
    };
  }
}

// Main execution function
async function main() {
  const rpcUrl = process.argv[2] || 'https://api.devnet.solana.com';
  const iterations = parseInt(process.argv[3]) || 10;
  
  console.log('🎯 Solana PvP Duel Cost Measurement System');
  console.log('==========================================');
  console.log(`RPC URL: ${rpcUrl}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Target: ${50000}-${100000} lamports per duel`);
  console.log();
  
  const measurer = new CostMeasurer(rpcUrl);
  
  try {
    // Run multiple duel flow simulations
    console.log('Running duel flow simulations...');
    const results: DuelFlowCosts[] = [];
    
    for (let i = 0; i < iterations; i++) {
      console.log(`\n--- Simulation ${i + 1}/${iterations} ---`);
      const result = await measurer.simulateFullDuelFlow();
      results.push(result);
      
      console.log(`Total cost: ${result.totalCost} lamports`);
      console.log(`Meets target: ${result.meetsTarget ? '✅' : '❌'}`);
      console.log(`Exceeds max: ${result.exceedsMax ? '⚠️' : '✅'}`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Generate comprehensive report
    console.log('\n' + '='.repeat(50));
    measurer.generateReport();
    measurer.generateDuelFlowAnalysis();
    measurer.exportMetrics();
    
    // Summary statistics
    const successfulDuels = results.filter(r => r.meetsTarget).length;
    const exceedingDuels = results.filter(r => r.exceedsMax).length;
    const avgCost = results.reduce((sum, r) => sum + r.totalCost, 0) / results.length;
    
    console.log('\n📊 FINAL SUMMARY');
    console.log('================');
    console.log(`Successful duels (50-100k): ${successfulDuels}/${iterations} (${(successfulDuels/iterations*100).toFixed(1)}%)`);
    console.log(`Exceeding max (>100k): ${exceedingDuels}/${iterations} (${(exceedingDuels/iterations*100).toFixed(1)}%)`);
    console.log(`Average cost per duel: ${Math.round(avgCost)} lamports`);
    console.log(`Estimated USD cost: $${(avgCost * 0.000001 * 100).toFixed(6)} (assuming $100 SOL)`);
    
  } catch (error) {
    console.error('❌ Measurement failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { CostMeasurer };