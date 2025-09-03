'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray';
  trend?: 'up' | 'down';
  trendValue?: string;
  pulse?: boolean;
  className?: string;
}

const colorClasses = {
  blue: {
    icon: 'text-blue-400',
    bg: 'from-blue-500/10 to-cyan-500/10',
    border: 'border-blue-500/20',
    glow: 'shadow-blue-500/20'
  },
  green: {
    icon: 'text-green-400',
    bg: 'from-green-500/10 to-emerald-500/10',
    border: 'border-green-500/20',
    glow: 'shadow-green-500/20'
  },
  red: {
    icon: 'text-red-400',
    bg: 'from-red-500/10 to-pink-500/10',
    border: 'border-red-500/20',
    glow: 'shadow-red-500/20'
  },
  yellow: {
    icon: 'text-yellow-400',
    bg: 'from-yellow-500/10 to-orange-500/10',
    border: 'border-yellow-500/20',
    glow: 'shadow-yellow-500/20'
  },
  purple: {
    icon: 'text-purple-400',
    bg: 'from-purple-500/10 to-pink-500/10',
    border: 'border-purple-500/20',
    glow: 'shadow-purple-500/20'
  },
  gray: {
    icon: 'text-gray-400',
    bg: 'from-gray-500/10 to-slate-500/10',
    border: 'border-gray-500/20',
    glow: 'shadow-gray-500/20'
  }
};

export function StatCard({
  icon,
  value,
  label,
  color = 'gray',
  trend,
  trendValue,
  pulse = false,
  className = ''
}: StatCardProps) {
  const colors = colorClasses[color];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={`
        relative bg-gradient-to-br ${colors.bg} 
        rounded-xl border ${colors.border} 
        p-6 backdrop-blur-sm
        ${pulse ? 'animate-pulse' : ''}
        transition-all duration-300
        shadow-lg hover:${colors.glow}
        ${className}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-black/20 ${colors.icon}`}>
            {icon}
          </div>
          <div>
            <p className="text-2xl font-bold text-white font-gaming">
              {value}
            </p>
            <p className="text-sm text-gray-400 font-medium">
              {label}
            </p>
          </div>
        </div>
        
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-medium ${
            trend === 'up' ? 'text-green-400' : 'text-red-400'
          }`}>
            {trend === 'up' ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {trendValue && <span>{trendValue}</span>}
          </div>
        )}
      </div>
      
      {/* Subtle glow effect */}
      <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${colors.bg} opacity-50 blur-xl -z-10`} />
    </motion.div>
  );
}