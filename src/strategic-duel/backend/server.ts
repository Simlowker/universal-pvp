import { StrategicDuelWebSocketServer } from './websocket-server';

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;

console.log(`Starting Strategic Duel WebSocket Server on port ${PORT}...`);

const server = new StrategicDuelWebSocketServer(PORT);

server.on('clientConnected', ({ connectionId, ip }) => {
  console.log(`Client connected: ${connectionId} from ${ip}`);
});

server.on('clientDisconnected', ({ connectionId, reason }) => {
  console.log(`Client disconnected: ${connectionId} - ${reason}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

console.log(`WebSocket Server is running on ws://localhost:${PORT}`);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  try {
    await server.close();
    console.log('Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error closing server:', error);
    process.exit(1);
  }
});