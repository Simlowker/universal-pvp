'use client'

import React, { createContext, useContext, useEffect } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useUserStore } from '@/stores/user-store'

interface WebSocketContextValue {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

interface WebSocketProviderProps {
  children: React.ReactNode
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { user, isConnected: walletConnected } = useUserStore()
  const { isConnected, isConnecting, error, connect, disconnect } = useWebSocket({
    autoConnect: false, // We'll manually control connection
  })

  // Connect WebSocket when wallet is connected
  useEffect(() => {
    if (walletConnected && user) {
      connect()
    } else if (!walletConnected) {
      disconnect()
    }
  }, [walletConnected, user, connect, disconnect])

  const contextValue: WebSocketContextValue = {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
  }

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider')
  }
  return context
}