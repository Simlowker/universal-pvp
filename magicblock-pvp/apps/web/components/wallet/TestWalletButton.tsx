'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

const TestWalletButton: React.FC = () => {
  const { connected, connecting, disconnect, publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const handleClick = () => {
    console.log('TestWalletButton clicked!');
    if (connected) {
      disconnect();
    } else {
      setVisible(true);
    }
  };

  return (
    <div className="p-4 border border-red-500 rounded bg-red-100 text-black">
      <h3 className="font-bold">Test Wallet Button</h3>
      <p>Connected: {connected ? 'Yes' : 'No'}</p>
      <p>Connecting: {connecting ? 'Yes' : 'No'}</p>
      <p>PublicKey: {publicKey?.toBase58().slice(0, 8)}...</p>
      
      <button 
        onClick={handleClick}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        style={{ cursor: 'pointer' }}
      >
        {connected ? 'Disconnect' : 'Connect Wallet'}
      </button>
    </div>
  );
};

export default TestWalletButton;