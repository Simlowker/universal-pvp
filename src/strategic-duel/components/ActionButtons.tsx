import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface ActionButtonsProps {
  isMyTurn: boolean;
  onAction: (action: 'CHECK' | 'RAISE' | 'CALL' | 'FOLD', amount?: number) => void;
  disabled?: boolean;
  currentBet: number;
  playerChips: number;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  isMyTurn,
  onAction,
  disabled = false,
  currentBet,
  playerChips,
}) => {
  const [raiseAmount, setRaiseAmount] = useState(Math.min(currentBet * 2, playerChips));
  const [showRaiseSlider, setShowRaiseSlider] = useState(false);

  const handleRaise = () => {
    if (showRaiseSlider) {
      onAction('RAISE', raiseAmount);
      setShowRaiseSlider(false);
    } else {
      setShowRaiseSlider(true);
    }
  };

  const canCheck = currentBet === 0;
  const canCall = currentBet > 0 && playerChips >= currentBet;
  const canRaise = playerChips > currentBet;

  return (
    <div className="action-buttons-container">
      <div className="grid grid-cols-4 gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction('CHECK')}
          disabled={!isMyTurn || disabled || !canCheck}
          className={`action-btn check-btn ${!canCheck ? 'opacity-50' : ''}`}
        >
          CHECK
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRaise}
          disabled={!isMyTurn || disabled || !canRaise}
          className={`action-btn raise-btn ${!canRaise ? 'opacity-50' : ''}`}
        >
          RAISE
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction('CALL')}
          disabled={!isMyTurn || disabled || !canCall}
          className={`action-btn call-btn ${!canCall ? 'opacity-50' : ''}`}
        >
          CALL
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onAction('FOLD')}
          disabled={!isMyTurn || disabled}
          className="action-btn fold-btn"
        >
          FOLD
        </motion.button>
      </div>

      {showRaiseSlider && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="raise-slider-container mt-4 p-4 bg-gray-800/50 rounded-lg"
        >
          <div className="flex items-center gap-4">
            <span className="text-gray-400">Amount:</span>
            <input
              type="range"
              min={currentBet + 1}
              max={playerChips}
              value={raiseAmount}
              onChange={(e) => setRaiseAmount(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-white font-bold">{raiseAmount}</span>
            <button
              onClick={() => onAction('RAISE', raiseAmount)}
              className="px-4 py-2 bg-purple-600 rounded-lg text-white"
            >
              Confirm
            </button>
          </div>
        </motion.div>
      )}

      {isMyTurn && (
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mt-4 text-center text-green-400"
        >
          Your Turn - Make Your Move!
        </motion.div>
      )}

      <style jsx>{`
        .action-btn {
          @apply py-3 rounded-lg font-bold transition-all text-white;
        }
        
        .check-btn {
          @apply bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600;
        }
        
        .raise-btn {
          @apply bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600;
        }
        
        .call-btn {
          @apply bg-green-600 hover:bg-green-700 disabled:bg-gray-600;
        }
        
        .fold-btn {
          @apply bg-red-600 hover:bg-red-700 disabled:bg-gray-600;
        }
      `}</style>
    </div>
  );
};