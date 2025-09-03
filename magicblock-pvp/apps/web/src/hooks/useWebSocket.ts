import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { WebSocketMessage, WSMessageType } from '@/types'
import { useGameStore } from '@/stores/game-store'
import { useUserStore } from '@/stores/user-store'

interface UseWebSocketOptions {
  url?: string
  autoConnect?: boolean
  reconnectAttempts?: number
  reconnectDelay?: number
}

interface UseWebSocketReturn {
  socket: Socket | null
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connect: () => void
  disconnect: () => void
  sendMessage: (type: WSMessageType, payload: any) => void
  lastMessage: WebSocketMessage | null
}

const DEFAULT_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3001'

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = DEFAULT_URL,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectDelay = 1000,
  } = options

  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const reconnectCountRef = useRef(0)
  
  // Store references
  const { user } = useUserStore()
  const gameStore = useGameStore()

  // Message handlers
  const handleGameUpdate = useCallback((payload: any) => {
    if (payload.room) {
      gameStore.updateRoom(payload.room)
    }
    if (payload.game) {
      gameStore.updateGame(payload.game)
    }
  }, [gameStore])

  const handlePlayerJoined = useCallback((payload: any) => {
    if (payload.player) {
      gameStore.addPlayer(payload.player)
    }
  }, [gameStore])

  const handlePlayerLeft = useCallback((payload: any) => {
    if (payload.playerId) {
      gameStore.removePlayer(payload.playerId)
    }
  }, [gameStore])

  const handleBetPlaced = useCallback((payload: any) => {
    // Handle bet placed by other players
    console.log('Bet placed by other player:', payload)
  }, [])

  const handleRoundStarted = useCallback((payload: any) => {
    gameStore.updateRoom({ 
      status: 'in_progress',
      currentRound: payload.round 
    })
  }, [gameStore])

  const handleRoundFinished = useCallback((payload: any) => {
    if (payload.result) {
      gameStore.addGameResult(payload.result)
      gameStore.updateRoom({ 
        status: 'finished',
        currentRound: undefined 
      })
    }
  }, [gameStore])

  const handleUserUpdate = useCallback((payload: any) => {
    if (payload.user && user && payload.user.id === user.id) {
      // Update current user data
      console.log('User update received:', payload.user)
    }
  }, [user])

  const handleError = useCallback((payload: any) => {
    setError(payload.message || 'WebSocket error occurred')
    console.error('WebSocket error:', payload)
  }, [])

  // Message router
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setLastMessage(message)
    
    switch (message.type) {
      case 'game_update':
        handleGameUpdate(message.payload)
        break
      case 'player_joined':
        handlePlayerJoined(message.payload)
        break
      case 'player_left':
        handlePlayerLeft(message.payload)
        break
      case 'bet_placed':
        handleBetPlaced(message.payload)
        break
      case 'round_started':
        handleRoundStarted(message.payload)
        break
      case 'round_finished':
        handleRoundFinished(message.payload)
        break
      case 'user_update':
        handleUserUpdate(message.payload)
        break
      case 'error':
        handleError(message.payload)
        break
      case 'heartbeat':
        // Handle heartbeat
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }, [
    handleGameUpdate,
    handlePlayerJoined,
    handlePlayerLeft,
    handleBetPlaced,
    handleRoundStarted,
    handleRoundFinished,
    handleUserUpdate,
    handleError
  ])

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        auth: {
          userId: user?.id,
          walletAddress: user?.walletAddress,
        }
      })

      socket.on('connect', () => {
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        reconnectCountRef.current = 0
        console.log('WebSocket connected')
      })

      socket.on('disconnect', (reason) => {
        setIsConnected(false)
        setIsConnecting(false)
        console.log('WebSocket disconnected:', reason)

        // Auto-reconnect logic
        if (reason !== 'io client disconnect' && reconnectCountRef.current < reconnectAttempts) {
          setTimeout(() => {
            if (!socket.connected) {
              reconnectCountRef.current++
              console.log(`Attempting to reconnect (${reconnectCountRef.current}/${reconnectAttempts})`)
              socket.connect()
            }
          }, reconnectDelay * Math.pow(2, reconnectCountRef.current))
        }
      })

      socket.on('connect_error', (error) => {
        setError(`Connection failed: ${error.message}`)
        setIsConnecting(false)
        console.error('WebSocket connection error:', error)
      })

      socket.on('message', (data: WebSocketMessage) => {
        handleMessage(data)
      })

      // Listen for all message types
      socket.onAny((eventName: WSMessageType, payload: any) => {
        if ((eventName as string) !== 'connect' && (eventName as string) !== 'disconnect' && (eventName as string) !== 'connect_error') {
          handleMessage({
            type: eventName,
            payload,
            timestamp: new Date()
          })
        }
      })

      socketRef.current = socket
    } catch (error) {
      setError(`Failed to create connection: ${error}`)
      setIsConnecting(false)
    }
  }, [url, user, reconnectAttempts, reconnectDelay, handleMessage])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setIsConnecting(false)
      console.log('WebSocket manually disconnected')
    }
  }, [])

  const sendMessage = useCallback((type: WSMessageType, payload: any) => {
    if (socketRef.current?.connected) {
      const message: WebSocketMessage = {
        type,
        payload,
        timestamp: new Date()
      }
      socketRef.current.emit('message', message)
    } else {
      console.warn('Cannot send message: WebSocket not connected')
    }
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && user) {
      connect()
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [autoConnect, user, connect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    socket: socketRef.current,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    sendMessage,
    lastMessage,
  }
}