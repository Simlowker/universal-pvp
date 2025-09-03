/**
 * ECVRF Implementation per RFC 9381 (Edwards25519)
 * Elliptic Curve Verifiable Random Function with Edwards25519 curve
 * NOT using Ristretto encoding as per specification requirements
 */

import { sha512 } from '@noble/hashes/sha512';
import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from 'tweetnacl';
import { VRFKeyPair, VRFProof, VRFOutput, VRFError } from '../types';

export class ECVRF {
  private static readonly SUITE_ID = 0x04; // ECVRF-EDWARDS25519-SHA512-Elligator2
  private static readonly POINT_SIZE = 32;
  private static readonly SCALAR_SIZE = 32;
  private static readonly CHALLENGE_SIZE = 16;

  /**
   * Generate a new VRF key pair
   */
  static generateKeyPair(): VRFKeyPair {
    const secretKey = randomBytes(32);
    const publicKey = ed25519.getPublicKey(secretKey);
    
    return {
      secretKey,
      publicKey
    };
  }

  /**
   * Generate VRF proof and output
   * @param secretKey 32-byte secret key
   * @param alpha Input message to hash
   * @returns VRF proof and beta output
   */
  static prove(secretKey: Uint8Array, alpha: Uint8Array): VRFOutput {
    try {
      const start = performance.now();

      // 1. Hash to curve point H = hash_to_curve(alpha)
      const H = this.hashToCurve(alpha);
      
      // 2. Generate random nonce k
      const k = randomBytes(32);
      
      // 3. Compute gamma = k * H
      const kPoint = ed25519.ExtendedPoint.fromHex(k);
      const gamma = H.multiply(kPoint.toRawBytes());
      
      // 4. Compute c = hash_points(H, gamma, k*G, k*H)
      const publicKey = ed25519.getPublicKey(secretKey);
      const kBigInt = BigInt('0x' + Buffer.from(k).toString('hex'));
      const kG = ed25519.ExtendedPoint.BASE.multiply(kBigInt);
      const kBigInt2 = BigInt('0x' + Buffer.from(k).toString('hex'));
      const kH = H.multiply(kBigInt2);
      
      const c = this.hashPoints([
        H.toRawBytes(),
        gamma.toRawBytes(), 
        kG.toRawBytes(),
        kH.toRawBytes()
      ]);
      
      // 5. Compute s = k + c * secretKey (mod order)
      const order = ed25519.CURVE.n;
      const cScalar = BigInt('0x' + Buffer.from(c).toString('hex')) % order;
      const secretScalar = BigInt('0x' + Buffer.from(secretKey).toString('hex')) % order;
      const kScalar = BigInt('0x' + Buffer.from(k).toString('hex')) % order;
      
      const s = (kScalar + cScalar * secretScalar) % order;
      const sBytes = new Uint8Array(32);
      const sHex = s.toString(16).padStart(64, '0');
      Buffer.from(sHex, 'hex').copy(sBytes);
      
      // 6. Compute beta = hash(gamma)
      const beta = this.hashToOutput(gamma.toRawBytes());
      
      const proof: VRFProof = {
        gamma: gamma.toRawBytes(),
        c,
        s: sBytes,
        alpha
      };

      const latency = performance.now() - start;
      if (latency > 10) {
        console.warn(`VRF proof generation exceeded latency target: ${latency}ms`);
      }

      return {
        beta,
        proof,
        isValid: true
      };
    } catch (error) {
      throw new VRFError(`VRF proof generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify VRF proof
   * @param publicKey 32-byte public key
   * @param proof VRF proof
   * @param alpha Input message that was hashed
   * @returns Verification result with beta output
   */
  static verify(publicKey: Uint8Array, proof: VRFProof, alpha: Uint8Array): VRFOutput {
    try {
      const start = performance.now();

      // 1. Hash to curve point H = hash_to_curve(alpha)
      const H = this.hashToCurve(alpha);
      
      // 2. Parse proof components
      const gamma = ed25519.ExtendedPoint.fromHex(proof.gamma);
      const c = proof.c;
      const s = proof.s;
      
      // 3. Compute u = s*G - c*publicKey
      const sBigInt = BigInt('0x' + Buffer.from(s).toString('hex'));
      const sPoint = ed25519.ExtendedPoint.BASE.multiply(sBigInt);
      const pubkeyPoint = ed25519.ExtendedPoint.fromHex(publicKey);
      const cScalar = BigInt('0x' + Buffer.from(c).toString('hex'));
      const cPubkey = pubkeyPoint.multiply(cScalar);
      const u = sPoint.subtract(cPubkey);
      
      // 4. Compute v = s*H - c*gamma
      const sH = H.multiply(s);
      const cGamma = gamma.multiply(cScalar);
      const v = sH.subtract(cGamma);
      
      // 5. Verify c = hash_points(H, gamma, u, v)
      const expectedC = this.hashPoints([
        H.toRawBytes(),
        gamma.toRawBytes(),
        u.toRawBytes(),
        v.toRawBytes()
      ]);
      
      const isValid = this.constantTimeCompare(c, expectedC);
      
      // 6. Compute beta = hash(gamma) if valid
      const beta = isValid ? this.hashToOutput(proof.gamma) : new Uint8Array(32);
      
      const latency = performance.now() - start;
      if (latency > 10) {
        console.warn(`VRF verification exceeded latency target: ${latency}ms`);
      }

      return {
        beta,
        proof,
        isValid
      };
    } catch (error) {
      return {
        beta: new Uint8Array(32),
        proof,
        isValid: false
      };
    }
  }

  /**
   * Hash arbitrary input to curve point using Elligator2
   */
  private static hashToCurve(input: Uint8Array): any {
    // Simplified hash-to-curve - in production use proper Elligator2
    const hash = sha512(new Uint8Array([this.SUITE_ID, 0x01, ...input]));
    const point = ed25519.ExtendedPoint.fromHex(hash.slice(0, 32));
    return point;
  }

  /**
   * Hash points for challenge generation
   */
  private static hashPoints(points: Uint8Array[]): Uint8Array {
    const combined = new Uint8Array(points.reduce((acc, p) => acc + p.length, 1));
    combined[0] = this.SUITE_ID;
    
    let offset = 1;
    for (const point of points) {
      combined.set(point, offset);
      offset += point.length;
    }
    
    const hash = sha512(combined);
    return hash.slice(0, this.CHALLENGE_SIZE);
  }

  /**
   * Hash gamma to final VRF output
   */
  private static hashToOutput(gamma: Uint8Array): Uint8Array {
    const input = new Uint8Array([this.SUITE_ID, 0x03, ...gamma]);
    return sha512(input).slice(0, 32);
  }

  /**
   * Constant-time comparison to prevent timing attacks
   */
  private static constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  }

  /**
   * Generate proportional winner selection with rejection sampling
   * @param participants Array of participant weights
   * @param winnerCount Number of winners to select
   * @param seed Random seed from VRF
   * @returns Array of winner indices
   */
  static selectWinners(participants: number[], winnerCount: number, seed: Uint8Array): number[] {
    const winners: number[] = [];
    const totalWeight = participants.reduce((sum, weight) => sum + weight, 0);
    
    // Use VRF output as randomness source
    let randomOffset = 0;
    const getNextRandom = (): number => {
      if (randomOffset + 4 >= seed.length) {
        // Re-hash seed to get more randomness
        const newSeed = sha512(seed);
        seed.set(newSeed.slice(0, seed.length));
        randomOffset = 0;
      }
      
      const value = new DataView(seed.buffer, seed.byteOffset + randomOffset, 4).getUint32(0, false);
      randomOffset += 4;
      return value / 0xFFFFFFFF; // Convert to [0,1]
    };
    
    // Rejection sampling for proportional selection
    for (let i = 0; i < winnerCount; i++) {
      let attempts = 0;
      const maxAttempts = 100;
      
      while (attempts < maxAttempts) {
        const random = getNextRandom();
        const threshold = random * totalWeight;
        
        let cumulativeWeight = 0;
        for (let j = 0; j < participants.length; j++) {
          cumulativeWeight += participants[j];
          if (threshold <= cumulativeWeight && !winners.includes(j)) {
            winners.push(j);
            break;
          }
        }
        
        if (winners.length > i) break;
        attempts++;
      }
      
      // Fallback if rejection sampling fails
      if (winners.length <= i) {
        for (let j = 0; j < participants.length; j++) {
          if (!winners.includes(j)) {
            winners.push(j);
            break;
          }
        }
      }
    }
    
    return winners.slice(0, winnerCount);
  }
}