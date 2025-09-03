import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { DuelState, DuelAction, GameConfig } from '../types/DuelTypes';
import { GameStateManager } from '../game/GameStateManager';

export interface DuelStateHook {
  state: DuelState;
  performAction: (action: Omit<DuelAction, 'timestamp' | 'playerId'>) => Promise<boolean>;
  isPlayerTurn: boolean;
  canPerformAction: (actionType: string) => boolean;
  getValidActions: () => string[];
  timeRemaining: number;
  isConnected: boolean;
  reconnect: () => void;
}

const initialState: DuelState = {
  gameId: '',
  players: [],
  currentRound: {
    id: '',
    roundNumber: 1,
    pot: 0,
    currentBet: 0,
    playerCards: [],
    opponentCards: [],
    communityCards: [],
    phase: 'preflop',
    actions: [],
  },
  roundHistory: [],
  currentPlayer: '',
  gameStatus: 'waiting',
  timeLeft: 30000,
  maxThinkTime: 30000,
  psychProfiles: {},
  animations: [],
};

export const useDuelState = (
  gameId: string,
  playerId: string,
  config: GameConfig
): DuelStateHook => {
  const [state, setState] = useState<DuelState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const gameManagerRef = useRef<GameStateManager | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize game state manager
  useEffect(() => {
    const initialGameState = {
      ...initialState,
      gameId,
      maxThinkTime: config.thinkTime,
    };

    gameManagerRef.current = new GameStateManager(initialGameState);
    
    const unsubscribe = gameManagerRef.current.subscribe((newState) => {
      setState(newState);
      setIsConnected(true);
    });

    return () => {
      unsubscribe();
      if (gameManagerRef.current) {
        gameManagerRef.current.destroy();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameId, playerId, config.thinkTime]);

  // Timer management
  useEffect(() => {
    if (state.gameStatus === 'active' && state.currentPlayer === playerId) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      timerRef.current = setInterval(() => {
        if (gameManagerRef.current) {
          const currentState = gameManagerRef.current.getState();
          if (currentState.timeLeft > 0) {
            // Timer is managed by GameStateManager
          } else {
            clearInterval(timerRef.current!);
          }
        }
      }, 100);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [state.gameStatus, state.currentPlayer, playerId]);

  // Perform game action
  const performAction = useCallback(async (
    actionData: Omit<DuelAction, 'timestamp' | 'playerId'>
  ): Promise<boolean> => {
    if (!gameManagerRef.current) return false;

    const action: DuelAction = {
      ...actionData,
      playerId,
      timestamp: Date.now(),
    };

    // Play sound effect
    if (config.soundEnabled) {
      gameManagerRef.current.playSound(action.type);
    }

    // Add visual feedback animation
    gameManagerRef.current.addAnimation({
      type: 'action-feedback',
      duration: 1000,
      data: { action: action.type, playerId },
    });

    return await gameManagerRef.current.performAction(action);
  }, [playerId, config.soundEnabled]);

  // Check if it's player's turn
  const isPlayerTurn = useMemo(() => {
    return state.currentPlayer === playerId && state.gameStatus === 'active';
  }, [state.currentPlayer, playerId, state.gameStatus]);

  // Validate if player can perform specific action
  const canPerformAction = useCallback((actionType: string): boolean => {
    if (!isPlayerTurn) return false;

    const player = state.players.find(p => p.id === playerId);
    if (!player) return false;

    const currentBet = state.currentRound.currentBet;
    const playerLastAction = state.currentRound.actions
      .filter(a => a.playerId === playerId)
      .pop();

    switch (actionType) {
      case 'check':
        // Can check if no current bet or already matched the bet
        return currentBet === 0 || (playerLastAction?.amount || 0) >= currentBet;
      
      case 'call':
        // Can call if there's a bet to match and player hasn't folded
        return currentBet > 0 && 
               (playerLastAction?.amount || 0) < currentBet &&
               playerLastAction?.type !== 'fold';
      
      case 'raise':
        // Can raise if player has enough chips
        const minRaise = currentBet * 2 || config.blinds.big;
        return player.chips >= minRaise && playerLastAction?.type !== 'fold';
      
      case 'fold':
        // Can always fold unless already folded
        return playerLastAction?.type !== 'fold';
      
      case 'bet':
        // Can bet if no current bet and haven't folded
        return currentBet === 0 && playerLastAction?.type !== 'fold';
      
      default:
        return false;
    }
  }, [isPlayerTurn, state.players, state.currentRound, playerId, config.blinds.big]);

  // Get all valid actions for current state
  const getValidActions = useCallback((): string[] => {
    const actions = ['fold']; // Can always fold
    
    if (canPerformAction('check')) actions.push('check');
    if (canPerformAction('call')) actions.push('call');
    if (canPerformAction('raise')) actions.push('raise');
    if (canPerformAction('bet')) actions.push('bet');
    
    return actions;
  }, [canPerformAction]);

  // Reconnection handler
  const reconnect = useCallback(() => {
    if (gameManagerRef.current) {
      gameManagerRef.current.destroy();
      gameManagerRef.current = new GameStateManager(state);
      
      const unsubscribe = gameManagerRef.current.subscribe((newState) => {
        setState(newState);
        setIsConnected(true);
      });

      return unsubscribe;
    }
  }, [state]);

  return {
    state,
    performAction,
    isPlayerTurn,
    canPerformAction,
    getValidActions,
    timeRemaining: state.timeLeft,
    isConnected,
    reconnect,
  };
};

// Custom hook for optimistic UI updates
export const useOptimisticAction = (performAction: (action: any) => Promise<boolean>) => {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const performOptimisticAction = useCallback(async (action: any) => {
    setPendingAction(action.type);
    
    try {
      const success = await performAction(action);
      if (!success) {
        // Handle rollback UI feedback
        console.warn('Action failed, rolling back UI state');
      }
    } finally {
      setPendingAction(null);
    }
  }, [performAction]);

  return {
    pendingAction,
    performOptimisticAction,
  };
};

// Hook for animation management
export const useAnimations = (animations: DuelState['animations']) => {
  const [activeAnimations, setActiveAnimations] = useState<string[]>([]);

  useEffect(() => {
    const now = Date.now();
    const active = animations
      .filter(anim => now - anim.startTime < anim.duration)
      .map(anim => anim.id);
    
    setActiveAnimations(active);
  }, [animations]);

  return activeAnimations;
};