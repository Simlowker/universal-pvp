import React from 'react';
import { motion } from 'framer-motion';

interface PsychProfileProps {
  profile: {
    aggression: number;
    bluffProbability: number;
    consistency: number;
    pressure: number;
  };
  playerName?: string;
}

export const PsychProfile: React.FC<PsychProfileProps> = ({
  profile,
  playerName = 'Opponent'
}) => {
  const getAnalysis = () => {
    const insights = [];
    
    if (profile.aggression > 0.7) insights.push("Plays aggressively");
    if (profile.bluffProbability > 0.6) insights.push("High bluff probability");
    if (profile.consistency < 0.3) insights.push("Erratic behavior");
    if (profile.pressure > 0.7) insights.push("Shows signs of pressure");
    if (profile.aggression < 0.3 && profile.bluffProbability < 0.3) {
      insights.push("Conservative player");
    }
    
    return insights.length > 0 ? insights.join(". ") + "." : "Analyzing patterns...";
  };

  const metrics = [
    { name: 'Aggression', value: profile.aggression, color: 'bg-red-500' },
    { name: 'Bluff Probability', value: profile.bluffProbability, color: 'bg-yellow-500' },
    { name: 'Consistency', value: profile.consistency, color: 'bg-blue-500' },
    { name: 'Under Pressure', value: profile.pressure, color: 'bg-purple-500' },
  ];

  return (
    <div className="bg-gray-800/50 backdrop-blur-md rounded-2xl p-6 border border-purple-500/30">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span>🧠</span>
        <span>Psychological Profile</span>
      </h3>
      
      <div className="space-y-3">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">{metric.name}</span>
              <span className="text-white">{(metric.value * 100).toFixed(0)}%</span>
            </div>
            <div className="bg-gray-700 rounded-full h-2">
              <motion.div 
                className={`${metric.color} h-2 rounded-full transition-all`}
                initial={{ width: 0 }}
                animate={{ width: `${metric.value * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div 
        className="mt-6 p-4 bg-gray-700/50 rounded-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <h4 className="text-sm font-bold text-gray-400 mb-2">Analysis</h4>
        <p className="text-xs text-gray-300">
          {getAnalysis()}
        </p>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-700/30 rounded p-2">
          <span className="text-gray-500">Confidence</span>
          <div className="text-white font-bold">
            {Math.max(...Object.values(profile)) > 0.5 ? 'High' : 'Building'}
          </div>
        </div>
        <div className="bg-gray-700/30 rounded p-2">
          <span className="text-gray-500">Play Style</span>
          <div className="text-white font-bold">
            {profile.aggression > 0.5 ? 'Aggressive' : 'Passive'}
          </div>
        </div>
      </div>
    </div>
  );
};