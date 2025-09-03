'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sword, Shield, Zap, Heart, Droplet, Clock, Star, Trophy, X } from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import { useGameSounds } from '../../hooks/useSound';
import { GameAction, StatusEffect, Character } from '../../types/game';
import Button from '../ui/Button';
import { InlineLoader } from '../ui/LoadingSpinner';

const BattleArena: React.FC = () => {
  const { currentMatch, player } = useGame();
  const { playSound } = useGameSounds();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [turnTimer, setTurnTimer] = useState(30);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  
  // Mock character data for demonstration
  const playerCharacter: Character = {
    id: 'player_char',
    name: 'Player Warrior',
    class: {
      id: 'warrior',
      name: 'Warrior',
      description: 'Strong melee fighter',
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
    name: 'Enemy Mage',
    class: {
      id: 'mage',
      name: 'Mage',
      description: 'Powerful spellcaster',
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
    { id: 'attack', name: 'Basic Attack', manaCost: 0, description: 'Deal physical damage' },
    { id: 'defend', name: 'Defend', manaCost: 0, description: 'Reduce incoming damage' },
    { id: 'sword-slash', name: 'Sword Slash', manaCost: 5, description: 'Powerful sword attack' },
    { id: 'shield-bash', name: 'Shield Bash', manaCost: 3, description: 'Stun and damage enemy' },
  ];

  // Turn timer
  useEffect(() => {
    if (!isPlayerTurn) return;
    
    const timer = setInterval(() => {
      setTurnTimer(prev => {
        if (prev <= 1) {
          // Auto-select basic attack if time runs out
          handleAction('attack');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlayerTurn]);

  const handleAction = async (actionId: string) => {
    if (!isPlayerTurn) return;

    playSound('click');
    setSelectedAction(actionId);
    setIsPlayerTurn(false);

    // Simulate action processing
    const ability = abilities.find(a => a.id === actionId);
    if (ability) {
      const logMessage = `You used ${ability.name}!`;
      setBattleLog(prev => [...prev, logMessage]);
      
      // Play appropriate sound
      switch (actionId) {
        case 'attack':
        case 'sword-slash':
          playSound('attack');
          break;
        case 'defend':
        case 'shield-bash':
          playSound('defend');
          break;
        default:
          playSound('ability');
      }
    }

    // Simulate turn delay
    setTimeout(() => {
      // Process opponent turn
      processOpponentTurn();
    }, 2000);
  };

  const processOpponentTurn = () => {
    const opponentActions = ['attack', 'fireball', 'defend'];
    const randomAction = opponentActions[Math.floor(Math.random() * opponentActions.length)];
    
    setBattleLog(prev => [...prev, `Enemy used ${randomAction}!`]);
    
    setTimeout(() => {
      setIsPlayerTurn(true);
      setTurnTimer(30);
      setSelectedAction(null);

      // Check for battle end
      if (Math.random() > 0.8) {
        endBattle(Math.random() > 0.5);
      }
    }, 1500);
  };

  const endBattle = (victory: boolean) => {
    if (victory) {
      playSound('victory');
    } else {
      playSound('defeat');
    }
    setShowVictoryModal(true);
  };

  const getHealthPercentage = (health: number, maxHealth: number) => {
    return Math.max(0, (health / maxHealth) * 100);
  };

  const getManaPercentage = (mana: number, maxMana: number) => {
    return Math.max(0, (mana / maxMana) * 100);
  };

  const getHealthColor = (percentage: number) => {
    if (percentage > 60) return 'from-green-600 to-green-400';
    if (percentage > 30) return 'from-yellow-600 to-yellow-400';
    return 'from-red-600 to-red-400';
  };

  if (!currentMatch) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <InlineLoader message="Loading battle arena..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Battle Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold text-game-text font-gaming mb-2">
          Battle Arena
        </h1>
        <div className="flex items-center justify-center gap-4 text-game-muted">
          <span>Match #{currentMatch.id.slice(-6)}</span>
          <span>•</span>
          <span>Bet: ◎{currentMatch.betAmount}</span>
        </div>
      </motion.div>

      {/* Turn Timer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center"
      >
        <div className="inline-flex items-center gap-2 bg-game-surface border border-game-border rounded-lg px-4 py-2">
          <Clock className="h-4 w-4 text-primary-500" />
          <span className="text-game-text font-gaming">
            {isPlayerTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
          {isPlayerTurn && (
            <span className={`font-bold ${turnTimer <= 5 ? 'text-red-400' : 'text-game-text'}`}>
              {turnTimer}s
            </span>
          )}
        </div>
      </motion.div>

      {/* Battle Field */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player Character */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-game-surface border border-game-border rounded-lg p-6"
        >
          <div className="text-center mb-4">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-primary-500/20 to-blue-500/20 rounded-full flex items-center justify-center mb-3">
              <Sword className="h-10 w-10 text-primary-400" />
            </div>
            <h3 className="font-bold text-game-text font-gaming">You</h3>
            <p className="text-game-muted text-sm">{playerCharacter.name}</p>
          </div>

          {/* Health Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-game-muted">Health</span>
              <span className="text-game-text font-semibold">
                {playerCharacter.health}/{playerCharacter.maxHealth}
              </span>
            </div>
            <div className="w-full bg-game-bg/50 rounded-full h-3">
              <motion.div
                className={`h-3 rounded-full bg-gradient-to-r ${getHealthColor(getHealthPercentage(playerCharacter.health, playerCharacter.maxHealth))}`}
                initial={{ width: 0 }}
                animate={{ width: `${getHealthPercentage(playerCharacter.health, playerCharacter.maxHealth)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Mana Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-game-muted">Mana</span>
              <span className="text-game-text font-semibold">
                {playerCharacter.mana}/{playerCharacter.maxMana}
              </span>
            </div>
            <div className="w-full bg-game-bg/50 rounded-full h-3">
              <motion.div
                className="h-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                initial={{ width: 0 }}
                animate={{ width: `${getManaPercentage(playerCharacter.mana, playerCharacter.maxMana)}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
              />
            </div>
          </div>
        </motion.div>

        {/* Battle Log */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-game-surface border border-game-border rounded-lg p-6"
        >
          <h3 className="font-bold text-game-text font-gaming mb-4 text-center">
            Battle Log
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {battleLog.length === 0 ? (
              <p className="text-game-muted text-center text-sm">
                Battle hasn't started yet...
              </p>
            ) : (
              battleLog.map((log, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm text-game-text bg-game-bg/30 rounded px-3 py-2"
                >
                  {log}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* Opponent Character */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-game-surface border border-game-border rounded-lg p-6"
        >
          <div className="text-center mb-4">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-full flex items-center justify-center mb-3">
              <Zap className="h-10 w-10 text-red-400" />
            </div>
            <h3 className="font-bold text-game-text font-gaming">Opponent</h3>
            <p className="text-game-muted text-sm">{opponentCharacter.name}</p>
          </div>

          {/* Health Bar */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-game-muted">Health</span>
              <span className="text-game-text font-semibold">
                {opponentCharacter.health}/{opponentCharacter.maxHealth}
              </span>
            </div>
            <div className="w-full bg-game-bg/50 rounded-full h-3">
              <motion.div
                className={`h-3 rounded-full bg-gradient-to-r ${getHealthColor(getHealthPercentage(opponentCharacter.health, opponentCharacter.maxHealth))}`}
                initial={{ width: 0 }}
                animate={{ width: `${getHealthPercentage(opponentCharacter.health, opponentCharacter.maxHealth)}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>

          {/* Mana Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-game-muted">Mana</span>
              <span className="text-game-text font-semibold">
                {opponentCharacter.mana}/{opponentCharacter.maxMana}
              </span>
            </div>
            <div className="w-full bg-game-bg/50 rounded-full h-3">
              <motion.div
                className="h-3 rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
                initial={{ width: 0 }}
                animate={{ width: `${getManaPercentage(opponentCharacter.mana, opponentCharacter.maxMana)}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-game-surface border border-game-border rounded-lg p-6"
      >
        <h3 className="font-bold text-game-text font-gaming mb-4 text-center">
          Choose Your Action
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {abilities.map((ability) => {
            const canUse = playerCharacter.mana >= ability.manaCost;
            const isSelected = selectedAction === ability.id;

            return (
              <Button
                key={ability.id}
                onClick={() => handleAction(ability.id)}
                disabled={!isPlayerTurn || !canUse}
                variant={isSelected ? 'primary' : 'outline'}
                size="lg"
                className={`h-20 flex-col gap-1 ${!canUse && 'opacity-50'}`}
                leftIcon={
                  ability.id === 'attack' ? <Sword className="h-5 w-5" /> :
                  ability.id === 'defend' ? <Shield className="h-5 w-5" /> :
                  <Zap className="h-5 w-5" />
                }
              >
                <span className="font-semibold">{ability.name}</span>
                <span className="text-xs text-game-muted">
                  {ability.manaCost > 0 ? `${ability.manaCost} MP` : 'Free'}
                </span>
              </Button>
            );
          })}
        </div>

        {/* Action Description */}
        {selectedAction && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 bg-game-bg/50 rounded-lg"
          >
            <p className="text-game-muted text-sm text-center">
              {abilities.find(a => a.id === selectedAction)?.description}
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Victory Modal */}
      <AnimatePresence>
        {showVictoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="bg-game-surface border border-game-border rounded-xl p-8 max-w-md w-full mx-4"
            >
              <div className="text-center space-y-6">
                <Trophy className="h-16 w-16 text-yellow-500 mx-auto" />
                
                <div>
                  <h2 className="text-2xl font-bold text-game-text font-gaming">
                    Victory!
                  </h2>
                  <p className="text-game-muted mt-2">
                    You have won the battle and earned the bet!
                  </p>
                </div>

                {/* Rewards */}
                <div className="bg-game-bg/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-game-muted">Bet Amount:</span>
                    <span className="text-game-text font-bold">◎{currentMatch.betAmount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-game-muted">Platform Fee (5%):</span>
                    <span className="text-game-text">◎{(currentMatch.betAmount * 0.05).toFixed(4)}</span>
                  </div>
                  <div className="border-t border-game-border pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-game-text font-semibold">Total Earned:</span>
                      <span className="text-green-400 font-bold">
                        ◎{(currentMatch.betAmount * 1.95).toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowVictoryModal(false)}
                    variant="outline"
                    fullWidth
                  >
                    View Details
                  </Button>
                  <Button
                    onClick={() => window.location.reload()}
                    variant="primary"
                    fullWidth
                  >
                    Return to Lobby
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BattleArena;