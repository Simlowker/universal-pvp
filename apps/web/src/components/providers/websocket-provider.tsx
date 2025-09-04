'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

interface WebSocketContextType {
  isConnected: boolean
  sendMessage: (message: any) => void
  lastMessage: any
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}

interface WebSocketProviderProps {
  children: React.ReactNode
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  useEffect(() => {
    // Mock WebSocket connection for now
    const mockWs = {
      send: (message: any) => {
        console.log('Sending message:', message)
      },
      close: () => {
        console.log('Closing WebSocket')
      }
    } as any

    setWs(mockWs)
    setIsConnected(true)

    return () => {
      if (ws) {
        ws.close()
      }
    }
  }, [])

  const sendMessage = (message: any) => {
    if (ws) {
      ws.send(JSON.stringify(message))
    }
  }

  const value = {
    isConnected,
    sendMessage,
    lastMessage,
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}
