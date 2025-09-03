import 'reflect-metadata';
import { config } from '@/config/environment';
import { logger } from '@/config/logger';
import { createApp } from '@/server';
import { initializeMetrics } from '@/config/metrics';
import { initializeTracing } from '@/config/tracing';
import { gracefulShutdown } from '@/utils/gracefulShutdown';

async function bootstrap() {
  try {
    // Initialize monitoring
    initializeTracing();
    initializeMetrics();
    
    // Create and start server
    const { server, io } = await createApp();
    
    const httpServer = server.listen(config.server.port, config.server.host, () => {
      logger.info(`🚀 Server running on ${config.server.host}:${config.server.port}`);
      logger.info(`📊 Metrics available on port ${config.monitoring.prometheusPort}`);
      logger.info(`🎮 WebSocket server ready for connections`);
      logger.info(`📚 Environment: ${config.server.env}`);
    });

    // Setup graceful shutdown
    gracefulShutdown(httpServer, io, server);
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrap();