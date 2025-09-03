'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Crown, Trophy, Medal, TrendingUp, Users, Filter,
  Calendar, DollarSign, Target, Flame, Star, Award
} from 'lucide-react';
import { useLeaderboard } from '../../hooks/useLeaderboard';
import { useWalletContext } from '../../contexts/WalletContext';
import Button from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';

type LeaderboardType = 'global' | 'monthly' | 'weekly' | 'daily';
type SortBy = 'winnings' | 'winRate' | 'gamesPlayed' | 'streak';

export default function LeaderboardPage() {
  const { wallet } = useWalletContext();
  const [leaderboardType, setLeaderboardType] = useState<LeaderboardType>('global');
  const [sortBy, setSortBy] = useState<SortBy>('winnings');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const {
    leaderboard,
    myRanking,
    globalStats,
    isLoading,
    refreshLeaderboard
  } = useLeaderboard(leaderboardType, sortBy, currentPage, itemsPerPage);

  const getRankIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Crown className="h-6 w-6 text-yellow-400" />;
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 3:
        return <Award className="h-6 w-6 text-orange-400" />;
      default:
        return <span className="text-lg font-bold text-gray-400">#{position}</span>;
    }
  };

  const getRankBadge = (position: number) => {
    if (position <= 3) {
      return `bg-gradient-to-r ${
        position === 1 ? 'from-yellow-400 to-yellow-600' :
        position === 2 ? 'from-gray-400 to-gray-600' :
        'from-orange-400 to-orange-600'
      } text-white`;
    }
    return position <= 10 ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
           position <= 50 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
           'bg-gray-500/20 text-gray-300 border border-gray-500/30';
  };

  const formatWinnings = (amount: number) => {
    if (amount >= 1000) {
      return `◎${(amount / 1000).toFixed(1)}K`;
    }
    return `◎${amount.toFixed(2)}`;
  };

  const getStreakEmoji = (streak: number) => {
    if (streak >= 10) return '🔥';
    if (streak >= 5) return '⚡';
    if (streak >= 3) return '🎯';
    return '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-gray-900 to-blue-900/20">
      
      {/* Header */}
      <div className="border-b border-gray-800 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-white font-gaming mb-2">
                Leaderboard
              </h1>
              <p className="text-gray-400 text-lg">
                Compete for glory and claim your place among legends
              </p>
            </div>
            <Button
              onClick={refreshLeaderboard}
              loading={isLoading}
              variant="outline"
              leftIcon={<TrendingUp className="h-4 w-4" />}
            >
              Refresh Rankings
            </Button>
          </div>

          {/* Global Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              value={globalStats?.totalPlayers?.toLocaleString() || '0'}
              label="Total Players"
              color="blue"
            />
            <StatCard
              icon={<Trophy className="h-5 w-5" />}
              value={globalStats?.totalGames?.toLocaleString() || '0'}
              label="Games Played"
              color="yellow"
            />
            <StatCard
              icon={<DollarSign className="h-5 w-5" />}
              value={formatWinnings(globalStats?.totalPrizePool || 0)}
              label="Total Prize Pool"
              color="green"
            />
            <StatCard
              icon={<Flame className="h-5 w-5" />}
              value={globalStats?.biggestWin ? formatWinnings(globalStats.biggestWin) : '◎0'}
              label="Biggest Win"
              color="red"
            />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Leaderboard Type */}
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <div className="flex rounded-lg overflow-hidden border border-gray-700">
                {(['global', 'monthly', 'weekly', 'daily'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setLeaderboardType(type)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      leaderboardType === type
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort By */}
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {(['winnings', 'winRate', 'gamesPlayed', 'streak'] as const).map((sort) => (
                <button
                  key={sort}
                  onClick={() => setSortBy(sort)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    sortBy === sort
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                  }`}
                >
                  {sort === 'winnings' ? 'Winnings' :
                   sort === 'winRate' ? 'Win Rate' :
                   sort === 'gamesPlayed' ? 'Games' :
                   'Streak'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          
          {/* Main Leaderboard */}
          <div className="lg:col-span-3">
            
            {/* My Ranking (if connected) */}
            {wallet.connected && myRanking && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20 p-6 mb-6"
              >
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Your Ranking
                </h3>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                      {getRankIcon(myRanking.position)}
                    </div>
                    <div>
                      <p className="text-xl font-bold text-white">
                        #{myRanking.position}
                      </p>
                      <p className="text-purple-300">
                        {myRanking.username || 'Anonymous'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div>
                      <p className="text-2xl font-bold text-green-400">
                        {formatWinnings(myRanking.totalWinnings)}
                      </p>
                      <p className="text-sm text-gray-400">Winnings</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-blue-400">
                        {(myRanking.winRate * 100).toFixed(1)}%
                      </p>
                      <p className="text-sm text-gray-400">Win Rate</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-yellow-400">
                        {myRanking.currentStreak} {getStreakEmoji(myRanking.currentStreak)}
                      </p>
                      <p className="text-sm text-gray-400">Streak</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Leaderboard Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden"
            >
              <div className="p-6 border-b border-gray-700">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  {leaderboardType.charAt(0).toUpperCase() + leaderboardType.slice(1)} Rankings
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="text-left p-4 text-sm font-semibold text-gray-300">Rank</th>
                      <th className="text-left p-4 text-sm font-semibold text-gray-300">Player</th>
                      <th className="text-left p-4 text-sm font-semibold text-gray-300">Winnings</th>
                      <th className="text-left p-4 text-sm font-semibold text-gray-300">Win Rate</th>
                      <th className="text-left p-4 text-sm font-semibold text-gray-300">Games</th>
                      <th className="text-left p-4 text-sm font-semibold text-gray-300">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="border-b border-gray-700/50">
                            <td colSpan={6} className="p-4">
                              <div className="animate-pulse bg-gray-700 h-6 rounded"></div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        leaderboard?.map((player, index) => (
                          <motion.tr
                            key={player.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ delay: index * 0.05 }}
                            className={`
                              border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors
                              ${player.id === wallet.publicKey?.toString() ? 'bg-purple-500/10' : ''}
                            `}
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                {getRankIcon(player.rank)}
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRankBadge(player.rank)}`}>
                                  {player.rank <= 10 ? 'TOP 10' :
                                   player.rank <= 50 ? 'TOP 50' :
                                   player.rank <= 100 ? 'TOP 100' : ''}
                                </span>
                              </div>
                            </td>
                            
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                                  <span className="text-xs font-bold text-white">
                                    {(player.username || 'A').charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-medium text-white">
                                    {player.username || 'Anonymous'}
                                  </p>
                                  <p className="text-xs text-gray-400 font-mono">
                                    {player.id.slice(0, 8)}...{player.id.slice(-4)}
                                  </p>
                                </div>
                                {player.id === wallet.publicKey?.toString() && (
                                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                                    YOU
                                  </span>
                                )}
                              </div>
                            </td>
                            
                            <td className="p-4">
                              <p className="font-bold text-green-400">
                                {formatWinnings(player.totalWinnings)}
                              </p>
                              <p className="text-xs text-gray-400">
                                {player.totalGamesWon}W / {player.totalGamesLost}L
                              </p>
                            </td>
                            
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  player.winRate >= 0.6 ? 'bg-green-500' :
                                  player.winRate >= 0.5 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`} />
                                <span className="font-semibold text-white">
                                  {(player.winRate * 100).toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            
                            <td className="p-4">
                              <p className="font-semibold text-white">
                                {(player.totalGamesWon + player.totalGamesLost).toLocaleString()}
                              </p>
                            </td>
                            
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">
                                  {player.currentStreak}
                                </span>
                                <span className="text-lg">
                                  {getStreakEmoji(player.currentStreak)}
                                </span>
                                {player.longestStreak > player.currentStreak && (
                                  <span className="text-xs text-gray-400">
                                    (Best: {player.longestStreak})
                                  </span>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {leaderboard && leaderboard.length >= itemsPerPage && (
                <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                  <p className="text-sm text-gray-400">
                    Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, leaderboard.length)} results
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      variant="outline"
                      size="sm"
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={leaderboard.length < itemsPerPage}
                      variant="outline"
                      size="sm"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            
            {/* Top Performers */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-400" />
                Hall of Fame
              </h3>
              
              <div className="space-y-4">
                {leaderboard?.slice(0, 3).map((player, index) => (
                  <div key={player.id} className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' :
                      index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-600' :
                      'bg-gradient-to-r from-orange-400 to-orange-600'
                    }`}>
                      {getRankIcon(index + 1)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white text-sm">
                        {player.username || 'Anonymous'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatWinnings(player.totalWinnings)} • {(player.winRate * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Leaderboard Info */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Ranking System
              </h3>
              
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-300 font-medium">Global Rankings</p>
                  <p className="text-gray-400">All-time performance across all games</p>
                </div>
                
                <div>
                  <p className="text-gray-300 font-medium">Monthly Rankings</p>
                  <p className="text-gray-400">Performance within the current month</p>
                </div>
                
                <div>
                  <p className="text-gray-300 font-medium">Weekly Rankings</p>
                  <p className="text-gray-400">Last 7 days of competitive play</p>
                </div>
                
                <div>
                  <p className="text-gray-300 font-medium">Daily Rankings</p>
                  <p className="text-gray-400">Today's top performers</p>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-gray-700">
                <p className="text-xs text-gray-500">
                  Rankings update every 5 minutes. Minimum 10 games required for global rankings.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}