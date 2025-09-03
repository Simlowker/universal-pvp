'use client';

import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { LiveEvent } from '../components/game/LiveFeed';

interface GameEvent {
  type: 'player_joined' | 'player_left' | 'game_started' | 'game_ended' | 'action_taken';
  data: any;
  timestamp: Date;
}

export function useRealTimeUpdates() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [connectionLatency, setConnectionLatency] = useState(0);

  // Initialize socket connection
  useEffect(() => {
    const socketUrl = process.env.NODE_ENV === 'production' 
      ? 'wss://api.solduel.com' 
      : 'ws://localhost:3001';

    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      upgrade: false,
      timeout: 5000,
      autoConnect: true
    });

    setSocket(newSocket);

    // Connection event handlers
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Connected to real-time server');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('❌ Disconnected from real-time server');
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔥 Connection error:', error);
      setIsConnected(false);
    });

    // Latency measurement
    const measureLatency = () => {
      const start = Date.now();
      newSocket.emit('ping', start, (timestamp: number) => {
        const latency = Date.now() - timestamp;
        setConnectionLatency(latency);
      });
    };

    // Measure latency every 30 seconds
    const latencyInterval = setInterval(measureLatency, 30000);
    measureLatency(); // Initial measurement

    return () => {
      clearInterval(latencyInterval);
      newSocket.disconnect();
    };
  }, []);

  // Live feed events
  useEffect(() => {
    if (!socket) return;

    const handleLiveEvent = (event: any) => {
      const newEvent: LiveEvent = {
        id: `${Date.now()}-${Math.random()}`,
        type: event.type,
        player: event.player,
        amount: event.amount,
        streak: event.streak,
        rank: event.rank,
        timestamp: new Date(event.timestamp || Date.now())
      };

      setLiveEvents(prev => [newEvent, ...prev].slice(0, 50)); // Keep last 50 events
    };

    socket.on('live_event', handleLiveEvent);
    return () => socket.off('live_event', handleLiveEvent);
  }, [socket]);

  // Game events
  useEffect(() => {
    if (!socket) return;

    const handleGameEvent = (event: any) => {
      const gameEvent: GameEvent = {
        type: event.type,
        data: event.data,
        timestamp: new Date(event.timestamp || Date.now())
      };

      setGameEvents(prev => [gameEvent, ...prev].slice(0, 100));
    };

    socket.on('game_event', handleGameEvent);
    return () => socket.off('game_event', handleGameEvent);
  }, [socket]);

  // Online count updates
  useEffect(() => {
    if (!socket) return;

    socket.on('online_count', (count: number) => {
      setOnlineCount(count);
    });

    return () => socket.off('online_count');
  }, [socket]);

  // Subscribe to specific game room
  const subscribeToGame = useCallback((gameId: string) => {
    if (!socket || !isConnected) return;

    socket.emit('join_game', gameId);
    
    return () => {
      socket.emit('leave_game', gameId);
    };
  }, [socket, isConnected]);

  // Subscribe to lobby updates
  const subscribeToLobby = useCallback(() => {
    if (!socket || !isConnected) return;

    socket.emit('join_lobby');
    
    return () => {
      socket.emit('leave_lobby');
    };
  }, [socket, isConnected]);

  // Send game action with optimistic updates
  const sendGameAction = useCallback(async (gameId: string, action: any) => {
    if (!socket || !isConnected) {
      throw new Error('Not connected to real-time server');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Action timeout'));
      }, 5000);

      socket.emit('game_action', { gameId, action }, (response: any) => {
        clearTimeout(timeout);
        
        if (response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || 'Action failed'));
        }
      });
    });
  }, [socket, isConnected]);

  // Generate mock live events for development
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const mockEvents = [
      { type: 'big_win', player: 'Player123', amount: 2.5 },
      { type: 'streak', player: 'GamerXYZ', streak: 7 },
      { type: 'rank_up', player: 'ProGamer', rank: 15 },
      { type: 'game_start', player: 'NewPlayer' },
      { type: 'game_end', player: 'VetPlayer' }
    ];

    const interval = setInterval(() => {
      const event = mockEvents[Math.floor(Math.random() * mockEvents.length)];
      const newEvent: LiveEvent = {
        id: `mock-${Date.now()}-${Math.random()}`,
        type: event.type as LiveEvent['type'],
        player: `${event.player}${Math.floor(Math.random() * 1000)}`,
        amount: event.amount,
        streak: event.streak,
        rank: event.rank,
        timestamp: new Date()
      };

      setLiveEvents(prev => [newEvent, ...prev].slice(0, 50));
    }, 5000 + Math.random() * 10000); // Random interval between 5-15 seconds

    return () => clearInterval(interval);
  }, []);

  // Mock online count for development
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const interval = setInterval(() => {
      setOnlineCount(Math.floor(Math.random() * 500) + 100); // 100-600 online
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return {
    socket,
    isConnected,
    liveEvents,
    gameEvents,
    onlineCount,
    connectionLatency,
    subscribeToGame,
    subscribeToLobby,
    sendGameAction
  };
}