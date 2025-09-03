'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Sword, Heart, Zap, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useGame } from '../../contexts/GameContext';
import { useWalletContext } from '../../contexts/WalletContext';
import { useGameSounds } from '../../hooks/useSound';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import Button from '../../components/ui/Button';
import { GameTable } from '../../components/game/GameTable';
import { OddsMeter } from '../../components/game/OddsMeter';
import { ActionPad } from '../../components/game/ActionPad';
import { PlayerStats } from '../../components/game/PlayerStats';

export default function GamePage() {
  const router = useRouter();
  const { currentMatch, gameActions, performAction, leaveMatch } = useGame();
  const { wallet } = useWalletContext();
  const { playSound } = useGameSounds();
  const { gameEvents } = useRealTimeUpdates();
  
  const [selectedAction, setSelectedAction] = useState<'check' | 'raise' | 'fold' | null>(null);
  const [raiseAmount, setRaiseAmount] = useState(0.01);
  const [isActionPending, setIsActionPending] = useState(false);
  const [optimisticGameState, setOptimisticGameState] = useState(currentMatch);

  // Update optimistic state when real game state changes
  useEffect(() => {
    if (currentMatch) {
      setOptimisticGameState(currentMatch);
    }
  }, [currentMatch]);

  // Redirect if no active match
  useEffect(() => {
    if (!currentMatch && !isActionPending) {
      router.push('/lobby');
    }
  }, [currentMatch, isActionPending, router]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.repeat) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handleAction('check');
          break;
        case 'KeyR':
          e.preventDefault();
          handleAction('raise');
          break;
        case 'KeyF':
          e.preventDefault();
          handleAction('fold');
          break;
        case 'ArrowUp':
          e.preventDefault();
          setRaiseAmount(prev => Math.min(prev + 0.01, currentMatch?.betAmount || 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setRaiseAmount(prev => Math.max(prev - 0.01, 0.01));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentMatch]);

  const handleAction = useCallback(async (action: 'check' | 'raise' | 'fold') => {
    if (!currentMatch || isActionPending) return;
    
    setIsActionPending(true);
    setSelectedAction(action);
    
    // Optimistic UI update
    const optimisticUpdate = { 
      ...currentMatch,
      lastAction: {
        player: wallet.publicKey?.toString() || '',
        action,
        amount: action === 'raise' ? raiseAmount : 0,
        timestamp: new Date()
      }
    };
    setOptimisticGameState(optimisticUpdate);
    
    try {
      // Play immediate sound feedback
      playSound(action === 'fold' ? 'error' : 'click');
      
      const actionData = action === 'raise' 
        ? { type: action, amount: raiseAmount }
        : { type: action };
        
      await performAction(actionData);
      
      // Success sound
      playSound('actionSuccess');
      
    } catch (error) {
      console.error('Action failed:', error);
      
      // Rollback optimistic update
      setOptimisticGameState(currentMatch);
      playSound('error');
      
      // Show error feedback
      // Could add toast notification here
      
    } finally {
      setIsActionPending(false);
      setSelectedAction(null);
    }
  }, [currentMatch, isActionPending, raiseAmount, wallet.publicKey, performAction, playSound]);

  const handleLeaveGame = async () => {
    if (!currentMatch) return;
    
    try {
      await leaveMatch(currentMatch.id);
      router.push('/lobby');
    } catch (error) {
      console.error('Failed to leave game:', error);
    }
  };

  if (!optimisticGameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900/20 via-gray-900 to-orange-900/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Connecting to game...</p>
        </div>
      </div>
    );
  }

  const isMyTurn = optimisticGameState.currentPlayer === wallet.publicKey?.toString();
  const opponent = optimisticGameState.players.find(p => p.id !== wallet.publicKey?.toString());
  const myPlayer = optimisticGameState.players.find(p => p.id === wallet.publicKey?.toString());

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900/20 via-gray-900 to-orange-900/20">
      {/* Game Header */}
      <div className="border-b border-gray-800 bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white font-gaming">
              Battle Arena
            </h1>
            <div className="flex items-center gap-2 text-yellow-400">
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">◎{optimisticGameState.betAmount}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              isMyTurn 
                ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
            }`}>
              {isMyTurn ? 'Your Turn' : 'Opponent\'s Turn'}
            </div>
            
            <Button
              onClick={handleLeaveGame}
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300"
            >
              Leave Game
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-8 h-[calc(100vh-200px)]">
          
          {/* Player Stats - Left Sidebar */}
          <div className="space-y-6">
            <PlayerStats 
              player={myPlayer}
              title="You"
              isCurrentPlayer={isMyTurn}
            />
            
            <PlayerStats 
              player={opponent}
              title="Opponent"
              isCurrentPlayer={!isMyTurn}
            />
          </div>

          {/* Main Game Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Game Table */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative"
            >
              <GameTable
                gameState={optimisticGameState}
                myPlayerId={wallet.publicKey?.toString() || ''}
                isActionPending={isActionPending}
                selectedAction={selectedAction}
              />
            </motion.div>

            {/* Action Pad */}
            <AnimatePresence>
              {isMyTurn && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <ActionPad
                    onAction={handleAction}
                    isActionPending={isActionPending}
                    selectedAction={selectedAction}
                    raiseAmount={raiseAmount}
                    onRaiseAmountChange={setRaiseAmount}
                    maxRaise={optimisticGameState.betAmount}
                    currentBet={optimisticGameState.currentBet || 0}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hotkeys Guide */}
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Hotkeys</h3>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300">SPACE</kbd>
                  <span className="text-gray-400">Check</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300">R</kbd>
                  <span className="text-gray-400">Raise</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="px-2 py-1 bg-gray-700 rounded text-gray-300">F</kbd>
                  <span className="text-gray-400">Fold</span>
                </div>
              </div>
            </div>
          </div>

          {/* Odds & Info - Right Sidebar */}
          <div className="space-y-6">
            
            {/* Odds Meter */}
            <OddsMeter
              playerOdds={optimisticGameState.playerOdds || 50}
              opponentOdds={optimisticGameState.opponentOdds || 50}
              potSize={optimisticGameState.potSize || optimisticGameState.betAmount * 2}
            />

            {/* Game Log */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Game Log</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {optimisticGameState.gameLog?.map((log, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-sm text-gray-400 border-l-2 border-gray-700 pl-3"
                  >
                    <span className="text-gray-500 text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <p>{log.message}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Latency</span>
                  <span className="text-green-400">47ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Actions/min</span>
                  <span className="text-blue-400">12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Uptime</span>
                  <span className="text-green-400">99.8%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isActionPending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <p className="text-white font-medium">Processing action...</p>
              <p className="text-gray-400 text-sm">Optimistic UI active</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}