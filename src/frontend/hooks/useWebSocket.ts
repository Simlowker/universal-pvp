'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMagicBlock } from '../contexts/MagicBlockContext';

export interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp?: number;
  signature?: string;
}

export interface WebSocketHookOptions {
  url?: string;
  protocols?: string | string[];
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export const useWebSocket = (options: WebSocketHookOptions = {}) => {
  const {
    url = process.env.NEXT_PUBLIC_WS_GAME_URL || 'ws://localhost:8080/game',
    protocols,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    heartbeatInterval = 30000,
    onMessage,
    onOpen,
    onClose,
    onError
  } = options;

  const { sessionKey, gameState } = useMagicBlock();
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const messageQueueRef = useRef<WebSocketMessage[]>([]);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [latency, setLatency] = useState(0);
  const [lastPongTime, setLastPongTime] = useState(0);

  // Send message with queue support
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const messageWithTimestamp = {
        ...message,
        timestamp: Date.now(),
      };
      
      wsRef.current.send(JSON.stringify(messageWithTimestamp));
      return true;
    } else {
      // Queue message for later if not connected
      messageQueueRef.current.push(message);
      return false;
    }
  }, []);

  // Send queued messages when connection is established
  const flushMessageQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message) {
        sendMessage(message);
      }
    }
  }, [sendMessage]);

  // Heartbeat mechanism
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const pingTime = Date.now();
        sendMessage({
          type: 'ping',
          timestamp: pingTime,
        });
      }
    }, heartbeatInterval);
  }, [heartbeatInterval, sendMessage]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = undefined;
    }
  }, []);

  // Connection establishment
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setIsReconnecting(true);
      wsRef.current = new WebSocket(url, protocols);

      wsRef.current.onopen = () => {
        console.log('🔗 WebSocket connected to game server');
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectAttemptsRef.current = 0;
        
        // Send authentication if session key exists
        if (sessionKey) {
          sendMessage({
            type: 'authenticate',
            data: {
              sessionKey: sessionKey.publicKey.toString(),
              gameState: gameState?.gameId,
            },
          });
        }
        
        flushMessageQueue();
        startHeartbeat();
        onOpen?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Handle internal message types
          switch (message.type) {
            case 'pong':
              const pongLatency = Date.now() - (message.timestamp || 0);
              setLatency(pongLatency);
              setLastPongTime(Date.now());
              break;
              
            case 'ping':
              // Respond to server ping
              sendMessage({
                type: 'pong',
                timestamp: message.timestamp,
              });
              break;
              
            case 'error':
              console.error('Server error:', message.data);
              break;
              
            case 'authenticated':
              console.log('✅ WebSocket authenticated successfully');
              break;
              
            default:
              // Pass other messages to callback
              onMessage?.(message);
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket connection closed:', event.code, event.reason);
        setIsConnected(false);
        stopHeartbeat();
        
        onClose?.();
        
        // Attempt to reconnect if not manually closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          console.log(`🔄 Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          setIsReconnecting(false);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('🚨 WebSocket error:', error);
        onError?.(error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setIsReconnecting(false);
    }
  }, [url, protocols, sessionKey, gameState, onOpen, onClose, onError, onMessage, sendMessage, flushMessageQueue, startHeartbeat, stopHeartbeat, maxReconnectAttempts, reconnectInterval]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    stopHeartbeat();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsReconnecting(false);
  }, [stopHeartbeat]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when session key changes
  useEffect(() => {
    if (sessionKey && isConnected) {
      sendMessage({
        type: 'authenticate',
        data: {
          sessionKey: sessionKey.publicKey.toString(),
          gameState: gameState?.gameId,
        },
      });
    }
  }, [sessionKey, isConnected, gameState, sendMessage]);

  // Game-specific message handlers
  const sendGameAction = useCallback((action: string, params: any) => {
    return sendMessage({
      type: 'gameAction',
      data: {
        action,
        params,
        gameId: gameState?.gameId,
      },
    });
  }, [sendMessage, gameState]);

  const sendOptimisticUpdate = useCallback((action: string, result: any) => {
    return sendMessage({
      type: 'optimisticUpdate',
      data: {
        action,
        result,
        gameId: gameState?.gameId,
      },
    });
  }, [sendMessage, gameState]);

  const requestGameSync = useCallback(() => {
    return sendMessage({
      type: 'syncRequest',
      data: {
        gameId: gameState?.gameId,
      },
    });
  }, [sendMessage, gameState]);

  return {
    isConnected,
    isReconnecting,
    latency,
    lastPongTime,
    sendMessage,
    sendGameAction,
    sendOptimisticUpdate,
    requestGameSync,
    connect,
    disconnect,
    messageQueue: messageQueueRef.current,
  };
};