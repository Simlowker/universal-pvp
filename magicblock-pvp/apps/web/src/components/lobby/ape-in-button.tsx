'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useUserStore } from '@/stores/user-store'
import { useGame } from '@/hooks/useGame'
import { Zap, Sparkles, TrendingUp, Dice6 } from 'lucide-react'
import { toast } from '@/components/providers/toast-provider'

const quickBetAmounts = [10, 25, 50, 100, 250]

export function ApeInButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState(50)
  const { user, balance, isConnected } = useUserStore()
  const { availableGames, joinGame } = useGame()

  const handleApeIn = async () => {
    if (!isConnected || !user) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to start playing!",
        variant: "destructive"
      })
      return
    }

    if (balance < selectedAmount) {
      toast({
        title: "Insufficient Balance",
        description: `You need at least $${selectedAmount} to ape in!`,
        variant: "destructive"
      })
      return
    }

    setIsLoading(true)

    try {
      // Find a popular game to join (crash is usually most popular)
      const popularGame = availableGames.find(game => game.type === 'crash') || availableGames[0]
      
      if (!popularGame) {
        throw new Error('No games available')
      }

      // Create a quick room or join existing one
      await joinGame(popularGame.id, selectedAmount)

      toast({
        title: "🚀 APE MODE ACTIVATED!",
        description: `Joined ${popularGame.name} with $${selectedAmount}!`,
        variant: "success"
      })
    } catch (error) {
      toast({
        title: "Failed to Ape In",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl animate-bounce">🦍</div>
        <p className="text-muted-foreground">
          Connect wallet to start aping!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Ape Emoji Animation */}
      <motion.div
        className="text-6xl text-center"
        animate={{ 
          rotate: [0, -10, 10, -5, 5, 0],
          scale: [1, 1.1, 0.9, 1.05, 1]
        }}
        transition={{ 
          duration: 2, 
          repeat: Infinity, 
          repeatDelay: 3 
        }}
      >
        🦍
      </motion.div>

      {/* Bet Amount Selection */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">
          Choose your ape amount:
        </p>
        <div className="grid grid-cols-3 gap-2">
          {quickBetAmounts.map((amount) => (
            <Button
              key={amount}
              variant={selectedAmount === amount ? "neon" : "outline"}
              size="sm"
              onClick={() => setSelectedAmount(amount)}
              className={`text-xs ${
                selectedAmount === amount 
                  ? 'border-neon-green text-neon-green' 
                  : 'border-muted-foreground/30'
              }`}
            >
              ${amount}
            </Button>
          ))}
        </div>
      </div>

      {/* Balance Check */}
      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground">
          Your Balance: <span className="text-neon-blue font-bold">${balance.toFixed(2)}</span>
        </p>
        {balance < selectedAmount && (
          <p className="text-xs text-game-loss">
            Insufficient balance for ${selectedAmount} bet
          </p>
        )}
      </div>

      {/* APE IN Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={handleApeIn}
          disabled={isLoading || balance < selectedAmount}
          className="ape-in-button w-full relative overflow-hidden group"
          size="xl"
        >
          <motion.div
            className="flex items-center justify-center space-x-2"
            animate={isLoading ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.5, repeat: isLoading ? Infinity : 0 }}
          >
            {isLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Zap className="w-5 h-5" />
                </motion.div>
                <span>APING IN...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>APE IN ${selectedAmount}</span>
                <TrendingUp className="w-5 h-5" />
              </>
            )}
          </motion.div>

          {/* Animated Background Effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{
              x: ['-100%', '100%']
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatDelay: 3,
              ease: "linear"
            }}
          />
        </Button>
      </motion.div>

      {/* Fun Disclaimer */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground/70">
          🍌 No actual apes were harmed in the making of this button
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="space-y-1">
          <Dice6 className="w-4 h-4 mx-auto text-neon-blue" />
          <p className="text-muted-foreground">Random</p>
          <p className="text-neon-blue font-bold">Game</p>
        </div>
        <div className="space-y-1">
          <Zap className="w-4 h-4 mx-auto text-neon-green" />
          <p className="text-muted-foreground">Instant</p>
          <p className="text-neon-green font-bold">Action</p>
        </div>
        <div className="space-y-1">
          <TrendingUp className="w-4 h-4 mx-auto text-neon-orange" />
          <p className="text-muted-foreground">High</p>
          <p className="text-neon-orange font-bold">Risk</p>
        </div>
      </div>
    </div>
  )
}