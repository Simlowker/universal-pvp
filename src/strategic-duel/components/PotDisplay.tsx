import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PotDisplayProps {
  pot: number;
  currentBet: number;
  animations: string[];
}

export const PotDisplay: React.FC<PotDisplayProps> = ({
  pot,
  currentBet,
  animations,
}) => {
  const [previousPot, setPreviousPot] = useState(pot);
  const [potIncrease, setPotIncrease] = useState(0);
  const [showIncrease, setShowIncrease] = useState(false);
  const [chipParticles, setChipParticles] = useState<Array<{ id: string; x: number; y: number }>>([]);

  // Handle pot changes with visual feedback
  useEffect(() => {
    if (pot > previousPot) {
      const increase = pot - previousPot;
      setPotIncrease(increase);
      setShowIncrease(true);
      
      // Create chip particles
      const particles = Array.from({ length: Math.min(increase / 10, 10) }, (_, i) => ({
        id: Math.random().toString(36),
        x: Math.random() * 200 - 100,
        y: Math.random() * 100 - 50,
      }));
      
      setChipParticles(particles);

      // Hide increase animation after delay
      const timer = setTimeout(() => {
        setShowIncrease(false);
        setChipParticles([]);
      }, 2000);

      setPreviousPot(pot);
      return () => clearTimeout(timer);
    }
  }, [pot, previousPot]);

  // Chip particle component
  const ChipParticle = ({ particle }: { particle: { id: string; x: number; y: number } }) => (
    <motion.div
      key={particle.id}
      className="chip-particle"
      initial={{ 
        scale: 0, 
        x: particle.x, 
        y: particle.y, 
        opacity: 1 
      }}
      animate={{ 
        scale: [0, 1, 0.8], 
        y: particle.y - 30, 
        opacity: [1, 1, 0] 
      }}
      exit={{ 
        scale: 0, 
        opacity: 0 
      }}
      transition={{ 
        duration: 1.5,
        ease: "easeOut"
      }}
    />
  );

  // Format currency display
  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toString();
  };

  // Animation variants for different states
  const potVariants = {
    idle: { scale: 1, rotate: 0 },
    growing: { 
      scale: [1, 1.1, 1], 
      rotate: [0, 5, -5, 0],
      transition: { duration: 0.6 }
    },
    pulsing: {
      scale: [1, 1.05, 1],
      transition: { duration: 2, repeat: Infinity }
    }
  };

  const hasChipMoveAnimation = animations.includes('chip-move');
  const currentAnimation = hasChipMoveAnimation ? 'growing' : (pot > 0 ? 'pulsing' : 'idle');

  return (
    <div className="pot-display-container">
      {/* Chip particles */}
      <div className="chip-particles">
        <AnimatePresence>
          {chipParticles.map(particle => (
            <ChipParticle key={particle.id} particle={particle} />
          ))}
        </AnimatePresence>
      </div>

      {/* Main pot display */}
      <motion.div
        className="pot-display"
        variants={potVariants}
        animate={currentAnimation}
        layout
      >
        <div className="pot-content">
          {/* Pot icon and chips stack */}
          <div className="pot-visual">
            <motion.div 
              className="chips-stack"
              animate={{ 
                height: Math.min(pot / 100, 50) + 20 
              }}
              transition={{ duration: 0.5 }}
            >
              {/* Individual chips */}
              {Array.from({ length: Math.min(Math.floor(pot / 100) + 1, 10) }, (_, i) => (
                <motion.div
                  key={i}
                  className={`chip chip-${i % 3}`}
                  initial={{ scale: 0, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                />
              ))}
            </motion.div>
          </div>

          {/* Pot amount */}
          <div className="pot-info">
            <motion.div 
              className="pot-label"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              POT
            </motion.div>
            
            <motion.div 
              className="pot-amount"
              key={pot} // Force re-render on change
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {formatCurrency(pot)}
            </motion.div>

            {/* Current bet indicator */}
            {currentBet > 0 && (
              <motion.div 
                className="current-bet"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                Current bet: {formatCurrency(currentBet)}
              </motion.div>
            )}
          </div>
        </div>

        {/* Pot increase animation */}
        <AnimatePresence>
          {showIncrease && (
            <motion.div
              className="pot-increase"
              initial={{ opacity: 0, y: 0, scale: 0.5 }}
              animate={{ opacity: 1, y: -30, scale: 1 }}
              exit={{ opacity: 0, y: -50, scale: 0.5 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            >
              +{formatCurrency(potIncrease)}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Glow effect for large pots */}
      {pot > 1000 && (
        <motion.div
          className="pot-glow"
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}

      {/* Side pots indicator (for future multi-player support) */}
      {/* This would be used when there are multiple side pots */}
      <div className="side-pots">
        {/* Future implementation for side pots */}
      </div>

      {/* CSS-in-JS Styles */}
      <style jsx>{`
        .pot-display-container {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 10;
        }

        .chip-particles {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 5;
        }

        .chip-particle {
          position: absolute;
          width: 20px;
          height: 20px;
          background: linear-gradient(135deg, #ffd700 0%, #ffb300 100%);
          border-radius: 50%;
          border: 2px solid #ff8f00;
        }

        .pot-display {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 20px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          position: relative;
          min-width: 200px;
        }

        .pot-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
        }

        .pot-visual {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: flex-end;
          height: 60px;
        }

        .chips-stack {
          position: relative;
          display: flex;
          flex-direction: column-reverse;
          align-items: center;
          justify-content: flex-start;
          min-height: 20px;
        }

        .chip {
          width: 30px;
          height: 8px;
          border-radius: 50%;
          margin-top: -4px;
          border: 1px solid rgba(0, 0, 0, 0.3);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .chip-0 {
          background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
        }

        .chip-1 {
          background: linear-gradient(135deg, #2196F3 0%, #1976d2 100%);
        }

        .chip-2 {
          background: linear-gradient(135deg, #4CAF50 0%, #388e3c 100%);
        }

        .pot-info {
          text-align: center;
        }

        .pot-label {
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          font-weight: bold;
          letter-spacing: 2px;
          margin-bottom: 5px;
        }

        .pot-amount {
          color: #ffd700;
          font-size: 32px;
          font-weight: bold;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
          font-family: 'Courier New', monospace;
        }

        .current-bet {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          margin-top: 8px;
          padding: 4px 8px;
          background: rgba(33, 150, 243, 0.2);
          border-radius: 12px;
          border: 1px solid rgba(33, 150, 243, 0.3);
        }

        .pot-increase {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          color: #4CAF50;
          font-size: 18px;
          font-weight: bold;
          text-shadow: 0 0 8px rgba(76, 175, 80, 0.8);
          pointer-events: none;
          z-index: 10;
        }

        .pot-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 120%;
          height: 120%;
          background: radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: -1;
        }

        .side-pots {
          margin-top: 15px;
          display: flex;
          gap: 10px;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .pot-display {
            min-width: 150px;
            padding: 15px;
          }

          .pot-amount {
            font-size: 24px;
          }

          .chip {
            width: 25px;
            height: 6px;
          }

          .chips-stack {
            height: 40px;
          }
        }

        /* Animation keyframes */
        @keyframes chipFall {
          0% {
            transform: translateY(-100px) rotate(0deg);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(0) rotate(360deg);
            opacity: 1;
          }
        }

        @keyframes potPulse {
          0%, 100% {
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          }
          50% {
            box-shadow: 0 8px 32px rgba(255, 215, 0, 0.3);
          }
        }

        .pot-display.pulsing {
          animation: potPulse 2s ease-in-out infinite;
        }

        /* High value pot styling */
        .pot-display[data-high-value="true"] {
          border-color: rgba(255, 215, 0, 0.5);
          background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 193, 7, 0.05) 100%);
        }

        .pot-display[data-high-value="true"] .pot-amount {
          font-size: 36px;
          animation: goldGlow 2s ease-in-out infinite;
        }

        @keyframes goldGlow {
          0%, 100% {
            text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
          }
          50% {
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.6);
          }
        }
      `}</style>
    </div>
  );
};