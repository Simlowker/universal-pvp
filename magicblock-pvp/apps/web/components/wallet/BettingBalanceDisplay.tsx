'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Eye,
  EyeOff,
  Zap,
  Shield,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useWalletContext } from '../../contexts/WalletContext';
import { useMagicBlock } from '../../contexts/MagicBlockContext';
import { TokenBalance } from '../../types/wallet';
import Button from '../ui/Button';
import { formatDistanceToNow } from 'date-fns';

interface BettingBalanceDisplayProps {
  showDetails?: boolean;
  compact?: boolean;
  showRefresh?: boolean;
  className?: string;
}

interface BalanceCardProps {
  title: string;
  balance: number;
  symbol: string;
  icon: React.ReactNode;
  change?: number;
  changePercent?: number;
  loading?: boolean;
  onClick?: () => void;
}

const BettingBalanceDisplay: React.FC<BettingBalanceDisplayProps> = ({
  showDetails = true,
  compact = false,
  showRefresh = true,
  className = ''
}) => {
  const { wallet, balance, tokenBalances, refreshData } = useWalletContext();
  const { sessionKey, isTransactionPending, latency } = useMagicBlock();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [balanceHistory, setBalanceHistory] = useState<number[]>([]);
  const [showBalances, setShowBalances] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  // Track balance changes for trend calculation
  useEffect(() => {
    if (balance > 0) {
      setBalanceHistory(prev => {
        const newHistory = [...prev, balance];
        return newHistory.slice(-10); // Keep last 10 balance records
      });
      setLastUpdateTime(new Date());
    }
  }, [balance]);

  // Calculate balance trend
  const getBalanceTrend = (): { change: number; changePercent: number } => {
    if (balanceHistory.length < 2) return { change: 0, changePercent: 0 };
    
    const current = balanceHistory[balanceHistory.length - 1];
    const previous = balanceHistory[balanceHistory.length - 2];
    const change = current - previous;
    const changePercent = previous > 0 ? (change / previous) * 100 : 0;
    
    return { change, changePercent };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBalance = (amount: number, decimals: number = 4): string => {
    if (!showBalances) return '••••';
    
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K`;
    }
    
    return amount.toFixed(decimals);
  };

  const { change, changePercent } = getBalanceTrend();

  if (!wallet.connected) {
    return (
      <div className={`bg-game-surface/50 border border-game-border rounded-lg p-4 ${className}`}>
        <div className="text-center text-game-muted">
          <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Connect wallet to view balances</p>
        </div>
      </div>
    );
  }

  const BalanceCard: React.FC<BalanceCardProps> = ({ 
    title, 
    balance, 
    symbol, 
    icon, 
    change, 
    changePercent, 
    loading,
    onClick 
  }) => (
    <motion.div
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className={`
        bg-gradient-to-br from-game-bg to-game-surface border border-game-border rounded-lg p-4
        ${onClick ? 'cursor-pointer hover:border-primary-500/50' : ''}
        transition-all duration-200
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-game-muted text-sm font-medium">{title}</span>
        </div>
        
        {(change !== undefined && changePercent !== undefined && change !== 0) && (
          <div className={`flex items-center gap-1 text-xs ${
            change > 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%</span>
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-game-text font-mono">
            {loading ? (
              <div className="animate-pulse bg-game-muted/20 rounded w-16 h-6" />
            ) : (
              formatBalance(balance)
            )}
          </span>
          <span className="text-game-muted text-sm">{symbol}</span>
        </div>
        
        {change !== undefined && change !== 0 && (
          <div className={`text-xs ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {change > 0 ? '+' : ''}{formatBalance(Math.abs(change), 6)} {symbol}
          </div>
        )}
      </div>
    </motion.div>
  );

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex items-center gap-2 bg-game-surface/50 rounded-lg px-3 py-2">
          <Coins className="h-4 w-4 text-primary-400" />
          <span className="font-bold text-game-text font-mono">
            {formatBalance(balance)} SOL
          </span>
        </div>
        
        {sessionKey && (
          <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/30 rounded-lg px-2 py-1">
            <Zap className="h-3 w-3 text-green-400" />
            <span className="text-xs text-green-400">Gasless</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary-400" />
          <h3 className="font-bold text-game-text">Betting Balance</h3>
          
          {sessionKey && (
            <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-1">
              <Shield className="h-3 w-3 text-green-400" />
              <span className="text-xs text-green-400">Protected</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBalances(!showBalances)}
            leftIcon={showBalances ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          >
            {showBalances ? 'Hide' : 'Show'}
          </Button>
          
          {showRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              loading={isRefreshing}
              leftIcon={<RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
            />
          )}
        </div>
      </div>

      {/* Status Indicators */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-game-bg/50 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-blue-400" />
            <span className="text-xs text-game-muted">Latency</span>
          </div>
          <span className="text-sm font-mono text-game-text">{latency}ms</span>
        </div>
        
        <div className="bg-game-bg/50 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className={`h-3 w-3 ${isTransactionPending ? 'text-yellow-400' : 'text-gray-400'}`} />
            <span className="text-xs text-game-muted">Status</span>
          </div>
          <span className={`text-sm font-medium ${
            isTransactionPending ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {isTransactionPending ? 'Busy' : 'Ready'}
          </span>
        </div>
        
        <div className="bg-game-bg/50 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <RefreshCw className="h-3 w-3 text-primary-400" />
            <span className="text-xs text-game-muted">Updated</span>
          </div>
          <span className="text-sm text-game-text">
            {formatDistanceToNow(lastUpdateTime, { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Main Balance */}
      <BalanceCard
        title="SOL Balance"
        balance={balance}
        symbol="SOL"
        icon={<div className="w-6 h-6 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">◎</div>}
        change={change}
        changePercent={changePercent}
        loading={isRefreshing}
      />

      {/* Token Balances */}
      {showDetails && tokenBalances.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-game-muted">Token Holdings</h4>
          <div className="grid gap-2">
            {tokenBalances.slice(0, 3).map((token, index) => (
              <BalanceCard
                key={token.mint}
                title={token.name || token.symbol}
                balance={token.amount}
                symbol={token.symbol}
                icon={token.logo ? (
                  <img src={token.logo} alt={token.symbol} className="w-5 h-5 rounded-full" />
                ) : (
                  <div className="w-5 h-5 bg-gradient-to-br from-green-400 to-blue-400 rounded-full" />
                )}
                loading={isRefreshing}
              />
            ))}
          </div>
          
          {tokenBalances.length > 3 && (
            <p className="text-center text-game-muted text-sm">
              +{tokenBalances.length - 3} more tokens
            </p>
          )}
        </div>
      )}

      {/* Warning for low balance */}
      <AnimatePresence>
        {balance < 0.1 && balance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm font-medium">
                Low Balance Warning
              </span>
            </div>
            <p className="text-yellow-400/80 text-xs mt-1">
              Consider adding funds to continue playing. Minimum recommended: 0.1 SOL
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BettingBalanceDisplay;