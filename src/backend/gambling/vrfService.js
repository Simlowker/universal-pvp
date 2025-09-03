const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const crypto = require('crypto');

const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');

/**
 * Verifiable Random Function (VRF) Service for Gambling
 * Provides provably fair randomness generation for all gambling operations
 */
class VRFService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    // VRF seed and keypair for cryptographic randomness
    this.vrfKeypair = this.loadOrGenerateVRFKeypair();
    this.chainlinkVRF = process.env.CHAINLINK_VRF_COORDINATOR;
    this.vrfKeyHash = process.env.VRF_KEY_HASH;
    this.vrfFee = BigInt(process.env.VRF_FEE || '100000000000000000'); // 0.1 LINK
    
    // Randomness cache for performance
    this.randomnessCache = new Map();
    this.pendingRequests = new Map();
  }

  /**
   * Load or generate VRF keypair for cryptographic operations
   */
  loadOrGenerateVRFKeypair() {
    try {
      const storedKey = process.env.VRF_PRIVATE_KEY;
      if (storedKey) {
        const secretKey = bs58.decode(storedKey);
        return Keypair.fromSecretKey(secretKey);
      }
    } catch (error) {
      logger.warn('Failed to load VRF keypair from environment:', error);
    }
    
    // Generate new keypair if none exists
    const keypair = Keypair.generate();
    logger.info(`Generated new VRF keypair: ${keypair.publicKey.toString()}`);
    logger.warn('Store VRF_PRIVATE_KEY in secure environment for production');
    
    return keypair;
  }

  /**
   * Generate cryptographically secure random number with proof
   * Uses VRF for verifiable randomness
   */
  async generateVerifiableRandom(seed, min = 0, max = 100) {
    try {
      const requestId = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();
      
      // Create deterministic seed from input and blockchain data
      const slot = await this.connection.getSlot('confirmed');
      const blockHash = await this.connection.getRecentBlockhash('confirmed');
      
      const combinedSeed = Buffer.concat([
        Buffer.from(seed),
        Buffer.from(slot.toString()),
        Buffer.from(blockHash.blockhash),
        Buffer.from(timestamp.toString())
      ]);

      // Generate VRF proof using our keypair
      const message = crypto.createHash('sha256').update(combinedSeed).digest();
      const vrfProof = nacl.sign.detached(message, this.vrfKeypair.secretKey);
      
      // Convert proof to random number in specified range
      const randomBytes = crypto.createHash('sha256').update(vrfProof).digest();
      const randomBigInt = BigInt('0x' + randomBytes.toString('hex'));
      const range = BigInt(max - min + 1);
      const randomValue = Number(randomBigInt % range) + min;

      const vrfResult = {
        requestId,
        value: randomValue,
        seed: combinedSeed.toString('hex'),
        proof: Buffer.from(vrfProof).toString('hex'),
        publicKey: this.vrfKeypair.publicKey.toString(),
        slot,
        blockHash: blockHash.blockhash,
        timestamp,
        min,
        max,
        verified: false
      };

      // Verify the proof immediately
      vrfResult.verified = await this.verifyVRFProof(vrfResult);
      
      if (!vrfResult.verified) {
        throw new Error('VRF proof verification failed');
      }

      // Store in cache and persistent storage
      this.randomnessCache.set(requestId, vrfResult);
      await this.storeVRFResult(vrfResult);

      logger.info(`Generated verifiable random: ${randomValue} (request: ${requestId})`);
      
      return vrfResult;

    } catch (error) {
      logger.error('VRF generation error:', error);
      throw new Error('Failed to generate verifiable random number');
    }
  }

  /**
   * Verify VRF proof for transparency and fairness
   */
  async verifyVRFProof(vrfResult) {
    try {
      const publicKey = new PublicKey(vrfResult.publicKey);
      const message = Buffer.from(vrfResult.seed, 'hex');
      const messageHash = crypto.createHash('sha256').update(message).digest();
      const signature = Buffer.from(vrfResult.proof, 'hex');

      // Verify the signature
      const isValid = nacl.sign.detached.verify(
        messageHash,
        signature,
        publicKey.toBuffer()
      );

      if (!isValid) {
        logger.error(`VRF proof verification failed for request ${vrfResult.requestId}`);
        return false;
      }

      // Verify the random value was calculated correctly
      const proofHash = crypto.createHash('sha256').update(signature).digest();
      const expectedValue = Number(BigInt('0x' + proofHash.toString('hex')) % 
        BigInt(vrfResult.max - vrfResult.min + 1)) + vrfResult.min;

      if (expectedValue !== vrfResult.value) {
        logger.error(`VRF value mismatch for request ${vrfResult.requestId}`);
        return false;
      }

      return true;

    } catch (error) {
      logger.error('VRF verification error:', error);
      return false;
    }
  }

  /**
   * Generate random winner from participant list
   */
  async selectRandomWinner(participants, seed) {
    if (!participants || participants.length === 0) {
      throw new Error('No participants provided');
    }

    const vrfResult = await this.generateVerifiableRandom(
      seed, 
      0, 
      participants.length - 1
    );

    const winnerIndex = vrfResult.value;
    const winner = participants[winnerIndex];

    const selectionResult = {
      ...vrfResult,
      totalParticipants: participants.length,
      winnerIndex,
      winner,
      participants: participants.map((p, i) => ({ ...p, index: i }))
    };

    logger.info(
      `Selected winner: ${winner.id || winner} at index ${winnerIndex} ` +
      `from ${participants.length} participants`
    );

    return selectionResult;
  }

  /**
   * Generate weighted random selection (for odds-based outcomes)
   */
  async selectWeightedRandom(options, weights, seed) {
    if (options.length !== weights.length) {
      throw new Error('Options and weights arrays must have same length');
    }

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      throw new Error('Total weight must be positive');
    }

    const vrfResult = await this.generateVerifiableRandom(seed, 1, totalWeight);
    const randomValue = vrfResult.value;

    let cumulativeWeight = 0;
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (randomValue <= cumulativeWeight) {
        selectedIndex = i;
        break;
      }
    }

    const selectionResult = {
      ...vrfResult,
      options,
      weights,
      totalWeight,
      selectedIndex,
      selectedOption: options[selectedIndex],
      selectionWeight: weights[selectedIndex]
    };

    logger.info(
      `Weighted selection: option ${selectedIndex} (${options[selectedIndex]}) ` +
      `with weight ${weights[selectedIndex]}/${totalWeight}`
    );

    return selectionResult;
  }

  /**
   * Generate batch random numbers for multiple operations
   */
  async generateBatchRandom(requests) {
    const results = [];
    
    for (const request of requests) {
      const { seed, min = 0, max = 100, id } = request;
      const result = await this.generateVerifiableRandom(`${seed}_${id}`, min, max);
      results.push({ ...result, requestId: id });
    }

    return results;
  }

  /**
   * Get VRF result by request ID
   */
  async getVRFResult(requestId) {
    // Check cache first
    if (this.randomnessCache.has(requestId)) {
      return this.randomnessCache.get(requestId);
    }

    // Check persistent storage
    try {
      const stored = await redis.get(`vrf:${requestId}`);
      if (stored) {
        const result = JSON.parse(stored);
        this.randomnessCache.set(requestId, result);
        return result;
      }
    } catch (error) {
      logger.error(`Failed to retrieve VRF result ${requestId}:`, error);
    }

    return null;
  }

  /**
   * Store VRF result in persistent storage
   */
  async storeVRFResult(vrfResult) {
    try {
      await redis.setex(
        `vrf:${vrfResult.requestId}`,
        86400, // 24 hours
        JSON.stringify(vrfResult)
      );

      // Store in audit log
      await redis.lpush('vrf:audit_log', JSON.stringify({
        requestId: vrfResult.requestId,
        timestamp: vrfResult.timestamp,
        value: vrfResult.value,
        verified: vrfResult.verified
      }));

    } catch (error) {
      logger.error('Failed to store VRF result:', error);
    }
  }

  /**
   * Get VRF statistics and health metrics
   */
  async getVRFStats() {
    try {
      const auditLogLength = await redis.llen('vrf:audit_log');
      const recentResults = await redis.lrange('vrf:audit_log', 0, 99);
      
      const stats = {
        totalRequests: auditLogLength,
        cacheSize: this.randomnessCache.size,
        vrfPublicKey: this.vrfKeypair.publicKey.toString(),
        recentRequests: recentResults.length,
        averageVerificationTime: 0 // Could track this
      };

      return stats;

    } catch (error) {
      logger.error('Failed to get VRF stats:', error);
      return { error: 'Failed to retrieve stats' };
    }
  }

  /**
   * Validate external VRF proof (for third-party verification)
   */
  async validateExternalProof(proof) {
    try {
      const isValid = await this.verifyVRFProof(proof);
      
      if (isValid) {
        logger.info(`External VRF proof validated: ${proof.requestId}`);
      } else {
        logger.warn(`External VRF proof validation failed: ${proof.requestId}`);
      }

      return isValid;

    } catch (error) {
      logger.error('External VRF validation error:', error);
      return false;
    }
  }

  /**
   * Clear old VRF results from cache (memory management)
   */
  clearOldResults(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    let cleared = 0;

    for (const [key, result] of this.randomnessCache.entries()) {
      if (now - result.timestamp > maxAge) {
        this.randomnessCache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info(`Cleared ${cleared} old VRF results from cache`);
    }

    return cleared;
  }
}

module.exports = { VRFService: new VRFService() };