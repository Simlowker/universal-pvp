'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sword, TrendingUp, Crown, Flame, Zap, 
  Trophy, Target, DollarSign 
} from 'lucide-react';

export interface LiveEvent {
  id: string;
  type: 'game_start' | 'game_end' | 'big_win' | 'streak' | 'rank_up';
  player: string;
  amount?: number;
  streak?: number;
  rank?: number;
  timestamp: Date;
}

interface LiveFeedProps {
  events: LiveEvent[];
  maxEvents?: number;
}

export function LiveFeed({ events = [], maxEvents = 10 }: LiveFeedProps) {
  const displayEvents = events.slice(0, maxEvents);

  const getEventIcon = (type: LiveEvent['type']) => {
    switch (type) {
      case 'game_start':
        return <Sword className="h-4 w-4 text-blue-400" />;
      case 'game_end':
        return <Target className="h-4 w-4 text-gray-400" />;
      case 'big_win':
        return <DollarSign className="h-4 w-4 text-green-400" />;
      case 'streak':
        return <Flame className="h-4 w-4 text-orange-400" />;
      case 'rank_up':
        return <TrendingUp className="h-4 w-4 text-purple-400" />;
      default:
        return <Zap className="h-4 w-4 text-gray-400" />;
    }
  };

  const getEventMessage = (event: LiveEvent) => {
    const playerName = event.player.slice(0, 8) + '...' + event.player.slice(-4);
    
    switch (event.type) {
      case 'game_start':
        return `${playerName} entered the arena`;
      case 'game_end':
        return `${playerName} finished a battle`;
      case 'big_win':
        return `${playerName} won ◎${event.amount?.toFixed(2)} 🎉`;
      case 'streak':
        return `${playerName} is on a ${event.streak} win streak! 🔥`;
      case 'rank_up':
        return `${playerName} reached rank #${event.rank} 🚀`;
      default:
        return `${playerName} did something awesome`;
    }
  };

  const getEventColor = (type: LiveEvent['type']) => {
    switch (type) {
      case 'game_start':
        return 'border-blue-500/30 bg-blue-500/10';
      case 'game_end':
        return 'border-gray-500/30 bg-gray-500/10';
      case 'big_win':
        return 'border-green-500/30 bg-green-500/10';
      case 'streak':
        return 'border-orange-500/30 bg-orange-500/10';
      case 'rank_up':
        return 'border-purple-500/30 bg-purple-500/10';
      default:
        return 'border-gray-500/30 bg-gray-500/10';
    }
  };

  const timeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          Live Feed
        </h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-green-400 font-medium">LIVE</span>
        </div>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {displayEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No recent activity</p>
              <p className="text-xs">Events will appear here as they happen</p>
            </div>
          ) : (
            displayEvents.map((event, index) => (
              <motion.div
                key={event.id}
                layout
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ 
                  opacity: 1, 
                  x: 0, 
                  scale: 1,
                  transition: { delay: index * 0.1 }
                }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                className={`
                  p-3 rounded-xl border transition-all duration-300
                  ${getEventColor(event.type)}
                  hover:border-white/20
                `}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 p-1.5 bg-black/20 rounded-lg">
                    {getEventIcon(event.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white leading-snug">
                      {getEventMessage(event)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {timeAgo(event.timestamp)}
                    </p>
                  </div>

                  {/* Special badges */}
                  {event.type === 'big_win' && event.amount && event.amount > 1 && (
                    <div className="flex-shrink-0">
                      <Crown className="h-4 w-4 text-yellow-400" />
                    </div>
                  )}
                  
                  {event.type === 'streak' && event.streak && event.streak >= 5 && (
                    <div className="flex-shrink-0">
                      <Trophy className="h-4 w-4 text-orange-400" />
                    </div>
                  )}
                </div>

                {/* Progress bar for big events */}
                {(event.type === 'big_win' || event.type === 'streak') && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-700/50 rounded-full h-1">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 2, ease: 'easeOut' }}
                        className={`h-1 rounded-full ${
                          event.type === 'big_win' ? 'bg-green-400' : 'bg-orange-400'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Feed stats */}
      <div className="mt-6 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-bold text-white">
              {displayEvents.filter(e => e.type === 'big_win').length}
            </p>
            <p className="text-xs text-gray-400">Big Wins</p>
          </div>
          
          <div>
            <p className="text-lg font-bold text-white">
              {displayEvents.filter(e => e.type === 'streak').length}
            </p>
            <p className="text-xs text-gray-400">Streaks</p>
          </div>
          
          <div>
            <p className="text-lg font-bold text-white">
              {displayEvents.filter(e => e.type === 'rank_up').length}
            </p>
            <p className="text-xs text-gray-400">Rank Ups</p>
          </div>
        </div>
      </div>
    </div>
  );
}