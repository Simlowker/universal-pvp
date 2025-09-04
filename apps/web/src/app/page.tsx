'use client'

import React, { useState, useEffect } from 'react'
import { WalletConnect } from '@/components/wallet/wallet-connect'
import { useUserStore } from '@/stores/user-store'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export default function HomePage() {
  const { user, isConnected } = useUserStore()
  const [gamePhase, setGamePhase] = useState<'menu' | 'searching' | 'battle'>('menu')
  const [searchStartTime, setSearchStartTime] = useState<number>(0)
  const [searchDuration, setSearchDuration] = useState<number>(0)

  // Update search timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (gamePhase === 'searching') {
      interval = setInterval(() => {
        setSearchDuration(Date.now() - searchStartTime);
      }, 100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gamePhase, searchStartTime]);

  const handleFindMatch = async () => {
    try {
      setGamePhase('searching');
      setSearchStartTime(Date.now());
      // Simulate matchmaking
      setTimeout(() => {
        setGamePhase('battle');
      }, 3000);
    } catch (err) {
      console.error('Failed to join matchmaking:', err);
      setGamePhase('menu');
    }
  };

  const handleCancelSearch = async () => {
    try {
      setGamePhase('menu');
      setSearchDuration(0);
    } catch (err) {
      console.error('Failed to leave matchmaking:', err);
    }
  };

  const formatSearchTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  // Main Menu Phase
  if (gamePhase === 'menu') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center py-8">
            <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 mb-4">
              Universal PvP
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              Lightning-fast Web3 battles on Solana Ephemeral Rollups
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Player HUD */}
            <div className="lg:col-span-1">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Player Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Level:</span>
                    <span className="text-white">15</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Wins:</span>
                    <span className="text-green-400">42</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Losses:</span>
                    <span className="text-red-400">18</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Win Rate:</span>
                    <span className="text-blue-400">70%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Action Area */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
                <div className="text-8xl mb-6">⚔️</div>
                <h2 className="text-3xl font-bold text-white mb-4">Ready for Battle?</h2>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">
                  Challenge players worldwide in real-time PvP combat. 
                  No gas fees, no wallet popups - just pure gaming!
                </p>
                
                <div className="space-y-4">
                  <button
                    onClick={handleFindMatch}
                    className="w-full max-w-xs bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-4 px-8 rounded-xl text-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
                  >
                    🎯 Find Match
                  </button>
                  
                  <div className="flex justify-center space-x-4 text-sm text-gray-400">
                    <div className="flex items-center space-x-1">
                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                      <span>30ms Latency</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                      <span>Gasless Transactions</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                      <span>Real-time Updates</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Game Features */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center border border-gray-700">
                  <div className="text-3xl mb-2">⚡</div>
                  <div className="text-white font-semibold">Instant</div>
                  <div className="text-gray-400 text-sm">Sub-second responses</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center border border-gray-700">
                  <div className="text-3xl mb-2">💎</div>
                  <div className="text-white font-semibold">No Gas</div>
                  <div className="text-gray-400 text-sm">Free to play</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center border border-gray-700">
                  <div className="text-3xl mb-2">🏆</div>
                  <div className="text-white font-semibold">Rewards</div>
                  <div className="text-gray-400 text-sm">Earn XP & NFTs</div>
                </div>
              </div>
            </div>
          </div>

          {/* Wallet Connection */}
          {!isConnected && (
            <div className="mt-12 text-center">
              <div className="bg-gray-800 rounded-xl p-8 max-w-2xl mx-auto border border-gray-700">
                <h3 className="text-2xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                  Connect Your Wallet
                </h3>
                <p className="text-gray-400 mb-6">
                  Connect your Solana wallet to join the battle arena and start earning rewards!
                </p>
                <WalletConnect />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Matchmaking Search Phase
  if (gamePhase === 'searching') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 text-center border border-blue-600">
          <div className="relative mb-6">
            <div className="animate-spin w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center text-2xl">
              🎯
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">Finding Opponent...</h2>
          <p className="text-gray-400 mb-6">
            Searching for a worthy challenger
          </p>
          
          <div className="bg-gray-700 rounded-full h-2 mb-4 overflow-hidden">
            <div className="bg-blue-400 h-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
          
          <div className="text-blue-400 font-mono text-lg mb-6">
            {formatSearchTime(searchDuration)}
          </div>
          
          <button
            onClick={handleCancelSearch}
            className="w-full bg-gray-600 hover:bg-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            ❌ Cancel Search
          </button>
          
          <div className="mt-4 text-xs text-gray-500">
            Average wait time: 30-60 seconds
          </div>
        </div>
      </div>
    );
  }

  // Battle Phase
  if (gamePhase === 'battle') {
    return (
      <div className="min-h-screen bg-gray-900 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center py-4">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-purple-400">
              ⚔️ BATTLE MODE ⚔️
            </h1>
            <div className="text-sm text-gray-400 mt-1">
              Real-time PvP Combat • Ephemeral Rollup • Sub-30ms latency
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-6">
            {/* Player HUD */}
            <div className="lg:col-span-1">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Your Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">HP:</span>
                    <span className="text-green-400">100/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mana:</span>
                    <span className="text-blue-400">50/50</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Level:</span>
                    <span className="text-white">15</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Battle Arena */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700 h-96 flex items-center justify-center">
                <div className="text-6xl">⚔️</div>
                <div className="ml-8">
                  <div className="text-2xl font-bold text-white mb-2">Battle Arena</div>
                  <div className="text-gray-400">Combat in progress...</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="lg:col-span-1">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Actions</h3>
                <div className="space-y-3">
                  <button className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                    Attack
                  </button>
                  <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                    Defend
                  </button>
                  <button className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200">
                    Heal
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Game Status */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center space-x-4 bg-gray-800 rounded-full px-6 py-2 border border-gray-700">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm">Live</span>
              </div>
              <div className="w-px h-4 bg-gray-600"></div>
              <div className="text-gray-400 text-sm">
                Turn 1
              </div>
              <div className="w-px h-4 bg-gray-600"></div>
              <div className="text-gray-400 text-sm">
                0 actions
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}