import { Queue } from 'bullmq';
import { redis } from '@/config/redis';
import { logger } from '@/config/logger';
import { SettlementJobData } from '@/workers/settlement.worker';

// Create settlement queue with Redis connection
export const settlementQueue = new Queue<SettlementJobData>('settlement-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
      settings: {
        multiplier: 2,
        max: 30000
      }
    },
    removeOnComplete: 10,
    removeOnFail: 20
  }
});

// Queue event listeners for monitoring
settlementQueue.on('completed', (job) => {
  logger.info(`Settlement job ${job.id} completed`, {
    gameId: job.data.gameId,
    duration: job.processedOn ? job.finishedOn! - job.processedOn : undefined
  });
});

settlementQueue.on('failed', (job, err) => {
  logger.error(`Settlement job ${job?.id} failed`, {
    gameId: job?.data.gameId,
    error: err.message,
    attempts: job?.attemptsMade
  });
});

settlementQueue.on('stalled', (jobId) => {
  logger.warn(`Settlement job ${jobId} stalled`);
});

settlementQueue.on('waiting', (jobId) => {
  logger.debug(`Settlement job ${jobId} is waiting`);
});

settlementQueue.on('active', (job) => {
  logger.info(`Settlement job ${job.id} started processing`, {
    gameId: job.data.gameId
  });
});

// Helper functions for queue management
export const getSettlementJobStats = async () => {
  const waiting = await settlementQueue.getWaiting();
  const active = await settlementQueue.getActive();
  const completed = await settlementQueue.getCompleted();
  const failed = await settlementQueue.getFailed();

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    total: waiting.length + active.length
  };
};

export const getSettlementJobById = async (jobId: string) => {
  return await settlementQueue.getJob(jobId);
};

export const cancelSettlementJob = async (jobId: string) => {
  const job = await settlementQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Settlement job ${jobId} cancelled`);
    return true;
  }
  return false;
};

// Clean up old jobs periodically
export const cleanupSettlementQueue = async () => {
  try {
    // Remove completed jobs older than 24 hours
    await settlementQueue.clean(24 * 60 * 60 * 1000, 'completed');
    
    // Remove failed jobs older than 7 days
    await settlementQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
    
    logger.info('Settlement queue cleanup completed');
  } catch (error) {
    logger.error('Settlement queue cleanup failed:', error);
  }
};

logger.info('Settlement queue initialized');