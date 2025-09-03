'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { GameCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useRouter } from 'next/navigation'
import { 
  Zap, 
  Target, 
  Dice1, 
  RotateCw, 
  Crown,
  Users,
  Clock,
  TrendingUp,
  Play,
  Star
} from 'lucide-react'

interface GameMode {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  playerCount: number
  avgWaitTime: number // seconds
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert'
  popularity: number // 0-100
  featured: boolean
  minBet: number
  maxBet: number
  rtp: number
}

const gameModes: GameMode[] = [
  {
    id: 'crash',
    name: 'Crash',
    description: 'Watch the multiplier rise and cash out before it crashes!',
    icon: <Zap className="w-6 h-6" />,
    playerCount: 2847,
    avgWaitTime: 5,
    difficulty: 'Easy',
    popularity: 95,
    featured: true,
    minBet: 0.1,
    maxBet: 1000,
    rtp: 99
  },
  {
    id: 'coinflip',
    name: 'Coin Flip',
    description: 'Simple heads or tails betting with instant results.',
    icon: <Target className="w-6 h-6" />,
    playerCount: 1923,
    avgWaitTime: 0,
    difficulty: 'Easy',
    popularity: 88,
    featured: true,
    minBet: 0.5,
    maxBet: 5000,
    rtp: 98
  },
  {
    id: 'dice',
    name: 'Dice Roll',
    description: 'Roll high or low for customizable multipliers.',
    icon: <Dice1 className="w-6 h-6" />,
    playerCount: 1456,
    avgWaitTime: 2,
    difficulty: 'Medium',
    popularity: 76,
    featured: false,
    minBet: 1,
    maxBet: 2500,
    rtp: 98.5
  },
  {
    id: 'roulette',
    name: 'Roulette',
    description: 'European roulette with live multiplayer rounds.',
    icon: <RotateCw className="w-6 h-6" />,
    playerCount: 987,
    avgWaitTime: 15,
    difficulty: 'Medium',
    popularity: 82,
    featured: false,
    minBet: 2,
    maxBet: 10000,
    rtp: 97.3
  },
  {
    id: 'poker',
    name: 'Poker',
    description: 'Texas Hold\'em tournaments and cash games.',
    icon: <Crown className="w-6 h-6" />,
    playerCount: 654,
    avgWaitTime: 30,
    difficulty: 'Expert',
    popularity: 65,
    featured: false,
    minBet: 5,
    maxBet: 25000,
    rtp: 95
  }
]

const difficultyColors = {
  Easy: 'text-neon-green border-neon-green',
  Medium: 'text-neon-blue border-neon-blue', 
  Hard: 'text-neon-orange border-neon-orange',
  Expert: 'text-neon-pink border-neon-pink'
}

export function GameModeSelector() {
  const [selectedMode, setSelectedMode] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'featured' | 'new'>('all')
  const router = useRouter()

  const handlePlayGame = (gameId: string) => {
    router.push(`/game/${gameId}`)
  }

  const filteredGames = gameModes.filter(game => {
    if (filter === 'featured') return game.featured
    if (filter === 'new') return game.popularity < 80 // Mock "new" games
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold neon-text text-neon-blue">
            Choose Your Game
          </h2>
          <p className="text-muted-foreground">
            Pick a game mode and start winning big!
          </p>
        </div>

        {/* Filters */}
        <div className="flex space-x-2">
          {['all', 'featured', 'new'].map((filterType) => (
            <Button
              key={filterType}
              variant={filter === filterType ? "neon" : "outline"}
              size="sm"
              onClick={() => setFilter(filterType as any)}
              className="capitalize"
            >
              {filterType === 'all' && <Star className="w-4 h-4 mr-1" />}
              {filterType}
            </Button>
          ))}
        </div>
      </div>

      {/* Game Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGames.map((game, index) => (
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
            onHoverStart={() => setSelectedMode(game.id)}
            onHoverEnd={() => setSelectedMode(null)}
          >
            <GameCard 
              className={`
                relative overflow-hidden cursor-pointer group h-full transition-all duration-300
                ${selectedMode === game.id ? 'scale-105 shadow-2xl' : ''}
                ${game.featured ? 'border-neon-green/30' : 'border-white/10'}
              `}
              glowColor={game.featured ? 'green' : 'blue'}
            >
              {/* Featured Badge */}
              {game.featured && (
                <div className="absolute top-3 right-3 z-10">
                  <Badge className="bg-neon-green/20 text-neon-green border-neon-green text-xs font-bold">
                    <Star className="w-3 h-3 mr-1" />
                    FEATURED
                  </Badge>
                </div>
              )}

              <div className="p-6 space-y-4">
                {/* Game Header */}
                <div className="flex items-start space-x-4">
                  <div className={`
                    p-3 rounded-xl bg-gradient-to-br transition-all duration-300 group-hover:scale-110
                    ${game.featured 
                      ? 'from-neon-green/20 to-neon-blue/20 text-neon-green' 
                      : 'from-neon-blue/20 to-neon-purple/20 text-neon-blue'
                    }
                  `}>
                    {game.icon}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-bold">{game.name}</h3>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${difficultyColors[game.difficulty]}`}
                      >
                        {game.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {game.description}
                    </p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 py-2">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-neon-blue" />
                    <div>
                      <p className="text-sm font-semibold">{game.playerCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Playing</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-neon-orange" />
                    <div>
                      <p className="text-sm font-semibold">{game.avgWaitTime}s</p>
                      <p className="text-xs text-muted-foreground">Wait Time</p>
                    </div>
                  </div>
                </div>

                {/* Popularity Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Popularity</span>
                    <span className="font-medium">{game.popularity}%</span>
                  </div>
                  <Progress 
                    value={game.popularity} 
                    className={`h-1.5 ${
                      game.featured ? '[&>div]:bg-neon-green' : '[&>div]:bg-neon-blue'
                    }`}
                  />
                </div>

                {/* Betting Range & RTP */}
                <div className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    ${game.minBet} - ${game.maxBet.toLocaleString()}
                  </div>
                  <div className="flex items-center space-x-1 text-game-win">
                    <TrendingUp className="w-3 h-3" />
                    <span className="font-semibold">{game.rtp}% RTP</span>
                  </div>
                </div>

                {/* Play Button */}
                <Button
                  className={`
                    w-full font-bold transition-all duration-300 group-hover:scale-105
                    ${game.featured 
                      ? 'bg-gradient-to-r from-neon-green to-neon-blue text-black hover:shadow-neon-green/25' 
                      : 'bg-gradient-to-r from-neon-blue to-neon-purple text-white hover:shadow-neon-blue/25'
                    }
                  `}
                  onClick={() => handlePlayGame(game.id)}
                >
                  <Play className="w-4 h-4 mr-2" />
                  PLAY {game.name.toUpperCase()}
                </Button>
              </div>

              {/* Hover Glow Effect */}
              <div className={`
                absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none rounded-xl
                ${game.featured 
                  ? 'bg-gradient-to-br from-neon-green via-transparent to-neon-blue' 
                  : 'bg-gradient-to-br from-neon-blue via-transparent to-neon-purple'
                }
              `} />

              {/* Selection Border */}
              {selectedMode === game.id && (
                <motion.div
                  className="absolute inset-0 border-2 border-neon-green rounded-xl pointer-events-none"
                  layoutId="selectedBorder"
                  transition={{ duration: 0.2 }}
                />
              )}
            </GameCard>
          </motion.div>
        ))}
      </div>

      {/* Coming Soon Games */}
      <div className="mt-8">
        <h3 className="text-lg font-bold text-muted-foreground mb-4">
          🚀 Coming Soon
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Blackjack', 'Mines', 'Baccarat'].map((name, index) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                transition: { delay: 0.5 + index * 0.1 }
              }}
            >
              <GameCard className="p-4 opacity-60 border-dashed border-white/20">
                <div className="text-center space-y-2">
                  <div className="w-10 h-10 bg-muted rounded-lg mx-auto flex items-center justify-center">
                    <Crown className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h4 className="font-semibold">{name}</h4>
                  <p className="text-xs text-muted-foreground">Coming Soon</p>
                </div>
              </GameCard>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}