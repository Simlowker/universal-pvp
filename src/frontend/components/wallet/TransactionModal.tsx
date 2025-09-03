'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    signature?: string;
    type: string;
    amount: number;
    status: 'pending' | 'confirmed' | 'failed';
    description: string;
  } | null;
}

const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen || !transaction || transaction.status !== 'pending') return;

    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, transaction?.status]);

  useEffect(() => {
    if (isOpen) {
      setTimeElapsed(0);
    }
  }, [isOpen]);

  if (!transaction) return null;

  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'pending':
        return <LoadingSpinner size="lg" color="primary" />;
      case 'confirmed':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'failed':
        return <XCircle className="h-16 w-16 text-red-500" />;
      default:
        return <Clock className="h-16 w-16 text-yellow-500" />;
    }
  };

  const getStatusText = () => {
    switch (transaction.status) {
      case 'pending':
        return 'Processing Transaction...';
      case 'confirmed':
        return 'Transaction Confirmed!';
      case 'failed':
        return 'Transaction Failed';
      default:
        return 'Unknown Status';
    }
  };

  const getStatusColor = () => {
    switch (transaction.status) {
      case 'pending':
        return 'text-primary-400';
      case 'confirmed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-yellow-400';
    }
  };

  const openExplorer = () => {
    if (transaction.signature) {
      window.open(`https://explorer.solana.com/tx/${transaction.signature}`, '_blank');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction Status"
      size="md"
      closeOnOverlayClick={transaction.status !== 'pending'}
      closeOnEscape={transaction.status !== 'pending'}
      showCloseButton={transaction.status !== 'pending'}
    >
      <div className="text-center space-y-6">
        {/* Status Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="flex justify-center"
        >
          {getStatusIcon()}
        </motion.div>

        {/* Status Text */}
        <div className="space-y-2">
          <h3 className={`text-xl font-bold ${getStatusColor()} font-gaming`}>
            {getStatusText()}
          </h3>
          
          {transaction.status === 'pending' && (
            <p className="text-game-muted">
              Time elapsed: {formatTime(timeElapsed)}
            </p>
          )}
        </div>

        {/* Transaction Details */}
        <div className="bg-game-bg/50 rounded-lg p-4 space-y-3 text-left">
          <div className="flex justify-between">
            <span className="text-game-muted">Type:</span>
            <span className="text-game-text capitalize">{transaction.type.replace('_', ' ')}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-game-muted">Amount:</span>
            <span className="text-game-text font-bold">
              ◎ {transaction.amount.toFixed(6)}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-game-muted">Description:</span>
            <span className="text-game-text">{transaction.description}</span>
          </div>
          
          {transaction.signature && (
            <div className="flex justify-between items-center">
              <span className="text-game-muted">Signature:</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-game-text">
                  {transaction.signature.slice(0, 8)}...{transaction.signature.slice(-8)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openExplorer}
                  className="p-1"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {transaction.status === 'pending' && (
          <div className="text-center space-y-2">
            <p className="text-game-muted text-sm">
              Please wait while your transaction is being processed on the blockchain.
            </p>
            <p className="text-game-muted text-xs">
              This usually takes 10-30 seconds.
            </p>
          </div>
        )}

        {transaction.status === 'confirmed' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center space-y-2"
          >
            <p className="text-green-400 font-semibold">
              Your transaction has been successfully confirmed!
            </p>
          </motion.div>
        )}

        {transaction.status === 'failed' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center space-y-2"
          >
            <p className="text-red-400 font-semibold">
              Transaction failed. Please try again.
            </p>
            <p className="text-game-muted text-sm">
              If the problem persists, please contact support.
            </p>
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {transaction.signature && (
            <Button
              onClick={openExplorer}
              variant="outline"
              leftIcon={<ExternalLink className="h-4 w-4" />}
              fullWidth
            >
              View on Explorer
            </Button>
          )}
          
          {transaction.status !== 'pending' && (
            <Button
              onClick={onClose}
              variant="primary"
              fullWidth
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TransactionModal;