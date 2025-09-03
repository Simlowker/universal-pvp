'use client';

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

interface TestProvidersProps {
  children: React.ReactNode;
}

export const TestProviders: React.FC<TestProvidersProps> = ({ children }) => {
  const network = clusterApiUrl('devnet');
  
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};