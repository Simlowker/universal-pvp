'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Player, Character, GameMatch, CharacterClass, GameStats } from '../types/game';
import { useWalletContext } from './WalletContext';

interface GameState {
  player: Player | null;
  currentMatch: GameMatch | null;
  availableMatches: GameMatch[];
  characterClasses: CharacterClass[];
  selectedCharacter: Character | null;
  gameStats: GameStats;
  isInGame: boolean;
  isLoading: boolean;
  error: string | null;
}

type GameAction =
  | { type: 'SET_PLAYER'; payload: Player }
  | { type: 'SET_CURRENT_MATCH'; payload: GameMatch | null }
  | { type: 'SET_AVAILABLE_MATCHES'; payload: GameMatch[] }
  | { type: 'SET_CHARACTER_CLASSES'; payload: CharacterClass[] }
  | { type: 'SET_SELECTED_CHARACTER'; payload: Character }
  | { type: 'SET_GAME_STATS'; payload: GameStats }
  | { type: 'SET_IS_IN_GAME'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_GAME' };

const initialState: GameState = {
  player: null,
  currentMatch: null,
  availableMatches: [],
  characterClasses: [],
  selectedCharacter: null,
  gameStats: {
    totalMatches: 0,
    activeMatches: 0,
    totalPlayersOnline: 0,
    totalVolume: 0,
  },
  isInGame: false,
  isLoading: false,
  error: null,
};

const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'SET_PLAYER':
      return { ...state, player: action.payload };
    case 'SET_CURRENT_MATCH':
      return { ...state, currentMatch: action.payload };
    case 'SET_AVAILABLE_MATCHES':
      return { ...state, availableMatches: action.payload };
    case 'SET_CHARACTER_CLASSES':
      return { ...state, characterClasses: action.payload };
    case 'SET_SELECTED_CHARACTER':
      return { ...state, selectedCharacter: action.payload };
    case 'SET_GAME_STATS':
      return { ...state, gameStats: action.payload };
    case 'SET_IS_IN_GAME':
      return { ...state, isInGame: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'RESET_GAME':
      return { ...initialState, characterClasses: state.characterClasses };
    default:
      return state;
  }
};

interface GameContextType extends GameState {
  // Actions
  initializePlayer: () => Promise<void>;
  selectCharacter: (character: Character) => void;
  joinMatch: (matchId: string) => Promise<void>;
  createMatch: (betAmount: number) => Promise<void>;
  leaveMatch: () => Promise<void>;
  refreshMatches: () => Promise<void>;
  refreshGameStats: () => Promise<void>;
  performAction: (action: any) => Promise<void>;
  gameActions?: any[];
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

interface GameProviderProps {
  children: React.ReactNode;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const { wallet } = useWalletContext();

  // Mock character classes data
  const mockCharacterClasses: CharacterClass[] = [
    {
      id: 'warrior',
      name: 'Warrior',
      description: 'A strong melee fighter with high health and attack power',
      baseStats: {
        health: 100,
        mana: 30,
        attack: 25,
        defense: 20,
        speed: 15,
      },
      abilities: ['sword-slash', 'shield-bash', 'berserker-rage'],
      image: '/images/classes/warrior.png',
    },
    {
      id: 'mage',
      name: 'Mage',
      description: 'A powerful spellcaster with high mana and magical abilities',
      baseStats: {
        health: 70,
        mana: 50,
        attack: 30,
        defense: 10,
        speed: 20,
      },
      abilities: ['fireball', 'ice-shard', 'lightning-bolt'],
      image: '/images/classes/mage.png',
    },
    {
      id: 'rogue',
      name: 'Rogue',
      description: 'A fast and agile fighter with high speed and critical strikes',
      baseStats: {
        health: 80,
        mana: 40,
        attack: 20,
        defense: 15,
        speed: 30,
      },
      abilities: ['backstab', 'poison-dart', 'shadow-step'],
      image: '/images/classes/rogue.png',
    },
  ];

  // Initialize player when wallet connects
  const initializePlayer = async () => {
    if (!wallet.connected || !wallet.publicKey) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // In production, this would fetch from your backend API
      const player: Player = {
        id: wallet.publicKey,
        walletAddress: wallet.publicKey,
        username: `Player_${wallet.publicKey.slice(0, 8)}`,
        level: 1,
        wins: 0,
        losses: 0,
        rating: 1000,
      };

      dispatch({ type: 'SET_PLAYER', payload: player });
    } catch (error) {
      console.error('Error initializing player:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to initialize player' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Select character
  const selectCharacter = (character: Character) => {
    dispatch({ type: 'SET_SELECTED_CHARACTER', payload: character });
  };

  // Join existing match
  const joinMatch = async (matchId: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // In production, this would call your game backend
      const match = state.availableMatches.find(m => m.id === matchId);
      if (match && state.player) {
        const updatedMatch: GameMatch = {
          ...match,
          player2: state.player,
          status: 'active',
        };
        dispatch({ type: 'SET_CURRENT_MATCH', payload: updatedMatch });
        dispatch({ type: 'SET_IS_IN_GAME', payload: true });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to join match' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Create new match
  const createMatch = async (betAmount: number) => {
    if (!state.player) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      // In production, this would create match on blockchain/backend
      const newMatch: GameMatch = {
        id: `match_${Date.now()}`,
        player1: state.player,
        player2: null as any,
        status: 'waiting',
        betAmount,
        turns: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      dispatch({ type: 'SET_CURRENT_MATCH', payload: newMatch });
      dispatch({ type: 'SET_IS_IN_GAME', payload: true });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to create match' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // Leave current match
  const leaveMatch = async () => {
    dispatch({ type: 'SET_CURRENT_MATCH', payload: null });
    dispatch({ type: 'SET_IS_IN_GAME', payload: false });
  };

  // Refresh available matches
  const refreshMatches = async () => {
    try {
      // In production, fetch from backend
      const mockMatches: GameMatch[] = [
        {
          id: 'match_1',
          player1: {
            id: 'player_1',
            walletAddress: '11111111111111111111111111111111',
            username: 'Player1',
            level: 5,
            wins: 12,
            losses: 3,
            rating: 1200,
          },
          player2: null as any,
          status: 'waiting',
          betAmount: 0.1,
          turns: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      dispatch({ type: 'SET_AVAILABLE_MATCHES', payload: mockMatches });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to refresh matches' });
    }
  };

  // Refresh game statistics
  const refreshGameStats = async () => {
    try {
      // In production, fetch from backend
      const stats: GameStats = {
        totalMatches: 1547,
        activeMatches: 23,
        totalPlayersOnline: 156,
        totalVolume: 45.7,
      };

      dispatch({ type: 'SET_GAME_STATS', payload: stats });
    } catch (error) {
      console.error('Error refreshing game stats:', error);
    }
  };

  // Load character classes on mount
  useEffect(() => {
    dispatch({ type: 'SET_CHARACTER_CLASSES', payload: mockCharacterClasses });
    refreshGameStats();
  }, []);

  // Initialize player when wallet connects
  useEffect(() => {
    if (wallet.connected) {
      initializePlayer();
    } else {
      dispatch({ type: 'RESET_GAME' });
    }
  }, [wallet.connected]);

  // Placeholder performAction function
  const performAction = async (action: any) => {
    console.log('Performing action:', action);
    // TODO: Implement action logic
  };

  const value: GameContextType = {
    ...state,
    initializePlayer,
    selectCharacter,
    joinMatch,
    createMatch,
    leaveMatch,
    refreshMatches,
    refreshGameStats,
    performAction,
    gameActions: [],
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};