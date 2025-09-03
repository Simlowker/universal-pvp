'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sword, Heart, Zap } from 'lucide-react';
import { useMagicBlock } from '../../contexts/MagicBlockContext';
import { useGame } from '../../contexts/GameContext';
import { useGameSounds } from '../../hooks/useSound';
import { BattleAction, StatusEffect, Character } from '../../types/game.types';
import Button from '../ui/Button';
import { InlineLoader } from '../ui/Loader';

// Battle action type
type BattleActionType = 'attack' | 'defend' | 'special' | 'heal';

interface BattleArenaProps {
  playerCharacter: Character;
  opponentCharacter: Character;
  onActionExecuted?: (action: BattleAction) => void;
  onBattleEnd?: (winner: string) => void;
  onError?: (error: any) => void;
}

// Animated stat component
const AnimatedStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  maxValue: number;
  color: string;
}> = ({ icon, label, value, maxValue, color }) => (
  <div className="flex items-center gap-2 bg-game-surface p-2 rounded">
    {icon}
    <div className="flex-1">
      <div className="text-xs text-game-muted">{label}</div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${(value / maxValue) * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="text-xs text-game-text">{value}/{maxValue}</div>
    </div>
  </div>
);

const MagicBlockBattleArena: React.FC<BattleArenaProps> = ({
  playerCharacter,
  opponentCharacter,
  onActionExecuted,
  onBattleEnd,
  onError,
}) => {
  const { sdk } = useMagicBlock();
  const { playSound } = useGameSounds();
  const [gameState, setGameState] = useState<'idle' | 'battle' | 'ended'>('idle');
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize battle session
  useEffect(() => {
    const initBattle = async () => {
      if (sdk && !sessionId) {
        try {
          const session = await sdk.createBattleSession({
            player: playerCharacter,
            opponent: opponentCharacter,
          });
          setSessionId(session.id);
          setGameState('battle');
        } catch (error) {
          console.error('Failed to initialize battle:', error);
          onError?.(error);
        }
      }
    };

    initBattle();
  }, [sdk, playerCharacter, opponentCharacter, sessionId, onError]);

  // Execute battle action
  const executeBattleAction = async (actionType: BattleActionType) => {
    if (!sdk || !sessionId || isExecuting) return;

    setIsExecuting(true);
    try {
      const action: BattleAction = {
        type: actionType,
        sourceCharacter: playerCharacter.id,
        targetCharacter: opponentCharacter.id,
        timestamp: Date.now(),
      };

      const result = await sdk.executeBattleAction(action, sessionId);
      
      if (result.success) {
        onActionExecuted?.(action);
        playSound('action');
        
        if (result.battleEnded) {
          setGameState('ended');
          onBattleEnd?.(result.winner);
        }
      }
    } catch (error) {
      console.error('Battle action failed:', error);
      onError?.(error);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="battle-arena bg-game-bg p-6 rounded-lg border border-game-border">
      <AnimatePresence mode="wait">
        {gameState === 'battle' && (
          <motion.div
            key="battle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Player Stats */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="text-lg font-gaming text-primary">
                  {playerCharacter.name}
                </h3>
                <AnimatedStat
                  icon={<Heart className="w-4 h-4 text-red-500" />}
                  label="Health"
                  value={playerCharacter.stats.health}
                  maxValue={playerCharacter.stats.maxHealth}
                  color="bg-red-500"
                />
                <AnimatedStat
                  icon={<Zap className="w-4 h-4 text-blue-500" />}
                  label="Mana"
                  value={playerCharacter.stats.mana}
                  maxValue={playerCharacter.stats.maxMana}
                  color="bg-blue-500"
                />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-gaming text-secondary">
                  {opponentCharacter.name}
                </h3>
                <AnimatedStat
                  icon={<Heart className="w-4 h-4 text-red-500" />}
                  label="Health"
                  value={opponentCharacter.stats.health}
                  maxValue={opponentCharacter.stats.maxHealth}
                  color="bg-red-500"
                />
                <AnimatedStat
                  icon={<Zap className="w-4 h-4 text-blue-500" />}
                  label="Mana"
                  value={opponentCharacter.stats.mana}
                  maxValue={opponentCharacter.stats.maxMana}
                  color="bg-blue-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={() => executeBattleAction('attack')}
                disabled={isExecuting}
                className="flex items-center gap-2"
                variant="destructive"
              >
                <Sword className="w-4 h-4" />
                {isExecuting ? <InlineLoader /> : 'Attack'}
              </Button>
              <Button
                onClick={() => executeBattleAction('defend')}
                disabled={isExecuting}
                className="flex items-center gap-2"
                variant="secondary"
              >
                <Shield className="w-4 h-4" />
                {isExecuting ? <InlineLoader /> : 'Defend'}
              </Button>
            </div>
          </motion.div>
        )}

        {gameState === 'ended' && (
          <motion.div
            key="ended"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-4"
          >
            <h2 className="text-2xl font-gaming text-primary">Battle Ended!</h2>
            <Button
              onClick={() => setGameState('idle')}
              variant="primary"
              fullWidth
            >
              New Battle
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MagicBlockBattleArena;