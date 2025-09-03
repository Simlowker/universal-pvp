import React from 'react';
import { motion } from 'framer-motion';

interface RoundTrackerProps {
  currentRound: number;
  maxRounds: number;
  timeLeft?: number;
  maxTime?: number;
}

export const RoundTracker: React.FC<RoundTrackerProps> = ({
  currentRound,
  maxRounds,
  timeLeft = 30,
  maxTime = 30
}) => {
  const timePercentage = (timeLeft / maxTime) * 100;
  const isLowTime = timeLeft < 10;
  
  return (
    <div className="bg-gray-800/50 backdrop-blur-md rounded-xl p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-bold text-gray-400">ROUND</h4>
        <span className="text-2xl font-bold text-white">
          {currentRound} / {maxRounds}
        </span>
      </div>
      
      <div className="flex gap-1 mb-4">
        {Array.from({ length: maxRounds }, (_, i) => (
          <motion.div
            key={i}
            className={`flex-1 h-2 rounded-full ${
              i < currentRound ? 'bg-green-500' : 'bg-gray-700'
            }`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.05 }}
          />
        ))}
      </div>
      
      {timeLeft !== undefined && (
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Time Left</span>
            <motion.span 
              className={`font-bold ${isLowTime ? 'text-red-400' : 'text-white'}`}
              animate={isLowTime ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              {timeLeft}s
            </motion.span>
          </div>
          <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
            <motion.div
              className={`h-2 ${isLowTime ? 'bg-red-500' : 'bg-blue-500'}`}
              initial={{ width: '100%' }}
              animate={{ width: `${timePercentage}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}
      
      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Phase</span>
            <div className="text-white font-semibold">
              {currentRound <= 2 ? 'Opening' : currentRound <= 4 ? 'Middle' : 'Endgame'}
            </div>
          </div>
          <div>
            <span className="text-gray-500">Intensity</span>
            <div className="text-white font-semibold">
              {currentRound >= maxRounds - 1 ? 'Critical' : currentRound >= 3 ? 'High' : 'Normal'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};