'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Zap, Users, DollarSign, PlayCircle, Target, Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletContext } from '../../contexts/WalletContext';
import { useGame } from '../../contexts/GameContext';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import Button from '../../components/ui/Button';
import { LiveFeed } from '../../components/game/LiveFeed';
import { StatCard } from '../../components/ui/StatCard';

export default function LobbyPage() {
  const router = useRouter();
  const { wallet, balance } = useWalletContext();
  const { gameStats, availableMatches, joinQuickMatch, createMatch } = useGame();
  const { liveEvents, onlineCount } = useRealTimeUpdates();
  const [selectedBetAmount, setSelectedBetAmount] = useState(0.1);
  const [isApeingIn, setIsApeingIn] = useState(false);

  const betAmounts = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5];

  const handleApeIn = async () => {
    if (!wallet.connected || balance < selectedBetAmount) return;
    
    setIsApeingIn(true);
    try {
      // Quick match or create new match
      const match = availableMatches.find(m => 
        Math.abs(m.betAmount - selectedBetAmount) < 0.001
      );
      
      if (match) {
        await joinQuickMatch(match.id);
      } else {
        await createMatch(selectedBetAmount);
      }
      
      // Navigate to game room
      router.push('/game');
    } catch (error) {
      console.error('Failed to ape in:', error);
    } finally {
      setIsApeingIn(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handleApeIn();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedBetAmount, wallet.connected, balance]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-gray-900 to-blue-900/20">
      {/* Header Stats */}
      <div className="border-b border-gray-800 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              value={onlineCount.toLocaleString()}
              label="Online"
              color="green"
              pulse
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              value={gameStats.activeMatches.toString()}
              label="Active Games"
              color="blue"
            />
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              value={`$${(gameStats.totalVolume * 180).toLocaleString()}`} // SOL to USD
              label="24h Volume"
              color="yellow"
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              value={`${((gameStats.totalMatches > 0 ? gameStats.winRate : 0) * 100).toFixed(1)}%`}
              label="Win Rate"
              color="purple"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Main Betting Interface */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Ape-In Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 p-8"
            >
              <div className="text-center mb-8">
                <motion.div
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, 1, -1, 0]
                  }}
                  transition={{ 
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="inline-block mb-4"
                >
                  <Flame className="h-16 w-16 text-orange-500 mx-auto" />
                </motion.div>
                
                <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent font-gaming mb-4">
                  APE IN
                </h1>
                <p className="text-xl text-gray-400 max-w-md mx-auto">
                  Enter the arena. Battle for glory. Winner takes all.
                </p>
              </div>

              {/* Bet Amount Selection */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-white mb-4 text-center">
                  Choose Your Battle Stakes
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                  {betAmounts.map((amount) => (
                    <motion.button
                      key={amount}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedBetAmount(amount)}
                      className={`
                        p-3 rounded-xl border-2 transition-all font-bold
                        ${selectedBetAmount === amount 
                          ? 'border-purple-500 bg-purple-500/20 text-purple-300' 
                          : 'border-gray-600 bg-gray-800/50 text-gray-400 hover:border-purple-600'
                        }
                        ${balance < amount ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                      disabled={balance < amount}
                    >
                      ◎{amount}
                    </motion.button>
                  ))}
                </div>
                <p className="text-center text-sm text-gray-500 mt-2">
                  Balance: ◎{balance.toFixed(6)}
                </p>
              </div>

              {/* Ape-In Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={handleApeIn}
                  disabled={!wallet.connected || balance < selectedBetAmount || isApeingIn}
                  loading={isApeingIn}
                  className="w-full py-6 text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 border-0 shadow-2xl shadow-purple-500/25"
                  leftIcon={<PlayCircle className="h-8 w-8" />}
                >
                  {!wallet.connected 
                    ? 'CONNECT WALLET' 
                    : balance < selectedBetAmount 
                      ? 'INSUFFICIENT BALANCE'
                      : `APE IN FOR ◎${selectedBetAmount}`
                  }
                </Button>
              </motion.div>

              <div className="text-center mt-4 text-sm text-gray-500">
                Press <kbd className="px-2 py-1 bg-gray-800 rounded border text-gray-300">SPACE</kbd> to quick APE IN
              </div>
            </motion.div>

            {/* Quick Stats Grid */}
            <div className="grid md:grid-cols-3 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <Zap className="h-8 w-8 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">&lt;100ms</p>
                    <p className="text-gray-400">Avg Response</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <Target className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">98.5%</p>
                    <p className="text-gray-400">Uptime</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold text-white">{gameStats.totalMatches.toLocaleString()}</p>
                    <p className="text-gray-400">Total Battles</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Live Feed Sidebar */}
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <LiveFeed events={liveEvents} />
            </motion.div>

            {/* Navigation Links */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 space-y-3"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Quick Access</h3>
              
              <Button
                onClick={() => router.push('/profile')}
                variant="ghost"
                className="w-full justify-start text-left"
              >
                View Profile & Analytics
              </Button>
              
              <Button
                onClick={() => router.push('/leaderboard')}
                variant="ghost"
                className="w-full justify-start text-left"
              >
                Leaderboard Rankings
              </Button>
              
              <Button
                onClick={() => router.push('/tournaments')}
                variant="ghost"
                className="w-full justify-start text-left"
              >
                Active Tournaments
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Background Effects */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>
    </div>
  );
}