'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Swords, Users, TrendingUp, Coins, Clock, Star } from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import { useWalletContext } from '../../contexts/WalletContext';
import { useGameSounds } from '../../hooks/useSound';
import Button from '../ui/Button';
import { InlineLoader } from '../ui/LoadingSpinner';
import { GameMatch } from '../../types/game';

const GameLobby: React.FC = () => {
  const { 
    availableMatches, 
    gameStats, 
    refreshMatches, 
    refreshGameStats,
    joinMatch,
    createMatch,
    isLoading 
  } = useGame();
  const { wallet, balance } = useWalletContext();
  const { playSound } = useGameSounds();
  const [selectedBetAmount, setSelectedBetAmount] = useState(0.1);
  const [showCreateMatch, setShowCreateMatch] = useState(false);

  useEffect(() => {
    if (wallet.connected) {
      refreshMatches();
      refreshGameStats();
      
      // Refresh data every 30 seconds
      const interval = setInterval(() => {
        refreshMatches();
        refreshGameStats();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [wallet.connected]);

  const handleJoinMatch = async (matchId: string) => {
    playSound('click');
    try {
      await joinMatch(matchId);
      playSound('matchFound');
    } catch (error) {
      console.error('Failed to join match:', error);
    }
  };

  const handleCreateMatch = async () => {
    if (balance < selectedBetAmount) {
      playSound('error');
      return;
    }

    playSound('click');
    try {
      await createMatch(selectedBetAmount);
      setShowCreateMatch(false);
      playSound('matchFound');
    } catch (error) {
      console.error('Failed to create match:', error);
    }
  };

  const betAmounts = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0];

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (!wallet.connected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Swords className="h-16 w-16 text-game-accent mx-auto" />
          <h2 className="text-2xl font-bold text-game-text font-gaming">
            Connect Wallet to Play
          </h2>
          <p className="text-game-muted">
            Connect your Solana wallet to join the battle arena
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Game Stats */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="bg-game-surface border border-game-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Swords className="h-8 w-8 text-primary-500" />
            <div>
              <p className="text-2xl font-bold text-game-text font-gaming">
                {gameStats.activeMatches}
              </p>
              <p className="text-sm text-game-muted">Active Matches</p>
            </div>
          </div>
        </div>

        <div className="bg-game-surface border border-game-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-game-text font-gaming">
                {gameStats.totalPlayersOnline}
              </p>
              <p className="text-sm text-game-muted">Players Online</p>
            </div>
          </div>
        </div>

        <div className="bg-game-surface border border-game-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold text-game-text font-gaming">
                {gameStats.totalMatches.toLocaleString()}
              </p>
              <p className="text-sm text-game-muted">Total Matches</p>
            </div>
          </div>
        </div>

        <div className="bg-game-surface border border-game-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Coins className="h-8 w-8 text-primary-500" />
            <div>
              <p className="text-2xl font-bold text-game-text font-gaming">
                ◎{gameStats.totalVolume.toFixed(1)}
              </p>
              <p className="text-sm text-game-muted">Total Volume</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <Button
          onClick={() => setShowCreateMatch(!showCreateMatch)}
          variant="primary"
          size="lg"
          leftIcon={<Swords className="h-5 w-5" />}
          glowing
          className="flex-1"
        >
          Create Match
        </Button>
        
        <Button
          onClick={() => refreshMatches()}
          variant="outline"
          size="lg"
          loading={isLoading}
          className="flex-1"
        >
          Refresh Lobby
        </Button>
      </motion.div>

      {/* Create Match Form */}
      {showCreateMatch && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-game-surface border border-game-border rounded-lg p-6"
        >
          <h3 className="text-lg font-bold text-game-text font-gaming mb-4">
            Create New Match
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-game-text mb-2">
                Bet Amount (SOL)
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {betAmounts.map((amount) => (
                  <Button
                    key={amount}
                    variant={selectedBetAmount === amount ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedBetAmount(amount)}
                    disabled={balance < amount}
                  >
                    ◎{amount}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-game-muted mt-2">
                Your balance: ◎{balance.toFixed(6)}
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCreateMatch}
                variant="primary"
                loading={isLoading}
                disabled={balance < selectedBetAmount}
                fullWidth
              >
                Create Match (◎{selectedBetAmount})
              </Button>
              <Button
                onClick={() => setShowCreateMatch(false)}
                variant="ghost"
                fullWidth
              >
                Cancel
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Available Matches */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-game-text font-gaming">
            Available Matches
          </h2>
          <span className="text-game-muted text-sm">
            {availableMatches.length} matches found
          </span>
        </div>

        {isLoading ? (
          <InlineLoader message="Loading matches..." />
        ) : availableMatches.length === 0 ? (
          <div className="text-center py-8 bg-game-surface border border-game-border rounded-lg">
            <Swords className="h-12 w-12 text-game-muted mx-auto mb-3" />
            <p className="text-game-text font-semibold">No matches available</p>
            <p className="text-game-muted text-sm">
              Create a new match to start playing!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {availableMatches.map((match, index) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-game-surface border border-game-border rounded-lg p-4 hover:border-primary-500/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="text-game-text font-semibold">
                        {match.player1.username}
                      </span>
                      <span className="text-game-muted text-sm">
                        (Level {match.player1.level})
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-game-muted text-sm">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(match.createdAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-game-text font-bold">
                        ◎{match.betAmount}
                      </p>
                      <p className="text-game-muted text-xs">Bet Amount</p>
                    </div>

                    <Button
                      onClick={() => handleJoinMatch(match.id)}
                      variant="primary"
                      size="sm"
                      disabled={balance < match.betAmount}
                      leftIcon={<Swords className="h-4 w-4" />}
                    >
                      Join Battle
                    </Button>
                  </div>
                </div>

                {/* Player Stats */}
                <div className="mt-3 pt-3 border-t border-game-border">
                  <div className="flex items-center gap-6 text-sm text-game-muted">
                    <span>Wins: {match.player1.wins}</span>
                    <span>Losses: {match.player1.losses}</span>
                    <span>Rating: {match.player1.rating}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default GameLobby;