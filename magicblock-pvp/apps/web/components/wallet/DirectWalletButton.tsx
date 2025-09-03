'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import toast from 'react-hot-toast';

const DirectWalletButton: React.FC = () => {
  const { wallets, select, connect, connected, connecting, disconnect, publicKey } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);

  const connectPhantom = async () => {
    setIsConnecting(true);
    console.log('Direct connect attempt...');
    
    try {
      // Check if Phantom is available
      if (typeof window !== 'undefined' && window.solana?.isPhantom) {
        console.log('Phantom detected, attempting direct connection...');
        
        // Connect directly to Phantom
        const response = await window.solana.connect();
        console.log('Phantom connected:', response.publicKey.toString());
        toast.success('Connected via Phantom directly!');
        
      } else {
        // Fallback to adapter
        console.log('Using wallet adapter...');
        const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom');
        
        if (phantomWallet) {
          await select(phantomWallet.adapter.name);
          await connect();
          toast.success('Connected via adapter!');
        } else {
          toast.error('Phantom wallet not found');
          window.open('https://phantom.app/', '_blank');
        }
      }
    } catch (error) {
      console.error('Direct connection failed:', error);
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (window.solana) {
        await window.solana.disconnect();
      }
      await disconnect();
      toast.success('Disconnected!');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  if (connected) {
    return (
      <div className="bg-green-100 text-green-800 p-3 rounded border">
        <div className="text-sm font-bold">✅ Connected!</div>
        <div className="text-xs">{publicKey?.toBase58().slice(0, 8)}...</div>
        <button 
          onClick={handleDisconnect}
          className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="bg-yellow-100 text-yellow-800 p-3 rounded border">
      <div className="text-sm font-bold">Direct Connect Test</div>
      <div className="text-xs mb-2">Bypasses modal issues</div>
      
      <button 
        onClick={connectPhantom}
        disabled={isConnecting || connecting}
        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm"
        style={{ cursor: 'pointer' }}
      >
        {isConnecting || connecting ? 'Connecting...' : 'Connect Phantom Direct'}
      </button>
      
      <div className="text-xs mt-2 text-gray-600">
        Available wallets: {wallets.length}
      </div>
    </div>
  );
};

export default DirectWalletButton;

// Extend window type for TypeScript
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
    };
  }
}