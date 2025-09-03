'use client';

import { useCallback, useEffect, useState } from 'react';

interface TouchFeedbackConfig {
  hapticEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const useTouchFeedback = () => {
  const [config, setConfig] = useState<TouchFeedbackConfig>({
    hapticEnabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
  });

  const [isSupported, setIsSupported] = useState({
    haptic: false,
    vibration: false,
  });

  useEffect(() => {
    // Check for haptic feedback support
    const checkHapticSupport = () => {
      if (typeof window !== 'undefined') {
        // Check for iOS haptic feedback
        const hasHaptic = 'vibrate' in navigator || 'webkitVibrate' in navigator;
        
        // Check for Android vibration API
        const hasVibration = 'vibrate' in navigator;
        
        setIsSupported({
          haptic: hasHaptic,
          vibration: hasVibration,
        });
      }
    };

    checkHapticSupport();
  }, []);

  const triggerHaptic = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!config.hapticEnabled || typeof window === 'undefined') return;

    // iOS Haptic Feedback (requires iOS 10+)
    if ('tapticEngine' in navigator) {
      try {
        switch (intensity) {
          case 'light':
            (navigator as any).tapticEngine.selection();
            break;
          case 'medium':
            (navigator as any).tapticEngine.impact({ style: 'medium' });
            break;
          case 'heavy':
            (navigator as any).tapticEngine.impact({ style: 'heavy' });
            break;
        }
      } catch (error) {
        console.warn('Haptic feedback not supported:', error);
      }
    }
    
    // Fallback to vibration API
    else if (config.vibrationEnabled && isSupported.vibration && navigator.vibrate) {
      const vibrationPattern = {
        light: 10,
        medium: 20,
        heavy: 50,
      };
      
      try {
        navigator.vibrate(vibrationPattern[intensity]);
      } catch (error) {
        console.warn('Vibration not supported:', error);
      }
    }
  }, [config, isSupported]);

  const triggerVibration = useCallback((pattern: number | number[]) => {
    if (!config.vibrationEnabled || !isSupported.vibration || typeof window === 'undefined') return;

    try {
      navigator.vibrate(pattern);
    } catch (error) {
      console.warn('Vibration not supported:', error);
    }
  }, [config.vibrationEnabled, isSupported.vibration]);

  const playTouchSound = useCallback((soundType: 'click' | 'success' | 'error' | 'notification' = 'click') => {
    if (!config.soundEnabled || typeof window === 'undefined') return;

    // Use Web Audio API for low-latency sounds
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const soundFrequencies = {
        click: 800,
        success: 1000,
        error: 400,
        notification: 600,
      };
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(soundFrequencies[soundType], audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.warn('Touch sound not supported:', error);
    }
  }, [config.soundEnabled]);

  const updateConfig = useCallback((updates: Partial<TouchFeedbackConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    triggerHaptic,
    triggerVibration,
    playTouchSound,
    config,
    updateConfig,
    isSupported,
  };
};