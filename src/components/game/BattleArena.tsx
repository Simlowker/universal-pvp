'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useMagicBlock, GameAction, GamePlayer } from '@/contexts/MagicBlockProvider';

interface BattleArenaProps {
  className?: string;
}

interface AnimatedAction {
  id: string;
  type: GameAction['type'];
  fromPlayer: string;
  toPlayer?: string;
  damage?: number;
  startTime: number;
  duration: number;
}

export const BattleArena: React.FC<BattleArenaProps> = ({ className = '' }) => {
  const { gameState, playerAddress, isInMatch } = useMagicBlock();
  const [animatedActions, setAnimatedActions] = useState<AnimatedAction[]>([]);
  const [playerPositions, setPlayerPositions] = useState<Record<string, { x: number; y: number }>>({});
  const animationFrameRef = useRef<number>();
  const lastActionRef = useRef<number>(0);

  // Initialize player positions
  useEffect(() => {
    if (gameState.players.length === 2) {
      const positions: Record<string, { x: number; y: number }> = {};
      gameState.players.forEach((player, index) => {
        positions[player.publicKey] = {
          x: index === 0 ? 20 : 80, // Left vs right positioning
          y: 50
        };
      });
      setPlayerPositions(positions);
    }
  }, [gameState.players]);

  // Handle new actions with animations
  useEffect(() => {
    const newActions = gameState.actions.slice(lastActionRef.current);
    if (newActions.length > 0) {
      const animatedNewActions = newActions.map(action => ({
        id: action.id,
        type: action.type,
        fromPlayer: action.playerId,
        toPlayer: action.target,
        damage: action.damage,
        startTime: Date.now(),
        duration: action.type === 'attack' ? 800 : action.type === 'special' ? 1200 : 600
      }));
      
      setAnimatedActions(prev => [...prev, ...animatedNewActions]);
      lastActionRef.current = gameState.actions.length;
    }
  }, [gameState.actions]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      setAnimatedActions(prev => prev.filter(action => now - action.startTime < action.duration));
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const getPlayerByAddress = (address: string): GamePlayer | undefined => {
    return gameState.players.find(p => p.publicKey === address);
  };

  const getHealthPercentage = (player: GamePlayer): number => {
    const maxHealth = 100; // Assuming max health is 100
    return Math.max(0, Math.min(100, (player.health / maxHealth) * 100));
  };

  const getManaPercentage = (player: GamePlayer): number => {
    const maxMana = 50; // Assuming max mana is 50
    return Math.max(0, Math.min(100, (player.mana / maxMana) * 100));
  };

  const getActionAnimation = (action: AnimatedAction, elapsed: number) => {
    const progress = Math.min(1, elapsed / action.duration);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    switch (action.type) {
      case 'attack':
        return {
          scale: 1 + Math.sin(progress * Math.PI * 4) * 0.1,
          opacity: Math.max(0, 1 - progress),
          color: '#ef4444'
        };
      case 'special':
        return {
          scale: 1 + Math.sin(progress * Math.PI * 6) * 0.15,
          opacity: Math.max(0, 1 - progress),
          color: '#8b5cf6'
        };
      case 'defend':
        return {
          scale: 1 + easeOut * 0.2,
          opacity: Math.max(0, 1 - progress),
          color: '#06b6d4'
        };
      case 'heal':
        return {
          scale: 1 + Math.sin(progress * Math.PI * 3) * 0.1,
          opacity: Math.max(0, 1 - progress),
          color: '#10b981'
        };
      default:
        return { scale: 1, opacity: 0, color: '#ffffff' };
    }
  };

  if (!isInMatch || gameState.players.length < 2) {
    return (
      <div className={`flex items-center justify-center min-h-96 bg-gray-900 rounded-xl ${className}`}>
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">⚔️</div>
          <p className="text-xl">Waiting for battle...</p>
          <p className="text-sm mt-2">Find an opponent to start fighting!</p>
        </div>
      </div>
    );
  }

  const [player1, player2] = gameState.players;
  const isPlayer1Current = playerAddress === player1.publicKey;

  return (
    <div className={`relative bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 rounded-xl overflow-hidden min-h-96 ${className}`}>
      {/* Battle Background */}
      <div className="absolute inset-0 bg-gradient-radial from-purple-900/20 via-transparent to-transparent"></div>
      
      {/* Match Info Header */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
          <p className="text-white text-sm font-medium">
            {gameState.phase === 'battle' ? 'Battle in Progress' : 'Match Complete'}
          </p>
          {gameState.winner && (
            <p className="text-yellow-400 text-xs">
              Winner: {getPlayerByAddress(gameState.winner)?.publicKey.slice(0, 8)}...
            </p>
          )}
        </div>
      </div>

      {/* Player 1 (Left) */}
      <div 
        className="absolute left-8 top-1/2 transform -translate-y-1/2 transition-all duration-500"
        style={{ 
          transform: `translateY(-50%) ${isPlayer1Current ? 'scale(1.05)' : 'scale(1)'}`
        }}
      >
        <div className="relative">
          {/* Player Avatar */}
          <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-4xl transition-all duration-300 ${
            isPlayer1Current ? 'border-blue-400 bg-blue-900/50' : 'border-gray-600 bg-gray-800/50'
          }`}>
            🛡️
          </div>
          
          {/* Player Stats */}
          <div className="mt-3 space-y-2 min-w-32">
            {/* Health Bar */}
            <div className="relative">
              <div className="w-full h-2 bg-gray-700 rounded-full">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${getHealthPercentage(player1)}%` }}
                ></div>
              </div>
              <span className="absolute -top-5 left-0 text-xs text-red-400 font-medium">
                HP: {player1.health}
              </span>
            </div>
            
            {/* Mana Bar */}
            <div className="relative">
              <div className="w-full h-2 bg-gray-700 rounded-full">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${getManaPercentage(player1)}%` }}
                ></div>
              </div>
              <span className="absolute -top-5 left-0 text-xs text-blue-400 font-medium">
                MP: {player1.mana}
              </span>
            </div>
            
            {/* Player Info */}
            <div className="text-center">
              <p className="text-white text-sm font-medium">
                {isPlayer1Current ? 'You' : 'Opponent'}
              </p>
              <p className="text-gray-400 text-xs">
                Lv.{player1.level} | {player1.wins}W/{player1.losses}L
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Player 2 (Right) */}
      <div 
        className="absolute right-8 top-1/2 transform -translate-y-1/2 transition-all duration-500"
        style={{ 
          transform: `translateY(-50%) ${!isPlayer1Current ? 'scale(1.05)' : 'scale(1)'}`
        }}
      >
        <div className="relative">
          {/* Player Avatar */}
          <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-4xl transition-all duration-300 ${
            !isPlayer1Current ? 'border-blue-400 bg-blue-900/50' : 'border-gray-600 bg-gray-800/50'
          }`}>
            ⚔️
          </div>
          
          {/* Player Stats */}
          <div className="mt-3 space-y-2 min-w-32">
            {/* Health Bar */}
            <div className="relative">
              <div className="w-full h-2 bg-gray-700 rounded-full">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${getHealthPercentage(player2)}%` }}
                ></div>
              </div>
              <span className="absolute -top-5 right-0 text-xs text-red-400 font-medium">
                HP: {player2.health}
              </span>
            </div>
            
            {/* Mana Bar */}
            <div className="relative">
              <div className="w-full h-2 bg-gray-700 rounded-full">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${getManaPercentage(player2)}%` }}
                ></div>
              </div>
              <span className="absolute -top-5 right-0 text-xs text-blue-400 font-medium">
                MP: {player2.mana}
              </span>
            </div>
            
            {/* Player Info */}
            <div className="text-center">
              <p className="text-white text-sm font-medium">
                {!isPlayer1Current ? 'You' : 'Opponent'}
              </p>
              <p className="text-gray-400 text-xs">
                Lv.{player2.level} | {player2.wins}W/{player2.losses}L
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Battle Effects */}
      <div className="absolute inset-0 pointer-events-none">
        {animatedActions.map(action => {
          const elapsed = Date.now() - action.startTime;
          const animation = getActionAnimation(action, elapsed);
          
          if (animation.opacity <= 0) return null;
          
          const fromPos = playerPositions[action.fromPlayer];
          const toPos = action.toPlayer ? playerPositions[action.toPlayer] : fromPos;
          
          if (!fromPos) return null;
          
          return (
            <div
              key={action.id}
              className="absolute text-2xl font-bold animate-pulse"
              style={{
                left: `${(fromPos.x + (toPos?.x || fromPos.x)) / 2}%`,
                top: `${(fromPos.y + (toPos?.y || fromPos.y)) / 2}%`,
                transform: `translate(-50%, -50%) scale(${animation.scale})`,
                opacity: animation.opacity,
                color: animation.color,
                textShadow: `0 0 20px ${animation.color}`
              }}
            >
              {action.type === 'attack' && '💥'}
              {action.type === 'special' && '⚡'}
              {action.type === 'defend' && '🛡️'}
              {action.type === 'heal' && '💚'}
              {action.damage && (
                <span className="text-lg ml-1">-{action.damage}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Turn Indicator */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-2">
          <p className="text-white text-sm text-center">
            {gameState.phase === 'battle' ? (
              <>
                <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Turn {gameState.currentTurn + 1}
              </>
            ) : (
              'Battle Complete'
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BattleArena;