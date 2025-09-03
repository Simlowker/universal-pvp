/**
 * Custom hook for managing session keys in MagicBlock integration
 * Handles generation, storage, and secure management of ephemeral keypairs
 */

import { useState, useEffect, useCallback } from 'react';
import { Keypair } from '@solana/web3.js';

export interface SessionKeyData {
  keypair: Keypair | null;
  publicKey: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface SessionKeyOptions {
  storageKey?: string;
  autoGenerate?: boolean;
  onGenerate?: (publicKey: string) => void;
  onError?: (error: string) => void;
}

export const useSessionKey = (options: SessionKeyOptions = {}): SessionKeyData & {
  generateNew: () => void;
  clear: () => void;
  export: () => string | null;
  import: (secretKey: string) => boolean;
} => {
  const {
    storageKey = 'magicblock_session_key',
    autoGenerate = true,
    onGenerate,
    onError
  } = options;

  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize session key on mount
  useEffect(() => {
    const initializeSessionKey = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Try to load existing session key
        const stored = localStorage.getItem(storageKey);
        
        if (stored) {
          try {
            const secretKeyArray = JSON.parse(stored);
            const loadedKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
            
            setKeypair(loadedKeypair);
            setPublicKey(loadedKeypair.publicKey.toString());
            
            console.log('Session key loaded from storage');
            return;
          } catch (parseError) {
            console.warn('Failed to parse stored session key, generating new one');
            localStorage.removeItem(storageKey);
          }
        }

        // Generate new session key if none exists or autoGenerate is enabled
        if (autoGenerate) {
          generateSessionKey();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize session key';
        setError(errorMessage);
        if (onError) onError(errorMessage);
        console.error('Session key initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSessionKey();
  }, [storageKey, autoGenerate, onError]);

  // Generate new session key
  const generateSessionKey = useCallback(() => {
    try {
      setError(null);
      const newKeypair = Keypair.generate();
      const publicKeyString = newKeypair.publicKey.toString();
      
      // Store in localStorage
      const secretKeyArray = Array.from(newKeypair.secretKey);
      localStorage.setItem(storageKey, JSON.stringify(secretKeyArray));
      
      setKeypair(newKeypair);
      setPublicKey(publicKeyString);
      
      if (onGenerate) onGenerate(publicKeyString);
      console.log('New session key generated:', publicKeyString);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate session key';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      console.error('Session key generation error:', err);
    }
  }, [storageKey, onGenerate, onError]);

  // Generate new session key manually
  const generateNew = useCallback(() => {
    generateSessionKey();
  }, [generateSessionKey]);

  // Clear session key
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setKeypair(null);
      setPublicKey(null);
      setError(null);
      console.log('Session key cleared');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear session key';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    }
  }, [storageKey, onError]);

  // Export session key as base58 string
  const exportKey = useCallback((): string | null => {
    if (!keypair) return null;
    
    try {
      // Return as base58 encoded secret key
      return JSON.stringify(Array.from(keypair.secretKey));
    } catch (err) {
      console.error('Failed to export session key:', err);
      return null;
    }
  }, [keypair]);

  // Import session key from base58 string
  const importKey = useCallback((secretKeyJson: string): boolean => {
    try {
      setError(null);
      const secretKeyArray = JSON.parse(secretKeyJson);
      const importedKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
      const publicKeyString = importedKeypair.publicKey.toString();
      
      // Store in localStorage
      localStorage.setItem(storageKey, secretKeyJson);
      
      setKeypair(importedKeypair);
      setPublicKey(publicKeyString);
      
      console.log('Session key imported successfully:', publicKeyString);
      return true;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid session key format';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      console.error('Session key import error:', err);
      return false;
    }
  }, [storageKey, onError]);

  return {
    keypair,
    publicKey,
    isLoading,
    error,
    generateNew,
    clear,
    export: exportKey,
    import: importKey
  };
};

/**
 * Hook for session key status and management utilities
 */
export const useSessionKeyStatus = (publicKey: string | null) => {
  const [isValid, setIsValid] = useState(false);
  const [age, setAge] = useState<number>(0);

  useEffect(() => {
    if (!publicKey) {
      setIsValid(false);
      setAge(0);
      return;
    }

    // Basic validation - check if it's a valid Solana public key format
    setIsValid(publicKey.length === 44); // Base58 encoded public key length

    // Calculate age (mock implementation - in real app you'd track creation time)
    const creationTime = localStorage.getItem('session_key_created_at');
    if (creationTime) {
      const created = parseInt(creationTime);
      const now = Date.now();
      setAge(now - created);
    } else {
      // Store current time if not exists
      localStorage.setItem('session_key_created_at', Date.now().toString());
      setAge(0);
    }
  }, [publicKey]);

  const formatAge = useCallback((ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }, []);

  return {
    isValid,
    age,
    formattedAge: formatAge(age),
    isExpired: age > 30 * 24 * 60 * 60 * 1000, // 30 days
    shouldRotate: age > 7 * 24 * 60 * 60 * 1000 // 7 days
  };
};