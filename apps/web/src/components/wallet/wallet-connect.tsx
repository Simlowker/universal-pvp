'use client'

import React from 'react'
import { useWallet } from '@/components/providers/wallet-provider'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'

export function WalletConnect() {
  const { isConnected, publicKey, connect, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  const handleConnect = () => {
    if (isConnected) {
      disconnect()
    } else {
      setVisible(true)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <button
        onClick={handleConnect}
        className="game-button px-8 py-3 text-lg font-bold"
      >
        {isConnected ? 'Disconnect Wallet' : 'Connect Wallet'}
      </button>
      
      {isConnected && publicKey && (
        <div className="text-center">
          <p className="text-sm text-gray-400 mb-2">Connected as:</p>
          <p className="text-xs text-blue-400 font-mono break-all">
            {publicKey.slice(0, 8)}...{publicKey.slice(-8)}
          </p>
        </div>
      )}
    </div>
  )
}
