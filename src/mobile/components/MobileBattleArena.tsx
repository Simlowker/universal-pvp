'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  Sword, Shield, Zap, Heart, Clock, Trophy, 
  Volume2, VolumeX, Vibrate, Settings,
  ChevronUp, ChevronDown, RotateCcw
} from 'lucide-react';
import { useGame } from '../../frontend/contexts/GameContext';
import { useGameSounds } from '../../frontend/hooks/useSound';
import { useTouchGestures } from '../hooks/useTouchGestures';
import { useTouchFeedback } from '../hooks/useTouchFeedback';
import { Character } from '../../frontend/types/game';
import MobileButton from './MobileButton';

interface MobileBattleArenaProps {
  onClose?: () => void;
}

const MobileBattleArena: React.FC<MobileBattleArenaProps> = ({ onClose }) => {
  const { currentMatch, player } = useGame();
  const { playSound, toggleMute, isMuted } = useGameSounds();
  const { triggerHaptic, config: feedbackConfig, updateConfig } = useTouchFeedback();
  
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [turnTimer, setTurnTimer] = useState(30);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [battleLogExpanded, setBattleLogExpanded] = useState(false);
  const [actionPanelHeight, setActionPanelHeight] = useState('auto');

  // Mock character data
  const playerCharacter: Character = {
    id: 'player_char',
    name: 'Mobile Warrior',
    class: {
      id: 'warrior',
      name: 'Warrior',
      description: 'Touch-optimized fighter',
      baseStats: { health: 100, mana: 30, attack: 25, defense: 20, speed: 15 },
      abilities: ['sword-slash', 'shield-bash', 'berserker-rage'],
      image: '/images/classes/warrior.png',
    },
    level: 5,
    health: 85,
    maxHealth: 100,
    mana: 25,
    maxMana: 30,
    attack: 25,
    defense: 20,
    speed: 15,
    abilities: [],
    equipment: [],
  };

  const opponentCharacter: Character = {
    id: 'opponent_char',
    name: 'AI Opponent',
    class: {
      id: 'mage',
      name: 'Mage',
      description: 'Digital spellcaster',
      baseStats: { health: 70, mana: 50, attack: 30, defense: 10, speed: 20 },
      abilities: ['fireball', 'ice-shard', 'lightning-bolt'],
      image: '/images/classes/mage.png',
    },
    level: 4,
    health: 55,
    maxHealth: 70,
    mana: 35,
    maxMana: 50,
    attack: 30,
    defense: 10,
    speed: 20,
    abilities: [],
    equipment: [],
  };

  const abilities = [
    { id: 'attack', name: 'Attack', manaCost: 0, description: 'Basic attack', icon: <Sword className="h-6 w-6" /> },
    { id: 'defend', name: 'Defend', manaCost: 0, description: 'Block damage', icon: <Shield className="h-6 w-6" /> },
    { id: 'special', name: 'Special', manaCost: 5, description: 'Power attack', icon: <Zap className="h-6 w-6" /> },
    { id: 'heal', name: 'Heal', manaCost: 8, description: 'Restore health', icon: <Heart className="h-6 w-6" /> },
  ];

  // Touch gesture handlers
  const gestureHandlers = useTouchGestures({
    onSwipe: (direction, velocity, distance) => {
      if (!isPlayerTurn) return;
      
      switch (direction) {
        case 'up':
          if (distance > 100) {
            handleAction('special');
          }
          break;
        case 'down':
          handleAction('defend');
          break;
        case 'left':
          handleAction('attack');
          break;
        case 'right':
          if (abilities.find(a => a.id === 'heal' && playerCharacter.mana >= a.manaCost)) {
            handleAction('heal');
          }
          break;
      }
    },
    onDoubleTap: () => {
      if (isPlayerTurn && !selectedAction) {
        handleAction('attack');
      }
    },
    onLongPress: () => {
      triggerHaptic('heavy');
      setBattleLogExpanded(prev => !prev);
    },
  });

  // Timer effect
  useEffect(() => {
    if (!isPlayerTurn) return;
    
    const timer = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          handleAction('attack');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlayerTurn]);

  const handleAction = useCallback(async (actionId: string) => {
    if (!isPlayerTurn) return;

    const ability = abilities.find(a => a.id === actionId);
    if (!ability || playerCharacter.mana < ability.manaCost) return;

    triggerHaptic('medium');
    playSound('click');
    setSelectedAction(actionId);
    setIsPlayerTurn(false);

    const logMessage = `You used ${ability.name}!`;
    setBattleLog(prev => [...prev.slice(-4), logMessage]);

    // Process turn
    setTimeout(() => {
      processOpponentTurn();
    }, 1500);
  }, [isPlayerTurn, playerCharacter.mana, triggerHaptic, playSound]);

  const processOpponentTurn = useCallback(() => {
    const opponentActions = ['attack', 'special', 'defend'];
    const randomAction = opponentActions[Math.floor(Math.random() * opponentActions.length)];
    
    setBattleLog(prev => [...prev.slice(-4), `Enemy used ${randomAction}!`]);
    triggerHaptic('light');
    
    setTimeout(() => {
      setIsPlayerTurn(true);
      setTurnTimer(30);
      setSelectedAction(null);

      // Random battle end for demo
      if (Math.random() > 0.85) {
        endBattle(Math.random() > 0.5);
      }
    }, 1500);
  }, [triggerHaptic]);

  const endBattle = useCallback((victory: boolean) => {
    if (victory) {
      playSound('victory');
      triggerHaptic('heavy');
    } else {
      playSound('defeat');
      triggerHaptic('medium');
    }
    setShowVictoryModal(true);
  }, [playSound, triggerHaptic]);

  const getHealthPercentage = (health: number, maxHealth: number) => {
    return Math.max(0, (health / maxHealth) * 100);
  };

  const getHealthColor = (percentage: number) => {
    if (percentage > 60) return 'from-green-500 to-green-400';
    if (percentage > 30) return 'from-yellow-500 to-yellow-400';
    return 'from-red-500 to-red-400';
  };

  const handleDrag = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset } = info;
    
    // Adjust action panel height based on drag
    if (Math.abs(offset.y) > 20) {
      const newHeight = Math.max(200, Math.min(400, 300 - offset.y));
      setActionPanelHeight(`${newHeight}px`);
    }
  };

  if (!currentMatch) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-game-bg">
        <div className="animate-spin h-12 w-12 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-game-bg text-game-text overflow-hidden touch-manipulation">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between p-4 bg-game-surface border-b border-game-border"
      >
        <div className="flex items-center gap-3">
          <MobileButton
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="p-2"
            hapticFeedback="light"
          >
            <RotateCcw className="h-5 w-5" />
          </MobileButton>
          <div>
            <h1 className="text-lg font-bold font-gaming">Battle Arena</h1>
            <p className="text-xs text-game-muted">Match #{currentMatch.id.slice(-6)}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <MobileButton
            size="sm"
            variant="ghost"
            onClick={toggleMute}
            className="p-2"
            hapticFeedback="light"
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </MobileButton>
          <MobileButton
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(true)}
            className="p-2"
            hapticFeedback="light"
          >
            <Settings className="h-5 w-5" />
          </MobileButton>
        </div>
      </motion.div>

      {/* Turn Timer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-3 text-center bg-game-surface/50"
      >
        <div className="inline-flex items-center gap-2 bg-game-surface border border-game-border rounded-full px-4 py-2">
          <Clock className="h-4 w-4 text-primary-500" />
          <span className="text-sm font-gaming">
            {isPlayerTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
          {isPlayerTurn && (
            <motion.span 
              className={`font-bold text-sm ${turnTimer <= 5 ? 'text-red-400' : 'text-game-text'}`}
              animate={turnTimer <= 5 ? { scale: [1, 1.1, 1] } : {}}
              transition={{ repeat: Infinity, duration: 0.5 }}
            >
              {turnTimer}s
            </motion.span>
          )}
        </div>
      </motion.div>

      {/* Battle Arena */}
      <div 
        className="flex-1 overflow-hidden relative"
        {...gestureHandlers}
      >
        {/* Characters */}
        <div className="grid grid-cols-2 gap-4 p-4 h-full">
          {/* Player */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-game-surface border border-game-border rounded-lg p-4 flex flex-col"
          >
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-primary-500/20 to-blue-500/20 rounded-full flex items-center justify-center mb-2">
                <Sword className="h-8 w-8 text-primary-400" />
              </div>
              <h3 className="font-bold text-sm font-gaming">You</h3>
            </div>

            {/* Health Bar */}
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-game-muted">HP</span>
                <span className="font-semibold">{playerCharacter.health}/{playerCharacter.maxHealth}</span>
              </div>
              <div className="w-full bg-game-bg/50 rounded-full h-2">
                <motion.div
                  className={`h-2 rounded-full bg-gradient-to-r ${getHealthColor(getHealthPercentage(playerCharacter.health, playerCharacter.maxHealth))}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${getHealthPercentage(playerCharacter.health, playerCharacter.maxHealth)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Mana Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-game-muted">MP</span>
                <span className="font-semibold">{playerCharacter.mana}/{playerCharacter.maxMana}</span>
              </div>
              <div className="w-full bg-game-bg/50 rounded-full h-2">
                <motion.div
                  className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(playerCharacter.mana / playerCharacter.maxMana) * 100}%` }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                />
              </div>
            </div>
          </motion.div>

          {/* Opponent */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-game-surface border border-game-border rounded-lg p-4 flex flex-col"
          >
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full flex items-center justify-center mb-2">
                <Zap className="h-8 w-8 text-red-400" />
              </div>
              <h3 className="font-bold text-sm font-gaming">Enemy</h3>
            </div>

            {/* Health Bar */}
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-game-muted">HP</span>
                <span className="font-semibold">{opponentCharacter.health}/{opponentCharacter.maxHealth}</span>
              </div>
              <div className="w-full bg-game-bg/50 rounded-full h-2">
                <motion.div
                  className={`h-2 rounded-full bg-gradient-to-r ${getHealthColor(getHealthPercentage(opponentCharacter.health, opponentCharacter.maxHealth))}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${getHealthPercentage(opponentCharacter.health, opponentCharacter.maxHealth)}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Mana Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-game-muted">MP</span>
                <span className="font-semibold">{opponentCharacter.mana}/{opponentCharacter.maxMana}</span>
              </div>
              <div className="w-full bg-game-bg/50 rounded-full h-2">
                <motion.div
                  className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-purple-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(opponentCharacter.mana / opponentCharacter.maxMana) * 100}%` }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Battle Log - Floating */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`absolute bottom-4 left-4 right-4 bg-game-surface/95 backdrop-blur-sm border border-game-border rounded-lg transition-all duration-300 ${
            battleLogExpanded ? 'h-32' : 'h-16'
          }`}
        >
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-xs font-gaming">Battle Log</h3>
              <MobileButton
                size="sm"
                variant="ghost"
                onClick={() => setBattleLogExpanded(!battleLogExpanded)}
                className="p-1"
                hapticFeedback="light"
              >
                {battleLogExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </MobileButton>
            </div>
            <div className="space-y-1 overflow-y-auto" style={{ height: battleLogExpanded ? '80px' : '24px' }}>
              {battleLog.length === 0 ? (
                <p className="text-game-muted text-xs text-center">Battle starting...</p>
              ) : (
                battleLog.slice(-5).map((log, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-xs text-game-text bg-game-bg/30 rounded px-2 py-1"
                  >
                    {log}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action Panel */}
      <motion.div
        drag="y"
        dragConstraints={{ top: -100, bottom: 100 }}
        dragElastic={0.1}
        onDrag={handleDrag}
        className="bg-game-surface border-t border-game-border p-4"
        style={{ height: actionPanelHeight }}
      >
        <div className="w-12 h-1 bg-game-border rounded-full mx-auto mb-4" />
        
        <h3 className="font-bold text-sm font-gaming mb-3 text-center">
          {isPlayerTurn ? 'Choose Action' : 'Opponent Turn'}
        </h3>
        
        <div className="grid grid-cols-2 gap-3">
          {abilities.map((ability) => {
            const canUse = playerCharacter.mana >= ability.manaCost && isPlayerTurn;
            const isSelected = selectedAction === ability.id;

            return (
              <MobileButton
                key={ability.id}
                onClick={() => handleAction(ability.id)}
                disabled={!canUse}
                variant={isSelected ? 'gaming' : canUse ? 'primary' : 'secondary'}
                size="touch"
                className={`flex-col gap-1 ${!canUse && 'opacity-50'}`}
                hapticFeedback={canUse ? 'medium' : 'light'}
                longPressEnabled
                onLongPress={() => {
                  // Show ability description on long press
                  triggerHaptic('heavy');
                }}
              >
                {ability.icon}
                <span className="text-xs font-semibold">{ability.name}</span>
                <span className="text-xs text-game-muted">
                  {ability.manaCost > 0 ? `${ability.manaCost} MP` : 'Free'}
                </span>
              </MobileButton>
            );
          })}
        </div>

        {/* Swipe Hints */}
        <div className="mt-4 text-center">
          <p className="text-xs text-game-muted">
            Swipe ← Attack • ↑ Special • ↓ Defend • → Heal
          </p>
        </div>
      </motion.div>

      {/* Victory Modal */}
      <AnimatePresence>
        {showVictoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-sm w-full"
            >
              <div className="text-center space-y-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                >
                  <Trophy className="h-16 w-16 text-yellow-500 mx-auto" />
                </motion.div>
                
                <div>
                  <h2 className="text-2xl font-bold text-game-text font-gaming">Victory!</h2>
                  <p className="text-game-muted mt-2 text-sm">
                    Excellent battle performance!
                  </p>
                </div>

                <div className="bg-game-bg/50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-game-muted">Bet Amount:</span>
                    <span className="text-game-text font-bold">◎{currentMatch.betAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-game-muted">Platform Fee:</span>
                    <span className="text-game-text">◎{(currentMatch.betAmount * 0.05).toFixed(4)}</span>
                  </div>
                  <div className="border-t border-game-border pt-2">
                    <div className="flex justify-between">
                      <span className="text-game-text font-semibold">You Won:</span>
                      <span className="text-green-400 font-bold">
                        ◎{(currentMatch.betAmount * 1.95).toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <MobileButton
                    onClick={() => setShowVictoryModal(false)}
                    variant="primary"
                    size="touch"
                    fullWidth
                    hapticFeedback="medium"
                  >
                    Continue
                  </MobileButton>
                  <MobileButton
                    onClick={() => window.location.reload()}
                    variant="outline"
                    size="touch"
                    fullWidth
                    hapticFeedback="light"
                  >
                    New Battle
                  </MobileButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-sm w-full"
            >
              <div className="space-y-6">
                <h2 className="text-xl font-bold text-game-text font-gaming text-center">
                  Touch Settings
                </h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-game-text">Haptic Feedback</span>
                    <MobileButton
                      onClick={() => updateConfig({ hapticEnabled: !feedbackConfig.hapticEnabled })}
                      variant={feedbackConfig.hapticEnabled ? 'primary' : 'outline'}
                      size="sm"
                      hapticFeedback="light"
                    >
                      <Vibrate className="h-4 w-4" />
                    </MobileButton>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-game-text">Sound Effects</span>
                    <MobileButton
                      onClick={() => updateConfig({ soundEnabled: !feedbackConfig.soundEnabled })}
                      variant={feedbackConfig.soundEnabled ? 'primary' : 'outline'}
                      size="sm"
                      hapticFeedback="light"
                    >
                      {feedbackConfig.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </MobileButton>
                  </div>
                </div>

                <MobileButton
                  onClick={() => setShowSettings(false)}
                  variant="primary"
                  size="touch"
                  fullWidth
                  hapticFeedback="medium"
                >
                  Done
                </MobileButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileBattleArena;