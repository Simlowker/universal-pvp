const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const bs58 = require('bs58');

const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');

class SolanaService {
  constructor() {
    this.connection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    this.programId = new PublicKey(process.env.PROGRAM_ID);
    this.treasuryWallet = new PublicKey(process.env.TREASURY_WALLET);
    this.feePercentage = parseFloat(process.env.PLATFORM_FEE || '0.05'); // 5% default
  }

  /**
   * Verify wallet signature for authentication
   */
  async verifyWalletSignature(walletAddress, signature, message) {
    try {
      const publicKey = new PublicKey(walletAddress);
      const signatureBuffer = bs58.decode(signature);
      const messageBuffer = new TextEncoder().encode(message);

      // Note: This is a simplified verification
      // In production, you'd use nacl.sign.detached.verify
      return true; // Placeholder for actual verification

    } catch (error) {
      logger.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get SOL balance for a wallet
   */
  async getBalance(walletAddress) {
    try {
      const publicKey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;

    } catch (error) {
      logger.error('Get balance error:', error);
      throw new Error('Failed to fetch wallet balance');
    }
  }

  /**
   * Monitor transactions for a specific wallet
   */
  async monitorWalletTransactions(walletAddress, callback) {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Subscribe to account changes
      const subscriptionId = this.connection.onAccountChange(
        publicKey,
        (accountInfo, context) => {
          callback({
            wallet: walletAddress,
            lamports: accountInfo.lamports,
            slot: context.slot
          });
        },
        'confirmed'
      );

      return subscriptionId;

    } catch (error) {
      logger.error('Monitor wallet error:', error);
      throw new Error('Failed to monitor wallet transactions');
    }
  }

  /**
   * Create escrow account for game wagers
   */
  async createEscrowAccount(gameId, players, wagerAmount) {
    try {
      // Generate a unique escrow account for this game
      const escrowKeypair = new Keypair();
      const escrowAccount = escrowKeypair.publicKey;

      const escrowData = {
        gameId,
        players,
        wagerAmount,
        totalAmount: wagerAmount * players.length,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      // Store escrow data in Redis
      await redis.setex(
        `escrow:${gameId}`,
        3600, // 1 hour expiration
        JSON.stringify(escrowData)
      );

      logger.info(`Escrow account created for game ${gameId}: ${escrowAccount.toString()}`);
      return escrowAccount.toString();

    } catch (error) {
      logger.error('Create escrow error:', error);
      throw new Error('Failed to create escrow account');
    }
  }

  /**
   * Release escrow funds to winner
   */
  async releaseEscrow(gameId, winnerId, winnerWallet) {
    try {
      const escrowKey = `escrow:${gameId}`;
      const escrowDataStr = await redis.get(escrowKey);
      
      if (!escrowDataStr) {
        throw new Error('Escrow account not found');
      }

      const escrowData = JSON.parse(escrowDataStr);
      
      if (escrowData.status !== 'active') {
        throw new Error('Escrow already processed');
      }

      // Calculate winner payout (total wager minus platform fee)
      const totalAmount = escrowData.totalAmount;
      const platformFee = totalAmount * this.feePercentage;
      const winnerPayout = totalAmount - platformFee;

      // Update escrow status
      escrowData.status = 'released';
      escrowData.winnerId = winnerId;
      escrowData.winnerWallet = winnerWallet;
      escrowData.platformFee = platformFee;
      escrowData.winnerPayout = winnerPayout;
      escrowData.releasedAt = new Date().toISOString();

      await redis.setex(escrowKey, 86400, JSON.stringify(escrowData)); // Keep for 24 hours

      logger.info(
        `Escrow released for game ${gameId}. Winner: ${winnerId}, ` +
        `Payout: ${winnerPayout} SOL, Fee: ${platformFee} SOL`
      );

      // In production, this would create and send the actual transaction
      return {
        success: true,
        winnerId,
        winnerPayout,
        platformFee,
        transactionId: 'mock_tx_' + Date.now() // Mock transaction ID
      };

    } catch (error) {
      logger.error('Release escrow error:', error);
      throw new Error('Failed to release escrow funds');
    }
  }

  /**
   * Refund escrow in case of game cancellation
   */
  async refundEscrow(gameId) {
    try {
      const escrowKey = `escrow:${gameId}`;
      const escrowDataStr = await redis.get(escrowKey);
      
      if (!escrowDataStr) {
        throw new Error('Escrow account not found');
      }

      const escrowData = JSON.parse(escrowDataStr);
      
      if (escrowData.status !== 'active') {
        throw new Error('Escrow already processed');
      }

      // Update escrow status
      escrowData.status = 'refunded';
      escrowData.refundedAt = new Date().toISOString();

      await redis.setex(escrowKey, 86400, JSON.stringify(escrowData));

      logger.info(`Escrow refunded for game ${gameId}`);

      return {
        success: true,
        gameId,
        refundAmount: escrowData.wagerAmount,
        players: escrowData.players
      };

    } catch (error) {
      logger.error('Refund escrow error:', error);
      throw new Error('Failed to refund escrow');
    }
  }

  /**
   * Get transaction confirmation
   */
  async confirmTransaction(signature, maxRetries = 30) {
    try {
      let retries = 0;
      
      while (retries < maxRetries) {
        const status = await this.connection.getSignatureStatus(signature);
        
        if (status.value?.confirmationStatus === 'confirmed' || 
            status.value?.confirmationStatus === 'finalized') {
          return {
            confirmed: true,
            slot: status.context.slot,
            confirmationStatus: status.value.confirmationStatus
          };
        }

        if (status.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }

        // Wait 2 seconds before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
      }

      throw new Error('Transaction confirmation timeout');

    } catch (error) {
      logger.error('Confirm transaction error:', error);
      throw error;
    }
  }

  /**
   * Get recent transactions for program
   */
  async getProgramTransactions(limit = 100) {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        this.programId,
        { limit }
      );

      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          try {
            const tx = await this.connection.getTransaction(sig.signature, {
              commitment: 'confirmed'
            });
            return {
              signature: sig.signature,
              slot: sig.slot,
              blockTime: sig.blockTime,
              transaction: tx
            };
          } catch (error) {
            logger.warn(`Failed to fetch transaction ${sig.signature}:`, error);
            return null;
          }
        })
      );

      return transactions.filter(tx => tx !== null);

    } catch (error) {
      logger.error('Get program transactions error:', error);
      throw new Error('Failed to fetch program transactions');
    }
  }

  /**
   * Create program instruction for game action
   */
  async createGameInstruction(action, gameId, playerWallet, data) {
    try {
      // This would create the actual program instruction
      // For now, return a mock instruction structure
      return {
        programId: this.programId.toString(),
        action,
        gameId,
        playerWallet,
        data,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Create game instruction error:', error);
      throw new Error('Failed to create game instruction');
    }
  }

  /**
   * Validate program state
   */
  async validateProgramState(gameId) {
    try {
      // This would query the on-chain program state
      // For now, return mock validation
      return {
        valid: true,
        gameId,
        lastUpdated: Date.now()
      };

    } catch (error) {
      logger.error('Validate program state error:', error);
      throw new Error('Failed to validate program state');
    }
  }

  /**
   * Get network status and performance metrics
   */
  async getNetworkStatus() {
    try {
      const [
        slot,
        blockTime,
        version,
        supply
      ] = await Promise.all([
        this.connection.getSlot(),
        this.connection.getBlockTime(await this.connection.getSlot()),
        this.connection.getVersion(),
        this.connection.getSupply()
      ]);

      return {
        slot,
        blockTime,
        version,
        supply: supply.value,
        rpcUrl: this.connection.rpcEndpoint
      };

    } catch (error) {
      logger.error('Get network status error:', error);
      throw new Error('Failed to get network status');
    }
  }

  /**
   * Calculate platform fees
   */
  calculatePlatformFee(amount) {
    return amount * this.feePercentage;
  }

  /**
   * Get treasury wallet balance
   */
  async getTreasuryBalance() {
    try {
      const balance = await this.connection.getBalance(this.treasuryWallet);
      return balance / LAMPORTS_PER_SOL;

    } catch (error) {
      logger.error('Get treasury balance error:', error);
      throw new Error('Failed to get treasury balance');
    }
  }
}

module.exports = { SolanaService: new SolanaService() };