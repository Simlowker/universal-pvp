const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');

const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');

/**
 * Advanced Escrow Manager for Gambling System
 * Handles multi-signature escrow accounts, automated settlement, and security features
 */
class EscrowManager {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    // Multi-signature configuration
    this.multisigThreshold = parseInt(process.env.MULTISIG_THRESHOLD || '2');
    this.escrowAuthorities = this.loadEscrowAuthorities();
    this.treasuryWallet = new PublicKey(process.env.TREASURY_WALLET);
    
    // Escrow configuration
    this.config = {
      maxEscrowAmount: parseFloat(process.env.MAX_ESCROW_AMOUNT || '10000'), // SOL
      settlementDelay: parseInt(process.env.SETTLEMENT_DELAY || '300'), // 5 minutes
      disputeWindow: parseInt(process.env.DISPUTE_WINDOW || '3600'), // 1 hour
      platformFee: parseFloat(process.env.PLATFORM_FEE || '0.05'), // 5%
      emergencyPauseEnabled: process.env.EMERGENCY_PAUSE === 'true'
    };

    // Active escrows tracking
    this.activeEscrows = new Map();
    this.pendingSettlements = new Set();
    this.disputes = new Map();
  }

  /**
   * Load escrow authority keypairs for multi-signature operations
   */
  loadEscrowAuthorities() {
    const authorities = [];
    try {
      for (let i = 1; i <= 3; i++) {
        const keyEnvVar = `ESCROW_AUTHORITY_${i}_KEY`;
        const privateKey = process.env[keyEnvVar];
        
        if (privateKey) {
          const keypair = Keypair.fromSecretKey(
            Buffer.from(privateKey, 'base64')
          );
          authorities.push(keypair);
        }
      }

      if (authorities.length < this.multisigThreshold) {
        logger.warn(
          `Only ${authorities.length} escrow authorities loaded, ` +
          `but threshold is ${this.multisigThreshold}`
        );
      }

      logger.info(`Loaded ${authorities.length} escrow authorities`);
      return authorities;

    } catch (error) {
      logger.error('Failed to load escrow authorities:', error);
      return [];
    }
  }

  /**
   * Create multi-signature escrow account
   */
  async createEscrow(escrowData) {
    try {
      const escrowId = this.generateEscrowId(escrowData);
      const escrowKeypair = Keypair.generate();
      
      const escrow = {
        id: escrowId,
        publicKey: escrowKeypair.publicKey.toString(),
        type: escrowData.type, // 'match', 'tournament', 'bet'
        eventId: escrowData.eventId,
        participants: escrowData.participants, // Array of participant wallets
        amounts: escrowData.amounts, // Array of amounts each participant deposits
        totalAmount: escrowData.amounts.reduce((sum, amt) => sum + amt, 0),
        conditions: escrowData.conditions, // Settlement conditions
        created: Date.now(),
        expiresAt: escrowData.expiresAt || Date.now() + 86400000, // 24 hours default
        status: 'pending_deposits',
        deposits: new Map(), // participantId -> deposit status
        multisigSignatures: [], // Signatures from authorities
        settlementProposal: null,
        disputeInfo: null,
        platformFee: this.config.platformFee,
        metadata: escrowData.metadata || {}
      };

      // Initialize deposit tracking
      escrowData.participants.forEach((participant, index) => {
        escrow.deposits.set(participant.id, {
          wallet: participant.wallet,
          requiredAmount: escrowData.amounts[index],
          depositedAmount: 0,
          status: 'pending',
          transactionId: null,
          depositedAt: null
        });
      });

      // Store escrow data
      this.activeEscrows.set(escrowId, escrow);
      await this.saveEscrowToRedis(escrow);

      logger.info(
        `Created escrow ${escrowId} for ${escrowData.type} ${escrowData.eventId}. ` +
        `Total: ${escrow.totalAmount} SOL`
      );

      return {
        escrowId,
        escrowAddress: escrowKeypair.publicKey.toString(),
        depositInstructions: this.generateDepositInstructions(escrow)
      };

    } catch (error) {
      logger.error('Failed to create escrow:', error);
      throw new Error('Failed to create escrow account');
    }
  }

  /**
   * Process deposit to escrow account
   */
  async processDeposit(escrowId, participantId, amount, transactionSignature) {
    try {
      const escrow = await this.getEscrow(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      const depositInfo = escrow.deposits.get(participantId);
      if (!depositInfo) {
        throw new Error('Participant not found in escrow');
      }

      if (depositInfo.status === 'completed') {
        throw new Error('Deposit already completed');
      }

      // Verify transaction on blockchain
      const isValid = await this.verifyDepositTransaction(
        transactionSignature,
        depositInfo.wallet,
        escrow.publicKey,
        amount
      );

      if (!isValid) {
        throw new Error('Invalid deposit transaction');
      }

      // Update deposit status
      depositInfo.depositedAmount = amount;
      depositInfo.status = 'completed';
      depositInfo.transactionId = transactionSignature;
      depositInfo.depositedAt = Date.now();

      // Check if all deposits are complete
      const allDepositsComplete = Array.from(escrow.deposits.values())
        .every(deposit => deposit.status === 'completed');

      if (allDepositsComplete) {
        escrow.status = 'active';
        escrow.activatedAt = Date.now();
        
        logger.info(`Escrow ${escrowId} is now active - all deposits received`);
      }

      await this.saveEscrowToRedis(escrow);

      logger.info(
        `Deposit processed: ${amount} SOL from participant ${participantId} ` +
        `to escrow ${escrowId}`
      );

      return {
        escrowId,
        participantId,
        depositedAmount: amount,
        escrowStatus: escrow.status,
        allDepositsComplete
      };

    } catch (error) {
      logger.error('Failed to process deposit:', error);
      throw error;
    }
  }

  /**
   * Propose settlement with multi-signature validation
   */
  async proposeSettlement(escrowId, settlementData, proposerAuthority) {
    try {
      const escrow = await this.getEscrow(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.status !== 'active') {
        throw new Error('Escrow is not active');
      }

      // Validate proposer authority
      const isValidAuthority = this.escrowAuthorities.some(
        auth => auth.publicKey.equals(proposerAuthority)
      );

      if (!isValidAuthority) {
        throw new Error('Invalid settlement authority');
      }

      const settlement = {
        id: `settlement_${escrowId}_${Date.now()}`,
        escrowId,
        proposer: proposerAuthority.toString(),
        proposedAt: Date.now(),
        expiresAt: Date.now() + this.config.disputeWindow,
        payouts: settlementData.payouts, // Array of { participantId, amount, reason }
        totalPayout: settlementData.payouts.reduce((sum, p) => sum + p.amount, 0),
        platformFee: escrow.totalAmount * escrow.platformFee,
        signatures: [],
        status: 'pending_signatures',
        reason: settlementData.reason || 'Event completed',
        evidenceHash: settlementData.evidenceHash || null
      };

      // Validate settlement amounts
      const expectedTotal = escrow.totalAmount - settlement.platformFee;
      if (Math.abs(settlement.totalPayout - expectedTotal) > 0.001) {
        throw new Error('Settlement amounts do not match escrow total');
      }

      escrow.settlementProposal = settlement;
      escrow.status = 'pending_settlement';

      await this.saveEscrowToRedis(escrow);

      logger.info(
        `Settlement proposed for escrow ${escrowId} by ${proposerAuthority.toString()}`
      );

      return settlement;

    } catch (error) {
      logger.error('Failed to propose settlement:', error);
      throw error;
    }
  }

  /**
   * Sign settlement proposal (multi-signature)
   */
  async signSettlement(escrowId, signerAuthority, signature) {
    try {
      const escrow = await this.getEscrow(escrowId);
      if (!escrow || !escrow.settlementProposal) {
        throw new Error('No settlement proposal found');
      }

      const settlement = escrow.settlementProposal;
      
      // Verify signer is valid authority
      const signerIndex = this.escrowAuthorities.findIndex(
        auth => auth.publicKey.equals(signerAuthority)
      );

      if (signerIndex === -1) {
        throw new Error('Invalid signer authority');
      }

      // Check if already signed
      if (settlement.signatures.some(sig => sig.authority === signerAuthority.toString())) {
        throw new Error('Already signed by this authority');
      }

      // Verify signature
      const isValidSignature = await this.verifySettlementSignature(
        settlement,
        signature,
        signerAuthority
      );

      if (!isValidSignature) {
        throw new Error('Invalid signature');
      }

      // Add signature
      settlement.signatures.push({
        authority: signerAuthority.toString(),
        signature,
        signedAt: Date.now()
      });

      // Check if we have enough signatures
      if (settlement.signatures.length >= this.multisigThreshold) {
        settlement.status = 'approved';
        escrow.status = 'ready_to_settle';
        
        // Schedule automatic settlement
        setTimeout(() => {
          this.executeSettlement(escrowId).catch(error => {
            logger.error(`Auto-settlement failed for ${escrowId}:`, error);
          });
        }, this.config.settlementDelay * 1000);

        logger.info(`Settlement approved for escrow ${escrowId} - auto-settling in ${this.config.settlementDelay}s`);
      }

      await this.saveEscrowToRedis(escrow);

      return {
        escrowId,
        signaturesCount: settlement.signatures.length,
        requiredSignatures: this.multisigThreshold,
        approved: settlement.status === 'approved'
      };

    } catch (error) {
      logger.error('Failed to sign settlement:', error);
      throw error;
    }
  }

  /**
   * Execute settlement and distribute funds
   */
  async executeSettlement(escrowId) {
    try {
      const escrow = await this.getEscrow(escrowId);
      if (!escrow || escrow.status !== 'ready_to_settle') {
        throw new Error('Escrow not ready for settlement');
      }

      const settlement = escrow.settlementProposal;
      if (!settlement || settlement.status !== 'approved') {
        throw new Error('Settlement not approved');
      }

      // Add to pending settlements to prevent double execution
      if (this.pendingSettlements.has(escrowId)) {
        throw new Error('Settlement already in progress');
      }
      this.pendingSettlements.add(escrowId);

      try {
        const payoutResults = [];
        let totalPaid = 0;

        // Process each payout
        for (const payout of settlement.payouts) {
          try {
            const result = await this.executePayout(
              escrow,
              payout.participantId,
              payout.amount,
              payout.reason
            );

            payoutResults.push({
              participantId: payout.participantId,
              amount: payout.amount,
              status: 'success',
              transactionId: result.transactionId
            });

            totalPaid += payout.amount;

          } catch (payoutError) {
            logger.error(`Payout failed for participant ${payout.participantId}:`, payoutError);
            
            payoutResults.push({
              participantId: payout.participantId,
              amount: payout.amount,
              status: 'failed',
              error: payoutError.message
            });
          }
        }

        // Process platform fee
        const feeResult = await this.payPlatformFee(escrow, settlement.platformFee);

        // Update escrow status
        escrow.status = 'settled';
        escrow.settledAt = Date.now();
        escrow.settlementResults = {
          totalPaid,
          platformFee: settlement.platformFee,
          payoutResults,
          feeTransactionId: feeResult.transactionId
        };

        await this.saveEscrowToRedis(escrow);

        // Create settlement audit record
        await this.createSettlementAuditRecord(escrow, settlement, payoutResults);

        logger.info(
          `Escrow ${escrowId} settled successfully. ` +
          `Total paid: ${totalPaid} SOL, Platform fee: ${settlement.platformFee} SOL`
        );

        return {
          escrowId,
          status: 'settled',
          totalPaid,
          platformFee: settlement.platformFee,
          payoutResults
        };

      } finally {
        this.pendingSettlements.delete(escrowId);
      }

    } catch (error) {
      this.pendingSettlements.delete(escrowId);
      logger.error('Failed to execute settlement:', error);
      throw error;
    }
  }

  /**
   * Handle dispute initiation
   */
  async initiateDispute(escrowId, disputantId, disputeData) {
    try {
      const escrow = await this.getEscrow(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      if (escrow.status === 'settled') {
        throw new Error('Cannot dispute settled escrow');
      }

      // Check if disputant is a participant
      const isParticipant = escrow.deposits.has(disputantId);
      if (!isParticipant) {
        throw new Error('Only participants can initiate disputes');
      }

      const dispute = {
        id: `dispute_${escrowId}_${Date.now()}`,
        escrowId,
        disputantId,
        reason: disputeData.reason,
        evidence: disputeData.evidence || [],
        initiatedAt: Date.now(),
        status: 'active',
        resolution: null,
        resolvedAt: null,
        arbiter: null
      };

      escrow.disputeInfo = dispute;
      escrow.status = 'disputed';

      this.disputes.set(dispute.id, dispute);
      await this.saveEscrowToRedis(escrow);

      logger.info(
        `Dispute initiated for escrow ${escrowId} by participant ${disputantId}`
      );

      // Notify arbitration system
      await this.notifyArbitrationSystem(dispute);

      return dispute;

    } catch (error) {
      logger.error('Failed to initiate dispute:', error);
      throw error;
    }
  }

  /**
   * Emergency pause escrow (admin function)
   */
  async emergencyPause(escrowId, reason, adminAuthority) {
    try {
      if (!this.config.emergencyPauseEnabled) {
        throw new Error('Emergency pause not enabled');
      }

      const escrow = await this.getEscrow(escrowId);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      // Verify admin authority (would check against admin list in production)
      const isAdmin = process.env.ADMIN_AUTHORITIES?.includes(adminAuthority.toString());
      if (!isAdmin) {
        throw new Error('Insufficient authority for emergency pause');
      }

      escrow.status = 'paused';
      escrow.pausedAt = Date.now();
      escrow.pauseReason = reason;
      escrow.pausedBy = adminAuthority.toString();

      await this.saveEscrowToRedis(escrow);

      logger.warn(
        `EMERGENCY PAUSE: Escrow ${escrowId} paused by ${adminAuthority.toString()}. Reason: ${reason}`
      );

      return {
        escrowId,
        status: 'paused',
        pausedAt: escrow.pausedAt,
        reason
      };

    } catch (error) {
      logger.error('Failed to emergency pause escrow:', error);
      throw error;
    }
  }

  /**
   * Get escrow information
   */
  async getEscrow(escrowId) {
    // Check memory first
    if (this.activeEscrows.has(escrowId)) {
      return this.activeEscrows.get(escrowId);
    }

    // Load from Redis
    try {
      const escrowData = await redis.get(`escrow:${escrowId}`);
      if (escrowData) {
        const escrow = JSON.parse(escrowData);
        // Convert deposits Map
        escrow.deposits = new Map(Object.entries(escrow.deposits || {}));
        this.activeEscrows.set(escrowId, escrow);
        return escrow;
      }
    } catch (error) {
      logger.error(`Failed to load escrow ${escrowId}:`, error);
    }

    return null;
  }

  /**
   * Verify deposit transaction on blockchain
   */
  async verifyDepositTransaction(signature, fromWallet, toWallet, expectedAmount) {
    try {
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed'
      });

      if (!transaction) {
        return false;
      }

      // Verify transaction details
      const instruction = transaction.transaction.message.instructions[0];
      const accounts = transaction.transaction.message.accountKeys;
      
      // This is a simplified verification - production would be more thorough
      return transaction.meta.err === null;

    } catch (error) {
      logger.error('Transaction verification failed:', error);
      return false;
    }
  }

  /**
   * Generate unique escrow ID
   */
  generateEscrowId(escrowData) {
    const hash = require('crypto')
      .createHash('sha256')
      .update(`${escrowData.type}_${escrowData.eventId}_${Date.now()}`)
      .digest('hex');
    return hash.substring(0, 16);
  }

  /**
   * Save escrow to Redis
   */
  async saveEscrowToRedis(escrow) {
    try {
      const escrowData = {
        ...escrow,
        deposits: Object.fromEntries(escrow.deposits)
      };

      await redis.setex(
        `escrow:${escrow.id}`,
        86400, // 24 hours
        JSON.stringify(escrowData)
      );

      // Add to active escrows index
      if (escrow.status !== 'settled') {
        await redis.sadd('active_escrows', escrow.id);
      } else {
        await redis.srem('active_escrows', escrow.id);
      }

    } catch (error) {
      logger.error('Failed to save escrow to Redis:', error);
    }
  }

  // Additional helper methods would be implemented here...
  // executePayout, payPlatformFee, verifySettlementSignature, etc.
}

module.exports = { EscrowManager: new EscrowManager() };