/**
 * Environment configuration
 */

export const environment = {
  // Solana Network Configuration
  SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  SOLANA_NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet',
  
  // MagicBlock Configuration
  MAGICBLOCK_RPC_URL: process.env.NEXT_PUBLIC_MAGICBLOCK_RPC_URL || 'https://devnet.magicblock.app',
  MAGICBLOCK_CHAIN_ID: process.env.NEXT_PUBLIC_MAGICBLOCK_CHAIN_ID || 'magicblock-devnet',
  
  // API Configuration
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3001',
  
  // VRF Configuration
  VRF_ORACLE_URL: process.env.NEXT_PUBLIC_VRF_ORACLE_URL || 'https://vrf.magicblock.app',
  
  // TEE Configuration
  TEE_ATTESTATION_URL: process.env.NEXT_PUBLIC_TEE_ATTESTATION_URL || 'https://tee.magicblock.app',
  
  // Feature Flags
  ENABLE_VRF: process.env.NEXT_PUBLIC_ENABLE_VRF === 'true',
  ENABLE_TEE: process.env.NEXT_PUBLIC_ENABLE_TEE === 'true',
  ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
  
  // Development
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

export type Environment = typeof environment;