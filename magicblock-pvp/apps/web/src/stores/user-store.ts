import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { User, UserStore, EphemeralAccount } from '@/types'

interface UserStoreState extends UserStore {
  // Additional internal state
  isLoading: boolean
  error: string | null
  
  // Internal actions
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  user: null,
  isConnected: false,
  ephemeralAccount: null,
  balance: 0,
  isLoading: false,
  error: null,
}

export const useUserStore = create<UserStoreState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // User management
    setUser: (user: User | null) => {
      set({ user, isConnected: !!user })
    },

    setBalance: (balance: number) => {
      set({ balance })
    },

    setEphemeralAccount: (account: EphemeralAccount | null) => {
      set({ ephemeralAccount: account })
      if (account) {
        set({ balance: account.balance })
      }
    },

    // Wallet operations
    connectWallet: async () => {
      const { setLoading, setError } = get()
      setLoading(true)
      setError(null)

      try {
        // This will be implemented with actual wallet connection logic
        // For now, mock the connection
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Mock user data
        const mockUser: User = {
          id: 'user_' + Math.random().toString(36).substr(2, 9),
          walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          username: 'Player_' + Math.random().toString(36).substr(2, 4),
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
        }

        set({ 
          user: mockUser, 
          isConnected: true,
          balance: 1000 // Mock balance
        })
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to connect wallet')
      } finally {
        setLoading(false)
      }
    },

    disconnectWallet: () => {
      set({
        user: null,
        isConnected: false,
        ephemeralAccount: null,
        balance: 0,
      })
    },

    updateProfile: async (updates: Partial<User>) => {
      const { user, setLoading, setError } = get()
      if (!user) return

      setLoading(true)
      setError(null)

      try {
        // Mock API call
        await new Promise(resolve => setTimeout(resolve, 500))
        
        const updatedUser = { ...user, ...updates }
        set({ user: updatedUser })
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to update profile')
      } finally {
        setLoading(false)
      }
    },

    // Blockchain operations
    createEphemeralAccount: async () => {
      const { setLoading, setError } = get()
      setLoading(true)
      setError(null)

      try {
        // Mock ephemeral account creation
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // This would use MagicBlock SDK in real implementation
        const mockAccount: EphemeralAccount = {
          publicKey: {} as any, // Mock public key
          balance: 1000,
          isActive: true,
        }

        set({ ephemeralAccount: mockAccount, balance: mockAccount.balance })
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to create ephemeral account')
      } finally {
        setLoading(false)
      }
    },

    deposit: async (amount: number) => {
      const { balance, setLoading, setError } = get()
      setLoading(true)
      setError(null)

      try {
        // Mock deposit transaction
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        set({ balance: balance + amount })
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Deposit failed')
      } finally {
        setLoading(false)
      }
    },

    withdraw: async (amount: number) => {
      const { balance, setLoading, setError } = get()
      
      if (amount > balance) {
        setError('Insufficient balance')
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Mock withdrawal transaction
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        set({ balance: balance - amount })
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Withdrawal failed')
      } finally {
        setLoading(false)
      }
    },

    // Utility actions
    setLoading: (loading: boolean) => set({ isLoading: loading }),
    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),
    
    reset: () => set(initialState),
  }))
)