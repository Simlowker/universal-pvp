/**
 * Real-time update utilities for MagicBlock SDK integration
 * Handles WebSocket connections, optimistic updates, and smooth animations
 */

export interface OptimisticUpdate<T = any> {
  id: string;
  type: string;
  data: T;
  timestamp: number;
  confirmed: boolean;
  rollbackData?: T;
}

export interface AnimationFrame {
  id: string;
  startTime: number;
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
}

export class RealTimeUpdateManager {
  private ws: WebSocket | null = null;
  private optimisticUpdates: Map<string, OptimisticUpdate> = new Map();
  private animationFrames: Map<string, AnimationFrame> = new Map();
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnected = false;
  private animationId: number | null = null;

  constructor(private playerAddress: string, private wsEndpoint: string) {
    this.startAnimationLoop();
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${this.wsEndpoint}/${this.playerAddress}`);

        this.ws.onopen = () => {
          console.log('Real-time connection established');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = () => {
          console.log('Real-time connection closed');
          this.isConnected = false;
          this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        // Timeout for connection
        setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(eventType);
        }
      }
    };
  }

  /**
   * Apply optimistic update that can be rolled back if confirmed update differs
   */
  applyOptimisticUpdate<T>(
    id: string,
    type: string,
    data: T,
    rollbackData?: T
  ): void {
    const update: OptimisticUpdate<T> = {
      id,
      type,
      data,
      timestamp: Date.now(),
      confirmed: false,
      rollbackData
    };

    this.optimisticUpdates.set(id, update);

    // Emit optimistic update
    this.emitToListeners(type, { ...data, optimistic: true, updateId: id });

    // Auto-rollback after 5 seconds if not confirmed
    setTimeout(() => {
      const storedUpdate = this.optimisticUpdates.get(id);
      if (storedUpdate && !storedUpdate.confirmed) {
        this.rollbackOptimisticUpdate(id);
      }
    }, 5000);
  }

  /**
   * Confirm an optimistic update (prevents rollback)
   */
  confirmOptimisticUpdate(id: string, confirmedData?: any): void {
    const update = this.optimisticUpdates.get(id);
    if (update) {
      update.confirmed = true;
      
      // If confirmed data differs from optimistic, emit correction
      if (confirmedData && JSON.stringify(confirmedData) !== JSON.stringify(update.data)) {
        this.emitToListeners(update.type, { 
          ...confirmedData, 
          correction: true, 
          updateId: id 
        });
      }
    }
  }

  /**
   * Rollback an optimistic update
   */
  rollbackOptimisticUpdate(id: string): void {
    const update = this.optimisticUpdates.get(id);
    if (update && update.rollbackData) {
      this.emitToListeners(update.type, { 
        ...update.rollbackData, 
        rollback: true, 
        updateId: id 
      });
    }
    this.optimisticUpdates.delete(id);
  }

  /**
   * Create smooth animation with specified duration and easing
   */
  animate(
    id: string,
    duration: number,
    onUpdate: (progress: number) => void,
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' = 'ease-out',
    onComplete?: () => void
  ): void {
    const frame: AnimationFrame = {
      id,
      startTime: Date.now(),
      duration,
      easing,
      onUpdate,
      onComplete
    };

    this.animationFrames.set(id, frame);
  }

  /**
   * Cancel an ongoing animation
   */
  cancelAnimation(id: string): void {
    this.animationFrames.delete(id);
  }

  /**
   * Send message through WebSocket
   */
  send(type: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data, timestamp: Date.now() }));
    } else {
      console.warn('Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    reconnecting: boolean;
    lastError: string | null;
  } {
    return {
      connected: this.isConnected,
      reconnecting: this.reconnectAttempts > 0 && this.reconnectAttempts < this.maxReconnectAttempts,
      lastError: null // Could be enhanced to track last error
    };
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);
      const { type, data, updateId } = message;

      // If this is a confirmation of an optimistic update
      if (updateId) {
        this.confirmOptimisticUpdate(updateId, data);
      } else {
        // Regular update
        this.emitToListeners(type, data);
      }

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Emit data to registered listeners
   */
  private emitToListeners(eventType: string, data: any): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    setTimeout(() => {
      console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Animation loop for smooth 60 FPS animations
   */
  private startAnimationLoop(): void {
    const animate = () => {
      const now = Date.now();
      
      for (const [id, frame] of this.animationFrames.entries()) {
        const elapsed = now - frame.startTime;
        const progress = Math.min(1, elapsed / frame.duration);
        
        // Apply easing function
        const easedProgress = this.applyEasing(progress, frame.easing);
        
        try {
          frame.onUpdate(easedProgress);
          
          if (progress >= 1) {
            if (frame.onComplete) frame.onComplete();
            this.animationFrames.delete(id);
          }
        } catch (error) {
          console.error(`Animation error for ${id}:`, error);
          this.animationFrames.delete(id);
        }
      }
      
      this.animationId = requestAnimationFrame(animate);
    };
    
    animate();
  }

  /**
   * Apply easing functions
   */
  private applyEasing(
    t: number, 
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  ): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - Math.pow(1 - t, 2);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default:
        return t;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.disconnect();
    this.optimisticUpdates.clear();
    this.animationFrames.clear();
    this.listeners.clear();
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

/**
 * Create optimized WebSocket connection with auto-reconnect
 */
export const createRealTimeConnection = (
  playerAddress: string,
  wsEndpoint = 'wss://api.magicblock.app/ws'
): RealTimeUpdateManager => {
  return new RealTimeUpdateManager(playerAddress, wsEndpoint);
};

/**
 * Utility for smooth stat transitions (health, mana, etc.)
 */
export const animateStatChange = (
  fromValue: number,
  toValue: number,
  duration: number,
  onUpdate: (value: number) => void,
  manager: RealTimeUpdateManager
): void => {
  const difference = toValue - fromValue;
  const animationId = `stat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  manager.animate(
    animationId,
    duration,
    (progress) => {
      const currentValue = fromValue + (difference * progress);
      onUpdate(Math.round(currentValue));
    },
    'ease-out'
  );
};

/**
 * Utility for damage number animations
 */
export const animateDamageNumber = (
  damage: number,
  isHealing: boolean,
  element: HTMLElement,
  manager: RealTimeUpdateManager
): void => {
  const animationId = `damage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startY = 0;
  const endY = -100;
  
  manager.animate(
    animationId,
    2000, // 2 seconds
    (progress) => {
      const y = startY + (endY - startY) * progress;
      const opacity = Math.max(0, 1 - progress);
      const scale = 1 + Math.sin(progress * Math.PI) * 0.2;
      
      element.style.transform = `translateY(${y}px) scale(${scale})`;
      element.style.opacity = opacity.toString();
      element.style.color = isHealing ? '#10b981' : '#ef4444';
      element.textContent = `${isHealing ? '+' : '-'}${damage}`;
    },
    'ease-out',
    () => {
      element.remove();
    }
  );
};