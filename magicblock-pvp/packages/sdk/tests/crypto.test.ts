import { CryptoUtils } from '../src/utils/crypto';
import { Keypair } from '@solana/web3.js';
import { randomBytes } from 'crypto';

describe('CryptoUtils', () => {
  let keypair: Keypair;

  beforeEach(() => {
    keypair = Keypair.generate();
  });

  describe('Signature Operations', () => {
    it('should sign and verify messages correctly', () => {
      const message = 'test message for signing';
      const messageBytes = new TextEncoder().encode(message);

      const signature = CryptoUtils.signMessage(messageBytes, keypair);
      expect(signature).toHaveLength(64); // ed25519 signature length

      const isValid = CryptoUtils.verifySignature(
        messageBytes,
        signature,
        keypair.publicKey
      );
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const message = new TextEncoder().encode('original message');
      const tamperedMessage = new TextEncoder().encode('tampered message');
      
      const signature = CryptoUtils.signMessage(message, keypair);
      
      const isValid = CryptoUtils.verifySignature(
        tamperedMessage,
        signature,
        keypair.publicKey
      );
      expect(isValid).toBe(false);
    });

    it('should handle empty messages', () => {
      const emptyMessage = new Uint8Array(0);
      
      const signature = CryptoUtils.signMessage(emptyMessage, keypair);
      expect(signature).toHaveLength(64);

      const isValid = CryptoUtils.verifySignature(
        emptyMessage,
        signature,
        keypair.publicKey
      );
      expect(isValid).toBe(true);
    });

    it('should handle large messages efficiently', () => {
      const largeMessage = randomBytes(1024 * 1024); // 1MB message
      
      const startTime = Date.now();
      const signature = CryptoUtils.signMessage(largeMessage, keypair);
      const signTime = Date.now() - startTime;
      
      expect(signTime).toBeLessThan(100); // Should sign within 100ms
      
      const verifyStartTime = Date.now();
      const isValid = CryptoUtils.verifySignature(
        largeMessage,
        signature,
        keypair.publicKey
      );
      const verifyTime = Date.now() - verifyStartTime;
      
      expect(isValid).toBe(true);
      expect(verifyTime).toBeLessThan(100); // Should verify within 100ms
    });
  });

  describe('Hash Operations', () => {
    it('should generate consistent SHA-256 hashes', () => {
      const data = new TextEncoder().encode('test data');
      
      const hash1 = CryptoUtils.sha256(data);
      const hash2 = CryptoUtils.sha256(data);
      
      expect(hash1).toEqual(hash2);
      expect(hash1).toHaveLength(32); // SHA-256 output length
    });

    it('should generate different hashes for different inputs', () => {
      const data1 = new TextEncoder().encode('data1');
      const data2 = new TextEncoder().encode('data2');
      
      const hash1 = CryptoUtils.sha256(data1);
      const hash2 = CryptoUtils.sha256(data2);
      
      expect(hash1).not.toEqual(hash2);
    });

    it('should handle hash chaining', () => {
      const data = new TextEncoder().encode('chain test');
      
      const hash1 = CryptoUtils.sha256(data);
      const hash2 = CryptoUtils.sha256(hash1);
      const hash3 = CryptoUtils.sha256(hash2);
      
      expect(hash1).not.toEqual(hash2);
      expect(hash2).not.toEqual(hash3);
      expect(hash1).not.toEqual(hash3);
    });
  });

  describe('Key Derivation', () => {
    it('should derive deterministic keys from seed', () => {
      const seed = randomBytes(32);
      
      const derivedKey1 = CryptoUtils.deriveKey(seed, 'path1');
      const derivedKey2 = CryptoUtils.deriveKey(seed, 'path1');
      const derivedKey3 = CryptoUtils.deriveKey(seed, 'path2');
      
      expect(derivedKey1).toEqual(derivedKey2); // Same path = same key
      expect(derivedKey1).not.toEqual(derivedKey3); // Different path = different key
    });

    it('should generate secure random seeds', () => {
      const seed1 = CryptoUtils.generateSeed();
      const seed2 = CryptoUtils.generateSeed();
      
      expect(seed1).toHaveLength(32);
      expect(seed2).toHaveLength(32);
      expect(seed1).not.toEqual(seed2);
    });

    it('should validate seed entropy', () => {
      const weakSeed = new Uint8Array(32).fill(0); // All zeros
      const strongSeed = CryptoUtils.generateSeed();
      
      expect(CryptoUtils.validateSeedEntropy(weakSeed)).toBe(false);
      expect(CryptoUtils.validateSeedEntropy(strongSeed)).toBe(true);
    });
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const data = new TextEncoder().encode('sensitive game data');
      const key = CryptoUtils.generateSeed();
      
      const encrypted = CryptoUtils.encrypt(data, key);
      expect(encrypted.ciphertext).not.toEqual(data);
      expect(encrypted.nonce).toHaveLength(12); // AES-GCM nonce length
      
      const decrypted = CryptoUtils.decrypt(encrypted, key);
      expect(decrypted).toEqual(data);
    });

    it('should fail decryption with wrong key', () => {
      const data = new TextEncoder().encode('secret data');
      const correctKey = CryptoUtils.generateSeed();
      const wrongKey = CryptoUtils.generateSeed();
      
      const encrypted = CryptoUtils.encrypt(data, correctKey);
      
      expect(() => {
        CryptoUtils.decrypt(encrypted, wrongKey);
      }).toThrow('Decryption failed');
    });

    it('should detect tampering in encrypted data', () => {
      const data = new TextEncoder().encode('important data');
      const key = CryptoUtils.generateSeed();
      
      const encrypted = CryptoUtils.encrypt(data, key);
      
      // Tamper with ciphertext
      encrypted.ciphertext[0] = encrypted.ciphertext[0] ^ 1;
      
      expect(() => {
        CryptoUtils.decrypt(encrypted, key);
      }).toThrow('Authentication failed');
    });
  });

  describe('Zero-Knowledge Proofs', () => {
    it('should generate and verify commitment proofs', () => {
      const secret = randomBytes(32);
      const nonce = randomBytes(32);
      
      const commitment = CryptoUtils.generateCommitment(secret, nonce);
      expect(commitment).toHaveLength(32);
      
      const proof = CryptoUtils.generateCommitmentProof(secret, nonce);
      const isValid = CryptoUtils.verifyCommitmentProof(commitment, proof);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid commitment proofs', () => {
      const secret = randomBytes(32);
      const nonce = randomBytes(32);
      const wrongSecret = randomBytes(32);
      
      const commitment = CryptoUtils.generateCommitment(secret, nonce);
      const wrongProof = CryptoUtils.generateCommitmentProof(wrongSecret, nonce);
      
      const isValid = CryptoUtils.verifyCommitmentProof(commitment, wrongProof);
      expect(isValid).toBe(false);
    });

    it('should generate range proofs for bet amounts', () => {
      const betAmount = 1000000; // 1 SOL in lamports
      const minBet = 100000;     // 0.1 SOL
      const maxBet = 10000000;   // 10 SOL
      
      const proof = CryptoUtils.generateRangeProof(betAmount, minBet, maxBet);
      const isValid = CryptoUtils.verifyRangeProof(proof, minBet, maxBet);
      
      expect(isValid).toBe(true);
    });
  });

  describe('Merkle Tree Operations', () => {
    it('should build and verify Merkle trees', () => {
      const leaves = [
        'player1_move',
        'player2_move',
        'game_state',
        'random_seed'
      ].map(str => CryptoUtils.sha256(new TextEncoder().encode(str)));
      
      const tree = CryptoUtils.buildMerkleTree(leaves);
      expect(tree.root).toHaveLength(32);
      
      // Verify each leaf
      leaves.forEach((leaf, index) => {
        const proof = CryptoUtils.getMerkleProof(tree, index);
        const isValid = CryptoUtils.verifyMerkleProof(leaf, proof, tree.root);
        expect(isValid).toBe(true);
      });
    });

    it('should handle single leaf Merkle trees', () => {
      const singleLeaf = CryptoUtils.sha256(new TextEncoder().encode('single_move'));
      const tree = CryptoUtils.buildMerkleTree([singleLeaf]);
      
      expect(tree.root).toEqual(singleLeaf);
      
      const proof = CryptoUtils.getMerkleProof(tree, 0);
      const isValid = CryptoUtils.verifyMerkleProof(singleLeaf, proof, tree.root);
      expect(isValid).toBe(true);
    });

    it('should reject invalid Merkle proofs', () => {
      const leaves = [
        'move1',
        'move2',
        'move3',
        'move4'
      ].map(str => CryptoUtils.sha256(new TextEncoder().encode(str)));
      
      const tree = CryptoUtils.buildMerkleTree(leaves);
      const proof = CryptoUtils.getMerkleProof(tree, 0);
      
      // Try to verify wrong leaf with correct proof
      const wrongLeaf = CryptoUtils.sha256(new TextEncoder().encode('wrong_move'));
      const isValid = CryptoUtils.verifyMerkleProof(wrongLeaf, proof, tree.root);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Performance Tests', () => {
    it('should perform signature operations within latency targets', () => {
      const message = randomBytes(1024);
      const iterations = 100;
      
      // Test signing performance
      const signStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        CryptoUtils.signMessage(message, keypair);
      }
      const signTime = (Date.now() - signStart) / iterations;
      
      expect(signTime).toBeLessThan(10); // < 10ms per signature
      
      // Test verification performance
      const signature = CryptoUtils.signMessage(message, keypair);
      const verifyStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        CryptoUtils.verifySignature(message, signature, keypair.publicKey);
      }
      const verifyTime = (Date.now() - verifyStart) / iterations;
      
      expect(verifyTime).toBeLessThan(5); // < 5ms per verification
    });

    it('should handle concurrent operations efficiently', async () => {
      const message = randomBytes(512);
      const concurrency = 10;
      
      const operations = Array(concurrency).fill(null).map(async () => {
        const testKeypair = Keypair.generate();
        const signature = CryptoUtils.signMessage(message, testKeypair);
        return CryptoUtils.verifySignature(message, signature, testKeypair.publicKey);
      });
      
      const startTime = Date.now();
      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;
      
      expect(results.every(result => result)).toBe(true);
      expect(totalTime).toBeLessThan(100); // All operations under 100ms
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle malformed signatures gracefully', () => {
      const message = new TextEncoder().encode('test message');
      const invalidSignature = new Uint8Array(63); // Wrong length
      
      expect(() => {
        CryptoUtils.verifySignature(message, invalidSignature, keypair.publicKey);
      }).toThrow('Invalid signature format');
    });

    it('should validate public key formats', () => {
      const message = new TextEncoder().encode('test message');
      const signature = CryptoUtils.signMessage(message, keypair);
      const invalidPubkey = new Uint8Array(31); // Wrong length
      
      expect(() => {
        CryptoUtils.verifySignature(message, signature, invalidPubkey as any);
      }).toThrow('Invalid public key format');
    });

    it('should prevent timing attacks on signature verification', () => {
      const message = new TextEncoder().encode('timing test');
      const validSignature = CryptoUtils.signMessage(message, keypair);
      const invalidSignature = new Uint8Array(64).fill(0);
      
      // Measure timing for valid vs invalid signatures
      const validTimes: number[] = [];
      const invalidTimes: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        // Valid signature timing
        const validStart = process.hrtime.bigint();
        CryptoUtils.verifySignature(message, validSignature, keypair.publicKey);
        const validEnd = process.hrtime.bigint();
        validTimes.push(Number(validEnd - validStart));
        
        // Invalid signature timing
        const invalidStart = process.hrtime.bigint();
        try {
          CryptoUtils.verifySignature(message, invalidSignature, keypair.publicKey);
        } catch (e) {
          // Expected to fail
        }
        const invalidEnd = process.hrtime.bigint();
        invalidTimes.push(Number(invalidEnd - invalidStart));
      }
      
      const avgValidTime = validTimes.reduce((a, b) => a + b) / validTimes.length;
      const avgInvalidTime = invalidTimes.reduce((a, b) => a + b) / invalidTimes.length;
      
      // Timing difference should be minimal to prevent timing attacks
      const timingRatio = Math.abs(avgValidTime - avgInvalidTime) / Math.max(avgValidTime, avgInvalidTime);
      expect(timingRatio).toBeLessThan(0.1); // < 10% difference
    });
  });
});