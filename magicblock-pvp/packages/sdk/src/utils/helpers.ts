/**
 * Utility helper functions for the MagicBlock SDK
 */

import { PublicKey } from '@solana/web3.js';
import { sha512 } from '@noble/hashes/sha512';
import { SDK_CONSTANTS } from './constants';

/**
 * Validation utilities
 */
export const ValidationUtils = {
  /**
   * Validate Solana public key
   */
  isValidPublicKey(key: string | PublicKey): boolean {
    try {
      if (typeof key === 'string') {
        new PublicKey(key);
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate VRF proof format
   */
  isValidVRFProof(proof: any): boolean {
    return !!
      proof &&
      proof.gamma instanceof Uint8Array &&
      proof.gamma.length === SDK_CONSTANTS.VRF.POINT_SIZE &&
      proof.c instanceof Uint8Array &&
      proof.c.length === SDK_CONSTANTS.VRF.CHALLENGE_SIZE &&
      proof.s instanceof Uint8Array &&
      proof.s.length === SDK_CONSTANTS.VRF.SCALAR_SIZE &&
      proof.alpha instanceof Uint8Array;
  },

  /**
   * Validate TEE attestation format
   */
  isValidTEEAttestation(attestation: any): boolean {
    return !!
      attestation &&
      typeof attestation.vendor === 'string' &&
      SDK_CONSTANTS.TEE.SUPPORTED_VENDORS.includes(attestation.vendor as any) &&
      attestation.quote instanceof Uint8Array &&
      attestation.quote.length >= SDK_CONSTANTS.TEE.MIN_QUOTE_SIZE &&
      attestation.signature instanceof Uint8Array &&
      attestation.signature.length >= SDK_CONSTANTS.TEE.MIN_SIGNATURE_SIZE &&
      attestation.certificate instanceof Uint8Array &&
      attestation.certificate.length >= SDK_CONSTANTS.TEE.MIN_CERTIFICATE_SIZE &&
      typeof attestation.timestamp === 'number' &&
      attestation.timestamp > 0;
  },

  /**
   * Validate rollup proof format
   */
  isValidRollupProof(proof: any): boolean {
    return !!
      proof &&
      proof.stateRoot instanceof Uint8Array &&
      proof.stateRoot.length === SDK_CONSTANTS.PROOF.STATE_ROOT_SIZE &&
      proof.blockHash instanceof Uint8Array &&
      proof.blockHash.length === SDK_CONSTANTS.PROOF.BLOCK_HASH_SIZE &&
      proof.transactionHash instanceof Uint8Array &&
      proof.transactionHash.length === SDK_CONSTANTS.PROOF.TRANSACTION_HASH_SIZE &&
      proof.signature instanceof Uint8Array &&
      proof.signature.length === SDK_CONSTANTS.PROOF.SIGNATURE_SIZE &&
      typeof proof.timestamp === 'number' &&
      proof.timestamp > 0 &&
      typeof proof.blockNumber === 'number' &&
      proof.blockNumber > 0;
  }
};

/**
 * Crypto utilities
 */
export const CryptoUtils = {
  /**
   * Generate secure random bytes
   */
  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  },

  /**
   * Hash data using SHA-512
   */
  hash(data: Uint8Array): Uint8Array {
    return sha512(data);
  },

  /**
   * Constant-time comparison to prevent timing attacks
   */
  constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  },

  /**
   * Convert bytes to hex string
   */
  bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Convert hex string to bytes
   */
  hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error('Invalid hex string');
    }
    
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    
    return bytes;
  },

  /**
   * XOR two byte arrays
   */
  xor(a: Uint8Array, b: Uint8Array): Uint8Array {
    if (a.length !== b.length) {
      throw new Error('Arrays must have same length');
    }
    
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    
    return result;
  }
};

/**
 * Format utilities
 */
export const FormatUtils = {
  /**
   * Format public key for display
   */
  formatPublicKey(pubkey: PublicKey, length: number = 8): string {
    const str = pubkey.toString();
    if (str.length <= length * 2) {
      return str;
    }
    return `${str.slice(0, length)}...${str.slice(-length)}`;
  },

  /**
   * Format SOL amount
   */
  formatSOL(lamports: number): string {
    const sol = lamports / 1_000_000_000;
    return `${sol.toFixed(6)} SOL`;
  },

  /**
   * Format duration in milliseconds
   */
  formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60_000) {
      return `${(ms / 1000).toFixed(2)}s`;
    } else if (ms < 3_600_000) {
      return `${(ms / 60_000).toFixed(2)}m`;
    } else {
      return `${(ms / 3_600_000).toFixed(2)}h`;
    }
  },

  /**
   * Format bytes with units
   */
  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  },

  /**
   * Format percentage
   */
  formatPercentage(value: number): string {
    return `${(value * 100).toFixed(2)}%`;
  },

  /**
   * Format large numbers with suffixes
   */
  formatNumber(num: number): string {
    const suffixes = ['', 'K', 'M', 'B', 'T'];
    let value = num;
    let suffixIndex = 0;
    
    while (value >= 1000 && suffixIndex < suffixes.length - 1) {
      value /= 1000;
      suffixIndex++;
    }
    
    return `${value.toFixed(value < 10 ? 2 : 1)}${suffixes[suffixIndex]}`;
  }
};

/**
 * Time utilities
 */
export const TimeUtils = {
  /**
   * Get current timestamp in milliseconds
   */
  now(): number {
    return Date.now();
  },

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Create a timeout promise that rejects
   */
  timeout(ms: number, message = 'Operation timed out'): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  },

  /**
   * Race a promise against a timeout
   */
  withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
    return Promise.race([
      promise,
      this.timeout(ms, message)
    ]);
  },

  /**
   * Check if timestamp is expired
   */
  isExpired(timestamp: number, maxAgeMs: number): boolean {
    return (Date.now() - timestamp) > maxAgeMs;
  },

  /**
   * Get time until expiry
   */
  getTimeUntilExpiry(timestamp: number, maxAgeMs: number): number {
    const expiryTime = timestamp + maxAgeMs;
    return Math.max(0, expiryTime - Date.now());
  },

  /**
   * Convert seconds to milliseconds
   */
  secondsToMs(seconds: number): number {
    return seconds * 1000;
  },

  /**
   * Convert minutes to milliseconds
   */
  minutesToMs(minutes: number): number {
    return minutes * 60 * 1000;
  },

  /**
   * Convert hours to milliseconds
   */
  hoursToMs(hours: number): number {
    return hours * 60 * 60 * 1000;
  }
};

/**
 * Array utilities
 */
export const ArrayUtils = {
  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  /**
   * Remove duplicates from array
   */
  unique<T>(array: T[]): T[] {
    return [...new Set(array)];
  },

  /**
   * Chunk array into smaller arrays
   */
  chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  /**
   * Get random element from array
   */
  randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  },

  /**
   * Get multiple random elements without replacement
   */
  randomElements<T>(array: T[], count: number): T[] {
    if (count >= array.length) {
      return this.shuffle(array);
    }
    
    const shuffled = this.shuffle(array);
    return shuffled.slice(0, count);
  }
};

/**
 * Performance utilities
 */
export const PerfUtils = {
  /**
   * Measure execution time of a function
   */
  async measure<T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    return { result, duration };
  },

  /**
   * Create a simple benchmark
   */
  async benchmark(fn: () => Promise<void> | void, iterations: number = 100): Promise<{
    averageMs: number;
    minMs: number;
    maxMs: number;
    totalMs: number;
  }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measure(fn);
      times.push(duration);
    }
    
    const totalMs = times.reduce((sum, time) => sum + time, 0);
    const averageMs = totalMs / iterations;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);
    
    return { averageMs, minMs, maxMs, totalMs };
  },

  /**
   * Throttle function execution
   */
  throttle<T extends (...args: any[]) => any>(fn: T, ms: number): T {
    let lastCall = 0;
    return ((...args) => {
      const now = Date.now();
      if (now - lastCall >= ms) {
        lastCall = now;
        return fn(...args);
      }
    }) as T;
  },

  /**
   * Debounce function execution
   */
  debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
    let timeout: NodeJS.Timeout;
    return ((...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    }) as T;
  }
};

/**
 * Error utilities
 */
export const ErrorUtils = {
  /**
   * Check if error is a specific type
   */
  isErrorType(error: any, type: string): boolean {
    return error && error.name === type;
  },

  /**
   * Extract error message safely
   */
  getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  },

  /**
   * Create error with additional context
   */
  createError(message: string, code: string, context?: Record<string, any>): Error {
    const error = new Error(message) as any;
    error.code = code;
    if (context) {
      error.context = context;
    }
    return error;
  },

  /**
   * Retry function with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          break;
        }
        
        const delay = baseDelayMs * Math.pow(2, attempt);
        await TimeUtils.sleep(delay);
      }
    }
    
    throw lastError!;
  }
};

/**
 * Export all utilities as a single object
 */
export const SDKUtils = {
  Validation: ValidationUtils,
  Crypto: CryptoUtils,
  Format: FormatUtils,
  Time: TimeUtils,
  Array: ArrayUtils,
  Perf: PerfUtils,
  Error: ErrorUtils
};"