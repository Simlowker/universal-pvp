'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ExternalLink, 
  Zap,
  Coins,
  X,
  RefreshCw
} from 'lucide-react';
import { Transaction } from '../../types/wallet';
import { formatDistanceToNow } from 'date-fns';
import Button from '../ui/Button';

interface TransactionStatusToastProps {
  transaction: Transaction;
  onClose: () => void;
  onRetry?: () => void;
  showExplorerLink?: boolean;
  autoClose?: boolean;
  duration?: number;
}

interface TransactionToastManagerProps {
  transactions: Transaction[];
  maxVisible?: number;
}

const TRANSACTION_ICONS = {
  bet: <Coins className="h-4 w-4" />,
  reward: <Zap className="h-4 w-4 text-yellow-400" />,
  nft_trade: <div className="h-4 w-4 bg-gradient-to-br from-purple-400 to-pink-400 rounded" />,
  token_transfer: <div className="h-4 w-4 bg-blue-400 rounded-full" />,
};

const TRANSACTION_MESSAGES = {
  bet: {
    pending: 'Placing bet...',
    confirmed: 'Bet placed successfully!',
    failed: 'Failed to place bet',
  },
  reward: {
    pending: 'Claiming reward...',
    confirmed: 'Reward claimed!',
    failed: 'Failed to claim reward',
  },
  nft_trade: {
    pending: 'Processing NFT trade...',
    confirmed: 'NFT trade completed!',
    failed: 'NFT trade failed',
  },
  token_transfer: {
    pending: 'Transferring tokens...',
    confirmed: 'Tokens transferred!',
    failed: 'Token transfer failed',
  },
};

const TransactionStatusToast: React.FC<TransactionStatusToastProps> = ({
  transaction,
  onClose,
  onRetry,
  showExplorerLink = true,
  autoClose = true,
  duration = 5000
}) => {
  const [timeLeft, setTimeLeft] = useState(autoClose ? duration : 0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-close timer
  useEffect(() => {
    if (!autoClose || timeLeft <= 0 || isPaused) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 100) {
          onClose();
          return 0;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [autoClose, timeLeft, isPaused, onClose]);

  // Auto-close successful/failed transactions
  useEffect(() => {
    if (autoClose && (transaction.status === 'confirmed' || transaction.status === 'failed')) {
      const timeout = setTimeout(onClose, duration);
      return () => clearTimeout(timeout);
    }
  }, [transaction.status, autoClose, duration, onClose]);

  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400 animate-pulse" />;
      case 'confirmed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (transaction.status) {
      case 'pending':
        return 'border-yellow-500/50 bg-yellow-500/10';
      case 'confirmed':
        return 'border-green-500/50 bg-green-500/10';
      case 'failed':
        return 'border-red-500/50 bg-red-500/10';
      default:
        return 'border-gray-500/50 bg-gray-500/10';
    }
  };

  const getMessage = () => {
    const messages = (TRANSACTION_MESSAGES as any)[transaction.type];
    return messages?.[transaction.status] || transaction.description;
  };

  const openExplorer = () => {
    if (transaction.signature) {
      window.open(`https://explorer.solana.com/tx/${transaction.signature}`, '_blank');
    }
  };

  const formatAmount = (amount: number) => {
    if (amount === 0) return '';
    return amount > 0 ? `+${amount}` : `${amount}`;
  };

  const progressPercentage = autoClose && timeLeft > 0 ? (timeLeft / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.95 }}
      className={`
        relative overflow-hidden rounded-lg border backdrop-blur-sm p-4 shadow-lg max-w-md
        ${getStatusColor()}
      `}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Progress bar */}
      {autoClose && transaction.status === 'pending' && (
        <div className="absolute bottom-0 left-0 h-1 bg-primary-500/30 w-full">
          <motion.div
            className="h-full bg-primary-500"
            initial={{ width: '100%' }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Transaction Type Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {(TRANSACTION_ICONS as any)[transaction.type] || <Coins className="h-4 w-4" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon()}
            <span className="font-semibold text-game-text text-sm">
              {getMessage()}
            </span>
            {transaction.amount !== 0 && (
              <span className={`text-sm font-mono ${
                transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatAmount(transaction.amount)} SOL
              </span>
            )}
          </div>

          {/* Transaction Details */}
          <div className="space-y-1">
            {transaction.signature && (
              <p className="text-xs text-game-muted font-mono">
                {transaction.signature.slice(0, 8)}...{transaction.signature.slice(-8)}
              </p>
            )}
            
            <p className="text-xs text-game-muted">
              {formatDistanceToNow(transaction.timestamp, { addSuffix: true })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {transaction.status === 'failed' && onRetry && (
              <Button
                onClick={onRetry}
                size="sm"
                variant="outline"
                leftIcon={<RefreshCw className="h-3 w-3" />}
                className="text-xs"
              >
                Retry
              </Button>
            )}
            
            {showExplorerLink && transaction.signature && (
              <Button
                onClick={openExplorer}
                size="sm"
                variant="ghost"
                leftIcon={<ExternalLink className="h-3 w-3" />}
                className="text-xs"
              >
                Explorer
              </Button>
            )}
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-game-muted hover:text-game-text transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
};

// Transaction Toast Manager Component
export const TransactionToastManager: React.FC<TransactionToastManagerProps> = ({
  transactions,
  maxVisible = 3
}) => {
  const [visibleTransactions, setVisibleTransactions] = useState<Set<string>>(new Set());

  // Show only the most recent transactions
  const recentTransactions = transactions
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, maxVisible);

  // Add new transactions to visible set
  useEffect(() => {
    recentTransactions.forEach(tx => {
      if (!visibleTransactions.has(tx.signature)) {
        setVisibleTransactions(prev => {
          const newSet = new Set(prev);
          newSet.add(tx.signature);
          return newSet;
        });
      }
    });
  }, [recentTransactions, visibleTransactions]);

  const handleClose = (signature: string) => {
    setVisibleTransactions(prev => {
      const newSet = new Set(prev);
      newSet.delete(signature);
      return newSet;
    });
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      <AnimatePresence mode="popLayout">
        {recentTransactions
          .filter(tx => visibleTransactions.has(tx.signature))
          .map((transaction) => (
            <TransactionStatusToast
              key={transaction.signature}
              transaction={transaction}
              onClose={() => handleClose(transaction.signature)}
            />
          ))}
      </AnimatePresence>
    </div>
  );
};

export default TransactionStatusToast;