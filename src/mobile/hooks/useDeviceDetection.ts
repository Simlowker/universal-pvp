'use client';

import { useState, useEffect } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  devicePixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  availableWidth: number;
  availableHeight: number;
  orientation: 'portrait' | 'landscape';
  hasTouch: boolean;
  hasHover: boolean;
  connectionType: string;
  memoryStatus: 'low' | 'medium' | 'high';
  isStandalone: boolean;
  supports: {
    webGL: boolean;
    webGL2: boolean;
    webAssembly: boolean;
    serviceWorker: boolean;
    indexedDB: boolean;
    localStorage: boolean;
    sessionStorage: boolean;
    geolocation: boolean;
    camera: boolean;
    microphone: boolean;
    vibration: boolean;
    pushNotifications: boolean;
    backgroundSync: boolean;
    paymentRequest: boolean;
    webShare: boolean;
    clipboard: boolean;
    fullscreen: boolean;
  };
}

export const useDeviceDetection = () => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectDevice = async () => {
      if (typeof window === 'undefined') {
        setIsLoading(false);
        return;
      }

      const userAgent = navigator.userAgent.toLowerCase();
      const platform = navigator.platform?.toLowerCase() || '';
      
      // Device type detection
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
                      (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
      
      const isTablet = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent) ||
                      (isMobile && Math.min(screen.width, screen.height) >= 768);
      
      const isDesktop = !isMobile && !isTablet;

      // OS detection
      const isIOS = /iphone|ipad|ipod/i.test(userAgent) || 
                   (platform.includes('mac') && navigator.maxTouchPoints > 1);
      const isAndroid = /android/i.test(userAgent);

      // Browser detection
      const isSafari = /safari/i.test(userAgent) && !/chrome|chromium|crios|fxios|firefox/i.test(userAgent);
      const isChrome = /chrome|chromium|crios/i.test(userAgent) && !/edg|opera|opr/i.test(userAgent);
      const isFirefox = /firefox|fxios/i.test(userAgent);

      // Screen information
      const devicePixelRatio = window.devicePixelRatio || 1;
      const screenWidth = screen.width;
      const screenHeight = screen.height;
      const availableWidth = screen.availWidth;
      const availableHeight = screen.availHeight;
      
      // Orientation
      const orientation = screenWidth > screenHeight ? 'landscape' : 'portrait';

      // Input capabilities
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasHover = window.matchMedia('(hover: hover)').matches;

      // Connection type
      let connectionType = 'unknown';
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        connectionType = connection?.effectiveType || connection?.type || 'unknown';
      }

      // Memory status estimation
      let memoryStatus: 'low' | 'medium' | 'high' = 'medium';
      if ('deviceMemory' in navigator) {
        const deviceMemory = (navigator as any).deviceMemory;
        if (deviceMemory <= 2) memoryStatus = 'low';
        else if (deviceMemory >= 8) memoryStatus = 'high';
      }

      // PWA detection
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone ||
                          document.referrer.includes('android-app://');

      // Feature support detection
      const supports = {
        webGL: (() => {
          try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
          } catch (e) {
            return false;
          }
        })(),
        
        webGL2: (() => {
          try {
            const canvas = document.createElement('canvas');
            return !!canvas.getContext('webgl2');
          } catch (e) {
            return false;
          }
        })(),
        
        webAssembly: (() => {
          try {
            if (typeof WebAssembly === 'object' && 
                typeof WebAssembly.instantiate === 'function') {
              const module = new WebAssembly.Module(
                Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
              );
              return WebAssembly.Module.prototype.isPrototypeOf(module);
            }
            return false;
          } catch (e) {
            return false;
          }
        })(),
        
        serviceWorker: 'serviceWorker' in navigator,
        indexedDB: 'indexedDB' in window,
        localStorage: (() => {
          try {
            return 'localStorage' in window && window.localStorage !== null;
          } catch (e) {
            return false;
          }
        })(),
        
        sessionStorage: (() => {
          try {
            return 'sessionStorage' in window && window.sessionStorage !== null;
          } catch (e) {
            return false;
          }
        })(),
        
        geolocation: 'geolocation' in navigator,
        
        camera: (() => {
          return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        })(),
        
        microphone: (() => {
          return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        })(),
        
        vibration: 'vibrate' in navigator,
        
        pushNotifications: 'PushManager' in window && 'serviceWorker' in navigator,
        
        backgroundSync: 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype,
        
        paymentRequest: 'PaymentRequest' in window,
        
        webShare: 'share' in navigator,
        
        clipboard: 'clipboard' in navigator,
        
        fullscreen: !!(
          document.fullscreenEnabled || 
          (document as any).webkitFullscreenEnabled || 
          (document as any).mozFullScreenEnabled ||
          (document as any).msFullscreenEnabled
        ),
      };

      const deviceData: DeviceInfo = {
        isMobile,
        isTablet,
        isDesktop,
        isIOS,
        isAndroid,
        isSafari,
        isChrome,
        isFirefox,
        devicePixelRatio,
        screenWidth,
        screenHeight,
        availableWidth,
        availableHeight,
        orientation,
        hasTouch,
        hasHover,
        connectionType,
        memoryStatus,
        isStandalone,
        supports,
      };

      setDeviceInfo(deviceData);
      setIsLoading(false);

      // Log device capabilities for debugging
      console.log('Device Detection Results:', deviceData);
    };

    detectDevice();

    // Listen for orientation changes
    const handleOrientationChange = () => {
      setTimeout(() => {
        detectDevice();
      }, 100); // Small delay to ensure screen dimensions are updated
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  // Helper functions
  const isMobileDevice = () => deviceInfo?.isMobile || false;
  const isTabletDevice = () => deviceInfo?.isTablet || false;
  const isDesktopDevice = () => deviceInfo?.isDesktop || false;
  const isIOSDevice = () => deviceInfo?.isIOS || false;
  const isAndroidDevice = () => deviceInfo?.isAndroid || false;
  const hasTouchSupport = () => deviceInfo?.hasTouch || false;
  const hasHoverSupport = () => deviceInfo?.hasHover || false;
  const isLandscape = () => deviceInfo?.orientation === 'landscape';
  const isPortrait = () => deviceInfo?.orientation === 'portrait';
  const isLowMemoryDevice = () => deviceInfo?.memoryStatus === 'low';
  const isHighPerformanceDevice = () => deviceInfo?.memoryStatus === 'high';
  const isSlowConnection = () => {
    return ['slow-2g', '2g'].includes(deviceInfo?.connectionType || '');
  };
  const isFastConnection = () => {
    return ['4g', '5g'].includes(deviceInfo?.connectionType || '');
  };
  const isPWAInstalled = () => deviceInfo?.isStandalone || false;
  
  const getOptimalImageQuality = (): 'low' | 'medium' | 'high' => {
    if (!deviceInfo) return 'medium';
    
    if (deviceInfo.memoryStatus === 'low' || isSlowConnection()) {
      return 'low';
    } else if (deviceInfo.memoryStatus === 'high' && isFastConnection()) {
      return 'high';
    }
    return 'medium';
  };

  const getRecommendedFPS = (): number => {
    if (!deviceInfo) return 30;
    
    if (deviceInfo.memoryStatus === 'low' || isSlowConnection()) {
      return 30;
    } else if (deviceInfo.memoryStatus === 'high' && deviceInfo.devicePixelRatio <= 2) {
      return 60;
    }
    return 45;
  };

  const shouldPreloadAssets = (): boolean => {
    if (!deviceInfo) return false;
    return deviceInfo.memoryStatus !== 'low' && !isSlowConnection();
  };

  const getOptimalChunkSize = (): number => {
    if (!deviceInfo) return 1024;
    
    switch (deviceInfo.memoryStatus) {
      case 'low': return 512;
      case 'high': return 2048;
      default: return 1024;
    }
  };

  return {
    deviceInfo,
    isLoading,
    isMobileDevice,
    isTabletDevice,
    isDesktopDevice,
    isIOSDevice,
    isAndroidDevice,
    hasTouchSupport,
    hasHoverSupport,
    isLandscape,
    isPortrait,
    isLowMemoryDevice,
    isHighPerformanceDevice,
    isSlowConnection,
    isFastConnection,
    isPWAInstalled,
    getOptimalImageQuality,
    getRecommendedFPS,
    shouldPreloadAssets,
    getOptimalChunkSize,
  };
};