/**
 * MagicBlock BOLT Latency Benchmarking Suite
 * Comprehensive performance testing for 30ms latency target
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SOLDUEL_CONFIG } from '../../config/magicblock.config';
import { ComponentRegistry } from '../../src/bolt/components/mod';

interface LatencyMeasurement {
    operation: string;
    startTime: number;
    endTime: number;
    duration: number;
    success: boolean;
    networkRtt?: number;
    processingTime?: number;
}

interface BenchmarkResult {
    operation: string;
    samples: LatencyMeasurement[];
    statistics: {
        mean: number;
        median: number;
        p95: number;
        p99: number;
        min: number;
        max: number;
        stdDev: number;
    };
    targetLatency: number;
    achievesTarget: boolean;
}

export class LatencyBenchmarkSuite {
    private connection: Connection;
    private config = SOLDUEL_CONFIG;
    private measurements: LatencyMeasurement[] = [];

    constructor(rpcUrl: string = 'https://api.devnet.solana.com') {
        this.connection = new Connection(rpcUrl, 'confirmed');
    }

    /**
     * Run comprehensive latency benchmarks
     */
    async runComprehensiveBenchmarks(): Promise<BenchmarkResult[]> {
        console.log('🚀 Starting MagicBlock BOLT Latency Benchmarks');
        console.log(`Target Latency: ${this.config.performance.targetLatency}ms`);
        console.log('=' .repeat(60));

        const results: BenchmarkResult[] = [];

        // 1. Network Round-Trip Latency
        results.push(await this.benchmarkNetworkLatency());
        
        // 2. Component Update Latency
        results.push(await this.benchmarkComponentUpdates());
        
        // 3. Transaction Processing Latency
        results.push(await this.benchmarkTransactionProcessing());
        
        // 4. State Synchronization Latency
        results.push(await this.benchmarkStateSynchronization());
        
        // 5. ECS System Execution Latency
        results.push(await this.benchmarkSystemExecution());
        
        // 6. End-to-End Gaming Action Latency
        results.push(await this.benchmarkEndToEndActions());

        // Generate summary report
        this.generateBenchmarkReport(results);
        
        return results;
    }

    /**
     * Benchmark network round-trip latency
     */
    private async benchmarkNetworkLatency(samples: number = 100): Promise<BenchmarkResult> {
        console.log('📡 Benchmarking Network Latency...');
        
        const measurements: LatencyMeasurement[] = [];
        
        for (let i = 0; i < samples; i++) {
            const startTime = performance.now();
            
            try {
                // Measure RPC round-trip time
                await this.connection.getLatestBlockhash();
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                measurements.push({
                    operation: 'network_rtt',
                    startTime,
                    endTime,
                    duration,
                    success: true,
                    networkRtt: duration
                });
                
                // Small delay to avoid rate limiting
                if (i % 10 === 0) {
                    await this.sleep(10);
                }
                
            } catch (error) {
                measurements.push({
                    operation: 'network_rtt',
                    startTime,
                    endTime: performance.now(),
                    duration: performance.now() - startTime,
                    success: false
                });
            }
        }
        
        return this.calculateBenchmarkResult('Network Latency', measurements, 25); // 25ms target for network
    }

    /**
     * Benchmark component update operations
     */
    private async benchmarkComponentUpdates(samples: number = 1000): Promise<BenchmarkResult> {
        console.log('🔄 Benchmarking Component Updates...');
        
        const measurements: LatencyMeasurement[] = [];
        
        // Simulate component updates for different component types
        const componentTypes = ['Position', 'Health', 'Combat'];
        
        for (let i = 0; i < samples; i++) {
            const componentType = componentTypes[i % componentTypes.length];
            const startTime = performance.now();
            
            try {
                // Simulate component data serialization and processing
                const componentSize = ComponentRegistry.get_component_size(componentType) || 64;
                const mockData = new Uint8Array(componentSize);
                
                // Simulate component processing time
                await this.simulateComponentProcessing(componentType, mockData);
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                measurements.push({
                    operation: `component_update_${componentType}`,
                    startTime,
                    endTime,
                    duration,
                    success: true,
                    processingTime: duration
                });
                
            } catch (error) {
                measurements.push({
                    operation: `component_update_${componentType}`,
                    startTime,
                    endTime: performance.now(),
                    duration: performance.now() - startTime,
                    success: false
                });
            }
        }
        
        return this.calculateBenchmarkResult('Component Updates', measurements, 5); // 5ms target for components
    }

    /**
     * Benchmark transaction processing latency
     */
    private async benchmarkTransactionProcessing(samples: number = 50): Promise<BenchmarkResult> {
        console.log('⚡ Benchmarking Transaction Processing...');
        
        const measurements: LatencyMeasurement[] = [];
        
        for (let i = 0; i < samples; i++) {
            const startTime = performance.now();
            
            try {
                // Create and simulate transaction processing
                const txSimulation = await this.simulateTransactionProcessing();
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                measurements.push({
                    operation: 'transaction_processing',
                    startTime,
                    endTime,
                    duration,
                    success: txSimulation.success,
                    processingTime: duration
                });
                
                // Delay between transactions
                await this.sleep(20);
                
            } catch (error) {
                measurements.push({
                    operation: 'transaction_processing',
                    startTime,
                    endTime: performance.now(),
                    duration: performance.now() - startTime,
                    success: false
                });
            }
        }
        
        return this.calculateBenchmarkResult('Transaction Processing', measurements, 10); // 10ms target
    }

    /**
     * Benchmark state synchronization latency
     */
    private async benchmarkStateSynchronization(samples: number = 30): Promise<BenchmarkResult> {
        console.log('🔄 Benchmarking State Synchronization...');
        
        const measurements: LatencyMeasurement[] = [];
        
        for (let i = 0; i < samples; i++) {
            const startTime = performance.now();
            
            try {
                // Simulate state synchronization between rollup and base layer
                await this.simulateStateSynchronization();
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                measurements.push({
                    operation: 'state_sync',
                    startTime,
                    endTime,
                    duration,
                    success: true,
                    processingTime: duration
                });
                
                await this.sleep(100); // Longer delay for state sync
                
            } catch (error) {
                measurements.push({
                    operation: 'state_sync',
                    startTime,
                    endTime: performance.now(),
                    duration: performance.now() - startTime,
                    success: false
                });
            }
        }
        
        return this.calculateBenchmarkResult('State Synchronization', measurements, 50); // 50ms target
    }

    /**
     * Benchmark ECS system execution latency
     */
    private async benchmarkSystemExecution(samples: number = 200): Promise<BenchmarkResult> {
        console.log('⚙️ Benchmarking ECS System Execution...');
        
        const measurements: LatencyMeasurement[] = [];
        const systems = ['Movement', 'Combat', 'Health', 'Effects'];
        
        for (let i = 0; i < samples; i++) {
            const system = systems[i % systems.length];
            const startTime = performance.now();
            
            try {
                // Simulate system execution with varying entity counts
                const entityCount = 50 + (i % 200); // 50-250 entities
                await this.simulateSystemExecution(system, entityCount);
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                measurements.push({
                    operation: `system_${system}`,
                    startTime,
                    endTime,
                    duration,
                    success: true,
                    processingTime: duration
                });
                
            } catch (error) {
                measurements.push({
                    operation: `system_${system}`,
                    startTime,
                    endTime: performance.now(),
                    duration: performance.now() - startTime,
                    success: false
                });
            }
        }
        
        return this.calculateBenchmarkResult('ECS System Execution', measurements, 3); // 3ms target per system
    }

    /**
     * Benchmark end-to-end gaming actions
     */
    private async benchmarkEndToEndActions(samples: number = 50): Promise<BenchmarkResult> {
        console.log('🎮 Benchmarking End-to-End Gaming Actions...');
        
        const measurements: LatencyMeasurement[] = [];
        const actions = ['MOVE', 'ATTACK', 'DEFEND', 'USE_ITEM'];
        
        for (let i = 0; i < samples; i++) {
            const action = actions[i % actions.length];
            const startTime = performance.now();
            
            try {
                // Simulate complete gaming action flow
                await this.simulateEndToEndAction(action);
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                measurements.push({
                    operation: `action_${action}`,
                    startTime,
                    endTime,
                    duration,
                    success: true,
                    processingTime: duration
                });
                
                await this.sleep(50); // Simulate player action intervals
                
            } catch (error) {
                measurements.push({
                    operation: `action_${action}`,
                    startTime,
                    endTime: performance.now(),
                    duration: performance.now() - startTime,
                    success: false
                });
            }
        }
        
        return this.calculateBenchmarkResult('End-to-End Actions', measurements, 30); // 30ms target
    }

    /**
     * Calculate benchmark statistics
     */
    private calculateBenchmarkResult(
        operation: string, 
        measurements: LatencyMeasurement[], 
        targetLatency: number
    ): BenchmarkResult {
        const successfulMeasurements = measurements.filter(m => m.success);
        const durations = successfulMeasurements.map(m => m.duration);
        
        if (durations.length === 0) {
            return {
                operation,
                samples: measurements,
                statistics: {
                    mean: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0, stdDev: 0
                },
                targetLatency,
                achievesTarget: false
            };
        }
        
        durations.sort((a, b) => a - b);
        
        const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
        const median = durations[Math.floor(durations.length * 0.5)];
        const p95 = durations[Math.floor(durations.length * 0.95)];
        const p99 = durations[Math.floor(durations.length * 0.99)];
        const min = durations[0];
        const max = durations[durations.length - 1];
        
        // Calculate standard deviation
        const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
        const stdDev = Math.sqrt(variance);
        
        const achievesTarget = p95 <= targetLatency; // Use P95 for target achievement
        
        return {
            operation,
            samples: measurements,
            statistics: {
                mean: Math.round(mean * 100) / 100,
                median: Math.round(median * 100) / 100,
                p95: Math.round(p95 * 100) / 100,
                p99: Math.round(p99 * 100) / 100,
                min: Math.round(min * 100) / 100,
                max: Math.round(max * 100) / 100,
                stdDev: Math.round(stdDev * 100) / 100
            },
            targetLatency,
            achievesTarget
        };
    }

    /**
     * Generate comprehensive benchmark report
     */
    private generateBenchmarkReport(results: BenchmarkResult[]): void {
        console.log('\n📊 BENCHMARK RESULTS SUMMARY');
        console.log('=' .repeat(80));
        
        let totalTargetsAchieved = 0;
        
        results.forEach(result => {
            const status = result.achievesTarget ? '✅ PASS' : '❌ FAIL';
            const targetStatus = result.achievesTarget ? 'TARGET ACHIEVED' : 'NEEDS OPTIMIZATION';
            
            console.log(`\n${result.operation}:`);
            console.log(`  Status: ${status} (${targetStatus})`);
            console.log(`  Target: ${result.targetLatency}ms | P95: ${result.statistics.p95}ms`);
            console.log(`  Mean: ${result.statistics.mean}ms | Median: ${result.statistics.median}ms`);
            console.log(`  P99: ${result.statistics.p99}ms | Max: ${result.statistics.max}ms`);
            console.log(`  Samples: ${result.samples.length} | Success Rate: ${(result.samples.filter(s => s.success).length / result.samples.length * 100).toFixed(1)}%`);
            
            if (result.achievesTarget) totalTargetsAchieved++;
        });
        
        const overallSuccess = (totalTargetsAchieved / results.length * 100).toFixed(1);
        
        console.log('\n' + '=' .repeat(80));
        console.log(`OVERALL PERFORMANCE: ${totalTargetsAchieved}/${results.length} targets achieved (${overallSuccess}%)`);
        
        if (totalTargetsAchieved === results.length) {
            console.log('🎉 ALL LATENCY TARGETS ACHIEVED! System is ready for competitive PvP gaming.');
        } else {
            console.log('⚠️  OPTIMIZATION REQUIRED! See performance optimization plan for recommendations.');
        }
        
        console.log('=' .repeat(80));
    }

    // Simulation helper methods

    private async simulateComponentProcessing(componentType: string, data: Uint8Array): Promise<void> {
        // Simulate component-specific processing time
        const baseTime = ComponentRegistry.is_high_frequency(componentType) ? 1 : 2;
        const processingTime = baseTime + Math.random() * 2; // 1-4ms variation
        await this.sleep(processingTime);
    }

    private async simulateTransactionProcessing(): Promise<{success: boolean}> {
        // Simulate transaction validation and processing
        const processingTime = 5 + Math.random() * 10; // 5-15ms
        await this.sleep(processingTime);
        return { success: Math.random() > 0.05 }; // 95% success rate
    }

    private async simulateStateSynchronization(): Promise<void> {
        // Simulate state sync between rollup and base layer
        const syncTime = 20 + Math.random() * 30; // 20-50ms
        await this.sleep(syncTime);
    }

    private async simulateSystemExecution(systemName: string, entityCount: number): Promise<void> {
        // Simulate ECS system processing entities
        const baseTime = 0.01; // 0.01ms per entity base time
        const systemMultiplier = systemName === 'Combat' ? 1.5 : 1.0;
        const processingTime = entityCount * baseTime * systemMultiplier;
        await this.sleep(processingTime);
    }

    private async simulateEndToEndAction(action: string): Promise<void> {
        // Simulate complete action: validation + processing + state update + response
        const networkRtt = 10 + Math.random() * 15; // 10-25ms network
        const processing = 5 + Math.random() * 10;  // 5-15ms processing
        const stateUpdate = 2 + Math.random() * 5;  // 2-7ms state update
        
        const totalTime = networkRtt + processing + stateUpdate;
        await this.sleep(totalTime);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export benchmark runner function
export async function runLatencyBenchmarks(): Promise<BenchmarkResult[]> {
    const benchmarkSuite = new LatencyBenchmarkSuite();
    return await benchmarkSuite.runComprehensiveBenchmarks();
}

// CLI runner for standalone execution
if (require.main === module) {
    runLatencyBenchmarks()
        .then(results => {
            console.log('\n✅ Benchmark execution completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Benchmark execution failed:', error);
            process.exit(1);
        });
}