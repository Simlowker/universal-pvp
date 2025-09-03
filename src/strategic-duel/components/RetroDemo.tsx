// ===============================================
//  RETRO ARCADE DEMO - Showcase of All Elements
//  Interactive demo of complete pixel gaming system
// ===============================================

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArcadeScreen, 
  RetroButton, 
  ProgressBar, 
  CountdownTimer, 
  LifeBar, 
  ScoreDisplay,
  PixelAvatar,
  CoinSlot,
  GlitchText,
  ArcadeCard,
  ExplosionEffect 
} from './RetroComponents';
import { useRetroSound } from './RetroSoundManager';
import '../../styles/RetroStyles.css';

export default function RetroDemo() {
  const [demoState, setDemoState] = useState<'menu' | 'demo' | 'effects'>('menu');
  const [score, setScore] = useState(1000);
  const [health, setHealth] = useState(5);
  const [showExplosion, setShowExplosion] = useState(false);
  const [progressValue, setProgressValue] = useState(75);
  const [showCountdown, setShowCountdown] = useState(false);
  const [coinAnimating, setCoinAnimating] = useState(false);
  
  const { 
    playSound,
    playButtonPress,
    playCoinInsert,
    playExplosion,
    playVictory,
    playCountdown
  } = useRetroSound();

  // Auto-update progress bar for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setProgressValue(prev => {
        const newValue = prev + (Math.random() - 0.5) * 10;
        return Math.max(0, Math.min(100, newValue));
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleCoinInsert = () => {
    setCoinAnimating(true);
    playCoinInsert();
    setTimeout(() => {
      setCoinAnimating(false);
      setScore(prev => prev + 100);
    }, 1200);
  };

  const handleExplosion = () => {
    setShowExplosion(true);
    playExplosion();
    setTimeout(() => {
      setShowExplosion(false);
      setScore(prev => prev + 500);
    }, 600);
  };

  const handleCountdown = () => {
    setShowCountdown(true);
    playCountdown();
    setTimeout(() => setShowCountdown(false), 3000);
  };

  if (demoState === 'menu') {
    return (
      <div className="game-state-screen">
        <div className="text-center">
          <div className="game-state-title mb-8">
            RETRO ARCADE
          </div>
          <div className="pixel-font text-electric-blue mb-8">
            DEMONSTRATION MODE
          </div>
          
          <div className="space-y-4">
            <RetroButton 
              color="green" 
              size="large"
              onClick={() => {
                playButtonPress();
                setDemoState('demo');
              }}
            >
              START DEMO
            </RetroButton>
            
            <RetroButton 
              color="pink" 
              onClick={() => {
                playButtonPress();
                setDemoState('effects');
              }}
            >
              EFFECTS TEST
            </RetroButton>
          </div>
          
          <div className="insert-coin pixel-font mt-8">
            PRESS ANY BUTTON TO CONTINUE
          </div>
        </div>
      </div>
    );
  }

  if (demoState === 'effects') {
    return (
      <div className="arcade-cabinet max-w-4xl mx-auto p-6">
        <ArcadeScreen title="EFFECTS SHOWCASE" glowColor="pink">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Sound Effects */}
            <ArcadeCard title="SOUND SYSTEM" glowColor="blue">
              <div className="space-y-3">
                <RetroButton 
                  color="green" 
                  size="small" 
                  onClick={() => playSound('coin-insert')}
                >
                  COIN INSERT
                </RetroButton>
                <RetroButton 
                  color="blue" 
                  size="small" 
                  onClick={() => playSound('victory-fanfare')}
                >
                  VICTORY
                </RetroButton>
                <RetroButton 
                  color="red" 
                  size="small" 
                  onClick={() => playSound('defeat-buzz')}
                >
                  DEFEAT
                </RetroButton>
                <RetroButton 
                  color="yellow" 
                  size="small" 
                  onClick={() => playSound('pixel-explosion')}
                >
                  EXPLOSION
                </RetroButton>
              </div>
            </ArcadeCard>

            {/* Visual Effects */}
            <ArcadeCard title="VISUAL FX" glowColor="green">
              <div className="space-y-3">
                <RetroButton 
                  color="pink" 
                  size="small" 
                  onClick={handleExplosion}
                >
                  EXPLOSION
                </RetroButton>
                <RetroButton 
                  color="yellow" 
                  size="small" 
                  onClick={handleCountdown}
                >
                  COUNTDOWN
                </RetroButton>
                <RetroButton 
                  color="blue" 
                  size="small" 
                  onClick={handleCoinInsert}
                >
                  COIN DROP
                </RetroButton>
              </div>
              
              <div className="mt-4 text-center">
                <GlitchText intensity="high" color="text-danger-red">
                  <div className="pixel-font text-xs">SYSTEM ERROR</div>
                </GlitchText>
              </div>
            </ArcadeCard>

          </div>

          <div className="mt-6 text-center">
            <RetroButton 
              color="red" 
              onClick={() => {
                playButtonPress();
                setDemoState('menu');
              }}
            >
              BACK TO MENU
            </RetroButton>
          </div>
        </ArcadeScreen>

        {/* Overlays */}
        <ExplosionEffect 
          isVisible={showExplosion}
          onComplete={() => setShowExplosion(false)}
          color="yellow"
        />

        {showCountdown && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
            <CountdownTimer 
              seconds={3} 
              onComplete={() => setShowCountdown(false)}
              size="large"
            />
          </div>
        )}

        {coinAnimating && (
          <div className="fixed inset-0 z-40 flex items-start justify-center pt-20 pointer-events-none">
            <CoinSlot isAnimating={true} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="arcade-cabinet max-w-6xl mx-auto p-6">
      
      {/* Main Demo Screen */}
      <ArcadeScreen title="ARCADE DEMO" showScanlines={true}>
        
        {/* Header Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <ScoreDisplay 
            score={score} 
            label="SCORE" 
            color="green"
            animated={true}
          />
          <ScoreDisplay 
            score="x3" 
            label="MULTIPLIER" 
            color="yellow"
          />
          <div className="text-center">
            <div className="pixel-font text-electric-blue text-xs mb-2">HEALTH</div>
            <LifeBar current={health} max={5} color="red" />
          </div>
          <div className="text-center">
            <div className="pixel-font text-hot-pink text-xs mb-2">LEVEL</div>
            <div className="pixel-font-large text-cyber-yellow pixel-glow">07</div>
          </div>
        </div>

        {/* Players */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div className="text-center">
            <PixelAvatar 
              isActive={true} 
              color="green" 
              size="large" 
              label="PLAYER 1"
            />
          </div>
          <div className="text-center">
            <PixelAvatar 
              isActive={false} 
              color="red" 
              size="large" 
              label="CPU"
            />
          </div>
        </div>

        {/* Progress Bars */}
        <div className="space-y-4 mb-6">
          <ProgressBar 
            value={progressValue} 
            label="POWER" 
            color="green"
            animated={true}
          />
          <ProgressBar 
            value={85} 
            label="DEFENSE" 
            color="blue"
            animated={true}
          />
          <ProgressBar 
            value={60} 
            label="SPEED" 
            color="yellow"
            animated={true}
          />
          <ProgressBar 
            value={40} 
            label="ACCURACY" 
            color="red"
            animated={true}
          />
        </div>

        {/* Control Panel */}
        <div className="bg-retro-gray p-4 pixel-border border-pixel-white">
          <div className="pixel-font text-electric-blue text-xs text-center mb-3">
            CONTROL PANEL
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <RetroButton 
              color="green" 
              onClick={() => {
                playButtonPress();
                setScore(prev => prev + 50);
              }}
            >
              ATTACK
            </RetroButton>
            <RetroButton 
              color="blue" 
              onClick={() => {
                playButtonPress();
                setHealth(prev => Math.min(prev + 1, 5));
              }}
            >
              HEAL
            </RetroButton>
            <RetroButton 
              color="yellow" 
              onClick={handleExplosion}
            >
              SPECIAL
            </RetroButton>
            <RetroButton 
              color="red" 
              onClick={() => {
                playButtonPress();
                setHealth(prev => Math.max(prev - 1, 0));
              }}
            >
              DAMAGE
            </RetroButton>
          </div>

          <div className="flex justify-center gap-4">
            <CoinSlot 
              onCoinInsert={handleCoinInsert}
              isAnimating={coinAnimating}
            />
            
            <RetroButton 
              color="pink" 
              onClick={() => {
                playButtonPress();
                setDemoState('menu');
              }}
            >
              MAIN MENU
            </RetroButton>
          </div>
        </div>

      </ArcadeScreen>

      {/* Overlay Effects */}
      <ExplosionEffect 
        isVisible={showExplosion}
        onComplete={() => setShowExplosion(false)}
        color="yellow"
      />

      {coinAnimating && (
        <div className="fixed inset-0 z-40 flex items-start justify-center pt-20 pointer-events-none">
          <div className="coin-slot">
            <div className="coin" />
          </div>
        </div>
      )}

    </div>
  );
}