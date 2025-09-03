import { Job } from 'bullmq';
import { prisma } from '@/config/database';
import { magicBlockService } from '@/services/magicblock';
import { costTrackingService } from '@/services/costTracking';
import { logger, gameLogger } from '@/config/logger';
import { tracing } from '@/config/tracing';
// Prisma enum types - using string literals since direct enum imports are not working
type GameStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
type TransactionType = 'DEPOSIT' | 'WITHDRAWAL' | 'BET' | 'WINNINGS' | 'FEE' | 'REFUND';

const GameStatus = {
  WAITING: 'WAITING' as const,
  STARTING: 'STARTING' as const,
  ACTIVE: 'ACTIVE' as const,
  PAUSED: 'PAUSED' as const,
  SETTLING: 'SETTLING' as const,
  COMPLETED: 'COMPLETED' as const,
  CANCELLED: 'CANCELLED' as const,
  DISPUTED: 'DISPUTED' as const,
};

const TransactionStatus = {
  PENDING: 'PENDING' as const,
  CONFIRMED: 'CONFIRMED' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
};

const TransactionType = {
  DEPOSIT: 'DEPOSIT' as const,
  WITHDRAWAL: 'WITHDRAWAL' as const,
  BET: 'BET' as const,
  WINNINGS: 'WINNINGS' as const,
  FEE: 'FEE' as const,
  REFUND: 'REFUND' as const,
};
import Decimal from 'decimal.js';

interface SettlementJobData {
  gameId: string;
  winnerId: string;
  escrowSignature: string;
  amount: number;
  attempts?: number;
}

export async function processSettlement(job: Job<SettlementJobData>) {
  const { gameId, winnerId, escrowSignature, amount } = job.data;
  const span = tracing.createBlockchainSpan('process_settlement', 'settlement');
  
  try {
    span.setAttributes({
      'game.id': gameId,
      'winner.id': winnerId,
      'escrow.signature': escrowSignature,
      'settlement.amount': amount,
    });

    logger.info('Processing game settlement', {
      gameId,
      winnerId,
      escrowSignature,
      amount,
      jobId: job.id,
    });

    // Get game details
    const game = await prisma.game.findUnique({
      where: { gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }

    if (game.status !== GameStatus.SETTLING && game.status !== GameStatus.COMPLETED) {
      throw new Error(`Game ${gameId} is not ready for settlement (status: ${game.status})`);
    }

    // Check if settlement already processed
    if (game.settlementTx) {
      logger.warn('Settlement already processed', { gameId, settlementTx: game.settlementTx });
      return;
    }

    // Update game status to settling
    await prisma.game.update({
      where: { gameId },
      data: { status: GameStatus.SETTLING },
    });

    // Process blockchain settlement
    const settlementSignature = await magicBlockService.settleGame(
      gameId,
      winnerId,
      escrowSignature
    );

    // Calculate amounts
    const totalBet = game.betAmount.mul(2); // Both players' bets
    const platformFee = totalBet.mul(0.05); // 5% platform fee
    const winnerAmount = totalBet.sub(platformFee);

    // Create transactions
    const transactions = await createSettlementTransactions(
      game,
      winnerId,
      winnerAmount,
      platformFee,
      settlementSignature
    );

    // Update game with settlement info
    await prisma.game.update({
      where: { gameId },
      data: {
        status: GameStatus.COMPLETED,
        settlementTx: settlementSignature,
      },
    });

    // Update player earnings
    await updatePlayerEarnings(winnerId, winnerAmount);

    // Record costs
    await costTrackingService.recordTransactionCost(
      settlementSignature,
      gameId,
      winnerId
    );

    gameLogger.transaction(settlementSignature, 'settlement', winnerAmount.toNumber(), 'confirmed');
    
    logger.info('Game settlement completed', {
      gameId,
      winnerId,
      settlementSignature,
      winnerAmount: winnerAmount.toNumber(),
      platformFee: platformFee.toNumber(),
    });

    // Notify players via WebSocket (if connected)
    await notifyPlayersSettlement(game, winnerId, winnerAmount, settlementSignature);

  } catch (error) {
    tracing.recordException(error as Error);
    logger.error('Settlement processing failed', {
      gameId,
      winnerId,
      error: (error as Error).message,
      jobId: job.id,
    });

    // Update game status back to completed if settlement fails
    await prisma.game.update({
      where: { gameId },
      data: { status: GameStatus.COMPLETED },
    }).catch(dbError => {
      logger.error('Failed to update game status after settlement error', {
        gameId,
        error: dbError,
      });
    });

    throw error;
  } finally {
    span.end();
  }
}

async function createSettlementTransactions(
  game: any,
  winnerId: string,
  winnerAmount: Decimal,
  platformFee: Decimal,
  settlementSignature: string
): Promise<void> {
  const transactions = [
    // Winner's payout
    {
      playerId: winnerId,
      type: TransactionType.WINNINGS,
      amount: winnerAmount,
      signature: settlementSignature,
      status: TransactionStatus.CONFIRMED,
      metadata: {
        gameId: game.gameId,
        escrowTx: game.escrowTx,
        settlementType: 'winner_payout',
      },
    },
    // Platform fee
    {
      playerId: game.player1Id, // Associate with player1 for tracking
      type: TransactionType.FEE,
      amount: platformFee,
      signature: `${settlementSignature}_fee`,
      status: TransactionStatus.CONFIRMED,
      metadata: {
        gameId: game.gameId,
        feeType: 'platform_fee',
        feeRate: 0.05,
      },
    },
  ];

  await prisma.transaction.createMany({
    data: transactions.map(tx => ({
      ...tx,
      confirmedAt: new Date(),
    })),
  });
}

async function updatePlayerEarnings(winnerId: string, amount: Decimal): Promise<void> {
  await prisma.player.update({
    where: { id: winnerId },
    data: {
      totalEarnings: { increment: amount },
      lastActiveAt: new Date(),
    },
  });
}

async function notifyPlayersSettlement(
  game: any,
  winnerId: string,
  winnerAmount: Decimal,
  settlementSignature: string
): Promise<void> {
  // This would integrate with WebSocket service to notify connected players
  // For now, we'll just log the notification
  logger.info('Settlement notification', {
    gameId: game.gameId,
    winnerId,
    loserId: winnerId === game.player1Id ? game.player2Id : game.player1Id,
    winnerAmount: winnerAmount.toNumber(),
    settlementSignature,
  });

  // In a real implementation, you would emit WebSocket events like:
  // io.to(winnerId).emit('gameSettled', { gameId: game.gameId, won: true, amount: winnerAmount });
  // io.to(loserId).emit('gameSettled', { gameId: game.gameId, won: false, amount: 0 });
}

// Handle settlement failures and refunds
export async function processRefund(job: Job<{
  gameId: string;
  escrowSignature: string;
  reason: string;
}>) {
  const { gameId, escrowSignature, reason } = job.data;
  const span = tracing.createBlockchainSpan('process_refund', 'refund');
  
  try {
    logger.info('Processing game refund', {
      gameId,
      escrowSignature,
      reason,
      jobId: job.id,
    });

    const game = await prisma.game.findUnique({
      where: { gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }

    // Process refund on blockchain
    const refundSignature = await magicBlockService.refundEscrow(gameId, escrowSignature);

    // Create refund transactions
    const refundAmount = game.betAmount;
    const refundTransactions = [
      {
        playerId: game.player1Id,
        type: TransactionType.REFUND,
        amount: refundAmount,
        signature: `${refundSignature}_p1`,
        status: TransactionStatus.CONFIRMED,
        metadata: {
          gameId,
          refundReason: reason,
          originalEscrow: escrowSignature,
        },
      },
    ];

    if (game.player2Id) {
      refundTransactions.push({
        playerId: game.player2Id,
        type: TransactionType.REFUND,
        amount: refundAmount,
        signature: `${refundSignature}_p2`,
        status: TransactionStatus.CONFIRMED,
        metadata: {
          gameId,
          refundReason: reason,
          originalEscrow: escrowSignature,
        },
      });
    }

    await prisma.transaction.createMany({
      data: refundTransactions.map(tx => ({
        ...tx,
        confirmedAt: new Date(),
      })),
    });

    // Update game status
    await prisma.game.update({
      where: { gameId },
      data: {
        status: GameStatus.CANCELLED,
        settlementTx: refundSignature,
      },
    });

    // Record costs
    await costTrackingService.recordTransactionCost(refundSignature, gameId);

    logger.info('Game refund completed', {
      gameId,
      refundSignature,
      refundAmount: refundAmount.toNumber(),
      reason,
    });

  } catch (error) {
    tracing.recordException(error as Error);
    logger.error('Refund processing failed', {
      gameId,
      escrowSignature,
      reason,
      error: (error as Error).message,
      jobId: job.id,
    });
    throw error;
  } finally {
    span.end();
  }
}