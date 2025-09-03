'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, TrendingUp, TrendingDown, DollarSign, Target, 
  Calendar, Trophy, BarChart3, PieChart, LineChart,
  Filter, Download, RefreshCw, Award
} from 'lucide-react';
import { 
  LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, AreaChart, Area, PieChart as RechartsPieChart,
  Cell, BarChart, Bar
} from 'recharts';
import { useWalletContext } from '../../contexts/WalletContext';
import { useProfile } from '../../hooks/useProfile';
import Button from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';

export default function ProfilePage() {
  const { wallet } = useWalletContext();
  const { 
    profile, 
    gameHistory, 
    pnlData, 
    performanceMetrics,
    achievements,
    isLoading,
    refreshProfile 
  } = useProfile();
  
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [chartType, setChartType] = useState<'pnl' | 'winRate' | 'volume'>('pnl');

  // Filter data based on time range
  const filteredPnlData = React.useMemo(() => {
    if (!pnlData) return [];
    
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeRange) {
      case '24h':
        cutoff.setHours(now.getHours() - 24);
        break;
      case '7d':
        cutoff.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoff.setDate(now.getDate() - 30);
        break;
      default:
        return pnlData;
    }
    
    return pnlData.filter(item => new Date(item.date) >= cutoff);
  }, [pnlData, timeRange]);

  const totalPnL = filteredPnlData.reduce((sum, item) => sum + item.pnl, 0);
  const winRate = profile ? (profile.wins / (profile.wins + profile.losses)) * 100 : 0;
  const avgBetSize = profile ? profile.totalVolume / profile.totalGames : 0;

  // Chart colors
  const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

  if (!wallet.connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-gray-900 to-blue-900/20 flex items-center justify-center">
        <div className="text-center space-y-4">
          <User className="h-16 w-16 text-gray-400 mx-auto" />
          <h2 className="text-2xl font-bold text-white">Connect Wallet</h2>
          <p className="text-gray-400">Connect your wallet to view your profile and statistics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-gray-900 to-blue-900/20">
      
      {/* Profile Header */}
      <div className="border-b border-gray-800 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Avatar */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 p-1">
                  <div className="w-full h-full rounded-full bg-gray-900 flex items-center justify-center">
                    <User className="h-8 w-8 text-gray-400" />
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-gray-900"></div>
              </div>
              
              {/* Profile Info */}
              <div>
                <h1 className="text-3xl font-bold text-white font-gaming">
                  {profile?.username || 'Anonymous Player'}
                </h1>
                <p className="text-gray-400 text-lg">Level {profile?.level || 1}</p>
                <p className="text-gray-500 text-sm font-mono">
                  {wallet.publicKey?.toString().slice(0, 8)}...{wallet.publicKey?.toString().slice(-8)}
                </p>
              </div>
            </div>
            
            <Button
              onClick={refreshProfile}
              loading={isLoading}
              variant="outline"
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={<TrendingUp className="h-6 w-6" />}
            value={`${totalPnL >= 0 ? '+' : ''}◎${totalPnL.toFixed(4)}`}
            label="Total P&L"
            color={totalPnL >= 0 ? 'green' : 'red'}
            trend={totalPnL >= 0 ? 'up' : 'down'}
          />
          
          <StatCard
            icon={<Target className="h-6 w-6" />}
            value={`${winRate.toFixed(1)}%`}
            label="Win Rate"
            color={winRate > 50 ? 'green' : winRate > 40 ? 'yellow' : 'red'}
          />
          
          <StatCard
            icon={<DollarSign className="h-6 w-6" />}
            value={`◎${avgBetSize.toFixed(3)}`}
            label="Avg Bet Size"
            color="blue"
          />
          
          <StatCard
            icon={<Trophy className="h-6 w-6" />}
            value={profile?.ranking?.toString() || 'Unranked'}
            label="Global Rank"
            color="purple"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Charts Section */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Chart Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <div className="flex rounded-lg overflow-hidden border border-gray-700">
                  {(['24h', '7d', '30d', 'all'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-3 py-1 text-sm font-medium transition-colors ${
                        timeRange === range
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      {range.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {(['pnl', 'winRate', 'volume'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                      chartType === type
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    {type === 'pnl' ? 'P&L' : type === 'winRate' ? 'Win Rate' : 'Volume'}
                  </button>
                ))}
              </div>
            </div>

            {/* P&L Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
                  Performance Chart
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Download className="h-4 w-4" />}
                >
                  Export
                </Button>
              </div>

              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredPnlData}>
                    <defs>
                      <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#9ca3af"
                      fontSize={12}
                      tickFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      formatter={(value: any) => [`◎${value.toFixed(4)}`, 'P&L']}
                    />
                    <Area
                      type="monotone"
                      dataKey={chartType}
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#pnlGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Game Types Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid md:grid-cols-2 gap-6"
            >
              {/* Win/Loss Pie Chart */}
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Win/Loss Ratio
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={[
                          { name: 'Wins', value: profile?.wins || 0 },
                          { name: 'Losses', value: profile?.losses || 0 }
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {[
                          { name: 'Wins', value: profile?.wins || 0 },
                          { name: 'Losses', value: profile?.losses || 0 }
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Performance Metrics
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Avg Game Duration</span>
                    <span className="text-white font-medium">
                      {performanceMetrics?.avgGameDuration || '0'}m
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Actions per Game</span>
                    <span className="text-white font-medium">
                      {performanceMetrics?.avgActionsPerGame || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Response Time</span>
                    <span className="text-green-400 font-medium">
                      {performanceMetrics?.avgResponseTime || 0}ms
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Longest Streak</span>
                    <span className="text-purple-400 font-medium">
                      {profile?.longestWinStreak || 0} wins
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-8">
            
            {/* Recent Games */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Games
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {gameHistory?.slice(0, 10).map((game, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        game.result === 'win' ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-white">
                          vs {game.opponent}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(game.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${
                        game.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {game.pnl >= 0 ? '+' : ''}◎{game.pnl.toFixed(4)}
                      </p>
                      <p className="text-xs text-gray-400">◎{game.betAmount}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Achievements */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gray-800/50 rounded-2xl border border-gray-700 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Award className="h-5 w-5" />
                Achievements
              </h3>
              <div className="space-y-3">
                {achievements?.map((achievement, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
                    <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                      <Trophy className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {achievement.title}
                      </p>
                      <p className="text-xs text-gray-400">
                        {achievement.description}
                      </p>
                    </div>
                  </div>
                ))}
                
                {!achievements?.length && (
                  <div className="text-center py-6 text-gray-400">
                    <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No achievements yet</p>
                    <p className="text-xs">Keep playing to earn your first badge!</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}