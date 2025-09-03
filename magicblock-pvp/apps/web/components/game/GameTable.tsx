'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sword, Heart, Zap, Clock } from 'lucide-react';
import { GameMatch } from '../../types/game';

interface GameTableProps {
  gameState: GameMatch;
  myPlayerId: string;
  isActionPending?: boolean;
  selectedAction?: string | null;
}

export function GameTable({ 
  gameState, 
  myPlayerId, 
  isActionPending = false,
  selectedAction = null
}: GameTableProps) {
  const myPlayer = gameState.players.find(p => p.id === myPlayerId);
  const opponent = gameState.players.find(p => p.id !== myPlayerId);
  const isMyTurn = gameState.currentPlayer === myPlayerId;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'check':
        return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'raise':
        return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'fold':
        return 'text-red-400 bg-red-500/20 border-red-500/30';
      default:
        return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    }
  };

  const PlayerCard = ({ 
    player, 
    position, 
    isCurrentPlayer 
  }: { 
    player: any; 
    position: 'top' | 'bottom';
    isCurrentPlayer: boolean;
  }) => (
    <motion.div
      animate={{ 
        scale: isCurrentPlayer ? 1.05 : 1,
        y: isCurrentPlayer ? (position === 'top' ? -5 : 5) : 0
      }}
      className={`
        relative p-4 rounded-2xl border-2 transition-all duration-300
        ${isCurrentPlayer 
          ? 'border-green-400 bg-green-500/10 shadow-green-500/20' 
          : 'border-gray-600 bg-gray-800/50'
        }
        ${position === 'top' ? 'mb-8' : 'mt-8'}
      `}
    >
      {/* Player Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
            isCurrentPlayer ? 'border-green-400 bg-green-500/20' : 'border-gray-500 bg-gray-700'
          }`}>
            <span className="text-sm font-bold text-white">
              {(player.username || 'A').charAt(0).toUpperCase()}
            </span>
          </div>
          
          <div>
            <p className="font-semibold text-white">
              {player.id === myPlayerId ? 'You' : (player.username || 'Opponent')}
            </p>
            <p className="text-xs text-gray-400 font-mono">
              {player.id.slice(0, 8)}...{player.id.slice(-4)}
            </p>
          </div>
        </div>

        {/* Turn Indicator */}
        <AnimatePresence>
          {isCurrentPlayer && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30"
            >
              <Clock className="h-3 w-3 text-green-400" />
              <span className="text-xs font-medium text-green-300">Your Turn</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Player Stats */}
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Heart className="h-4 w-4 text-red-400" />
            <span className="text-lg font-bold text-white">
              {player.health || 100}
            </span>
          </div>
          <p className="text-xs text-gray-400">Health</p>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Shield className="h-4 w-4 text-blue-400" />
            <span className="text-lg font-bold text-white">
              {player.defense || 10}
            </span>
          </div>
          <p className="text-xs text-gray-400">Defense</p>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Sword className="h-4 w-4 text-orange-400" />
            <span className="text-lg font-bold text-white">
              {player.attack || 15}
            </span>
          </div>
          <p className="text-xs text-gray-400">Attack</p>
        </div>
      </div>

      {/* Last Action */}
      {gameState.lastAction && gameState.lastAction.player === player.id && (
        <div className="flex items-center justify-center">
          <div className={`px-3 py-1 rounded-full border text-xs font-medium ${getActionColor(gameState.lastAction.action)}`}>
            {gameState.lastAction.action.toUpperCase()}
            {gameState.lastAction.amount ? ` ◎${gameState.lastAction.amount}` : ''}
          </div>
        </div>
      )}

      {/* Optimistic Action Preview */}
      {isActionPending && selectedAction && player.id === myPlayerId && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 bg-purple-500/20 rounded-2xl border-2 border-purple-500/50 flex items-center justify-center backdrop-blur-sm"
        >
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm font-medium text-purple-300">
              {selectedAction.toUpperCase()}...
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );

  return (
    <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl border border-gray-700 p-8 min-h-[500px]">
      
      {/* Battle Arena Background */}
      <div className="absolute inset-0 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-purple-500/10 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-gray-600/30 rounded-full" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-gray-600/50 rounded-full" />
      </div>

      <div className="relative z-10">
        {/* Opponent */}
        <PlayerCard 
          player={opponent} 
          position="top"
          isCurrentPlayer={!isMyTurn}
        />

        {/* Game Info Center */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-600 p-6 text-center min-w-48"
          >
            {/* Pot Size */}
            <div className="mb-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-yellow-400" />
                <span className="text-2xl font-bold text-yellow-400 font-gaming">
                  ◎{(gameState.potSize || gameState.betAmount * 2).toFixed(3)}
                </span>
              </div>
              <p className="text-sm text-gray-400">Total Pot</p>
            </div>

            {/* Game Status */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-white">
                Round {gameState.round || 1}
              </p>
              
              {gameState.timeRemaining && (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-orange-400" />
                  <span className="text-orange-400 font-medium">
                    {gameState.timeRemaining}s
                  </span>
                </div>
              )}

              {/* Current Bet */}
              {gameState.currentBet && gameState.currentBet > 0 && (
                <p className="text-xs text-gray-400">
                  Current bet: ◎{gameState.currentBet.toFixed(3)}
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* My Player */}
        <PlayerCard 
          player={myPlayer} 
          position="bottom"
          isCurrentPlayer={isMyTurn}
        />

        {/* Battle Effects */}
        <AnimatePresence>
          {gameState.lastAction && (
            <motion.div
              key={gameState.lastAction.timestamp.getTime()}
              initial={{ opacity: 0, scale: 2, y: -50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 50 }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30"
            >
              <div className="text-center">
                <div className={`text-4xl font-bold mb-2 ${
                  gameState.lastAction.action === 'raise' ? 'text-orange-400' :
                  gameState.lastAction.action === 'check' ? 'text-blue-400' :
                  'text-red-400'
                }`}>
                  {gameState.lastAction.action.toUpperCase()}
                </div>
                {gameState.lastAction.amount && (
                  <div className="text-2xl font-bold text-yellow-400">
                    ◎{gameState.lastAction.amount}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connection Status */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-green-400 font-medium">CONNECTED</span>
        </div>

        {/* Match ID */}
        <div className="absolute bottom-4 left-4 text-xs text-gray-500 font-mono">
          Match: {gameState.id.slice(0, 8)}...{gameState.id.slice(-8)}
        </div>
      </div>
    </div>
  );
}