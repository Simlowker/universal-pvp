'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '../contexts/WalletContext';

interface ProfileData {
  id: string;
  username: string;
  level: number;
  experience: number;
  wins: number;
  losses: number;
  totalGames: number;
  totalVolume: number;
  winRate: number;
  currentStreak: number;
  longestWinStreak: number;
  ranking: number;
  totalEarnings: number;
  avgBetSize: number;
  createdAt: Date;
}

interface GameHistoryItem {
  id: string;
  opponent: string;
  result: 'win' | 'loss';
  pnl: number;
  betAmount: number;
  duration: number;
  date: Date;
}

interface PnLDataPoint {
  date: string;
  pnl: number;
  winRate: number;
  volume: number;
  cumulativePnL: number;
}

interface PerformanceMetrics {
  avgGameDuration: number;
  avgActionsPerGame: number;
  avgResponseTime: number;
  gamesPerDay: number;
  bestPerformanceHour: number;
  worstPerformanceHour: number;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt: Date;
}

export function useProfile() {
  const { wallet } = useWalletContext();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [gameHistory, setGameHistory] = useState<GameHistoryItem[]>([]);
  const [pnlData, setPnlData] = useState<PnLDataPoint[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data
  const fetchProfile = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/${wallet.publicKey.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      setProfile(data.profile);
      setGameHistory(data.gameHistory);
      setPnlData(data.pnlData);
      setPerformanceMetrics(data.performanceMetrics);
      setAchievements(data.achievements);
      
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Generate mock data for development
      generateMockData();
      
    } finally {
      setIsLoading(false);
    }
  }, [wallet.connected, wallet.publicKey]);

  // Generate mock data for development/demo
  const generateMockData = useCallback(() => {
    if (!wallet.publicKey) return;

    // Mock profile
    const mockProfile: ProfileData = {
      id: wallet.publicKey.toString(),
      username: 'Player' + Math.floor(Math.random() * 1000),
      level: Math.floor(Math.random() * 50) + 1,
      experience: Math.floor(Math.random() * 10000),
      wins: Math.floor(Math.random() * 100) + 20,
      losses: Math.floor(Math.random() * 80) + 10,
      totalGames: 0,
      totalVolume: Math.random() * 50 + 5,
      winRate: 0,
      currentStreak: Math.floor(Math.random() * 10),
      longestWinStreak: Math.floor(Math.random() * 20) + 5,
      ranking: Math.floor(Math.random() * 1000) + 1,
      totalEarnings: (Math.random() - 0.5) * 20,
      avgBetSize: Math.random() * 2 + 0.1,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
    };

    mockProfile.totalGames = mockProfile.wins + mockProfile.losses;
    mockProfile.winRate = mockProfile.totalGames > 0 ? mockProfile.wins / mockProfile.totalGames : 0;

    setProfile(mockProfile);

    // Mock game history
    const mockHistory: GameHistoryItem[] = [];
    for (let i = 0; i < 50; i++) {
      const isWin = Math.random() > 0.4;
      const betAmount = Math.random() * 2 + 0.01;
      const pnl = isWin ? betAmount * (0.8 + Math.random() * 0.4) : -betAmount;
      
      mockHistory.push({
        id: `game-${i}`,
        opponent: `Player${Math.floor(Math.random() * 10000)}`,
        result: isWin ? 'win' : 'loss',
        pnl,
        betAmount,
        duration: Math.floor(Math.random() * 600) + 60, // 1-10 minutes
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000) // Last 50 days
      });
    }
    setGameHistory(mockHistory);

    // Mock P&L data
    const mockPnLData: PnLDataPoint[] = [];
    let cumulativePnL = 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      const dayGames = mockHistory.filter(game => 
        Math.abs(game.date.getTime() - date.getTime()) < 24 * 60 * 60 * 1000
      );
      
      const dayPnL = dayGames.reduce((sum, game) => sum + game.pnl, 0);
      const dayWins = dayGames.filter(game => game.result === 'win').length;
      const dayWinRate = dayGames.length > 0 ? dayWins / dayGames.length : 0;
      const dayVolume = dayGames.reduce((sum, game) => sum + game.betAmount, 0);
      
      cumulativePnL += dayPnL;
      
      mockPnLData.push({
        date: date.toISOString(),
        pnl: dayPnL,
        winRate: dayWinRate,
        volume: dayVolume,
        cumulativePnL
      });
    }
    setPnlData(mockPnLData);

    // Mock performance metrics
    const mockMetrics: PerformanceMetrics = {
      avgGameDuration: Math.floor(Math.random() * 300) + 120, // 2-7 minutes
      avgActionsPerGame: Math.floor(Math.random() * 20) + 5,
      avgResponseTime: Math.floor(Math.random() * 2000) + 500, // 500-2500ms
      gamesPerDay: mockProfile.totalGames / 30,
      bestPerformanceHour: Math.floor(Math.random() * 24),
      worstPerformanceHour: Math.floor(Math.random() * 24)
    };
    setPerformanceMetrics(mockMetrics);

    // Mock achievements
    const achievementPool = [
      { title: 'First Victory', description: 'Win your first game', icon: '🏆', rarity: 'common' as const },
      { title: 'Win Streak', description: 'Win 5 games in a row', icon: '🔥', rarity: 'rare' as const },
      { title: 'High Roller', description: 'Win a game with ◎1+ bet', icon: '💎', rarity: 'epic' as const },
      { title: 'Legendary Player', description: 'Reach top 100 ranking', icon: '👑', rarity: 'legendary' as const },
      { title: 'Quick Draw', description: 'Win a game in under 2 minutes', icon: '⚡', rarity: 'rare' as const },
      { title: 'Marathon Player', description: 'Play for 24 hours total', icon: '⏰', rarity: 'epic' as const }
    ];

    const mockAchievements = achievementPool
      .filter(() => Math.random() > 0.6) // Random selection
      .map((achievement, index) => ({
        ...achievement,
        id: `achievement-${index}`,
        unlockedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      }));

    setAchievements(mockAchievements);
  }, [wallet.publicKey]);

  // Auto-refresh profile data
  useEffect(() => {
    fetchProfile();
    
    // Refresh every 30 seconds when connected
    const interval = setInterval(() => {
      if (wallet.connected) {
        fetchProfile();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchProfile, wallet.connected]);

  // Update profile after game completion
  const updateProfileAfterGame = useCallback((gameResult: Partial<GameHistoryItem>) => {
    if (!profile) return;

    // Optimistically update profile
    const updatedProfile = { ...profile };
    
    if (gameResult.result === 'win') {
      updatedProfile.wins += 1;
      updatedProfile.currentStreak += 1;
      if (updatedProfile.currentStreak > updatedProfile.longestWinStreak) {
        updatedProfile.longestWinStreak = updatedProfile.currentStreak;
      }
    } else {
      updatedProfile.losses += 1;
      updatedProfile.currentStreak = 0;
    }

    if (gameResult.pnl) {
      updatedProfile.totalEarnings += gameResult.pnl;
    }

    if (gameResult.betAmount) {
      updatedProfile.totalVolume += gameResult.betAmount;
    }

    updatedProfile.totalGames = updatedProfile.wins + updatedProfile.losses;
    updatedProfile.winRate = updatedProfile.totalGames > 0 
      ? updatedProfile.wins / updatedProfile.totalGames 
      : 0;
    updatedProfile.avgBetSize = updatedProfile.totalVolume / updatedProfile.totalGames;

    setProfile(updatedProfile);

    // Add to game history
    if (gameResult.id) {
      setGameHistory(prev => [gameResult as GameHistoryItem, ...prev].slice(0, 100));
    }

    // Fetch fresh data from server
    setTimeout(fetchProfile, 1000);
  }, [profile, fetchProfile]);

  const refreshProfile = useCallback(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    gameHistory,
    pnlData,
    performanceMetrics,
    achievements,
    isLoading,
    error,
    refreshProfile,
    updateProfileAfterGame
  };
}