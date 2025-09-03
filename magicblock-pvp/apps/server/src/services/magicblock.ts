import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { config } from '@/config/environment';
import { logger, gameLogger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
import { tracing } from '@/config/tracing';
import { BlockchainError } from '@/middleware/errorHandler';

export class MagicBlockSDKInstance {
  private connection: Connection;
  private programId: PublicKey;
  private authority: Keypair | null = null;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    
    if (config.solana.magicblockProgramId) {
      this.programId = new PublicKey(config.solana.magicblockProgramId);
    } else {
      throw new Error('MagicBlock program ID not configured');
    }

    if (config.solana.privateKey) {
      try {
        const keyArray = JSON.parse(config.solana.privateKey);
        this.authority = Keypair.fromSecretKey(new Uint8Array(keyArray));
      } catch (error) {
        logger.error('Failed to parse Solana private key:', error);
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const version = await this.connection.getVersion();
      return version !== null;
    } catch (error) {
      logger.error('Solana connection health check failed:', error);
      return false;
    }
  }

  async createEscrow(gameId: string, amount: number, player1: PublicKey, player2: PublicKey): Promise<string> {
    const span = tracing.createBlockchainSpan('create_escrow', 'escrow');
    
    try {
      if (!this.authority) {
        throw new BlockchainError('Authority keypair not configured');
      }

      const escrowAccount = Keypair.generate();
      const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Create escrow account with rent exemption
      const rentExemption = await this.connection.getMinimumBalanceForRentExemption(0);
      
      const createEscrowIx = SystemProgram.createAccount({
        fromPubkey: this.authority.publicKey,
        newAccountPubkey: escrowAccount.publicKey,
        lamports: rentExemption + amountLamports * 2, // Amount for both players
        space: 0,
        programId: this.programId,
      });

      const transaction = new Transaction().add(createEscrowIx);
      transaction.feePayer = this.authority.publicKey;

      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;

      // Sign transaction
      transaction.sign(this.authority, escrowAccount);

      // Send and confirm transaction
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      await this.connection.confirmTransaction(signature);

      // Record metrics
      const fee = await this.getTransactionFee(signature);
      metricsUtils.recordSolanaTransaction('escrow_create', 'confirmed', fee);

      gameLogger.transaction(signature, 'escrow_create', amountLamports, 'confirmed');
      
      span.setAttributes({
        'blockchain.transaction.signature': signature,
        'game.id': gameId,
        'escrow.amount': amountLamports,
      });

      return signature;
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to create escrow:', error);
      throw new BlockchainError('Failed to create escrow', gameId);
    } finally {
      span.end();
    }
  }

  async settleGame(gameId: string, winnerId: string, escrowSignature: string): Promise<string> {
    const span = tracing.createBlockchainSpan('settle_game', 'settlement');
    
    try {
      if (!this.authority) {
        throw new BlockchainError('Authority keypair not configured');
      }

      // In a real implementation, this would involve calling the MagicBlock program
      // to distribute the escrowed funds to the winner
      
      // For now, we'll create a simple transfer transaction
      const transaction = new Transaction();
      
      // Add settlement instructions here based on MagicBlock program interface
      // This is a placeholder implementation
      
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.authority.publicKey;

      transaction.sign(this.authority);

      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      await this.connection.confirmTransaction(signature);

      // Record metrics
      const fee = await this.getTransactionFee(signature);
      metricsUtils.recordSolanaTransaction('settlement', 'confirmed', fee);

      gameLogger.transaction(signature, 'settlement', 0, 'confirmed');
      
      span.setAttributes({
        'blockchain.transaction.signature': signature,
        'game.id': gameId,
        'winner.id': winnerId,
      });

      return signature;
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to settle game:', error);
      throw new BlockchainError('Failed to settle game', gameId);
    } finally {
      span.end();
    }
  }

  async refundEscrow(gameId: string, escrowSignature: string): Promise<string> {
    const span = tracing.createBlockchainSpan('refund_escrow', 'refund');
    
    try {
      if (!this.authority) {
        throw new BlockchainError('Authority keypair not configured');
      }

      // Create refund transaction
      const transaction = new Transaction();
      
      // Add refund instructions here
      
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.authority.publicKey;

      transaction.sign(this.authority);

      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      await this.connection.confirmTransaction(signature);

      // Record metrics
      const fee = await this.getTransactionFee(signature);
      metricsUtils.recordSolanaTransaction('refund', 'confirmed', fee);

      gameLogger.transaction(signature, 'refund', 0, 'confirmed');
      
      return signature;
    } catch (error) {
      tracing.recordException(error as Error);
      logger.error('Failed to refund escrow:', error);
      throw new BlockchainError('Failed to refund escrow', gameId);
    } finally {
      span.end();
    }
  }

  async getTransactionFee(signature: string): Promise<number> {
    try {
      const transaction = await this.connection.getTransaction(signature);
      return transaction?.meta?.fee ? transaction.meta.fee / LAMPORTS_PER_SOL : 0;
    } catch (error) {
      logger.warn('Failed to get transaction fee:', error);
      return 0;
    }
  }

  async getBalance(publicKey: PublicKey): Promise<number> {
    try {
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw new BlockchainError('Failed to get wallet balance');
    }
  }

  async validateWallet(walletAddress: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(walletAddress);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      return accountInfo !== null;
    } catch (error) {
      return false;
    }
  }

  // Game-specific MagicBlock integration
  async initializeGameState(gameId: string, player1: PublicKey, player2: PublicKey, gameData: any): Promise<string> {
    const span = tracing.createBlockchainSpan('initialize_game_state', 'game_init');
    
    try {
      // This would call MagicBlock program to initialize game state on-chain
      // For now, return a mock transaction signature
      const mockSignature = `game_init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      span.setAttributes({
        'game.id': gameId,
        'blockchain.transaction.signature': mockSignature,
      });
      
      return mockSignature;
    } catch (error) {
      tracing.recordException(error as Error);
      throw new BlockchainError('Failed to initialize game state', gameId);
    } finally {
      span.end();
    }
  }

  async submitGameAction(gameId: string, playerId: string, action: any): Promise<string> {
    const span = tracing.createBlockchainSpan('submit_game_action', 'game_action');
    
    try {
      // Submit action to MagicBlock program for verification and state update
      const mockSignature = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      span.setAttributes({
        'game.id': gameId,
        'game.player_id': playerId,
        'blockchain.transaction.signature': mockSignature,
      });
      
      return mockSignature;
    } catch (error) {
      tracing.recordException(error as Error);
      throw new BlockchainError('Failed to submit game action', gameId);
    } finally {
      span.end();
    }
  }

  async finalizeGame(gameId: string, finalState: any): Promise<string> {
    const span = tracing.createBlockchainSpan('finalize_game', 'game_finalize');
    
    try {
      // Finalize game state on MagicBlock
      const mockSignature = `finalize_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      span.setAttributes({
        'game.id': gameId,
        'blockchain.transaction.signature': mockSignature,
      });
      
      return mockSignature;
    } catch (error) {
      tracing.recordException(error as Error);
      throw new BlockchainError('Failed to finalize game', gameId);
    } finally {
      span.end();
    }
  }
}

export const magicBlockService = new MagicBlockSDKInstance();