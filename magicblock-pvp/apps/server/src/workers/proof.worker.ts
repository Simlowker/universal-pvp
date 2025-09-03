import { Job, Worker } from 'bullmq';
import { logger } from '@/config/logger';
import { redis } from '@/config/redis';
import { prisma } from '@/config/database';

export interface ProofJobData {
  gameId: string;
  playerId: string;
  actionId: string;
  proofType: 'GAME_STATE' | 'ACTION_VALID' | 'WIN_CONDITION' | 'RANDOMNESS';
  proofData: any;
  priority?: 'low' | 'normal' | 'high';
  timeout?: number;
}

export interface ProofVerificationResult {
  isValid: boolean;
  proofHash: string;
  verificationTime: number;
  error?: string;
  metadata?: any;
}

class ProofWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker('proof-verification-queue', this.processProof.bind(this), {
      connection: redis,
      concurrency: 5, // Process up to 5 proofs concurrently
      limiter: {
        max: 50, // Max 50 proofs
        duration: 60000 // per minute
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000, // Start with 1 second
          settings: {
            multiplier: 1.5,
            max: 10000 // Max 10 seconds
          }
        },
        removeOnComplete: 25,
        removeOnFail: 50
      }
    });

    this.worker.on('completed', (job: Job<ProofJobData, ProofVerificationResult>) => {
      logger.info(`Proof verification job ${job.id} completed`, {
        gameId: job.data.gameId,
        proofType: job.data.proofType,
        result: job.returnvalue
      });
    });

    this.worker.on('failed', (job: Job<ProofJobData> | undefined, err: Error) => {
      if (job) {
        logger.error(`Proof verification job ${job.id} failed`, {
          gameId: job.data.gameId,
          proofType: job.data.proofType,
          error: err.message
        });
      }
    });

    logger.info('Proof worker initialized');
  }

  private async processProof(job: Job<ProofJobData>): Promise<ProofVerificationResult> {
    const { gameId, playerId, actionId, proofType, proofData, timeout = 30000 } = job.data;
    const startTime = Date.now();

    try {
      logger.info(`Verifying proof for game ${gameId}`, {
        proofType,
        playerId,
        actionId,
        jobId: job.id
      });

      // Set timeout for proof verification
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Proof verification timeout')), timeout);
      });

      const verificationPromise = this.verifyProofByType(proofType, proofData, { gameId, playerId, actionId });

      // Race between verification and timeout
      const verificationResult = await Promise.race([verificationPromise, timeoutPromise]);

      const verificationTime = Date.now() - startTime;
      const proofHash = this.generateProofHash(proofData);

      // Store proof in database
      await prisma.proof.create({
        data: {
          gameId,
          playerId,
          proofType,
          proofData,
          hash: proofHash,
          status: verificationResult.isValid ? 'VERIFIED' : 'INVALID',
          verifiedAt: verificationResult.isValid ? new Date() : null,
          verifier: 'proof-worker'
        }
      });

      // Update game action if applicable
      if (actionId) {
        await prisma.gameAction.update({
          where: { id: actionId },
          data: {
            proofHash,
            isValid: verificationResult.isValid
          }
        });
      }

      // Cache verification result
      await redis.setex(
        `proof:${proofHash}`, 
        3600, // 1 hour cache
        JSON.stringify({
          isValid: verificationResult.isValid,
          verificationTime,
          timestamp: new Date().toISOString()
        })
      );

      const result: ProofVerificationResult = {
        isValid: verificationResult.isValid,
        proofHash,
        verificationTime,
        error: verificationResult.error,
        metadata: verificationResult.metadata
      };

      logger.info(`Proof verification completed for game ${gameId}`, {
        proofType,
        isValid: result.isValid,
        verificationTime: result.verificationTime
      });

      return result;

    } catch (error: any) {
      logger.error(`Proof verification failed for game ${gameId}:`, error);

      const verificationTime = Date.now() - startTime;
      const proofHash = this.generateProofHash(proofData);

      // Store failed proof
      try {
        await prisma.proof.create({
          data: {
            gameId,
            playerId,
            proofType,
            proofData,
            hash: proofHash,
            status: 'INVALID',
            verifier: 'proof-worker'
          }
        });
      } catch (dbError) {
        logger.error('Failed to store invalid proof:', dbError);
      }

      return {
        isValid: false,
        proofHash,
        verificationTime,
        error: error.message
      };
    }
  }

  private async verifyProofByType(
    proofType: string, 
    proofData: any, 
    context: { gameId: string; playerId: string; actionId: string }
  ): Promise<{ isValid: boolean; error?: string; metadata?: any }> {
    
    switch (proofType) {
      case 'GAME_STATE':
        return this.verifyGameStateProof(proofData, context);
      
      case 'ACTION_VALID':
        return this.verifyActionValidityProof(proofData, context);
      
      case 'WIN_CONDITION':
        return this.verifyWinConditionProof(proofData, context);
      
      case 'RANDOMNESS':
        return this.verifyRandomnessProof(proofData, context);
      
      default:
        return {
          isValid: false,
          error: `Unknown proof type: ${proofType}`
        };
    }
  }

  private async verifyGameStateProof(
    proofData: any, 
    context: { gameId: string; playerId: string; actionId: string }
  ): Promise<{ isValid: boolean; error?: string; metadata?: any }> {
    try {
      // Verify game state proof
      // This would typically involve:
      // 1. Checking state transitions are valid
      // 2. Verifying cryptographic proofs (ZK-SNARKs, etc.)
      // 3. Ensuring game rules are followed

      const { stateRoot, previousStateRoot, stateTransition, signature } = proofData;

      if (!stateRoot || !stateTransition) {
        return {
          isValid: false,
          error: 'Missing required proof components'
        };
      }

      // Get previous game state from database
      const game = await prisma.game.findUnique({
        where: { gameId: context.gameId },
        include: { actions: { orderBy: { timestamp: 'desc' }, take: 10 } }
      });

      if (!game) {
        return {
          isValid: false,
          error: 'Game not found'
        };
      }

      // Verify state transition is valid
      const isValidTransition = this.validateStateTransition(
        previousStateRoot || game.stateRoot,
        stateRoot,
        stateTransition
      );

      if (!isValidTransition) {
        return {
          isValid: false,
          error: 'Invalid state transition'
        };
      }

      // Verify signature if provided
      if (signature) {
        const isValidSignature = await this.verifySignature(signature, stateRoot, context.playerId);
        if (!isValidSignature) {
          return {
            isValid: false,
            error: 'Invalid signature'
          };
        }
      }

      return {
        isValid: true,
        metadata: {
          stateRoot,
          transitionType: stateTransition.type
        }
      };

    } catch (error: any) {
      return {
        isValid: false,
        error: `Game state proof verification failed: ${error.message}`
      };
    }
  }

  private async verifyActionValidityProof(
    proofData: any, 
    context: { gameId: string; playerId: string; actionId: string }
  ): Promise<{ isValid: boolean; error?: string; metadata?: any }> {
    try {
      const { action, gameState, proof } = proofData;

      if (!action || !gameState || !proof) {
        return {
          isValid: false,
          error: 'Missing action validity proof components'
        };
      }

      // Get current game state
      const game = await prisma.game.findUnique({
        where: { gameId: context.gameId }
      });

      if (!game) {
        return {
          isValid: false,
          error: 'Game not found'
        };
      }

      // Verify action is valid in current game state
      const isValidAction = this.validateAction(action, gameState, game);
      
      if (!isValidAction.valid) {
        return {
          isValid: false,
          error: isValidAction.error
        };
      }

      // Verify cryptographic proof
      const isValidProof = await this.verifyCryptographicProof(proof, action, gameState);
      
      if (!isValidProof) {
        return {
          isValid: false,
          error: 'Invalid cryptographic proof'
        };
      }

      return {
        isValid: true,
        metadata: {
          actionType: action.type,
          gameState: gameState.hash
        }
      };

    } catch (error: any) {
      return {
        isValid: false,
        error: `Action validity proof verification failed: ${error.message}`
      };
    }
  }

  private async verifyWinConditionProof(
    proofData: any, 
    context: { gameId: string; playerId: string; actionId: string }
  ): Promise<{ isValid: boolean; error?: string; metadata?: any }> {
    try {
      const { finalState, winCondition, proof } = proofData;

      if (!finalState || !winCondition || !proof) {
        return {
          isValid: false,
          error: 'Missing win condition proof components'
        };
      }

      // Get game and verify final state
      const game = await prisma.game.findUnique({
        where: { gameId: context.gameId },
        include: { 
          player1: true, 
          player2: true,
          actions: { orderBy: { timestamp: 'asc' } }
        }
      });

      if (!game) {
        return {
          isValid: false,
          error: 'Game not found'
        };
      }

      // Verify win condition logic
      const winValidation = this.validateWinCondition(finalState, winCondition, game);
      
      if (!winValidation.valid) {
        return {
          isValid: false,
          error: winValidation.error
        };
      }

      // Verify the proof shows the win condition was met
      const isValidProof = await this.verifyWinProof(proof, finalState, winCondition);
      
      if (!isValidProof) {
        return {
          isValid: false,
          error: 'Win condition proof is invalid'
        };
      }

      return {
        isValid: true,
        metadata: {
          winner: winCondition.winner,
          reason: winCondition.reason,
          finalScore: finalState.score
        }
      };

    } catch (error: any) {
      return {
        isValid: false,
        error: `Win condition proof verification failed: ${error.message}`
      };
    }
  }

  private async verifyRandomnessProof(
    proofData: any, 
    context: { gameId: string; playerId: string; actionId: string }
  ): Promise<{ isValid: boolean; error?: string; metadata?: any }> {
    try {
      const { vrfOutput, vrfProof, seed, publicKey } = proofData;

      if (!vrfOutput || !vrfProof || !seed) {
        return {
          isValid: false,
          error: 'Missing VRF proof components'
        };
      }

      // Verify VRF proof
      const isValidVRF = await this.verifyVRFProof(vrfProof, seed, vrfOutput, publicKey);
      
      if (!isValidVRF) {
        return {
          isValid: false,
          error: 'Invalid VRF proof'
        };
      }

      // Verify randomness was used correctly in game
      const randomnessValidation = await this.validateRandomnessUsage(vrfOutput, context.gameId);
      
      if (!randomnessValidation.valid) {
        return {
          isValid: false,
          error: randomnessValidation.error
        };
      }

      return {
        isValid: true,
        metadata: {
          vrfOutput,
          seed,
          randomnessHash: this.hashRandomness(vrfOutput)
        }
      };

    } catch (error: any) {
      return {
        isValid: false,
        error: `Randomness proof verification failed: ${error.message}`
      };
    }
  }

  // Helper methods for proof verification
  private validateStateTransition(previousRoot: string, newRoot: string, transition: any): boolean {
    // Implement state transition validation logic
    // This would verify that the state change is valid according to game rules
    return true; // Simplified for this example
  }

  private async verifySignature(signature: string, data: string, playerId: string): Promise<boolean> {
    // Implement signature verification
    // This would verify the player's signature on the state data
    return true; // Simplified for this example
  }

  private validateAction(action: any, gameState: any, game: any): { valid: boolean; error?: string } {
    // Implement game action validation
    // This would check if the action is legal in the current game state
    return { valid: true }; // Simplified for this example
  }

  private async verifyCryptographicProof(proof: any, action: any, gameState: any): Promise<boolean> {
    // Implement cryptographic proof verification
    // This would verify ZK proofs, signatures, etc.
    return true; // Simplified for this example
  }

  private validateWinCondition(finalState: any, winCondition: any, game: any): { valid: boolean; error?: string } {
    // Implement win condition validation
    // This would check if the claimed win is valid according to game rules
    return { valid: true }; // Simplified for this example
  }

  private async verifyWinProof(proof: any, finalState: any, winCondition: any): Promise<boolean> {
    // Implement win condition proof verification
    return true; // Simplified for this example
  }

  private async verifyVRFProof(vrfProof: string, seed: string, output: string, publicKey?: string): Promise<boolean> {
    // Implement VRF proof verification
    // This would verify the VRF proof is valid for the given seed and output
    return true; // Simplified for this example
  }

  private async validateRandomnessUsage(vrfOutput: string, gameId: string): Promise<{ valid: boolean; error?: string }> {
    // Implement randomness usage validation
    // This would check if the randomness was used correctly in the game
    return { valid: true }; // Simplified for this example
  }

  private generateProofHash(proofData: any): string {
    // Generate a hash of the proof data for identification
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(proofData)).digest('hex');
  }

  private hashRandomness(vrfOutput: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(vrfOutput).digest('hex');
  }

  async close(): Promise<void> {
    await this.worker.close();
    logger.info('Proof worker closed');
  }
}

// Create and export worker instance
export const proofWorker = new ProofWorker();