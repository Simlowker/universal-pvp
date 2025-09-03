'use client';

import React, { useState, useEffect } from 'react';
import { useMagicBlock, GamePlayer } from '@/contexts/MagicBlockProvider';

interface MatchResultsProps {
  onPlayAgain?: () => void;
  onReturnToMenu?: () => void;
  className?: string;
}

interface MatchStats {
  duration: number;
  totalActions: number;
  damageDealt: number;
  damageReceived: number;
  healingDone: number;
  specialsUsed: number;
  experienceGained: number;
}

export const MatchResults: React.FC<MatchResultsProps> = ({
  onPlayAgain,
  onReturnToMenu,
  className = ''
}) => {
  const { gameState, playerAddress, isInMatch } = useMagicBlock();
  const [showResults, setShowResults] = useState(false);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'entering' | 'showing' | 'complete'>('entering');

  const isWinner = gameState.winner === playerAddress;
  const currentPlayer = gameState.players.find(p => p.publicKey === playerAddress);
  const opponent = gameState.players.find(p => p.publicKey !== playerAddress);

  // Show results when match completes
  useEffect(() => {
    if (gameState.phase === 'completed' && !showResults) {
      // Calculate match statistics
      const playerActions = gameState.actions.filter(action => action.playerId === playerAddress);
      const opponentActions = gameState.actions.filter(action => action.playerId !== playerAddress);
      
      const stats: MatchStats = {
        duration: Date.now() - (gameState.actions[0]?.timestamp || Date.now()), // Rough duration
        totalActions: playerActions.length,
        damageDealt: playerActions
          .filter(action => action.damage)
          .reduce((total, action) => total + (action.damage || 0), 0),
        damageReceived: opponentActions
          .filter(action => action.damage && action.target === playerAddress)
          .reduce((total, action) => total + (action.damage || 0), 0),
        healingDone: playerActions
          .filter(action => action.type === 'heal')
          .length * 15, // Assume 15 HP per heal
        specialsUsed: playerActions
          .filter(action => action.type === 'special')
          .length,
        experienceGained: isWinner ? 100 : 50 // Winner gets more XP
      };
      
      setMatchStats(stats);
      setShowResults(true);
      
      // Animation sequence
      setTimeout(() => setAnimationPhase('showing'), 500);
      setTimeout(() => setAnimationPhase('complete'), 2000);
    }
  }, [gameState.phase, gameState.actions, gameState.winner, playerAddress, showResults, isWinner]);

  // Auto-hide results after some time
  useEffect(() => {
    if (showResults && animationPhase === 'complete') {
      const timer = setTimeout(() => {
        setShowResults(false);
        if (onReturnToMenu) onReturnToMenu();
      }, 15000); // Auto-return after 15 seconds
      
      return () => clearTimeout(timer);
    }
  }, [showResults, animationPhase, onReturnToMenu]);

  if (!showResults || !matchStats || !currentPlayer || !opponent) {
    return null;
  }

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getResultTitle = () => {
    if (isWinner) {
      return {
        title: '🏆 VICTORY!',
        subtitle: 'You have defeated your opponent!',
        color: 'text-yellow-400',
        bgColor: 'from-yellow-600/20 to-yellow-400/20'
      };
    } else {
      return {
        title: '💀 DEFEAT',
        subtitle: 'You fought bravely, but lost this battle.',
        color: 'text-red-400',
        bgColor: 'from-red-600/20 to-red-400/20'
      };
    }
  };

  const result = getResultTitle();

  return (
    <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 ${className}`}>
      <div className={`relative max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-gradient-to-b ${result.bgColor} to-gray-900 rounded-xl border border-gray-700 transform transition-all duration-700 ${
        animationPhase === 'entering' ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
      }`}>
        
        {/* Header */}
        <div className="text-center py-8 px-6 border-b border-gray-700">
          <div className={`text-6xl mb-4 ${animationPhase === 'showing' ? 'animate-bounce' : ''}`}>
            {isWinner ? '🏆' : '💀'}
          </div>
          <h1 className={`text-4xl font-bold mb-2 ${result.color}`}>
            {result.title}
          </h1>
          <p className="text-gray-300 text-lg">
            {result.subtitle}
          </p>
        </div>

        {/* Match Statistics */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-6 mb-6">
            
            {/* Player Stats */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3 text-center">You</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Final Health:</span>
                  <span className="text-white font-medium">{currentPlayer.health}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Level:</span>
                  <span className="text-white font-medium">{currentPlayer.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Wins:</span>
                  <span className="text-green-400 font-medium">{currentPlayer.wins}</span>
                </div>
              </div>
            </div>

            {/* Opponent Stats */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h3 className="text-white font-semibold mb-3 text-center">Opponent</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Final Health:</span>
                  <span className="text-white font-medium">{opponent.health}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Level:</span>
                  <span className="text-white font-medium">{opponent.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Wins:</span>
                  <span className="text-green-400 font-medium">{opponent.wins}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Battle Statistics */}
          <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-4 text-center">Battle Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{formatDuration(matchStats.duration)}</div>
                <div className="text-gray-400 text-sm">Battle Duration</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{matchStats.totalActions}</div>
                <div className="text-gray-400 text-sm">Actions Taken</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{matchStats.damageDealt}</div>
                <div className="text-gray-400 text-sm">Damage Dealt</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{matchStats.damageReceived}</div>
                <div className="text-gray-400 text-sm">Damage Received</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{matchStats.healingDone}</div>
                <div className="text-gray-400 text-sm">Healing Done</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">{matchStats.specialsUsed}</div>
                <div className="text-gray-400 text-sm">Specials Used</div>
              </div>
            </div>
          </div>

          {/* Rewards */}
          <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-4 mb-6 border border-purple-500/30">
            <h3 className="text-white font-semibold mb-3 text-center">🎁 Rewards</h3>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-400 mb-1">
                +{matchStats.experienceGained} XP
              </div>
              <p className="text-gray-300 text-sm">
                {isWinner ? 'Victory bonus included!' : 'Participation reward'}
              </p>
              {isWinner && (
                <div className="mt-2 text-yellow-400 text-sm">
                  ⭐ You earned a victory bonus!
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                setShowResults(false);
                if (onPlayAgain) onPlayAgain();
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              🔄 Play Again
            </button>
            <button
              onClick={() => {
                setShowResults(false);
                if (onReturnToMenu) onReturnToMenu();
              }}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              🏠 Main Menu
            </button>
          </div>
        </div>

        {/* Auto-close timer */}
        {animationPhase === 'complete' && (
          <div className="absolute bottom-2 right-2 text-gray-400 text-xs">
            Auto-returning to menu in 15s...
          </div>
        )}

        {/* Close button */}
        <button
          onClick={() => {
            setShowResults(false);
            if (onReturnToMenu) onReturnToMenu();
          }}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors duration-200 text-2xl"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default MatchResults;