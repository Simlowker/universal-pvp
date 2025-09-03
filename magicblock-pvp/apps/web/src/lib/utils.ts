import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K'
  }
  return num.toFixed(decimals)
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function calculateWinRate(wins: number, total: number): number {
  return total > 0 ? wins / total : 0
}

export function calculatePnL(winnings: number, losses: number): number {
  return winnings - losses
}

export function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = (now.getTime() - date.getTime()) / 1000
  
  if (diffInSeconds < 60) {
    return `${Math.floor(diffInSeconds)}s ago`
  }
  
  const diffInMinutes = diffInSeconds / 60
  if (diffInMinutes < 60) {
    return `${Math.floor(diffInMinutes)}m ago`
  }
  
  const diffInHours = diffInMinutes / 60
  if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  }
  
  const diffInDays = diffInHours / 24
  return `${Math.floor(diffInDays)}d ago`
}

export function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

export function getGameTypeColor(gameType: string): string {
  const colors = {
    coinflip: 'text-neon-green',
    roulette: 'text-neon-pink',
    dice: 'text-neon-blue',
    blackjack: 'text-neon-purple',
    poker: 'text-neon-orange',
    crash: 'text-game-win',
    mines: 'text-game-loss',
  }
  return colors[gameType as keyof typeof colors] || 'text-foreground'
}

export function getTierColor(tier: string): string {
  const colors = {
    bronze: 'text-orange-600',
    silver: 'text-gray-400',
    gold: 'text-game-gold',
    diamond: 'text-game-diamond',
    legendary: 'text-neon-purple',
  }
  return colors[tier as keyof typeof colors] || 'text-foreground'
}

export function getTierIcon(tier: string): string {
  const icons = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    diamond: '💎',
    legendary: '👑',
  }
  return icons[tier as keyof typeof icons] || '🎮'
}

export function validateBetAmount(
  amount: number, 
  minBet: number, 
  maxBet: number, 
  balance: number
): { valid: boolean; error?: string } {
  if (amount < minBet) {
    return { valid: false, error: `Minimum bet is ${formatCurrency(minBet)}` }
  }
  
  if (amount > maxBet) {
    return { valid: false, error: `Maximum bet is ${formatCurrency(maxBet)}` }
  }
  
  if (amount > balance) {
    return { valid: false, error: 'Insufficient balance' }
  }
  
  return { valid: true }
}

export function calculateOdds(
  probability: number, 
  houseEdge: number = 0.02
): number {
  const trueProbability = probability * (1 - houseEdge)
  return trueProbability > 0 ? 1 / trueProbability : 1
}

export function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function generateRoundId(): string {
  return `round_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    // Basic validation for Solana addresses (base58, 32-44 chars)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  } catch {
    return false
  }
}