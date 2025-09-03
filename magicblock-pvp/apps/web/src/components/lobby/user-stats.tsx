'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { useUserStore } from '@/stores/user-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatPercentage, getTierColor, getTierIcon } from '@/lib/utils'
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Trophy, 
  Flame,
  DollarSign
} from 'lucide-react'

export function UserStats() {
  const { user, balance } = useUserStore()

  if (!user) return null

  const winRate = user.stats.winRate * 100
  const isPositive = user.stats.netPnL >= 0

  // Calculate tier progress (mock calculation)
  const tierProgress = {
    bronze: { min: 0, max: 100, current: Math.min(user.stats.totalGames, 100) },
    silver: { min: 100, max: 500, current: Math.min(user.stats.totalGames, 500) },
    gold: { min: 500, max: 2000, current: Math.min(user.stats.totalGames, 2000) },
    diamond: { min: 2000, max: 10000, current: Math.min(user.stats.totalGames, 10000) },
    legendary: { min: 10000, max: 50000, current: user.stats.totalGames }
  }

  const currentTierProgress = tierProgress[user.tier as keyof typeof tierProgress]
  const progressPercentage = ((currentTierProgress.current - currentTierProgress.min) / 
    (currentTierProgress.max - currentTierProgress.min)) * 100

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center space-x-4"
    >
      {/* Balance Display */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-neon-green/20">
              <DollarSign className="w-5 h-5 text-neon-green" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-lg font-bold text-neon-green">
                {formatCurrency(balance)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-4 min-w-[300px]">
            {/* Games Played */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Target className="w-4 h-4 text-neon-blue mr-1" />
              </div>
              <p className="text-lg font-bold text-neon-blue">{user.stats.totalGames}</p>
              <p className="text-xs text-muted-foreground">Games</p>
            </div>

            {/* Win Rate */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Trophy className="w-4 h-4 text-game-gold mr-1" />
              </div>
              <p className="text-lg font-bold text-game-gold">
                {winRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">Win Rate</p>
            </div>

            {/* P&L */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                {isPositive ? (
                  <TrendingUp className="w-4 h-4 text-game-win mr-1" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-game-loss mr-1" />
                )}
              </div>
              <p className={`text-lg font-bold ${isPositive ? 'text-game-win' : 'text-game-loss'}`}>
                {formatCurrency(user.stats.netPnL)}
              </p>
              <p className="text-xs text-muted-foreground">P&L</p>
            </div>

            {/* Streak */}
            <div className="text-center">
              <div className="flex items-center justify-center mb-1">
                <Flame className="w-4 h-4 text-neon-orange mr-1" />
              </div>
              <p className="text-lg font-bold text-neon-orange">
                {user.stats.currentStreak}
              </p>
              <p className="text-xs text-muted-foreground">Streak</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tier Progress */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3 min-w-[200px]">
            <div className="text-2xl">
              {getTierIcon(user.tier)}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getTierColor(user.tier)} border-current`}
                >
                  {user.tier.toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {progressPercentage.toFixed(0)}%
                </span>
              </div>
              
              <Progress 
                value={Math.min(progressPercentage, 100)} 
                className={`h-2 ${
                  user.tier === 'bronze' ? '[&>div]:bg-orange-500' :
                  user.tier === 'silver' ? '[&>div]:bg-gray-400' :
                  user.tier === 'gold' ? '[&>div]:bg-game-gold' :
                  user.tier === 'diamond' ? '[&>div]:bg-game-diamond' :
                  '[&>div]:bg-neon-purple'
                }`}
              />
              
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>{currentTierProgress.current}</span>
                <span>{currentTierProgress.max}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}