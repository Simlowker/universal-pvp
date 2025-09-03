'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  User, Trophy, Target, TrendingUp, Clock, 
  Shield, Sword, Heart, Zap, Crown, Star
} from 'lucide-react';

interface PlayerStatsProps {
  player: any;
  title: string;
  isCurrentPlayer?: boolean;
  className?: string;
}

export function PlayerStats({ 
  player, 
  title, 
  isCurrentPlayer = false,
  className = '' 
}: PlayerStatsProps) {
  
  if (!player) {
    return (
      <div className={`bg-gray-800/50 rounded-xl border border-gray-700 p-6 ${className}`}>
        <div className="text-center text-gray-400">
          <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Waiting for player...</p>
        </div>
      </div>
    );
  }

  const winRate = player.wins && player.losses 
    ? (player.wins / (player.wins + player.losses)) * 100 
    : 0;

  const getPerformanceColor = (rate: number) => {
    if (rate >= 70) return 'text-green-400';
    if (rate >= 60) return 'text-yellow-400';
    if (rate >= 50) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRankBadge = (rank: number) => {
    if (rank <= 10) return { color: 'bg-yellow-500', icon: <Crown className="h-3 w-3" /> };
    if (rank <= 50) return { color: 'bg-purple-500', icon: <Trophy className="h-3 w-3" /> };
    if (rank <= 100) return { color: 'bg-blue-500', icon: <Star className="h-3 w-3" /> };
    return { color: 'bg-gray-500', icon: null };
  };

  const rankBadge = getRankBadge(player.ranking || 999);

  return (
    <motion.div
      initial={{ opacity: 0, x: title === 'You' ? -20 : 20 }}
      animate={{ 
        opacity: 1, 
        x: 0,
        scale: isCurrentPlayer ? 1.02 : 1,
        y: isCurrentPlayer ? -2 : 0
      }}
      className={`
        bg-gray-800/50 rounded-2xl border-2 p-6 transition-all duration-300
        ${isCurrentPlayer 
          ? 'border-green-400 bg-green-500/5 shadow-green-500/20' 
          : 'border-gray-700'
        }
        ${className}
      `}
    >
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {isCurrentPlayer && (
          <div className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
            <span className="text-xs font-medium text-green-300">ACTIVE</span>
          </div>
        )}
      </div>

      {/* Player Avatar & Info */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`relative w-16 h-16 rounded-full border-2 flex items-center justify-center ${
          isCurrentPlayer ? 'border-green-400 bg-green-500/10' : 'border-gray-500 bg-gray-700'
        }`}>
          <span className="text-xl font-bold text-white">
            {(player.username || 'A').charAt(0).toUpperCase()}
          </span>
          
          {/* Status indicator */}
          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-800 ${
            player.isOnline !== false ? 'bg-green-500' : 'bg-gray-500'
          }`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white truncate">
            {player.username || 'Anonymous Player'}
          </p>
          <p className="text-sm text-gray-400 font-mono">
            {player.id.slice(0, 8)}...{player.id.slice(-4)}
          </p>
          
          {/* Rank Badge */}
          {player.ranking && (
            <div className={`inline-flex items-center gap-1 px-2 py-1 ${rankBadge.color} rounded-full mt-1`}>
              {rankBadge.icon}
              <span className="text-xs font-medium text-white">
                #{player.ranking}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Game Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-700/50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Heart className="h-4 w-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-white font-gaming">
            {player.health || 100}
          </p>
          <p className="text-xs text-gray-400">Health</p>
        </div>
        
        <div className="bg-gray-700/50 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white font-gaming">
            {player.energy || 50}
          </p>
          <p className="text-xs text-gray-400">Energy</p>
        </div>
      </div>

      {/* Combat Stats */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sword className="h-4 w-4 text-orange-400" />
            <span className="text-sm text-gray-400">Attack</span>
          </div>
          <span className="text-white font-bold">{player.attack || 15}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-gray-400">Defense</span>
          </div>
          <span className="text-white font-bold">{player.defense || 10}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-gray-400">Speed</span>
          </div>
          <span className="text-white font-bold">{player.speed || 12}</span>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Wins</span>
          </div>
          <span className="text-green-400 font-bold">{player.wins || 0}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-red-400" />
            <span className="text-sm text-gray-400">Losses</span>
          </div>
          <span className="text-red-400 font-bold">{player.losses || 0}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-gray-400">Win Rate</span>
          </div>
          <span className={`font-bold ${getPerformanceColor(winRate)}`}>
            {winRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Win Rate Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Performance</span>
          <span className={`text-xs font-medium ${getPerformanceColor(winRate)}`}>
            {winRate >= 70 ? 'Excellent' :
             winRate >= 60 ? 'Good' :
             winRate >= 50 ? 'Average' : 'Needs Improvement'}
          </span>
        </div>
        
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winRate}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              winRate >= 70 ? 'bg-green-400' :
              winRate >= 60 ? 'bg-yellow-400' :
              winRate >= 50 ? 'bg-orange-400' : 'bg-red-400'
            }`}
          />
        </div>
      </div>

      {/* Current Streak */}
      {player.currentStreak && player.currentStreak > 0 && (
        <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg p-3 border border-orange-500/30">
          <div className="flex items-center justify-center gap-2">
            <div className="flex">
              {Array.from({ length: Math.min(player.currentStreak, 5) }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="text-orange-400"
                >
                  🔥
                </motion.div>
              ))}
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-orange-400 font-gaming">
                {player.currentStreak}
              </p>
              <p className="text-xs text-gray-300">Win Streak</p>
            </div>
          </div>
        </div>
      )}

      {/* Level Progress */}
      {player.level && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">
              Level {player.level}
            </span>
            <span className="text-xs text-gray-400">
              {player.experience || 0} XP
            </span>
          </div>
          
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((player.experience || 0) % 1000) / 10}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-purple-400 to-blue-400 rounded-full"
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}