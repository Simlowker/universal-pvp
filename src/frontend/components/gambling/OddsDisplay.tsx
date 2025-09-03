'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface OddsData {
  id: string;
  selection: string;
  odds: number;
  previousOdds?: number;
  probability?: number;
  volume?: number;
  locked?: boolean;
  suspended?: boolean;
}

interface OddsDisplayProps {
  odds: OddsData[];
  format?: 'decimal' | 'fractional' | 'american';
  showProbability?: boolean;
  showMovement?: boolean;
  showVolume?: boolean;
  variant?: 'default' | 'compact' | 'expanded';
  onOddsSelect?: (selection: OddsData) => void;
  selectedOdds?: string[];
  refreshInterval?: number;
  className?: string;
}

type OddsMovement = 'up' | 'down' | 'stable';

export const OddsDisplay: React.FC<OddsDisplayProps> = ({
  odds = [],
  format = 'decimal',
  showProbability = true,
  showMovement = true,
  showVolume = false,
  variant = 'default',
  onOddsSelect,
  selectedOdds = [],
  refreshInterval = 1000,
  className = ''
}) => {
  const [displayFormat, setDisplayFormat] = useState<'decimal' | 'fractional' | 'american'>(format);
  const [movementIndicators, setMovementIndicators] = useState<Record<string, OddsMovement>>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Track odds movements
  useEffect(() => {
    const movements: Record<string, OddsMovement> = {};
    
    odds.forEach(odd => {
      if (odd.previousOdds && odd.previousOdds !== odd.odds) {
        movements[odd.id] = odd.odds > odd.previousOdds ? 'up' : 'down';
      } else {
        movements[odd.id] = 'stable';
      }
    });

    setMovementIndicators(movements);
    setLastUpdate(new Date());
  }, [odds]);

  const formatOdds = (odds: number, targetFormat: typeof displayFormat) => {
    switch (targetFormat) {
      case 'fractional':
        if (odds === 1) return 'EVS';
        const decimal = odds - 1;
        if (decimal < 1) {
          const numerator = Math.round(1 / decimal);
          return `1/${numerator}`;
        }
        // Convert to simple fraction
        const numerator = Math.round(decimal * 10);
        const denominator = 10;
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(numerator, denominator);
        return `${numerator / divisor}/${denominator / divisor}`;
      
      case 'american':
        if (odds === 2) return '+100';
        if (odds > 2) {
          return `+${Math.round((odds - 1) * 100)}`;
        } else {
          return `-${Math.round(100 / (odds - 1))}`;
        }
      
      default: // decimal
        return odds.toFixed(2);
    }
  };

  const calculateProbability = (odds: number) => {
    return ((1 / odds) * 100).toFixed(1);
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toFixed(0);
  };

  const getMovementColor = (movement: OddsMovement) => {
    switch (movement) {
      case 'up': return 'text-green-500';
      case 'down': return 'text-red-500';
      default: return 'text-game-muted';
    }
  };

  const getMovementIcon = (movement: OddsMovement) => {
    switch (movement) {
      case 'up': return '↗';
      case 'down': return '↘';
      default: return '→';
    }
  };

  const isCompact = variant === 'compact';
  const isExpanded = variant === 'expanded';

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-game-text font-semibold">Odds</h3>
          {showMovement && (
            <span className="text-game-muted text-xs">
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Format Selector */}
        <div className="flex rounded-lg bg-game-surface border border-game-border overflow-hidden">
          {['decimal', 'fractional', 'american'].map((fmt) => (
            <button
              key={fmt}
              onClick={() => setDisplayFormat(fmt as typeof displayFormat)}
              className={clsx(
                'px-3 py-1 text-xs font-medium transition-colors',
                displayFormat === fmt
                  ? 'bg-primary-500 text-white'
                  : 'text-game-muted hover:text-game-text hover:bg-game-border'
              )}
            >
              {fmt === 'decimal' ? 'DEC' : fmt === 'fractional' ? 'FRAC' : 'US'}
            </button>
          ))}
        </div>
      </div>

      {/* Odds Grid */}
      <div className={clsx(
        'grid gap-2',
        isCompact ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2',
        isExpanded && 'grid-cols-1'
      )}>
        <AnimatePresence>
          {odds.map((odd) => {
            const isSelected = selectedOdds.includes(odd.id);
            const movement = movementIndicators[odd.id] || 'stable';
            const isLocked = odd.locked || odd.suspended;

            return (
              <motion.div
                key={odd.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
                className={clsx(
                  'relative group cursor-pointer transition-all duration-200',
                  isLocked && 'cursor-not-allowed opacity-60'
                )}
                onClick={() => !isLocked && onOddsSelect?.(odd)}
              >
                <motion.div
                  whileHover={!isLocked ? { scale: 1.02 } : {}}
                  whileTap={!isLocked ? { scale: 0.98 } : {}}
                  className={clsx(
                    'bg-game-surface border-2 rounded-lg p-3 transition-all duration-200',
                    isSelected 
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950' 
                      : 'border-game-border hover:border-primary-300',
                    isLocked && 'bg-gray-100 dark:bg-gray-800',
                    !isCompact && 'p-4'
                  )}
                >
                  {/* Lock/Suspend Indicator */}
                  {isLocked && (
                    <div className="absolute top-2 right-2">
                      <span className="text-yellow-500 text-sm">
                        {odd.suspended ? '⏸' : '🔒'}
                      </span>
                    </div>
                  )}

                  {/* Selection Name */}
                  <div className="flex items-start justify-between mb-2">
                    <h4 className={clsx(
                      'font-medium leading-tight',
                      isCompact ? 'text-sm' : 'text-base',
                      isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-game-text'
                    )}>
                      {odd.selection}
                    </h4>

                    {/* Movement Indicator */}
                    {showMovement && movement !== 'stable' && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={clsx('text-sm ml-2', getMovementColor(movement))}
                      >
                        {getMovementIcon(movement)}
                      </motion.span>
                    )}
                  </div>

                  {/* Odds Value */}
                  <div className="flex items-center justify-between">
                    <div className={clsx(
                      'font-bold transition-colors',
                      isCompact ? 'text-lg' : 'text-xl',
                      isSelected 
                        ? 'text-primary-600 dark:text-primary-400' 
                        : 'text-game-text group-hover:text-primary-600'
                    )}>
                      {formatOdds(odd.odds, displayFormat)}
                    </div>

                    {/* Probability */}
                    {showProbability && (
                      <div className="text-right">
                        <div className={clsx(
                          'text-game-muted font-medium',
                          isCompact ? 'text-xs' : 'text-sm'
                        )}>
                          {calculateProbability(odd.odds)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Additional Info Row */}
                  {(showVolume && odd.volume) || isExpanded ? (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-game-border">
                      {showVolume && odd.volume && (
                        <div className="text-xs text-game-muted">
                          Vol: {formatVolume(odd.volume)}
                        </div>
                      )}
                      
                      {isExpanded && odd.previousOdds && (
                        <div className="text-xs text-game-muted">
                          Was: {formatOdds(odd.previousOdds, displayFormat)}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Selection Highlight */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 bg-primary-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold"
                    >
                      ✓
                    </motion.div>
                  )}
                </motion.div>

                {/* Hover Tooltip for Expanded Info */}
                {!isExpanded && !isCompact && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    <div>Probability: {calculateProbability(odd.odds)}%</div>
                    {odd.volume && <div>Volume: {formatVolume(odd.volume)}</div>}
                    {odd.previousOdds && (
                      <div>Previous: {formatOdds(odd.previousOdds, displayFormat)}</div>
                    )}
                    {/* Tooltip Arrow */}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black"></div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {odds.length === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-game-muted">No odds available</p>
        </div>
      )}

      {/* Best Odds Indicator */}
      {odds.length > 1 && (
        <div className="text-xs text-game-muted text-center">
          💡 Best odds are highlighted automatically
        </div>
      )}
    </div>
  );
};

export default OddsDisplay;