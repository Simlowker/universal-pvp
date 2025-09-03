'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, TrendingUp, X, ArrowUp, ArrowDown, 
  Keyboard, Zap, Clock, Target 
} from 'lucide-react';
import Button from '../ui/Button';

interface ActionPadProps {
  onAction: (action: 'check' | 'raise' | 'fold') => void;
  isActionPending: boolean;
  selectedAction: string | null;
  raiseAmount: number;
  onRaiseAmountChange: (amount: number) => void;
  maxRaise: number;
  currentBet: number;
  timeRemaining?: number;
}

export function ActionPad({
  onAction,
  isActionPending,
  selectedAction,
  raiseAmount,
  onRaiseAmountChange,
  maxRaise,
  currentBet,
  timeRemaining
}: ActionPadProps) {

  const raiseSteps = [0.01, 0.05, 0.1, 0.25, 0.5, 1.0];
  const quickRaises = raiseSteps.filter(step => step <= maxRaise);

  const handleRaiseChange = (increment: number) => {
    const newAmount = Math.max(0.01, Math.min(maxRaise, raiseAmount + increment));
    onRaiseAmountChange(newAmount);
  };

  const canCheck = currentBet === 0;
  const canRaise = raiseAmount >= 0.01 && raiseAmount <= maxRaise;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-gray-800/80 to-gray-700/80 backdrop-blur-xl rounded-2xl border border-gray-600 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-purple-400" />
          <h3 className="text-xl font-bold text-white font-gaming">
            Your Move
          </h3>
        </div>

        {/* Timer */}
        {timeRemaining && (
          <motion.div
            animate={{ 
              scale: timeRemaining <= 10 ? [1, 1.1, 1] : 1,
              color: timeRemaining <= 10 ? ['#ef4444', '#fbbf24', '#ef4444'] : '#f59e0b'
            }}
            transition={{ 
              duration: 1, 
              repeat: timeRemaining <= 10 ? Infinity : 0 
            }}
            className="flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            <span className="text-lg font-bold font-gaming">
              {timeRemaining}s
            </span>
          </motion.div>
        )}
      </div>

      {/* Current Situation */}
      <div className="bg-gray-900/50 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-gray-400 text-sm">Current Bet</p>
            <p className="text-lg font-bold text-white">◎{currentBet.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Your Raise</p>
            <p className="text-lg font-bold text-purple-400">◎{raiseAmount.toFixed(3)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm">Total Cost</p>
            <p className="text-lg font-bold text-yellow-400">
              ◎{(currentBet + raiseAmount).toFixed(3)}
            </p>
          </div>
        </div>
      </div>

      {/* Raise Controls */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-300">
            Raise Amount
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRaiseChange(-0.01)}
              disabled={raiseAmount <= 0.01}
              className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDown className="h-3 w-3 text-gray-300" />
            </button>
            <button
              onClick={() => handleRaiseChange(0.01)}
              disabled={raiseAmount >= maxRaise}
              className="p-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUp className="h-3 w-3 text-gray-300" />
            </button>
          </div>
        </div>

        {/* Quick Raise Buttons */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
          {quickRaises.map(amount => (
            <button
              key={amount}
              onClick={() => onRaiseAmountChange(amount)}
              className={`
                px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${raiseAmount === amount
                  ? 'bg-purple-500 text-white border border-purple-400'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                }
              `}
            >
              ◎{amount}
            </button>
          ))}
        </div>

        {/* Range Slider */}
        <div className="relative">
          <input
            type="range"
            min="0.01"
            max={maxRaise}
            step="0.01"
            value={raiseAmount}
            onChange={(e) => onRaiseAmountChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>◎0.01</span>
            <span>◎{maxRaise.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        
        {/* Check/Call */}
        <Button
          onClick={() => onAction('check')}
          disabled={isActionPending}
          loading={isActionPending && selectedAction === 'check'}
          variant={selectedAction === 'check' ? 'primary' : 'outline'}
          size="lg"
          leftIcon={<Shield className="h-5 w-5" />}
          className={`
            ${canCheck ? 'hover:bg-blue-600' : 'hover:bg-green-600'}
            ${selectedAction === 'check' ? 'ring-2 ring-blue-400' : ''}
          `}
        >
          {canCheck ? 'CHECK' : 'CALL'}
        </Button>

        {/* Raise */}
        <Button
          onClick={() => onAction('raise')}
          disabled={isActionPending || !canRaise}
          loading={isActionPending && selectedAction === 'raise'}
          variant={selectedAction === 'raise' ? 'primary' : 'default'}
          size="lg"
          leftIcon={<TrendingUp className="h-5 w-5" />}
          className={`
            bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700
            ${selectedAction === 'raise' ? 'ring-2 ring-orange-400' : ''}
          `}
        >
          RAISE ◎{raiseAmount.toFixed(2)}
        </Button>

        {/* Fold */}
        <Button
          onClick={() => onAction('fold')}
          disabled={isActionPending}
          loading={isActionPending && selectedAction === 'fold'}
          variant={selectedAction === 'fold' ? 'destructive' : 'outline'}
          size="lg"
          leftIcon={<X className="h-5 w-5" />}
          className={`
            border-red-600 text-red-400 hover:bg-red-600 hover:text-white
            ${selectedAction === 'fold' ? 'ring-2 ring-red-400' : ''}
          `}
        >
          FOLD
        </Button>
      </div>

      {/* Hotkeys Guide */}
      <div className="bg-gray-900/50 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Keyboard className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-400">Hotkeys</span>
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-300 font-mono">SPACE</kbd>
            <span className="text-gray-400">Check/Call</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-300 font-mono">R</kbd>
            <span className="text-gray-400">Raise</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-300 font-mono">F</kbd>
            <span className="text-gray-400">Fold</span>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-xs mt-2">
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-300 font-mono">↑</kbd>
            <span className="text-gray-400">Increase raise</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-gray-800 rounded text-gray-300 font-mono">↓</kbd>
            <span className="text-gray-400">Decrease raise</span>
          </div>
        </div>
      </div>

      {/* Performance Indicator */}
      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-green-400">
          <Zap className="h-3 w-3" />
          <span>Optimistic UI Active</span>
        </div>
        <div className="flex items-center gap-2 text-blue-400">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          <span>47ms latency</span>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
        }

        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #8b5cf6;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </motion.div>
  );
}