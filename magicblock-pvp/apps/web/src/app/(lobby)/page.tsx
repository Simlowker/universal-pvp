'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { LiveFeed } from '@/components/lobby/live-feed'
import { TrendingGames } from '@/components/lobby/trending-games'
import { ApeInButton } from '@/components/lobby/ape-in-button'
import { WalletConnect } from '@/components/wallet/wallet-connect'
import { UserStats } from '@/components/lobby/user-stats'
import { RecentWinners } from '@/components/lobby/recent-winners'
import { GameModeSelector } from '@/components/lobby/game-mode-selector'
import { useUserStore } from '@/stores/user-store'
import { useWebSocketContext } from '@/components/providers/websocket-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff } from 'lucide-react'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
}

export default function LobbyPage() {
  const { user, isConnected } = useUserStore()
  const { isConnected: wsConnected, error: wsError } = useWebSocketContext()

  return (
    <motion.div
      className="min-h-screen p-4 md:p-6 lg:p-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <motion.div
        className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8"
        variants={itemVariants}
      >
        <div className="flex flex-col space-y-2">
          <h1 className="text-4xl md:text-6xl font-bold neon-text text-neon-blue">
            MagicBlock PvP
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground">
            The Ultimate Gambling Arena
          </p>
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <Badge variant="secondary" className="bg-game-win/20 text-game-win">
                <Wifi className="w-3 h-3 mr-1" />
                Live
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-game-loss/20 text-game-loss">
                <WifiOff className="w-3 h-3 mr-1" />
                Offline
              </Badge>
            )}
            {wsError && (
              <Badge variant="destructive" className="text-xs">
                Connection Error
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          {isConnected && user && <UserStats />}
          <WalletConnect />
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Game Selection & Stats */}
        <div className="lg:col-span-8 space-y-6">
          {/* Game Mode Selector */}
          <motion.div variants={itemVariants}>
            <GameModeSelector />
          </motion.div>

          {/* Trending Games */}
          <motion.div variants={itemVariants}>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-neon-pink">
                  🔥 Trending Games
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrendingGames games={[]} onGameSelect={() => {}} />
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Winners */}
          <motion.div variants={itemVariants}>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-xl font-bold text-game-gold">
                  🏆 Recent Winners
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecentWinners />
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column - Live Feed & Quick Actions */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Action - APE IN */}
          <motion.div variants={itemVariants}>
            <Card className="glass-card border-neon-green/30">
              <CardContent className="p-6 text-center">
                <h3 className="text-xl font-bold mb-4 text-neon-green">
                  Feeling Lucky?
                </h3>
                <ApeInButton />
              </CardContent>
            </Card>
          </motion.div>

          {/* Live Feed */}
          <motion.div variants={itemVariants}>
            <Card className="glass-card h-[600px] flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <span className="w-2 h-2 bg-game-win rounded-full animate-pulse"></span>
                  Live Feed
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <LiveFeed games={[]} />
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Stats */}
          <motion.div variants={itemVariants}>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg font-bold">
                  🎯 Today&apos;s Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-neon-blue">1,247</div>
                    <div className="text-muted-foreground">Games Played</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-game-gold">
                      $45.2K
                    </div>
                    <div className="text-muted-foreground">Total Volume</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-neon-green">892</div>
                    <div className="text-muted-foreground">Active Players</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-neon-pink">
                      $12.8K
                    </div>
                    <div className="text-muted-foreground">Biggest Win</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Bottom CTA Section */}
      {!isConnected && (
        <motion.div
          className="mt-12 text-center"
          variants={itemVariants}
        >
          <Card className="glass-card border-neon-purple/30 max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4 neon-text text-neon-purple">
                Ready to Start Playing?
              </h3>
              <p className="text-muted-foreground mb-6">
                Connect your wallet and join thousands of players in the most exciting
                gambling experience on Solana!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <WalletConnect />
                <span className="text-sm text-muted-foreground">
                  Fast • Fair • Fun
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}