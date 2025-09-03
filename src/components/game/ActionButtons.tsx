'use client';

import React, { useState, useEffect } from 'react';
import { useMagicBlock, GameAction } from '@/contexts/MagicBlockProvider';

interface ActionButtonsProps {
  className?: string;
  disabled?: boolean;
}

interface ActionCooldown {
  type: GameAction['type'];
  remainingTime: number;
  totalCooldown: number;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ 
  className = '', 
  disabled = false 
}) => {
  const { gameState, playerAddress, isInMatch, performAction, error } = useMagicBlock();
  const [cooldowns, setCooldowns] = useState<ActionCooldown[]>([]);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [lastActionType, setLastActionType] = useState<GameAction['type'] | null>(null);

  // Cooldown timers (in milliseconds)
  const actionCooldowns: Record<GameAction['type'], number> = {
    attack: 2000,    // 2 seconds
    defend: 1500,    // 1.5 seconds
    special: 5000,   // 5 seconds
    heal: 3000       // 3 seconds
  };

  // Mana costs
  const manaCosts: Record<GameAction['type'], number> = {
    attack: 5,
    defend: 3,
    special: 20,
    heal: 10
  };

  const currentPlayer = gameState.players.find(p => p.publicKey === playerAddress);
  const opponent = gameState.players.find(p => p.publicKey !== playerAddress);

  // Update cooldown timers
  useEffect(() => {
    const timer = setInterval(() => {
      setCooldowns(prev => 
        prev
          .map(cooldown => ({
            ...cooldown,
            remainingTime: Math.max(0, cooldown.remainingTime - 100)
          }))
          .filter(cooldown => cooldown.remainingTime > 0)
      );
    }, 100);

    return () => clearInterval(timer);
  }, []);

  const startCooldown = (actionType: GameAction['type']) => {
    const cooldownTime = actionCooldowns[actionType];
    setCooldowns(prev => [
      ...prev.filter(c => c.type !== actionType),
      {
        type: actionType,
        remainingTime: cooldownTime,
        totalCooldown: cooldownTime
      }
    ]);
  };

  const getCooldown = (actionType: GameAction['type']): ActionCooldown | undefined => {
    return cooldowns.find(c => c.type === actionType);
  };

  const canPerformAction = (actionType: GameAction['type']): boolean => {
    if (disabled || !isInMatch || !currentPlayer) return false;
    
    // Check cooldown
    const cooldown = getCooldown(actionType);
    if (cooldown && cooldown.remainingTime > 0) return false;
    
    // Check mana
    const manaCost = manaCosts[actionType];
    if (currentPlayer.mana < manaCost) return false;
    
    // Check if it's player's turn (for turn-based mechanics)
    const isMyTurn = gameState.currentTurn % 2 === (gameState.players.findIndex(p => p.publicKey === playerAddress));
    
    return isMyTurn;
  };

  const handleAction = async (actionType: GameAction['type']) => {
    if (!canPerformAction(actionType) || isPerformingAction) return;

    setIsPerformingAction(true);
    setLastActionType(actionType);

    try {
      const action: Omit<GameAction, 'id' | 'timestamp'> = {
        playerId: playerAddress!,
        type: actionType,
        target: actionType === 'heal' ? (playerAddress || undefined) : (opponent?.publicKey || undefined)
      };

      // Add damage calculation for attack actions
      if (actionType === 'attack') {
        action.damage = Math.floor(Math.random() * 20) + 10; // 10-30 damage
      } else if (actionType === 'special') {
        action.damage = Math.floor(Math.random() * 35) + 25; // 25-60 damage
      }

      await performAction(action);
      startCooldown(actionType);
      
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setIsPerformingAction(false);
      setLastActionType(null);
    }
  };

  const getButtonStyle = (actionType: GameAction['type'], baseColor: string, hoverColor: string) => {
    const cooldown = getCooldown(actionType);
    const canUse = canPerformAction(actionType);
    const isActive = isPerformingAction && lastActionType === actionType;
    
    if (isActive) {
      return `bg-yellow-600 border-yellow-500 text-white scale-95 animate-pulse`;
    }
    
    if (!canUse) {
      return `bg-gray-700 border-gray-600 text-gray-400 cursor-not-allowed`;
    }
    
    return `${baseColor} border-2 border-transparent text-white hover:${hoverColor} hover:scale-105 active:scale-95 transition-all duration-200`;
  };

  const getCooldownPercentage = (actionType: GameAction['type']): number => {
    const cooldown = getCooldown(actionType);
    if (!cooldown) return 0;
    return (cooldown.remainingTime / cooldown.totalCooldown) * 100;
  };

  const formatCooldownTime = (ms: number): string => {
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (!isInMatch) {
    return (
      <div className={`bg-gray-900 rounded-lg p-6 text-center ${className}`}>
        <p className="text-gray-400 mb-2">Not in battle</p>
        <p className="text-gray-500 text-sm">Join matchmaking to start fighting!</p>
      </div>
    );
  }

  if (!currentPlayer) {
    return (
      <div className={`bg-gray-900 rounded-lg p-6 text-center ${className}`}>
        <div className="animate-spin w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
        <p className="text-gray-400 text-sm">Loading player data...</p>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-b from-gray-900 to-gray-800 rounded-lg p-6 border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h3 className="text-white text-lg font-semibold mb-1">Battle Actions</h3>
        <p className="text-gray-400 text-sm">
          Mana: {currentPlayer.mana}/50 | 
          Turn: {gameState.currentTurn % 2 === gameState.players.findIndex(p => p.publicKey === playerAddress) ? 'Your' : "Opponent's"}
        </p>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Attack Button */}
        <div className="relative">
          <button
            onClick={() => handleAction('attack')}
            disabled={!canPerformAction('attack') || isPerformingAction}
            className={`w-full h-20 rounded-lg font-semibold text-lg flex flex-col items-center justify-center space-y-1 ${
              getButtonStyle('attack', 'bg-red-600', 'bg-red-500')
            }`}
          >
            <span className="text-2xl">⚔️</span>
            <span>Attack</span>
            <span className="text-xs opacity-75">{manaCosts.attack} MP</span>
          </button>
          {getCooldownPercentage('attack') > 0 && (
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-gray-900/80"
                style={{ height: `${getCooldownPercentage('attack')}%` }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {formatCooldownTime(getCooldown('attack')!.remainingTime)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Defend Button */}
        <div className="relative">
          <button
            onClick={() => handleAction('defend')}
            disabled={!canPerformAction('defend') || isPerformingAction}
            className={`w-full h-20 rounded-lg font-semibold text-lg flex flex-col items-center justify-center space-y-1 ${
              getButtonStyle('defend', 'bg-blue-600', 'bg-blue-500')
            }`}
          >
            <span className="text-2xl">🛡️</span>
            <span>Defend</span>
            <span className="text-xs opacity-75">{manaCosts.defend} MP</span>
          </button>
          {getCooldownPercentage('defend') > 0 && (
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-gray-900/80"
                style={{ height: `${getCooldownPercentage('defend')}%` }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {formatCooldownTime(getCooldown('defend')!.remainingTime)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Special Button */}
        <div className="relative">
          <button
            onClick={() => handleAction('special')}
            disabled={!canPerformAction('special') || isPerformingAction}
            className={`w-full h-20 rounded-lg font-semibold text-lg flex flex-col items-center justify-center space-y-1 ${
              getButtonStyle('special', 'bg-purple-600', 'bg-purple-500')
            }`}
          >
            <span className="text-2xl">⚡</span>
            <span>Special</span>
            <span className="text-xs opacity-75">{manaCosts.special} MP</span>
          </button>
          {getCooldownPercentage('special') > 0 && (
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-gray-900/80"
                style={{ height: `${getCooldownPercentage('special')}%` }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {formatCooldownTime(getCooldown('special')!.remainingTime)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Heal Button */}
        <div className="relative">
          <button
            onClick={() => handleAction('heal')}
            disabled={!canPerformAction('heal') || isPerformingAction}
            className={`w-full h-20 rounded-lg font-semibold text-lg flex flex-col items-center justify-center space-y-1 ${
              getButtonStyle('heal', 'bg-green-600', 'bg-green-500')
            }`}
          >
            <span className="text-2xl">💚</span>
            <span>Heal</span>
            <span className="text-xs opacity-75">{manaCosts.heal} MP</span>
          </button>
          {getCooldownPercentage('heal') > 0 && (
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 right-0 bg-gray-900/80"
                style={{ height: `${getCooldownPercentage('heal')}%` }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {formatCooldownTime(getCooldown('heal')!.remainingTime)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-900/50 border border-red-600 rounded-lg p-3 mb-4">
          <p className="text-red-400 text-sm text-center">❌ {error}</p>
        </div>
      )}

      {isPerformingAction && (
        <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-3 mb-4">
          <p className="text-yellow-400 text-sm text-center flex items-center justify-center">
            <span className="animate-spin w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full mr-2"></span>
            Performing {lastActionType}...
          </p>
        </div>
      )}

      {gameState.phase === 'completed' && (
        <div className="bg-blue-900/50 border border-blue-600 rounded-lg p-3">
          <p className="text-blue-400 text-sm text-center">
            🏆 Battle Complete! 
            {gameState.winner === playerAddress ? ' You won!' : ' You lost!'}
          </p>
        </div>
      )}

      {/* Action Hints */}
      <div className="text-center text-gray-500 text-xs mt-4">
        <p>💡 Actions consume mana and have cooldowns</p>
        <p>🎯 Special attacks deal more damage but cost more mana</p>
      </div>
    </div>
  );
};

export default ActionButtons;