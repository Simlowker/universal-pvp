'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatTimeAgo, getTierIcon, getGameTypeColor } from '@/lib/utils'
import { Crown, Trophy, Medal, Sparkles } from 'lucide-react'

interface Winner {
  id: string
  playerName: string
  playerAvatar?: string
  playerTier: 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary'
  gameType: string
  winAmount: number
  multiplier: number
  timestamp: Date
  isJackpot?: boolean
}

const mockWinners: Winner[] = [
  {
    id: '1',
    playerName: 'MegaWhale2024',
    playerTier: 'legendary',
    gameType: 'crash',
    winAmount: 45670.32,
    multiplier: 127.8,
    timestamp: new Date(Date.now() - 120000),
    isJackpot: true
  },
  {
    id: '2',
    playerName: 'LuckyApe88',
    playerTier: 'diamond',
    gameType: 'roulette',
    winAmount: 12890.44,
    multiplier: 35.0,
    timestamp: new Date(Date.now() - 300000)
  },
  {
    id: '3',
    playerName: 'CoinFlipKing',
    playerTier: 'gold',
    gameType: 'coinflip',
    winAmount: 8750.00,
    multiplier: 2.0,
    timestamp: new Date(Date.now() - 450000)
  },
  {
    id: '4',
    playerName: 'DiceRoller',
    playerTier: 'silver',
    gameType: 'dice',
    winAmount: 5432.10,
    multiplier: 9.8,
    timestamp: new Date(Date.now() - 600000)
  },
  {
    id: '5',
    playerName: 'MineExplorer',
    playerTier: 'gold',
    gameType: 'mines',
    winAmount: 3210.77,
    multiplier: 4.2,
    timestamp: new Date(Date.now() - 750000)
  },
]

export function RecentWinners() {
  const [winners, setWinners] = useState<Winner[]>(mockWinners)
  const [highlightedWinner, setHighlightedWinner] = useState<string | null>(null)

  // Simulate new winners
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance of new winner
        const newWinner: Winner = {
          id: `winner_${Date.now()}`,
          playerName: `Player${Math.floor(Math.random() * 9999)}`,
          playerTier: ['bronze', 'silver', 'gold', 'diamond', 'legendary'][Math.floor(Math.random() * 5)] as any,
          gameType: ['crash', 'coinflip', 'dice', 'roulette', 'mines'][Math.floor(Math.random() * 5)],
          winAmount: Math.random() * 10000 + 100,
          multiplier: Math.random() * 50 + 1,
          timestamp: new Date(),
          isJackpot: Math.random() > 0.95
        }

        setWinners(prev => [newWinner, ...prev.slice(0, 9)])
        setHighlightedWinner(newWinner.id)
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
          setHighlightedWinner(null)
        }, 3000)
      }
    }, 8000) // Check every 8 seconds

    return () => clearInterval(interval)
  }, [])

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Crown className="w-5 h-5 text-game-gold" />
      case 1:
        return <Trophy className="w-4 h-4 text-gray-400" />
      case 2:
        return <Medal className="w-4 h-4 text-orange-600" />
      default:
        return <span className="w-5 h-5 flex items-center justify-center text-xs text-muted-foreground font-bold">#{index + 1}</span>
    }
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
      <AnimatePresence initial={false}>
        {winners.map((winner, index) => (
          <motion.div
            key={winner.id}
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              x: 0, 
              scale: 1,
              transition: { duration: 0.4, ease: "easeOut" }
            }}
            exit={{ 
              opacity: 0, 
              x: 20, 
              scale: 0.95,
              transition: { duration: 0.2 }
            }}
            layout
            className={`
              relative p-4 rounded-lg border transition-all duration-300 cursor-pointer group
              ${highlightedWinner === winner.id 
                ? 'bg-gradient-to-r from-neon-green/10 to-neon-blue/10 border-neon-green/50 shadow-lg' 
                : 'bg-card/50 border-white/10 hover:bg-card/70 hover:border-white/20'
              }
              ${winner.isJackpot ? 'ring-2 ring-game-gold/50' : ''}
            `}
          >
            {/* Jackpot Indicator */}
            {winner.isJackpot && (
              <motion.div
                className="absolute -top-2 left-1/2 transform -translate-x-1/2"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                <Badge className="bg-gradient-to-r from-game-gold to-yellow-400 text-black text-xs font-bold px-2 py-1">
                  <Sparkles className="w-3 h-3 mr-1" />
                  JACKPOT
                </Badge>
              </motion.div>
            )}

            <div className="flex items-center space-x-4">
              {/* Rank */}
              <div className="flex items-center justify-center w-8">
                {getRankIcon(index)}
              </div>

              {/* Player Info */}
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="relative">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={winner.playerAvatar} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-sm">
                      {winner.playerName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 text-sm">
                    {getTierIcon(winner.playerTier)}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-semibold text-sm truncate">
                      {winner.playerName}
                    </h4>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getGameTypeColor(winner.gameType)} border-current`}
                    >
                      {winner.gameType.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(winner.timestamp)}
                    </p>
                    {winner.multiplier > 1 && (
                      <Badge className="text-xs bg-neon-orange/20 text-neon-orange">
                        {winner.multiplier.toFixed(1)}x
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Win Amount */}
              <div className="text-right">
                <p className={`font-bold ${
                  winner.isJackpot ? 'text-game-gold text-lg' :
                  winner.winAmount > 10000 ? 'text-neon-green text-base' :
                  'text-game-win text-sm'
                }`}>
                  {formatCurrency(winner.winAmount)}
                </p>
                {winner.isJackpot && (
                  <motion.p 
                    className="text-xs text-game-gold/80"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    MEGA WIN!
                  </motion.p>
                )}
              </div>
            </div>

            {/* Hover Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-lg" />

            {/* New Winner Animation */}
            {highlightedWinner === winner.id && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-neon-green/20 via-neon-blue/20 to-neon-purple/20 rounded-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 3, ease: "easeInOut" }}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Load More Button */}
      {winners.length >= 10 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center pt-4"
        >
          <button className="text-sm text-muted-foreground hover:text-neon-blue transition-colors">
            View All Winners →
          </button>
        </motion.div>
      )}
    </div>
  )
}