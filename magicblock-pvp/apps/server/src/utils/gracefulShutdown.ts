import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '@/config/logger';
import { disconnectDatabase } from '@/config/database';
import { redisManager } from '@/config/redis';
import { shutdownWorkers } from '@/workers';
import { shutdownTracing } from '@/config/tracing';

interface ShutdownOptions {
  timeout?: number; // Maximum time to wait for graceful shutdown in ms
  signals?: string[]; // Process signals to listen for
}

export function gracefulShutdown(
  httpServer: Server,
  io: SocketIOServer,
  _expressApp: any,
  options: ShutdownOptions = {}
) {
  const {
    timeout = 30000, // 30 seconds default
    signals = ['SIGTERM', 'SIGINT', 'SIGUSR2']
  } = options;

  let isShuttingDown = false;
  let shutdownTimer: NodeJS.Timeout;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring signal:', signal);
      return;
    }

    isShuttingDown = true;
    logger.info(`🔄 Graceful shutdown initiated by ${signal}`);

    // Set a timeout to force shutdown if graceful shutdown takes too long
    shutdownTimer = setTimeout(() => {
      logger.error('⏰ Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, timeout);

    try {
      // Step 1: Stop accepting new connections
      logger.info('📡 Stopping HTTP server...');
      httpServer.close(async () => {
        logger.info('✅ HTTP server stopped');
      });

      // Step 2: Close WebSocket connections gracefully
      logger.info('🔌 Closing WebSocket connections...');
      const sockets = await io.fetchSockets();
      logger.info(`📊 Found ${sockets.length} active WebSocket connections`);
      
      // Notify clients about shutdown
      io.emit('server:shutdown', {
        message: 'Server is shutting down for maintenance',
        timestamp: new Date().toISOString(),
        gracePeriod: 10000, // 10 seconds grace period
      });

      // Give clients time to handle the shutdown notification
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Close all socket connections
      for (const socket of sockets) {
        socket.disconnect(true);
      }

      // Close Socket.IO server
      io.close(() => {
        logger.info('✅ WebSocket server stopped');
      });

      // Step 3: Stop workers and job queues
      logger.info('⚙️ Shutting down workers and job queues...');
      await shutdownWorkers();
      logger.info('✅ Workers stopped');

      // Step 4: Update player online status
      logger.info('👥 Updating player online status...');
      try {
        // Get all online players and mark them as offline
        const onlinePlayers = await redisManager.getOnlinePlayers();
        await Promise.all(
          onlinePlayers.map(playerId => redisManager.setPlayerOffline(playerId))
        );
        logger.info(`✅ Updated status for ${onlinePlayers.length} players`);
      } catch (error) {
        logger.error('❌ Error updating player status:', error);
      }

      // Step 5: Close database connections
      logger.info('🗄️ Closing database connections...');
      await disconnectDatabase();
      logger.info('✅ Database connections closed');

      // Step 6: Close Redis connections
      logger.info('🔴 Closing Redis connections...');
      await redisManager.disconnect();
      logger.info('✅ Redis connections closed');

      // Step 7: Shutdown telemetry and monitoring
      logger.info('📊 Shutting down telemetry...');
      await shutdownTracing();
      logger.info('✅ Telemetry stopped');

      // Step 8: Final cleanup
      clearTimeout(shutdownTimer);
      logger.info('🎉 Graceful shutdown completed successfully');
      
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error);
      clearTimeout(shutdownTimer);
      process.exit(1);
    }
  };

  // Register signal handlers
  for (const signal of signals) {
    process.on(signal, () => shutdown(signal));
  }

  // Handle uncaught exceptions during shutdown
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught exception during shutdown:', error);
    if (isShuttingDown) {
      process.exit(1);
    } else {
      shutdown('uncaughtException');
    }
  });

  // Handle unhandled promise rejections during shutdown
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('🚫 Unhandled rejection during shutdown:', { reason, promise });
    if (isShuttingDown) {
      process.exit(1);
    } else {
      shutdown('unhandledRejection');
    }
  });

  logger.info('🛡️ Graceful shutdown handlers registered');

  return {
    // Manual shutdown trigger for testing or API calls
    shutdown: () => shutdown('manual'),
    
    // Check if shutdown is in progress
    isShuttingDown: () => isShuttingDown,
    
    // Add custom cleanup function
    onShutdown: (callback: () => Promise<void> | void) => {
      const originalShutdown = shutdown;
      const newShutdown = async (signal: string) => {
        try {
          await callback();
        } catch (error) {
          logger.error('Error in custom shutdown callback:', error);
        }
        return originalShutdown(signal);
      };
      // Note: This modifies the closure, not reassigning const
      return newShutdown;
    }
  };
}

// Health check middleware that returns 503 during shutdown
export function healthCheckMiddleware() {
  let isShuttingDown = false;

  // Listen for shutdown signals
  ['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
      isShuttingDown = true;
    });
  });

  return (req: any, res: any, next: any) => {
    if (req.path === '/health' && isShuttingDown) {
      return res.status(503).json({
        status: 'shutting_down',
        message: 'Server is shutting down',
        timestamp: new Date().toISOString(),
      });
    }
    next();
  };
}

// Utility function to handle async operations during shutdown
export async function withShutdownTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Export types
export type GracefulShutdownHandler = ReturnType<typeof gracefulShutdown>;