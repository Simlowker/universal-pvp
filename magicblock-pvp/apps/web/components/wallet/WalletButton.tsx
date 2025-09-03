'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { Wallet, LogOut, Copy, ExternalLink } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useWalletContext } from '../../contexts/WalletContext';
import { useGameSounds } from '../../hooks/useSound';
import toast from 'react-hot-toast';

const WalletButton: React.FC = () => {
  const walletAdapter = useWallet();
  const { connected, connecting, publicKey, disconnect, select, wallets, connect } = walletAdapter;
  const { setVisible, visible } = useWalletModal();
  const walletContext = useWalletContext();
  const { playSound } = useGameSounds();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isPhantomInstalled, setIsPhantomInstalled] = useState(false);

  // Debug logging for state
  useEffect(() => {
    console.log('WalletButton state:', {
      adapterConnected: connected,
      contextConnected: walletContext.wallet.connected,
      publicKey: publicKey?.toBase58(),
      contextPublicKey: walletContext.wallet.publicKey,
      balance: walletContext.balance
    });
  }, [connected, walletContext.wallet.connected, publicKey, walletContext.wallet.publicKey, walletContext.balance]);

  // Check if Phantom is installed
  useEffect(() => {
    const checkPhantom = () => {
      const isInstalled = typeof window !== 'undefined' && 
        (window.solana?.isPhantom || window.phantom?.solana?.isPhantom);
      setIsPhantomInstalled(!!isInstalled);
      console.log('Phantom wallet installed:', isInstalled);
      console.log('Available wallets:', wallets.map(w => w.adapter.name));
    };

    checkPhantom();
    // Check again after a delay in case Phantom loads slowly
    const timer = setTimeout(checkPhantom, 1000);
    return () => clearTimeout(timer);
  }, [wallets]);

  // Force refresh wallet data when connection changes
  useEffect(() => {
    if (connected && publicKey && walletContext.refreshData) {
      console.log('Force refreshing wallet data after connection...');
      walletContext.refreshData();
    }
  }, [connected, publicKey]);

  const handleConnect = async () => {
    console.log('Connect wallet clicked');
    console.log('Modal visible state:', visible);
    console.log('setVisible function available:', !!setVisible);
    playSound('click');
    
    try {
      // First try to open the modal
      if (setVisible) {
        console.log('Attempting to open wallet modal...');
        setVisible(true);
        
        // If modal doesn't open after a delay, try direct connection
        setTimeout(async () => {
          if (!connected && !connecting) {
            console.log('Modal may have failed, trying direct connection...');
            
            // If Phantom is installed, try direct connection
            if (isPhantomInstalled) {
              console.log('Attempting direct Phantom connection...');
              const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom');
              if (phantomWallet) {
                try {
                  await select(phantomWallet.adapter.name);
                  await connect();
                  toast.success('Connected to Phantom wallet!');
                } catch (error) {
                  console.error('Direct connection failed:', error);
                  toast.error('Failed to connect directly. Please try again.');
                }
              }
            } else {
              toast.error('Please install Phantom wallet extension first.');
              window.open('https://phantom.app/', '_blank');
            }
          }
        }, 2000);
      } else {
        console.error('Wallet modal not available');
        
        // Fallback: Try direct connection or prompt to install
        if (isPhantomInstalled) {
          const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom');
          if (phantomWallet) {
            await select(phantomWallet.adapter.name);
            await connect();
            toast.success('Connected to Phantom wallet!');
          }
        } else {
          toast.error('Please install a Solana wallet extension like Phantom.');
          window.open('https://phantom.app/', '_blank');
        }
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Failed to connect wallet. Please try again.');
    }
  };

  const handleDisconnect = async () => {
    playSound('click');
    try {
      await disconnect();
      setShowWalletModal(false);
      toast.success('Wallet disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect wallet');
    }
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      toast.success('Address copied to clipboard');
      playSound('click');
    }
  };

  const openExplorer = () => {
    if (publicKey) {
      window.open(`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`, '_blank');
      playSound('click');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  // Use both adapter and context state to determine if connected
  const isConnected = connected && walletContext.wallet.connected;
  const currentBalance = walletContext.balance;
  const currentPublicKey = publicKey || (walletContext.wallet.publicKey ? new PublicKey(walletContext.wallet.publicKey) : null);

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          onClick={handleConnect}
          loading={connecting}
          leftIcon={<Wallet className="h-4 w-4" />}
          variant="primary"
          glowing
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </Button>
        
        {/* Debug info and manual connection options */}
        {!isPhantomInstalled && (
          <div className="text-xs text-yellow-500 text-center">
            No wallet detected.
            <a 
              href="https://phantom.app/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline ml-1 hover:text-yellow-400"
            >
              Install Phantom
            </a>
          </div>
        )}
        
        {/* Manual wallet selection for debugging */}
        {wallets.length > 0 && !connecting && (
          <div className="space-y-2">
            <div className="flex gap-2 justify-center">
              {wallets.map((wallet) => (
                <button
                  key={wallet.adapter.name}
                  onClick={async () => {
                    console.log(`Manually connecting to ${wallet.adapter.name}...`);
                    try {
                      await select(wallet.adapter.name);
                      await connect();
                      toast.success(`Connected to ${wallet.adapter.name}!`);
                      // Force refresh after connection
                      setTimeout(() => {
                        if (walletContext.refreshData) {
                          walletContext.refreshData();
                        }
                      }, 500);
                    } catch (error) {
                      console.error(`Failed to connect to ${wallet.adapter.name}:`, error);
                      toast.error(`Failed to connect to ${wallet.adapter.name}`);
                    }
                  }}
                  className="text-xs px-2 py-1 bg-game-surface border border-game-border rounded hover:bg-game-border transition-colors"
                >
                  {wallet.adapter.name}
                </button>
              ))}
            </div>
            
            {/* Debug refresh button */}
            {connected && (
              <button
                onClick={() => {
                  console.log('Manual refresh triggered');
                  walletContext.refreshData();
                  toast.success('Wallet data refreshed');
                }}
                className="text-xs px-2 py-1 bg-yellow-500/20 border border-yellow-500/50 rounded hover:bg-yellow-500/30 transition-colors w-full"
              >
                🔄 Refresh Wallet State
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        onClick={() => setShowWalletModal(true)}
        variant="outline"
        leftIcon={<Wallet className="h-4 w-4" />}
        className="bg-game-surface/50 backdrop-blur-sm"
      >
        <div className="flex flex-col items-start">
          <span className="text-xs text-game-muted">
            {currentBalance.toFixed(3)} SOL
          </span>
          <span className="font-mono text-sm">
            {currentPublicKey ? formatAddress(currentPublicKey.toBase58()) : 'Loading...'}
          </span>
        </div>
      </Button>

      <Modal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        title="Wallet Details"
        size="md"
      >
        <div className="space-y-6">
          {/* Wallet Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-game-muted">Wallet</span>
              <span className="font-medium text-game-text">
                {walletContext.wallet.walletName || 'Unknown'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-game-muted">Address</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-game-text">
                  {currentPublicKey ? formatAddress(currentPublicKey.toBase58()) : 'Loading...'}
                </span>
                <button
                  onClick={copyAddress}
                  className="p-1 hover:bg-game-surface rounded"
                >
                  <Copy className="h-3 w-3 text-game-muted" />
                </button>
                <button
                  onClick={openExplorer}
                  className="p-1 hover:bg-game-surface rounded"
                >
                  <ExternalLink className="h-3 w-3 text-game-muted" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-game-muted">Network</span>
              <span className="text-game-text">Devnet</span>
            </div>
          </div>

          {/* Balance */}
          <div className="p-4 bg-game-surface rounded-lg border border-game-border">
            <div className="text-center">
              <p className="text-xs text-game-muted mb-1">SOL Balance</p>
              <p className="text-2xl font-bold text-game-accent">
                {currentBalance.toFixed(6)} SOL
              </p>
              <p className="text-xs text-game-muted mt-1">
                ≈ ${(currentBalance * 50).toFixed(2)} USD
              </p>
            </div>
          </div>

          {/* Token Balances */}
          {walletContext.tokenBalances.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-game-text">Token Balances</h3>
              <div className="space-y-1">
                {walletContext.tokenBalances.map((token) => (
                  <div
                    key={token.mint}
                    className="flex items-center justify-between p-2 bg-game-surface rounded"
                  >
                    <span className="text-sm text-game-muted">{token.symbol}</span>
                    <span className="text-sm text-game-text">{token.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end">
            <Button
              onClick={handleDisconnect}
              variant="outline"
              leftIcon={<LogOut className="h-4 w-4" />}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default WalletButton;