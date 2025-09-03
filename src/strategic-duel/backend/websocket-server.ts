import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

interface ClientConnection {
  id: string;
  playerId?: string;
  wallet?: string;
  websocket: WebSocket;
  lastPing: number;
  matchId?: string;
  authenticated: boolean;
  subscriptions: Set<string>;
}

interface GameMessage {
  type: 'move' | 'bet' | 'fold' | 'ready' | 'chat' | 'heartbeat' | 'authenticate';
  matchId: string;
  playerId: string;
  data: any;
  timestamp: number;
  signature?: string;
}

interface ServerMessage {
  event: string;
  data: any;
  timestamp: number;
  matchId?: string;
}

export class StrategicDuelWebSocketServer extends EventEmitter {
  private server: WebSocketServer;
  private connections: Map<string, ClientConnection> = new Map();
  private playerConnections: Map<string, string> = new Map(); // playerId -> connectionId
  private matchRooms: Map<string, Set<string>> = new Map(); // matchId -> connectionIds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 60000; // 60 seconds

  constructor(port: number = 8080) {
    super();
    this.server = new WebSocketServer({ 
      port,
      perMessageDeflate: {
        // Enable per-message deflate for better compression
        zlibDeflateOptions: {
          level: 3,
          chunkSize: 128,
        },
      }
    });
    
    this.initializeServer();
    this.startHeartbeat();
  }

  private initializeServer(): void {
    this.server.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const connectionId = uuidv4();
      const connection: ClientConnection = {
        id: connectionId,
        websocket: ws,
        lastPing: Date.now(),
        authenticated: false,
        subscriptions: new Set()
      };

      this.connections.set(connectionId, connection);

      // Set up WebSocket event handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(connectionId, data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.handleDisconnection(connectionId, code, reason.toString());
      });

      ws.on('error', (error: Error) => {
        this.handleError(connectionId, error);
      });

      ws.on('pong', () => {
        this.handlePong(connectionId);
      });

      // Send welcome message
      this.sendToConnection(connectionId, {
        event: 'connected',
        data: { connectionId },
        timestamp: Date.now()
      });

      this.emit('clientConnected', { connectionId, ip: req.socket.remoteAddress });
    });
  }

  private handleMessage(connectionId: string, data: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const message = JSON.parse(data.toString()) as GameMessage;
      const now = Date.now();

      // Validate message structure
      if (!this.validateMessage(message)) {
        this.sendError(connectionId, 'Invalid message format');
        return;
      }

      // Check if authentication is required
      if (!connection.authenticated && message.type !== 'authenticate') {
        this.sendError(connectionId, 'Authentication required');
        return;
      }

      // Update connection activity
      connection.lastPing = now;

      switch (message.type) {
        case 'authenticate':
          this.handleAuthentication(connectionId, message);
          break;
        
        case 'move':
          this.handleGameMove(connectionId, message);
          break;
        
        case 'bet':
          this.handleBet(connectionId, message);
          break;
        
        case 'fold':
          this.handleFold(connectionId, message);
          break;
        
        case 'ready':
          this.handleReady(connectionId, message);
          break;
        
        case 'chat':
          this.handleChat(connectionId, message);
          break;
        
        case 'heartbeat':
          this.handleHeartbeat(connectionId, message);
          break;
        
        default:
          this.sendError(connectionId, `Unknown message type: ${message.type}`);
      }

    } catch (error) {
      console.error('Error handling message:', error);
      this.sendError(connectionId, 'Failed to process message');
    }
  }

  private validateMessage(message: any): message is GameMessage {
    return (
      typeof message === 'object' &&
      typeof message.type === 'string' &&
      typeof message.timestamp === 'number' &&
      message.data !== undefined
    );
  }

  private handleAuthentication(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { playerId, wallet, signature } = message.data;

    // TODO: Verify signature against wallet
    // For now, we'll do basic validation
    if (!playerId || !wallet) {
      this.sendError(connectionId, 'Invalid authentication data');
      return;
    }

    // Check if player is already connected
    const existingConnectionId = this.playerConnections.get(playerId);
    if (existingConnectionId && existingConnectionId !== connectionId) {
      // Disconnect the old connection
      const oldConnection = this.connections.get(existingConnectionId);
      if (oldConnection) {
        this.sendToConnection(existingConnectionId, {
          event: 'duplicateLogin',
          data: { reason: 'Another session started' },
          timestamp: Date.now()
        });
        oldConnection.websocket.close(1000, 'Duplicate login');
      }
    }

    // Update connection
    connection.playerId = playerId;
    connection.wallet = wallet;
    connection.authenticated = true;

    // Map player to connection
    this.playerConnections.set(playerId, connectionId);

    this.sendToConnection(connectionId, {
      event: 'authenticated',
      data: { playerId, status: 'success' },
      timestamp: Date.now()
    });

    this.emit('playerAuthenticated', { connectionId, playerId, wallet });
  }

  private handleGameMove(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.playerId) return;

    // Validate move timing (anti-cheat)
    const processingTime = Date.now() - message.timestamp;
    if (processingTime < 10) { // Suspiciously fast
      this.emit('suspiciousActivity', {
        playerId: connection.playerId,
        type: 'fastMove',
        processingTime,
        message
      });
    }

    // Broadcast to match participants
    if (message.matchId) {
      this.broadcastToMatch(message.matchId, {
        event: 'playerMove',
        data: {
          playerId: connection.playerId,
          move: message.data,
          timestamp: message.timestamp
        },
        timestamp: Date.now(),
        matchId: message.matchId
      }, connectionId);
    }

    this.emit('gameMove', {
      playerId: connection.playerId,
      matchId: message.matchId,
      move: message.data,
      timestamp: message.timestamp
    });
  }

  private handleBet(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.playerId) return;

    const { amount, confidence } = message.data;

    // Validate bet amount
    if (typeof amount !== 'number' || amount <= 0) {
      this.sendError(connectionId, 'Invalid bet amount');
      return;
    }

    // Record decision time for psychological profiling
    const decisionTime = Date.now() - message.timestamp;

    this.emit('playerBet', {
      playerId: connection.playerId,
      matchId: message.matchId,
      amount,
      confidence,
      decisionTime,
      timestamp: message.timestamp
    });

    // Broadcast to match
    if (message.matchId) {
      this.broadcastToMatch(message.matchId, {
        event: 'playerBet',
        data: {
          playerId: connection.playerId,
          amount,
          timestamp: message.timestamp
        },
        timestamp: Date.now(),
        matchId: message.matchId
      }, connectionId);
    }
  }

  private handleFold(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.playerId) return;

    const decisionTime = Date.now() - message.timestamp;

    this.emit('playerFold', {
      playerId: connection.playerId,
      matchId: message.matchId,
      decisionTime,
      timestamp: message.timestamp
    });

    if (message.matchId) {
      this.broadcastToMatch(message.matchId, {
        event: 'playerFold',
        data: {
          playerId: connection.playerId,
          timestamp: message.timestamp
        },
        timestamp: Date.now(),
        matchId: message.matchId
      }, connectionId);
    }
  }

  private handleReady(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.playerId) return;

    connection.matchId = message.matchId;

    // Add to match room
    if (message.matchId) {
      if (!this.matchRooms.has(message.matchId)) {
        this.matchRooms.set(message.matchId, new Set());
      }
      this.matchRooms.get(message.matchId)!.add(connectionId);
    }

    this.emit('playerReady', {
      playerId: connection.playerId,
      matchId: message.matchId,
      timestamp: message.timestamp
    });
  }

  private handleChat(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.playerId) return;

    const { text } = message.data;

    // Basic chat moderation
    if (typeof text !== 'string' || text.length > 200) {
      this.sendError(connectionId, 'Invalid chat message');
      return;
    }

    // Broadcast to match
    if (message.matchId) {
      this.broadcastToMatch(message.matchId, {
        event: 'chatMessage',
        data: {
          playerId: connection.playerId,
          text,
          timestamp: message.timestamp
        },
        timestamp: Date.now(),
        matchId: message.matchId
      });
    }
  }

  private handleHeartbeat(connectionId: string, message: GameMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastPing = Date.now();
    
    this.sendToConnection(connectionId, {
      event: 'heartbeat',
      data: { timestamp: Date.now() },
      timestamp: Date.now()
    });
  }

  private handleDisconnection(connectionId: string, code: number, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Remove from match room
    if (connection.matchId) {
      const matchRoom = this.matchRooms.get(connection.matchId);
      if (matchRoom) {
        matchRoom.delete(connectionId);
        if (matchRoom.size === 0) {
          this.matchRooms.delete(connection.matchId);
        } else {
          // Notify remaining players
          this.broadcastToMatch(connection.matchId, {
            event: 'playerDisconnected',
            data: { playerId: connection.playerId },
            timestamp: Date.now(),
            matchId: connection.matchId
          });
        }
      }
    }

    // Remove player mapping
    if (connection.playerId) {
      this.playerConnections.delete(connection.playerId);
    }

    // Remove connection
    this.connections.delete(connectionId);

    this.emit('clientDisconnected', {
      connectionId,
      playerId: connection.playerId,
      code,
      reason
    });
  }

  private handleError(connectionId: string, error: Error): void {
    console.error(`WebSocket error for connection ${connectionId}:`, error);
    this.emit('connectionError', { connectionId, error });
  }

  private handlePong(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastPing = Date.now();
    }
  }

  /**
   * Send message to specific connection
   */
  public sendToConnection(connectionId: string, message: ServerMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.websocket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.websocket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Send message to player by ID
   */
  public sendToPlayer(playerId: string, message: ServerMessage): boolean {
    const connectionId = this.playerConnections.get(playerId);
    return connectionId ? this.sendToConnection(connectionId, message) : false;
  }

  /**
   * Broadcast message to all connections in a match
   */
  public broadcastToMatch(matchId: string, message: ServerMessage, excludeConnectionId?: string): void {
    const matchRoom = this.matchRooms.get(matchId);
    if (!matchRoom) return;

    for (const connectionId of matchRoom) {
      if (connectionId !== excludeConnectionId) {
        this.sendToConnection(connectionId, message);
      }
    }
  }

  /**
   * Broadcast to all connected clients
   */
  public broadcastToAll(message: ServerMessage, excludeConnectionId?: string): void {
    for (const connectionId of this.connections.keys()) {
      if (connectionId !== excludeConnectionId) {
        this.sendToConnection(connectionId, message);
      }
    }
  }

  /**
   * Send error message to connection
   */
  private sendError(connectionId: string, error: string): void {
    this.sendToConnection(connectionId, {
      event: 'error',
      data: { message: error },
      timestamp: Date.now()
    });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleConnections: string[] = [];

      for (const [connectionId, connection] of this.connections) {
        // Check if connection is stale
        if (now - connection.lastPing > this.CONNECTION_TIMEOUT) {
          staleConnections.push(connectionId);
        } else {
          // Send ping
          if (connection.websocket.readyState === WebSocket.OPEN) {
            connection.websocket.ping();
          }
        }
      }

      // Close stale connections
      for (const connectionId of staleConnections) {
        const connection = this.connections.get(connectionId);
        if (connection) {
          connection.websocket.terminate();
          this.handleDisconnection(connectionId, 1001, 'Connection timeout');
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Get server statistics
   */
  public getStats(): any {
    return {
      totalConnections: this.connections.size,
      authenticatedConnections: Array.from(this.connections.values())
        .filter(conn => conn.authenticated).length,
      activeMatches: this.matchRooms.size,
      averageLatency: this.calculateAverageLatency()
    };
  }

  private calculateAverageLatency(): number {
    const now = Date.now();
    const latencies = Array.from(this.connections.values())
      .map(conn => now - conn.lastPing);
    
    return latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0;
  }

  /**
   * Gracefully shutdown server
   */
  public async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(connection => {
      return new Promise<void>((resolve) => {
        if (connection.websocket.readyState === WebSocket.OPEN) {
          connection.websocket.close(1001, 'Server shutdown');
        }
        resolve();
      });
    });

    await Promise.all(closePromises);

    // Close server
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}