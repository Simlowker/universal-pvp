'use client';

import React from 'react';
import { WalletProviderWrapper } from '@/contexts/WalletProvider';
import { MagicBlockProvider } from '@/contexts/MagicBlockProvider';

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return (
    <WalletProviderWrapper>
      <MagicBlockProvider
        rpcEndpoint={process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.devnet.solana.com'}
        ephemeralRpcEndpoint={process.env.NEXT_PUBLIC_EPHEMERAL_RPC_ENDPOINT || 'https://devnet.magicblock.app'}
      >
        {children}
      </MagicBlockProvider>
    </WalletProviderWrapper>
  );
}

export default ClientProviders;