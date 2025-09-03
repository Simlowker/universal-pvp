'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWalletContext } from '../contexts/WalletContext';

interface LeaderboardPlayer {
  id: string;
  username: string;
  rank: number;
  totalWinnings: number;
  winRate: number;
  totalGamesWon: number;
  totalGamesLost: number;
  currentStreak: number;
  longestStreak: number;
  avgBetSize: number;
  level: number;
  isOnline: boolean;
}

interface GlobalStats {
  totalPlayers: number;
  totalGames: number;
  totalPrizePool: number;
  biggestWin: number;
  avgGameDuration: number;
  gamesLast24h: number;
}

interface MyRanking {
  position: number;
  username: string;
  totalWinnings: number;
  winRate: number;
  currentStreak: number;
  change24h: number; // Position change in last 24h
}

export function useLeaderboard(
  type: 'global' | 'monthly' | 'weekly' | 'daily' = 'global',
  sortBy: 'winnings' | 'winRate' | 'gamesPlayed' | 'streak' = 'winnings',
  page: number = 1,
  limit: number = 50
) {
  const { wallet } = useWalletContext();
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [myRanking, setMyRanking] = useState<MyRanking | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        type,
        sortBy,
        page: page.toString(),
        limit: limit.toString()
      });

      const response = await fetch(`/api/leaderboard?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }

      const data = await response.json();
      setLeaderboard(data.leaderboard);
      setGlobalStats(data.globalStats);

      // Get my ranking if wallet is connected
      if (wallet.connected && wallet.publicKey) {
        const myRank = data.leaderboard.find((p: LeaderboardPlayer) => 
          p.id === wallet.publicKey?.toString()
        );
        
        if (myRank) {
          setMyRanking({
            position: myRank.rank,
            username: myRank.username,
            totalWinnings: myRank.totalWinnings,
            winRate: myRank.winRate,
            currentStreak: myRank.currentStreak,
            change24h: data.myRankingChange24h || 0
          });
        } else {
          // Fetch my ranking separately if not in current page
          fetchMyRanking();
        }
      }
      
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Generate mock data for development
      generateMockLeaderboard();
      
    } finally {
      setIsLoading(false);
    }
  }, [type, sortBy, page, limit, wallet.connected, wallet.publicKey]);

  // Fetch my ranking separately
  const fetchMyRanking = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) return;

    try {
      const response = await fetch(`/api/leaderboard/ranking/${wallet.publicKey.toString()}?type=${type}`);
      
      if (response.ok) {
        const data = await response.json();
        setMyRanking(data);
      }
    } catch (err) {
      console.error('Error fetching my ranking:', err);
    }
  }, [wallet.connected, wallet.publicKey, type]);

  // Generate mock data for development
  const generateMockLeaderboard = useCallback(() => {
    // Mock players
    const mockPlayers: LeaderboardPlayer[] = [];
    const usernames = [
      'CryptoKing', 'SolMaster', 'PvPLegend', 'BlockchainBeast', 'DeFiDemon',
      'NFTNinja', 'GameGod', 'CoinConqueror', 'TokenTitan', 'ChainChampion',
      'MetaWarrior', 'DigitalDragon', 'CyberSamurai', 'QuantumQueen', 'NeonKnight'
    ];

    for (let i = 0; i < limit; i++) {
      const rank = (page - 1) * limit + i + 1;
      const wins = Math.floor(Math.random() * 200) + 50;
      const losses = Math.floor(Math.random() * 100) + 20;
      const winRate = wins / (wins + losses);
      
      // Higher ranked players have better stats
      const rankMultiplier = Math.max(0.1, (1000 - rank) / 1000);
      const baseWinnings = Math.random() * 100 * rankMultiplier;
      
      mockPlayers.push({
        id: `player-${rank}`,
        username: `${usernames[i % usernames.length]}${Math.floor(Math.random() * 1000)}`,
        rank,
        totalWinnings: baseWinnings + (rank <= 10 ? Math.random() * 50 : 0),
        winRate,
        totalGamesWon: wins,
        totalGamesLost: losses,
        currentStreak: Math.floor(Math.random() * 15),
        longestStreak: Math.floor(Math.random() * 30) + 10,
        avgBetSize: Math.random() * 2 + 0.05,
        level: Math.floor(Math.random() * 50) + rank <= 100 ? 20 : 1,
        isOnline: Math.random() > 0.3
      });
    }

    // Sort based on sortBy parameter
    mockPlayers.sort((a, b) => {
      switch (sortBy) {
        case 'winnings':
          return b.totalWinnings - a.totalWinnings;
        case 'winRate':
          return b.winRate - a.winRate;
        case 'gamesPlayed':
          return (b.totalGamesWon + b.totalGamesLost) - (a.totalGamesWon + a.totalGamesLost);
        case 'streak':
          return b.currentStreak - a.currentStreak;
        default:
          return a.rank - b.rank;
      }
    });

    // Update ranks based on sort
    mockPlayers.forEach((player, index) => {
      player.rank = (page - 1) * limit + index + 1;
    });

    setLeaderboard(mockPlayers);

    // Mock global stats
    setGlobalStats({
      totalPlayers: 15847,
      totalGames: 342156,
      totalPrizePool: 25643.7,
      biggestWin: 127.8,
      avgGameDuration: 247, // seconds
      gamesLast24h: 1284
    });

    // Mock my ranking if wallet connected
    if (wallet.connected && wallet.publicKey) {
      const myRank = Math.floor(Math.random() * 1000) + 1;
      setMyRanking({
        position: myRank,
        username: 'You',
        totalWinnings: Math.random() * 50 + 5,
        winRate: 0.4 + Math.random() * 0.4, // 40-80%
        currentStreak: Math.floor(Math.random() * 10),
        change24h: Math.floor(Math.random() * 21) - 10 // -10 to +10
      });
    }
  }, [limit, page, sortBy, wallet.connected, wallet.publicKey]);

  // Auto-refresh leaderboard
  useEffect(() => {
    fetchLeaderboard();
    
    // Refresh every 60 seconds for real-time updates
    const interval = setInterval(fetchLeaderboard, 60000);
    
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  // Refresh manually
  const refreshLeaderboard = useCallback(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Get rank change indicator
  const getRankChangeIcon = useCallback((change: number) => {
    if (change > 0) return { icon: '📈', color: 'text-green-400', text: `+${change}` };
    if (change < 0) return { icon: '📉', color: 'text-red-400', text: change.toString() };
    return { icon: '➖', color: 'text-gray-400', text: '0' };
  }, []);

  // Calculate percentile
  const getPercentile = useCallback((rank: number, totalPlayers: number) => {
    const percentile = ((totalPlayers - rank) / totalPlayers) * 100;
    return Math.max(0, Math.min(100, percentile));
  }, []);

  return {
    leaderboard,
    myRanking,
    globalStats,
    isLoading,
    error,
    refreshLeaderboard,
    getRankChangeIcon,
    getPercentile
  };
}