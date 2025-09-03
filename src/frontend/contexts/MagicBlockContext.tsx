/**
 * MagicBlock Context - Real SDK Integration
 * Provides MagicBlock SDK access throughout the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  initializeMagicBlockSDK,
  MagicBlockSDKInstance,
  MagicBlockStatus,
  MagicBlockMetrics
} from '../../magicblock/index';

interface MagicBlockContextType {
  sdk: MagicBlockSDKInstance | null;
  status: MagicBlockStatus | null;
  metrics: MagicBlockMetrics | null;
  isInitializing: boolean;
  error: string | null;
  initializeSDK: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshMetrics: () => void;
}

const MagicBlockContext = createContext<MagicBlockContextType | undefined>(undefined);

export const MagicBlockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sdk, setSdk] = useState<MagicBlockSDKInstance | null>(null);
  const [status, setStatus] = useState<MagicBlockStatus | null>(null);
  const [metrics, setMetrics] = useState<MagicBlockMetrics | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeSDK = useCallback(async () => {
    if (isInitializing || sdk) return;

    setIsInitializing(true);
    setError(null);

    try {
      console.log('🚀 Initializing MagicBlock SDK...');
      
      const newSDK = await initializeMagicBlockSDK({
        network: 'devnet',
        enableVRF: true,
        enableRollups: true,
        enableGasless: true,
        maxLatencyMs: 30,
        autoOptimize: true
      });

      setSdk(newSDK);
      console.log('✅ MagicBlock SDK initialized successfully');

      // Initial status and metrics
      const initialStatus = await newSDK.getStatus();
      const initialMetrics = newSDK.getMetrics();
      
      setStatus(initialStatus);
      setMetrics(initialMetrics);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Failed to initialize MagicBlock SDK:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing, sdk]);

  const refreshStatus = useCallback(async () => {
    if (!sdk) return;

    try {
      const currentStatus = await sdk.getStatus();
      setStatus(currentStatus);
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  }, [sdk]);

  const refreshMetrics = useCallback(() => {
    if (!sdk) return;

    try {
      const currentMetrics = sdk.getMetrics();
      setMetrics(currentMetrics);
    } catch (error) {
      console.error('Failed to refresh metrics:', error);
    }
  }, [sdk]);

  // Auto-initialize SDK on mount
  useEffect(() => {
    initializeSDK();
  }, [initializeSDK]);

  // Periodic status and metrics updates
  useEffect(() => {
    if (!sdk) return;

    const statusInterval = setInterval(refreshStatus, 5000); // Every 5 seconds
    const metricsInterval = setInterval(refreshMetrics, 2000); // Every 2 seconds

    return () => {
      clearInterval(statusInterval);
      clearInterval(metricsInterval);
    };
  }, [sdk, refreshStatus, refreshMetrics]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sdk) {
        sdk.cleanup().catch(console.error);
      }
    };
  }, [sdk]);

  return (
    <MagicBlockContext.Provider value={{
      sdk,
      status,
      metrics,
      isInitializing,
      error,
      initializeSDK,
      refreshStatus,
      refreshMetrics
    }}>
      {children}
    </MagicBlockContext.Provider>
  );
};

export const useMagicBlock = (): MagicBlockContextType => {
  const context = useContext(MagicBlockContext);
  if (context === undefined) {
    throw new Error('useMagicBlock must be used within a MagicBlockProvider');
  }
  return context;
};

export default MagicBlockProvider;