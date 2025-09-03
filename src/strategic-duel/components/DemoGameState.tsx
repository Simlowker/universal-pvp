import React, { createContext, useContext, useState, useEffect } from 'react';
import { DuelState, Player, GameConfig } from '../types/DuelTypes';

const DemoGameContext = createContext<{
  demoState: DuelState | null;
  updateDemoState: (updates: Partial<DuelState>) => void;
} | null>(null);

export const useDemoGameState = () => {
  const context = useContext(DemoGameContext);
  if (!context) {
    throw new Error('useDemoGameState must be used within DemoGameProvider');
  }
  return context;
};

// Create a demo game state for testing when no wallet is connected
export const createDemoGameState = (gameId: string, playerId: string): DuelState => {
  const player: Player = {
    id: playerId,
    address: 'demo-address',
    name: 'You',
    avatar: 'https://via.placeholder.com/60/4CAF50/ffffff?text=P',
    chips: 1000,
    position: 'player',
    isConnected: true,
  };

  const opponent: Player = {
    id: 'opponent-1',
    address: 'opponent-address',
    name: 'AI Opponent',
    avatar: 'https://via.placeholder.com/60/f44336/ffffff?text=AI',
    chips: 1000,
    position: 'opponent',
    isConnected: true,
  };

  return {
    gameId,
    players: [player, opponent],
    currentRound: {
      id: 'round-1',
      roundNumber: 1,
      pot: 0,
      currentBet: 0,
      playerCards: ['A♠', 'K♠'],
      opponentCards: ['?', '?'],
      communityCards: [],
      phase: 'preflop',
      actions: [],
    },
    roundHistory: [],
    currentPlayer: playerId,
    gameStatus: 'active',
    timeLeft: 30000,
    maxThinkTime: 30000,
    psychProfiles: {
      'opponent-1': {
        playerId: 'opponent-1',
        aggression: 65,
        bluffFrequency: 45,
        foldTendency: 30,
        averageThinkTime: 4500,
        tells: [
          {
            pattern: 'quick-action',
            strength: 75,
            frequency: 8,
            description: 'Fast decisions when bluffing',
            lastSeen: Date.now() - 5000,
          },
          {
            pattern: 'long-think',
            strength: 60,
            frequency: 3,
            description: 'Takes time with strong hands',
          },
        ],
        confidence: 80,
      },
    },
    animations: [],
  };
};

interface DemoGameProviderProps {
  children: React.ReactNode;
}

export const DemoGameProvider: React.FC<DemoGameProviderProps> = ({ children }) => {
  const [demoState, setDemoState] = useState<DuelState | null>(null);

  const updateDemoState = (updates: Partial<DuelState>) => {
    setDemoState(prev => prev ? { ...prev, ...updates } : null);
  };

  return (
    <DemoGameContext.Provider value={{ demoState, updateDemoState }}>
      {children}
    </DemoGameContext.Provider>
  );
};

// Enhanced DuelArena wrapper that provides demo data
export const DemoEnhancedDuelArena: React.FC<{
  gameId: string;
  playerId: string;
  config: GameConfig;
  DuelArenaComponent: React.ComponentType<{
    gameId: string;
    playerId: string;
    config: GameConfig;
  }>;
}> = ({ gameId, playerId, config, DuelArenaComponent }) => {
  const [demoState, setDemoState] = useState<DuelState>(() => 
    createDemoGameState(gameId, playerId)
  );

  // Simulate opponent actions periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (demoState.currentPlayer !== playerId) {
        // Simulate AI opponent action
        const actions = ['call', 'raise', 'fold'];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        
        setDemoState(prev => {
          const newRound = { ...prev.currentRound };
          newRound.actions.push({
            type: randomAction as any,
            amount: randomAction === 'raise' ? 50 : randomAction === 'call' ? prev.currentRound.currentBet : undefined,
            timestamp: Date.now(),
            playerId: 'opponent-1',
          });
          
          if (randomAction === 'raise') {
            newRound.pot += 50;
            newRound.currentBet = 50;
          } else if (randomAction === 'call') {
            newRound.pot += prev.currentRound.currentBet;
          }
          
          return {
            ...prev,
            currentRound: newRound,
            currentPlayer: playerId, // Switch back to player
          };
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [demoState.currentPlayer, playerId]);

  return <DuelArenaComponent gameId={gameId} playerId={playerId} config={config} />;
};