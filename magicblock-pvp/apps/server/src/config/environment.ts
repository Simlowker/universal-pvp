import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // Solana
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_PRIVATE_KEY: z.string().optional(),
  MAGICBLOCK_PROGRAM_ID: z.string().optional(),
  
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('localhost'),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // Game Settings
  MATCH_TIMEOUT_MS: z.coerce.number().default(300000), // 5 minutes
  PROOF_VERIFICATION_TIMEOUT_MS: z.coerce.number().default(30000), // 30 seconds
  MIN_BET_AMOUNT: z.coerce.number().default(0.01),
  MAX_BET_AMOUNT: z.coerce.number().default(10),
  
  // Monitoring
  PROMETHEUS_PORT: z.coerce.number().default(9464),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  
  // Cost Tracking
  COST_TRACKING_ENABLED: z.coerce.boolean().default(true),
  COST_ALERT_THRESHOLD_USD: z.coerce.number().default(100),
});

const env = envSchema.parse(process.env);

export const config = {
  server: {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
  },
  solana: {
    rpcUrl: env.SOLANA_RPC_URL,
    privateKey: env.SOLANA_PRIVATE_KEY,
    magicblockProgramId: env.MAGICBLOCK_PROGRAM_ID,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  cors: {
    origin: env.CORS_ORIGIN,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  game: {
    matchTimeoutMs: env.MATCH_TIMEOUT_MS,
    proofVerificationTimeoutMs: env.PROOF_VERIFICATION_TIMEOUT_MS,
    minBetAmount: env.MIN_BET_AMOUNT,
    maxBetAmount: env.MAX_BET_AMOUNT,
  },
  monitoring: {
    prometheusPort: env.PROMETHEUS_PORT,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  costs: {
    trackingEnabled: env.COST_TRACKING_ENABLED,
    alertThresholdUsd: env.COST_ALERT_THRESHOLD_USD,
  },
} as const;

export type Config = typeof config;