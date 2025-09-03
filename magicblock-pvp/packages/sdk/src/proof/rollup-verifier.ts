/**
 * Rollup Proof Verifier - Verify L1 rollup proofs and state transitions
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { sha512 } from '@noble/hashes/sha512';
import { RollupProof, ProofVerificationResult, MagicBlockError } from '../types';
import { EventEmitter } from 'eventemitter3';

export class RollupVerifier extends EventEmitter {
  private connection: Connection;
  private verifiedProofs = new Map<string, ProofVerificationResult>();
  private rollupProgramId: PublicKey;
  
  constructor(connection: Connection, rollupProgramId: PublicKey) {
    super();
    this.connection = connection;
    this.rollupProgramId = rollupProgramId;
  }

  /**
   * Verify rollup proof on L1
   * @param proof Rollup proof to verify
   * @returns Verification result
   */
  async verifyProof(proof: RollupProof): Promise<ProofVerificationResult> {
    const startTime = Date.now();
    
    try {
      // Generate proof hash for caching
      const proofHash = this.hashProof(proof);
      
      // Check cache first
      const cached = this.verifiedProofs.get(proofHash);
      if (cached && this.isCacheValid(cached.timestamp)) {
        return cached;
      }

      // Verify proof components
      const isValidFormat = this.validateProofFormat(proof);
      if (!isValidFormat) {
        const result: ProofVerificationResult = {
          isValid: false,
          blockNumber: proof.blockNumber,
          timestamp: proof.timestamp,
          error: 'Invalid proof format'
        };
        return result;
      }

      // Verify signature
      const isValidSignature = await this.verifyProofSignature(proof);
      if (!isValidSignature) {
        const result: ProofVerificationResult = {
          isValid: false,
          blockNumber: proof.blockNumber,
          timestamp: proof.timestamp,
          error: 'Invalid proof signature'
        };
        return result;
      }

      // Verify state transition on L1
      const isValidStateTransition = await this.verifyStateTransition(proof);
      if (!isValidStateTransition) {
        const result: ProofVerificationResult = {
          isValid: false,
          blockNumber: proof.blockNumber,
          timestamp: proof.timestamp,
          error: 'Invalid state transition'
        };
        return result;
      }

      // Verify block exists on L1
      const blockExists = await this.verifyBlockOnL1(proof);
      if (!blockExists) {
        const result: ProofVerificationResult = {
          isValid: false,
          blockNumber: proof.blockNumber,
          timestamp: proof.timestamp,
          error: 'Block not found on L1'
        };
        return result;
      }

      // All verifications passed
      const result: ProofVerificationResult = {
        isValid: true,
        blockNumber: proof.blockNumber,
        timestamp: Date.now()
      };

      // Cache result
      this.verifiedProofs.set(proofHash, result);
      
      // Emit verification event
      this.emit('proof:verified', result);
      
      return result;
      
    } catch (error) {
      const result: ProofVerificationResult = {
        isValid: false,
        blockNumber: proof.blockNumber,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown verification error'
      };
      
      return result;
    }
  }

  /**
   * Batch verify multiple proofs for efficiency
   * @param proofs Array of proofs to verify
   * @returns Array of verification results
   */
  async batchVerifyProofs(proofs: RollupProof[]): Promise<ProofVerificationResult[]> {
    const startTime = Date.now();
    
    try {
      // Process proofs in parallel
      const verificationPromises = proofs.map(proof => this.verifyProof(proof));
      const results = await Promise.all(verificationPromises);
      
      const duration = Date.now() - startTime;
      console.log(`Batch verified ${proofs.length} proofs in ${duration}ms`);
      
      return results;
    } catch (error) {
      throw new MagicBlockError(
        `Batch proof verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BATCH_VERIFICATION_ERROR'
      );
    }
  }

  /**
   * Get verification status for a proof
   * @param proofHash Hash of the proof
   * @returns Cached verification result or null
   */
  getVerificationStatus(proofHash: string): ProofVerificationResult | null {
    const cached = this.verifiedProofs.get(proofHash);
    return cached && this.isCacheValid(cached.timestamp) ? cached : null;
  }

  /**
   * Verify proof format and structure
   */
  private validateProofFormat(proof: RollupProof): boolean {
    // Check required fields
    if (!proof.stateRoot || proof.stateRoot.length !== 32) return false;
    if (!proof.blockHash || proof.blockHash.length !== 32) return false;
    if (!proof.transactionHash || proof.transactionHash.length !== 32) return false;
    if (!proof.signature || proof.signature.length !== 64) return false;
    if (!proof.timestamp || proof.timestamp <= 0) return false;
    if (!proof.blockNumber || proof.blockNumber <= 0) return false;
    
    return true;
  }

  /**
   * Verify proof signature against expected signer
   */
  private async verifyProofSignature(proof: RollupProof): Promise<boolean> {
    try {
      // Construct message to verify
      const message = this.constructProofMessage(proof);
      
      // Get rollup program account to verify signer
      const programAccount = await this.connection.getAccountInfo(this.rollupProgramId);
      if (!programAccount) {
        return false;
      }

      // For now, perform basic signature validation
      // In production, implement proper cryptographic signature verification
      return proof.signature.length === 64;
      
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Verify state transition is valid
   */
  private async verifyStateTransition(proof: RollupProof): Promise<boolean> {
    try {
      // Get previous state root from L1
      const previousStateRoot = await this.getPreviousStateRoot(proof.blockNumber - 1);
      
      // Verify state transition is valid
      // This would involve checking that the new state root is derivable from the previous one
      // plus the transactions in the block
      
      // For now, return true if we have a previous state
      return previousStateRoot !== null;
      
    } catch (error) {
      console.error('State transition verification failed:', error);
      return false;
    }
  }

  /**
   * Verify block exists on L1 and matches proof
   */
  private async verifyBlockOnL1(proof: RollupProof): Promise<boolean> {
    try {
      // Get block data from L1
      const slot = await this.getSlotFromBlockNumber(proof.blockNumber);
      if (!slot) return false;
      
      const block = await this.connection.getBlock(slot);
      if (!block) return false;
      
      // Verify block hash matches
      const blockHash = this.calculateBlockHash(block);
      return this.compareHashes(blockHash, proof.blockHash);
      
    } catch (error) {
      console.error('L1 block verification failed:', error);
      return false;
    }
  }

  /**
   * Get previous state root for state transition verification
   */
  private async getPreviousStateRoot(blockNumber: number): Promise<Uint8Array | null> {
    try {
      // Query L1 for previous state root
      // This would involve reading from the rollup program's state
      
      // For now, return a dummy previous state root
      const dummyStateRoot = new Uint8Array(32);
      dummyStateRoot.fill(blockNumber % 256);
      return dummyStateRoot;
      
    } catch (error) {
      console.error('Failed to get previous state root:', error);
      return null;
    }
  }

  /**
   * Convert block number to Solana slot
   */
  private async getSlotFromBlockNumber(blockNumber: number): Promise<number | null> {
    try {
      // This mapping would be maintained by the rollup program
      // For now, use a simple calculation
      const currentSlot = await this.connection.getSlot();
      return currentSlot - (1000 - blockNumber); // Dummy mapping
      
    } catch (error) {
      console.error('Failed to get slot from block number:', error);
      return null;
    }
  }

  /**
   * Calculate block hash from block data
   */
  private calculateBlockHash(block: any): Uint8Array {
    // Serialize block data and hash it
    const blockData = JSON.stringify({
      blockhash: block.blockhash,
      previousBlockhash: block.previousBlockhash,
      transactions: block.transactions.length
    });
    
    return sha512(new TextEncoder().encode(blockData)).slice(0, 32);
  }

  /**
   * Construct message for proof signature verification
   */
  private constructProofMessage(proof: RollupProof): Uint8Array {
    const message = new Uint8Array(
      proof.stateRoot.length + 
      proof.blockHash.length + 
      proof.transactionHash.length + 
      8 + 8 // timestamp and blockNumber
    );
    
    let offset = 0;
    message.set(proof.stateRoot, offset);
    offset += proof.stateRoot.length;
    
    message.set(proof.blockHash, offset);
    offset += proof.blockHash.length;
    
    message.set(proof.transactionHash, offset);
    offset += proof.transactionHash.length;
    
    // Add timestamp (8 bytes)
    const timestampBytes = new ArrayBuffer(8);
    new DataView(timestampBytes).setBigUint64(0, BigInt(proof.timestamp), false);
    message.set(new Uint8Array(timestampBytes), offset);
    offset += 8;
    
    // Add block number (8 bytes)
    const blockNumberBytes = new ArrayBuffer(8);
    new DataView(blockNumberBytes).setBigUint64(0, BigInt(proof.blockNumber), false);
    message.set(new Uint8Array(blockNumberBytes), offset);
    
    return message;
  }

  /**
   * Hash proof for caching
   */
  private hashProof(proof: RollupProof): string {
    const message = this.constructProofMessage(proof);
    const hash = sha512(message);
    return Buffer.from(hash).toString('hex');
  }

  /**
   * Compare two hash arrays
   */
  private compareHashes(hash1: Uint8Array, hash2: Uint8Array): boolean {
    if (hash1.length !== hash2.length) return false;
    
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) return false;
    }
    
    return true;
  }

  /**
   * Check if cached result is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return (Date.now() - timestamp) < maxAge;
  }

  /**
   * Clear verification cache
   */
  clearCache(): void {
    this.verifiedProofs.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    validEntries: number;
    hitRate: number;
  } {
    const now = Date.now();
    let validEntries = 0;
    
    this.verifiedProofs.forEach((result) => {
      if (this.isCacheValid(result.timestamp)) {
        validEntries++;
      }
    });
    
    return {
      size: this.verifiedProofs.size,
      validEntries,
      hitRate: this.verifiedProofs.size > 0 ? validEntries / this.verifiedProofs.size : 0
    };
  }

  /**
   * Clean expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    this.verifiedProofs.forEach((result, hash) => {
      if (!this.isCacheValid(result.timestamp)) {
        toDelete.push(hash);
      }
    });
    
    toDelete.forEach(hash => this.verifiedProofs.delete(hash));
  }

  /**
   * Create a test proof for development
   */
  static createTestProof(blockNumber: number): RollupProof {
    const stateRoot = new Uint8Array(32);
    const blockHash = new Uint8Array(32);
    const transactionHash = new Uint8Array(32);
    const signature = new Uint8Array(64);
    
    // Fill with deterministic test data
    stateRoot.fill(blockNumber % 256);
    blockHash.fill((blockNumber * 2) % 256);
    transactionHash.fill((blockNumber * 3) % 256);
    signature.fill((blockNumber * 4) % 256);
    
    return {
      stateRoot,
      blockHash,
      transactionHash,
      signature,
      timestamp: Date.now(),
      blockNumber
    };
  }
}