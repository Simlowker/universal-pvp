'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface LiveMatch {
  id: string;
  player1: {
    id: string;
    name: string;
    avatar?: string;
    score: number;
  };
  player2: {
    id: string;
    name: string;
    avatar?: string;
    score: number;
  };
  status: 'live' | 'paused' | 'completed';
  timeElapsed: number; // seconds
  round?: number;
  totalRounds?: number;
  odds: {
    player1: number;
    player2: number;
    draw?: number;
  };
  volume: number;
  lastAction?: {
    type: 'attack' | 'defend' | 'special' | 'heal';
    player: string;
    damage?: number;
    timestamp: number;
  };
  cashOutMultiplier?: number;
}

interface QuickBet {
  id: string;
  matchId: string;
  selection: 'player1' | 'player2' | 'draw';
  stake: number;
  odds: number;
  timestamp: number;
  canCashOut?: boolean;
  cashOutValue?: number;
}

interface LiveBettingProps {
  match: LiveMatch;
  quickBets: QuickBet[];
  balance: number;
  onPlaceBet: (matchId: string, selection: string, stake: number) => void;
  onCashOut: (betId: string) => void;
  className?: string;
}

const QUICK_STAKE_AMOUNTS = [5, 10, 25, 50];

export const LiveBetting: React.FC<LiveBettingProps> = ({
  match,
  quickBets,
  balance,
  onPlaceBet,
  onCashOut,
  className = ''
}) => {
  const [selectedStake, setSelectedStake] = useState(10);
  const [customStake, setCustomStake] = useState('');
  const [oddsHistory, setOddsHistory] = useState<{ timestamp: number; player1: number; player2: number }[]>([]);
  const [pendingBets, setPendingBets] = useState<Set<string>>(new Set());
  const [showStats, setShowStats] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const lastUpdateRef = useRef<number>(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);

  // Track odds changes for visualization
  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current >= 1000) { // Update every second
      setOddsHistory(prev => {
        const newHistory = [...prev, {
          timestamp: now,
          player1: match.odds.player1,
          player2: match.odds.player2
        }].slice(-30); // Keep last 30 seconds
        
        return newHistory;
      });
      lastUpdateRef.current = now;
    }
  }, [match.odds]);

  // Play sound for odds changes
  useEffect(() => {
    if (oddsHistory.length >= 2 && audioEnabled) {
      const latest = oddsHistory[oddsHistory.length - 1];
      const previous = oddsHistory[oddsHistory.length - 2];
      
      if (Math.abs(latest.player1 - previous.player1) > 0.05) {
        playTone(440, 100); // A4 note for significant odds change
      }
    }
  }, [oddsHistory, audioEnabled]);

  const playTone = (frequency: number, duration: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration / 1000);
    
    oscillator.start();
    oscillator.stop(audioContextRef.current.currentTime + duration / 1000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatCurrency = (amount: number) => `${amount.toFixed(3)} SOL`;

  const getOddsChange = (current: number, previous?: number) => {
    if (!previous) return null;
    const change = current - previous;
    const percentChange = (change / previous) * 100;
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
      value: Math.abs(change),
      percent: Math.abs(percentChange),
      color: change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-game-muted'
    };
  };

  const getCurrentStake = () => {
    return customStake ? parseFloat(customStake) || 0 : selectedStake;
  };

  const handleQuickBet = async (selection: 'player1' | 'player2' | 'draw') => {
    const stake = getCurrentStake();
    if (stake <= 0 || stake > balance) return;

    const betId = `${match.id}-${selection}-${Date.now()}`;
    setPendingBets(prev => {
      const newSet = new Set(prev);
      newSet.add(betId);
      return newSet;
    });

    try {
      await onPlaceBet(match.id, selection, stake);
      if (audioEnabled) playTone(523, 150); // C5 note for successful bet
    } catch (error) {
      console.error('Bet failed:', error);
      if (audioEnabled) playTone(220, 300); // A3 note for error
    } finally {
      setPendingBets(prev => {
        const newSet = new Set(prev);
        newSet.delete(betId);
        return newSet;
      });
    }
  };

  const handleCashOut = async (betId: string) => {
    setPendingBets(prev => {
      const newSet = new Set(prev);
      newSet.add(`cashout-${betId}`);
      return newSet;
    });
    
    try {
      await onCashOut(betId);
      if (audioEnabled) playTone(659, 200); // E5 note for cash out
    } catch (error) {
      console.error('Cash out failed:', error);
    } finally {
      setPendingBets(prev => {
        const newSet = new Set(prev);
        newSet.delete(`cashout-${betId}`);
        return newSet;
      });
    }
  };

  const getPreviousOdds = () => {
    return oddsHistory.length >= 2 ? oddsHistory[oddsHistory.length - 2] : undefined;
  };

  const previousOdds = getPreviousOdds();
  const player1Change = getOddsChange(match.odds.player1, previousOdds?.player1);
  const player2Change = getOddsChange(match.odds.player2, previousOdds?.player2);

  return (
    <div className={clsx('bg-game-surface border border-game-border rounded-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-red-500 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
              <span className="font-bold">LIVE</span>
            </div>
            <span className="text-red-100">•</span>
            <span className="font-medium">
              {formatTime(match.timeElapsed)}
              {match.round && match.totalRounds && ` • Round ${match.round}/${match.totalRounds}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="p-1 hover:bg-red-600 rounded transition-colors"
              title={audioEnabled ? 'Disable sound' : 'Enable sound'}
            >
              {audioEnabled ? '🔊' : '🔇'}
            </button>
            <button
              onClick={() => setShowStats(!showStats)}
              className="p-1 hover:bg-red-600 rounded transition-colors"
              title="Toggle statistics"
            >
              📊
            </button>
          </div>
        </div>
      </div>

      {/* Match Info */}
      <div className="p-4 bg-gradient-to-r from-game-bg to-game-surface">
        <div className="flex items-center justify-between">
          {/* Player 1 */}
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
              {match.player1.avatar || match.player1.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-game-text">{match.player1.name}</div>
              <div className="text-2xl font-bold text-blue-500">{match.player1.score}</div>
            </div>
          </div>

          {/* VS */}
          <div className="text-center px-4">
            <div className="text-game-muted text-sm">VS</div>
            {match.lastAction && (
              <motion.div
                key={match.lastAction.timestamp}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-2xl mt-1"
              >
                {match.lastAction.type === 'attack' && '⚔️'}
                {match.lastAction.type === 'defend' && '🛡️'}
                {match.lastAction.type === 'special' && '⚡'}
                {match.lastAction.type === 'heal' && '💚'}
              </motion.div>
            )}
          </div>

          {/* Player 2 */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="text-right">
              <div className="font-semibold text-game-text">{match.player2.name}</div>
              <div className="text-2xl font-bold text-red-500">{match.player2.score}</div>
            </div>
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">
              {match.player2.avatar || match.player2.name.charAt(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Live Statistics */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-game-border bg-game-bg p-4"
          >
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <div className="text-game-muted">Volume</div>
                <div className="font-bold text-game-text">{formatCurrency(match.volume)}</div>
              </div>
              <div>
                <div className="text-game-muted">Total Bets</div>
                <div className="font-bold text-game-text">{quickBets.length}</div>
              </div>
              <div>
                <div className="text-game-muted">Avg Stake</div>
                <div className="font-bold text-game-text">
                  {quickBets.length > 0 ? formatCurrency(match.volume / quickBets.length) : '--'}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Odds */}
      <div className="p-4 border-t border-game-border">
        <div className="grid grid-cols-2 gap-4">
          {/* Player 1 Odds */}
          <motion.button
            onClick={() => handleQuickBet('player1')}
            disabled={pendingBets.has(`${match.id}-player1-${Date.now()}`) || getCurrentStake() > balance}
            className={clsx(
              'relative p-4 rounded-lg border-2 transition-all duration-200',
              'hover:scale-105 active:scale-95',
              'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
              'hover:border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="text-center">
              <div className="font-semibold text-game-text mb-1">{match.player1.name}</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-bold text-blue-600">{match.odds.player1.toFixed(2)}</span>
                {player1Change && player1Change.direction !== 'stable' && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={clsx('text-sm', player1Change.color)}
                  >
                    {player1Change.direction === 'up' ? '↗' : '↘'}
                    {player1Change.percent.toFixed(1)}%
                  </motion.span>
                )}
              </div>
              <div className="text-xs text-game-muted mt-1">
                Returns: {formatCurrency(getCurrentStake() * match.odds.player1)}
              </div>
            </div>

            {/* Loading overlay */}
            {pendingBets.has(`${match.id}-player1-${Date.now()}`) && (
              <div className="absolute inset-0 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </motion.button>

          {/* Player 2 Odds */}
          <motion.button
            onClick={() => handleQuickBet('player2')}
            disabled={pendingBets.has(`${match.id}-player2-${Date.now()}`) || getCurrentStake() > balance}
            className={clsx(
              'relative p-4 rounded-lg border-2 transition-all duration-200',
              'hover:scale-105 active:scale-95',
              'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
              'hover:border-red-400 hover:bg-red-100 dark:hover:bg-red-900',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="text-center">
              <div className="font-semibold text-game-text mb-1">{match.player2.name}</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-bold text-red-600">{match.odds.player2.toFixed(2)}</span>
                {player2Change && player2Change.direction !== 'stable' && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={clsx('text-sm', player2Change.color)}
                  >
                    {player2Change.direction === 'up' ? '↗' : '↘'}
                    {player2Change.percent.toFixed(1)}%
                  </motion.span>
                )}
              </div>
              <div className="text-xs text-game-muted mt-1">
                Returns: {formatCurrency(getCurrentStake() * match.odds.player2)}
              </div>
            </div>

            {/* Loading overlay */}
            {pendingBets.has(`${match.id}-player2-${Date.now()}`) && (
              <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </motion.button>
        </div>
      </div>

      {/* Stake Selection */}
      <div className="p-4 border-t border-game-border bg-game-bg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-game-text">Stake Amount</span>
          <span className="text-sm text-game-muted">Balance: {formatCurrency(balance)}</span>
        </div>

        <div className="flex gap-2 mb-3">
          {QUICK_STAKE_AMOUNTS.map((amount) => (
            <button
              key={amount}
              onClick={() => {
                setSelectedStake(amount);
                setCustomStake('');
              }}
              className={clsx(
                'px-3 py-2 rounded text-sm font-medium transition-colors',
                selectedStake === amount && !customStake
                  ? 'bg-primary-500 text-white'
                  : 'bg-game-surface text-game-text hover:bg-game-border'
              )}
            >
              {amount}
            </button>
          ))}
          <div className="flex-1">
            <input
              type="number"
              min="0.001"
              step="0.001"
              max={balance}
              value={customStake}
              onChange={(e) => {
                setCustomStake(e.target.value);
                if (e.target.value) setSelectedStake(0);
              }}
              className="w-full px-3 py-2 bg-game-surface border border-game-border rounded text-game-text text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Custom"
            />
          </div>
        </div>

        {getCurrentStake() > balance && (
          <div className="text-red-500 text-xs mb-2">
            ⚠️ Insufficient balance
          </div>
        )}
      </div>

      {/* Active Bets */}
      {quickBets.length > 0 && (
        <div className="border-t border-game-border">
          <div className="p-4">
            <h4 className="font-semibold text-game-text mb-3 flex items-center gap-2">
              <span>🎯</span>
              Your Live Bets ({quickBets.length})
            </h4>
            
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {quickBets.map((bet) => (
                <div
                  key={bet.id}
                  className="bg-game-surface border border-game-border rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-game-text text-sm">
                        {bet.selection === 'player1' ? match.player1.name : match.player2.name} @ {bet.odds.toFixed(2)}
                      </div>
                      <div className="text-xs text-game-muted">
                        Stake: {formatCurrency(bet.stake)} • Potential: {formatCurrency(bet.stake * bet.odds)}
                      </div>
                    </div>

                    {bet.canCashOut && bet.cashOutValue && (
                      <button
                        onClick={() => handleCashOut(bet.id)}
                        disabled={pendingBets.has(`cashout-${bet.id}`)}
                        className={clsx(
                          'px-3 py-1 bg-green-600 text-white text-xs rounded font-medium',
                          'hover:bg-green-700 transition-colors',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {pendingBets.has(`cashout-${bet.id}`) ? (
                          <span className="flex items-center gap-1">
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                            Cash Out
                          </span>
                        ) : (
                          `Cash Out ${formatCurrency(bet.cashOutValue)}`
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Odds Chart Mini View */}
      {oddsHistory.length > 5 && (
        <div className="border-t border-game-border p-4 bg-game-bg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-game-text">Odds Trend (30s)</span>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-blue-500"></div>
                <span className="text-game-muted">{match.player1.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-0.5 bg-red-500"></div>
                <span className="text-game-muted">{match.player2.name}</span>
              </div>
            </div>
          </div>
          
          <div className="relative h-12 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 300 48" preserveAspectRatio="none">
              {/* Player 1 odds line */}
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                points={oddsHistory.map((point, index) => {
                  const x = (index / (oddsHistory.length - 1)) * 300;
                  const minOdds = Math.min(...oddsHistory.map(h => Math.min(h.player1, h.player2)));
                  const maxOdds = Math.max(...oddsHistory.map(h => Math.max(h.player1, h.player2)));
                  const y = 48 - ((point.player1 - minOdds) / (maxOdds - minOdds)) * 40 - 4;
                  return `${x},${y}`;
                }).join(' ')}
              />
              
              {/* Player 2 odds line */}
              <polyline
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                points={oddsHistory.map((point, index) => {
                  const x = (index / (oddsHistory.length - 1)) * 300;
                  const minOdds = Math.min(...oddsHistory.map(h => Math.min(h.player1, h.player2)));
                  const maxOdds = Math.max(...oddsHistory.map(h => Math.max(h.player1, h.player2)));
                  const y = 48 - ((point.player2 - minOdds) / (maxOdds - minOdds)) * 40 - 4;
                  return `${x},${y}`;
                }).join(' ')}
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveBetting;

// Export types for external usage
export type { LiveMatch, QuickBet, LiveBettingProps };