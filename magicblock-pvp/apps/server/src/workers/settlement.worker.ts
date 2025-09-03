import { Job, Worker } from 'bullmq';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { redis } from '@/config/redis';
import { prisma } from '@/config/database';
import { gameService } from '@/services/game.service';
import { feeEstimationService } from '@/services/feeEstimation.service';

export interface SettlementJobData {
  gameId: string;
  winnerId?: string;
  winReason: string;
  finalProof: string;
  stateRoot: string;
  retryCount?: number;
  originalJobId?: string;
}

export interface SettlementResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  payouts?: {
    winnerId: string;
    amount: number;
    loserRefund?: number;
  };
  costs: {
    transactionFee: number;
    computeUnits: number;
    costUsd: number;
  };
}

class SettlementWorker {
  private worker: Worker;
  private connection: Connection;
  
  constructor() {
    this.connection = new Connection(config.solana.rpcUrl || clusterApiUrl('devnet'));
    
    this.worker = new Worker('settlement-queue', this.processSettlement.bind(this), {
      connection: redis,
      concurrency: 3, // Process up to 3 settlements concurrently
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000 // per minute
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // Start with 2 seconds
          settings: {
            multiplier: 2,
            max: 30000 // Max 30 seconds
          }
        },
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 20      // Keep last 20 failed jobs
      }
    });

    this.worker.on('completed', (job: Job<SettlementJobData, SettlementResult>) => {
      logger.info(`Settlement job ${job.id} completed`, {
        gameId: job.data.gameId,
        result: job.returnvalue
      });
    });

    this.worker.on('failed', (job: Job<SettlementJobData> | undefined, err: Error) => {
      if (job) {
        logger.error(`Settlement job ${job.id} failed`, {
          gameId: job.data.gameId,
          error: err.message,
          attempts: job.attemptsMade
        });
      }
    });

    this.worker.on('stalled', (jobId: string) => {
      logger.warn(`Settlement job ${jobId} stalled`);
    });

    logger.info('Settlement worker initialized');
  }

  private async processSettlement(job: Job<SettlementJobData>): Promise<SettlementResult> {
    const { gameId, winnerId, winReason, finalProof, stateRoot } = job.data;
    const startTime = Date.now();
    
    try {
      logger.info(`Processing settlement for game ${gameId}`, {
        winnerId,
        winReason,
        jobId: job.id
      });

      // Update job progress
      await job.updateProgress(10);

      // Get game data
      const game = await prisma.game.findUnique({
        where: { gameId },
        include: {
          player1: true,
          player2: true
        }
      });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      if (game.status !== 'ACTIVE' && game.status !== 'SETTLING') {
        throw new Error(`Game ${gameId} is not in a settleable state: ${game.status}`);
      }

      await job.updateProgress(25);

      // Verify the final proof
      const isValidProof = await this.verifyGameProof(game, finalProof, stateRoot);
      if (!isValidProof) {
        throw new Error('Invalid game proof provided');
      }

      await job.updateProgress(40);

      // Estimate settlement costs
      const feeEstimate = await feeEstimationService.estimateFee({
        operation: 'game_settlement',
        complexity: 'high',
        urgency: 'normal',
        computeUnits: 150000 // Estimate for settlement transaction
      });

      await job.updateProgress(55);

      // Calculate payouts
      const payouts = this.calculatePayouts(game, winnerId, feeEstimate.totalFee);

      // Execute settlement transaction
      const transactionResult = await this.executeSettlementTransaction(
        game,
        payouts,
        finalProof,
        stateRoot
      );

      await job.updateProgress(80);

      // Update game status in database
      await prisma.$transaction(async (tx) => {
        // Update game
        await tx.game.update({
          where: { id: game.id },
          data: {
            status: 'COMPLETED',
            winnerId: winnerId,
            winReason: winReason as any,
            endedAt: new Date(),
            settlementTx: transactionResult.signature,
            finalProof: finalProof,
            stateRoot: stateRoot
          }
        });

        // Update player stats
        if (winnerId) {
          const winner = winnerId === game.player1Id ? game.player1 : game.player2;
          const loser = winnerId === game.player1Id ? game.player2 : game.player1;

          if (winner && loser) {
            // Update winner stats
            await tx.player.update({
              where: { id: winner.id },
              data: {
                gamesWon: { increment: 1 },
                gamesPlayed: { increment: 1 },
                totalEarnings: { increment: payouts.winnerAmount },
                netPnL: { increment: payouts.winnerAmount - Number(game.betAmount) }
              }
            });

            // Update loser stats
            await tx.player.update({
              where: { id: loser.id },
              data: {
                gamesLost: { increment: 1 },
                gamesPlayed: { increment: 1 },
                totalSpent: { increment: Number(game.betAmount) },
                netPnL: { decrement: Number(game.betAmount) - (payouts.loserRefund || 0) }
              }
            });
          }
        }

        // Record cost metrics
        await tx.costMetrics.create({
          data: {
            playerId: game.player1Id, // Could split between players
            category: 'TRANSACTION_FEE',
            operation: 'game_settlement',
            costUsd: feeEstimate.costUsd,
            solanaFees: feeEstimate.totalFee,
            computeUnits: transactionResult.computeUnits || BigInt(0),
            gameId: game.gameId,
            metadata: {
              winnerId,
              winReason,
              transactionSignature: transactionResult.signature
            }
          }
        });
      });

      await job.updateProgress(95);

      // Clear game from Redis cache
      await redis.del(`game:${gameId}:state`);
      await redis.del(`game:${gameId}:players`);
      await redis.del(`game:${gameId}:actions`);

      await job.updateProgress(100);

      const result: SettlementResult = {
        success: true,
        transactionId: transactionResult.signature,
        payouts: {
          winnerId: winnerId || '',
          amount: payouts.winnerAmount,
          loserRefund: payouts.loserRefund
        },
        costs: {
          transactionFee: feeEstimate.totalFee,
          computeUnits: Number(transactionResult.computeUnits || 0),
          costUsd: feeEstimate.costUsd
        }
      };

      const duration = Date.now() - startTime;
      logger.info(`Settlement completed for game ${gameId}`, {
        duration,
        transactionId: result.transactionId,
        costs: result.costs
      });

      return result;

    } catch (error: any) {
      logger.error(`Settlement failed for game ${gameId}:`, error);

      // Update game status to disputed if this is the final attempt
      if (job.attemptsMade >= 3) {
        await prisma.game.update({
          where: { gameId },
          data: {
            status: 'DISPUTED',
            endedAt: new Date()
          }
        });

        // Could trigger dispute resolution process here
      }

      throw error;
    }
  }

  private async verifyGameProof(game: any, finalProof: string, stateRoot: string): Promise<boolean> {
    try {
      // In a real implementation, this would verify the ZK proof
      // For now, we'll do basic validation
      
      if (!finalProof || finalProof.length < 32) {
        return false;
      }
      
      if (!stateRoot || stateRoot.length < 32) {
        return false;
      }

      // Check if proof was generated recently (within game timeout)
      const gameStarted = new Date(game.startedAt).getTime();
      const now = Date.now();
      const gameDuration = now - gameStarted;
      
      if (gameDuration > config.game.matchTimeoutMs) {
        logger.warn(`Game ${game.gameId} exceeded timeout`, { gameDuration });
      }

      // Additional proof verification would go here
      // - Verify ZK proof structure
      // - Validate state transitions
      // - Check game rules compliance

      return true;
    } catch (error) {
      logger.error('Proof verification failed:', error);
      return false;
    }
  }

  private calculatePayouts(game: any, winnerId?: string, transactionFee: number = 0) {
    const betAmount = Number(game.betAmount);
    const totalPot = betAmount * 2;
    const houseEdge = Number(game.houseEdge) || 0.05; // 5% default
    
    const houseShare = totalPot * houseEdge;
    const playerShare = totalPot - houseShare - (transactionFee / 1e9); // Convert lamports to SOL
    
    if (!winnerId) {
      // Draw - refund both players minus small fee
      const refundAmount = betAmount - (houseShare / 2) - (transactionFee / 2e9);
      return {
        winnerAmount: 0,
        loserRefund: refundAmount,
        houseShare,
        player1Refund: refundAmount,
        player2Refund: refundAmount
      };
    }
    
    return {
      winnerAmount: playerShare,
      loserRefund: 0,
      houseShare
    };
  }

  private async executeSettlementTransaction(
    game: any,
    payouts: any,
    finalProof: string,
    stateRoot: string
  ): Promise<{ signature: string; computeUnits?: bigint }> {
    try {
      // In a real implementation, this would:
      // 1. Create settlement transaction
      // 2. Include the final proof and state root
      // 3. Distribute payouts according to the calculation
      // 4. Submit to Solana network
      
      // For now, we'll simulate the transaction
      const mockSignature = `settlement_${game.gameId}_${Date.now()}`;
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate random success/failure for testing retry logic
      if (Math.random() < 0.1) { // 10% chance of failure
        throw new Error('Network congestion - transaction failed');
      }
      
      return {
        signature: mockSignature,
        computeUnits: BigInt(120000) // Estimated compute units used
      };
      
    } catch (error) {
      logger.error('Settlement transaction failed:', error);
      throw error;
    }
  }

  // Congestion-aware scheduling
  private async shouldDelayForCongestion(): Promise<number> {
    try {
      // Check network congestion
      const performanceSamples = await this.connection.getRecentPerformanceSamples(5);
      
      if (performanceSamples.length === 0) {
        return 0; // No delay if we can't determine congestion
      }
      
      const avgSlotTime = performanceSamples.reduce((sum, sample) => 
        sum + (sample.samplePeriodSecs / sample.numSlots), 0
      ) / performanceSamples.length;
      
      // If slots are taking longer than usual, add delay
      if (avgSlotTime > 0.6) { // More than 600ms per slot indicates congestion
        const delayMs = Math.min((avgSlotTime - 0.4) * 30000, 180000); // Max 3 minutes delay
        logger.info(`Network congestion detected, delaying settlement`, { avgSlotTime, delayMs });
        return delayMs;
      }
      
      return 0;
    } catch (error) {
      logger.warn('Failed to check network congestion:', error);
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Settlement worker closed');
  }
}

// Create and export worker instance
export const settlementWorker = new SettlementWorker();