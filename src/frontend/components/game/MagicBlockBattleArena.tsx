/**
 * MagicBlock Battle Arena - Real integration with MagicBlock SDK
 * Ultra-fast PvP battles with <30ms latency
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { motion } from 'framer-motion';
import { useMagicBlock } from '../../contexts/MagicBlockContext';
import { GameState, GameAction, PlayerState } from '../../../magicblock/game/rollup-game-engine';

interface BattleArenaProps {
  gameId: string;
  playerId: string;
  onActionExecuted?: (transition: any) => void;
  onGameComplete?: (winner: string) => void;
  onError?: (error: Error) => void;
}

export const MagicBlockBattleArena: React.FC<BattleArenaProps> = ({
  gameId,
  playerId,
  onActionExecuted,
  onGameComplete,
  onError
}) => {
  const { sdk, status, isInitializing } = useMagicBlock();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerSession, setPlayerSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLatencies, setActionLatencies] = useState<number[]>([]);

  /**
   * Initialize player session for the battle
   */
  const initializeSession = useCallback(async () => {
    if (!sdk || playerSession) return;
    
    try {
      const session = await sdk.sessionManager.createPvPSession(
        new PublicKey(playerId), // Convert string to PublicKey
        sdk.programs.bolt,
        new BN(10000000) // 0.01 SOL max bet
      );
      
      setPlayerSession(session.sessionKey.publicKey.toString());
      
    } catch (error) {
      console.error('Failed to initialize session:', error);
      onError?.(error as Error);
    }
  }, [sdk, playerId, playerSession, onError]);

  /**
   * Execute battle action with performance tracking
   */
  const executeBattleAction = useCallback(async (action: GameAction) => {
    if (!sdk || !gameState || !playerSession) return;
    
    setIsLoading(true);
    const startTime = performance.now();
    
    try {
      const transition = await sdk.gameEngine.executeGameAction(
        gameState.gameId,
        action,
        playerSession
      );
      
      const latency = performance.now() - startTime;
      setActionLatencies(prev => [...prev.slice(-9), latency]);
      
      if (transition.valid) {
        setGameState(transition.to);
        onActionExecuted?.(transition);
        
        // Check for game completion
        if (transition.to.winner) {
          onGameComplete?.(transition.to.winner);
        }
        
        console.log(`⚡ Battle action executed in ${latency.toFixed(1)}ms`);
      }
      
    } catch (error) {
      console.error('Battle action failed:', error);
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [sdk, gameState, playerSession, onActionExecuted, onGameComplete, onError]);

  /**
   * Quick battle actions
   */
  const placeBet = useCallback(async (amount: number) => {
    const action: GameAction = {
      actionId: `bet_${Date.now()}`,
      playerId,
      type: 'BET',
      amount: new BN(amount),
      timestamp: Date.now(),
      nonce: Date.now()
    };
    
    await executeBattleAction(action);
  }, [executeBattleAction, playerId]);

  const callBet = useCallback(async () => {
    const action: GameAction = {
      actionId: `call_${Date.now()}`,
      playerId,
      type: 'CALL',
      timestamp: Date.now(),
      nonce: Date.now()
    };
    
    await executeBattleAction(action);
  }, [executeBattleAction, playerId]);

  const foldHand = useCallback(async () => {
    const action: GameAction = {
      actionId: `fold_${Date.now()}`,
      playerId,
      type: 'FOLD',
      timestamp: Date.now(),
      nonce: Date.now()
    };
    
    await executeBattleAction(action);
  }, [executeBattleAction, playerId]);

  const executeStrategicFold = useCallback(async () => {
    if (!sdk || !gameState || !playerSession) return;
    
    setIsLoading(true);
    const startTime = performance.now();
    
    try {
      const result = await sdk.gameEngine.executeStrategicFold(
        gameState.gameId,
        playerId,
        playerSession
      );
      
      const latency = performance.now() - startTime;
      setActionLatencies(prev => [...prev.slice(-9), latency]);
      
      if (result.valid) {
        setGameState(result.to);
        console.log(`💰 Strategic fold executed in ${latency.toFixed(1)}ms, refund: ${result.newState.pot.toString()}`);
      }
      
    } catch (error) {
      console.error('Strategic fold failed:', error);
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [sdk, gameState, playerSession, playerId, onError]);

  /**
   * Load game state
   */
  useEffect(() => {
    if (!sdk) return;
    
    const loadGameState = async () => {
      try {
        const currentState = sdk.gameEngine.getGameState(gameId);
        if (currentState) {
          setGameState(currentState);
        }
      } catch (error) {
        console.error('Failed to load game state:', error);
      }
    };
    
    loadGameState();
    
    // Poll for state updates every 100ms for real-time updates
    const interval = setInterval(loadGameState, 100);
    return () => clearInterval(interval);
  }, [sdk, gameId]);

  /**
   * Initialize session on mount
   */
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  if (isInitializing || !sdk) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing MagicBlock SDK...</p>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-600">Loading battle arena...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.playerId === playerId);
  const avgLatency = actionLatencies.length > 0 
    ? actionLatencies.reduce((sum, lat) => sum + lat, 0) / actionLatencies.length 
    : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">
          ⚡ MagicBlock Battle Arena
        </h1>
        <div className="text-right">
          <div className="text-sm text-gray-400">
            Network: {status?.network}
            {status?.performanceGrade && (
              <span className="ml-2 px-2 py-1 rounded text-xs bg-blue-600 text-white">
                Grade {status.performanceGrade}
              </span>
            )}
          </div>
          {avgLatency > 0 && (
            <div className="text-sm text-green-400">
              Avg Latency: {avgLatency.toFixed(1)}ms
            </div>
          )}
        </div>
      </div>

      {/* Game State */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <motion.div 
          className="bg-gray-800 p-4 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="text-lg font-semibold text-white mb-3">Game Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Phase:</span>
              <span className="text-white font-medium">{gameState.currentPhase}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Pot:</span>
              <span className="text-green-400 font-medium">
                {(gameState.pot.toNumber() / 1e9).toFixed(3)} SOL
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Current Bet:</span>
              <span className="text-blue-400 font-medium">
                {(gameState.currentBet.toNumber() / 1e9).toFixed(3)} SOL
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Round:</span>
              <span className="text-white font-medium">{gameState.round}</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="bg-gray-800 p-4 rounded-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="text-lg font-semibold text-white mb-3">Your Status</h3>
          {currentPlayer && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Balance:</span>
                <span className="text-green-400 font-medium">
                  {(currentPlayer.balance.toNumber() / 1e9).toFixed(3)} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Current Bet:</span>
                <span className="text-blue-400 font-medium">
                  {(currentPlayer.currentBet.toNumber() / 1e9).toFixed(3)} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className="text-white font-medium">{currentPlayer.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Position:</span>
                <span className="text-white font-medium">{currentPlayer.position + 1}</span>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Action Buttons */}
      {gameState.currentPhase === 'betting' && currentPlayer?.status === 'active' && (
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => placeBet(1000000)} // 0.001 SOL
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
          >
            Bet 0.001 SOL
          </button>
          
          <button
            onClick={callBet}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
          >
            Call
          </button>
          
          <button
            onClick={foldHand}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
          >
            Fold
          </button>
          
          <button
            onClick={executeStrategicFold}
            disabled={isLoading}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg font-medium transition-colors"
          >
            Strategic Fold
            <div className="text-xs opacity-80">50% refund</div>
          </button>
        </motion.div>
      )}

      {/* Players */}
      <motion.div 
        className="bg-gray-800 p-4 rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-lg font-semibold text-white mb-3">
          Players ({gameState.players.length})
        </h3>
        <div className="grid gap-3">
          {gameState.players.map((player, index) => (
            <div 
              key={player.playerId}
              className={`p-3 rounded border ${
                player.playerId === playerId
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 bg-gray-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-white font-medium">
                    Player {index + 1}
                    {player.playerId === playerId && ' (You)'}
                  </span>
                  <div className="text-sm text-gray-400">
                    {player.publicKey.toString().slice(0, 8)}...
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-medium">
                    {(player.balance.toNumber() / 1e9).toFixed(3)} SOL
                  </div>
                  <div className="text-xs text-gray-400">
                    Status: {player.status}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-white">Executing action...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MagicBlockBattleArena;