'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface BetSelection {
  id: string;
  matchId: string;
  market: string;
  selection: string;
  odds: number;
  stake?: number;
  maxStake?: number;
  minStake?: number;
}

interface BetSlipProps {
  selections: BetSelection[];
  onUpdateStake: (selectionId: string, stake: number) => void;
  onRemoveSelection: (selectionId: string) => void;
  onPlaceBet: () => void;
  onClearAll: () => void;
  isPlacingBet?: boolean;
  maxTotalStake?: number;
  currency?: string;
  variant?: 'compact' | 'expanded' | 'mobile';
  className?: string;
}

const QUICK_STAKE_AMOUNTS = [5, 10, 25, 50, 100];

export const BetSlip: React.FC<BetSlipProps> = ({
  selections = [],
  onUpdateStake,
  onRemoveSelection,
  onPlaceBet,
  onClearAll,
  isPlacingBet = false,
  maxTotalStake = 1000,
  currency = 'SOL',
  variant = 'expanded',
  className = ''
}) => {
  const [totalStake, setTotalStake] = useState(0);
  const [potentialPayout, setPotentialPayout] = useState(0);
  const [betType, setBetType] = useState<'single' | 'accumulator'>('single');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const stakeInputRefs = useRef<{ [key: string]: HTMLInputElement }>({});

  // Calculate totals when selections or stakes change
  useEffect(() => {
    const total = selections.reduce((sum, selection) => sum + (selection.stake || 0), 0);
    setTotalStake(total);

    if (betType === 'single') {
      const payout = selections.reduce((sum, selection) => {
        return sum + ((selection.stake || 0) * selection.odds);
      }, 0);
      setPotentialPayout(payout);
    } else {
      // Accumulator bet
      const combinedOdds = selections.reduce((odds, selection) => odds * selection.odds, 1);
      setPotentialPayout(total * combinedOdds);
    }
  }, [selections, betType]);

  const handleStakeChange = (selectionId: string, value: string) => {
    const stake = Math.max(0, parseFloat(value) || 0);
    const selection = selections.find(s => s.id === selectionId);
    
    if (selection) {
      const clampedStake = Math.min(stake, selection.maxStake || maxTotalStake);
      onUpdateStake(selectionId, clampedStake);
    }
  };

  const handleQuickStake = (selectionId: string, amount: number) => {
    const selection = selections.find(s => s.id === selectionId);
    if (selection) {
      const clampedStake = Math.min(amount, selection.maxStake || maxTotalStake);
      onUpdateStake(selectionId, clampedStake);
      
      // Focus the input to show the updated value
      const inputRef = stakeInputRefs.current[selectionId];
      if (inputRef) {
        inputRef.focus();
        inputRef.select();
      }
    }
  };

  const handlePlaceBet = () => {
    if (totalStake > 0 && selections.length > 0) {
      setShowConfirmation(true);
    }
  };

  const confirmBet = () => {
    setShowConfirmation(false);
    onPlaceBet();
  };

  const formatCurrency = (amount: number) => {
    return `${amount.toFixed(3)} ${currency}`;
  };

  const getOddsFormat = (odds: number, format: 'decimal' | 'fractional' | 'american' = 'decimal') => {
    switch (format) {
      case 'fractional':
        const numerator = Math.round((odds - 1) * 100);
        const denominator = 100;
        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(numerator, denominator);
        return `${numerator / divisor}/${denominator / divisor}`;
      case 'american':
        return odds >= 2 ? `+${Math.round((odds - 1) * 100)}` : `-${Math.round(100 / (odds - 1))}`;
      default:
        return odds.toFixed(2);
    }
  };

  const isCompact = variant === 'compact';
  const isMobile = variant === 'mobile';

  if (selections.length === 0) {
    return (
      <div className={clsx(
        'bg-game-surface border border-game-border rounded-xl p-6 text-center',
        isCompact && 'p-4',
        className
      )}>
        <div className="text-6xl mb-4">🎲</div>
        <h3 className="text-game-text text-lg font-semibold mb-2">Your Bet Slip</h3>
        <p className="text-game-muted text-sm">
          Select odds from matches to start building your bets
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={clsx(
        'bg-game-surface border border-game-border rounded-xl overflow-hidden',
        isMobile && 'fixed bottom-0 left-0 right-0 rounded-t-xl rounded-b-none border-b-0 z-50',
        className
      )}>
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-500 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <h3 className="text-lg font-semibold">Bet Slip</h3>
                <p className="text-primary-100 text-sm">
                  {selections.length} selection{selections.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            
            {selections.length > 0 && (
              <button
                onClick={onClearAll}
                className="text-primary-100 hover:text-white text-sm underline transition-colors"
                disabled={isPlacingBet}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Bet Type Selector */}
          {selections.length > 1 && !isCompact && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setBetType('single')}
                className={clsx(
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  betType === 'single'
                    ? 'bg-white text-primary-600'
                    : 'bg-primary-700 text-primary-100 hover:bg-primary-600'
                )}
              >
                Single Bets
              </button>
              <button
                onClick={() => setBetType('accumulator')}
                className={clsx(
                  'px-3 py-1 rounded text-sm font-medium transition-colors',
                  betType === 'accumulator'
                    ? 'bg-white text-primary-600'
                    : 'bg-primary-700 text-primary-100 hover:bg-primary-600'
                )}
              >
                Accumulator
              </button>
            </div>
          )}
        </div>

        {/* Selections */}
        <div className={clsx('max-h-96 overflow-y-auto', isMobile && 'max-h-60')}>
          <AnimatePresence>
            {selections.map((selection, index) => (
              <motion.div
                key={selection.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-b border-game-border last:border-b-0"
              >
                <div className="p-4 space-y-3">
                  {/* Selection Info */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-game-text font-medium text-sm">
                        {selection.market}
                      </h4>
                      <p className="text-game-muted text-xs mt-1 truncate">
                        {selection.selection}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-3">
                      <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded text-sm font-semibold">
                        {getOddsFormat(selection.odds)}
                      </span>
                      <button
                        onClick={() => onRemoveSelection(selection.id)}
                        className="text-game-muted hover:text-red-500 transition-colors"
                        disabled={isPlacingBet}
                        aria-label="Remove selection"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Stake Input */}
                  {(betType === 'single' || index === 0) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-game-muted text-xs font-medium">
                          Stake:
                        </label>
                        <div className="flex-1 relative">
                          <input
                            ref={(ref) => {
                              if (ref) stakeInputRefs.current[selection.id] = ref;
                            }}
                            type="number"
                            min={selection.minStake || 0.001}
                            max={selection.maxStake || maxTotalStake}
                            step="0.001"
                            value={selection.stake || ''}
                            onChange={(e) => handleStakeChange(selection.id, e.target.value)}
                            className="w-full bg-game-bg border border-game-border rounded px-3 py-2 text-game-text text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="0.000"
                            disabled={isPlacingBet}
                          />
                          <span className="absolute right-3 top-2 text-game-muted text-xs">
                            {currency}
                          </span>
                        </div>
                      </div>

                      {/* Quick Stake Buttons */}
                      {!isCompact && (
                        <div className="flex gap-1 flex-wrap">
                          {QUICK_STAKE_AMOUNTS.map((amount) => (
                            <button
                              key={amount}
                              onClick={() => handleQuickStake(selection.id, amount)}
                              className="px-2 py-1 bg-game-border hover:bg-primary-500 hover:text-white rounded text-xs transition-colors"
                              disabled={isPlacingBet}
                            >
                              {amount}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Potential Return */}
                      {selection.stake && selection.stake > 0 && (
                        <div className="text-xs text-game-muted">
                          Returns: <span className="text-green-500 font-medium">
                            {formatCurrency(selection.stake * selection.odds)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Totals & Place Bet */}
        <div className="bg-game-bg border-t border-game-border p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-game-muted text-sm">Total Stake:</span>
            <span className="text-game-text font-semibold">
              {formatCurrency(totalStake)}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-game-muted text-sm">Potential Payout:</span>
            <span className="text-green-500 font-semibold text-lg">
              {formatCurrency(potentialPayout)}
            </span>
          </div>

          {betType === 'accumulator' && selections.length > 1 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-game-muted">Combined Odds:</span>
              <span className="text-primary-500 font-medium">
                {selections.reduce((odds, s) => odds * s.odds, 1).toFixed(2)}
              </span>
            </div>
          )}

          <motion.button
            onClick={handlePlaceBet}
            disabled={totalStake === 0 || isPlacingBet}
            className={clsx(
              'w-full py-3 rounded-lg font-semibold text-lg transition-all duration-200',
              totalStake > 0
                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-700 hover:to-green-600 shadow-lg hover:shadow-xl'
                : 'bg-game-border text-game-muted cursor-not-allowed'
            )}
            whileHover={totalStake > 0 ? { scale: 1.02 } : {}}
            whileTap={totalStake > 0 ? { scale: 0.98 } : {}}
          >
            {isPlacingBet ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Placing Bet...
              </div>
            ) : (
              `Place Bet - ${formatCurrency(totalStake)}`
            )}
          </motion.button>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfirmation(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-game-text text-lg font-semibold mb-4">
                Confirm Your Bet
              </h3>
              
              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-game-muted">Total Stake:</span>
                  <span className="text-game-text font-medium">
                    {formatCurrency(totalStake)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-game-muted">Potential Payout:</span>
                  <span className="text-green-500 font-semibold">
                    {formatCurrency(potentialPayout)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-game-muted">Potential Profit:</span>
                  <span className="text-green-500 font-semibold">
                    {formatCurrency(potentialPayout - totalStake)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="flex-1 py-2 px-4 border border-game-border text-game-text rounded-lg hover:bg-game-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBet}
                  className="flex-1 py-2 px-4 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-colors"
                >
                  Confirm Bet
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default BetSlip;