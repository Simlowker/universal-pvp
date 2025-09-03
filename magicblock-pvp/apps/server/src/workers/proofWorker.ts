import { Job } from 'bullmq';
import { prisma } from '@/config/database';
import { vrfService } from '@/services/vrf';
import { logger } from '@/config/logger';
import { tracing } from '@/config/tracing';
// Prisma enum types - using string literals since direct enum imports are not working
type ProofStatus = 'PENDING' | 'VERIFIED' | 'INVALID' | 'EXPIRED';
type ProofType = 'GAME_STATE' | 'ACTION_VALID' | 'WIN_CONDITION' | 'RANDOMNESS';
type GameStatus = 'WAITING' | 'STARTING' | 'ACTIVE' | 'PAUSED' | 'SETTLING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

const ProofStatus = {
  PENDING: 'PENDING' as const,
  VERIFIED: 'VERIFIED' as const,
  INVALID: 'INVALID' as const,
  EXPIRED: 'EXPIRED' as const,
};

const ProofType = {
  GAME_STATE: 'GAME_STATE' as const,
  ACTION_VALID: 'ACTION_VALID' as const,
  WIN_CONDITION: 'WIN_CONDITION' as const,
  RANDOMNESS: 'RANDOMNESS' as const,
};

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

interface ProofVerificationJobData {
  gameId: string;
  proofId: string;
  proofData: any;
  deadline: Date;
  proofType: ProofType;
}

export async function processProofVerification(job: Job<ProofVerificationJobData>) {
  const { gameId, proofId, proofData, deadline, proofType } = job.data;
  const span = tracing.createGameSpan('verify_proof', gameId);
  
  try {
    span.setAttributes({
      'proof.id': proofId,
      'proof.type': proofType,
      'proof.deadline': deadline.toISOString(),
    });

    logger.info('Processing proof verification', {
      gameId,
      proofId,
      proofType,
      deadline,
      jobId: job.id,
    });

    // Check if deadline has passed
    if (new Date() > deadline) {
      await markProofExpired(proofId);
      logger.warn('Proof verification deadline exceeded', { proofId, deadline });
      return;
    }

    // Get proof from database
    const proof = await prisma.proof.findUnique({
      where: { id: proofId },
      include: { game: true },
    });

    if (!proof) {
      throw new Error(`Proof ${proofId} not found`);
    }

    if (proof.status !== ProofStatus.PENDING) {
      logger.info('Proof already processed', { proofId, status: proof.status });
      return;
    }

    // Verify proof based on type
    let verificationResult: boolean;
    
    switch (proofType) {
      case ProofType.RANDOMNESS:
        verificationResult = await verifyRandomnessProof(proof, proofData);
        break;
      case ProofType.GAME_STATE:
        verificationResult = await verifyGameStateProof(proof, proofData);
        break;
      case ProofType.ACTION_VALID:
        verificationResult = await verifyActionProof(proof, proofData);
        break;
      case ProofType.WIN_CONDITION:
        verificationResult = await verifyWinConditionProof(proof, proofData);
        break;
      default:
        throw new Error(`Unknown proof type: ${proofType}`);
    }

    // Update proof status
    await prisma.proof.update({
      where: { id: proofId },
      data: {
        status: verificationResult ? ProofStatus.VERIFIED : ProofStatus.INVALID,
        verifiedAt: new Date(),
      },
    });

    logger.info('Proof verification completed', {
      proofId,
      gameId,
      proofType,
      result: verificationResult ? 'verified' : 'invalid',
    });

    // Handle verification result
    if (verificationResult) {
      await handleVerifiedProof(proof, proofData);
    } else {
      await handleInvalidProof(proof, proofData);
    }

  } catch (error) {
    tracing.recordException(error as Error);
    logger.error('Proof verification failed', {
      gameId,
      proofId,
      error: (error as Error).message,
      jobId: job.id,
    });

    // Mark proof as invalid due to error
    await prisma.proof.update({
      where: { id: proofId },
      data: {
        status: ProofStatus.INVALID,
        verifiedAt: new Date(),
      },
    }).catch(dbError => {
      logger.error('Failed to update proof status after error', { proofId, error: dbError });
    });

    throw error;
  } finally {
    span.end();
  }
}

async function verifyRandomnessProof(proof: any, proofData: any): Promise<boolean> {
  try {
    const { seed, sequence, proofBuffer, gameId, player1Id, player2Id } = proofData;
    
    // Verify VRF proof
    const isValid = vrfService.validateGameSequence(
      gameId,
      player1Id,
      player2Id,
      seed,
      sequence,
      Buffer.from(proofBuffer, 'hex')
    );

    logger.debug('VRF proof verification', {
      proofId: proof.id,
      gameId,
      seed,
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('VRF proof verification error', { proofId: proof.id, error });
    return false;
  }
}

async function verifyGameStateProof(proof: any, proofData: any): Promise<boolean> {
  try {
    // Verify game state consistency
    const { gameState, previousHash, actionSequence } = proofData;
    
    // Calculate expected state hash
    const expectedHash = calculateGameStateHash(gameState, previousHash, actionSequence);
    const providedHash = proof.hash;

    const isValid = expectedHash === providedHash;

    logger.debug('Game state proof verification', {
      proofId: proof.id,
      gameId: proof.gameId,
      expectedHash,
      providedHash,
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('Game state proof verification error', { proofId: proof.id, error });
    return false;
  }
}

async function verifyActionProof(proof: any, proofData: any): Promise<boolean> {
  try {
    // Verify that an action is valid given the game state
    const { action, gameState, playerState } = proofData;
    
    // Implement action validation logic
    const isValid = validateActionAgainstState(action, gameState, playerState);

    logger.debug('Action proof verification', {
      proofId: proof.id,
      gameId: proof.gameId,
      action: action.type,
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('Action proof verification error', { proofId: proof.id, error });
    return false;
  }
}

async function verifyWinConditionProof(proof: any, proofData: any): Promise<boolean> {
  try {
    // Verify that win condition is met
    const { finalState, winCondition, gameHistory } = proofData;
    
    const isValid = validateWinCondition(finalState, winCondition, gameHistory);

    logger.debug('Win condition proof verification', {
      proofId: proof.id,
      gameId: proof.gameId,
      winCondition,
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('Win condition proof verification error', { proofId: proof.id, error });
    return false;
  }
}

async function handleVerifiedProof(proof: any, proofData: any): Promise<void> {
  // Handle successful proof verification
  logger.info('Proof verified successfully', {
    proofId: proof.id,
    gameId: proof.gameId,
    proofType: proof.proofType,
  });

  // Update game actions if this was an action proof
  if (proof.proofType === ProofType.ACTION_VALID) {
    await prisma.gameAction.updateMany({
      where: {
        gameId: proof.gameId,
        proofHash: proof.hash,
      },
      data: {
        isValid: true,
      },
    });
  }

  // If this was a win condition proof, trigger settlement
  if (proof.proofType === ProofType.WIN_CONDITION) {
    const { winnerId, amount, escrowSignature } = proofData;
    
    // Add settlement job
    const { addSettlementJob } = await import('./index');
    await addSettlementJob({
      gameId: proof.gameId,
      winnerId,
      escrowSignature,
      amount,
    });
  }
}

async function handleInvalidProof(proof: any, proofData: any): Promise<void> {
  logger.warn('Proof verification failed', {
    proofId: proof.id,
    gameId: proof.gameId,
    proofType: proof.proofType,
  });

  // Mark related game actions as invalid
  if (proof.proofType === ProofType.ACTION_VALID) {
    await prisma.gameAction.updateMany({
      where: {
        gameId: proof.gameId,
        proofHash: proof.hash,
      },
      data: {
        isValid: false,
      },
    });

    // Potentially flag the game for review or automatic refund
    await flagGameForReview(proof.gameId, 'Invalid action proof detected');
  }
}

async function markProofExpired(proofId: string): Promise<void> {
  await prisma.proof.update({
    where: { id: proofId },
    data: {
      status: ProofStatus.EXPIRED,
      verifiedAt: new Date(),
    },
  });
}

// Utility functions for proof verification
function calculateGameStateHash(gameState: any, previousHash: string, actionSequence: any[]): string {
  // Implement deterministic hash calculation
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  
  hash.update(JSON.stringify(gameState));
  hash.update(previousHash);
  hash.update(JSON.stringify(actionSequence));
  
  return hash.digest('hex');
}

function validateActionAgainstState(action: any, gameState: any, playerState: any): boolean {
  // Implement action validation logic
  // This would check if the action is possible given current game and player state
  
  // Example validations:
  // - Player has enough resources for the action
  // - Action is allowed in current game phase
  // - Action targets are valid
  // - Action doesn't violate game rules
  
  return true; // Simplified for demo
}

function validateWinCondition(finalState: any, winCondition: any, gameHistory: any[]): boolean {
  // Implement win condition validation
  // This would verify that the claimed win condition is actually met
  
  switch (winCondition.type) {
    case 'elimination':
      return finalState.loser.health <= 0;
    case 'timeout':
      return finalState.timeElapsed >= finalState.maxTime;
    case 'forfeit':
      return gameHistory.some((action: any) => action.type === 'SURRENDER');
    default:
      return false;
  }
}

async function flagGameForReview(gameId: string, reason: string): Promise<void> {
  // Flag game for manual review or automatic handling
  await prisma.game.update({
    where: { gameId },
    data: {
      status: GameStatus.DISPUTED,
    },
  });

  logger.warn('Game flagged for review', { gameId, reason });
  
  // In a production system, this might:
  // - Send alerts to administrators
  // - Trigger automatic refund processes
  // - Suspend player accounts temporarily
  // - Generate dispute resolution tickets
}