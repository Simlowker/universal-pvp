'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Wifi, Clock, Eye, EyeOff } from 'lucide-react';
import { useMagicBlock } from '../../contexts/MagicBlockContext';

interface PerformanceMetrics {
  fps: number;
  latency: number;
  actionTime: number;
  memoryUsage: number;
  networkStatus: 'excellent' | 'good' | 'poor';
}

const PerformanceHUD: React.FC = () => {
  const { 
    latency, 
    isRealTimeConnected, 
    isEphemeralActive,
    lastActionTime 
  } = useMagicBlock();
  
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    latency: latency || 0,
    actionTime: 0,
    memoryUsage: 0,
    networkStatus: 'excellent'
  });
  
  const [isVisible, setIsVisible] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameTime, setLastFrameTime] = useState(performance.now());

  // FPS and performance monitoring
  useEffect(() => {
    let animationId: number;
    let frameCounter = 0;
    let lastTime = performance.now();

    const measurePerformance = (timestamp: number) => {
      frameCounter++;
      
      if (timestamp - lastTime >= 1000) {
        const fps = Math.round((frameCounter * 1000) / (timestamp - lastTime));
        const memory = (performance as any).memory ? 
          Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : 0;
        
        setMetrics(prev => ({
          ...prev,
          fps,
          latency: latency || 0,
          memoryUsage: memory,
          networkStatus: getNetworkStatus(latency || 0),
          actionTime: lastActionTime ? Date.now() - lastActionTime : 0
        }));
        
        frameCounter = 0;
        lastTime = timestamp;
      }
      
      animationId = requestAnimationFrame(measurePerformance);
    };

    animationId = requestAnimationFrame(measurePerformance);
    return () => cancelAnimationFrame(animationId);
  }, [latency, lastActionTime]);

  const getNetworkStatus = (latency: number): 'excellent' | 'good' | 'poor' => {
    if (latency < 50) return 'excellent';
    if (latency < 150) return 'good';
    return 'poor';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getFpsColor = (fps: number) => {
    if (fps >= 55) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed top-4 right-4 z-50 bg-game-surface border border-game-border rounded-lg p-2 hover:bg-game-surface/80 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {isVisible ? <EyeOff className="h-4 w-4 text-game-text" /> : <Eye className="h-4 w-4 text-game-text" />}
      </motion.button>

      {/* Performance HUD */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed top-16 right-4 z-40 bg-game-surface/95 border border-game-border rounded-xl p-4 backdrop-blur-xl shadow-2xl min-w-[280px]"
          >
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-game-border pb-2">
                <Activity className="h-5 w-5 text-primary-400" />
                <h3 className="font-bold text-game-text font-gaming">Performance</h3>
              </div>

              {/* FPS Counter */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary-400" />
                  <span className="text-game-muted text-sm">Frame Rate</span>
                </div>
                <div className="flex items-center gap-1">
                  <motion.span 
                    className={`font-bold text-lg ${getFpsColor(metrics.fps)}`}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                  >
                    {metrics.fps}
                  </motion.span>
                  <span className="text-game-muted text-xs">FPS</span>
                </div>
              </div>

              {/* Network Latency */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className={`h-4 w-4 ${isRealTimeConnected ? 'text-green-400' : 'text-red-400'}`} />
                  <span className="text-game-muted text-sm">Latency</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`font-bold text-lg ${getStatusColor(metrics.networkStatus)}`}>
                    {metrics.latency}
                  </span>
                  <span className="text-game-muted text-xs">ms</span>
                </div>
              </div>

              {/* Action Response Time */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary-400" />
                  <span className="text-game-muted text-sm">Action Time</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-lg text-primary-400">
                    {metrics.actionTime > 0 ? Math.min(metrics.actionTime, 999) : 0}
                  </span>
                  <span className="text-game-muted text-xs">ms</span>
                </div>
              </div>

              {/* Memory Usage (if available) */}
              {metrics.memoryUsage > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-game-muted text-sm">Memory</span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-lg text-blue-400">
                      {metrics.memoryUsage}
                    </span>
                    <span className="text-game-muted text-xs">MB</span>
                  </div>
                </div>
              )}

              {/* Connection Status */}
              <div className="border-t border-game-border pt-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-game-muted text-sm">Connection</span>
                    <span className="text-primary-400 text-sm font-semibold">
                      {isEphemeralActive ? 'Ephemeral' : 'Mainnet'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-game-muted text-sm">Real-time</span>
                    <div className="flex items-center gap-2">
                      <div 
                        className={`w-2 h-2 rounded-full ${
                          isRealTimeConnected ? 'bg-green-400' : 'bg-red-400'
                        }`}
                      />
                      <span className="text-game-text text-sm">
                        {isRealTimeConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Grade */}
              <div className="border-t border-game-border pt-3">
                <div className="text-center">
                  <div className="text-xs text-game-muted mb-1">Performance Grade</div>
                  <motion.div
                    className={`text-2xl font-bold font-gaming ${
                      metrics.fps >= 55 && metrics.latency < 50 ? 'text-green-400' :
                      metrics.fps >= 30 && metrics.latency < 150 ? 'text-yellow-400' :
                      'text-red-400'
                    }`}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {metrics.fps >= 55 && metrics.latency < 50 ? 'S' :
                     metrics.fps >= 30 && metrics.latency < 150 ? 'A' : 'B'}
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PerformanceHUD;