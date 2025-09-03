import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { Game, GameRoom, Player, GameStore, Bet, GameResult } from '@/types'
import { generateGameId, generateRoundId } from '@/lib/utils'

interface GameStoreState extends GameStore {
  // Additional state
  availableGames: Game[]
  recentResults: GameResult[]
  activeRooms: GameRoom[]
  
  // UI state
  selectedGameType: string | null
  isJoining: boolean
  
  // Actions for managing available games
  setAvailableGames: (games: Game[]) => void
  addGameResult: (result: GameResult) => void
  
  // Room management
  setActiveRooms: (rooms: GameRoom[]) => void
  createRoom: (gameType: string, minBet: number, maxBet: number) => Promise<GameRoom>
  
  // UI actions
  setSelectedGameType: (gameType: string | null) => void
  setJoining: (isJoining: boolean) => void
  
  // Utility
  reset: () => void
}

const initialState = {
  currentGame: null,
  currentRoom: null,
  currentPlayer: null,
  availableGames: [],
  recentResults: [],
  activeRooms: [],
  selectedGameType: null,
  isLoading: false,
  isJoining: false,
  error: null,
}

export const useGameStore = create<GameStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Game management
    setAvailableGames: (games: Game[]) => {
      set({ availableGames: games })
    },

    addGameResult: (result: GameResult) => {
      const { recentResults } = get()
      const newResults = [result, ...recentResults].slice(0, 100) // Keep last 100 results
      set({ recentResults: newResults })
    },

    // Room management
    setActiveRooms: (rooms: GameRoom[]) => {
      set({ activeRooms: rooms })
    },

    createRoom: async (gameType: string, minBet: number, maxBet: number): Promise<GameRoom> => {
      set({ isLoading: true, error: null })

      try {
        // Mock room creation
        await new Promise(resolve => setTimeout(resolve, 1000))

        const newRoom: GameRoom = {
          id: generateGameId(),
          gameType: gameType as any,
          players: [],
          maxPlayers: 8,
          minBet,
          maxBet,
          status: 'waiting',
          history: [],
          createdAt: new Date(),
        }

        const { activeRooms } = get()
        set({ 
          activeRooms: [...activeRooms, newRoom],
          currentRoom: newRoom,
        })

        return newRoom
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create room'
        set({ error: errorMessage })
        throw error
      } finally {
        set({ isLoading: false })
      }
    },

    // Player actions
    joinGame: async (gameId: string, betAmount: number) => {
      set({ isLoading: true, isJoining: true, error: null })

      try {
        // Mock join game logic
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Find the room
        const { activeRooms } = get()
        const room = activeRooms.find(r => r.id === gameId)
        
        if (!room) {
          throw new Error('Game room not found')
        }

        // Create mock player
        const newPlayer: Player = {
          id: 'player_' + Math.random().toString(36).substr(2, 9),
          user: {
            id: 'user_123',
            walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
            stats: {
              totalGames: 0,
              wins: 0,
              losses: 0,
              winRate: 0,
              totalWinnings: 0,
              totalLosses: 0,
              netPnL: 0,
              currentStreak: 0,
              bestStreak: 0,
              averageBetSize: 0,
            },
            tier: 'bronze',
            createdAt: new Date(),
            lastActive: new Date(),
          },
          isHost: room.players.length === 0,
          isReady: false,
          betAmount,
          isConnected: true,
          joinedAt: new Date(),
        }

        // Update room with new player
        const updatedRoom = {
          ...room,
          players: [...room.players, newPlayer]
        }

        // Update active rooms
        const updatedRooms = activeRooms.map(r => 
          r.id === gameId ? updatedRoom : r
        )

        set({
          activeRooms: updatedRooms,
          currentRoom: updatedRoom,
          currentPlayer: newPlayer,
        })

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to join game'
        set({ error: errorMessage })
        throw error
      } finally {
        set({ isLoading: false, isJoining: false })
      }
    },

    leaveGame: () => {
      const { currentRoom, currentPlayer } = get()
      
      if (!currentRoom || !currentPlayer) return

      // Remove player from room
      const updatedRoom = {
        ...currentRoom,
        players: currentRoom.players.filter(p => p.id !== currentPlayer.id)
      }

      // Update active rooms
      const { activeRooms } = get()
      const updatedRooms = activeRooms.map(r => 
        r.id === currentRoom.id ? updatedRoom : r
      )

      set({
        activeRooms: updatedRooms,
        currentRoom: null,
        currentPlayer: null,
      })
    },

    placeBet: async (amount: number, prediction: any) => {
      const { currentRoom, currentPlayer } = get()
      
      if (!currentRoom || !currentPlayer) {
        throw new Error('Not in a game')
      }

      set({ isLoading: true, error: null })

      try {
        // Mock bet placement
        await new Promise(resolve => setTimeout(resolve, 1000))

        const bet: Bet = {
          id: 'bet_' + Math.random().toString(36).substr(2, 9),
          playerId: currentPlayer.id,
          amount,
          prediction,
          odds: 2.0, // Mock odds
          placedAt: new Date(),
          status: 'active',
        }

        // Update current round with bet (mock)
        console.log('Bet placed:', bet)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to place bet'
        set({ error: errorMessage })
        throw error
      } finally {
        set({ isLoading: false })
      }
    },

    // Update actions
    updateGame: (game: Partial<Game>) => {
      const { currentGame } = get()
      if (currentGame) {
        set({ currentGame: { ...currentGame, ...game } })
      }
    },

    updateRoom: (roomUpdate: Partial<GameRoom>) => {
      const { currentRoom, activeRooms } = get()
      
      if (currentRoom) {
        const updatedRoom = { ...currentRoom, ...roomUpdate }
        const updatedRooms = activeRooms.map(r => 
          r.id === currentRoom.id ? updatedRoom : r
        )
        
        set({ 
          currentRoom: updatedRoom,
          activeRooms: updatedRooms 
        })
      }
    },

    addPlayer: (player: Player) => {
      const { currentRoom, activeRooms } = get()
      
      if (currentRoom) {
        const updatedRoom = {
          ...currentRoom,
          players: [...currentRoom.players, player]
        }
        
        const updatedRooms = activeRooms.map(r => 
          r.id === currentRoom.id ? updatedRoom : r
        )
        
        set({ 
          currentRoom: updatedRoom,
          activeRooms: updatedRooms 
        })
      }
    },

    removePlayer: (playerId: string) => {
      const { currentRoom, activeRooms } = get()
      
      if (currentRoom) {
        const updatedRoom = {
          ...currentRoom,
          players: currentRoom.players.filter(p => p.id !== playerId)
        }
        
        const updatedRooms = activeRooms.map(r => 
          r.id === currentRoom.id ? updatedRoom : r
        )
        
        set({ 
          currentRoom: updatedRoom,
          activeRooms: updatedRooms 
        })
      }
    },

    // UI actions
    setSelectedGameType: (gameType: string | null) => {
      set({ selectedGameType: gameType })
    },

    setJoining: (isJoining: boolean) => {
      set({ isJoining })
    },

    // Utility
    reset: () => set(initialState),
  }))
)