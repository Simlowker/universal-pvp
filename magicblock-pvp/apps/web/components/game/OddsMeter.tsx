'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Target, DollarSign, Percent } from 'lucide-react';

interface OddsMeterProps {
  playerOdds: number; // 0-100
  opponentOdds: number; // 0-100  
  potSize: number;
  className?: string;
}

export function OddsMeter({ 
  playerOdds = 50, 
  opponentOdds = 50, 
  potSize,
  className = '' 
}: OddsMeterProps) {
  
  // Normalize odds to ensure they add up to 100
  const totalOdds = playerOdds + opponentOdds;
  const normalizedPlayerOdds = totalOdds > 0 ? (playerOdds / totalOdds) * 100 : 50;
  const normalizedOpponentOdds = 100 - normalizedPlayerOdds;

  const expectedValue = (potSize * (normalizedPlayerOdds / 100)) - (potSize * 0.5);
  const isPlayerFavored = normalizedPlayerOdds > 50;

  return (
    <div className={`bg-gray-800/50 rounded-2xl border border-gray-700 p-6 ${className}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Target className="h-5 w-5 text-purple-400" />
          Win Probability
        </h3>
        <div className="flex items-center gap-2 text-sm">
          {isPlayerFavored ? (
            <TrendingUp className="h-4 w-4 text-green-400" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-400" />
          )}
          <span className={`font-medium ${isPlayerFavored ? 'text-green-400' : 'text-red-400'}`}>
            {isPlayerFavored ? 'FAVORABLE' : 'CHALLENGING'}
          </span>
        </div>
      </div>

      {/* Visual Odds Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-green-300">You</span>
          <span className="text-sm font-medium text-red-300">Opponent</span>
        </div>
        
        <div className="relative h-8 bg-gray-700 rounded-full overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-green-500/20" />
          
          {/* Player odds bar */}
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${normalizedPlayerOdds}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full"
            style={{
              boxShadow: `0 0 20px rgba(34, 197, 94, ${normalizedPlayerOdds / 200})`
            }}
          />
          
          {/* Opponent odds bar */}
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${normalizedOpponentOdds}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-400 to-red-500 rounded-full"
            style={{
              boxShadow: `0 0 20px rgba(239, 68, 68, ${normalizedOpponentOdds / 200})`
            }}
          />
          
          {/* Center divider */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-10 bg-gray-300 rounded-full z-10" />
        </div>
        
        {/* Percentage Labels */}
        <div className="flex items-center justify-between mt-2">
          <motion.span 
            initial={{ opacity: 0.7 }}
            animate={{ 
              opacity: normalizedPlayerOdds > 60 ? 1 : 0.7,
              scale: normalizedPlayerOdds > 60 ? 1.1 : 1
            }}
            className="text-lg font-bold text-green-400 font-gaming"
          >
            {normalizedPlayerOdds.toFixed(1)}%
          </motion.span>
          
          <motion.span 
            initial={{ opacity: 0.7 }}
            animate={{ 
              opacity: normalizedOpponentOdds > 60 ? 1 : 0.7,
              scale: normalizedOpponentOdds > 60 ? 1.1 : 1
            }}
            className="text-lg font-bold text-red-400 font-gaming"
          >
            {normalizedOpponentOdds.toFixed(1)}%
          </motion.span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Pot Size</span>
          </div>
          <p className="text-xl font-bold text-yellow-400 font-gaming">
            ◎{potSize.toFixed(3)}
          </p>
        </div>
        
        <div className="bg-gray-700/50 rounded-xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-gray-400">Expected Value</span>
          </div>
          <p className={`text-xl font-bold font-gaming ${
            expectedValue >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {expectedValue >= 0 ? '+' : ''}◎{expectedValue.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Confidence Indicator */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Confidence</span>
          <span className="text-sm font-medium text-white">
            {Math.abs(normalizedPlayerOdds - 50) < 10 ? 'Low' :
             Math.abs(normalizedPlayerOdds - 50) < 25 ? 'Medium' : 'High'}
          </span>
        </div>
        
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: `${Math.abs(normalizedPlayerOdds - 50) * 2}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              Math.abs(normalizedPlayerOdds - 50) < 10 ? 'bg-yellow-400' :
              Math.abs(normalizedPlayerOdds - 50) < 25 ? 'bg-orange-400' : 'bg-green-400'
            }`}
          />
        </div>
      </div>

      {/* Live Updates Indicator */}
      <div className="mt-6 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span>Live odds calculation</span>
          </div>
          <span className="text-gray-500">Updated 2s ago</span>
        </div>
      </div>

      {/* Strategy Hint */}
      <div className="mt-4 p-3 bg-gray-900/50 rounded-lg">
        <p className="text-xs text-gray-400 text-center">
          {normalizedPlayerOdds > 70 ? 'Strong position - consider aggressive play' :
           normalizedPlayerOdds > 55 ? 'Slight advantage - play cautiously optimistic' :
           normalizedPlayerOdds > 45 ? 'Even match - calculated risks recommended' :
           normalizedPlayerOdds > 30 ? 'Challenging spot - defensive play advised' :
           'Difficult position - consider fold or bluff'}
        </p>
      </div>
    </div>
  );
}