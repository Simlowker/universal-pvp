import { randomBytes, createHash, createHmac } from 'crypto';
import { logger } from '@/config/logger';
import { tracing } from '@/config/tracing';

// ECVRF-class implementation for verifiable random function
export class VRFService {
  private secretKey: Buffer;
  private publicKey: Buffer;

  constructor(secretKey?: Buffer) {
    if (secretKey) {
      this.secretKey = secretKey;
    } else {
      // Generate a random secret key for demo purposes
      this.secretKey = randomBytes(32);
    }
    
    // In a real implementation, this would derive the public key from the secret key
    // using elliptic curve operations. For this demo, we'll use a hash.
    this.publicKey = createHash('sha256').update(this.secretKey).digest();
  }

  /**
   * Generate a VRF proof and hash for given input
   */
  generateProof(input: string | Buffer): { proof: Buffer; hash: Buffer; seed: string } {
    const span = tracing.createGameSpan('vrf_generate_proof', 'system');
    
    try {
      const inputBuffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
      
      // Create a deterministic but unpredictable seed
      const seed = createHmac('sha256', this.secretKey)
        .update(inputBuffer)
        .update(Buffer.from(Date.now().toString()))
        .digest('hex');

      // Generate the VRF hash (the actual random value)
      const hash = createHash('sha256')
        .update(this.secretKey)
        .update(inputBuffer)
        .update(Buffer.from(seed, 'hex'))
        .digest();

      // Generate the proof (allows verification without revealing secret key)
      const proof = this.createProof(inputBuffer, hash);

      span.setAttributes({
        'vrf.seed': seed,
        'vrf.input_size': inputBuffer.length,
        'vrf.proof_size': proof.length,
      });

      logger.debug('VRF proof generated', {
        seed,
        inputSize: inputBuffer.length,
        proofSize: proof.length,
      });

      return { proof, hash, seed };
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to generate VRF proof:', error);
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Verify a VRF proof
   */
  verifyProof(input: string | Buffer, proof: Buffer, hash: Buffer): boolean {
    const span = tracing.createGameSpan('vrf_verify_proof', 'system');
    
    try {
      const inputBuffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
      
      // In a real ECVRF implementation, this would involve elliptic curve operations
      // For this demo, we'll use HMAC verification
      const expectedProof = this.createProof(inputBuffer, hash);
      
      const isValid = proof.equals(expectedProof);
      
      span.setAttributes({
        'vrf.verification_result': isValid,
        'vrf.input_size': inputBuffer.length,
      });

      logger.debug('VRF proof verification', {
        isValid,
        inputSize: inputBuffer.length,
      });

      return isValid;
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to verify VRF proof:', error);
      return false;
    } finally {
      span.end();
    }
  }

  /**
   * Generate random number from VRF hash within specified range
   */
  hashToRange(hash: Buffer, min: number = 0, max: number = 100): number {
    // Convert hash to a number in the specified range
    const hashInt = hash.readUInt32BE(0);
    return min + (hashInt % (max - min + 1));
  }

  /**
   * Generate multiple random numbers from a single VRF hash
   */
  hashToMultiple(hash: Buffer, count: number, min: number = 0, max: number = 100): number[] {
    const results: number[] = [];
    
    // Use different parts of the hash to generate multiple numbers
    for (let i = 0; i < count; i++) {
      const offset = (i * 4) % hash.length;
      let value: number;
      
      if (offset + 4 <= hash.length) {
        value = hash.readUInt32BE(offset);
      } else {
        // If we run out of hash bytes, create a new hash
        const newHash = createHash('sha256')
          .update(hash)
          .update(Buffer.from([i]))
          .digest();
        value = newHash.readUInt32BE(0);
      }
      
      results.push(min + (value % (max - min + 1)));
    }
    
    return results;
  }

  /**
   * Generate game-specific randomness
   */
  generateGameRandomness(gameId: string, round: number): {
    seed: string;
    proof: Buffer;
    randomValue: number;
    criticalChance: number;
    dodgeChance: number;
  } {
    const input = `${gameId}:${round}:${Date.now()}`;
    const { proof, hash, seed } = this.generateProof(input);
    
    // Generate different random values for game mechanics
    const randomValues = this.hashToMultiple(hash, 3, 0, 100);
    
    return {
      seed,
      proof,
      randomValue: randomValues[0],
      criticalChance: randomValues[1],
      dodgeChance: randomValues[2],
    };
  }

  /**
   * Create a proof for the VRF (simplified version)
   */
  private createProof(input: Buffer, hash: Buffer): Buffer {
    // In a real ECVRF implementation, this would involve complex elliptic curve operations
    // For this demo, we use HMAC as a simplified proof mechanism
    return createHmac('sha256', this.publicKey)
      .update(input)
      .update(hash)
      .digest();
  }

  /**
   * Get the public key for verification
   */
  getPublicKey(): Buffer {
    return this.publicKey;
  }

  /**
   * Generate deterministic but unpredictable sequence for a game
   */
  generateGameSequence(gameId: string, player1: string, player2: string): {
    seed: string;
    sequence: number[];
    proof: Buffer;
  } {
    const input = `${gameId}:${player1}:${player2}`;
    const { proof, hash, seed } = this.generateProof(input);
    
    // Generate a sequence of 10 random numbers for the entire game
    const sequence = this.hashToMultiple(hash, 10, 0, 999);
    
    return { seed, sequence, proof };
  }

  /**
   * Validate that a sequence matches the provided seed and proof
   */
  validateGameSequence(
    gameId: string, 
    player1: string, 
    player2: string, 
    seed: string, 
    sequence: number[], 
    proof: Buffer
  ): boolean {
    try {
      const input = `${gameId}:${player1}:${player2}`;
      const inputBuffer = Buffer.from(input, 'utf8');
      
      // Recreate the hash from the seed
      const hash = createHash('sha256')
        .update(this.secretKey)
        .update(inputBuffer)
        .update(Buffer.from(seed, 'hex'))
        .digest();

      // Verify the proof
      if (!this.verifyProof(inputBuffer, proof, hash)) {
        return false;
      }

      // Regenerate the sequence and compare
      const expectedSequence = this.hashToMultiple(hash, sequence.length, 0, 999);
      
      if (expectedSequence.length !== sequence.length) {
        return false;
      }

      for (let i = 0; i < sequence.length; i++) {
        if (expectedSequence[i] !== sequence[i]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to validate game sequence:', error);
      return false;
    }
  }
}

// Export singleton instance
export const vrfService = new VRFService();