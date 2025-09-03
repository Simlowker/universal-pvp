'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sword, Shield, Zap, Heart, Mana, Speed, ArrowRight, Star } from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import { useGameSounds } from '../../hooks/useSound';
import { Character, CharacterClass } from '../../types/game';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

interface CharacterSelectionProps {
  onCharacterSelected: (character: Character) => void;
}

const CharacterSelection: React.FC<CharacterSelectionProps> = ({
  onCharacterSelected,
}) => {
  const { characterClasses, selectedCharacter, selectCharacter } = useGame();
  const { playSound } = useGameSounds();
  const [hoveredClass, setHoveredClass] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleClassSelect = (characterClass: CharacterClass) => {
    playSound('click');
    
    // Create character instance from class
    const character: Character = {
      id: `char_${Date.now()}`,
      name: `${characterClass.name} Warrior`,
      class: characterClass,
      level: 1,
      health: characterClass.baseStats.health,
      maxHealth: characterClass.baseStats.health,
      mana: characterClass.baseStats.mana,
      maxMana: characterClass.baseStats.mana,
      attack: characterClass.baseStats.attack,
      defense: characterClass.baseStats.defense,
      speed: characterClass.baseStats.speed,
      abilities: [],
      equipment: [],
    };

    selectCharacter(character);
    setShowConfirmModal(true);
  };

  const handleConfirmSelection = () => {
    if (selectedCharacter) {
      playSound('matchFound');
      onCharacterSelected(selectedCharacter);
      setShowConfirmModal(false);
    }
  };

  const getClassIcon = (className: string) => {
    switch (className.toLowerCase()) {
      case 'warrior':
        return Sword;
      case 'mage':
        return Zap;
      case 'rogue':
        return Shield;
      default:
        return Sword;
    }
  };

  const getStatIcon = (stat: string) => {
    switch (stat) {
      case 'health':
        return Heart;
      case 'mana':
        return Mana;
      case 'attack':
        return Sword;
      case 'defense':
        return Shield;
      case 'speed':
        return Speed;
      default:
        return Star;
    }
  };

  const getStatColor = (stat: string) => {
    switch (stat) {
      case 'health':
        return 'text-red-400';
      case 'mana':
        return 'text-blue-400';
      case 'attack':
        return 'text-orange-400';
      case 'defense':
        return 'text-green-400';
      case 'speed':
        return 'text-purple-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-4xl font-bold text-game-text font-gaming mb-2">
            Choose Your Champion
          </h1>
          <p className="text-game-muted">
            Select a character class to enter the battle arena
          </p>
        </motion.div>

        {/* Character Classes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {characterClasses.map((characterClass, index) => {
            const ClassIcon = getClassIcon(characterClass.name);
            const isHovered = hoveredClass === characterClass.id;

            return (
              <motion.div
                key={characterClass.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
                onMouseEnter={() => {
                  setHoveredClass(characterClass.id);
                  playSound('hover');
                }}
                onMouseLeave={() => setHoveredClass(null)}
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    bg-game-surface border-2 rounded-xl p-6 cursor-pointer transition-all duration-300
                    ${isHovered ? 'border-primary-500 shadow-2xl shadow-primary-500/20' : 'border-game-border'}
                  `}
                  onClick={() => handleClassSelect(characterClass)}
                >
                  {/* Character Image Placeholder */}
                  <div className="relative mb-6">
                    <div className="w-32 h-32 mx-auto bg-gradient-to-br from-game-accent/20 to-primary-500/20 rounded-full flex items-center justify-center">
                      <ClassIcon className={`h-16 w-16 ${getStatColor('attack')}`} />
                    </div>
                    
                    {/* Animated Ring */}
                    <AnimatePresence>
                      {isHovered && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1.2, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="absolute inset-0 border-2 border-primary-500 rounded-full"
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Class Info */}
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-game-text font-gaming mb-2">
                      {characterClass.name}
                    </h3>
                    <p className="text-game-muted text-sm leading-relaxed">
                      {characterClass.description}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="space-y-3">
                    {Object.entries(characterClass.baseStats).map(([stat, value]) => {
                      const StatIcon = getStatIcon(stat);
                      const maxValue = 50; // Assuming max stat value for visualization
                      const percentage = (value / maxValue) * 100;

                      return (
                        <div key={stat} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <StatIcon className={`h-4 w-4 ${getStatColor(stat)}`} />
                              <span className="text-game-text capitalize">{stat}</span>
                            </div>
                            <span className="text-game-text font-semibold">{value}</span>
                          </div>
                          
                          {/* Stat Bar */}
                          <div className="w-full bg-game-bg/50 rounded-full h-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: isHovered ? `${percentage}%` : '0%' }}
                              transition={{ delay: 0.1, duration: 0.8 }}
                              className={`h-2 rounded-full bg-gradient-to-r from-${getStatColor(stat).split('-')[1]}-600 to-${getStatColor(stat).split('-')[1]}-400`}
                              style={{
                                background: `linear-gradient(to right, ${
                                  stat === 'health' ? '#dc2626, #ef4444' :
                                  stat === 'mana' ? '#2563eb, #3b82f6' :
                                  stat === 'attack' ? '#ea580c, #f97316' :
                                  stat === 'defense' ? '#16a34a, #22c55e' :
                                  stat === 'speed' ? '#7c3aed, #8b5cf6' :
                                  '#6b7280, #9ca3af'
                                })`
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Select Button */}
                  <motion.div
                    className="mt-6"
                    whileHover={{ scale: 1.05 }}
                  >
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      rightIcon={<ArrowRight className="h-4 w-4" />}
                      glowing={isHovered}
                    >
                      Select {characterClass.name}
                    </Button>
                  </motion.div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center bg-game-surface/50 border border-game-border rounded-lg p-6"
        >
          <h3 className="text-lg font-semibold text-game-text font-gaming mb-2">
            Choose Wisely
          </h3>
          <p className="text-game-muted text-sm">
            Each character class has unique abilities and playstyles. 
            Your choice will determine your combat strategy and available skills.
          </p>
        </motion.div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Character Selection"
        size="md"
      >
        {selectedCharacter && (
          <div className="space-y-6">
            {/* Selected Character Info */}
            <div className="text-center">
              <div className="w-24 h-24 mx-auto bg-gradient-to-br from-game-accent/20 to-primary-500/20 rounded-full flex items-center justify-center mb-4">
                {React.createElement(getClassIcon(selectedCharacter.class.name), {
                  className: 'h-12 w-12 text-primary-400'
                })}
              </div>
              <h3 className="text-xl font-bold text-game-text font-gaming">
                {selectedCharacter.class.name}
              </h3>
              <p className="text-game-muted text-sm mt-1">
                {selectedCharacter.class.description}
              </p>
            </div>

            {/* Stats Summary */}
            <div className="bg-game-bg/50 rounded-lg p-4">
              <h4 className="font-semibold text-game-text mb-3">Base Stats</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(selectedCharacter.class.baseStats).map(([stat, value]) => {
                  const StatIcon = getStatIcon(stat);
                  return (
                    <div key={stat} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatIcon className={`h-3 w-3 ${getStatColor(stat)}`} />
                        <span className="text-game-muted capitalize">{stat}</span>
                      </div>
                      <span className="text-game-text font-semibold">{value}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => setShowConfirmModal(false)}
                variant="outline"
                fullWidth
              >
                Choose Different
              </Button>
              <Button
                onClick={handleConfirmSelection}
                variant="primary"
                fullWidth
                rightIcon={<ArrowRight className="h-4 w-4" />}
                glowing
              >
                Enter Battle
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default CharacterSelection;