'use client';

import React, { ButtonHTMLAttributes, forwardRef, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { useGameSounds } from '../../frontend/hooks/useSound';
import { useTouchFeedback } from '../hooks/useTouchFeedback';

interface MobileButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gaming';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'touch';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  glowing?: boolean;
  hapticFeedback?: 'light' | 'medium' | 'heavy' | 'none';
  longPressEnabled?: boolean;
  onLongPress?: () => void;
  touchOptimized?: boolean;
}

const MobileButton = forwardRef<HTMLButtonElement, MobileButtonProps>(({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  glowing = false,
  hapticFeedback = 'medium',
  longPressEnabled = false,
  onLongPress,
  touchOptimized = true,
  children,
  disabled,
  onClick,
  onTouchStart,
  onTouchEnd,
  ...props
}, ref) => {
  const { playSound } = useGameSounds();
  const { triggerHaptic } = useTouchFeedback();
  const longPressTimer = useRef<NodeJS.Timeout>();
  const touchStart = useRef<number>();

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    
    touchStart.current = Date.now();
    
    if (hapticFeedback !== 'none') {
      triggerHaptic(hapticFeedback);
    }
    
    if (longPressEnabled && onLongPress) {
      longPressTimer.current = setTimeout(() => {
        triggerHaptic('heavy');
        onLongPress();
      }, 500);
    }
    
    onTouchStart?.(e);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    onTouchEnd?.(e);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    
    // Prevent double-tap zoom on iOS
    e.preventDefault();
    
    playSound('click');
    
    // Only trigger haptic if not already triggered by touch
    if (!touchStart.current || Date.now() - touchStart.current > 100) {
      if (hapticFeedback !== 'none') {
        triggerHaptic(hapticFeedback);
      }
    }
    
    onClick?.(e);
  };

  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const baseClasses = clsx(
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-game-bg',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'active:scale-95 transform-gpu',
    touchOptimized && [
      'touch-manipulation', // Optimize for touch
      'select-none', // Prevent text selection
      '-webkit-touch-callout-none', // Disable iOS callout
      '-webkit-user-select-none', // Disable text selection
      'user-select-none'
    ]
  );

  const variantClasses = {
    primary: 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-700 hover:to-primary-600 focus:ring-primary-500 shadow-lg active:shadow-md',
    secondary: 'bg-game-surface text-game-text border border-game-border hover:bg-game-border focus:ring-primary-500',
    outline: 'border-2 border-primary-500 text-primary-500 hover:bg-primary-500 hover:text-white focus:ring-primary-500',
    ghost: 'text-game-text hover:bg-game-surface focus:ring-primary-500',
    danger: 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600 focus:ring-red-500 shadow-lg active:shadow-md',
    gaming: 'bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 text-white shadow-xl hover:shadow-2xl focus:ring-purple-500 animate-gradient-x',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm gap-2 min-h-[36px]',
    md: 'px-4 py-3 text-base gap-2 min-h-[44px]',
    lg: 'px-6 py-4 text-lg gap-3 min-h-[52px]',
    xl: 'px-8 py-5 text-xl gap-3 min-h-[60px]',
    touch: 'px-6 py-4 text-base gap-3 min-h-[48px] min-w-[48px]', // iOS/Android recommended touch target
  };

  const glowClasses = glowing ? 'animate-pulse-glow shadow-2xl shadow-primary-500/25' : '';

  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.95 }}
      transition={{ duration: 0.1 }}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        glowClasses,
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      {...props}
    >
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
        </motion.div>
      )}
      <div className={clsx('flex items-center gap-2', loading && 'opacity-0')}>
        {leftIcon}
        <span>{children}</span>
        {rightIcon}
      </div>
    </motion.button>
  );
});

MobileButton.displayName = 'MobileButton';

export default MobileButton;