'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { useRetroSound } from './RetroSoundManager';
import { 
  PixelButton, 
  ArcadeScreen, 
  PixelAvatar, 
  LEDDisplay, 
  CoinSlot, 
  RetroTimer, 
  PixelMeter, 
  GlitchText, 
  WinAnimation 
} from './RetroComponents';
import '../../styles/RetroStyles.css';

const PROGRAM_ID = new PublicKey('6gaBQmha1o6u26PWb9quyzhcxufGWAWBYr71m6e6F3GD');

type GameState = 'idle' | 'searching' | 'playing' | 'finished';
type ActionType = 'CHECK' | 'RAISE' | 'CALL' | 'FOLD';

interface PlayerStats {
  address: string;
  balance: number;
  currentBet: number;
  lastAction?: ActionType;
  thinkingTime?: number;
  isActive: boolean;
}

export default function DuelArena() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { 
    playSound, 
    playCoinInsert, 
    playButtonPress, 
    playCountdown, 
    playActionSelect,
    playVictory, 
    playDefeat, 
    playExplosion,
    playGameStart 
  } = useRetroSound();
  
  const [gameState, setGameState] = useState<GameState>('idle');
  const [pot, setPot] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [stake, setStake] = useState(0.01);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showCoinAnimation, setShowCoinAnimation] = useState(false);
  const [showExplosion, setShowExplosion] = useState(false);
  const [winner, setWinner] = useState<'player' | 'opponent' | null>(null);
  
  const [player, setPlayer] = useState<PlayerStats>({
    address: publicKey?.toString() || '',
    balance: 0,
    currentBet: 0,
    isActive: true
  });
  
  const [opponent, setOpponent] = useState<PlayerStats>({
    address: '',
    balance: 0,
    currentBet: 0,
    isActive: false
  });

  const [psychProfile, setPsychProfile] = useState({
    aggression: 0,
    bluffProbability: 0,
    consistency: 0,
    pressure: 0
  });

  // Sound effects are now handled by the RetroSoundManager hook

  // Countdown timer
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCountdown(null);
    }
  }, [countdown]);

  // Create or join a duel with coin animation
  const handleCreateDuel = async () => {
    if (!publicKey || !sendTransaction) return;
    
    // Show coin insert animation
    setShowCoinAnimation(true);
    playCoinInsert();
    setGameState('searching');
    
    setTimeout(() => setShowCoinAnimation(false), 1200);
    
    try {
      console.log('Creating duel with stake:', stake);
      
      // Simulate finding opponent with countdown
      setTimeout(() => {
        setOpponent({
          address: 'CPU_CHALLENGER',
          balance: stake * LAMPORTS_PER_SOL,
          currentBet: 0,
          isActive: true
        });
        setGameState('playing');
        setIsMyTurn(true);
        setPot(stake * 2);
        setCountdown(3); // 3-second countdown
        playGameStart();
      }, 3000);
      
    } catch (error) {
      console.error('Error creating duel:', error);
      setGameState('idle');
    }
  };

  // Handle player actions with sound effects
  const handleAction = async (action: ActionType, amount?: number) => {
    if (!isMyTurn || gameState !== 'playing' || countdown !== null) return;
    
    const startTime = Date.now();
    playActionSelect();
    
    // Update UI optimistically
    setPlayer(prev => ({
      ...prev,
      lastAction: action,
      thinkingTime: Date.now() - startTime
    }));
    
    switch (action) {
      case 'CHECK':
        console.log('Player checks');
        break;
        
      case 'RAISE':
        const raiseAmount = amount || 0.01;
        setPot(prev => prev + raiseAmount);
        setPlayer(prev => ({
          ...prev,
          currentBet: prev.currentBet + raiseAmount,
          balance: prev.balance - raiseAmount * LAMPORTS_PER_SOL
        }));
        console.log('Player raises by', raiseAmount);
        break;
        
      case 'CALL':
        const callAmount = opponent.currentBet - player.currentBet;
        setPot(prev => prev + callAmount / LAMPORTS_PER_SOL);
        setPlayer(prev => ({
          ...prev,
          currentBet: opponent.currentBet,
          balance: prev.balance - callAmount
        }));
        console.log('Player calls');
        break;
        
      case 'FOLD':
        console.log('Player folds');
        setWinner('opponent');
        setGameState('finished');
        playDefeat();
        return;
    }
    
    // Check for round end
    if (currentRound >= 5) {
      setWinner('player');
      setShowExplosion(true);
      playExplosion();
      setTimeout(() => {
        setGameState('finished');
        playVictory();
      }, 600);
      return;
    }
    
    // Switch turns
    setIsMyTurn(false);
    
    // Simulate opponent action
    setTimeout(() => {
      simulateOpponentAction();
    }, Math.random() * 3000 + 1000);
  };

  // Simulate opponent actions
  const simulateOpponentAction = () => {
    const actions: ActionType[] = ['CHECK', 'RAISE', 'CALL', 'FOLD'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    const thinkingTime = Math.random() * 5000 + 500;
    
    // Update psychological profile based on timing
    setPsychProfile(prev => ({
      ...prev,
      aggression: thinkingTime < 1000 ? Math.min(prev.aggression + 0.1, 1) : prev.aggression,
      bluffProbability: randomAction === 'RAISE' ? Math.min(prev.bluffProbability + 0.15, 1) : prev.bluffProbability * 0.9,
      consistency: Math.abs(prev.aggression - (thinkingTime < 2000 ? 1 : 0)) < 0.3 ? prev.consistency + 0.1 : prev.consistency * 0.8,
      pressure: thinkingTime > 4000 ? Math.min(prev.pressure + 0.2, 1) : prev.pressure * 0.85
    }));
    
    setOpponent(prev => ({
      ...prev,
      lastAction: randomAction,
      thinkingTime
    }));
    
    if (randomAction === 'FOLD') {
      setGameState('finished');
    } else {
      setIsMyTurn(true);
    }
  };

  return (
    <ArcadeScreen 
      title="STRATEGIC DUEL" 
      subtitle="ULTIMATE COMBAT ARENA"
      className="max-w-6xl mx-auto"
      showScanlines={true}
      flicker={gameState === 'playing' && isMyTurn}
      curvature={true}
      phosphorGlow={true}
    >
      {/* Win Animation */}
      <WinAnimation
        isVisible={showExplosion}
        onComplete={() => setShowExplosion(false)}
        winnerText={winner === 'player' ? 'VICTORY!' : 'DEFEAT!'}
        color={winner === 'player' ? 'yellow' : 'red'}
        particles={30}
      />
      
      {/* Countdown Overlay */}
      {countdown !== null && countdown > 0 && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black bg-opacity-75">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center"
          >
            <GlitchText 
              trigger={countdown <= 1}
              intensity="high"
              className="text-8xl pixel-text text-cyber-yellow mb-4"
            >
              {countdown === 3 ? 'READY' : countdown === 2 ? 'SET' : countdown === 1 ? 'FIGHT!' : countdown}
            </GlitchText>
            {countdown === 1 && (
              <div className="text-2xl pixel-text text-neon-green animate-pulse">
                ROUND {currentRound} START!
              </div>
            )}
          </motion.div>
        </div>
      )}
      {gameState === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-8"
        >
          {/* Arcade Title */}
          <motion.div 
            className="mb-8"
            animate={{ 
              textShadow: [
                '0 0 20px var(--cyber-yellow)',
                '0 0 40px var(--cyber-yellow), 0 0 60px var(--cyber-yellow)',
                '0 0 20px var(--cyber-yellow)'
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <GlitchText className="text-6xl pixel-text text-cyber-yellow" continuous={false}>
              STRATEGIC DUEL
            </GlitchText>
            <div className="text-2xl pixel-text text-electric-blue mt-2">
              ULTIMATE COMBAT ARENA
            </div>
          </motion.div>
          
          {/* Coin Slot and Credits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 max-w-2xl mx-auto">
            <CoinSlot
              onCoinInsert={handleCreateDuel}
              credits={0}
              disabled={false}
              className="bg-console-gray"
            />
            
            <div className="arcade-panel p-6 bg-deep-black">
              <LEDDisplay
                value={stake}
                label="SELECTED STAKE"
                suffix=" SOL"
                size="medium"
                color="amber"
                className="mb-4"
              />
              
              <div className="text-center">
                <div className="pixel-text text-xs text-electric-blue mb-3">SELECT AMOUNT</div>
                <div className="grid grid-cols-3 gap-2">
                  {[0.01, 0.05, 0.1, 0.25, 0.5, 1].map(amount => (
                    <PixelButton
                      key={amount}
                      onClick={() => setStake(amount)}
                      variant={stake === amount ? 'success' : 'secondary'}
                      size="small"
                      className="h-12"
                    >
                      {amount}
                    </PixelButton>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Insert Coin Message */}
          <motion.div 
            className="text-center"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="pixel-text text-2xl text-neon-green mb-2">
              INSERT COIN
            </div>
            <div className="pixel-text text-sm text-electric-blue">
              PRESS COIN SLOT TO START ({stake} SOL)
            </div>
          </motion.div>

          {/* Player Ready Indicators */}
          <div className="flex justify-center items-center gap-8 mt-8">
            <div className="text-center">
              <div className="w-4 h-4 bg-neon-green rounded-full mx-auto mb-2 animate-pulse"></div>
              <div className="pixel-text text-xs text-neon-green">PLAYER 1 READY</div>
            </div>
            <div className="pixel-text text-2xl text-cyber-yellow">VS</div>
            <div className="text-center">
              <div className="w-4 h-4 bg-retro-gray rounded-full mx-auto mb-2"></div>
              <div className="pixel-text text-xs text-retro-gray">PLAYER 2 WAITING</div>
            </div>
          </div>
        </motion.div>
      )}

      {gameState === 'searching' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center p-8"
        >
          <GlitchText 
            className="text-4xl pixel-text text-electric-blue mb-8"
            continuous={true}
            intensity="medium"
          >
            SCANNING FOR OPPONENT...
          </GlitchText>
          
          <div className="flex justify-center items-center mb-8 gap-12">
            <PixelAvatar
              playerId={1}
              isActive={true}
              label="PLAYER 1"
              size="large"
              className="animate-pulse"
            />
            
            <motion.div 
              className="text-center"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <div className="text-6xl pixel-text text-cyber-yellow mb-2">VS</div>
              <div className="pixel-text text-xs text-electric-blue">COMBAT MATCH</div>
            </motion.div>
            
            <PixelAvatar
              playerId={2}
              isActive={false}
              label="SEARCHING..."
              size="large"
              className="opacity-50"
            />
          </div>
          
          <div className="space-y-4">
            <LEDDisplay
              value="SEARCHING"
              label="STATUS"
              size="medium"
              color="blue"
              flicker={true}
              className="mx-auto"
            />
            
            <motion.div 
              className="pixel-text text-warning-amber"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              CHALLENGER INCOMING...
            </motion.div>
            
            {/* Scanning animation */}
            <div className="relative w-64 h-2 mx-auto bg-console-gray">
              <motion.div
                className="absolute top-0 left-0 h-full w-4 bg-neon-green"
                animate={{ x: [0, 240, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {gameState === 'playing' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
          {/* Main Game Arena */}
          <div className="lg:col-span-2 space-y-6">
            {/* Arcade Header Display */}
            <div className="arcade-panel p-6 bg-deep-black relative">
              <div className="text-center mb-6">
                <LEDDisplay
                  value={pot.toFixed(3)}
                  label="JACKPOT"
                  suffix=" SOL"
                  size="large"
                  color="amber"
                  countUp={true}
                  flicker={false}
                  className="mb-4"
                />
                
                <div className="flex justify-center items-center gap-4 mb-4">
                  <div className="pixel-text text-electric-blue">ROUND</div>
                  <LEDDisplay
                    value={currentRound}
                    size="medium"
                    color="blue"
                    className="mx-2"
                  />
                  <div className="pixel-text text-electric-blue">/ 5</div>
                </div>
                
                {/* Health/Life Meters */}
                <div className="flex justify-between items-center mt-6">
                  <div className="text-center">
                    <div className="pixel-text text-xs text-neon-green mb-2">PLAYER 1</div>
                    <PixelMeter
                      value={(6 - currentRound) * 20}
                      max={100}
                      color="green"
                      showSegments={true}
                      animated={true}
                      size="small"
                      className="w-24"
                    />
                  </div>
                  
                  <div className="text-center">
                    <div className="pixel-text text-xs text-hot-pink mb-2">CPU</div>
                    <PixelMeter
                      value={(6 - currentRound) * 20}
                      max={100}
                      color="pink"
                      showSegments={true}
                      animated={true}
                      size="small"
                      className="w-24"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Combat Arena */}
            <div className="arcade-panel p-6 bg-deep-black relative">
              <div className="text-center mb-4">
                <GlitchText 
                  className="text-2xl pixel-text text-cyber-yellow"
                  trigger={isMyTurn && countdown === null}
                  intensity="low"
                >
                  COMBAT ARENA
                </GlitchText>
              </div>
              
              <div className="grid grid-cols-2 gap-8 mb-6">
                {/* CPU Opponent */}
                <div className="text-center">
                  <PixelAvatar
                    playerId={2}
                    isActive={!isMyTurn && countdown === null}
                    health={(6 - currentRound) * 20}
                    maxHealth={100}
                    label="CPU_CHALLENGER"
                    size="large"
                  />
                  
                  <div className="mt-4 space-y-2">
                    <div className="pixel-text text-xs text-hot-pink">CPU_CHALLENGER</div>
                    <div className="pixel-text text-xs text-retro-gray">
                      {opponent.address || 'COMBAT_AI_V2.1'}
                    </div>
                    
                    {opponent.lastAction && (
                      <motion.div 
                        className="arcade-panel p-2 bg-console-gray"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                      >
                        <div className="pixel-text text-xs text-cyber-yellow">
                          LAST: {opponent.lastAction}
                        </div>
                        {opponent.thinkingTime && (
                          <div className="pixel-text text-xs text-retro-gray">
                            {(opponent.thinkingTime / 1000).toFixed(1)}s
                          </div>
                        )}
                      </motion.div>
                    )}
                    
                    {!isMyTurn && countdown === null && (
                      <motion.div 
                        className="pixel-text text-xs text-warning-amber"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        PROCESSING...
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Player */}
                <div className="text-center">
                  <PixelAvatar
                    playerId={1}
                    isActive={isMyTurn && countdown === null}
                    health={(6 - currentRound) * 20}
                    maxHealth={100}
                    label="PLAYER_01"
                    size="large"
                  />
                  
                  <div className="mt-4 space-y-2">
                    <div className="pixel-text text-xs text-neon-green">PLAYER_01</div>
                    <div className="pixel-text text-xs text-retro-gray">
                      {publicKey?.toString().slice(0, 8)}...
                    </div>
                    
                    {player.lastAction && (
                      <motion.div 
                        className="arcade-panel p-2 bg-console-gray"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                      >
                        <div className="pixel-text text-xs text-electric-blue">
                          LAST: {player.lastAction}
                        </div>
                      </motion.div>
                    )}
                    
                    {isMyTurn && countdown === null && (
                      <motion.div 
                        className="pixel-text text-xs text-neon-green"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                      >
                        YOUR TURN!
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Arcade Control Panel */}
            <div className="arcade-panel p-6 bg-console-gray relative">
              <div className="text-center mb-4">
                <GlitchText 
                  className="pixel-text text-electric-blue"
                  trigger={isMyTurn && countdown === null}
                >
                  COMBAT CONTROLS
                </GlitchText>
              </div>
              
              {/* Action Timer */}
              {isMyTurn && countdown === null && (
                <div className="mb-6">
                  <RetroTimer
                    seconds={30}
                    onComplete={() => handleAction('FOLD')}
                    warningThreshold={10}
                    criticalThreshold={5}
                    size="medium"
                    showProgressRing={true}
                    className="mx-auto"
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <PixelButton
                  onClick={() => handleAction('CHECK')}
                  disabled={!isMyTurn || countdown !== null}
                  variant="secondary"
                  size="large"
                  className="h-16"
                  glitch={isMyTurn && countdown === null}
                >
                  CHECK
                </PixelButton>
                
                <PixelButton
                  onClick={() => handleAction('RAISE', 0.01)}
                  disabled={!isMyTurn || countdown !== null}
                  variant="warning"
                  size="large"
                  className="h-16"
                  pulse={isMyTurn}
                >
                  RAISE
                </PixelButton>
                
                <PixelButton
                  onClick={() => handleAction('CALL')}
                  disabled={!isMyTurn || countdown !== null}
                  variant="success"
                  size="large"
                  className="h-16"
                >
                  CALL
                </PixelButton>
                
                <PixelButton
                  onClick={() => handleAction('FOLD')}
                  disabled={!isMyTurn || countdown !== null}
                  variant="danger"
                  size="large"
                  className="h-16"
                >
                  FOLD
                </PixelButton>
              </div>
              
              {/* Action Status Display */}
              <div className="mt-6 text-center">
                <div className="arcade-panel p-3 bg-deep-black">
                  {isMyTurn && countdown === null ? (
                    <LEDDisplay
                      value="AWAITING INPUT"
                      size="small"
                      color="green"
                      flicker={true}
                    />
                  ) : !isMyTurn && countdown === null ? (
                    <LEDDisplay
                      value="CPU PROCESSING"
                      size="small"
                      color="amber"
                      flicker={true}
                    />
                  ) : (
                    <LEDDisplay
                      value="STANDBY"
                      size="small"
                      color="blue"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Arcade Psychological Scanner */}
          <div className="space-y-6">
            <div className="arcade-panel p-6 bg-deep-black relative">
              <div className="text-center mb-6">
                <GlitchText 
                  className="pixel-text text-hot-pink text-xl"
                  continuous={true}
                  intensity="low"
                >
                  PSYCH SCANNER
                </GlitchText>
                <div className="pixel-text text-xs text-electric-blue mt-2">
                  AI BEHAVIORAL ANALYSIS
                </div>
              </div>
              
              <div className="space-y-4">
                <PixelMeter
                  value={psychProfile.aggression * 100}
                  label="AGGRESSION"
                  color="red"
                  showSegments={true}
                  animated={true}
                  className="mb-3"
                />

                <PixelMeter
                  value={psychProfile.bluffProbability * 100}
                  label="BLUFF DETECT"
                  color="yellow"
                  showSegments={true}
                  animated={true}
                  className="mb-3"
                />

                <PixelMeter
                  value={psychProfile.consistency * 100}
                  label="CONSISTENCY"
                  color="blue"
                  showSegments={true}
                  animated={true}
                  className="mb-3"
                />

                <PixelMeter
                  value={psychProfile.pressure * 100}
                  label="PRESSURE"
                  color="pink"
                  showSegments={true}
                  animated={true}
                  className="mb-3"
                />
              </div>

              {/* AI Analysis Display */}
              <div className="mt-6 arcade-panel p-4 bg-console-gray">
                <LEDDisplay
                  value="ANALYSIS"
                  size="small"
                  color="green"
                  className="mb-3"
                />
                
                <motion.div 
                  className="space-y-1 text-center"
                  key={`${psychProfile.aggression}-${psychProfile.bluffProbability}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  {psychProfile.aggression > 0.7 && (
                    <div className="pixel-text text-xs text-danger-red">⚡ AGGRESSIVE PATTERN</div>
                  )}
                  {psychProfile.bluffProbability > 0.6 && (
                    <div className="pixel-text text-xs text-cyber-yellow">🎭 HIGH BLUFF RISK</div>
                  )}
                  {psychProfile.consistency < 0.3 && (
                    <div className="pixel-text text-xs text-warning-amber">📊 ERRATIC BEHAVIOR</div>
                  )}
                  {psychProfile.pressure > 0.7 && (
                    <div className="pixel-text text-xs text-hot-pink">💫 UNDER PRESSURE</div>
                  )}
                  {psychProfile.aggression < 0.3 && psychProfile.bluffProbability < 0.3 && (
                    <div className="pixel-text text-xs text-electric-blue">🛡️ DEFENSIVE PLAY</div>
                  )}
                  {Object.values(psychProfile).every(v => v < 0.2) && (
                    <div className="pixel-text text-xs text-neon-green">🔍 SCANNING...</div>
                  )}
                </motion.div>
              </div>
            </div>
            
            {/* Combat Statistics */}
            <div className="arcade-panel p-4 bg-deep-black">
              <div className="pixel-text text-center text-electric-blue mb-4">
                COMBAT STATS
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <LEDDisplay
                    value={currentRound}
                    label="ROUND"
                    size="small"
                    color="blue"
                  />
                </div>
                <div>
                  <LEDDisplay
                    value={5 - currentRound}
                    label="REMAINING"
                    size="small"
                    color="green"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === 'finished' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center p-8"
        >
          {winner === 'player' ? (
            <>
              {/* Victory Screen */}
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  textShadow: [
                    '0 0 20px var(--neon-green)',
                    '0 0 40px var(--neon-green), 0 0 60px var(--neon-green)',
                    '0 0 20px var(--neon-green)'
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <GlitchText 
                  className="text-8xl pixel-text text-neon-green mb-6"
                  trigger={true}
                  continuous={true}
                  intensity="high"
                >
                  VICTORY!
                </GlitchText>
              </motion.div>
              
              <motion.div 
                className="text-8xl mb-8"
                animate={{ 
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.2, 1]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                👑
              </motion.div>
              
              <div className="mb-8 space-y-4">
                <LEDDisplay
                  value={pot.toFixed(3)}
                  label="JACKPOT WON"
                  suffix=" SOL"
                  size="large"
                  color="green"
                  countUp={true}
                  className="mx-auto"
                />
                
                <motion.div 
                  className="pixel-text text-electric-blue text-xl"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  CHALLENGER DEFEATED!
                </motion.div>
              </div>
              
              <PixelAvatar
                playerId={1}
                isWinner={true}
                label="CHAMPION"
                size="large"
                className="mb-8 mx-auto"
              />
            </>
          ) : (
            <>
              {/* Game Over Screen */}
              <GlitchText 
                className="text-8xl pixel-text text-danger-red mb-8"
                trigger={true}
                continuous={true}
                intensity="high"
              >
                GAME OVER
              </GlitchText>
              
              <motion.div 
                className="text-8xl mb-8"
                animate={{ 
                  rotate: [0, -5, 5, 0],
                  opacity: [1, 0.5, 1]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                💀
              </motion.div>
              
              <LEDDisplay
                value="K.O."
                label="RESULT"
                size="large"
                color="red"
                flicker={true}
                className="mb-8 mx-auto"
              />
              
              <div className="pixel-text text-warning-amber text-xl mb-8">
                YOU HAVE BEEN ELIMINATED
              </div>
              
              <PixelAvatar
                playerId={1}
                health={0}
                maxHealth={100}
                label="DEFEATED"
                size="large"
                className="mb-8 mx-auto opacity-50"
              />
            </>
          )}
          
          {/* Continue Controls */}
          <div className="space-y-6">
            <PixelButton
              onClick={() => {
                setGameState('idle');
                setWinner(null);
                setShowExplosion(false);
                setCurrentRound(1);
                setPot(0);
                setPsychProfile({ aggression: 0, bluffProbability: 0, consistency: 0, pressure: 0 });
                setPlayer(prev => ({ ...prev, lastAction: undefined }));
                setOpponent(prev => ({ ...prev, lastAction: undefined }));
              }}
              variant={winner === 'player' ? 'success' : 'secondary'}
              size="large"
              className="px-12 py-4"
              pulse={true}
            >
              {winner === 'player' ? 'PLAY AGAIN?' : 'CONTINUE?'}
            </PixelButton>
            
            <motion.div 
              className="pixel-text text-electric-blue"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              PRESS TO RESTART COMBAT
            </motion.div>
          </div>
        </motion.div>
      )}
    </ArcadeScreen>
  );
}