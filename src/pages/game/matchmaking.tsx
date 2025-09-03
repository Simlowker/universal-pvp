'use client';

import React, { useState, useEffect } from 'react';
import { useMagicBlock } from '@/contexts/MagicBlockProvider';
import PlayerHUD from '@/components/game/PlayerHUD';

interface MatchmakingProps {
  onMatchFound?: () => void;
  onCancel?: () => void;
  className?: string;
}

interface QueueStats {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedWaitTime: number;
}

interface MatchmakingPhase {
  phase: 'idle' | 'searching' | 'found' | 'connecting' | 'ready';
  startTime: number;
  searchTime: number;
}

export const Matchmaking: React.FC<MatchmakingProps> = ({
  onMatchFound,
  onCancel,
  className = ''
}) => {
  const {
    isConnected,
    isInMatch,
    gameState,
    joinMatchmaking,
    leaveMatchmaking,
    error
  } = useMagicBlock();

  const [matchmakingPhase, setMatchmakingPhase] = useState<MatchmakingPhase>({
    phase: 'idle',
    startTime: 0,
    searchTime: 0
  });

  const [queueStats, setQueueStats] = useState<QueueStats>({
    playersInQueue: Math.floor(Math.random() * 50) + 10, // Mock data
    averageWaitTime: 45000, // 45 seconds
    estimatedWaitTime: 60000 // 1 minute
  });

  const [searchAnimation, setSearchAnimation] = useState(0);

  // Handle match state changes
  useEffect(() => {
    if (isInMatch && gameState.phase === 'battle') {
      setMatchmakingPhase(prev => ({ ...prev, phase: 'ready' }));
      setTimeout(() => {
        if (onMatchFound) onMatchFound();
      }, 2000);
    } else if (gameState.matchId && !isInMatch) {
      setMatchmakingPhase(prev => ({ ...prev, phase: 'connecting' }));
    }
  }, [isInMatch, gameState.phase, gameState.matchId, onMatchFound]);

  // Update search timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (matchmakingPhase.phase === 'searching') {
      interval = setInterval(() => {
        const elapsed = Date.now() - matchmakingPhase.startTime;
        setMatchmakingPhase(prev => ({ ...prev, searchTime: elapsed }));
        
        // Update estimated wait time based on elapsed time
        setQueueStats(prev => ({
          ...prev,
          estimatedWaitTime: Math.max(10000, prev.estimatedWaitTime - 1000)
        }));
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [matchmakingPhase.phase, matchmakingPhase.startTime]);

  // Search animation
  useEffect(() => {
    let animationInterval: NodeJS.Timeout;
    
    if (matchmakingPhase.phase === 'searching') {
      animationInterval = setInterval(() => {
        setSearchAnimation(prev => (prev + 1) % 4);
      }, 500);
    }
    
    return () => {
      if (animationInterval) clearInterval(animationInterval);
    };
  }, [matchmakingPhase.phase]);

  // Mock queue stats updates
  useEffect(() => {
    const statsInterval = setInterval(() => {
      setQueueStats(prev => ({
        playersInQueue: Math.max(5, prev.playersInQueue + Math.floor(Math.random() * 6) - 3),
        averageWaitTime: prev.averageWaitTime + Math.floor(Math.random() * 10000) - 5000,
        estimatedWaitTime: Math.max(5000, prev.estimatedWaitTime + Math.floor(Math.random() * 10000) - 5000)
      }));
    }, 5000);
    
    return () => clearInterval(statsInterval);
  }, []);

  const handleJoinQueue = async () => {
    try {
      setMatchmakingPhase({
        phase: 'searching',
        startTime: Date.now(),
        searchTime: 0
      });
      await joinMatchmaking();
    } catch (err) {
      console.error('Failed to join matchmaking:', err);
      setMatchmakingPhase({ phase: 'idle', startTime: 0, searchTime: 0 });
    }
  };

  const handleLeaveQueue = async () => {
    try {
      await leaveMatchmaking();
      setMatchmakingPhase({ phase: 'idle', startTime: 0, searchTime: 0 });
      if (onCancel) onCancel();
    } catch (err) {
      console.error('Failed to leave matchmaking:', err);
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getSearchingDots = (): string => {
    return '.'.repeat(searchAnimation + 1);
  };

  const getPhaseDisplay = () => {
    switch (matchmakingPhase.phase) {
      case 'idle':
        return {
          title: '🎯 Ready to Battle',
          subtitle: 'Join the matchmaking queue to find an opponent',
          color: 'text-blue-400',
          action: 'Join Queue'
        };
      case 'searching':
        return {
          title: `🔍 Searching${getSearchingDots()}`,
          subtitle: `Finding a worthy opponent (${formatTime(matchmakingPhase.searchTime)})`,
          color: 'text-yellow-400',
          action: 'Cancel Search'
        };
      case 'found':
        return {
          title: '✅ Match Found!',
          subtitle: 'Preparing battle arena...',
          color: 'text-green-400',
          action: null
        };
      case 'connecting':
        return {
          title: '🔗 Connecting...',
          subtitle: 'Establishing battle connection',
          color: 'text-purple-400',
          action: null
        };
      case 'ready':
        return {
          title: '⚔️ Battle Ready!',
          subtitle: 'Entering the arena...',
          color: 'text-red-400',
          action: null
        };
      default:
        return {
          title: '🎮 Matchmaking',
          subtitle: 'Preparing matchmaking system',
          color: 'text-gray-400',
          action: null
        };
    }
  };

  const phaseDisplay = getPhaseDisplay();

  if (!isConnected) {
    return (
      <div className={`min-h-screen bg-gray-900 flex items-center justify-center p-4 ${className}`}>
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center border border-red-600">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-400 mb-4">Not Connected</h2>
          <p className="text-gray-300 mb-6">Connect to MagicBlock to access matchmaking</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b from-gray-900 via-blue-900/10 to-gray-900 p-4 ${className}`}>
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="text-center py-8">
          <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4">
            Matchmaking
          </h1>
          <p className="text-xl text-gray-300">
            Lightning-fast player matching with sub-30ms latency
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          
          {/* Player HUD */}
          <div className="lg:col-span-1">
            <PlayerHUD />
            
            {/* Queue Statistics */}
            <div className="mt-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-white font-semibold mb-3 text-center">Queue Statistics</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Players in Queue:</span>
                  <span className="text-green-400 font-medium">{queueStats.playersInQueue}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg. Wait Time:</span>
                  <span className="text-blue-400 font-medium">{formatTime(queueStats.averageWaitTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Est. Your Wait:</span>
                  <span className="text-purple-400 font-medium">{formatTime(queueStats.estimatedWaitTime)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Matchmaking Area */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700">
              
              {/* Phase Display */}
              <div className="text-center mb-8">
                <div className="text-8xl mb-4">
                  {matchmakingPhase.phase === 'searching' && '🔍'}
                  {matchmakingPhase.phase === 'found' && '✅'}
                  {matchmakingPhase.phase === 'connecting' && '🔗'}
                  {matchmakingPhase.phase === 'ready' && '⚔️'}
                  {matchmakingPhase.phase === 'idle' && '🎯'}
                </div>
                <h2 className={`text-4xl font-bold mb-4 ${phaseDisplay.color}`}>
                  {phaseDisplay.title}
                </h2>
                <p className="text-gray-400 text-lg mb-8">
                  {phaseDisplay.subtitle}
                </p>
                
                {/* Progress Animation */}
                {matchmakingPhase.phase === 'searching' && (
                  <div className="mb-6">
                    <div className="flex justify-center mb-4">
                      <div className="animate-spin w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full"></div>
                    </div>
                    <div className="bg-gray-700 rounded-full h-3 mb-4 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-blue-400 to-purple-400 h-full transition-all duration-1000"
                        style={{ 
                          width: `${Math.min(100, (matchmakingPhase.searchTime / queueStats.estimatedWaitTime) * 100)}%` 
                        }}
                      ></div>
                    </div>
                    <div className="text-blue-400 font-mono text-xl">
                      {formatTime(matchmakingPhase.searchTime)}
                    </div>
                  </div>
                )}

                {/* Action Button */}
                {phaseDisplay.action && (
                  <button
                    onClick={matchmakingPhase.phase === 'idle' ? handleJoinQueue : handleLeaveQueue}
                    className={`px-8 py-4 font-bold text-xl rounded-xl transition-all duration-300 transform hover:scale-105 ${
                      matchmakingPhase.phase === 'idle' 
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white' 
                        : 'bg-red-600 hover:bg-red-500 text-white'
                    }`}
                  >
                    {phaseDisplay.action}
                  </button>
                )}
              </div>

              {/* Matchmaking Features */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <div className="text-3xl mb-2">⚡</div>
                  <div className="text-white font-semibold">Fast Matching</div>
                  <div className="text-gray-400 text-sm">AI-powered pairing</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <div className="text-3xl mb-2">⚖️</div>
                  <div className="text-white font-semibold">Fair Play</div>
                  <div className="text-gray-400 text-sm">Skill-based matching</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <div className="text-3xl mb-2">🌍</div>
                  <div className="text-white font-semibold">Global Pool</div>
                  <div className="text-gray-400 text-sm">Worldwide players</div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="mt-6 bg-red-900/50 border border-red-600 rounded-lg p-4">
                  <p className="text-red-400 text-center">❌ {error}</p>
                </div>
              )}

              {/* Tips */}
              <div className="mt-6 bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                <h4 className="text-blue-400 font-semibold mb-2">💡 Matchmaking Tips</h4>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li>• Players are matched based on skill level and connection quality</li>
                  <li>• Peak hours (6-10 PM UTC) have the fastest queue times</li>
                  <li>• Your session key enables gasless, instant transactions</li>
                  <li>• All battles run on Solana Ephemeral Rollups for 30ms latency</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Matchmaking;