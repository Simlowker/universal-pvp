import { useCallback, useEffect } from 'react'
import { useGameStore } from '@/stores/game-store'
import { useUserStore } from '@/stores/user-store'
import { useWebSocket } from './useWebSocket'
import { GameType, Game, GameRoom } from '@/types'
import { validateBetAmount } from '@/lib/utils'

interface UseGameOptions {
  gameType?: GameType
  autoJoin?: boolean
}

interface UseGameReturn {
  // Current game state
  currentGame: Game | null
  currentRoom: GameRoom | null
  isInGame: boolean
  canJoin: boolean
  canPlay: boolean
  
  // Available games
  availableGames: Game[]
  activeRooms: GameRoom[]
  
  // Actions
  joinGame: (gameId: string, betAmount: number) => Promise<void>
  leaveGame: () => void
  createRoom: (gameType: GameType, minBet: number, maxBet: number) => Promise<GameRoom>
  placeBet: (amount: number, prediction: any) => Promise<void>
  
  // Game state
  isLoading: boolean
  isJoining: boolean
  error: string | null
  
  // Utilities
  validateBet: (amount: number) => { valid: boolean; error?: string }
  getGameByType: (gameType: GameType) => Game | undefined
  getRoomsByGame: (gameType: GameType) => GameRoom[]
}

export function useGame(options: UseGameOptions = {}): UseGameReturn {
  const { gameType, autoJoin = false } = options
  
  const gameStore = useGameStore()
  const { user, balance } = useUserStore()
  const { sendMessage } = useWebSocket()

  // Computed state
  const isInGame = !!gameStore.currentRoom && !!gameStore.currentPlayer
  const canJoin = !!user && balance > 0 && !isInGame
  const canPlay = isInGame && gameStore.currentRoom?.status === 'in_progress'

  // Load available games on mount
  useEffect(() => {
    loadAvailableGames()
  }, [])

  // Auto-join logic
  useEffect(() => {
    if (autoJoin && gameType && canJoin) {
      const availableRoom = gameStore.activeRooms.find(
        room => room.gameType === gameType && 
                room.status === 'waiting' && 
                room.players.length < room.maxPlayers
      )
      
      if (availableRoom) {
        gameStore.joinGame(availableRoom.id, Math.min(balance * 0.1, availableRoom.maxBet))
      }
    }
  }, [autoJoin, gameType, canJoin, gameStore.activeRooms, balance])

  const loadAvailableGames = useCallback(async () => {
    try {
      // Mock loading games - in real app this would be an API call
      const mockGames: Game[] = [
        {
          id: 'coinflip',
          type: 'coinflip',
          name: 'Coin Flip',
          description: 'Classic heads or tails betting',
          minBet: 0.1,
          maxBet: 1000,
          houseEdge: 0.02,
          isActive: true,
          playerCount: 45,
          maxPlayers: 2,
          totalVolume: 12500,
          recentGames: []
        },
        {
          id: 'dice',
          type: 'dice',
          name: 'Dice Roll',
          description: 'Predict the dice outcome',
          minBet: 0.5,
          maxBet: 500,
          houseEdge: 0.015,
          isActive: true,
          playerCount: 32,
          maxPlayers: 6,
          totalVolume: 8900,
          recentGames: []
        },
        {
          id: 'roulette',
          type: 'roulette',
          name: 'Roulette',
          description: 'European roulette wheel',
          minBet: 1,
          maxBet: 2000,
          houseEdge: 0.027,
          isActive: true,
          playerCount: 78,
          maxPlayers: 8,
          totalVolume: 25600,
          recentGames: []
        },
        {
          id: 'crash',
          type: 'crash',
          name: 'Crash',
          description: 'Cash out before the crash',
          minBet: 0.1,
          maxBet: 1500,
          houseEdge: 0.01,
          isActive: true,
          playerCount: 156,
          maxPlayers: 100,
          totalVolume: 45200,
          recentGames: []
        }
      ]

      gameStore.setAvailableGames(mockGames)

      // Mock active rooms
      const mockRooms: GameRoom[] = [
        {
          id: 'room_coinflip_1',
          gameType: 'coinflip',
          players: [],
          maxPlayers: 2,
          minBet: 0.1,
          maxBet: 100,
          status: 'waiting',
          history: [],
          createdAt: new Date(Date.now() - 120000)
        },
        {
          id: 'room_dice_1',
          gameType: 'dice',
          players: [],
          maxPlayers: 6,
          minBet: 0.5,
          maxBet: 200,
          status: 'waiting',
          history: [],
          createdAt: new Date(Date.now() - 300000)
        }
      ]

      gameStore.setActiveRooms(mockRooms)
    } catch (error) {
      console.error('Failed to load games:', error)
    }
  }, [gameStore])

  const joinGame = useCallback(async (gameId: string, betAmount: number) => {
    if (!canJoin) {
      throw new Error('Cannot join game')
    }

    const room = gameStore.activeRooms.find(r => r.id === gameId)
    if (!room) {
      throw new Error('Room not found')
    }

    const validation = validateBetAmount(betAmount, room.minBet, room.maxBet, balance)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    await gameStore.joinGame(gameId, betAmount)
    
    // Notify other players via WebSocket
    sendMessage('player_joined', {
      roomId: gameId,
      player: gameStore.currentPlayer
    })
  }, [canJoin, gameStore, balance, sendMessage])

  const leaveGame = useCallback(() => {
    const roomId = gameStore.currentRoom?.id
    const playerId = gameStore.currentPlayer?.id
    
    gameStore.leaveGame()
    
    // Notify other players via WebSocket
    if (roomId && playerId) {
      sendMessage('player_left', {
        roomId,
        playerId
      })
    }
  }, [gameStore, sendMessage])

  const createRoom = useCallback(async (
    gameType: GameType, 
    minBet: number, 
    maxBet: number
  ): Promise<GameRoom> => {
    if (!user) {
      throw new Error('Must be logged in to create room')
    }

    const room = await gameStore.createRoom(gameType, minBet, maxBet)
    
    // Notify via WebSocket
    sendMessage('room_created' as any, {
      room,
      creator: user.id
    })
    
    return room
  }, [user, gameStore, sendMessage])

  const placeBet = useCallback(async (amount: number, prediction: any) => {
    if (!canPlay) {
      throw new Error('Cannot place bet')
    }

    const room = gameStore.currentRoom!
    const validation = validateBetAmount(amount, room.minBet, room.maxBet, balance)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    await gameStore.placeBet(amount, prediction)
    
    // Notify other players via WebSocket
    sendMessage('bet_placed', {
      roomId: room.id,
      playerId: gameStore.currentPlayer?.id,
      amount,
      prediction
    })
  }, [canPlay, gameStore, balance, sendMessage])

  const validateBet = useCallback((amount: number) => {
    if (!gameStore.currentRoom) {
      return { valid: false, error: 'Not in a game room' }
    }
    
    return validateBetAmount(
      amount, 
      gameStore.currentRoom.minBet, 
      gameStore.currentRoom.maxBet, 
      balance
    )
  }, [gameStore.currentRoom, balance])

  const getGameByType = useCallback((gameType: GameType) => {
    return gameStore.availableGames.find(game => game.type === gameType)
  }, [gameStore.availableGames])

  const getRoomsByGame = useCallback((gameType: GameType) => {
    return gameStore.activeRooms.filter(room => room.gameType === gameType)
  }, [gameStore.activeRooms])

  return {
    // Current game state
    currentGame: gameStore.currentGame,
    currentRoom: gameStore.currentRoom,
    isInGame,
    canJoin,
    canPlay,
    
    // Available games
    availableGames: gameStore.availableGames,
    activeRooms: gameStore.activeRooms,
    
    // Actions
    joinGame,
    leaveGame,
    createRoom,
    placeBet,
    
    // State
    isLoading: gameStore.isLoading,
    isJoining: gameStore.isJoining,
    error: gameStore.error,
    
    // Utilities
    validateBet,
    getGameByType,
    getRoomsByGame,
  }
}