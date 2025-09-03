'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wifi, 
  WifiOff, 
  Globe, 
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock,
  Activity,
  Gauge,
  RefreshCw,
  Settings,
  X
} from 'lucide-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useMagicBlock } from '../../contexts/MagicBlockContext';
import Button from '../ui/Button';
import { formatDistanceToNow } from 'date-fns';

interface NetworkStatusIndicatorProps {
  showDetails?: boolean;
  compact?: boolean;
  position?: 'fixed' | 'relative';
  className?: string;
}

interface NetworkMetrics {
  rpcLatency: number;
  wsLatency: number;
  blockHeight: number;
  lastUpdate: Date;
  status: 'excellent' | 'good' | 'poor' | 'offline';
  errors: number;
}

interface ConnectionDetail {
  name: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  latency?: number;
  endpoint?: string;
  lastPing?: Date;
}

const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({
  showDetails = false,
  compact = false,
  position = 'fixed',
  className = ''
}) => {
  const { connection } = useConnection();
  const { 
    ephemeralConnection, 
    mainnetConnection, 
    isConnected, 
    isEphemeralActive,
    isRealTimeConnected,
    latency 
  } = useMagicBlock();

  const [metrics, setMetrics] = useState<NetworkMetrics>({
    rpcLatency: 0,
    wsLatency: 0,
    blockHeight: 0,
    lastUpdate: new Date(),
    status: 'offline',
    errors: 0
  });

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetail[]>([]);
  const intervalRef = useRef<NodeJS.Timeout>();

  // Network quality thresholds
  const LATENCY_THRESHOLDS = {
    excellent: 50,
    good: 150,
    poor: 500,
  };

  // Monitor network status
  useEffect(() => {
    if (!isMonitoring || !connection) return;

    const monitorNetwork = async () => {
      try {
        const startTime = Date.now();
        
        // Test RPC latency
        const blockHeight = await connection.getBlockHeight();
        const rpcLatency = Date.now() - startTime;

        // Determine network status
        let status: NetworkMetrics['status'] = 'offline';
        if (rpcLatency < LATENCY_THRESHOLDS.excellent) {
          status = 'excellent';
        } else if (rpcLatency < LATENCY_THRESHOLDS.good) {
          status = 'good';
        } else if (rpcLatency < LATENCY_THRESHOLDS.poor) {
          status = 'poor';
        }

        setMetrics(prev => ({
          ...prev,
          rpcLatency,
          wsLatency: latency,
          blockHeight,
          lastUpdate: new Date(),
          status: isConnected ? status : 'offline',
          errors: status === 'offline' ? prev.errors + 1 : Math.max(0, prev.errors - 1)
        }));

        // Update connection details
        const details: ConnectionDetail[] = [
          {
            name: 'Mainnet RPC',
            status: isConnected ? 'connected' : 'disconnected',
            latency: rpcLatency,
            endpoint: connection.rpcEndpoint,
            lastPing: new Date()
          },
          {
            name: 'WebSocket',
            status: isRealTimeConnected ? 'connected' : 'disconnected',
            latency: latency,
            lastPing: new Date()
          }
        ];

        if (isEphemeralActive && ephemeralConnection) {
          details.unshift({
            name: 'Ephemeral Rollup',
            status: 'connected',
            latency: rpcLatency,
            endpoint: ephemeralConnection.rpcEndpoint,
            lastPing: new Date()
          });
        }

        setConnectionDetails(details);

      } catch (error) {
        console.error('Network monitoring error:', error);
        setMetrics(prev => ({
          ...prev,
          status: 'offline',
          errors: prev.errors + 1,
          lastUpdate: new Date()
        }));
      }
    };

    // Initial check
    monitorNetwork();

    // Set up monitoring interval
    intervalRef.current = setInterval(monitorNetwork, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [connection, isConnected, isRealTimeConnected, isEphemeralActive, ephemeralConnection, latency, isMonitoring]);

  const getStatusIcon = () => {
    switch (metrics.status) {
      case 'excellent':
        return <Wifi className="h-4 w-4 text-green-400" />;
      case 'good':
        return <Wifi className="h-4 w-4 text-yellow-400" />;
      case 'poor':
        return <Wifi className="h-4 w-4 text-orange-400" />;
      case 'offline':
        return <WifiOff className="h-4 w-4 text-red-400" />;
    }
  };

  const getStatusColor = () => {
    switch (metrics.status) {
      case 'excellent':
        return 'border-green-500/50 bg-green-500/10';
      case 'good':
        return 'border-yellow-500/50 bg-yellow-500/10';
      case 'poor':
        return 'border-orange-500/50 bg-orange-500/10';
      case 'offline':
        return 'border-red-500/50 bg-red-500/10';
    }
  };

  const getStatusText = () => {
    switch (metrics.status) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'poor':
        return 'Poor';
      case 'offline':
        return 'Offline';
    }
  };

  const formatLatency = (latency: number) => {
    if (latency === 0) return '--';
    return `${latency}ms`;
  };

  if (compact) {
    return (
      <motion.div
        className={`flex items-center gap-2 ${className}`}
        whileHover={{ scale: 1.05 }}
        onClick={() => setShowDetailsModal(true)}
      >
        {getStatusIcon()}
        <span className="text-xs text-game-muted">
          {formatLatency(metrics.rpcLatency)}
        </span>
        {isEphemeralActive && (
          <Zap className="h-3 w-3 text-primary-400" />
        )}
      </motion.div>
    );
  }

  const StatusIndicator = () => (
    <motion.div
      className={`
        ${position === 'fixed' ? 'fixed bottom-4 right-4 z-40' : 'relative'}
        ${className}
      `}
      whileHover={{ scale: 1.02 }}
    >
      <div
        className={`
          border rounded-lg p-3 backdrop-blur-sm cursor-pointer transition-all duration-200
          ${getStatusColor()}
          hover:bg-opacity-80
        `}
        onClick={() => setShowDetailsModal(true)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <div className="flex flex-col">
              <span className="text-game-text text-sm font-medium">
                {getStatusText()}
              </span>
              <span className="text-game-muted text-xs">
                {formatLatency(metrics.rpcLatency)}
              </span>
            </div>
          </div>

          {isEphemeralActive && (
            <div className="flex items-center gap-1 bg-primary-500/20 rounded px-2 py-1">
              <Zap className="h-3 w-3 text-primary-400" />
              <span className="text-xs text-primary-400">ER</span>
            </div>
          )}

          {metrics.errors > 0 && (
            <div className="flex items-center gap-1 bg-red-500/20 rounded px-2 py-1">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              <span className="text-xs text-red-400">{metrics.errors}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  const NetworkDetailsModal = () => (
    <AnimatePresence>
      {showDetailsModal && (
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
            className="bg-game-surface border border-game-border rounded-xl max-w-lg w-full"
          >
            {/* Header */}
            <div className="p-6 border-b border-game-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-6 w-6 text-primary-400" />
                  <div>
                    <h2 className="text-xl font-bold text-game-text font-gaming">
                      Network Status
                    </h2>
                    <p className="text-game-muted text-sm">
                      Real-time network performance metrics
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="text-game-muted hover:text-game-text transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Overall Status */}
            <div className="p-6 border-b border-game-border">
              <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <span className="font-bold text-game-text">
                      Network Status: {getStatusText()}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsMonitoring(!isMonitoring)}
                      leftIcon={isMonitoring ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    >
                      {isMonitoring ? 'Stop' : 'Start'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Activity className="h-4 w-4 text-primary-400" />
                      <span className="text-xs text-game-muted">RPC Latency</span>
                    </div>
                    <span className="text-lg font-bold text-game-text">
                      {formatLatency(metrics.rpcLatency)}
                    </span>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Gauge className="h-4 w-4 text-blue-400" />
                      <span className="text-xs text-game-muted">Block Height</span>
                    </div>
                    <span className="text-lg font-bold text-game-text">
                      {metrics.blockHeight.toLocaleString()}
                    </span>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="h-4 w-4 text-green-400" />
                      <span className="text-xs text-game-muted">Last Update</span>
                    </div>
                    <span className="text-sm text-game-text">
                      {formatDistanceToNow(metrics.lastUpdate, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Details */}
            <div className="p-6">
              <h3 className="font-bold text-game-text mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary-400" />
                Connection Details
              </h3>

              <div className="space-y-3">
                {connectionDetails.map((detail, index) => (
                  <div
                    key={index}
                    className="border border-game-border rounded-lg p-3 bg-game-bg/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          detail.status === 'connected' ? 'bg-green-400' :
                          detail.status === 'connecting' ? 'bg-yellow-400' :
                          'bg-red-400'
                        }`} />
                        <span className="font-medium text-game-text">{detail.name}</span>
                      </div>
                      
                      {detail.latency && (
                        <span className="text-sm text-game-muted">
                          {formatLatency(detail.latency)}
                        </span>
                      )}
                    </div>
                    
                    {detail.endpoint && (
                      <p className="text-xs text-game-muted font-mono mb-1">
                        {detail.endpoint}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className={`text-xs capitalize ${
                        detail.status === 'connected' ? 'text-green-400' :
                        detail.status === 'connecting' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {detail.status}
                      </span>
                      
                      {detail.lastPing && (
                        <span className="text-xs text-game-muted">
                          {formatDistanceToNow(detail.lastPing, { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Performance Tips */}
              <div className="mt-6 bg-primary-500/10 border border-primary-500/30 rounded-lg p-4">
                <h4 className="font-semibold text-primary-400 mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Performance Tips
                </h4>
                <ul className="text-sm text-game-muted space-y-1">
                  <li>• Latency under {LATENCY_THRESHOLDS.excellent}ms provides optimal gaming experience</li>
                  <li>• Ephemeral Rollups reduce latency by up to 90%</li>
                  <li>• WebSocket connection enables real-time updates</li>
                  {metrics.errors > 3 && (
                    <li className="text-red-400">• High error count detected - check internet connection</li>
                  )}
                </ul>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <StatusIndicator />
      <NetworkDetailsModal />
    </>
  );
};

export default NetworkStatusIndicator;