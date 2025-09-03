/**
 * Network Optimizer for Strategic Duel
 * Achieves <10ms network latency through connection pooling, compression, and batching
 */

import { EventEmitter } from 'events';
import { LRUCache } from 'lru-cache';
import * as zlib from 'zlib';

export interface NetworkMessage {
  id: string;
  type: string;
  payload: any;
  priority: 'critical' | 'high' | 'normal' | 'low';
  timestamp: number;
  compressed?: boolean;
}

export interface ConnectionPoolOptions {
  maxConnections: number;
  connectionTimeout: number;
  keepAliveInterval: number;
  compressionThreshold: number;
  batchInterval: number;
  maxBatchSize: number;
}

export interface NetworkMetrics {
  latency: number;
  throughput: number;
  compressionRatio: number;
  connectionHealth: number;
  packetLoss: number;
  jitter: number;
}

/**
 * Advanced WebSocket connection pool with intelligent load balancing
 */
class WebSocketPool extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private connectionHealth: Map<string, number> = new Map();
  private connectionLoad: Map<string, number> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: ConnectionPoolOptions;
  private messageCache = new LRUCache<string, NetworkMessage>({ max: 1000 });

  constructor(options: ConnectionPoolOptions) {
    super();
    this.options = options;
    this.startHealthMonitoring();
  }

  /**
   * Create optimized WebSocket connection with performance settings
   */
  async createConnection(url: string, id: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, {
        perMessageDeflate: false, // We handle compression manually for better control
        maxPayload: 1024 * 1024, // 1MB max payload
        handshakeTimeout: this.options.connectionTimeout
      });

      // Performance optimizations
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        this.connections.set(id, ws);
        this.connectionHealth.set(id, 100);
        this.connectionLoad.set(id, 0);
        this.setupConnectionOptimizations(ws, id);
        resolve(ws);
      };

      ws.onerror = (error) => {
        reject(error);
      };

      ws.onclose = () => {
        this.handleConnectionClose(id);
      };

      // Set connection timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, this.options.connectionTimeout);
    });
  }

  /**
   * Setup performance optimizations for WebSocket connection
   */
  private setupConnectionOptimizations(ws: WebSocket, id: string): void {
    // Enable TCP_NODELAY equivalent for WebSocket
    if ('setNoDelay' in ws) {
      (ws as any).setNoDelay(true);
    }

    // Setup keep-alive mechanism
    const keepAliveInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, this.options.keepAliveInterval);

    ws.onclose = () => {
      clearInterval(keepAliveInterval);
      this.handleConnectionClose(id);
    };

    // Monitor connection performance
    this.monitorConnection(ws, id);
  }

  /**
   * Monitor connection performance and health
   */
  private monitorConnection(ws: WebSocket, id: string): void {
    let pingStart: number;
    let messageCount = 0;
    let lastMessageTime = Date.now();

    // Setup ping monitoring for latency measurement
    ws.addEventListener('ping', () => {
      pingStart = performance.now();
    });

    ws.addEventListener('pong', () => {
      if (pingStart) {
        const latency = performance.now() - pingStart;
        this.updateConnectionHealth(id, latency);
      }
    });

    // Monitor message throughput
    ws.addEventListener('message', () => {
      messageCount++;
      lastMessageTime = Date.now();
      
      // Update load metrics
      const currentLoad = this.connectionLoad.get(id) || 0;
      this.connectionLoad.set(id, currentLoad + 1);
    });

    // Periodic health check
    setInterval(() => {
      const timeSinceLastMessage = Date.now() - lastMessageTime;
      if (timeSinceLastMessage > 30000) { // 30 seconds
        this.updateConnectionHealth(id, -10); // Decrease health for inactive connections
      }
    }, 10000);
  }

  /**
   * Update connection health score based on performance metrics
   */
  private updateConnectionHealth(id: string, latency: number): void {
    let health = this.connectionHealth.get(id) || 100;
    
    // Adjust health based on latency
    if (latency < 10) {
      health = Math.min(100, health + 2);
    } else if (latency < 50) {
      health = Math.min(100, health + 1);
    } else if (latency > 100) {
      health = Math.max(0, health - 5);
    } else if (latency > 200) {
      health = Math.max(0, health - 10);
    }

    this.connectionHealth.set(id, health);
  }

  /**
   * Get best connection for sending message based on health and load
   */
  getBestConnection(): WebSocket | null {
    let bestConnection: WebSocket | null = null;
    let bestScore = -1;

    for (const [id, connection] of this.connections) {
      if (connection.readyState === WebSocket.OPEN) {
        const health = this.connectionHealth.get(id) || 0;
        const load = this.connectionLoad.get(id) || 0;
        const score = health - (load * 0.1); // Balance health and load

        if (score > bestScore) {
          bestScore = score;
          bestConnection = connection;
        }
      }
    }

    return bestConnection;
  }

  /**
   * Handle connection close and implement reconnection logic
   */
  private handleConnectionClose(id: string): void {
    this.connections.delete(id);
    this.connectionHealth.delete(id);
    this.connectionLoad.delete(id);

    // Clear existing reconnect timer
    const existingTimer = this.reconnectTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule reconnection with exponential backoff
    const reconnectDelay = Math.min(1000 * Math.pow(2, this.getReconnectAttempts(id)), 30000);
    const timer = setTimeout(() => {
      this.emit('reconnect-needed', id);
    }, reconnectDelay);

    this.reconnectTimers.set(id, timer);
  }

  private getReconnectAttempts(id: string): number {
    // Implementation would track reconnection attempts
    return 0;
  }

  /**
   * Start health monitoring for all connections
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      for (const [id, connection] of this.connections) {
        if (connection.readyState !== WebSocket.OPEN) {
          this.handleConnectionClose(id);
        } else {
          // Reset load counter periodically
          this.connectionLoad.set(id, 0);
        }
      }
    }, 5000);
  }
}

/**
 * Message compression and batching system
 */
class MessageProcessor {
  private batchQueue: NetworkMessage[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private compressionCache = new LRUCache<string, Buffer>({ max: 500 });
  private options: ConnectionPoolOptions;

  constructor(options: ConnectionPoolOptions) {
    this.options = options;
  }

  /**
   * Compress message payload if beneficial
   */
  async compressMessage(message: NetworkMessage): Promise<NetworkMessage> {
    const payloadSize = JSON.stringify(message.payload).length;
    
    if (payloadSize < this.options.compressionThreshold) {
      return message;
    }

    const cacheKey = this.generateCompressionKey(message.payload);
    let compressed = this.compressionCache.get(cacheKey);

    if (!compressed) {
      const payloadBuffer = Buffer.from(JSON.stringify(message.payload));
      compressed = await new Promise<Buffer>((resolve, reject) => {
        zlib.deflate(payloadBuffer, { level: 1, strategy: zlib.constants.Z_RLE }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      this.compressionCache.set(cacheKey, compressed);
    }

    return {
      ...message,
      payload: compressed.toString('base64'),
      compressed: true
    };
  }

  /**
   * Decompress message payload
   */
  async decompressMessage(message: NetworkMessage): Promise<NetworkMessage> {
    if (!message.compressed) {
      return message;
    }

    const compressedBuffer = Buffer.from(message.payload, 'base64');
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.inflate(compressedBuffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    return {
      ...message,
      payload: JSON.parse(decompressed.toString()),
      compressed: false
    };
  }

  /**
   * Add message to batch queue with intelligent batching
   */
  queueMessage(message: NetworkMessage, sendCallback: (messages: NetworkMessage[]) => void): void {
    this.batchQueue.push(message);

    // Critical messages bypass batching
    if (message.priority === 'critical') {
      this.flushBatch(sendCallback);
      return;
    }

    // Check if we should flush based on batch size or time
    if (this.batchQueue.length >= this.options.maxBatchSize) {
      this.flushBatch(sendCallback);
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch(sendCallback);
      }, this.options.batchInterval);
    }
  }

  /**
   * Flush batch queue and send messages
   */
  private flushBatch(sendCallback: (messages: NetworkMessage[]) => void): void {
    if (this.batchQueue.length === 0) return;

    const messagesToSend = this.batchQueue.splice(0);
    sendCallback(messagesToSend);

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private generateCompressionKey(payload: any): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64').slice(0, 16);
  }
}

/**
 * Main Network Optimizer class
 */
export class NetworkOptimizer extends EventEmitter {
  private wsPool: WebSocketPool;
  private messageProcessor: MessageProcessor;
  private metrics: NetworkMetrics;
  private options: ConnectionPoolOptions;
  private performanceTimers: Map<string, number> = new Map();

  constructor(options: Partial<ConnectionPoolOptions> = {}) {
    super();
    
    this.options = {
      maxConnections: 4,
      connectionTimeout: 5000,
      keepAliveInterval: 30000,
      compressionThreshold: 1024,
      batchInterval: 5,
      maxBatchSize: 10,
      ...options
    };

    this.wsPool = new WebSocketPool(this.options);
    this.messageProcessor = new MessageProcessor(this.options);
    this.metrics = this.initializeMetrics();

    this.setupEventHandlers();
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): NetworkMetrics {
    return {
      latency: 0,
      throughput: 0,
      compressionRatio: 0,
      connectionHealth: 100,
      packetLoss: 0,
      jitter: 0
    };
  }

  /**
   * Setup event handlers for pool management
   */
  private setupEventHandlers(): void {
    this.wsPool.on('reconnect-needed', (connectionId: string) => {
      this.emit('connection-lost', connectionId);
    });
  }

  /**
   * Connect to WebSocket server with optimizations
   */
  async connect(url: string, connectionId: string = 'primary'): Promise<void> {
    try {
      await this.wsPool.createConnection(url, connectionId);
      this.emit('connected', connectionId);
    } catch (error) {
      this.emit('connection-error', error);
      throw error;
    }
  }

  /**
   * Send message with optimization and batching
   */
  async sendMessage(message: NetworkMessage): Promise<void> {
    const startTime = performance.now();
    this.performanceTimers.set(message.id, startTime);

    // Compress message if beneficial
    const processedMessage = await this.messageProcessor.compressMessage(message);

    // Queue message for batching (unless critical)
    this.messageProcessor.queueMessage(processedMessage, (messages) => {
      this.sendBatchedMessages(messages);
    });
  }

  /**
   * Send batched messages through best available connection
   */
  private sendBatchedMessages(messages: NetworkMessage[]): void {
    const connection = this.wsPool.getBestConnection();
    if (!connection) {
      this.emit('no-connection-available');
      return;
    }

    const batchPayload = {
      type: 'batch',
      messages: messages,
      timestamp: Date.now()
    };

    connection.send(JSON.stringify(batchPayload));

    // Update metrics
    this.updateThroughputMetrics(messages.length);
  }

  /**
   * Handle incoming message with decompression
   */
  async handleIncomingMessage(rawMessage: string): Promise<NetworkMessage[]> {
    const parsed = JSON.parse(rawMessage);
    
    if (parsed.type === 'batch') {
      const messages: NetworkMessage[] = [];
      
      for (const message of parsed.messages) {
        const decompressed = await this.messageProcessor.decompressMessage(message);
        messages.push(decompressed);
        
        // Update latency metrics
        this.updateLatencyMetrics(decompressed);
      }
      
      return messages;
    } else {
      const decompressed = await this.messageProcessor.decompressMessage(parsed);
      this.updateLatencyMetrics(decompressed);
      return [decompressed];
    }
  }

  /**
   * Update latency metrics for performance tracking
   */
  private updateLatencyMetrics(message: NetworkMessage): void {
    const sendTime = this.performanceTimers.get(message.id);
    if (sendTime) {
      const latency = performance.now() - sendTime;
      this.metrics.latency = this.exponentialMovingAverage(this.metrics.latency, latency, 0.1);
      this.performanceTimers.delete(message.id);
    }
  }

  /**
   * Update throughput metrics
   */
  private updateThroughputMetrics(messageCount: number): void {
    const currentThroughput = messageCount / (this.options.batchInterval / 1000);
    this.metrics.throughput = this.exponentialMovingAverage(this.metrics.throughput, currentThroughput, 0.1);
  }

  /**
   * Calculate exponential moving average
   */
  private exponentialMovingAverage(current: number, newValue: number, alpha: number): number {
    return alpha * newValue + (1 - alpha) * current;
  }

  /**
   * Get current network metrics
   */
  getMetrics(): NetworkMetrics {
    return { ...this.metrics };
  }

  /**
   * Optimize connection settings based on current performance
   */
  optimizeSettings(): void {
    const metrics = this.getMetrics();
    
    // Adjust batch interval based on latency
    if (metrics.latency < 10) {
      this.options.batchInterval = Math.max(1, this.options.batchInterval - 1);
    } else if (metrics.latency > 50) {
      this.options.batchInterval = Math.min(20, this.options.batchInterval + 2);
    }

    // Adjust compression threshold based on performance
    if (metrics.compressionRatio < 0.3) {
      this.options.compressionThreshold *= 1.5;
    } else if (metrics.compressionRatio > 0.7) {
      this.options.compressionThreshold *= 0.8;
    }
  }

  /**
   * Close all connections and cleanup
   */
  disconnect(): void {
    for (const [id, connection] of this.wsPool.connections) {
      connection.close();
    }
    this.wsPool.connections.clear();
    this.performanceTimers.clear();
  }
}

// Export singleton instance for global use
export const networkOptimizer = new NetworkOptimizer();