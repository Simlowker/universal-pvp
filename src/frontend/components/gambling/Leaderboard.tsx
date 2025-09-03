'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface LeaderboardPlayer {
  id: string;
  name: string;
  avatar?: string;
  rank: number;
  previousRank?: number;
  totalWinnings: number;
  totalBets: number;
  winRate: number;
  biggestWin: number;
  currentStreak: number;
  level: number;
  badges: string[];
  lastActive: Date;
  isCurrentUser?: boolean;
}

interface RecentWin {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  multiplier: number;
  timestamp: Date;
  match?: {
    name: string;
    result: string;
  };
}

interface LeaderboardProps {
  players: LeaderboardPlayer[];
  recentWins?: RecentWin[];
  timeframe: 'daily' | 'weekly' | 'monthly' | 'all_time';
  category: 'winnings' | 'win_rate' | 'biggest_win' | 'volume';
  onTimeframeChange: (timeframe: LeaderboardProps['timeframe']) => void;
  onCategoryChange: (category: LeaderboardProps['category']) => void;
  onPlayerSelect?: (player: LeaderboardPlayer) => void;
  showRecentWins?: boolean;
  className?: string;
}

const RANK_COLORS = {
  1: 'text-yellow-500', // Gold
  2: 'text-gray-400',   // Silver
  3: 'text-amber-600',  // Bronze
};

const RANK_ICONS = {
  1: '👑',
  2: '🥈',
  3: '🥉',
};

export const Leaderboard: React.FC<LeaderboardProps> = ({
  players = [],
  recentWins = [],
  timeframe,
  category,
  onTimeframeChange,
  onCategoryChange,
  onPlayerSelect,
  showRecentWins = true,
  className = ''
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<LeaderboardPlayer | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  // Sort players based on selected category
  const sortedPlayers = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      switch (category) {
        case 'winnings':
          return b.totalWinnings - a.totalWinnings;
        case 'win_rate':
          return b.winRate - a.winRate;
        case 'biggest_win':
          return b.biggestWin - a.biggestWin;
        case 'volume':
          return b.totalBets - a.totalBets;
        default:
          return b.totalWinnings - a.totalWinnings;
      }
    });

    // Update ranks
    return sorted.map((player, index) => ({
      ...player,
      rank: index + 1
    }));
  }, [players, category]);

  // Recent big wins (last 24 hours)
  const recentBigWins = useMemo(() => {
    return recentWins
      .filter(win => Date.now() - win.timestamp.getTime() < 24 * 60 * 60 * 1000)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [recentWins]);

  const formatCurrency = (amount: number) => `${amount.toFixed(3)} SOL`;
  const formatPercentage = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  
  const getRankIcon = (rank: number) => {
    return RANK_ICONS[rank as keyof typeof RANK_ICONS] || `#${rank}`;
  };

  const getRankColor = (rank: number) => {
    return RANK_COLORS[rank as keyof typeof RANK_COLORS] || 'text-game-text';
  };

  const getRankChange = (current: number, previous?: number) => {
    if (!previous) return null;
    const change = previous - current;
    if (change > 0) return { direction: 'up', value: change, color: 'text-green-500' };
    if (change < 0) return { direction: 'down', value: Math.abs(change), color: 'text-red-500' };
    return { direction: 'same', value: 0, color: 'text-game-muted' };
  };

  const getCategoryValue = (player: LeaderboardPlayer) => {
    switch (category) {
      case 'winnings':
        return formatCurrency(player.totalWinnings);
      case 'win_rate':
        return formatPercentage(player.winRate);
      case 'biggest_win':
        return formatCurrency(player.biggestWin);
      case 'volume':
        return `${player.totalBets} bets`;
      default:
        return formatCurrency(player.totalWinnings);
    }
  };

  const getCategoryLabel = () => {
    switch (category) {
      case 'winnings': return 'Total Winnings';
      case 'win_rate': return 'Win Rate';
      case 'biggest_win': return 'Biggest Win';
      case 'volume': return 'Total Bets';
      default: return 'Total Winnings';
    }
  };

  // Trigger animation when timeframe or category changes
  React.useEffect(() => {
    setAnimationKey(prev => prev + 1);
  }, [timeframe, category]);

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-game-text mb-1">🏆 Leaderboard</h2>
          <p className="text-game-muted text-sm">Top players ranked by {getCategoryLabel().toLowerCase()}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Timeframe Selector */}
          <div className="flex rounded-lg bg-game-surface border border-game-border overflow-hidden">
            {['daily', 'weekly', 'monthly', 'all_time'].map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf as typeof timeframe)}
                className={clsx(
                  'px-3 py-2 text-sm font-medium transition-colors',
                  timeframe === tf
                    ? 'bg-primary-500 text-white'
                    : 'text-game-muted hover:text-game-text hover:bg-game-border'
                )}
              >
                {tf.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          {/* Category Selector */}
          <div className="flex rounded-lg bg-game-surface border border-game-border overflow-hidden">
            {[
              { key: 'winnings', label: '💰' },
              { key: 'win_rate', label: '📈' },
              { key: 'biggest_win', label: '🎯' },
              { key: 'volume', label: '📊' }
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() => onCategoryChange(cat.key as typeof category)}
                className={clsx(
                  'px-3 py-2 text-sm transition-colors',
                  category === cat.key
                    ? 'bg-primary-500 text-white'
                    : 'text-game-muted hover:text-game-text hover:bg-game-border'
                )}
                title={cat.key.replace('_', ' ')}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Leaderboard */}
        <div className="lg:col-span-2">
          <div className="bg-game-surface border border-game-border rounded-xl overflow-hidden">
            {/* Podium - Top 3 */}
            {sortedPlayers.length >= 3 && (
              <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950 dark:to-amber-950 p-6 border-b border-game-border">
                <div className="flex items-end justify-center gap-4">
                  {/* 2nd Place */}
                  <motion.div
                    key={`podium-2-${animationKey}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-center cursor-pointer"
                    onClick={() => onPlayerSelect?.(sortedPlayers[1])}
                  >
                    <div className="w-16 h-16 bg-silver-500 rounded-full flex items-center justify-center text-2xl mb-2 mx-auto border-4 border-gray-400">
                      {sortedPlayers[1].avatar || sortedPlayers[1].name.charAt(0)}
                    </div>
                    <div className="text-2xl mb-1">🥈</div>
                    <div className="font-bold text-game-text text-sm">{sortedPlayers[1].name}</div>
                    <div className="text-xs text-game-muted">{getCategoryValue(sortedPlayers[1])}</div>
                  </motion.div>

                  {/* 1st Place */}
                  <motion.div
                    key={`podium-1-${animationKey}`}
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-center cursor-pointer"
                    onClick={() => onPlayerSelect?.(sortedPlayers[0])}
                  >
                    <div className="w-20 h-20 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center text-2xl mb-2 mx-auto border-4 border-yellow-500 shadow-lg">
                      {sortedPlayers[0].avatar || sortedPlayers[0].name.charAt(0)}
                    </div>
                    <div className="text-3xl mb-1">👑</div>
                    <div className="font-bold text-game-text">{sortedPlayers[0].name}</div>
                    <div className="text-sm text-game-muted">{getCategoryValue(sortedPlayers[0])}</div>
                    {sortedPlayers[0].badges.length > 0 && (
                      <div className="mt-1">
                        {sortedPlayers[0].badges.slice(0, 3).map((badge, i) => (
                          <span key={i} className="text-xs mr-1">{badge}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>

                  {/* 3rd Place */}
                  <motion.div
                    key={`podium-3-${animationKey}`}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-center cursor-pointer"
                    onClick={() => onPlayerSelect?.(sortedPlayers[2])}
                  >
                    <div className="w-16 h-16 bg-gradient-to-b from-amber-600 to-amber-800 rounded-full flex items-center justify-center text-2xl mb-2 mx-auto border-4 border-amber-600">
                      {sortedPlayers[2].avatar || sortedPlayers[2].name.charAt(0)}
                    </div>
                    <div className="text-2xl mb-1">🥉</div>
                    <div className="font-bold text-game-text text-sm">{sortedPlayers[2].name}</div>
                    <div className="text-xs text-game-muted">{getCategoryValue(sortedPlayers[2])}</div>
                  </motion.div>
                </div>
              </div>
            )}

            {/* Full Rankings */}
            <div className="divide-y divide-game-border">
              {sortedPlayers.map((player, index) => {
                const rankChange = getRankChange(player.rank, player.previousRank);
                
                return (
                  <motion.div
                    key={`${player.id}-${animationKey}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={clsx(
                      'flex items-center gap-4 p-4 hover:bg-game-border transition-colors cursor-pointer',
                      player.isCurrentUser && 'bg-primary-50 dark:bg-primary-950 border-l-4 border-primary-500'
                    )}
                    onClick={() => onPlayerSelect?.(player)}
                  >
                    {/* Rank */}
                    <div className="flex items-center gap-2 min-w-16">
                      <span className={clsx('text-xl font-bold', getRankColor(player.rank))}>
                        {getRankIcon(player.rank)}
                      </span>
                      
                      {rankChange && rankChange.direction !== 'same' && (
                        <span className={clsx('text-sm', rankChange.color)}>
                          {rankChange.direction === 'up' ? '↗' : '↘'}{rankChange.value}
                        </span>
                      )}
                    </div>

                    {/* Player Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                        {player.avatar || player.name.charAt(0)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-game-text truncate">
                            {player.name}
                          </span>
                          {player.isCurrentUser && (
                            <span className="bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-game-muted">
                          <span>Lv.{player.level}</span>
                          <span>{formatPercentage(player.winRate)} win rate</span>
                          {player.currentStreak !== 0 && (
                            <span className={clsx(
                              player.currentStreak > 0 ? 'text-green-500' : 'text-red-500'
                            )}>
                              {Math.abs(player.currentStreak)}{player.currentStreak > 0 ? 'W' : 'L'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="text-right">
                      <div className="font-bold text-game-text">
                        {getCategoryValue(player)}
                      </div>
                      <div className="text-xs text-game-muted">
                        {player.totalBets} bets
                      </div>
                    </div>

                    {/* Badges */}
                    {player.badges.length > 0 && (
                      <div className="flex gap-1">
                        {player.badges.slice(0, 2).map((badge, i) => (
                          <span key={i} className="text-lg">{badge}</span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recent Big Wins */}
          {showRecentWins && recentBigWins.length > 0 && (
            <div className="bg-game-surface border border-game-border rounded-xl p-4">
              <h3 className="text-lg font-semibold text-game-text mb-4 flex items-center gap-2">
                <span>🔥</span>
                Recent Big Wins
              </h3>
              
              <div className="space-y-3">
                {recentBigWins.map((win, index) => (
                  <motion.div
                    key={win.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border border-green-200 dark:border-green-800 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-green-700 dark:text-green-300 text-sm">
                        {win.playerName}
                      </span>
                      <span className="text-green-600 dark:text-green-400 text-xs">
                        {win.multiplier.toFixed(1)}x
                      </span>
                    </div>
                    
                    <div className="text-lg font-bold text-green-700 dark:text-green-300">
                      +{formatCurrency(win.amount)}
                    </div>
                    
                    {win.match && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {win.match.name}
                      </div>
                    )}
                    
                    <div className="text-xs text-green-500 dark:text-green-400 mt-2">
                      {new Date(win.timestamp).toLocaleTimeString()}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Leaderboard Stats */}
          <div className="bg-game-surface border border-game-border rounded-xl p-4">
            <h3 className="text-lg font-semibold text-game-text mb-4">📊 Stats</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-game-muted text-sm">Total Players</span>
                <span className="font-medium text-game-text">{players.length}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-game-muted text-sm">Total Wagered</span>
                <span className="font-medium text-game-text">
                  {formatCurrency(players.reduce((sum, p) => sum + (p.totalBets * 10), 0))}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-game-muted text-sm">Biggest Win</span>
                <span className="font-medium text-green-500">
                  {formatCurrency(Math.max(...players.map(p => p.biggestWin)))}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-game-muted text-sm">Average Win Rate</span>
                <span className="font-medium text-game-text">
                  {formatPercentage(players.reduce((sum, p) => sum + p.winRate, 0) / players.length)}
                </span>
              </div>
            </div>
          </div>

          {/* Achievement Showcase */}
          <div className="bg-game-surface border border-game-border rounded-xl p-4">
            <h3 className="text-lg font-semibold text-game-text mb-4">🏅 Achievements</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-game-bg rounded-lg">
                <div className="text-2xl mb-1">🎯</div>
                <div className="text-xs text-game-muted">High Roller</div>
                <div className="text-sm font-medium text-game-text">
                  {players.filter(p => p.badges.includes('🎯')).length}
                </div>
              </div>
              
              <div className="text-center p-3 bg-game-bg rounded-lg">
                <div className="text-2xl mb-1">🔥</div>
                <div className="text-xs text-game-muted">Hot Streak</div>
                <div className="text-sm font-medium text-game-text">
                  {players.filter(p => p.badges.includes('🔥')).length}
                </div>
              </div>
              
              <div className="text-center p-3 bg-game-bg rounded-lg">
                <div className="text-2xl mb-1">💎</div>
                <div className="text-xs text-game-muted">Diamond</div>
                <div className="text-sm font-medium text-game-text">
                  {players.filter(p => p.badges.includes('💎')).length}
                </div>
              </div>
              
              <div className="text-center p-3 bg-game-bg rounded-lg">
                <div className="text-2xl mb-1">⚡</div>
                <div className="text-xs text-game-muted">Lightning</div>
                <div className="text-sm font-medium text-game-text">
                  {players.filter(p => p.badges.includes('⚡')).length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Player Detail Modal */}
      <AnimatePresence>
        {selectedPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPlayer(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
                  {selectedPlayer.avatar || selectedPlayer.name.charAt(0)}
                </div>
                <h3 className="text-xl font-semibold text-game-text">{selectedPlayer.name}</h3>
                <div className="flex justify-center gap-2 mt-2">
                  {selectedPlayer.badges.map((badge, i) => (
                    <span key={i} className="text-lg">{badge}</span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary-600">#{selectedPlayer.rank}</div>
                  <div className="text-sm text-game-muted">Rank</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-game-text">{selectedPlayer.level}</div>
                  <div className="text-sm text-game-muted">Level</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-game-muted">Total Winnings:</span>
                  <span className="font-medium text-green-500">{formatCurrency(selectedPlayer.totalWinnings)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-game-muted">Win Rate:</span>
                  <span className="font-medium text-game-text">{formatPercentage(selectedPlayer.winRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-game-muted">Biggest Win:</span>
                  <span className="font-medium text-game-text">{formatCurrency(selectedPlayer.biggestWin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-game-muted">Total Bets:</span>
                  <span className="font-medium text-game-text">{selectedPlayer.totalBets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-game-muted">Current Streak:</span>
                  <span className={clsx(
                    'font-medium',
                    selectedPlayer.currentStreak > 0 ? 'text-green-500' : 
                    selectedPlayer.currentStreak < 0 ? 'text-red-500' : 'text-game-muted'
                  )}>
                    {selectedPlayer.currentStreak === 0 ? 'None' : 
                     `${Math.abs(selectedPlayer.currentStreak)}${selectedPlayer.currentStreak > 0 ? 'W' : 'L'}`}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedPlayer(null)}
                className="w-full mt-6 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Leaderboard;