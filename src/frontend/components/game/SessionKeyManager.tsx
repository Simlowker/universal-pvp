'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Clock, Shield, AlertCircle, CheckCircle, RefreshCw, X } from 'lucide-react';
import { useMagicBlock } from '../../contexts/MagicBlockContext';
import { useWallet } from '@solana/wallet-adapter-react';
import Button from '../ui/Button';
import { formatDistanceToNow } from 'date-fns';

interface SessionKeyManagerProps {
  showModal?: boolean;
  onClose?: () => void;
}

const SessionKeyManager: React.FC<SessionKeyManagerProps> = ({
  showModal = false,
  onClose
}) => {
  const { connected } = useWallet();
  const { 
    sessionKey, 
    createSessionKey, 
    revokeSessionKey,
    isTransactionPending 
  } = useMagicBlock();
  
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmRevoke, setShowConfirmRevoke] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Update time remaining
  useEffect(() => {
    if (!sessionKey) return;

    const updateTimer = () => {
      const remaining = sessionKey.expiresAt - Date.now();
      if (remaining > 0) {
        setTimeRemaining(formatDistanceToNow(sessionKey.expiresAt, { addSuffix: true }));
      } else {
        setTimeRemaining('Expired');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sessionKey]);

  const handleCreateSessionKey = async () => {
    if (!connected) {
      setError('Please connect your wallet first');
      return;
    }

    setIsCreating(true);
    setError(null);
    
    try {
      await createSessionKey();
      console.log('✅ Session key created successfully');
    } catch (error: any) {
      console.error('Failed to create session key:', error);
      setError(error.message || 'Failed to create session key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeSessionKey = () => {
    revokeSessionKey();
    setShowConfirmRevoke(false);
    console.log('🔑 Session key revoked');
  };

  const isExpired = sessionKey && sessionKey.expiresAt < Date.now();
  const isExpiringSoon = sessionKey && (sessionKey.expiresAt - Date.now()) < (2 * 60 * 60 * 1000); // 2 hours

  if (!showModal && sessionKey && !isExpired && !isExpiringSoon) {
    // Mini status indicator when session is active and healthy
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-game-surface/95 border border-green-500/50 rounded-lg px-3 py-2 backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-green-400" />
            <span className="text-green-400 font-semibold">Session Active</span>
            <span className="text-game-muted">•</span>
            <span className="text-game-muted">{timeRemaining}</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!showModal && !sessionKey) {
    // Prompt to create session key
    return (
      <div className="fixed bottom-4 left-4 z-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-game-surface/95 border border-yellow-500/50 rounded-lg p-3 backdrop-blur-sm max-w-sm"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <span className="text-game-text font-semibold">Gasless Gaming Available</span>
            </div>
            <p className="text-game-muted text-sm">
              Create a session key to play without wallet popups during combat.
            </p>
            <Button
              onClick={handleCreateSessionKey}
              size="sm"
              variant="primary"
              disabled={!connected || isCreating}
              leftIcon={<Key className="h-4 w-4" />}
            >
              {isCreating ? 'Creating...' : 'Enable Gasless Gaming'}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {(showModal || isExpired || isExpiringSoon) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-game-surface border border-game-border rounded-xl p-6 max-w-md w-full mx-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Key className="h-6 w-6 text-primary-400" />
                <h2 className="text-xl font-bold text-game-text font-gaming">
                  Session Key Manager
                </h2>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-game-muted hover:text-game-text transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Current Status */}
            <div className="space-y-4 mb-6">
              {sessionKey ? (
                <div className={`border rounded-lg p-4 ${
                  isExpired ? 'border-red-500/50 bg-red-500/10' :
                  isExpiringSoon ? 'border-yellow-500/50 bg-yellow-500/10' :
                  'border-green-500/50 bg-green-500/10'
                }`}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      {isExpired ? (
                        <AlertCircle className="h-5 w-5 text-red-400" />
                      ) : isExpiringSoon ? (
                        <Clock className="h-5 w-5 text-yellow-400" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      )}
                      <span className="font-semibold text-game-text">
                        {isExpired ? 'Session Expired' :
                         isExpiringSoon ? 'Session Expiring Soon' :
                         'Session Active'}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-game-muted">Public Key:</span>
                        <span className="text-game-text font-mono text-xs">
                          {sessionKey.publicKey.toString().slice(0, 8)}...{sessionKey.publicKey.toString().slice(-8)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-game-muted">Status:</span>
                        <span className={
                          isExpired ? 'text-red-400' :
                          isExpiringSoon ? 'text-yellow-400' :
                          'text-green-400'
                        }>
                          {isExpired ? 'Expired' :
                           isExpiringSoon ? 'Expiring Soon' :
                           'Active'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-game-muted">Expires:</span>
                        <span className="text-game-text">{timeRemaining}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-game-border rounded-lg p-4 text-center">
                  <Key className="h-12 w-12 text-game-muted mx-auto mb-3" />
                  <h3 className="font-semibold text-game-text mb-2">No Session Key</h3>
                  <p className="text-game-muted text-sm">
                    Create a session key to enable gasless transactions during gameplay.
                  </p>
                </div>
              )}
            </div>

            {/* Benefits */}
            <div className="bg-game-bg/50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-game-text mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary-400" />
                Gasless Gaming Benefits
              </h3>
              <ul className="space-y-2 text-sm text-game-muted">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  No wallet popups during combat
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  30ms response times achieved
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  Smooth Web2-like experience
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-400" />
                  Automatic session management
                </li>
              </ul>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-red-400 text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              {sessionKey ? (
                <>
                  {(isExpired || isExpiringSoon) && (
                    <Button
                      onClick={handleCreateSessionKey}
                      variant="primary"
                      fullWidth
                      disabled={!connected || isCreating}
                      leftIcon={<RefreshCw className={`h-4 w-4 ${isCreating ? 'animate-spin' : ''}`} />}
                    >
                      {isCreating ? 'Creating New Key...' : 'Renew Session Key'}
                    </Button>
                  )}
                  
                  <Button
                    onClick={() => setShowConfirmRevoke(true)}
                    variant="outline"
                    fullWidth={!isExpired && !isExpiringSoon}
                    disabled={isTransactionPending}
                  >
                    Revoke Key
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleCreateSessionKey}
                    variant="primary"
                    fullWidth
                    disabled={!connected || isCreating}
                    leftIcon={<Key className="h-4 w-4" />}
                  >
                    {isCreating ? 'Creating...' : 'Create Session Key'}
                  </Button>
                  
                  {onClose && (
                    <Button
                      onClick={onClose}
                      variant="outline"
                    >
                      Skip
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Wallet Connection Prompt */}
            {!connected && (
              <p className="text-center text-game-muted text-sm mt-4">
                Please connect your wallet to manage session keys.
              </p>
            )}
          </motion.div>

          {/* Revoke Confirmation Modal */}
          <AnimatePresence>
            {showConfirmRevoke && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-game-surface border border-game-border rounded-lg p-6 max-w-sm w-full mx-4"
                >
                  <div className="text-center space-y-4">
                    <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
                    <div>
                      <h3 className="font-bold text-game-text mb-2">Revoke Session Key?</h3>
                      <p className="text-game-muted text-sm">
                        This will disable gasless gaming and require wallet approvals for all actions.
                      </p>
                    </div>
                    
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setShowConfirmRevoke(false)}
                        variant="outline"
                        fullWidth
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleRevokeSessionKey}
                        variant="primary"
                        fullWidth
                        className="!bg-red-600 !hover:bg-red-700"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SessionKeyManager;