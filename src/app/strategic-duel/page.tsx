'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { STRATEGIC_DUEL_PROGRAM_ID, getProgramExplorerUrl } from '../../strategic-duel/utils/constants';
import '../../styles/RetroStyles.css';

// Dynamically import game components to avoid SSR issues
const DuelArena = dynamic(
  () => import('../../strategic-duel/components/DuelArena'),
  { ssr: false }
);

// Client component wrapper to use wallet hooks
function StrategicDuelClient() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  return (
    <div className="min-h-screen bg-deep-black crt-monitor relative overflow-hidden">
      {/* Header */}
      <header className="pixel-border border-neon-green bg-deep-black relative z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="pixel-font-large text-neon-green pixel-glow">
                STRATEGIC DUEL
              </h1>
              <p className="pixel-font text-electric-blue text-xs mt-1">PSYCHOLOGICAL PVP BETTING</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right score-display bg-retro-gray">
                <div className="pixel-font text-electric-blue text-xs">NETWORK</div>
                <div className="pixel-font text-cyber-yellow">DEVNET</div>
              </div>
              <WalletMultiButton className="pixel-button pixel-button-pink" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {!connected ? (
          <div className="max-w-md mx-auto mt-20 text-center">
            <div className="bg-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-purple-500/30">
              <h2 className="text-2xl font-bold text-white mb-4">
                Welcome to Strategic Duel
              </h2>
              <p className="text-gray-300 mb-6">
                A real-time psychological PvP betting game with instant execution on MagicBlock
              </p>
              <div className="space-y-4 text-left mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <p className="text-white font-semibold">10-50ms Actions</p>
                    <p className="text-gray-400 text-sm">Instant gameplay via Ephemeral Rollups</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🧠</span>
                  <div>
                    <p className="text-white font-semibold">Psychological Warfare</p>
                    <p className="text-gray-400 text-sm">Analyze opponent timing for tells</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎲</span>
                  <div>
                    <p className="text-white font-semibold">Provably Fair</p>
                    <p className="text-gray-400 text-sm">VRF-based resolution via Switchboard</p>
                  </div>
                </div>
              </div>
              <WalletMultiButton className="w-full !bg-purple-600 hover:!bg-purple-700" />
            </div>
          </div>
        ) : (
          <div>
            {/* Game Stats Bar */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-purple-500/30">
                <p className="text-gray-400 text-sm">Your Balance</p>
                <p className="text-white text-xl font-bold">0.57 SOL</p>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-purple-500/30">
                <p className="text-gray-400 text-sm">Active Duels</p>
                <p className="text-white text-xl font-bold">0</p>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-purple-500/30">
                <p className="text-gray-400 text-sm">Win Rate</p>
                <p className="text-white text-xl font-bold">--</p>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-md rounded-lg p-4 border border-purple-500/30">
                <p className="text-gray-400 text-sm">Total Winnings</p>
                <p className="text-white text-xl font-bold">0 SOL</p>
              </div>
            </div>

            {/* Game Arena */}
            <DuelArena />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-purple-800/50 bg-black/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center text-sm">
            <div className="text-gray-400">
              Program: <a 
                href={getProgramExplorerUrl()} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 font-mono"
              >
                {STRATEGIC_DUEL_PROGRAM_ID.toString().slice(0, 8)}...
              </a>
            </div>
            <div className="text-gray-400">
              Powered by MagicBlock BOLT ECS
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function StrategicDuelPage() {
  return <StrategicDuelClient />;
}