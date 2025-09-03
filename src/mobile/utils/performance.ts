'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Performance monitoring utilities for mobile gaming
export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  batteryLevel: number;
  networkType: string;
  devicePixelRatio: number;
  screenOrientation: string;
  touchLatency: number;
}

export interface OptimizationConfig {
  targetFPS: number;
  maxMemoryUsage: number;
  enableAdaptiveQuality: boolean;
  enableBatteryOptimization: boolean;
  preloadAssets: boolean;
}

class MobilePerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fps: 60,
    frameTime: 16.67,
    memoryUsage: 0,
    batteryLevel: 100,
    networkType: 'unknown',
    devicePixelRatio: 1,
    screenOrientation: 'portrait',
    touchLatency: 0,
  };

  private config: OptimizationConfig = {
    targetFPS: 60,
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    enableAdaptiveQuality: true,
    enableBatteryOptimization: true,
    preloadAssets: true,
  };

  private frameCount = 0;
  private lastFrameTime = 0;
  private fpsBuffer: number[] = [];
  private animationFrameId: number | null = null;
  private memoryCheckInterval: number | null = null;
  private touchStart = 0;
  private callbacks: ((metrics: PerformanceMetrics) => void)[] = [];

  constructor(config?: Partial<OptimizationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.initializeMonitoring();
  }

  private initializeMonitoring() {
    if (typeof window === 'undefined') return;

    // Initialize device info
    this.metrics.devicePixelRatio = window.devicePixelRatio || 1;
    this.updateNetworkInfo();
    this.updateBatteryInfo();
    this.updateOrientationInfo();

    // Start FPS monitoring
    this.startFPSMonitoring();

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Setup event listeners
    this.setupEventListeners();
  }

  private startFPSMonitoring() {
    const measureFrame = (currentTime: number) => {
      if (this.lastFrameTime === 0) {
        this.lastFrameTime = currentTime;
      } else {
        const deltaTime = currentTime - this.lastFrameTime;
        const fps = 1000 / deltaTime;
        
        this.fpsBuffer.push(fps);
        if (this.fpsBuffer.length > 60) { // Keep last 60 frames
          this.fpsBuffer.shift();
        }

        // Calculate average FPS
        const avgFPS = this.fpsBuffer.reduce((sum, fps) => sum + fps, 0) / this.fpsBuffer.length;
        this.metrics.fps = Math.round(avgFPS);
        this.metrics.frameTime = deltaTime;

        this.lastFrameTime = currentTime;
        this.frameCount++;

        // Adaptive quality adjustment
        if (this.config.enableAdaptiveQuality) {
          this.adjustQualityBasedOnPerformance();
        }
      }

      this.animationFrameId = requestAnimationFrame(measureFrame);
    };

    this.animationFrameId = requestAnimationFrame(measureFrame);
  }

  private startMemoryMonitoring() {
    const checkMemory = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.metrics.memoryUsage = memory.usedJSHeapSize;

        // Trigger garbage collection if memory usage is high
        if (this.metrics.memoryUsage > this.config.maxMemoryUsage * 0.8) {
          this.suggestGarbageCollection();
        }
      }
    };

    // Check memory every 5 seconds
    this.memoryCheckInterval = window.setInterval(checkMemory, 5000);
    checkMemory(); // Initial check
  }

  private setupEventListeners() {
    // Network change
    if ('connection' in navigator) {
      (navigator as any).connection.addEventListener('change', this.updateNetworkInfo.bind(this));
    }

    // Battery change
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        battery.addEventListener('levelchange', this.updateBatteryInfo.bind(this));
      });
    }

    // Orientation change
    window.addEventListener('orientationchange', this.updateOrientationInfo.bind(this));
    
    // Touch latency measurement
    document.addEventListener('touchstart', this.measureTouchStart.bind(this), { passive: true });
    document.addEventListener('touchend', this.measureTouchEnd.bind(this), { passive: true });

    // Page visibility for performance optimization
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
  }

  private updateNetworkInfo() {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      this.metrics.networkType = connection.effectiveType || connection.type || 'unknown';
    }
  }

  private updateBatteryInfo() {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.metrics.batteryLevel = Math.round(battery.level * 100);
      });
    }
  }

  private updateOrientationInfo() {
    this.metrics.screenOrientation = screen.orientation ? 
      screen.orientation.type : 
      window.orientation ? 
        (Math.abs(window.orientation) === 90 ? 'landscape' : 'portrait') : 
        'portrait';
  }

  private measureTouchStart(event: TouchEvent) {
    this.touchStart = performance.now();
  }

  private measureTouchEnd(event: TouchEvent) {
    if (this.touchStart > 0) {
      const latency = performance.now() - this.touchStart;
      this.metrics.touchLatency = latency;
      this.touchStart = 0;
    }
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      // App went to background - reduce performance monitoring
      this.pauseMonitoring();
    } else {
      // App came back to foreground - resume monitoring
      this.resumeMonitoring();
    }
  }

  private adjustQualityBasedOnPerformance() {
    const { fps, memoryUsage, batteryLevel } = this.metrics;
    
    // Reduce quality if performance is poor
    if (fps < this.config.targetFPS * 0.8 || 
        memoryUsage > this.config.maxMemoryUsage * 0.9 ||
        (this.config.enableBatteryOptimization && batteryLevel < 20)) {
      
      this.notifyQualityAdjustment('reduce');
    } 
    // Increase quality if performance is good
    else if (fps > this.config.targetFPS * 0.95 && 
             memoryUsage < this.config.maxMemoryUsage * 0.7 &&
             batteryLevel > 50) {
      
      this.notifyQualityAdjustment('increase');
    }
  }

  private notifyQualityAdjustment(direction: 'increase' | 'reduce') {
    const event = new CustomEvent('performanceAdjustment', {
      detail: { direction, metrics: this.metrics }
    });
    window.dispatchEvent(event);
  }

  private suggestGarbageCollection() {
    // Suggest garbage collection by clearing unused resources
    const event = new CustomEvent('memoryPressure', {
      detail: { usage: this.metrics.memoryUsage, limit: this.config.maxMemoryUsage }
    });
    window.dispatchEvent(event);
  }

  private pauseMonitoring() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  private resumeMonitoring() {
    this.startFPSMonitoring();
    this.startMemoryMonitoring();
  }

  public subscribe(callback: (metrics: PerformanceMetrics) => void) {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  public getMetrics(): PerformanceMetrics {
    // Notify subscribers
    this.callbacks.forEach(callback => callback(this.metrics));
    return { ...this.metrics };
  }

  public updateConfig(newConfig: Partial<OptimizationConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public destroy() {
    this.pauseMonitoring();
    this.callbacks = [];
  }
}

// React hook for performance monitoring
export const usePerformanceMonitoring = (config?: Partial<OptimizationConfig>) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const monitorRef = useRef<MobilePerformanceMonitor | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      monitorRef.current = new MobilePerformanceMonitor(config);
      
      const unsubscribe = monitorRef.current.subscribe((newMetrics) => {
        setMetrics(newMetrics);
      });

      // Update metrics every second
      const interval = setInterval(() => {
        if (monitorRef.current) {
          monitorRef.current.getMetrics();
        }
      }, 1000);

      return () => {
        clearInterval(interval);
        unsubscribe();
        if (monitorRef.current) {
          monitorRef.current.destroy();
        }
      };
    }
  }, []);

  const updateConfig = useCallback((newConfig: Partial<OptimizationConfig>) => {
    if (monitorRef.current) {
      monitorRef.current.updateConfig(newConfig);
    }
  }, []);

  return {
    metrics,
    updateConfig,
    isLowPerformance: metrics ? metrics.fps < 30 || metrics.memoryUsage > 80 * 1024 * 1024 : false,
    isLowBattery: metrics ? metrics.batteryLevel < 20 : false,
    isSlowNetwork: metrics ? ['slow-2g', '2g'].includes(metrics.networkType) : false,
  };
};

// Utility functions for mobile optimization
export const optimizeForMobile = {
  // Preload critical game assets
  preloadAssets: async (urls: string[]) => {
    const promises = urls.map(url => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
    });

    try {
      await Promise.all(promises);
      console.log('Assets preloaded successfully');
    } catch (error) {
      console.warn('Some assets failed to preload:', error);
    }
  },

  // Optimize image loading for mobile
  createOptimizedImage: (src: string, quality: 'low' | 'medium' | 'high' = 'medium') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise<string>((resolve) => {
      img.onload = () => {
        const scaleFactor = {
          low: 0.5,
          medium: 0.75,
          high: 1.0,
        }[quality];

        canvas.width = img.width * scaleFactor;
        canvas.height = img.height * scaleFactor;
        
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = src;
    });
  },

  // Debounce function for touch events
  debounce: <T extends (...args: any[]) => void>(func: T, wait: number): T => {
    let timeout: NodeJS.Timeout;
    return ((...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(null, args), wait);
    }) as T;
  },

  // Throttle function for frequent events
  throttle: <T extends (...args: any[]) => void>(func: T, limit: number): T => {
    let inThrottle: boolean;
    return ((...args: any[]) => {
      if (!inThrottle) {
        func.apply(null, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }) as T;
  },
};