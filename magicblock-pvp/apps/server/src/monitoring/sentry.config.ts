import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { 
  httpIntegration,
  expressIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  postgresIntegration,
  redisIntegration,
  rewriteFramesIntegration
} from '@sentry/node';

export interface SentryConfig {
  dsn?: string;
  environment: string;
  release?: string;
  enableProfiling?: boolean;
  enableTracing?: boolean;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
}

/**
 * Initialize Sentry for error tracking and performance monitoring
 */
export function initializeSentry(config: SentryConfig): void {
  if (!config.dsn) {
    console.warn('Sentry DSN not provided, error tracking disabled');
    return;
  }

  const integrations = [
    // Default integrations
    httpIntegration(),
    expressIntegration(),
    onUncaughtExceptionIntegration(),
    onUnhandledRejectionIntegration({ mode: 'warn' }),
    
    // Tracing integrations
    postgresIntegration(),
    redisIntegration(),
    
    // Custom integrations
    rewriteFramesIntegration({
      root: process.cwd(),
    }),
  ];

  // Add profiling if enabled
  if (config.enableProfiling) {
    integrations.push(nodeProfilingIntegration());
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    integrations,

    // Performance monitoring
    tracesSampleRate: config.tracesSampleRate ?? 0.1,
    profilesSampleRate: config.profilesSampleRate ?? 0.1,

    // Error filtering
    beforeSend(event, hint) {
      // Filter out non-critical errors
      if (event.exception?.values?.[0]?.type === 'NetworkError') {
        return null; // Don't send network errors
      }

      // Add custom context
      event.contexts = {
        ...event.contexts,
        game: {
          component: 'magicblock-pvp',
          version: process.env.npm_package_version,
        },
      };

      // Add default tags
      event.tags = {
        ...event.tags,
        component: 'magicblock-pvp-server',
        blockchain: 'solana',
      };

      return event;
    },

    // Performance event filtering
    beforeSendTransaction(event) {
      // Filter out health check transactions
      if (event.transaction?.includes('/health')) {
        return null;
      }

      return event;
    },

    // Custom tags - removed initialScope as it's deprecated, use beforeSend instead

    // Enable debug in development
    debug: config.environment === 'development',

    // Set max breadcrumbs
    maxBreadcrumbs: 100,
  });

  // Set up global scope with default values
  Sentry.withScope((scope) => {
    scope.setTag('component', 'magicblock-pvp-server');
    scope.setTag('blockchain', 'solana');
    scope.setContext('runtime', {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    });
  });

  // Set up custom error boundaries
  setupCustomErrorHandlers();
  
  console.log(`Sentry initialized for ${config.environment} environment`);
}

/**
 * Set up custom error handlers for specific game components
 */
function setupCustomErrorHandlers(): void {
  // Game engine errors
  Sentry.addEventProcessor((event) => {
    if (event.tags?.component === 'game-engine') {
      event.fingerprint = ['game-engine', event.exception?.values?.[0]?.type];
    }
    
    return event;
  });

  // VRF specific errors
  process.on('vrfError', (error: Error, gameId: string) => {
    Sentry.withScope((scope) => {
      scope.setTag('component', 'vrf');
      scope.setContext('game', { gameId });
      scope.setLevel('error');
      Sentry.captureException(error);
    });
  });

  // Blockchain transaction errors
  process.on('blockchainError', (error: Error, transactionId: string) => {
    Sentry.withScope((scope) => {
      scope.setTag('component', 'blockchain');
      scope.setContext('transaction', { transactionId });
      scope.setLevel('error');
      Sentry.captureException(error);
    });
  });
}

/**
 * Custom Sentry utilities for game-specific tracking
 */
export class GameSentryUtils {
  /**
   * Track game creation events
   */
  static trackGameCreation(gameId: string, playerId: string, betAmount: number): void {
    Sentry.addBreadcrumb({
      category: 'game',
      message: 'Game created',
      data: {
        gameId,
        playerId,
        betAmount,
      },
      level: 'info',
    });

    Sentry.setTag('last_game_action', 'create');
    Sentry.setContext('last_game', {
      id: gameId,
      action: 'create',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track game join events
   */
  static trackGameJoin(gameId: string, playerId: string): void {
    Sentry.addBreadcrumb({
      category: 'game',
      message: 'Player joined game',
      data: {
        gameId,
        playerId,
      },
      level: 'info',
    });

    Sentry.setTag('last_game_action', 'join');
  }

  /**
   * Track move submissions
   */
  static trackMoveSubmission(gameId: string, playerId: string, moveType: string): void {
    Sentry.addBreadcrumb({
      category: 'game',
      message: 'Move submitted',
      data: {
        gameId,
        playerId,
        moveType,
      },
      level: 'info',
    });
  }

  /**
   * Track VRF requests
   */
  static trackVRFRequest(gameId: string, requestId: string): void {
    Sentry.addBreadcrumb({
      category: 'vrf',
      message: 'VRF requested',
      data: {
        gameId,
        requestId,
      },
      level: 'info',
    });

    // Start VRF performance tracking
    // Note: In production, you should manage the span lifecycle properly
    // by returning the span and finishing it when VRF completes
    const span = Sentry.startInactiveSpan({
      name: 'vrf_request',
      op: 'vrf',
      attributes: {
        gameId,
        requestId,
      },
    });
    
    // Store span reference for completion tracking
    // You would typically store this in a VRF request context
    if (span) {
      console.log('VRF span started:', span.spanContext().spanId);
    }
  }

  /**
   * Track VRF completion
   */
  static trackVRFCompletion(gameId: string, requestId: string, latencyMs: number): void {
    Sentry.addBreadcrumb({
      category: 'vrf',
      message: 'VRF completed',
      data: {
        gameId,
        requestId,
        latencyMs,
      },
      level: latencyMs > 10 ? 'warning' : 'info',
    });

    // Add performance measurement
    Sentry.addBreadcrumb({
      category: 'performance',
      message: 'VRF latency',
      data: {
        latencyMs,
        threshold: 10,
        exceeded: latencyMs > 10,
      },
      level: latencyMs > 10 ? 'warning' : 'info',
    });
  }

  /**
   * Track game completion
   */
  static trackGameCompletion(gameId: string, winner: string, duration: number): void {
    Sentry.addBreadcrumb({
      category: 'game',
      message: 'Game completed',
      data: {
        gameId,
        winner,
        duration,
      },
      level: 'info',
    });

    Sentry.setTag('last_game_action', 'complete');
  }

  /**
   * Track performance issues
   */
  static trackPerformanceIssue(metric: string, value: number, threshold: number): void {
    if (value > threshold) {
      Sentry.withScope((scope) => {
        scope.setTag('performance_issue', metric);
        scope.setLevel('warning');
        scope.setContext('performance', {
          metric,
          value,
          threshold,
          exceeded_by: value - threshold,
        });

        Sentry.captureMessage(`Performance threshold exceeded: ${metric}`, 'warning');
      });
    }
  }

  /**
   * Track cost issues
   */
  static trackCostIssue(gameId: string, cost: number, threshold: number): void {
    if (cost > threshold) {
      Sentry.withScope((scope) => {
        scope.setTag('cost_issue', 'high_transaction_cost');
        scope.setLevel('warning');
        scope.setContext('cost', {
          gameId,
          cost,
          threshold,
          exceeded_by: cost - threshold,
        });

        Sentry.captureMessage('Transaction cost exceeded threshold', 'warning');
      });
    }
  }

  /**
   * Track blockchain connectivity issues
   */
  static trackBlockchainIssue(error: Error, rpcEndpoint: string): void {
    Sentry.withScope((scope) => {
      scope.setTag('blockchain_issue', 'connectivity');
      scope.setLevel('error');
      scope.setContext('blockchain', {
        rpcEndpoint,
        error: error.message,
      });

      Sentry.captureException(error);
    });
  }

  /**
   * Create custom span for performance tracking
   */
  static createSpan<T>(name: string, op: string, attributes?: Record<string, any>, callback?: () => T): T | undefined {
    return Sentry.startSpan({
      name,
      op,
      attributes,
    }, callback || (() => undefined));
  }

  /**
   * Set user context for tracking
   */
  static setUserContext(userId: string, username?: string, email?: string): void {
    Sentry.setUser({
      id: userId,
      username,
      email,
    });
  }

  /**
   * Clear user context
   */
  static clearUserContext(): void {
    Sentry.setUser(null);
  }
}

/**
 * Express middleware for Sentry error handling
 */
export function sentryErrorHandler(): any {
  return Sentry.expressErrorHandler({
    shouldHandleError(error: any) {
      // Only handle errors that should be reported
      return error.status === undefined || (typeof error.status === 'number' && error.status >= 500);
    },
  });
}

/**
 * Express middleware for Sentry request handling
 * Note: In Sentry v8+, request handling is automatically handled by expressIntegration
 * This function is kept for backwards compatibility but may not be needed
 */
export function sentryRequestHandler() {
  // In modern Sentry, this is handled automatically by the express integration
  // Return a no-op middleware for backwards compatibility
  return (req: any, res: any, next: any) => next();
}

/**
 * Health check function for Sentry
 */
export function sentryHealthCheck(): { status: string; configured: boolean; dsn?: string } {
  const client = Sentry.getClient();
  
  return {
    status: client ? 'active' : 'inactive',
    configured: !!client,
    dsn: client?.getDsn()?.toString(),
  };
}

/**
 * Manual error reporting function
 */
export function reportError(error: Error, context?: Record<string, any>): void {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        if (typeof value === 'object') {
          scope.setContext(key, value);
        } else {
          scope.setTag(key, value);
        }
      });
    }

    Sentry.captureException(error);
  });
}

/**
 * Manual message reporting function
 */
export function reportMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>): void {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        if (typeof value === 'object') {
          scope.setContext(key, value);
        } else {
          scope.setTag(key, value);
        }
      });
    }

    Sentry.captureMessage(message, level);
  });
}