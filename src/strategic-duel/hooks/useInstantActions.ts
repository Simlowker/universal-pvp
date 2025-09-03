/**
 * useInstantActions - React hook for instant 10-50ms gameplay
 * Provides seamless integration with MagicBlock Ephemeral Rollups
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PublicKey, Keypair } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import MagicBlockService, { GameAction, GameState, PsychologicalProfile } from '../services/MagicBlockService';
import EphemeralRollupManager from '../services/EphemeralRollupManager';
import { useConnection } from '@solana/wallet-adapter-react';

export interface UseInstantActionsConfig {
  gameProgram: PublicKey;
  ephemeralRollupEndpoint: string;
  performanceThresholds: {
    actionLatency: number; // Max latency for actions (ms)
    stateSync: number;     // Max latency for state sync (ms)
    uiResponse: number;    // Max latency for UI updates (ms)
  };
  optimizations: {
    enableBatching: boolean;
    enablePredictiveSync: boolean;
    enableLatencyCompensation: boolean;
    enablePsychologicalProfiling: boolean;
  };
}

export interface ActionResult {
  success: boolean;
  signature?: string;
  executionTime: number;
  error?: string;
  optimisticState?: GameState;
}

export interface SessionInfo {
  sessionKey: Keypair | null;
  delegationPda: PublicKey | null;
  isActive: boolean;
  expiresAt: number;
  performance: {
    avgLatency: number;
    successRate: number;
    actionsExecuted: number;
  };
}

export interface PsychProfileUpdate {
  playerId: string;
  profile: PsychologicalProfile;
  confidence: number;
  lastUpdated: number;
}

const DEFAULT_CONFIG: UseInstantActionsConfig = {
  gameProgram: new PublicKey('11111111111111111111111111111111'),
  ephemeralRollupEndpoint: 'https://ephemeral-rollup-devnet.magicblock.app',
  performanceThresholds: {
    actionLatency: 50,
    stateSync: 25,
    uiResponse: 16 // 60 FPS target
  },
  optimizations: {
    enableBatching: true,
    enablePredictiveSync: true,
    enableLatencyCompensation: true,
    enablePsychologicalProfiling: true
  }
};

export function useInstantActions(
  gameStateAccount: PublicKey | null,
  config: Partial<UseInstantActionsConfig> = {}
) {
  const { connection } = useConnection();
  const { publicKey: walletPubkey, signTransaction } = useWallet();
  
  const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // State management
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    sessionKey: null,
    delegationPda: null,
    isActive: false,
    expiresAt: 0,
    performance: { avgLatency: 0, successRate: 100, actionsExecuted: 0 }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [psychProfiles, setPsychProfiles] = useState<Map<string, PsychProfileUpdate>>(new Map());
  
  // Performance tracking
  const [performanceMetrics, setPerformanceMetrics] = useState({
    averageActionLatency: 0,
    peakLatency: 0,
    minLatency: Infinity,
    totalActions: 0,
    failedActions: 0,
    uiUpdateLatency: 0
  });
  
  // Service instances (memoized for performance)
  const services = useMemo(() => {
    if (!connection) return null;
    
    const magicBlockService = new MagicBlockService(
      connection,
      finalConfig.gameProgram,
      finalConfig.ephemeralRollupEndpoint
    );
    
    const erManager = new EphemeralRollupManager(
      magicBlockService['boltSDK'], // Access private property for now
      connection,
      finalConfig.gameProgram
    );
    
    return { magicBlockService, erManager };
  }, [connection, finalConfig]);
  
  // Refs for optimistic updates and cleanup
  const subscriptionRef = useRef<number | null>(null);
  const actionQueueRef = useRef<GameAction[]>([]);
  const optimisticStateRef = useRef<GameState | null>(null);
  const psychProfileCacheRef = useRef<Map<string, number>>(new Map());
  const performanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Initialize session with gasless transactions
   */
  const initializeSession = useCallback(async (): Promise<boolean> => {
    if (!walletPubkey || !services) {
      setError('Wallet not connected or services not available');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sessionResult = await services.magicBlockService.initializeSession(
        walletPubkey,
        3600 // 1 hour session
      );

      setSessionInfo({
        sessionKey: sessionResult.sessionKey,
        delegationPda: sessionResult.delegationPda,
        isActive: true,
        expiresAt: sessionResult.expiresAt,
        performance: { avgLatency: 0, successRate: 100, actionsExecuted: 0 }
      });

      // Start performance monitoring
      startPerformanceMonitoring();

      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize session';
      setError(errorMessage);
      console.error('Session initialization failed:', error);
      return false;

    } finally {
      setIsLoading(false);
    }
  }, [walletPubkey, services]);

  /**
   * Execute instant game action with 10-50ms target latency
   */
  const executeAction = useCallback(async (
    actionType: 'CHECK' | 'RAISE' | 'CALL' | 'FOLD' | 'STRATEGIC_FOLD',
    amount?: number
  ): Promise<ActionResult> => {
    const actionStartTime = performance.now();

    if (!sessionInfo.isActive || !sessionInfo.sessionKey || !gameStateAccount || !services) {
      return {
        success: false,
        executionTime: 0,
        error: 'Session not active or required data missing'
      };
    }

    try {
      // Create optimistic state for immediate UI feedback
      const optimisticState = createOptimisticState(actionType, amount);
      optimisticStateRef.current = optimisticState;
      
      if (finalConfig.optimizations.enableLatencyCompensation) {
        // Update UI immediately with optimistic state
        const uiUpdateStart = performance.now();
        setGameState(optimisticState);
        const uiUpdateTime = performance.now() - uiUpdateStart;
        updatePerformanceMetrics('uiUpdate', uiUpdateTime);
      }

      // Build action object
      const action: GameAction = {
        type: actionType,
        amount,
        timestamp: Date.now(),
        sessionId: gameStateAccount.toString(),
        playerId: walletPubkey?.toString() || ''
      };

      // Execute action on Ephemeral Rollup
      let result;
      if (actionType === 'STRATEGIC_FOLD') {
        result = await services.magicBlockService.executeStrategicFold(
          sessionInfo.sessionKey,
          gameStateAccount,
          action.playerId
        );
      } else {
        result = await services.magicBlockService.executeAction(
          action,
          sessionInfo.sessionKey,
          gameStateAccount
        );
      }

      const executionTime = performance.now() - actionStartTime;
      
      // Update psychological profile if enabled
      if (finalConfig.optimizations.enablePsychologicalProfiling) {
        updatePsychologicalProfile(action);
      }

      // Update performance metrics
      updatePerformanceMetrics('action', executionTime);
      updateSessionPerformance(executionTime, true);

      // Update actual state (may override optimistic state)
      setGameState(result.newState);
      optimisticStateRef.current = null;

      // Performance warning
      if (executionTime > finalConfig.performanceThresholds.actionLatency) {
        console.warn(`Action ${actionType} exceeded latency threshold: ${executionTime}ms`);
      }

      return {
        success: true,
        signature: result.signature,
        executionTime,
        optimisticState
      };

    } catch (error) {
      const executionTime = performance.now() - actionStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Action execution failed';
      
      // Revert optimistic state on error
      if (optimisticStateRef.current) {
        if (gameState) setGameState(gameState);
        optimisticStateRef.current = null;
      }

      updatePerformanceMetrics('action', executionTime);
      updateSessionPerformance(executionTime, false);

      console.error(`Action ${actionType} failed:`, error);
      
      return {
        success: false,
        executionTime,
        error: errorMessage
      };
    }
  }, [sessionInfo, gameStateAccount, services, gameState, walletPubkey, finalConfig]);

  /**
   * Batch multiple actions for optimal performance
   */
  const executeBatchActions = useCallback(async (
    actions: Array<{ type: GameAction['type']; amount?: number }>
  ): Promise<ActionResult[]> => {
    if (!sessionInfo.isActive || !sessionInfo.sessionKey || !gameStateAccount || !services) {
      return actions.map(() => ({
        success: false,
        executionTime: 0,
        error: 'Session not active'
      }));
    }

    try {
      // Convert to GameAction objects
      const gameActions: GameAction[] = actions.map(action => ({
        type: action.type,
        amount: action.amount,
        timestamp: Date.now(),
        sessionId: gameStateAccount.toString(),
        playerId: walletPubkey?.toString() || ''
      }));

      // Queue actions if batching is enabled
      if (finalConfig.optimizations.enableBatching) {
        actionQueueRef.current.push(...gameActions);
        
        // Process queue if it reaches optimal size or timeout
        setTimeout(() => processBatchQueue(), 10); // 10ms batch window
      }

      // Execute actions individually for now (can be optimized with actual batching)
      const results: ActionResult[] = [];
      for (const action of gameActions) {
        const result = await executeAction(action.type, action.amount);
        results.push(result);
      }

      return results;

    } catch (error) {
      console.error('Batch action execution failed:', error);
      return actions.map(() => ({
        success: false,
        executionTime: 0,
        error: 'Batch execution failed'
      }));
    }
  }, [executeAction, sessionInfo, gameStateAccount, services, walletPubkey, finalConfig]);

  /**
   * Get psychological profile for player
   */
  const getPlayerPsychProfile = useCallback((playerId: string): PsychProfileUpdate | null => {
    return psychProfiles.get(playerId) || null;
  }, [psychProfiles]);

  /**
   * Subscribe to real-time game updates
   */
  const subscribeToUpdates = useCallback(async (): Promise<boolean> => {
    if (!gameStateAccount || !services) return false;

    try {
      const subscriptionId = await services.magicBlockService.subscribeToGameUpdates(
        gameStateAccount,
        (newState: GameState) => {
          const syncStartTime = performance.now();
          
          // Don't override optimistic state unless it's confirmed
          if (!optimisticStateRef.current) {
            setGameState(newState);
          }
          
          const syncTime = performance.now() - syncStartTime;
          updatePerformanceMetrics('stateSync', syncTime);
          
          if (syncTime > finalConfig.performanceThresholds.stateSync) {
            console.warn(`State sync exceeded threshold: ${syncTime}ms`);
          }
        }
      );

      subscriptionRef.current = subscriptionId;
      return true;

    } catch (error) {
      console.error('Failed to subscribe to updates:', error);
      return false;
    }
  }, [gameStateAccount, services, finalConfig]);

  /**
   * Unsubscribe from updates
   */
  const unsubscribeFromUpdates = useCallback(() => {
    if (subscriptionRef.current && services) {
      // Unsubscribe logic would go here
      subscriptionRef.current = null;
    }
  }, [services]);

  // Helper functions

  const createOptimisticState = useCallback((
    actionType: GameAction['type'],
    amount?: number
  ): GameState | null => {
    if (!gameState || !walletPubkey) return null;

    const optimisticState = { ...gameState };
    const playerIndex = optimisticState.players.findIndex(p => p.id === walletPubkey.toString());
    
    if (playerIndex === -1) return optimisticState;

    const player = { ...optimisticState.players[playerIndex] };
    
    switch (actionType) {
      case 'RAISE':
        if (amount) {
          player.currentBet += amount;
          player.balance -= amount;
          optimisticState.pot += amount;
          optimisticState.currentBet = Math.max(optimisticState.currentBet, player.currentBet);
        }
        break;
      case 'CALL':
        const callAmount = optimisticState.currentBet - player.currentBet;
        player.currentBet = optimisticState.currentBet;
        player.balance -= callAmount;
        optimisticState.pot += callAmount;
        break;
      case 'FOLD':
      case 'STRATEGIC_FOLD':
        player.isFolded = true;
        player.isStrategicFold = actionType === 'STRATEGIC_FOLD';
        if (actionType === 'STRATEGIC_FOLD') {
          // 50% refund
          const refund = Math.floor(player.currentBet * 0.5);
          player.balance += refund;
          optimisticState.pot -= refund;
        }
        break;
      case 'CHECK':
        // No state changes for check
        break;
    }
    
    player.hasActed = true;
    optimisticState.players[playerIndex] = player;
    
    return optimisticState;
  }, [gameState, walletPubkey]);

  const updatePsychologicalProfile = useCallback((action: GameAction): void => {
    const playerId = action.playerId;
    const lastUpdate = psychProfileCacheRef.current.get(playerId) || 0;
    
    // Update at most once per second per player
    if (Date.now() - lastUpdate < 1000) return;
    
    // Mock action history for profiling (in real implementation, maintain history)
    const mockHistory: GameAction[] = [action];
    
    if (services) {
      const profile = services.magicBlockService.analyzePlayerPsychology(playerId, mockHistory);
      
      setPsychProfiles(prev => new Map(prev.set(playerId, {
        playerId,
        profile,
        confidence: Math.min(100, mockHistory.length * 10), // Confidence increases with more data
        lastUpdated: Date.now()
      })));
      
      psychProfileCacheRef.current.set(playerId, Date.now());
    }
  }, [services]);

  const updatePerformanceMetrics = useCallback((
    operation: 'action' | 'stateSync' | 'uiUpdate',
    latency: number
  ): void => {
    setPerformanceMetrics(prev => {
      const newMetrics = { ...prev };
      
      if (operation === 'action') {
        newMetrics.totalActions++;
        newMetrics.averageActionLatency = 
          (prev.averageActionLatency * (prev.totalActions - 1) + latency) / prev.totalActions;
        newMetrics.peakLatency = Math.max(prev.peakLatency, latency);
        newMetrics.minLatency = Math.min(prev.minLatency, latency);
      } else if (operation === 'uiUpdate') {
        newMetrics.uiUpdateLatency = latency;
      }
      
      return newMetrics;
    });
  }, []);

  const updateSessionPerformance = useCallback((latency: number, success: boolean): void => {
    setSessionInfo(prev => {
      const newPerf = { ...prev.performance };
      const totalActions = newPerf.actionsExecuted + 1;
      
      newPerf.avgLatency = (newPerf.avgLatency * newPerf.actionsExecuted + latency) / totalActions;
      newPerf.successRate = success ? 
        (newPerf.successRate * newPerf.actionsExecuted + 100) / totalActions :
        (newPerf.successRate * newPerf.actionsExecuted) / totalActions;
      newPerf.actionsExecuted = totalActions;
      
      return { ...prev, performance: newPerf };
    });
  }, []);

  const startPerformanceMonitoring = useCallback((): void => {
    performanceTimerRef.current = setInterval(() => {
      if (services) {
        const metrics = services.magicBlockService.getPerformanceMetrics();
        // Update component metrics based on service metrics
      }
    }, 5000); // Update every 5 seconds
  }, [services]);

  const processBatchQueue = useCallback((): void => {
    if (actionQueueRef.current.length === 0) return;
    
    // Process queued actions in batch
    // This is a placeholder for actual batch processing
    actionQueueRef.current = [];
  }, []);

  // Effects

  // Initialize services and subscribe to updates
  useEffect(() => {
    if (gameStateAccount && services) {
      subscribeToUpdates();
    }
    
    return () => {
      unsubscribeFromUpdates();
    };
  }, [gameStateAccount, services, subscribeToUpdates, unsubscribeFromUpdates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (performanceTimerRef.current) {
        clearInterval(performanceTimerRef.current);
      }
      unsubscribeFromUpdates();
    };
  }, [unsubscribeFromUpdates]);

  // Auto-initialize session when wallet connects
  useEffect(() => {
    if (walletPubkey && services && !sessionInfo.isActive) {
      initializeSession();
    }
  }, [walletPubkey, services, sessionInfo.isActive, initializeSession]);

  return {
    // State
    gameState,
    sessionInfo,
    isLoading,
    error,
    performanceMetrics,
    
    // Actions
    initializeSession,
    executeAction,
    executeBatchActions,
    
    // Utils
    getPlayerPsychProfile,
    subscribeToUpdates,
    unsubscribeFromUpdates,
    
    // Computed values
    isSessionActive: sessionInfo.isActive && Date.now() < sessionInfo.expiresAt,
    averageLatency: performanceMetrics.averageActionLatency,
    isPerformant: performanceMetrics.averageActionLatency <= finalConfig.performanceThresholds.actionLatency
  };
}

export default useInstantActions;