/**
 * VRF Client - High-level interface for VRF operations
 * Integrates ECVRF with MagicBlock rollups for <10ms latency
 */

import { ECVRF } from './ecvrf';
import { 
  VRFConfig, 
  VRFKeyPair, 
  VRFOutput, 
  VRFVerificationResult, 
  WinnerSelectionConfig,
  WinnerSelectionResult,
  VRFError
} from '../types';
import { EventEmitter } from 'eventemitter3';

export class VRFClient extends EventEmitter {
  private keyPair?: VRFKeyPair;
  private config: VRFConfig;
  private performanceMetrics: {
    averageLatency: number;
    totalRequests: number;
    failedRequests: number;
  } = {
    averageLatency: 0,
    totalRequests: 0,
    failedRequests: 0
  };

  constructor(config: Partial<VRFConfig> = {}) {
    super();
    
    this.config = {
      curve: 'edwards25519',
      hashSuite: 'sha512',
      latencyTarget: 10, // <10ms requirement
      ...config
    };
  }

  /**
   * Initialize VRF client with key pair
   */
  async initialize(keyPair?: VRFKeyPair): Promise<void> {
    try {
      this.keyPair = keyPair || ECVRF.generateKeyPair();
      this.emit('initialized', { publicKey: this.keyPair.publicKey });
    } catch (error) {
      throw new VRFError(`VRF initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate VRF proof and output
   * @param message Input message to generate randomness for
   * @returns VRF output with proof
   */
  async generateRandomness(message: Uint8Array): Promise<VRFOutput> {
    if (!this.keyPair) {
      throw new VRFError('VRF client not initialized');
    }

    const start = performance.now();
    
    try {
      const output = ECVRF.prove(this.keyPair.secretKey, message);
      const latency = performance.now() - start;
      
      // Update performance metrics
      this.updateMetrics(latency, true);
      
      // Check latency requirement
      if (latency > this.config.latencyTarget) {
        console.warn(`VRF latency ${latency}ms exceeded target ${this.config.latencyTarget}ms`);
      }
      
      this.emit('vrf:generated', output);
      return output;
    } catch (error) {
      this.updateMetrics(performance.now() - start, false);
      throw error;
    }
  }

  /**
   * Verify VRF proof from another party
   * @param publicKey Public key of the prover
   * @param proof VRF proof to verify
   * @param message Original message that was hashed
   * @returns Verification result
   */
  async verifyRandomness(
    publicKey: Uint8Array, 
    proof: any, 
    message: Uint8Array
  ): Promise<VRFVerificationResult> {
    const start = performance.now();
    
    try {
      const result = ECVRF.verify(publicKey, proof, message);
      const latency = performance.now() - start;
      
      return {
        isValid: result.isValid,
        output: result.beta,
        latency
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        latency: performance.now() - start
      };
    }
  }

  /**
   * Select winners using VRF with proportional selection
   * @param config Winner selection configuration
   * @returns Winner selection result with proof
   */
  async selectWinners(config: WinnerSelectionConfig): Promise<WinnerSelectionResult> {
    if (!this.keyPair) {
      throw new VRFError('VRF client not initialized');
    }

    const start = performance.now();
    const message = this.encodeSelectionMessage(config);
    
    try {
      // Generate VRF proof for the selection
      const vrfOutput = await this.generateRandomness(message);
      
      // Use VRF output for winner selection
      const weights = config.weights || Array(config.totalParticipants).fill(1);
      const winners = ECVRF.selectWinners(weights, config.winnerCount, vrfOutput.beta);
      
      const selectionTime = performance.now() - start;
      
      const result: WinnerSelectionResult = {
        winners,
        proof: vrfOutput.proof,
        randomness: vrfOutput.beta,
        selectionTime
      };
      
      this.emit('winners:selected', result);
      return result;
    } catch (error) {
      throw new VRFError(`Winner selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get VRF public key for verification by others
   */
  getPublicKey(): Uint8Array | null {
    return this.keyPair?.publicKey || null;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return { ...this.performanceMetrics };
  }

  /**
   * Batch generate multiple VRF outputs for efficiency
   * @param messages Array of messages to process
   * @returns Array of VRF outputs
   */
  async batchGenerate(messages: Uint8Array[]): Promise<VRFOutput[]> {
    if (!this.keyPair) {
      throw new VRFError('VRF client not initialized');
    }

    const start = performance.now();
    const results: VRFOutput[] = [];
    
    try {
      // Process in parallel for better performance
      const promises = messages.map(message => 
        this.generateRandomnessInternal(message)
      );
      
      const outputs = await Promise.all(promises);
      results.push(...outputs);
      
      const totalLatency = performance.now() - start;
      const avgLatency = totalLatency / messages.length;
      
      console.log(`Batch VRF generation: ${messages.length} outputs in ${totalLatency}ms (avg: ${avgLatency}ms)`);
      
      return results;
    } catch (error) {
      throw new VRFError(`Batch VRF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Internal randomness generation without event emission
   */
  private async generateRandomnessInternal(message: Uint8Array): Promise<VRFOutput> {
    if (!this.keyPair) {
      throw new VRFError('VRF client not initialized');
    }

    return ECVRF.prove(this.keyPair.secretKey, message);
  }

  /**
   * Encode winner selection parameters into message
   */
  private encodeSelectionMessage(config: WinnerSelectionConfig): Uint8Array {
    const buffer = new ArrayBuffer(12 + config.seed.length);
    const view = new DataView(buffer);
    
    view.setUint32(0, config.totalParticipants, false);
    view.setUint32(4, config.winnerCount, false);
    view.setUint32(8, config.seed.length, false);
    
    const result = new Uint8Array(buffer);
    result.set(config.seed, 12);
    
    return result;
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(latency: number, success: boolean): void {
    this.performanceMetrics.totalRequests++;
    if (!success) {
      this.performanceMetrics.failedRequests++;
    }
    
    // Update running average
    const totalSuccessful = this.performanceMetrics.totalRequests - this.performanceMetrics.failedRequests;
    if (totalSuccessful > 0) {
      this.performanceMetrics.averageLatency = 
        (this.performanceMetrics.averageLatency * (totalSuccessful - 1) + latency) / totalSuccessful;
    }
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.performanceMetrics = {
      averageLatency: 0,
      totalRequests: 0,
      failedRequests: 0
    };
  }
}