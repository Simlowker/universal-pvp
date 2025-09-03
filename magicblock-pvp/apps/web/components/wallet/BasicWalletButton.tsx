'use client';

import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const BasicWalletButton: React.FC = () => {
  return (
    <WalletMultiButton />
  );
};

export default BasicWalletButton;