'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface GamblingLimits {
  dailyDeposit?: number;
  weeklyDeposit?: number;
  monthlyDeposit?: number;
  dailyLoss?: number;
  weeklyLoss?: number;
  monthlyLoss?: number;
  sessionTime?: number; // minutes
  coolingOffPeriod?: number; // hours
}

interface GamblingStats {
  totalDeposited: number;
  totalWon: number;
  totalLost: number;
  netPosition: number;
  currentStreak: number;
  longestStreak: number;
  sessionTime: number;
  lastActivity: Date;
  selfExcluded: boolean;
  coolingOffUntil?: Date;
}

interface ResponsibleGamblingProps {
  limits: GamblingLimits;
  stats: GamblingStats;
  onUpdateLimits: (limits: GamblingLimits) => void;
  onSelfExclude: (duration: number) => void;
  onCoolingOff: (duration: number) => void;
  onRealityCheck: () => void;
  showRealityCheck?: boolean;
  className?: string;
}

export const ResponsibleGambling: React.FC<ResponsibleGamblingProps> = ({
  limits,
  stats,
  onUpdateLimits,
  onSelfExclude,
  onCoolingOff,
  onRealityCheck,
  showRealityCheck = false,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<'limits' | 'stats' | 'tools'>('limits');
  const [editingLimits, setEditingLimits] = useState<GamblingLimits>(limits);
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [realityCheckInterval, setRealityCheckInterval] = useState(60); // minutes

  // Reality check timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (realityCheckInterval > 0) {
      interval = setInterval(() => {
        onRealityCheck();
      }, realityCheckInterval * 60 * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [realityCheckInterval, onRealityCheck]);

  const formatCurrency = (amount: number) => `${amount.toFixed(3)} SOL`;
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getNetPositionColor = (netPosition: number) => {
    if (netPosition > 0) return 'text-green-500';
    if (netPosition < 0) return 'text-red-500';
    return 'text-game-muted';
  };

  const getStreakColor = (streak: number) => {
    if (streak >= 3) return 'text-red-500'; // Losing streak warning
    if (streak <= -3) return 'text-green-500'; // Winning streak
    return 'text-game-text';
  };

  const calculateProgress = (current: number, limit: number) => {
    return Math.min((current / limit) * 100, 100);
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 90) return 'bg-red-500';
    if (progress >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleLimitUpdate = () => {
    onUpdateLimits(editingLimits);
    setShowConfirmation(null);
  };

  const handleSelfExclude = (duration: number) => {
    onSelfExclude(duration);
    setShowConfirmation(null);
  };

  const handleCoolingOff = (duration: number) => {
    onCoolingOff(duration);
    setShowConfirmation(null);
  };

  return (
    <div className={clsx('bg-game-surface border border-game-border rounded-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <h3 className="text-lg font-semibold">Responsible Gambling</h3>
            <p className="text-blue-100 text-sm">Stay in control of your gaming</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-game-border">
        {[
          { id: 'limits', label: 'Limits', icon: '⚙️' },
          { id: 'stats', label: 'Statistics', icon: '📊' },
          { id: 'tools', label: 'Tools', icon: '🔧' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={clsx(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-primary-50 text-primary-600 border-b-2 border-primary-600'
                : 'text-game-muted hover:text-game-text hover:bg-game-border'
            )}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* Limits Tab */}
          {activeTab === 'limits' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div>
                <h4 className="text-game-text font-semibold mb-4">Deposit Limits</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['dailyDeposit', 'weeklyDeposit', 'monthlyDeposit'].map((key) => {
                    const label = key.replace('Deposit', '').replace('daily', 'Daily').replace('weekly', 'Weekly').replace('monthly', 'Monthly');
                    return (
                      <div key={key}>
                        <label className="block text-sm font-medium text-game-muted mb-2">
                          {label} (SOL)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={editingLimits[key as keyof GamblingLimits] || ''}
                          onChange={(e) => setEditingLimits({
                            ...editingLimits,
                            [key]: parseFloat(e.target.value) || undefined
                          })}
                          className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-2 text-game-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="No limit"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-game-text font-semibold mb-4">Loss Limits</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['dailyLoss', 'weeklyLoss', 'monthlyLoss'].map((key) => {
                    const label = key.replace('Loss', '').replace('daily', 'Daily').replace('weekly', 'Weekly').replace('monthly', 'Monthly');
                    return (
                      <div key={key}>
                        <label className="block text-sm font-medium text-game-muted mb-2">
                          {label} Loss (SOL)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={editingLimits[key as keyof GamblingLimits] || ''}
                          onChange={(e) => setEditingLimits({
                            ...editingLimits,
                            [key]: parseFloat(e.target.value) || undefined
                          })}
                          className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-2 text-game-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="No limit"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-game-text font-semibold mb-4">Time Limits</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-game-muted mb-2">
                      Session Time (minutes)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingLimits.sessionTime || ''}
                      onChange={(e) => setEditingLimits({
                        ...editingLimits,
                        sessionTime: parseInt(e.target.value) || undefined
                      })}
                      className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-2 text-game-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="No limit"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-game-muted mb-2">
                      Reality Check (minutes)
                    </label>
                    <select
                      value={realityCheckInterval}
                      onChange={(e) => setRealityCheckInterval(parseInt(e.target.value))}
                      className="w-full bg-game-bg border border-game-border rounded-lg px-3 py-2 text-game-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value={0}>Disabled</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowConfirmation('updateLimits')}
                className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Update Limits
              </button>
            </motion.div>
          )}

          {/* Statistics Tab */}
          {activeTab === 'stats' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Overview Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-game-bg border border-game-border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-500">
                    {formatCurrency(stats.totalDeposited)}
                  </div>
                  <div className="text-sm text-game-muted mt-1">Total Deposited</div>
                </div>
                <div className="bg-game-bg border border-game-border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {formatCurrency(stats.totalWon)}
                  </div>
                  <div className="text-sm text-game-muted mt-1">Total Won</div>
                </div>
                <div className="bg-game-bg border border-game-border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-500">
                    {formatCurrency(stats.totalLost)}
                  </div>
                  <div className="text-sm text-game-muted mt-1">Total Lost</div>
                </div>
                <div className="bg-game-bg border border-game-border rounded-lg p-4 text-center">
                  <div className={clsx('text-2xl font-bold', getNetPositionColor(stats.netPosition))}>
                    {stats.netPosition >= 0 ? '+' : ''}{formatCurrency(stats.netPosition)}
                  </div>
                  <div className="text-sm text-game-muted mt-1">Net Position</div>
                </div>
              </div>

              {/* Session Info */}
              <div className="bg-game-bg border border-game-border rounded-lg p-4">
                <h4 className="text-game-text font-semibold mb-4">Current Session</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-game-muted">Session Time</div>
                    <div className="text-lg font-medium text-game-text">
                      {formatTime(stats.sessionTime)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-game-muted">Current Streak</div>
                    <div className={clsx('text-lg font-medium', getStreakColor(stats.currentStreak))}>
                      {stats.currentStreak > 0 ? 'W' : stats.currentStreak < 0 ? 'L' : '-'}{Math.abs(stats.currentStreak)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Limit Progress */}
              {(limits.dailyLoss || limits.weeklyLoss || limits.monthlyLoss) && (
                <div className="bg-game-bg border border-game-border rounded-lg p-4">
                  <h4 className="text-game-text font-semibold mb-4">Limit Progress</h4>
                  <div className="space-y-3">
                    {limits.dailyLoss && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-game-muted">Daily Loss</span>
                          <span className="text-game-text">
                            {formatCurrency(Math.min(stats.totalLost, limits.dailyLoss))} / {formatCurrency(limits.dailyLoss)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={clsx('h-2 rounded-full transition-all', 
                              getProgressColor(calculateProgress(stats.totalLost, limits.dailyLoss))
                            )}
                            style={{ width: `${calculateProgress(stats.totalLost, limits.dailyLoss)}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    {/* Similar progress bars for weekly and monthly limits */}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Tools Tab */}
          {activeTab === 'tools' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div>
                <h4 className="text-game-text font-semibold mb-4">Take a Break</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setShowConfirmation('coolingOff24')}
                    className="p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⏱️</span>
                      <div>
                        <div className="font-medium text-yellow-700 dark:text-yellow-300">24-Hour Cooling Off</div>
                        <div className="text-sm text-yellow-600 dark:text-yellow-400">Take a short break from gambling</div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setShowConfirmation('coolingOff168')}
                    className="p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🕒</span>
                      <div>
                        <div className="font-medium text-orange-700 dark:text-orange-300">1-Week Cooling Off</div>
                        <div className="text-sm text-orange-600 dark:text-orange-400">Extended break to reset habits</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-game-text font-semibold mb-4">Self-Exclusion</h4>
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⛔</span>
                    <div className="flex-1">
                      <div className="font-medium text-red-700 dark:text-red-300 mb-2">
                        Permanent Self-Exclusion
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                        This will permanently block your access to gambling features. This action cannot be undone and requires account verification to restore access.
                      </p>
                      <button
                        onClick={() => setShowConfirmation('selfExclude')}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        Self-Exclude
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resources */}
              <div>
                <h4 className="text-game-text font-semibold mb-4">Get Help</h4>
                <div className="space-y-3">
                  <a
                    href="https://www.gamblingtherapy.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-game-bg border border-game-border rounded-lg hover:bg-game-border transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span>🌐</span>
                      <div>
                        <div className="text-sm font-medium text-game-text">Gambling Therapy</div>
                        <div className="text-xs text-game-muted">Free support and counseling</div>
                      </div>
                    </div>
                  </a>
                  <a
                    href="https://www.gamblersanonymous.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-game-bg border border-game-border rounded-lg hover:bg-game-border transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span>👥</span>
                      <div>
                        <div className="text-sm font-medium text-game-text">Gamblers Anonymous</div>
                        <div className="text-xs text-game-muted">Peer support groups</div>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirmation Modals */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfirmation(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {showConfirmation === 'updateLimits' && (
                <div>
                  <h3 className="text-game-text text-lg font-semibold mb-4">Update Limits</h3>
                  <p className="text-game-muted mb-6">
                    Are you sure you want to update your gambling limits? New limits will take effect immediately.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirmation(null)}
                      className="flex-1 py-2 px-4 border border-game-border text-game-text rounded-lg hover:bg-game-border transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleLimitUpdate}
                      className="flex-1 py-2 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {(showConfirmation === 'coolingOff24' || showConfirmation === 'coolingOff168') && (
                <div>
                  <h3 className="text-game-text text-lg font-semibold mb-4">Cooling Off Period</h3>
                  <p className="text-game-muted mb-6">
                    You will be unable to gamble for {showConfirmation === 'coolingOff24' ? '24 hours' : '1 week'}. This cannot be reversed once activated.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirmation(null)}
                      className="flex-1 py-2 px-4 border border-game-border text-game-text rounded-lg hover:bg-game-border transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleCoolingOff(showConfirmation === 'coolingOff24' ? 24 : 168)}
                      className="flex-1 py-2 px-4 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                    >
                      Start Cooling Off
                    </button>
                  </div>
                </div>
              )}

              {showConfirmation === 'selfExclude' && (
                <div>
                  <h3 className="text-red-600 text-lg font-semibold mb-4">⚠️ Self-Exclusion</h3>
                  <p className="text-game-muted mb-4">
                    <strong>This is a permanent action that cannot be undone.</strong>
                  </p>
                  <p className="text-game-muted mb-6">
                    You will be permanently excluded from all gambling features. To restore access, you would need to contact support and go through a verification process.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowConfirmation(null)}
                      className="flex-1 py-2 px-4 border border-game-border text-game-text rounded-lg hover:bg-game-border transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSelfExclude(0)}
                      className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Self-Exclude
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reality Check Modal */}
      <AnimatePresence>
        {showRealityCheck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-game-surface border border-game-border rounded-xl p-6 max-w-md w-full text-center"
            >
              <div className="text-4xl mb-4">⏰</div>
              <h3 className="text-game-text text-xl font-semibold mb-4">Reality Check</h3>
              <p className="text-game-muted mb-2">You've been playing for:</p>
              <p className="text-2xl font-bold text-primary-600 mb-4">
                {formatTime(stats.sessionTime)}
              </p>
              <p className="text-game-muted mb-6">
                Remember to take breaks and gamble responsibly.
              </p>
              <button
                onClick={onRealityCheck}
                className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Continue Playing
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ResponsibleGambling;