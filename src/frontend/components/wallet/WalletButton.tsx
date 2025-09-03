'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Wallet, LogOut, Copy, ExternalLink } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { useWalletContext } from '../../contexts/WalletContext';
import { useGameSounds } from '../../hooks/useSound';
import toast from 'react-hot-toast';

const WalletButton: React.FC = () => {
  const { connected, connecting, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { wallet, balance, tokenBalances } = useWalletContext();
  const { playSound } = useGameSounds();
  const [showWalletModal, setShowWalletModal] = useState(false);

  const handleConnect = () => {
    playSound('click');
    setVisible(true);
  };

  const handleDisconnect = async () => {
    playSound('click');
    try {
      await disconnect();
      setShowWalletModal(false);
      toast.success('Wallet disconnected');
    } catch (error) {
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
      window.open(`https://explorer.solana.com/address/${publicKey.toBase58()}`, '_blank');
      playSound('click');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (!connected) {
    return (
      <Button
        onClick={handleConnect}
        loading={connecting}
        leftIcon={<Wallet className="h-4 w-4" />}
        variant="primary"
        glowing
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>
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
            {balance.toFixed(3)} SOL
          </span>
          <span className="font-mono text-sm">
            {formatAddress(publicKey!.toBase58())}
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
                {wallet.walletName}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-game-muted">Address</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-game-text">
                  {formatAddress(wallet.publicKey!)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAddress}
                  className="p-1"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openExplorer}
                  className="p-1"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Balances */}
          <div className="space-y-3">
            <h3 className="font-semibold text-game-text">Balances</h3>
            
            <div className="bg-game-bg/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-game-muted">SOL</span>
                <span className="font-bold text-game-text">
                  ◎ {balance.toFixed(6)}
                </span>
              </div>
              
              {tokenBalances.length > 0 && (
                <div className="border-t border-game-border pt-2 mt-2">
                  {tokenBalances.map((token, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="text-game-muted text-sm">
                        {token.symbol}
                      </span>
                      <span className="text-game-text text-sm">
                        {token.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={openExplorer}
              variant="outline"
              leftIcon={<ExternalLink className="h-4 w-4" />}
              fullWidth
            >
              View on Explorer
            </Button>
            <Button
              onClick={handleDisconnect}
              variant="danger"
              leftIcon={<LogOut className="h-4 w-4" />}
              fullWidth
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