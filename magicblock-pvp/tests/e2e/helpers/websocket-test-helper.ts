import WebSocket from 'ws';

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: number;
}

export interface ConnectionOptions {
  timeout?: number;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class WebSocketTestHelper {
  private connections = new Map<string, WebSocket>();
  private eventListeners = new Map<string, ((event: WebSocketEvent) => void)[]>();
  private eventBuffers = new Map<string, WebSocketEvent[]>();

  /**
   * Connect to WebSocket for a specific game
   */
  async connectToGame(
    gameId: string, 
    token: string, 
    options: ConnectionOptions = {}
  ): Promise<WebSocket> {
    const wsUrl = `ws://localhost:3000/ws/games/${gameId}?token=${token}`;
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = options.timeout || 5000;
      
      const timeoutId = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, timeout);
      
      ws.on('open', () => {
        clearTimeout(timeoutId);
        this.connections.set(gameId, ws);
        this.eventBuffers.set(gameId, []);
        
        // Setup event listening
        ws.on('message', (data) => {
          this.handleMessage(gameId, data.toString());
        });
        
        ws.on('error', (error) => {
          console.error(`WebSocket error for game ${gameId}:`, error);
        });
        
        ws.on('close', () => {
          this.connections.delete(gameId);
          this.eventBuffers.delete(gameId);
          this.eventListeners.delete(gameId);
        });
        
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Connect as spectator to a game
   */
  async connectAsSpectator(
    gameId: string, 
    token: string
  ): Promise<WebSocket> {
    const wsUrl = `ws://localhost:3000/ws/games/${gameId}/spectate?token=${token}`;
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        const spectatorKey = `${gameId}_spectator`;
        this.connections.set(spectatorKey, ws);
        this.eventBuffers.set(spectatorKey, []);
        
        ws.on('message', (data) => {
          this.handleMessage(spectatorKey, data.toString());
        });
        
        resolve(ws);
      });
      
      ws.on('error', reject);
    });
  }

  /**
   * Send message through WebSocket
   */
  async sendMessage(gameId: string, message: any): Promise<void> {
    const ws = this.connections.get(gameId);
    if (!ws) {
      throw new Error(`No WebSocket connection found for game ${gameId}`);
    }
    
    return new Promise((resolve, reject) => {
      ws.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Wait for specific event type
   */
  async waitForEvent(
    connection: WebSocket | string, 
    eventType: string, 
    timeoutMs: number = 10000
  ): Promise<WebSocketEvent> {
    const gameId = typeof connection === 'string' 
      ? connection 
      : this.getGameIdForConnection(connection);
    
    if (!gameId) {
      throw new Error('Could not identify game ID for connection');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event type: ${eventType}`));
      }, timeoutMs);
      
      // Check if event is already in buffer
      const buffer = this.eventBuffers.get(gameId) || [];
      const existingEvent = buffer.find(event => event.type === eventType);
      
      if (existingEvent) {
        clearTimeout(timeout);
        resolve(existingEvent);
        return;
      }
      
      // Add listener for future events
      const listener = (event: WebSocketEvent) => {
        if (event.type === eventType) {
          clearTimeout(timeout);
          this.removeEventListener(gameId, listener);
          resolve(event);
        }
      };
      
      this.addEventListener(gameId, listener);
    });
  }

  /**
   * Wait for multiple events
   */
  async waitForEvents(
    gameId: string,
    eventTypes: string[],
    timeoutMs: number = 10000
  ): Promise<WebSocketEvent[]> {
    const promises = eventTypes.map(type => 
      this.waitForEvent(gameId, type, timeoutMs)
    );
    
    return Promise.all(promises);
  }

  /**
   * Get all events of specific type
   */
  getEventsOfType(gameId: string, eventType: string): WebSocketEvent[] {
    const buffer = this.eventBuffers.get(gameId) || [];
    return buffer.filter(event => event.type === eventType);
  }

  /**
   * Get all events for a game
   */
  getAllEvents(gameId: string): WebSocketEvent[] {
    return this.eventBuffers.get(gameId) || [];
  }

  /**
   * Clear event buffer for a game
   */
  clearEvents(gameId: string): void {
    this.eventBuffers.set(gameId, []);
  }

  /**
   * Disconnect from specific game
   */
  async disconnect(connection: WebSocket | string): Promise<void> {
    if (typeof connection === 'string') {
      const ws = this.connections.get(connection);
      if (ws) {
        ws.close();
      }
    } else {
      connection.close();
    }
  }

  /**
   * Disconnect from all games
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(ws => {
      return new Promise<void>((resolve) => {
        ws.close();
        ws.on('close', () => resolve());
      });
    });
    
    await Promise.all(promises);
    
    this.connections.clear();
    this.eventBuffers.clear();
    this.eventListeners.clear();
  }

  /**
   * Test connection stability
   */
  async testConnectionStability(
    gameId: string,
    durationMs: number = 30000
  ): Promise<{
    totalMessages: number;
    errors: number;
    reconnections: number;
    avgLatency: number;
  }> {
    const ws = this.connections.get(gameId);
    if (!ws) {
      throw new Error(`No connection found for game ${gameId}`);
    }
    
    const stats = {
      totalMessages: 0,
      errors: 0,
      reconnections: 0,
      latencies: [] as number[]
    };
    
    const startTime = Date.now();
    const interval = setInterval(() => {
      const pingTime = Date.now();
      
      ws.send(JSON.stringify({
        type: 'ping',
        timestamp: pingTime
      }));
    }, 1000);
    
    // Listen for pong responses
    const listener = (event: WebSocketEvent) => {
      if (event.type === 'pong' && event.data.timestamp) {
        const latency = Date.now() - event.data.timestamp;
        stats.latencies.push(latency);
      }
      stats.totalMessages++;
    };
    
    this.addEventListener(gameId, listener);
    
    // Monitor errors
    ws.on('error', () => stats.errors++);
    
    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, durationMs));
    
    clearInterval(interval);
    this.removeEventListener(gameId, listener);
    
    const avgLatency = stats.latencies.length > 0
      ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
      : 0;
    
    return {
      totalMessages: stats.totalMessages,
      errors: stats.errors,
      reconnections: stats.reconnections,
      avgLatency: Math.round(avgLatency)
    };
  }

  /**
   * Simulate network interruption
   */
  async simulateNetworkInterruption(
    gameId: string,
    durationMs: number = 5000
  ): Promise<void> {
    const ws = this.connections.get(gameId);
    if (!ws) {
      throw new Error(`No connection found for game ${gameId}`);
    }
    
    // Force close connection
    ws.terminate();
    
    // Wait for interruption duration
    await new Promise(resolve => setTimeout(resolve, durationMs));
    
    // Attempt to reconnect (this would need to be implemented based on your reconnection logic)
    console.log(`Simulated network interruption for ${durationMs}ms`);
  }

  /**
   * Test concurrent connections
   */
  async testConcurrentConnections(
    gameIds: string[],
    token: string,
    messagesPerSecond: number = 10
  ): Promise<{
    connectionsEstablished: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
    errors: number;
  }> {
    const results = {
      connectionsEstablished: 0,
      totalMessagesSent: 0,
      totalMessagesReceived: 0,
      errors: 0
    };
    
    // Connect to all games
    const connections = await Promise.allSettled(
      gameIds.map(gameId => this.connectToGame(gameId, token))
    );
    
    results.connectionsEstablished = connections
      .filter(result => result.status === 'fulfilled').length;
    
    // Send messages concurrently
    const messageInterval = 1000 / messagesPerSecond;
    const sendPromises: Promise<void>[] = [];
    
    gameIds.forEach(gameId => {
      if (this.connections.has(gameId)) {
        for (let i = 0; i < messagesPerSecond * 10; i++) { // 10 seconds worth
          sendPromises.push(
            new Promise(resolve => {
              setTimeout(async () => {
                try {
                  await this.sendMessage(gameId, {
                    type: 'test_message',
                    index: i,
                    timestamp: Date.now()
                  });
                  results.totalMessagesSent++;
                } catch (error) {
                  results.errors++;
                }
                resolve();
              }, i * messageInterval);
            })
          );
        }
      }
    });
    
    await Promise.all(sendPromises);
    
    // Count received messages
    gameIds.forEach(gameId => {
      const events = this.getAllEvents(gameId);
      results.totalMessagesReceived += events.length;
    });
    
    return results;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(gameId: string, rawData: string): void {
    try {
      const data = JSON.parse(rawData);
      const event: WebSocketEvent = {
        type: data.type || 'unknown',
        data: data,
        timestamp: Date.now()
      };
      
      // Add to buffer
      const buffer = this.eventBuffers.get(gameId) || [];
      buffer.push(event);
      this.eventBuffers.set(gameId, buffer);
      
      // Notify listeners
      const listeners = this.eventListeners.get(gameId) || [];
      listeners.forEach(listener => listener(event));
      
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Add event listener
   */
  private addEventListener(
    gameId: string, 
    listener: (event: WebSocketEvent) => void
  ): void {
    const listeners = this.eventListeners.get(gameId) || [];
    listeners.push(listener);
    this.eventListeners.set(gameId, listeners);
  }

  /**
   * Remove event listener
   */
  private removeEventListener(
    gameId: string, 
    listener: (event: WebSocketEvent) => void
  ): void {
    const listeners = this.eventListeners.get(gameId) || [];
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(gameId, listeners);
    }
  }

  /**
   * Get game ID for WebSocket connection
   */
  private getGameIdForConnection(ws: WebSocket): string | null {
    for (const [gameId, connection] of this.connections) {
      if (connection === ws) {
        return gameId;
      }
    }
    return null;
  }

  /**
   * Test WebSocket message ordering
   */
  async testMessageOrdering(
    gameId: string,
    messageCount: number = 100
  ): Promise<{
    ordered: boolean;
    outOfOrderCount: number;
    duplicateCount: number;
  }> {
    const ws = this.connections.get(gameId);
    if (!ws) {
      throw new Error(`No connection found for game ${gameId}`);
    }
    
    // Send numbered messages
    for (let i = 0; i < messageCount; i++) {
      await this.sendMessage(gameId, {
        type: 'test_sequence',
        sequence: i,
        timestamp: Date.now()
      });
    }
    
    // Wait for all messages to be received
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check ordering
    const sequenceEvents = this.getEventsOfType(gameId, 'test_sequence_ack');
    const sequences = sequenceEvents.map(event => event.data.sequence).sort((a, b) => a - b);
    
    let outOfOrderCount = 0;
    let duplicateCount = 0;
    const seen = new Set();
    
    for (let i = 0; i < sequences.length; i++) {
      if (seen.has(sequences[i])) {
        duplicateCount++;
      }
      seen.add(sequences[i]);
      
      if (i > 0 && sequences[i] < sequences[i - 1]) {
        outOfOrderCount++;
      }
    }
    
    return {
      ordered: outOfOrderCount === 0,
      outOfOrderCount,
      duplicateCount
    };
  }
}