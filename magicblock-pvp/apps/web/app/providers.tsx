'use client';

import React, { useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  // BackpackWalletAdapter, // Not available in current version
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { Toaster } from 'react-hot-toast';

import { ThemeProvider } from '../contexts/ThemeContext';
import { WalletGameProvider } from '../contexts/WalletContext';
import { GameProvider } from '../contexts/GameContext';

// Import wallet adapter CSS - IMPORTANT for modal styling
import '@solana/wallet-adapter-react-ui/styles.css';

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  // Configure Solana network (can be 'devnet', 'testnet', or 'mainnet-beta')
  const network = clusterApiUrl('devnet');
  
  // Configure wallet adapters
  const wallets = useMemo(
    () => {
      const adapters = [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
      ];
      console.log('Wallet adapters initialized:', adapters.map(w => w.name));
      return adapters;
    },
    []
  );

  // Debug logging
  useEffect(() => {
    console.log('Providers mounted');
    console.log('Network:', network);
    console.log('Wallets available:', wallets.map(w => ({ name: w.name, readyState: w.readyState })));
    
    // Check if Phantom is available in window
    if (typeof window !== 'undefined') {
      console.log('Window.solana available:', !!window.solana);
      console.log('Window.phantom available:', !!window.phantom);
      if (window.solana) {
        console.log('Window.solana.isPhantom:', window.solana.isPhantom);
      }
    }
  }, [network, wallets]);

  return (
    <ThemeProvider>
      <ConnectionProvider endpoint={network}>
        <WalletProvider 
          wallets={wallets} 
          autoConnect={false} 
          onError={(error) => console.error('Wallet error:', error)}
        >
          <WalletModalProvider
            featuredWallets={2}
          >
            <WalletGameProvider>
              <GameProvider>
                {children}
                
                {/* Toast notifications */}
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: 'var(--game-surface)',
                      color: 'var(--game-text)',
                      border: '1px solid var(--game-border)',
                    },
                    success: {
                      iconTheme: {
                        primary: '#10b981',
                        secondary: '#ffffff',
                      },
                    },
                    error: {
                      iconTheme: {
                        primary: '#ef4444',
                        secondary: '#ffffff',
                      },
                    },
                  }}
                />
              </GameProvider>
            </WalletGameProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  );
};