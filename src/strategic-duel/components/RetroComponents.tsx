// ===============================================
//  STRATEGIC DUEL - RETRO ARCADE COMPONENTS
//  Complete pixel-perfect gaming UI library
//  Authentic 1980s arcade game aesthetics
// ===============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import '../../styles/RetroStyles.css';

// ===============================================
// 1. PIXEL BUTTON - Arcade-style with 3D depth
// ===============================================
interface PixelButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'small' | 'medium' | 'large';
  glitch?: boolean;
  pulse?: boolean;
  className?: string;
}

export const PixelButton: React.FC<PixelButtonProps> = ({ 
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  glitch = false,
  pulse = false,
  className = ''
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const variantClasses = {
    primary: 'retro-button',
    secondary: 'retro-button blue',
    danger: 'retro-button red',
    success: 'retro-button',
    warning: 'retro-button yellow'
  };

  const sizeClasses = {
    small: 'px-4 py-2 text-xs',
    medium: 'px-6 py-3 text-sm',
    large: 'px-8 py-4 text-base'
  };

  return (
    <motion.button
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${glitch ? 'glitch-effect' : ''} ${pulse ? 'pulse-slow' : ''}`}
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      whileHover={{ 
        scale: disabled ? 1 : 1.05,
        y: disabled ? 0 : -2
      }}
      whileTap={{ 
        scale: disabled ? 1 : 0.95,
        y: disabled ? 0 : 1
      }}
      transition={{ duration: 0.1 }}
    >
      {children}
    </motion.button>
  );
};

// ===============================================
// 2. ARCADE SCREEN - CRT monitor with scanlines
// ===============================================
interface ArcadeScreenProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showScanlines?: boolean;
  flicker?: boolean;
  curvature?: boolean;
  phosphorGlow?: boolean;
  className?: string;
}

export const ArcadeScreen: React.FC<ArcadeScreenProps> = ({ 
  children,
  title,
  subtitle,
  showScanlines = true,
  flicker = false,
  curvature = true,
  phosphorGlow = true,
  className = ''
}) => {
  return (
    <motion.div 
      className={`crt-screen ${flicker ? 'crt-flicker' : ''} ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {title && (
        <motion.div 
          className="text-center mb-4"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="title-text">{title}</h1>
          {subtitle && <p className="subtitle-text mt-2">{subtitle}</p>}
        </motion.div>
      )}
      
      <div className="relative">
        {children}
        
        {showScanlines && (
          <div className="scanlines" />
        )}
        
        {phosphorGlow && (
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.3) 100%)',
              borderRadius: 'inherit'
            }}
          />
        )}
      </div>
    </motion.div>
  );
};

// ===============================================
// 3. PIXEL AVATAR - Animated player sprites
// ===============================================
interface PixelAvatarProps {
  playerId: 1 | 2;
  isActive?: boolean;
  isWinner?: boolean;
  health?: number;
  maxHealth?: number;
  label?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({ 
  playerId,
  isActive = false,
  isWinner = false,
  health = 100,
  maxHealth = 100,
  label,
  size = 'medium',
  className = ''
}) => {
  const avatarColors = {
    1: 'electric-blue',
    2: 'hot-pink'
  };

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-24 h-24'
  };

  const healthPercent = (health / maxHealth) * 100;

  return (
    <motion.div 
      className={`text-center ${className}`}
      animate={isActive ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
    >
      <div className="relative">
        <motion.div 
          className={`unit-token player${playerId} ${sizeClasses[size]} mx-auto relative overflow-hidden`}
          animate={isWinner ? { 
            scale: [1, 1.3, 1.1],
            rotate: [0, 360, 0] 
          } : {}}
          transition={{ duration: 2, repeat: isWinner ? Infinity : 0 }}
        >
          {/* Pixel sprite pattern */}
          <div className="absolute inset-2 grid grid-cols-4 grid-rows-4 gap-px">
            {Array.from({ length: 16 }, (_, i) => (
              <motion.div 
                key={i}
                className={`bg-${avatarColors[playerId]}`}
                style={{ 
                  opacity: [0, 2, 6, 10, 14].includes(i) ? 1 : 
                          [1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15].includes(i) ? 0.8 : 0
                }}
                animate={isActive ? { opacity: [0.8, 1, 0.8] } : {}}
                transition={{ 
                  duration: 0.5, 
                  repeat: isActive ? Infinity : 0,
                  delay: i * 0.05 
                }}
              />
            ))}
          </div>

          {/* Health indicator */}
          {healthPercent < 100 && (
            <div className="absolute -top-2 left-0 right-0">
              <div className="bg-void-black h-1 border border-neon-green">
                <motion.div 
                  className="h-full bg-gradient-to-r from-danger-red via-cyber-yellow to-neon-green"
                  initial={{ width: '100%' }}
                  animate={{ width: `${healthPercent}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}
        </motion.div>

        {/* Winner effect */}
        <AnimatePresence>
          {isWinner && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              <div className="w-full h-full border-4 border-cyber-yellow animate-pulse" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {label && (
        <motion.div 
          className="pixel-text text-xs mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {label}
        </motion.div>
      )}
    </motion.div>
  );
};

// ===============================================
// 4. LED DISPLAY - Digital score/pot display
// ===============================================
interface LEDDisplayProps {
  value: number | string;
  label?: string;
  prefix?: string;
  suffix?: string;
  size?: 'small' | 'medium' | 'large';
  color?: 'green' | 'amber' | 'red' | 'blue';
  flicker?: boolean;
  countUp?: boolean;
  className?: string;
}

export const LEDDisplay: React.FC<LEDDisplayProps> = ({ 
  value,
  label,
  prefix = '',
  suffix = '',
  size = 'large',
  color = 'green',
  flicker = false,
  countUp = false,
  className = ''
}) => {
  const [displayValue, setDisplayValue] = useState(countUp ? 0 : value);
  
  useEffect(() => {
    if (countUp && typeof value === 'number') {
      const start = typeof displayValue === 'number' ? displayValue : 0;
      const end = value;
      const duration = 1000;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(start + (end - start) * progress);
        
        setDisplayValue(current);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    } else {
      setDisplayValue(value);
    }
  }, [value, countUp, displayValue]);

  const sizeClasses = {
    small: 'led-display small',
    medium: 'led-display',
    large: 'led-display large'
  };

  const colorStyles = {
    green: { color: 'var(--neon-green)', textShadow: '0 0 10px var(--neon-green-glow)' },
    amber: { color: 'var(--amber)', textShadow: '0 0 10px var(--amber-glow)' },
    red: { color: 'var(--danger-red)', textShadow: '0 0 10px var(--danger-red-glow)' },
    blue: { color: 'var(--electric-blue)', textShadow: '0 0 10px var(--electric-blue-glow)' }
  };

  return (
    <motion.div 
      className={`${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {label && (
        <div className="pixel-text text-xs text-center mb-2 text-electric-blue">
          {label}
        </div>
      )}
      
      <div 
        className={`${sizeClasses[size]} ${flicker ? 'neon-flicker' : ''}`}
        style={colorStyles[color]}
      >
        {prefix}
        {typeof displayValue === 'number' ? displayValue.toLocaleString() : displayValue}
        {suffix}
      </div>
    </motion.div>
  );
};

// ===============================================
// 5. COIN SLOT - Animated coin insertion
// ===============================================
interface CoinSlotProps {
  onCoinInsert?: () => void;
  credits?: number;
  disabled?: boolean;
  className?: string;
}

export const CoinSlot: React.FC<CoinSlotProps> = ({ 
  onCoinInsert,
  credits = 0,
  disabled = false,
  className = ''
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleCoinInsert = async () => {
    if (disabled || isAnimating) return;
    
    setIsAnimating(true);
    onCoinInsert?.();
    
    // Animation duration
    setTimeout(() => {
      setIsAnimating(false);
    }, 1000);
  };

  return (
    <motion.div 
      className={`arcade-panel p-6 ${className}`}
      whileHover={disabled ? {} : { scale: 1.05 }}
    >
      <div className="text-center">
        <LEDDisplay 
          value={credits}
          label="CREDITS"
          size="medium"
          color="amber"
          className="mb-4"
        />
        
        <motion.div 
          className={`relative w-20 h-6 mx-auto mb-4 bg-console-gray border-2 border-cyber-yellow cursor-pointer ${disabled ? 'opacity-50' : ''}`}
          onClick={handleCoinInsert}
          whileTap={disabled ? {} : { scale: 0.95 }}
        >
          {/* Coin slot opening */}
          <div className="absolute top-1 left-1 right-1 h-1 bg-void-black" />
          
          <AnimatePresence>
            {isAnimating && (
              <motion.div
                className="absolute -top-16 left-1/2 w-6 h-6 bg-amber rounded-full border-2 border-cyber-yellow"
                style={{ x: '-50%' }}
                initial={{ y: -20, rotateY: 0, opacity: 0 }}
                animate={{ y: 20, rotateY: 360, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
        </motion.div>
        
        <div className="pixel-text text-xs text-cyber-yellow">
          {disabled ? 'OUT OF ORDER' : 'INSERT COIN'}
        </div>
      </div>
    </motion.div>
  );
};

// ===============================================
// 6. PIXEL CARD - Retro playing card display
// ===============================================
interface PixelCardProps {
  suit?: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  value?: string | number;
  faceUp?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  glowColor?: 'green' | 'blue' | 'pink' | 'yellow' | 'red';
  className?: string;
}

export const PixelCard: React.FC<PixelCardProps> = ({ 
  suit = 'spades',
  value = 'A',
  faceUp = true,
  selected = false,
  disabled = false,
  onClick,
  glowColor = 'green',
  className = ''
}) => {
  const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  const suitColors = {
    hearts: 'text-danger-red',
    diamonds: 'text-danger-red', 
    clubs: 'text-electric-blue',
    spades: 'text-electric-blue'
  };

  return (
    <motion.div 
      className={`relative w-16 h-24 cursor-pointer ${className} ${disabled ? 'opacity-50' : ''}`}
      onClick={disabled ? undefined : onClick}
      whileHover={disabled ? {} : { scale: 1.1, y: -5 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      animate={selected ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className={`w-full h-full pixel-border bg-console-gray relative overflow-hidden ${selected ? `border-${glowColor} shadow-lg shadow-${glowColor}` : 'border-neon-green'}`}
        animate={faceUp ? { rotateY: 0 } : { rotateY: 180 }}
        transition={{ duration: 0.6 }}
      >
        {faceUp ? (
          <div className="p-2 h-full flex flex-col justify-between">
            <div className="text-left">
              <div className={`pixel-text text-xs ${suitColors[suit]}`}>{value}</div>
              <div className={`pixel-text text-lg ${suitColors[suit]} leading-none`}>
                {suitSymbols[suit]}
              </div>
            </div>
            
            <div className="text-center">
              <div className={`pixel-text text-2xl ${suitColors[suit]}`}>
                {suitSymbols[suit]}
              </div>
            </div>
            
            <div className="text-right transform rotate-180">
              <div className={`pixel-text text-xs ${suitColors[suit]}`}>{value}</div>
              <div className={`pixel-text text-lg ${suitColors[suit]} leading-none`}>
                {suitSymbols[suit]}
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-hot-pink border-2 border-electric-blue flex items-center justify-center">
            <div className="pixel-text text-xs text-electric-blue">CARD</div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ===============================================
// 7. RETRO TIMER - Arcade countdown timer
// ===============================================
interface RetroTimerProps {
  seconds: number;
  onComplete?: () => void;
  onTick?: (remaining: number) => void;
  warningThreshold?: number;
  criticalThreshold?: number;
  size?: 'small' | 'medium' | 'large';
  showProgressRing?: boolean;
  className?: string;
}

export const RetroTimer: React.FC<RetroTimerProps> = ({ 
  seconds,
  onComplete,
  onTick,
  warningThreshold = 10,
  criticalThreshold = 5,
  size = 'large',
  showProgressRing = true,
  className = ''
}) => {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const [isWarning, setIsWarning] = useState(false);
  const [isCritical, setIsCritical] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        onTick?.(newTime);
        
        setIsWarning(newTime <= warningThreshold && newTime > criticalThreshold);
        setIsCritical(newTime <= criticalThreshold);
        
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onComplete, onTick, warningThreshold, criticalThreshold]);

  const sizeClasses = {
    small: 'text-2xl',
    medium: 'text-4xl', 
    large: 'text-6xl'
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const secs = time % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((seconds - timeLeft) / seconds) * 100;

  return (
    <motion.div 
      className={`relative text-center ${className}`}
      animate={isCritical ? { scale: [1, 1.1, 1] } : {}}
      transition={{ duration: 0.5, repeat: isCritical ? Infinity : 0 }}
    >
      {showProgressRing && (
        <div className="relative w-32 h-32 mx-auto mb-4">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="var(--console-gray)"
              strokeWidth="8"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={isCritical ? "var(--danger-red)" : isWarning ? "var(--cyber-yellow)" : "var(--neon-green)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={283}
              initial={{ strokeDashoffset: 283 }}
              animate={{ strokeDashoffset: 283 - (progress * 283) / 100 }}
              transition={{ duration: 1 }}
            />
          </svg>
        </div>
      )}
      
      <LEDDisplay
        value={formatTime(timeLeft)}
        size={size}
        color={isCritical ? 'red' : isWarning ? 'amber' : 'green'}
        flicker={isCritical}
      />
      
      {isCritical && (
        <motion.div 
          className="pixel-text text-xs text-danger-red mt-2"
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          TIME CRITICAL!
        </motion.div>
      )}
    </motion.div>
  );
};

// ===============================================
// 8. PIXEL METER - 8-bit progress bars
// ===============================================
interface PixelMeterProps {
  value: number;
  max?: number;
  label?: string;
  color?: 'green' | 'blue' | 'red' | 'yellow' | 'pink';
  showSegments?: boolean;
  animated?: boolean;
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const PixelMeter: React.FC<PixelMeterProps> = ({ 
  value,
  max = 100,
  label,
  color = 'green',
  showSegments = true,
  animated = true,
  orientation = 'horizontal',
  size = 'medium',
  className = ''
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const segments = 10;
  const filledSegments = Math.ceil((percentage / 100) * segments);

  const colorClasses = {
    green: 'bg-neon-green border-neon-green',
    blue: 'bg-electric-blue border-electric-blue',
    red: 'bg-danger-red border-danger-red',
    yellow: 'bg-cyber-yellow border-cyber-yellow',
    pink: 'bg-hot-pink border-hot-pink'
  };

  const sizeClasses = {
    small: orientation === 'horizontal' ? 'h-2' : 'w-2 h-20',
    medium: orientation === 'horizontal' ? 'h-4' : 'w-4 h-32',
    large: orientation === 'horizontal' ? 'h-6' : 'w-6 h-40'
  };

  return (
    <motion.div className={className}>
      {label && (
        <div className="pixel-text text-xs text-electric-blue mb-2">
          {label}: {Math.round(percentage)}%
        </div>
      )}
      
      <div className={`energy-bar ${sizeClasses[size]} ${orientation === 'vertical' ? 'flex flex-col-reverse' : ''}`}>
        {showSegments ? (
          <div className={`flex ${orientation === 'vertical' ? 'flex-col-reverse h-full' : 'h-full'} gap-px`}>
            {Array.from({ length: segments }, (_, i) => (
              <motion.div
                key={i}
                className={`flex-1 ${i < filledSegments ? colorClasses[color] : 'bg-console-gray border-console-gray'} border`}
                initial={animated ? { opacity: 0, scale: 0.8 } : {}}
                animate={animated ? { 
                  opacity: i < filledSegments ? 1 : 0.3,
                  scale: i < filledSegments ? 1 : 0.8
                } : {}}
                transition={{ 
                  delay: animated ? i * 0.05 : 0,
                  duration: 0.2
                }}
              />
            ))}
          </div>
        ) : (
          <motion.div 
            className={`energy-fill ${colorClasses[color]} h-full`}
            initial={animated ? { width: 0 } : { width: `${percentage}%` }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: animated ? 0.8 : 0, ease: "easeOut" }}
          />
        )}
      </div>
    </motion.div>
  );
};

// ===============================================
// 9. GLITCH TEXT - Text with glitch effects
// ===============================================
interface GlitchTextProps {
  children: React.ReactNode;
  intensity?: 'low' | 'medium' | 'high';
  color?: string;
  trigger?: boolean;
  continuous?: boolean;
  className?: string;
}

export const GlitchText: React.FC<GlitchTextProps> = ({ 
  children,
  intensity = 'medium',
  color = 'text-danger-red',
  trigger = false,
  continuous = false,
  className = ''
}) => {
  const [isGlitching, setIsGlitching] = useState(continuous);
  const glitchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trigger) {
      setIsGlitching(true);
      const timer = setTimeout(() => {
        if (!continuous) setIsGlitching(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [trigger, continuous]);

  const glitchVariants = {
    low: { x: [-1, 1, -1, 0], duration: 0.1 },
    medium: { x: [-2, 2, -2, 1, 0], duration: 0.15 },
    high: { x: [-3, 3, -2, 2, -1, 0], duration: 0.2 }
  };

  return (
    <div className={`relative ${className}`} ref={glitchRef}>
      <motion.div 
        className={color}
        animate={isGlitching ? glitchVariants[intensity] : {}}
        transition={{ 
          repeat: isGlitching ? (continuous ? Infinity : 3) : 0,
          repeatType: "reverse"
        }}
      >
        {children}
      </motion.div>
      
      {isGlitching && (
        <>
          <motion.div
            className={`absolute top-0 left-0 ${color} opacity-70`}
            style={{ 
              clipPath: 'inset(0 0 80% 0)',
              filter: 'hue-rotate(90deg)'
            }}
            animate={{ x: [-2, 2, -1] }}
            transition={{ duration: 0.1, repeat: Infinity, repeatType: "reverse" }}
          >
            {children}
          </motion.div>
          <motion.div
            className={`absolute top-0 left-0 ${color} opacity-70`}
            style={{ 
              clipPath: 'inset(80% 0 0 0)',
              filter: 'hue-rotate(180deg)'
            }}
            animate={{ x: [2, -2, 1] }}
            transition={{ duration: 0.15, repeat: Infinity, repeatType: "reverse" }}
          >
            {children}
          </motion.div>
        </>
      )}
    </div>
  );
};

// ===============================================
// 10. WIN ANIMATION - Pixel explosion celebration
// ===============================================
interface WinAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
  winnerText?: string;
  color?: 'yellow' | 'red' | 'blue' | 'green' | 'pink';
  particles?: number;
  className?: string;
}

export const WinAnimation: React.FC<WinAnimationProps> = ({ 
  isVisible,
  onComplete,
  winnerText = "WINNER!",
  color = 'yellow',
  particles = 20,
  className = ''
}) => {
  const [showParticles, setShowParticles] = useState(false);
  
  useEffect(() => {
    if (isVisible) {
      setShowParticles(true);
      const timer = setTimeout(() => {
        setShowParticles(false);
        onComplete?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  const colorClasses = {
    yellow: 'text-cyber-yellow',
    red: 'text-danger-red',
    blue: 'text-electric-blue', 
    green: 'text-neon-green',
    pink: 'text-hot-pink'
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className={`fixed inset-0 flex items-center justify-center pointer-events-none z-50 ${className}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Main winner text */}
          <motion.div
            className={`pixel-text text-6xl ${colorClasses[color]} text-center relative z-10`}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ 
              scale: [0, 1.2, 1],
              rotate: [180, 0, 0],
              textShadow: [
                '0 0 20px currentColor',
                '0 0 40px currentColor, 0 0 60px currentColor',
                '0 0 20px currentColor'
              ]
            }}
            transition={{ 
              duration: 1.2, 
              times: [0, 0.6, 1],
              ease: "easeOut"
            }}
          >
            {winnerText}
          </motion.div>

          {/* Particle explosion */}
          {showParticles && Array.from({ length: particles }, (_, i) => (
            <motion.div
              key={i}
              className={`absolute w-4 h-4 ${colorClasses[color]}`}
              initial={{ 
                x: 0, 
                y: 0,
                scale: 0,
                rotate: 0 
              }}
              animate={{ 
                x: (Math.random() - 0.5) * 400,
                y: (Math.random() - 0.5) * 400,
                scale: [0, 1.5, 0],
                rotate: 360,
                opacity: [1, 1, 0]
              }}
              transition={{ 
                duration: 2,
                delay: Math.random() * 0.5,
                ease: "easeOut"
              }}
            >
              ★
            </motion.div>
          ))}

          {/* Screen flash effect */}
          <motion.div
            className="absolute inset-0 bg-cyber-yellow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 0.2, repeat: 3, repeatDelay: 0.3 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Export all components
export default {
  PixelButton,
  ArcadeScreen,
  PixelAvatar,
  LEDDisplay,
  CoinSlot,
  PixelCard,
  RetroTimer,
  PixelMeter,
  GlitchText,
  WinAnimation
};