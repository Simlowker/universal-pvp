/**
 * DevNet Endpoints Configuration for MagicBlock Integration
 * Real endpoints for devnet-router.magicblock.app
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface MagicBlockEndpoints {
  rpc: string;
  ws: string;
  rollup: string;
  router: string;
  switchboard: {
    program: PublicKey;
    queue: PublicKey;
    authority: PublicKey;
  };
  programs: {
    bolt: PublicKey;
    gum: PublicKey;
    ephemeralRollups: PublicKey;
  };
}

export interface NetworkConfig {
  devnet: MagicBlockEndpoints;
  testnet: MagicBlockEndpoints;
  mainnet: MagicBlockEndpoints;
}

/**
 * MagicBlock DevNet Configuration
 * Updated endpoints for real devnet integration
 */
export const MAGICBLOCK_DEVNET_CONFIG: MagicBlockEndpoints = {
  // Primary RPC endpoint via MagicBlock router
  rpc: 'https://devnet-router.magicblock.app',
  
  // WebSocket endpoint for real-time subscriptions
  ws: 'wss://devnet-router.magicblock.app',
  
  // Ephemeral Rollups endpoint
  rollup: 'https://devnet-rollup.magicblock.app',
  
  // Magic Router API endpoint
  router: 'https://api.devnet.magicblock.app/v1',
  
  // Switchboard VRF configuration for devnet
  switchboard: {
    program: new PublicKey('2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG'),
    queue: new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR'),
    authority: new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
  },
  
  // MagicBlock Program IDs on devnet
  programs: {
    bolt: new PublicKey('BoLT6R7CgzC3gBh17FKEXvAu6iVbWRXm9HJhC4jMcPjv'),
    gum: new PublicKey('GUMsUMdqfyVG2wyXR9F4ghehV1TmjxGb5uDiJJF6d3X8'),
    ephemeralRollups: new PublicKey('MagicRo11ups1111111111111111111111111111111')
  }
};

/**
 * Network configurations for different environments
 */
export const MAGICBLOCK_NETWORKS: NetworkConfig = {
  devnet: MAGICBLOCK_DEVNET_CONFIG,
  
  testnet: {
    rpc: 'https://testnet-router.magicblock.app',
    ws: 'wss://testnet-router.magicblock.app',
    rollup: 'https://testnet-rollup.magicblock.app',
    router: 'https://api.testnet.magicblock.app/v1',
    switchboard: {
      program: new PublicKey('2TfB33aLaneQb5TNVwyDz3jSZXS6jdW2ARw1Dgf84XCG'),
      queue: new PublicKey('GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR'),
      authority: new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
    },
    programs: {
      bolt: new PublicKey('BoLT6R7CgzC3gBh17FKEXvAu6iVbWRXm9HJhC4jMcPjv'),
      gum: new PublicKey('GUMsUMdqfyVG2wyXR9F4ghehV1TmjxGb5uDiJJF6d3X8'),
      ephemeralRollups: new PublicKey('MagicRo11ups1111111111111111111111111111111')
    }
  },
  
  mainnet: {
    rpc: 'https://mainnet-router.magicblock.app',
    ws: 'wss://mainnet-router.magicblock.app',
    rollup: 'https://mainnet-rollup.magicblock.app',
    router: 'https://api.mainnet.magicblock.app/v1',
    switchboard: {
      program: new PublicKey('SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f'),
      queue: new PublicKey('A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w'),
      authority: new PublicKey('31Sof5r1xi7dfcaz4x9Kuwm8J9ueAdDduMcme59sP8gc')
    },
    programs: {
      bolt: new PublicKey('BoLT6R7CgzC3gBh17FKEXvAu6iVbWRXm9HJhC4jMcPjv'),
      gum: new PublicKey('GUMsUMdqfyVG2wyXR9F4ghehV1TmjxGb5uDiJJF6d3X8'),
      ephemeralRollups: new PublicKey('MagicRo11ups1111111111111111111111111111111')
    }
  }
};

/**
 * Connection factory with optimized settings for gaming
 */
export function createMagicBlockConnection(
  network: 'devnet' | 'testnet' | 'mainnet' = 'devnet',
  options: {
    commitment?: 'processed' | 'confirmed' | 'finalized';
    wsEndpoint?: string;
    httpHeaders?: Record<string, string>;
    disableRetryOnRateLimit?: boolean;
  } = {}
): Connection {
  const config = MAGICBLOCK_NETWORKS[network];
  
  const connectionConfig = {
    commitment: options.commitment || 'processed', // Fastest for gaming
    wsEndpoint: options.wsEndpoint || config.ws,
    httpHeaders: {
      'User-Agent': 'MagicBlock-PvP-Client/1.0',
      'X-Client-Version': '1.0.0',
      ...options.httpHeaders
    },
    disableRetryOnRateLimit: options.disableRetryOnRateLimit || false,
    confirmTransactionInitialTimeout: 30000, // 30s timeout
    
    // Optimize for real-time gaming
    fetch: async (url: string, options: any) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Cache-Control': 'no-cache',
          'Priority': 'u=1', // High priority for gaming requests
        },
        // Add connection keep-alive for better performance
        keepalive: true
      });
      return response;
    }
  };
  
  console.log(`🔗 Connected to MagicBlock ${network}: ${config.rpc}`);
  
  return new Connection(config.rpc, connectionConfig);
}

/**
 * Health check for MagicBlock endpoints
 */
export async function checkMagicBlockHealth(
  network: 'devnet' | 'testnet' | 'mainnet' = 'devnet'
): Promise<{
  network: string;
  rpc: { status: 'healthy' | 'degraded' | 'down'; latency: number };
  rollup: { status: 'healthy' | 'degraded' | 'down'; latency: number };
  router: { status: 'healthy' | 'degraded' | 'down'; latency: number };
}> {
  const config = MAGICBLOCK_NETWORKS[network];
  
  // Check RPC health
  const rpcStart = performance.now();
  let rpcStatus: 'healthy' | 'degraded' | 'down' = 'down';
  let rpcLatency = 0;
  
  try {
    const connection = new Connection(config.rpc);
    await connection.getSlot('processed');
    rpcLatency = performance.now() - rpcStart;
    rpcStatus = rpcLatency < 100 ? 'healthy' : 'degraded';
  } catch (error) {
    rpcLatency = performance.now() - rpcStart;
    console.error(`RPC health check failed for ${network}:`, error);
  }
  
  // Check Rollup endpoint
  const rollupStart = performance.now();
  let rollupStatus: 'healthy' | 'degraded' | 'down' = 'down';
  let rollupLatency = 0;
  
  try {
    const response = await fetch(`${config.rollup}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    rollupLatency = performance.now() - rollupStart;
    rollupStatus = response.ok && rollupLatency < 200 ? 'healthy' : 'degraded';
  } catch (error) {
    rollupLatency = performance.now() - rollupStart;
    console.error(`Rollup health check failed for ${network}:`, error);
  }
  
  // Check Router API
  const routerStart = performance.now();
  let routerStatus: 'healthy' | 'degraded' | 'down' = 'down';
  let routerLatency = 0;
  
  try {
    const response = await fetch(`${config.router}/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    routerLatency = performance.now() - routerStart;
    routerStatus = response.ok && routerLatency < 150 ? 'healthy' : 'degraded';
  } catch (error) {
    routerLatency = performance.now() - routerStart;
    console.error(`Router health check failed for ${network}:`, error);
  }
  
  return {
    network,
    rpc: { status: rpcStatus, latency: rpcLatency },
    rollup: { status: rollupStatus, latency: rollupLatency },
    router: { status: routerStatus, latency: routerLatency }
  };
}

/**
 * Auto-select best MagicBlock endpoint based on latency
 */
export async function selectOptimalEndpoint(
  preferredNetwork: 'devnet' | 'testnet' | 'mainnet' = 'devnet'
): Promise<{
  network: 'devnet' | 'testnet' | 'mainnet';
  connection: Connection;
  endpoints: MagicBlockEndpoints;
}> {
  console.log('🔍 Selecting optimal MagicBlock endpoint...');
  
  const healthChecks = await Promise.allSettled([
    checkMagicBlockHealth('devnet'),
    checkMagicBlockHealth('testnet'),
    checkMagicBlockHealth('mainnet')
  ]);
  
  const validNetworks = healthChecks
    .filter((check): check is PromiseFulfilledResult<any> => 
      check.status === 'fulfilled'
    )
    .map(check => check.value)
    .filter(health => health.rpc.status !== 'down')
    .sort((a, b) => a.rpc.latency - b.rpc.latency);
  
  // Prefer the requested network if it's healthy
  const preferredHealth = validNetworks.find(h => h.network === preferredNetwork);
  const selectedNetwork = preferredHealth || validNetworks[0];
  
  if (!selectedNetwork) {
    throw new Error('No healthy MagicBlock endpoints available');
  }
  
  const networkKey = selectedNetwork.network as 'devnet' | 'testnet' | 'mainnet';
  const connection = createMagicBlockConnection(networkKey);
  const endpoints = MAGICBLOCK_NETWORKS[networkKey];
  
  console.log(`✅ Selected MagicBlock ${networkKey} (${selectedNetwork.rpc.latency.toFixed(1)}ms)`);
  
  return {
    network: networkKey,
    connection,
    endpoints
  };
}

/**
 * Get program addresses for specific network
 */
export function getMagicBlockPrograms(
  network: 'devnet' | 'testnet' | 'mainnet' = 'devnet'
): {
  bolt: PublicKey;
  gum: PublicKey;
  ephemeralRollups: PublicKey;
  switchboard: PublicKey;
} {
  const config = MAGICBLOCK_NETWORKS[network];
  
  return {
    bolt: config.programs.bolt,
    gum: config.programs.gum,
    ephemeralRollups: config.programs.ephemeralRollups,
    switchboard: config.switchboard.program
  };
}

/**
 * Environment-specific configuration
 */
export function getEnvironmentConfig(): {
  network: 'devnet' | 'testnet' | 'mainnet';
  isDevelopment: boolean;
  enableVRF: boolean;
  enableRollups: boolean;
  maxLatencyMs: number;
} {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const magicNetwork = (process.env.MAGIC_NETWORK as any) || 'devnet';
  
  return {
    network: magicNetwork,
    isDevelopment: nodeEnv === 'development',
    enableVRF: process.env.ENABLE_VRF !== 'false',
    enableRollups: process.env.ENABLE_ROLLUPS !== 'false',
    maxLatencyMs: parseInt(process.env.MAX_LATENCY_MS || '30')
  };
}

export default {
  MAGICBLOCK_DEVNET_CONFIG,
  MAGICBLOCK_NETWORKS,
  createMagicBlockConnection,
  checkMagicBlockHealth,
  selectOptimalEndpoint,
  getMagicBlockPrograms,
  getEnvironmentConfig
};