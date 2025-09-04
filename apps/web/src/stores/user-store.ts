'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  publicKey: string
  level: number
  wins: number
  losses: number
  winRate: number
  xp: number
  rank: string
}

interface UserStore {
  user: User | null
  isConnected: boolean
  setUser: (user: User | null) => void
  setConnected: (connected: boolean) => void
  updateStats: (wins: number, losses: number) => void
  addWin: () => void
  addLoss: () => void
  reset: () => void
}

const defaultUser: User = {
  id: 'mock-user-id',
  publicKey: 'mock-public-key',
  level: 15,
  wins: 42,
  losses: 18,
  winRate: 70,
  xp: 1250,
  rank: 'Gold',
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      isConnected: false,
      
      setUser: (user) => set({ user }),
      
      setConnected: (connected) => set({ isConnected: connected }),
      
      updateStats: (wins, losses) => {
        const user = get().user
        if (user) {
          const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0
          set({
            user: {
              ...user,
              wins,
              losses,
              winRate,
            }
          })
        }
      },
      
      addWin: () => {
        const user = get().user
        if (user) {
          const newWins = user.wins + 1
          const newLosses = user.losses
          const winRate = newWins + newLosses > 0 ? Math.round((newWins / (newWins + newLosses)) * 100) : 0
          set({
            user: {
              ...user,
              wins: newWins,
              winRate,
            }
          })
        }
      },
      
      addLoss: () => {
        const user = get().user
        if (user) {
          const newWins = user.wins
          const newLosses = user.losses + 1
          const winRate = newWins + newLosses > 0 ? Math.round((newWins / (newWins + newLosses)) * 100) : 0
          set({
            user: {
              ...user,
              losses: newLosses,
              winRate,
            }
          })
        }
      },
      
      reset: () => set({ user: null, isConnected: false }),
    }),
    {
      name: 'user-store',
      partialize: (state) => ({ user: state.user, isConnected: state.isConnected }),
    }
  )
)
