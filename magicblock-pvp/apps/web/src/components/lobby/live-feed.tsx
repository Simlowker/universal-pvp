'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LiveFeedProps, GameResult } from '@/types'
import { formatCurrency, formatTimeAgo, getGameTypeColor, getTierIcon } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TrendingUp, TrendingDown, Clock, Users, Trophy, Zap } from 'lucide-react'

interface LiveFeedItem extends GameResult {
  playerName: string
  playerAvatar?: string
  playerTier: string
  isWin: boolean
  multiplier?: number
}

const mockFeedData: LiveFeedItem[] = [
  {
    id: '1',
    gameType: 'crash',
    roundId: 'round_1',
    result: { multiplier: 2.45, cashedOut: true },
    winningBets: ['player_1'],
    totalPayout: 245,
    houseWin: 0,
    finishedAt: new Date(Date.now() - 30000),
    participants: 1,
    playerName: 'CryptoWhale92',
    playerTier: 'diamond',
    isWin: true,
    multiplier: 2.45,
  },
  {
    id: '2',
    gameType: 'coinflip',
    roundId: 'round_2',
    result: { outcome: 'tails' },
    winningBets: [],
    totalPayout: 0,
    houseWin: 150,
    finishedAt: new Date(Date.now() - 45000),
    participants: 2,
    playerName: 'ApeStrong',
    playerTier: 'gold',
    isWin: false,
    multiplier: 2.0,
  },
  {
    id: '3',
    gameType: 'dice',
    roundId: 'round_3',
    result: { number: 95, target: 90 },
    winningBets: ['player_3'],
    totalPayout: 1800,
    houseWin: 0,
    finishedAt: new Date(Date.now() - 60000),
    participants: 1,
    playerName: 'LuckyDealer',
    playerTier: 'legendary',
    isWin: true,
    multiplier: 9.0,
  },
  {
    id: '4',
    gameType: 'roulette',
    roundId: 'round_4',
    result: { number: 7, color: 'red' },
    winningBets: ['player_4', 'player_5'],
    totalPayout: 3600,
    houseWin: 400,
    finishedAt: new Date(Date.now() - 90000),
    participants: 6,
    playerName: 'RouletteKing',
    playerTier: 'silver',
    isWin: true,
    multiplier: 35.0,
  },
  {
    id: '5',
    gameType: 'mines',
    roundId: 'round_5',
    result: { mines: [5, 12, 18], revealed: 8, exploded: false },
    winningBets: ['player_6'],
    totalPayout: 520,
    houseWin: 0,
    finishedAt: new Date(Date.now() - 120000),
    participants: 1,
    playerName: 'MineSweeper',
    playerTier: 'bronze',
    isWin: true,
    multiplier: 2.6,
  },
]

export function LiveFeed({ limit = 50 }: LiveFeedProps) {
  const [feedItems, setFeedItems] = useState<LiveFeedItem[]>(mockFeedData)
  const [isAutoScroll, setIsAutoScroll] = useState(true)

  // Simulate live feed updates
  useEffect(() => {
    const interval = setInterval(() => {
      const newItem: LiveFeedItem = {
        id: `live_${Date.now()}`,
        gameType: ['crash', 'coinflip', 'dice', 'roulette', 'mines'][Math.floor(Math.random() * 5)] as any,
        roundId: `round_${Date.now()}`,
        result: {},
        winningBets: Math.random() > 0.6 ? ['winner'] : [],
        totalPayout: Math.random() * 1000 + 10,
        houseWin: Math.random() > 0.6 ? 0 : Math.random() * 200,
        finishedAt: new Date(),
        participants: Math.floor(Math.random() * 8) + 1,
        playerName: `Player${Math.floor(Math.random() * 9999)}`,
        playerTier: ['bronze', 'silver', 'gold', 'diamond', 'legendary'][Math.floor(Math.random() * 5)],
        isWin: Math.random() > 0.4,
        multiplier: Math.random() * 10 + 1,
      }

      setFeedItems(prev => [newItem, ...prev.slice(0, limit - 1)])
    }, 3000 + Math.random() * 5000) // Random interval between 3-8 seconds

    return () => clearInterval(interval)
  }, [limit])

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = event.currentTarget
    setIsAutoScroll(scrollTop === 0)
  }

  return (
    <ScrollArea 
      className="h-full scrollbar-thin" 
      onScroll={handleScroll}
    >
      <AnimatePresence initial={false}>
        <div className="space-y-3">
          {feedItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                x: 0, 
                scale: 1,
                transition: { 
                  duration: 0.4,
                  delay: index * 0.05,
                  ease: "easeOut"
                }
              }}
              exit={{ 
                opacity: 0, 
                x: 20, 
                scale: 0.95,
                transition: { duration: 0.2 }
              }}
              layout
              className="live-feed-item group cursor-pointer"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center space-x-3">
                {/* Player Avatar */}
                <div className="relative">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={item.playerAvatar} />
                    <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-blue-500">
                      {item.playerName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -top-1 -right-1 text-xs">
                    {getTierIcon(item.playerTier)}
                  </div>
                </div>

                {/* Game Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium truncate">
                        {item.playerName}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getGameTypeColor(item.gameType)} border-current`}
                      >
                        {item.gameType.toUpperCase()}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(item.finishedAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center space-x-2">
                      {item.isWin ? (
                        <>
                          <TrendingUp className="w-3 h-3 text-game-win" />
                          <span className="text-sm font-bold text-game-win">
                            {formatCurrency(item.totalPayout)}
                          </span>
                          {item.multiplier && item.multiplier > 1 && (
                            <Badge className="text-xs bg-game-win/20 text-game-win">
                              {item.multiplier.toFixed(2)}x
                            </Badge>
                          )}
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-3 h-3 text-game-loss" />
                          <span className="text-sm text-game-loss">
                            -{formatCurrency(item.houseWin)}
                          </span>
                        </>
                      )}
                    </div>
                    
                    {item.participants > 1 && (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Users className="w-3 h-3 mr-1" />
                        <span>{item.participants}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Win/Loss Indicator */}
                <div className="flex flex-col items-center">
                  {item.isWin ? (
                    <>
                      <Trophy className="w-4 h-4 text-game-win win-animation" />
                      {item.multiplier && item.multiplier >= 5 && (
                        <Zap className="w-3 h-3 text-neon-orange animate-pulse" />
                      )}
                    </>
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-game-loss/20 border border-game-loss loss-animation" />
                  )}
                </div>
              </div>

              {/* Hover Effect Overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-lg" />
            </motion.div>
          ))}
        </div>
      </AnimatePresence>

      {/* Auto-scroll indicator */}
      {!isAutoScroll && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-card/90 backdrop-blur rounded-full px-3 py-1 text-xs text-muted-foreground border"
        >
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-neon-blue rounded-full animate-pulse" />
            <span>Live updates paused - scroll to top to resume</span>
          </div>
        </motion.div>
      )}
    </ScrollArea>
  )
}

// Separate component for the Avatar with fallback
function AvatarWithFallback({ src, name }: { src?: string; name: string }) {
  const [imageError, setImageError] = useState(false)

  return (
    <Avatar className="w-8 h-8">
      {src && !imageError ? (
        <AvatarImage 
          src={src} 
          onError={() => setImageError(true)}
        />
      ) : (
        <AvatarFallback className="text-xs bg-gradient-to-br from-purple-500 to-blue-500">
          {name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      )}
    </Avatar>
  )
}