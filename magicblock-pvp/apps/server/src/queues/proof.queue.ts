import { Queue } from 'bullmq';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { ProofJobData } from '@/workers/proof.worker';

// Create proof verification queue with Redis connection
export const proofQueue = new Queue<ProofJobData>('proof-verification-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
      settings: {
        multiplier: 1.5,
        max: 10000
      }
    },
    removeOnComplete: 25,
    removeOnFail: 50
  }
});

// Queue event listeners for monitoring
proofQueue.on('completed', (job) => {
  logger.info(`Proof verification job ${job.id} completed`, {
    gameId: job.data.gameId,
    proofType: job.data.proofType,
    duration: job.processedOn ? job.finishedOn! - job.processedOn : undefined
  });
});

proofQueue.on('failed', (job, err) => {
  logger.error(`Proof verification job ${job?.id} failed`, {
    gameId: job?.data.gameId,
    proofType: job?.data.proofType,
    error: err.message,
    attempts: job?.attemptsMade
  });
});

proofQueue.on('stalled', (jobId) => {
  logger.warn(`Proof verification job ${jobId} stalled`);
});

proofQueue.on('waiting', (jobId) => {
  logger.debug(`Proof verification job ${jobId} is waiting`);
});

proofQueue.on('active', (job) => {
  logger.info(`Proof verification job ${job.id} started processing`, {
    gameId: job.data.gameId,
    proofType: job.data.proofType
  });
});

// Helper functions for queue management
export const getProofJobStats = async () => {
  const waiting = await proofQueue.getWaiting();
  const active = await proofQueue.getActive();
  const completed = await proofQueue.getCompleted();
  const failed = await proofQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    total: waiting.length + active.length
  };
};

export const getProofJobById = async (jobId: string) => {
  return await proofQueue.getJob(jobId);
};

export const cancelProofJob = async (jobId: string) => {
  const job = await proofQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Proof verification job ${jobId} cancelled`);
    return true;
  }
  return false;
};

// Priority job submission helpers
export const submitHighPriorityProof = async (data: ProofJobData) => {
  return await proofQueue.add('verify-proof-urgent', data, {
    priority: 10,
    delay: 0
  });
};

export const submitBatchProofVerification = async (proofs: ProofJobData[]) => {
  const jobs = proofs.map((proof, index) => ({
    name: 'verify-proof-batch',
    data: proof,
    opts: {
      priority: 5,
      delay: index * 100 // Stagger by 100ms
    }
  }));

  return await proofQueue.addBulk(jobs);
};

// Clean up old jobs periodically
export const cleanupProofQueue = async () => {
  try {
    // Remove completed jobs older than 1 hour
    await proofQueue.clean(60 * 60 * 1000, 'completed');
    
    // Remove failed jobs older than 24 hours
    await proofQueue.clean(24 * 60 * 60 * 1000, 'failed');
    
    logger.info('Proof queue cleanup completed');
  } catch (error) {
    logger.error('Proof queue cleanup failed:', error);
  }
};

// Performance monitoring
export const getProofQueueMetrics = async () => {
  const stats = await getProofJobStats();
  const waitingJobs = await proofQueue.getWaiting();
  const activeJobs = await proofQueue.getActive();

  // Calculate average processing time for completed jobs
  const completedJobs = await proofQueue.getCompleted(0, 10);
  const avgProcessingTime = completedJobs.length > 0
    ? completedJobs.reduce((sum, job) => {
        return sum + (job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : 0);
      }, 0) / completedJobs.length
    : 0;

  // Get queue health metrics
  const oldestWaitingJob = waitingJobs.length > 0 ? waitingJobs[0] : null;
  const maxWaitTime = oldestWaitingJob ? Date.now() - oldestWaitingJob.timestamp : 0;

  return {
    ...stats,
    avgProcessingTime: Math.round(avgProcessingTime),
    maxWaitTime: Math.round(maxWaitTime),
    throughput: {
      perMinute: completedJobs.length, // Approximate
      perHour: completedJobs.length * 6 // Very rough estimate
    },
    health: {
      status: stats.failed > stats.completed * 0.1 ? 'degraded' : 'healthy',
      backlog: stats.waiting + stats.active,
      failureRate: stats.total > 0 ? (stats.failed / stats.total) : 0
    }
  };
};

logger.info('Proof verification queue initialized');