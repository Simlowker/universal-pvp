'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface PayoutInfo {
  id: string;
  amount: number;
  multiplier?: number;
  betAmount?: number;
  profit?: number;
  currency?: string;
  timestamp: Date;
  type: 'win' | 'partial_win' | 'loss' | 'cashout' | 'bonus';
  match?: {
    id: string;
    name: string;
    result?: string;
  };
  taxInfo?: {
    taxable: boolean;
    taxAmount?: number;
    taxRate?: number;
  };
}

interface PayoutDisplayProps {
  payout?: PayoutInfo;
  showAnimation?: boolean;
  showDetails?: boolean;
  showHistory?: boolean;
  payoutHistory?: PayoutInfo[];
  onWithdraw?: () => void;
  onViewDetails?: (payout: PayoutInfo) => void;
  className?: string;
}

const COIN_ANIMATIONS = [
  '💰', '🪙', '💳', '💎', '⭐', '🏆', '💵', '🎰'
];

export const PayoutDisplay: React.FC<PayoutDisplayProps> = ({
  payout,
  showAnimation = true,
  showDetails = true,
  showHistory = false,
  payoutHistory = [],
  onWithdraw,
  onViewDetails,
  className = ''
}) => {
  const [animationComplete, setAnimationComplete] = useState(false);
  const [coins, setCoins] = useState<Array<{ id: string; emoji: string; x: number; delay: number }>>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<PayoutInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate coin rain animation
  useEffect(() => {
    if (payout && payout.type === 'win' && showAnimation) {
      const coinCount = Math.min(Math.floor(payout.amount * 2), 20);
      const newCoins = Array.from({ length: coinCount }, (_, i) => ({
        id: `coin-${i}`,
        emoji: COIN_ANIMATIONS[Math.floor(Math.random() * COIN_ANIMATIONS.length)],
        x: Math.random() * 100,
        delay: Math.random() * 2
      }));
      
      setCoins(newCoins);
      setAnimationComplete(false);

      // Clear coins after animation
      const timer = setTimeout(() => {
        setCoins([]);
        setAnimationComplete(true);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [payout, showAnimation]);

  const formatCurrency = (amount: number, currency = 'SOL') => {
    return `${amount.toFixed(3)} ${currency}`;
  };

  const getPayoutColor = (type: PayoutInfo['type']) => {
    switch (type) {
      case 'win': return 'text-green-500';
      case 'partial_win': return 'text-yellow-500';
      case 'bonus': return 'text-purple-500';
      case 'cashout': return 'text-blue-500';
      case 'loss': return 'text-red-500';
      default: return 'text-game-text';
    }
  };

  const getPayoutIcon = (type: PayoutInfo['type']) => {
    switch (type) {
      case 'win': return '🏆';
      case 'partial_win': return '🎯';
      case 'bonus': return '🎁';
      case 'cashout': return '💰';
      case 'loss': return '💸';
      default: return '📊';
    }
  };

  const getPayoutTitle = (type: PayoutInfo['type']) => {
    switch (type) {
      case 'win': return 'Congratulations! You Won!';
      case 'partial_win': return 'Partial Win!';
      case 'bonus': return 'Bonus Payout!';
      case 'cashout': return 'Successful Cashout!';
      case 'loss': return 'Better luck next time';
      default: return 'Payout Result';
    }
  };

  if (!payout && !showHistory) {
    return (
      <div className={clsx('text-center py-8', className)}>
        <div className="text-4xl mb-2">💰</div>
        <p className="text-game-muted">No recent payouts</p>
      </div>
    );
  }

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      {/* Coin Rain Animation */}
      <AnimatePresence>
        {coins.map((coin) => (
          <motion.div
            key={coin.id}
            initial={{ y: -50, x: `${coin.x}%`, opacity: 1, scale: 0 }}
            animate={{ 
              y: '100vh', 
              x: `${coin.x + (Math.random() - 0.5) * 20}%`,
              scale: [0, 1, 1, 0],
              opacity: [0, 1, 1, 0],
              rotate: [0, 360, 720]
            }}
            transition={{ 
              duration: 3 + coin.delay,
              delay: coin.delay,
              ease: "easeIn"
            }}
            className="absolute text-2xl pointer-events-none z-50"
          >
            {coin.emoji}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Main Payout Display */}
      {payout && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={clsx(
            'bg-gradient-to-br from-game-surface to-game-bg border-2 rounded-2xl p-6 text-center shadow-2xl',
            payout.type === 'win' && 'border-green-500 shadow-green-500/25',
            payout.type === 'loss' && 'border-red-500 shadow-red-500/25',
            payout.type === 'bonus' && 'border-purple-500 shadow-purple-500/25'
          )}
        >
          {/* Payout Icon & Title */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mb-4"
          >
            <div className="text-6xl mb-2">{getPayoutIcon(payout.type)}</div>
            <h2 className="text-xl font-bold text-game-text">
              {getPayoutTitle(payout.type)}
            </h2>
          </motion.div>

          {/* Payout Amount */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
            className="mb-6"
          >
            <div className={clsx('text-5xl font-bold mb-2', getPayoutColor(payout.type))}>
              {payout.type !== 'loss' ? '+' : '-'}{formatCurrency(payout.amount, payout.currency)}
            </div>
            
            {payout.multiplier && payout.multiplier > 1 && (
              <div className="text-lg text-game-muted">
                {payout.multiplier.toFixed(2)}x multiplier
              </div>
            )}
          </motion.div>

          {/* Detailed Breakdown */}
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-game-bg rounded-lg p-4 mb-4"
            >
              <div className="grid grid-cols-2 gap-4 text-sm">
                {payout.betAmount && (
                  <div className="text-center">
                    <div className="text-game-muted">Bet Amount</div>
                    <div className="font-medium text-game-text">
                      {formatCurrency(payout.betAmount, payout.currency)}
                    </div>
                  </div>
                )}
                
                {payout.profit !== undefined && (
                  <div className="text-center">
                    <div className="text-game-muted">Profit/Loss</div>
                    <div className={clsx('font-medium', getPayoutColor(payout.type))}>
                      {payout.profit >= 0 ? '+' : ''}{formatCurrency(payout.profit, payout.currency)}
                    </div>
                  </div>
                )}
              </div>

              {payout.match && (
                <div className="mt-4 pt-4 border-t border-game-border">
                  <div className="text-center">
                    <div className="text-game-muted text-xs">Match</div>
                    <div className="font-medium text-game-text text-sm">
                      {payout.match.name}
                    </div>
                    {payout.match.result && (
                      <div className="text-xs text-game-muted mt-1">
                        Result: {payout.match.result}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tax Information */}
              {payout.taxInfo?.taxable && (
                <div className="mt-4 pt-4 border-t border-game-border">
                  <div className="text-center">
                    <div className="text-yellow-600 text-xs font-medium mb-1">
                      ⚠️ Tax Information
                    </div>
                    <div className="text-xs text-game-muted">
                      Taxable amount: {formatCurrency(payout.amount, payout.currency)}
                    </div>
                    {payout.taxInfo.taxAmount && (
                      <div className="text-xs text-game-muted">
                        Estimated tax: {formatCurrency(payout.taxInfo.taxAmount, payout.currency)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="flex gap-3"
          >
            {payout.type !== 'loss' && onWithdraw && (
              <button
                onClick={onWithdraw}
                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-all font-medium"
              >
                💳 Withdraw
              </button>
            )}
            
            {onViewDetails && (
              <button
                onClick={() => onViewDetails(payout)}
                className="flex-1 py-3 bg-game-border text-game-text rounded-lg hover:bg-primary-500 hover:text-white transition-all font-medium"
              >
                📋 Details
              </button>
            )}
          </motion.div>

          {/* Timestamp */}
          <div className="text-xs text-game-muted mt-4">
            {payout.timestamp.toLocaleString()}
          </div>
        </motion.div>
      )}

      {/* Payout History */}
      {showHistory && payoutHistory.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-game-text mb-4">Recent Payouts</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {payoutHistory.slice(0, 10).map((historyItem) => (
              <motion.div
                key={historyItem.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={clsx(
                  'bg-game-surface border border-game-border rounded-lg p-4 cursor-pointer hover:bg-game-border transition-colors',
                  selectedHistoryItem?.id === historyItem.id && 'ring-2 ring-primary-500'
                )}
                onClick={() => setSelectedHistoryItem(historyItem)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getPayoutIcon(historyItem.type)}</span>
                    <div>
                      <div className="text-sm font-medium text-game-text">
                        {historyItem.match?.name || `${historyItem.type} Payout`}
                      </div>
                      <div className="text-xs text-game-muted">
                        {historyItem.timestamp.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={clsx('font-medium', getPayoutColor(historyItem.type))}>
                      {historyItem.type !== 'loss' ? '+' : '-'}{formatCurrency(historyItem.amount, historyItem.currency)}
                    </div>
                    {historyItem.multiplier && historyItem.multiplier > 1 && (
                      <div className="text-xs text-game-muted">
                        {historyItem.multiplier.toFixed(2)}x
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* History Detail Modal */}
      <AnimatePresence>
        {selectedHistoryItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedHistoryItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <span className="text-4xl">{getPayoutIcon(selectedHistoryItem.type)}</span>
                <h3 className="text-lg font-semibold text-game-text mt-2">
                  Payout Details
                </h3>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-game-muted">Amount:</span>
                  <span className={clsx('font-medium', getPayoutColor(selectedHistoryItem.type))}>
                    {selectedHistoryItem.type !== 'loss' ? '+' : '-'}{formatCurrency(selectedHistoryItem.amount, selectedHistoryItem.currency)}
                  </span>
                </div>

                {selectedHistoryItem.betAmount && (
                  <div className="flex justify-between">
                    <span className="text-game-muted">Bet Amount:</span>
                    <span className="font-medium text-game-text">
                      {formatCurrency(selectedHistoryItem.betAmount, selectedHistoryItem.currency)}
                    </span>
                  </div>
                )}

                {selectedHistoryItem.multiplier && (
                  <div className="flex justify-between">
                    <span className="text-game-muted">Multiplier:</span>
                    <span className="font-medium text-game-text">
                      {selectedHistoryItem.multiplier.toFixed(2)}x
                    </span>
                  </div>
                )}

                {selectedHistoryItem.profit !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-game-muted">Profit/Loss:</span>
                    <span className={clsx('font-medium', getPayoutColor(selectedHistoryItem.type))}>
                      {selectedHistoryItem.profit >= 0 ? '+' : ''}{formatCurrency(selectedHistoryItem.profit, selectedHistoryItem.currency)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-game-muted">Date:</span>
                  <span className="font-medium text-game-text">
                    {selectedHistoryItem.timestamp.toLocaleString()}
                  </span>
                </div>

                {selectedHistoryItem.match && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-game-muted">Match:</span>
                      <span className="font-medium text-game-text">
                        {selectedHistoryItem.match.name}
                      </span>
                    </div>
                    {selectedHistoryItem.match.result && (
                      <div className="flex justify-between">
                        <span className="text-game-muted">Result:</span>
                        <span className="font-medium text-game-text">
                          {selectedHistoryItem.match.result}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PayoutDisplay;