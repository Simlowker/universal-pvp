import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const gameCreationRate = new Rate('game_creation_success');
const gameJoinRate = new Rate('game_join_success');
const moveSubmissionRate = new Rate('move_submission_success');
const websocketConnectionRate = new Rate('websocket_connection_success');

const gameCreationLatency = new Trend('game_creation_latency');
const gameJoinLatency = new Trend('game_join_latency');
const moveSubmissionLatency = new Trend('move_submission_latency');
const websocketLatency = new Trend('websocket_latency');

const totalGamesCreated = new Counter('total_games_created');
const totalGamesJoined = new Counter('total_games_joined');
const totalMovesSubmitted = new Counter('total_moves_submitted');
const totalWebsocketConnections = new Counter('total_websocket_connections');

// Test configuration
export const options = {
  stages: [
    // Ramp up
    { duration: '30s', target: 10 },   // Ramp up to 10 VUs over 30s
    { duration: '1m', target: 20 },    // Ramp up to 20 VUs over 1m
    { duration: '2m', target: 50 },    // Ramp up to 50 VUs over 2m
    
    // Sustained load
    { duration: '5m', target: 50 },    // Hold 50 VUs for 5m
    { duration: '3m', target: 100 },   // Peak load of 100 VUs for 3m
    
    // Ramp down
    { duration: '2m', target: 20 },    // Ramp down to 20 VUs
    { duration: '1m', target: 0 },     // Ramp down to 0 VUs
  ],
  thresholds: {
    // Response time thresholds
    'http_req_duration': ['p(95)<100'], // 95% of requests under 100ms
    'http_req_duration{name:game_creation}': ['p(95)<200'], // Game creation under 200ms
    'http_req_duration{name:game_join}': ['p(95)<150'], // Game join under 150ms
    'http_req_duration{name:move_submission}': ['p(95)<100'], // Move submission under 100ms
    
    // Success rate thresholds
    'game_creation_success': ['rate>0.999'], // >99.9% success rate
    'game_join_success': ['rate>0.999'],
    'move_submission_success': ['rate>0.999'],
    'websocket_connection_success': ['rate>0.99'], // WebSockets can be less reliable
    
    // Error rate thresholds
    'http_req_failed': ['rate<0.001'], // <0.1% error rate
    
    // Latency thresholds
    'game_creation_latency': ['p(95)<200'],
    'game_join_latency': ['p(95)<150'], 
    'move_submission_latency': ['p(95)<100'],
    'websocket_latency': ['p(95)<50'],
  },
};

// Environment configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Test data
const gameTypes = ['PVP'];
const betAmounts = [100000, 500000, 1000000, 5000000]; // Various bet amounts in lamports
const moveTypes = ['attack', 'defend', 'special'];

// Helper function to generate test user
function createTestUser() {
  const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
  const email = `${userId}@loadtest.com`;
  
  return {
    id: userId,
    email: email,
    username: userId,
    token: `jwt_token_${userId}` // Mock JWT token
  };
}

// Helper function to create authentication headers
function getAuthHeaders(user) {
  return {
    'Authorization': `Bearer ${user.token}`,
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  };
}

// Main test function
export default function () {
  const user = createTestUser();
  const scenario = Math.random();
  
  if (scenario < 0.4) {
    // 40% - Game creation and joining flow
    gameCreationAndJoinFlow(user);
  } else if (scenario < 0.7) {
    // 30% - Join existing games and play
    joinExistingGameFlow(user);
  } else if (scenario < 0.9) {
    // 20% - WebSocket real-time interactions
    websocketInteractionFlow(user);
  } else {
    // 10% - Spectator flow
    spectatorFlow(user);
  }

  sleep(1);
}

function gameCreationAndJoinFlow(user) {
  // Step 1: Create a game
  const gameData = {
    gameType: gameTypes[Math.floor(Math.random() * gameTypes.length)],
    betAmount: betAmounts[Math.floor(Math.random() * betAmounts.length)],
    maxPlayers: 2,
    timeLimit: 30000,
    isPrivate: Math.random() < 0.2 // 20% private games
  };

  const createStart = Date.now();
  const createResponse = http.post(
    `${BASE_URL}/api/games`,
    JSON.stringify(gameData),
    {
      headers: getAuthHeaders(user),
      tags: { name: 'game_creation' }
    }
  );

  const createLatency = Date.now() - createStart;
  gameCreationLatency.add(createLatency);
  totalGamesCreated.add(1);

  const createSuccess = check(createResponse, {
    'game creation status is 201': (r) => r.status === 201,
    'game creation response has id': (r) => {
      try {
        return JSON.parse(r.body).id !== undefined;
      } catch {
        return false;
      }
    },
    'game creation latency under 200ms': () => createLatency < 200
  });

  gameCreationRate.add(createSuccess);

  if (!createSuccess) {
    console.error(`Game creation failed: ${createResponse.status} - ${createResponse.body}`);
    return;
  }

  const game = JSON.parse(createResponse.body);

  // Step 2: Simulate another user joining the game
  const joiner = createTestUser();
  
  const joinStart = Date.now();
  const joinResponse = http.post(
    `${BASE_URL}/api/games/${game.id}/join`,
    JSON.stringify({ betAmount: game.betAmount }),
    {
      headers: getAuthHeaders(joiner),
      tags: { name: 'game_join' }
    }
  );

  const joinLatency = Date.now() - joinStart;
  gameJoinLatency.add(joinLatency);
  totalGamesJoined.add(1);

  const joinSuccess = check(joinResponse, {
    'game join status is 200': (r) => r.status === 200,
    'game join response shows active': (r) => {
      try {
        return JSON.parse(r.body).status === 'active';
      } catch {
        return false;
      }
    },
    'game join latency under 150ms': () => joinLatency < 150
  });

  gameJoinRate.add(joinSuccess);

  if (joinSuccess) {
    // Step 3: Make some moves
    const numMoves = Math.floor(Math.random() * 5) + 1; // 1-5 moves
    
    for (let i = 0; i < numMoves; i++) {
      const currentPlayer = i % 2 === 0 ? user : joiner;
      const targetPlayer = i % 2 === 0 ? joiner.id : user.id;
      
      makeMove(game.id, currentPlayer, targetPlayer);
      sleep(0.5); // Brief pause between moves
    }
  }
}

function joinExistingGameFlow(user) {
  // Step 1: Get list of available games
  const gamesResponse = http.get(
    `${BASE_URL}/api/games?status=waiting&limit=10`,
    { headers: getAuthHeaders(user) }
  );

  if (gamesResponse.status !== 200) return;

  const games = JSON.parse(gamesResponse.body);
  if (!games || games.length === 0) return;

  // Step 2: Join a random available game
  const game = games[Math.floor(Math.random() * games.length)];
  
  const joinStart = Date.now();
  const joinResponse = http.post(
    `${BASE_URL}/api/games/${game.id}/join`,
    JSON.stringify({ betAmount: game.betAmount }),
    {
      headers: getAuthHeaders(user),
      tags: { name: 'game_join' }
    }
  );

  const joinLatency = Date.now() - joinStart;
  gameJoinLatency.add(joinLatency);
  totalGamesJoined.add(1);

  const joinSuccess = check(joinResponse, {
    'existing game join status is 200': (r) => r.status === 200,
    'existing game join latency under 150ms': () => joinLatency < 150
  });

  gameJoinRate.add(joinSuccess);

  if (joinSuccess) {
    // Make moves in the joined game
    const numMoves = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < numMoves; i++) {
      // Simulate random opponent
      const opponentId = `opponent_${Math.random().toString(36).substr(2, 9)}`;
      makeMove(game.id, user, opponentId);
      sleep(1);
    }
  }
}

function makeMove(gameId, player, targetPlayerId) {
  const move = {
    type: moveTypes[Math.floor(Math.random() * moveTypes.length)],
    target: targetPlayerId,
    damage: Math.floor(Math.random() * 50) + 10 // 10-60 damage
  };

  const moveStart = Date.now();
  const moveResponse = http.post(
    `${BASE_URL}/api/games/${gameId}/moves`,
    JSON.stringify(move),
    {
      headers: getAuthHeaders(player),
      tags: { name: 'move_submission' }
    }
  );

  const moveLatency = Date.now() - moveStart;
  moveSubmissionLatency.add(moveLatency);
  totalMovesSubmitted.add(1);

  const moveSuccess = check(moveResponse, {
    'move submission status is 200': (r) => r.status === 200,
    'move submission response has moveId': (r) => {
      try {
        return JSON.parse(r.body).moveId !== undefined;
      } catch {
        return false;
      }
    },
    'move submission latency under 100ms': () => moveLatency < 100
  });

  moveSubmissionRate.add(moveSuccess);
}

function websocketInteractionFlow(user) {
  // Create a game first
  const gameData = {
    gameType: 'PVP',
    betAmount: 1000000,
    maxPlayers: 2,
    timeLimit: 30000
  };

  const createResponse = http.post(
    `${BASE_URL}/api/games`,
    JSON.stringify(gameData),
    { headers: getAuthHeaders(user) }
  );

  if (createResponse.status !== 201) return;

  const game = JSON.parse(createResponse.body);

  // Connect to WebSocket
  const wsStart = Date.now();
  const wsUrl = `${WS_URL}/ws/games/${game.id}?token=${user.token}`;
  
  const response = ws.connect(wsUrl, {}, function (socket) {
    totalWebsocketConnections.add(1);
    
    socket.on('open', function () {
      const wsLatency = Date.now() - wsStart;
      websocketLatency.add(wsLatency);
      
      const connectionSuccess = check(null, {
        'websocket connection established': () => true,
        'websocket connection latency under 50ms': () => wsLatency < 50
      });
      
      websocketConnectionRate.add(connectionSuccess);
    });

    socket.on('message', function (message) {
      try {
        const data = JSON.parse(message);
        
        check(data, {
          'websocket message has type': (d) => d.type !== undefined,
          'websocket message has valid structure': (d) => d.gameId === game.id
        });

        // Respond to certain message types
        if (data.type === 'game_state_update') {
          socket.send(JSON.stringify({
            type: 'ack',
            messageId: data.messageId
          }));
        }
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    });

    socket.on('error', function (e) {
      console.error('WebSocket error:', e);
      websocketConnectionRate.add(false);
    });

    // Send some test messages
    socket.send(JSON.stringify({
      type: 'ping',
      timestamp: Date.now()
    }));

    sleep(2); // Keep connection open for a bit

    socket.send(JSON.stringify({
      type: 'subscribe',
      events: ['move_submitted', 'game_state_changed']
    }));

    sleep(3);
  });

  check(response, {
    'websocket connection completed': (r) => r === undefined // No error
  });
}

function spectatorFlow(user) {
  // Get list of active games
  const gamesResponse = http.get(
    `${BASE_URL}/api/games?status=active&limit=5`,
    { headers: getAuthHeaders(user) }
  );

  if (gamesResponse.status !== 200) return;

  const games = JSON.parse(gamesResponse.body);
  if (!games || games.length === 0) return;

  const game = games[Math.floor(Math.random() * games.length)];

  // Connect as spectator
  const spectateResponse = http.get(
    `${BASE_URL}/api/games/${game.id}/spectate`,
    { headers: getAuthHeaders(user) }
  );

  check(spectateResponse, {
    'spectate connection status is 200': (r) => r.status === 200,
    'spectate response has game data': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.id === game.id;
      } catch {
        return false;
      }
    }
  });

  // Connect to spectator WebSocket
  if (spectateResponse.status === 200) {
    const wsUrl = `${WS_URL}/ws/games/${game.id}/spectate?token=${user.token}`;
    
    ws.connect(wsUrl, {}, function (socket) {
      socket.on('open', function () {
        websocketConnectionRate.add(true);
      });

      socket.on('message', function (message) {
        try {
          const data = JSON.parse(message);
          check(data, {
            'spectator message valid': (d) => d.type !== undefined
          });
        } catch (e) {
          console.error('Invalid spectator message:', e);
        }
      });

      sleep(5); // Spectate for 5 seconds
    });
  }
}

// Teardown function
export function teardown() {
  // Clean up any test data if needed
  console.log('Load test completed');
}

// Test data cleanup (called at end of each iteration)
export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    'load-test-summary.txt': createTextSummary(data),
  };
}

function createTextSummary(data) {
  const summary = [
    'PvP Game Load Test Summary',
    '==========================',
    '',
    `Total Games Created: ${data.metrics.total_games_created?.values.count || 0}`,
    `Total Games Joined: ${data.metrics.total_games_joined?.values.count || 0}`,
    `Total Moves Submitted: ${data.metrics.total_moves_submitted?.values.count || 0}`,
    `Total WebSocket Connections: ${data.metrics.total_websocket_connections?.values.count || 0}`,
    '',
    'Response Time Metrics:',
    `- Game Creation P95: ${(data.metrics.game_creation_latency?.values.p95 || 0).toFixed(2)}ms`,
    `- Game Join P95: ${(data.metrics.game_join_latency?.values.p95 || 0).toFixed(2)}ms`,
    `- Move Submission P95: ${(data.metrics.move_submission_latency?.values.p95 || 0).toFixed(2)}ms`,
    `- WebSocket Connection P95: ${(data.metrics.websocket_latency?.values.p95 || 0).toFixed(2)}ms`,
    '',
    'Success Rates:',
    `- Game Creation: ${((data.metrics.game_creation_success?.values.rate || 0) * 100).toFixed(2)}%`,
    `- Game Join: ${((data.metrics.game_join_success?.values.rate || 0) * 100).toFixed(2)}%`,
    `- Move Submission: ${((data.metrics.move_submission_success?.values.rate || 0) * 100).toFixed(2)}%`,
    `- WebSocket Connection: ${((data.metrics.websocket_connection_success?.values.rate || 0) * 100).toFixed(2)}%`,
    '',
    'HTTP Metrics:',
    `- Average Response Time: ${(data.metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms`,
    `- P95 Response Time: ${(data.metrics.http_req_duration?.values.p95 || 0).toFixed(2)}ms`,
    `- Error Rate: ${((data.metrics.http_req_failed?.values.rate || 0) * 100).toFixed(2)}%`,
    '',
    'Test Duration:',
    `- Total Duration: ${Math.round((data.state?.testRunDurationMs || 0) / 1000)}s`,
    `- Setup Duration: ${Math.round((data.setup?.duration || 0) / 1000)}s`,
    `- Teardown Duration: ${Math.round((data.teardown?.duration || 0) / 1000)}s`,
  ];

  return summary.join('\n');
}