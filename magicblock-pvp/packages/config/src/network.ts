import { Connection } from '@solana/web3.js';

export enum Network {
  DEVNET = 'devnet',
  TESTNET = 'testnet',  
  MAINNET = 'mainnet-beta',
  LOCAL = 'local',
}

export const RPC_ENDPOINTS: Record<Network, string> = {
  [Network.DEVNET]: 'https://api.devnet.solana.com',
  [Network.TESTNET]: 'https://api.testnet.solana.com',
  [Network.MAINNET]: 'https://api.mainnet-beta.solana.com',
  [Network.LOCAL]: 'http://localhost:8899',
};

export function createConnection(network: Network): Connection {
  const endpoint = RPC_ENDPOINTS[network];
  return new Connection(endpoint, 'confirmed');
}

export function getNetworkFromUrl(url: string): Network {
  if (url.includes('devnet')) return Network.DEVNET;
  if (url.includes('testnet')) return Network.TESTNET;
  if (url.includes('mainnet')) return Network.MAINNET;
  if (url.includes('localhost') || url.includes('127.0.0.1')) return Network.LOCAL;
  return Network.DEVNET; // Default fallback
}