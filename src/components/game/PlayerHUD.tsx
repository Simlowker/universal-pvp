'use client';

import React, { useState, useEffect } from 'react';
import { useMagicBlock } from '@/contexts/MagicBlockProvider';

interface PlayerHUDProps {
  className?: string;
}

interface StatChange {
  id: string;
  type: 'health' | 'mana' | 'experience';
  change: number;
  timestamp: number;
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({ className = '' }) => {
  const { gameState, playerAddress, isConnected, error } = useMagicBlock();
  const [statChanges, setStatChanges] = useState<StatChange[]>([]);
  const [previousStats, setPreviousStats] = useState<{ health: number; mana: number; experience: number } | null>(null);

  // Find current player data
  const currentPlayer = gameState.players.find(p => p.publicKey === playerAddress);

  // Track stat changes for animations
  useEffect(() => {
    if (!currentPlayer || !previousStats) {
      if (currentPlayer) {
        setPreviousStats({
          health: currentPlayer.health,
          mana: currentPlayer.mana,
          experience: currentPlayer.experience
        });
      }
      return;
    }

    const changes: StatChange[] = [];
    const now = Date.now();

    // Check for health change
    if (currentPlayer.health !== previousStats.health) {
      changes.push({
        id: `health-${now}`,
        type: 'health',
        change: currentPlayer.health - previousStats.health,
        timestamp: now
      });
    }

    // Check for mana change
    if (currentPlayer.mana !== previousStats.mana) {
      changes.push({
        id: `mana-${now}`,
        type: 'mana',
        change: currentPlayer.mana - previousStats.mana,
        timestamp: now
      });
    }

    // Check for experience change
    if (currentPlayer.experience !== previousStats.experience) {
      changes.push({
        id: `exp-${now}`,
        type: 'experience',
        change: currentPlayer.experience - previousStats.experience,
        timestamp: now
      });
    }

    if (changes.length > 0) {
      setStatChanges(prev => [...prev, ...changes]);
    }

    setPreviousStats({
      health: currentPlayer.health,
      mana: currentPlayer.mana,
      experience: currentPlayer.experience
    });
  }, [currentPlayer, previousStats]);

  // Remove old stat changes
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setStatChanges(prev => prev.filter(change => now - change.timestamp < 2000));
    }, 100);

    return () => clearInterval(timer);
  }, []);

  if (!isConnected) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-sm">Connecting to MagicBlock...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-900/50 border border-red-600 rounded-lg p-4 ${className}`}>
        <div className="text-center text-red-400">
          <div className="text-2xl mb-2">⚠️</div>
          <p className="text-sm">Connection Error</p>
          <p className="text-xs mt-1 opacity-75">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentPlayer) {
    return (
      <div className={`bg-gray-900 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-400">
          <div className="text-2xl mb-2">🎮</div>
          <p className="text-sm">Player data loading...</p>
        </div>
      </div>
    );
  }

  const maxHealth = 100;
  const maxMana = 50;
  const healthPercentage = Math.max(0, Math.min(100, (currentPlayer.health / maxHealth) * 100));
  const manaPercentage = Math.max(0, Math.min(100, (currentPlayer.mana / maxMana) * 100));

  const getHealthColor = (percentage: number) => {
    if (percentage > 60) return 'from-green-600 to-green-400';
    if (percentage > 30) return 'from-yellow-600 to-yellow-400';
    return 'from-red-600 to-red-400';
  };

  const getWinRate = () => {
    const total = currentPlayer.wins + currentPlayer.losses;
    if (total === 0) return 0;
    return Math.round((currentPlayer.wins / total) * 100);
  };

  return (
    <div className={`relative bg-gradient-to-b from-gray-900 to-gray-800 rounded-lg p-4 border border-gray-700 ${className}`}>
      {/* Player Info Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-xl">
            🎮
          </div>
          <div>
            <h3 className="text-white font-semibold">
              {playerAddress?.slice(0, 8)}...{playerAddress?.slice(-4)}
            </h3>
            <p className="text-gray-400 text-sm">Level {currentPlayer.level}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-green-400 text-sm font-medium">
            {currentPlayer.wins}W / {currentPlayer.losses}L
          </div>
          <div className="text-gray-400 text-xs">
            {getWinRate()}% Win Rate
          </div>
        </div>
      </div>

      {/* Health Bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-red-400 text-sm font-medium">Health</span>
          <span className="text-white text-sm">
            {currentPlayer.health} / {maxHealth}
          </span>
        </div>
        <div className="relative w-full h-3 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${getHealthColor(healthPercentage)} transition-all duration-500 ease-out`}
            style={{ width: `${healthPercentage}%` }}
          >
            <div className="h-full w-full bg-white/20 animate-pulse"></div>
          </div>
          {/* Health change indicator */}
          {healthPercentage < 25 && (
            <div className="absolute inset-0 bg-red-500/20 animate-pulse rounded-full"></div>
          )}
        </div>
      </div>

      {/* Mana Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-blue-400 text-sm font-medium">Mana</span>
          <span className="text-white text-sm">
            {currentPlayer.mana} / {maxMana}
          </span>
        </div>
        <div className="relative w-full h-3 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out"
            style={{ width: `${manaPercentage}%` }}
          >
            <div className="h-full w-full bg-white/20 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Experience Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-purple-400 text-sm font-medium">Experience</span>
          <span className="text-white text-sm">
            {currentPlayer.experience} XP
          </span>
        </div>
        <div className="relative w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-700 ease-out"
            style={{ width: `${(currentPlayer.experience % 1000) / 10}%` }}
          >
            <div className="h-full w-full bg-white/30 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl mb-1">⚔️</div>
          <div className="text-white font-semibold">{currentPlayer.wins}</div>
          <div className="text-gray-400 text-xs">Victories</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-2xl mb-1">📊</div>
          <div className="text-white font-semibold">{currentPlayer.level}</div>
          <div className="text-gray-400 text-xs">Level</div>
        </div>
      </div>

      {/* Stat Change Animations */}
      <div className="absolute inset-0 pointer-events-none">
        {statChanges.map(change => {
          const elapsed = Date.now() - change.timestamp;
          const progress = Math.min(1, elapsed / 2000);
          const opacity = Math.max(0, 1 - progress);
          const yOffset = -progress * 50;

          return (
            <div
              key={change.id}
              className={`absolute right-4 top-1/2 font-bold text-lg ${
                change.change > 0 ? 'text-green-400' : 'text-red-400'
              }`}
              style={{
                opacity,
                transform: `translateY(${yOffset}px)`,
                textShadow: change.change > 0 ? '0 0 10px #10b981' : '0 0 10px #ef4444'
              }}
            >
              {change.change > 0 ? '+' : ''}{change.change}
              {change.type === 'health' && ' HP'}
              {change.type === 'mana' && ' MP'}
              {change.type === 'experience' && ' XP'}
            </div>
          );
        })}
      </div>

      {/* Connection Status Indicator */}
      <div className="absolute top-2 right-2">
        <div className="flex items-center space-x-1">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-green-400 text-xs">Connected</span>
        </div>
      </div>
    </div>
  );
};

export default PlayerHUD;