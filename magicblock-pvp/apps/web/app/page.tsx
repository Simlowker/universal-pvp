'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';
import { useWalletContext } from '../contexts/WalletContext';
import Header from '../components/layout/Header';
import GameLobby from '../components/game/GameLobby';
import CharacterSelection from '../components/game/CharacterSelection';
import BattleArena from '../components/game/BattleArena';
import NFTInventory from '../components/wallet/NFTInventory';
import Button from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/LoadingSpinner';
import { Package } from 'lucide-react';

export default function Home() {
  const { currentMatch, selectedCharacter, isInGame, isLoading } = useGame();
  const { wallet } = useWalletContext();
  const [showNFTInventory, setShowNFTInventory] = useState(false);
  const [gamePhase, setGamePhase] = useState<'lobby' | 'character-select' | 'battle'>('lobby');

  // Redirect to lobby page for main experience
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = '/lobby';
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Handle character selection completion
  const handleCharacterSelected = () => {
    setGamePhase('battle');
  };

  // Determine what to render based on game state
  const renderGameContent = () => {
    if (isLoading) {
      return <LoadingScreen message="Loading game data..." />;
    }

    if (isInGame && currentMatch) {
      if (gamePhase === 'character-select' || !selectedCharacter) {
        return <CharacterSelection onCharacterSelected={handleCharacterSelected} />;
      }
      
      if (gamePhase === 'battle' && selectedCharacter) {
        return <BattleArena />;
      }
    }

    return <GameLobby />;
  };

  return (
    <div className="min-h-screen bg-game-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Game Content */}
          {renderGameContent()}

          {/* NFT Inventory Button */}
          {wallet.connected && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="fixed bottom-6 right-6 z-30"
            >
              <Button
                onClick={() => setShowNFTInventory(true)}
                variant="primary"
                size="lg"
                leftIcon={<Package className="h-5 w-5" />}
                className="rounded-full shadow-2xl"
                glowing
              >
                Inventory
              </Button>
            </motion.div>
          )}
        </motion.div>
      </main>

      {/* NFT Inventory Modal */}
      <NFTInventory
        isOpen={showNFTInventory}
        onClose={() => setShowNFTInventory(false)}
      />

      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        {/* Animated background particles */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-primary-500/20 rounded-full"
              animate={{
                y: [-20, -1000],
                x: [0, Math.sin(i) * 100],
              }}
              transition={{
                duration: 10 + i,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 0.5,
              }}
              style={{
                left: `${Math.random() * 100}%`,
                top: '100%',
              }}
            />
          ))}
        </div>

        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-game-bg/50" />
      </div>
    </div>
  );
}