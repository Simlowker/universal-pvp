'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Shield, Zap, Globe, AlertCircle, CheckCircle, X, ExternalLink } from 'lucide-react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletName } from '@solana/wallet-adapter-base';
import Button from '../ui/Button';
import { useGameSounds } from '../../hooks/useSound';
import toast from 'react-hot-toast';

interface WalletConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  showBenefits?: boolean;
}

interface WalletOption {
  name: string;
  displayName: string;
  icon: string;
  description: string;
  features: string[];
  recommended?: boolean;
  installed?: boolean;
  downloadUrl?: string;
}

const SUPPORTED_WALLETS: WalletOption[] = [
  {
    name: 'Phantom',
    displayName: 'Phantom',
    icon: '👻',
    description: 'Most popular Solana wallet with excellent gaming support',
    features: ['Session Keys', 'Hardware Wallet', 'DeFi Integration', 'NFT Support'],
    recommended: true,
    downloadUrl: 'https://phantom.app/',
  },
  {
    name: 'Solflare',
    displayName: 'Solflare',
    icon: '🔥',
    description: 'Feature-rich wallet with advanced security options',
    features: ['Multi-Chain', 'Staking', 'Hardware Support', 'Portfolio Tracking'],
    downloadUrl: 'https://solflare.com/',
  },
  {
    name: 'Backpack',
    displayName: 'Backpack',
    icon: '🎒',
    description: 'Next-gen wallet built for Web3 gaming and social',
    features: ['Gaming Native', 'Social Features', 'xNFTs', 'Built-in DEX'],
    downloadUrl: 'https://backpack.app/',
  },
  {
    name: 'Glow',
    displayName: 'Glow',
    icon: '✨',
    description: 'Simple and secure wallet focused on user experience',
    features: ['Simple UI', 'Mobile Native', 'Security First', 'Fast Onboarding'],
    downloadUrl: 'https://glow.app/',
  },
];

const GAMBLING_BENEFITS = [
  {
    icon: <Zap className="h-5 w-5 text-yellow-400" />,
    title: 'Instant Betting',
    description: 'Place bets and execute trades in milliseconds'
  },
  {
    icon: <Shield className="h-5 w-5 text-green-400" />,
    title: 'Gasless Gaming',
    description: 'No wallet popups during gameplay with session keys'
  },
  {
    icon: <Globe className="h-5 w-5 text-blue-400" />,
    title: 'Cross-Chain Support',
    description: 'Access multiple gaming ecosystems seamlessly'
  },
];

const WalletConnectionModal: React.FC<WalletConnectionModalProps> = ({
  isOpen,
  onClose,
  title = "Connect Your Wallet",
  subtitle = "Choose your preferred wallet to start playing",
  showBenefits = true
}) => {
  const { wallets, select, connect, connecting, connected } = useWallet();
  const { connection } = useConnection();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { playSound } = useGameSounds();
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [installedWallets, setInstalledWallets] = useState<Set<string>>(new Set());

  // Check for installed wallets
  useEffect(() => {
    const checkInstalledWallets = () => {
      const installed = new Set<string>();
      
      if (typeof window !== 'undefined') {
        // Check for Phantom
        if (window.phantom?.solana?.isPhantom) {
          installed.add('Phantom');
        }
        
        // Check for Solflare
        if (window.solflare?.isConnected !== undefined) {
          installed.add('Solflare');
        }
        
        // Check for Backpack
        if (window.backpack?.isBackpack) {
          installed.add('Backpack');
        }
        
        // Check for Glow
        if (window.glow) {
          installed.add('Glow');
        }
      }
      
      setInstalledWallets(installed);
    };

    checkInstalledWallets();
    
    // Recheck every 2 seconds for newly installed wallets
    const interval = setInterval(checkInstalledWallets, 2000);
    return () => clearInterval(interval);
  }, []);

  // Handle wallet selection and connection
  const handleWalletSelect = async (walletName: string) => {
    playSound('click');
    setSelectedWallet(walletName);
    setConnectionStatus('connecting');
    setError(null);

    try {
      const wallet = wallets.find(w => w.adapter.name === walletName);
      if (!wallet) {
        throw new Error(`Wallet ${walletName} not found`);
      }

      await select(wallet.adapter.name as WalletName);
      await connect();
      
      setConnectionStatus('success');
      playSound('success');
      toast.success(`Connected to ${walletName}!`);
      
      // Close modal after successful connection
      setTimeout(() => {
        onClose();
        setConnectionStatus('idle');
        setSelectedWallet(null);
      }, 1500);
      
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      setConnectionStatus('error');
      setError(error.message || 'Failed to connect wallet');
      playSound('error');
      toast.error(`Failed to connect to ${walletName}`);
    }
  };

  // Get wallet option with installation status
  const getWalletOption = (walletConfig: WalletOption) => {
    const isInstalled = installedWallets.has(walletConfig.name);
    const isAvailable = wallets.some(w => w.adapter.name === walletConfig.name);
    
    return {
      ...walletConfig,
      installed: isInstalled,
      available: isAvailable,
    };
  };

  // Handle wallet download
  const handleDownload = (downloadUrl: string, walletName: string) => {
    window.open(downloadUrl, '_blank');
    playSound('click');
    toast.success(`Opening ${walletName} download page...`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-game-surface border border-game-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="p-6 border-b border-game-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="bg-primary-500/20 p-2 rounded-lg">
                  <Wallet className="h-6 w-6 text-primary-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-game-text font-gaming">
                    {title}
                  </h2>
                  <p className="text-game-muted text-sm mt-1">
                    {subtitle}
                  </p>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="text-game-muted hover:text-game-text transition-colors"
                disabled={connectionStatus === 'connecting'}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Connection Status */}
            {connectionStatus !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 p-3 rounded-lg border ${
                  connectionStatus === 'connecting' ? 'border-blue-500/50 bg-blue-500/10' :
                  connectionStatus === 'success' ? 'border-green-500/50 bg-green-500/10' :
                  'border-red-500/50 bg-red-500/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connecting' && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
                  )}
                  {connectionStatus === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  )}
                  {connectionStatus === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  )}
                  
                  <span className={`text-sm font-medium ${
                    connectionStatus === 'connecting' ? 'text-blue-400' :
                    connectionStatus === 'success' ? 'text-green-400' :
                    'text-red-400'
                  }`}>
                    {connectionStatus === 'connecting' && `Connecting to ${selectedWallet}...`}
                    {connectionStatus === 'success' && `Successfully connected to ${selectedWallet}!`}
                    {connectionStatus === 'error' && (error || 'Connection failed')}
                  </span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Gambling Benefits */}
          {showBenefits && (
            <div className="p-6 border-b border-game-border bg-gradient-to-r from-primary-500/5 to-secondary-500/5">
              <h3 className="font-bold text-game-text mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary-400" />
                Web3 Gaming Benefits
              </h3>
              
              <div className="grid md:grid-cols-3 gap-4">
                {GAMBLING_BENEFITS.map((benefit, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-2">
                      {benefit.icon}
                      <span className="font-semibold text-game-text text-sm">
                        {benefit.title}
                      </span>
                    </div>
                    <p className="text-game-muted text-xs">
                      {benefit.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wallet Options */}
          <div className="p-6">
            <div className="grid gap-3">
              {SUPPORTED_WALLETS.map((walletConfig) => {
                const walletOption = getWalletOption(walletConfig);
                const isConnecting = connectionStatus === 'connecting' && selectedWallet === walletConfig.name;
                const isDisabled = connectionStatus === 'connecting' && selectedWallet !== walletConfig.name;

                return (
                  <motion.div
                    key={walletConfig.name}
                    whileHover={!isDisabled ? { scale: 1.02 } : {}}
                    whileTap={!isDisabled ? { scale: 0.98 } : {}}
                    className={`border rounded-xl p-4 transition-all duration-200 ${
                      walletOption.recommended 
                        ? 'border-primary-500/50 bg-primary-500/5' 
                        : 'border-game-border bg-game-bg/30'
                    } ${
                      isDisabled ? 'opacity-50' : 'hover:bg-game-bg/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Wallet Icon & Info */}
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-2xl">{walletConfig.icon}</div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-game-text">
                              {walletConfig.displayName}
                            </h3>
                            {walletOption.recommended && (
                              <span className="bg-primary-500/20 text-primary-400 text-xs px-2 py-1 rounded-full font-medium">
                                Recommended
                              </span>
                            )}
                            {walletOption.installed && (
                              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full font-medium">
                                Installed
                              </span>
                            )}
                          </div>
                          
                          <p className="text-game-muted text-sm mt-1">
                            {walletConfig.description}
                          </p>
                          
                          {/* Features */}
                          <div className="flex gap-1 mt-2">
                            {walletConfig.features.slice(0, 3).map((feature, index) => (
                              <span 
                                key={index}
                                className="text-xs bg-game-bg/50 text-game-muted px-2 py-1 rounded-md"
                              >
                                {feature}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex items-center gap-2">
                        {walletOption.installed && walletOption.available ? (
                          <Button
                            onClick={() => handleWalletSelect(walletConfig.name)}
                            variant={walletOption.recommended ? "primary" : "outline"}
                            disabled={isDisabled}
                            loading={isConnecting}
                          >
                            {isConnecting ? 'Connecting...' : 'Connect'}
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => handleDownload(walletConfig.downloadUrl!, walletConfig.name)}
                              variant="outline"
                              size="sm"
                              leftIcon={<ExternalLink className="h-3 w-3" />}
                            >
                              Install
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-game-muted text-sm">
                New to Solana wallets?{' '}
                <button
                  onClick={() => window.open('https://docs.solana.com/wallet-guide', '_blank')}
                  className="text-primary-400 hover:text-primary-300 underline"
                >
                  Learn more about Web3 wallets
                </button>
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WalletConnectionModal;