'use client'

import React from 'react'
import { WalletProvider } from './wallet-provider'
import { WebSocketProvider } from './websocket-provider'
import { ToastProvider } from './toast-provider'

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ToastProvider>
      <WalletProvider>
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
      </WalletProvider>
    </ToastProvider>
  )
}