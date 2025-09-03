'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { TrendingGamesProps, Game } from '@/types'
import { formatCurrency, formatNumber, getGameTypeColor } from '@/lib/utils'
import { GameCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Play, 
  Flame,
  Zap,
  Crown,
  Target
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const mockTrendingGames: Game[] = [
  {
    id: 'crash',
    type: 'crash',
    name: 'Crash',
    description: 'Watch the multiplier grow and cash out before the crash!',
    minBet: 0.1,
    maxBet: 1000,
    houseEdge: 0.01,
    isActive: true,
    playerCount: 2847,
    maxPlayers: 1000,
    totalVolume: 89432.45,
    recentGames: []
  },
  {
    id: 'coinflip',
    type: 'coinflip',
    name: 'Coin Flip',
    description: 'Classic heads or tails - double or nothing!',
    minBet: 0.5,
    maxBet: 5000,
    houseEdge: 0.02,
    isActive: true,
    playerCount: 1923,
    maxPlayers: 2,
    totalVolume: 67821.23,
    recentGames: []
  },
  {
    id: 'dice',
    type: 'dice',
    name: 'Dice Roll',
    description: 'Roll high or low for massive multipliers!',
    minBet: 1,
    maxBet: 2500,
    houseEdge: 0.015,
    isActive: true,
    playerCount: 1456,
    maxPlayers: 8,
    totalVolume: 45678.91,
    recentGames: []
  },
  {
    id: 'roulette',
    type: 'roulette',
    name: 'Roulette',
    description: 'European roulette with live multiplayer action!',
    minBet: 2,
    maxBet: 10000,
    houseEdge: 0.027,
    isActive: true,
    playerCount: 987,
    maxPlayers: 12,
    totalVolume: 123456.78,
    recentGames: []
  },
]

const gameIcons = {
  crash: Zap,
  coinflip: Target,
  dice: Crown,
  roulette: Flame,
  blackjack: Play,
  poker: Play,
  mines: Flame,
}

export function TrendingGames({ onGameSelect }: TrendingGamesProps) {
  const router = useRouter()

  const handlePlayGame = (game: Game) => {
    if (onGameSelect) {
      onGameSelect(game)
    } else {
      router.push(`/game/${game.type}`)
    }
  }

  const getTrendScore = (game: Game) => {
    // Simple trending score based on player count and volume
    return (game.playerCount * 0.6) + (game.totalVolume * 0.0001)
  }

  const sortedGames = mockTrendingGames
    .sort((a, b) => getTrendScore(b) - getTrendScore(a))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {sortedGames.map((game, index) => {
        const IconComponent = gameIcons[game.type] || Play
        const trendScore = getTrendScore(game)
        const popularityPercent = Math.min((game.playerCount / 3000) * 100, 100)
        
        return (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: 1, 
              y: 0,
              transition: { 
                delay: index * 0.1,
                duration: 0.5,
                ease: "easeOut"
              }
            }}
            whileHover={{ y: -5 }}
          >
            <GameCard 
              className="relative overflow-hidden cursor-pointer group h-full"
              glowColor={index === 0 ? 'green' : index === 1 ? 'blue' : 'purple'}
              onClick={() => handlePlayGame(game)}
            >
              {/* Hot/Trending Badge */}
              {index < 2 && (
                <div className="absolute top-3 right-3 z-10">
                  <Badge 
                    className={`text-xs font-bold ${
                      index === 0 
                        ? 'bg-neon-orange/20 text-neon-orange border-neon-orange' 
                        : 'bg-neon-pink/20 text-neon-pink border-neon-pink'
                    }`}
                  >
                    <Flame className="w-3 h-3 mr-1" />
                    {index === 0 ? 'HOT' : 'TRENDING'}
                  </Badge>
                </div>
              )}

              <div className="p-6 space-y-4">
                {/* Game Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${
                      index === 0 ? 'from-neon-green/20 to-neon-blue/20' :
                      index === 1 ? 'from-neon-pink/20 to-neon-purple/20' :
                      'from-neon-blue/20 to-neon-purple/20'
                    }`}>
                      <IconComponent className={`w-5 h-5 ${getGameTypeColor(game.type)}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{game.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {game.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Game Stats */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-1 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{formatNumber(game.playerCount)} playing</span>
                    </div>
                    <div className="flex items-center space-x-1 text-neon-green">
                      <TrendingUp className="w-4 h-4" />
                      <span className="font-bold">
                        {((1 - game.houseEdge) * 100).toFixed(1)}% RTP
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Popularity</span>
                      <span className="font-medium">{popularityPercent.toFixed(0)}%</span>
                    </div>
                    <Progress 
                      value={popularityPercent} 
                      className={`h-1 ${
                        index === 0 ? '[&>div]:bg-neon-green' :
                        index === 1 ? '[&>div]:bg-neon-blue' :
                        '[&>div]:bg-neon-purple'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-1 text-muted-foreground">
                      <DollarSign className="w-4 h-4" />
                      <span>{formatCurrency(game.minBet)} - {formatCurrency(game.maxBet)}</span>
                    </div>
                    <div className="text-game-gold font-bold">
                      {formatCurrency(game.totalVolume, 0)}
                    </div>
                  </div>
                </div>

                {/* Play Button */}
                <Button
                  className={`w-full font-bold transition-all duration-300 group-hover:scale-105 ${
                    index === 0 
                      ? 'bg-gradient-to-r from-neon-green to-neon-blue text-black hover:shadow-neon-green/25' 
                      : index === 1
                      ? 'bg-gradient-to-r from-neon-pink to-neon-purple text-white hover:shadow-neon-pink/25'
                      : 'bg-gradient-to-r from-neon-blue to-neon-purple text-white hover:shadow-neon-blue/25'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlayGame(game)
                  }}
                >
                  <Play className="w-4 h-4 mr-2" />
                  PLAY NOW
                </Button>
              </div>

              {/* Hover Glow Effect */}
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300 bg-gradient-to-br ${
                index === 0 ? 'from-neon-green via-transparent to-neon-blue' :
                index === 1 ? 'from-neon-pink via-transparent to-neon-purple' :
                'from-neon-blue via-transparent to-neon-purple'
              } pointer-events-none rounded-xl`} />
            </GameCard>
          </motion.div>
        )
      })}
    </div>
  )
}