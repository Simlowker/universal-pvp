import { Worker, Job, Queue } from 'bullmq';
// import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { metricsUtils } from '@/config/metrics';
// import { redis } from '@/config/redis';

// Import worker processors
import { processSettlement } from './settlementWorker';
import { processProofVerification } from './proofWorker';
import { processTrendingCalculation } from './trendingWorker';

// Queue definitions
export const settlementQueue = new Queue('settlement', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const proofQueue = new Queue('proof-verification', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 1000,
    },
  },
});

export const trendingQueue = new Queue('trending-calculation', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
    // repeat: { cron: '*/5 * * * *' }, // Every 5 minutes - configured per job
  },
});

// Worker instances
let settlementWorker: Worker;
let proofWorker: Worker;
let trendingWorker: Worker;

export async function initializeWorkers() {
  try {
    // Settlement Worker
    settlementWorker = new Worker(
      'settlement',
      async (job: Job) => {
        const startTime = Date.now();
        try {
          await processSettlement(job);
          const duration = (Date.now() - startTime) / 1000;
          metricsUtils.recordQueueJob('settlement', job.name, duration, 'completed');
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          metricsUtils.recordQueueJob('settlement', job.name, duration, 'failed');
          throw error;
        }
      },
      {
        connection: { host: 'localhost', port: 6379 },
        concurrency: 2,
      }
    );

    // Proof Verification Worker
    proofWorker = new Worker(
      'proof-verification',
      async (job: Job) => {
        const startTime = Date.now();
        try {
          await processProofVerification(job);
          const duration = (Date.now() - startTime) / 1000;
          metricsUtils.recordQueueJob('proof-verification', job.name, duration, 'completed');
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          metricsUtils.recordQueueJob('proof-verification', job.name, duration, 'failed');
          throw error;
        }
      },
      {
        connection: { host: 'localhost', port: 6379 },
        concurrency: 3,
      }
    );

    // Trending Calculation Worker
    trendingWorker = new Worker(
      'trending-calculation',
      async (job: Job) => {
        const startTime = Date.now();
        try {
          await processTrendingCalculation(job);
          const duration = (Date.now() - startTime) / 1000;
          metricsUtils.recordQueueJob('trending-calculation', job.name, duration, 'completed');
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          metricsUtils.recordQueueJob('trending-calculation', job.name, duration, 'failed');
          throw error;
        }
      },
      {
        connection: { host: 'localhost', port: 6379 },
        concurrency: 1,
      }
    );

    // Setup event listeners
    setupWorkerEventListeners();

    // Schedule recurring jobs
    await scheduleRecurringJobs();

    logger.info('✅ All workers initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize workers:', error);
    throw error;
  }
}

function setupWorkerEventListeners() {
  // Settlement Worker Events
  settlementWorker.on('completed', (job) => {
    logger.info('Settlement job completed', { jobId: job.id, data: job.data });
  });

  settlementWorker.on('failed', (job, err) => {
    logger.error('Settlement job failed', { 
      jobId: job?.id, 
      error: err.message,
      data: job?.data 
    });
  });

  // Proof Worker Events
  proofWorker.on('completed', (job) => {
    logger.debug('Proof verification completed', { jobId: job.id });
  });

  proofWorker.on('failed', (job, err) => {
    logger.error('Proof verification failed', { 
      jobId: job?.id, 
      error: err.message 
    });
  });

  // Trending Worker Events
  trendingWorker.on('completed', (job) => {
    logger.debug('Trending calculation completed', { jobId: job.id });
  });

  trendingWorker.on('failed', (job, err) => {
    logger.error('Trending calculation failed', { 
      jobId: job?.id, 
      error: err.message 
    });
  });

  // Global error handlers
  [settlementWorker, proofWorker, trendingWorker].forEach(worker => {
    worker.on('error', (error) => {
      logger.error('Worker error:', error);
    });

    worker.on('stalled', (jobId) => {
      logger.warn('Job stalled:', { jobId });
    });
  });
}

async function scheduleRecurringJobs() {
  // Schedule trending calculation every 5 minutes
  await trendingQueue.add('calculate-trending', {}, {
    repeat: { pattern: '*/5 * * * *' },
    jobId: 'trending-calculation', // Prevent duplicates
  });

  // Schedule cleanup jobs
  await settlementQueue.add('cleanup-old-jobs', {}, {
    repeat: { pattern: '0 2 * * *' }, // Daily at 2 AM
    jobId: 'daily-cleanup',
  });

  logger.info('📅 Recurring jobs scheduled');
}

export async function shutdownWorkers() {
  try {
    await Promise.all([
      settlementWorker?.close(),
      proofWorker?.close(),
      trendingWorker?.close(),
    ]);

    await Promise.all([
      settlementQueue.close(),
      proofQueue.close(),
      trendingQueue.close(),
    ]);

    logger.info('✅ All workers shut down successfully');
  } catch (error) {
    logger.error('❌ Error shutting down workers:', error);
  }
}

// Job queue utilities
export const queues = {
  settlement: settlementQueue,
  proofVerification: proofQueue,
  trending: trendingQueue,
};

export async function addSettlementJob(data: {
  gameId: string;
  winnerId: string;
  escrowSignature: string;
  amount: number;
}) {
  return await settlementQueue.add('settle-game', data, {
    priority: 10, // High priority
  });
}

export async function addProofVerificationJob(data: {
  gameId: string;
  proofId: string;
  proofData: any;
  deadline: Date;
}) {
  const delay = Math.max(0, data.deadline.getTime() - Date.now());
  return await proofQueue.add('verify-proof', data, {
    delay: delay > 0 ? delay : 0,
    priority: 5,
  });
}

export async function getQueueStats() {
  const [settlementStats, proofStats, trendingStats] = await Promise.all([
    settlementQueue.getJobCounts(),
    proofQueue.getJobCounts(),
    trendingQueue.getJobCounts(),
  ]);

  return {
    settlement: settlementStats,
    proofVerification: proofStats,
    trending: trendingStats,
  };
}