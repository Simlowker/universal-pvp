import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
// import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'; // Reserved for future Prometheus integration
// import { MeterProvider } from '@opentelemetry/sdk-metrics'; // Reserved for future metrics provider
import { Span } from '@opentelemetry/api';
import { IncomingMessage, ServerResponse } from 'http';
import { logger } from './logger';
import { config } from './environment';

let sdk: NodeSDK;

export function initializeTracing() {
  try {
    // Create resource
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'magicblock-pvp-server',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.server.env,
    });

    // Initialize SDK
    sdk = new NodeSDK({
      resource,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable some instrumentations if needed
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            requestHook: (span: Span, request: IncomingMessage | any) => {
              if ('headers' in request) {
                span.setAttributes({
                  'http.request.header.user-agent': request.headers['user-agent'] || '',
                  'http.request.header.x-forwarded-for': request.headers['x-forwarded-for'] || '',
                });
              }
            },
            responseHook: (span: Span, response: ServerResponse | any) => {
              if ('statusCode' in response) {
                span.setAttributes({
                  'http.response.status_code': response.statusCode,
                });
              }
            },
          },
          '@opentelemetry/instrumentation-redis': {
            enabled: true,
          },
        }),
      ],
    });

    // Start the SDK
    sdk.start();
    
    logger.info('✅ OpenTelemetry tracing initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize OpenTelemetry:', error);
  }
}

export function shutdownTracing(): Promise<void> {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}

// Custom tracing utilities
export const tracing = {
  // Create custom spans for game operations
  createGameSpan: (name: string, gameId: string, playerId?: string) => {
    const { trace } = require('@opentelemetry/api');
    const tracer = trace.getTracer('magicblock-pvp-game');
    
    return tracer.startSpan(name, {
      attributes: {
        'game.id': gameId,
        'game.player_id': playerId || '',
        'service.component': 'game-engine',
      },
    });
  },

  // Create spans for blockchain operations
  createBlockchainSpan: (name: string, transactionType: string, signature?: string) => {
    const { trace } = require('@opentelemetry/api');
    const tracer = trace.getTracer('magicblock-pvp-blockchain');
    
    return tracer.startSpan(name, {
      attributes: {
        'blockchain.network': 'solana',
        'blockchain.transaction.type': transactionType,
        'blockchain.transaction.signature': signature || '',
        'service.component': 'blockchain-integration',
      },
    });
  },

  // Create spans for database operations
  createDatabaseSpan: (name: string, table: string, operation: string) => {
    const { trace } = require('@opentelemetry/api');
    const tracer = trace.getTracer('magicblock-pvp-database');
    
    return tracer.startSpan(name, {
      attributes: {
        'db.system': 'postgresql',
        'db.name': 'magicblock_pvp',
        'db.operation': operation,
        'db.sql.table': table,
        'service.component': 'database',
      },
    });
  },

  // Create spans for queue operations
  createQueueSpan: (name: string, queueName: string, jobType: string) => {
    const { trace } = require('@opentelemetry/api');
    const tracer = trace.getTracer('magicblock-pvp-queue');
    
    return tracer.startSpan(name, {
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.destination': queueName,
        'messaging.operation': 'process',
        'job.type': jobType,
        'service.component': 'queue-worker',
      },
    });
  },

  // Add custom attributes to current span
  addAttributes: (attributes: Record<string, string | number | boolean>) => {
    const { trace } = require('@opentelemetry/api');
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  },

  // Record exceptions in spans
  recordException: (error: Error) => {
    const { trace } = require('@opentelemetry/api');
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: 2, // ERROR
        message: error.message,
      });
    }
  },

  // Set span status
  setStatus: (code: number, message?: string) => {
    const { trace } = require('@opentelemetry/api');
    const span = trace.getActiveSpan();
    if (span) {
      span.setStatus({ code, message });
    }
  },
};

// Middleware for Express to add tracing context
export function tracingMiddleware(req: any, _res: any, next: any) {
  const { trace } = require('@opentelemetry/api');
  const span = trace.getActiveSpan();
  
  if (span) {
    // Add request context
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.get('User-Agent') || '',
      'player.wallet_id': req.user?.walletId || '',
    });
  }

  next();
}