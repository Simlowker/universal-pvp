'use client';

import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const SimpleWalletButton: React.FC = () => {
  return (
    <div className="wallet-button-container">
      <WalletMultiButton 
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '0.5rem',
          fontSize: '14px',
          height: '40px',
          fontWeight: '500',
          border: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s',
          zIndex: 10,
          position: 'relative',
        }}
      />
      
      {/* Debug info */}
      <div className="text-xs text-gray-400 mt-1">
        Click to connect wallet
      </div>
    </div>
  );
};

export default SimpleWalletButton;