'use client';

import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const SimpleWalletButton: React.FC = () => {
  return (
    <WalletMultiButton 
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '0.5rem',
        fontSize: '14px',
        height: '40px',
        fontWeight: '500',
      }}
    />
  );
};

export default SimpleWalletButton;