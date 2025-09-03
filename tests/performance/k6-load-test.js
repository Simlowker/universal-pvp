/**
 * k6 Load Testing Suite - Universal PVP
 * Tests 200 concurrent users with strict performance thresholds
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics for cost monitoring
const costWithinTarget = new Rate('cost_within_target');
const transactionCost = new Trend('transaction_cost_lamports');
const gameRoomLatency = new Trend('game_room_latency_ms');
const actionLatency = new Trend('action_latency_ms');
const websocketConnections = new Counter('websocket_connections');

// Test configuration
export const options = {
  scenarios: {
    // HTTP API Load Testing
    api_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up
        { duration: '5m', target: 200 },  // Peak load - 200 concurrent users
        { duration: '5m', target: 200 },  // Sustained load
        { duration: '2m', target: 0 },    // Ramp down
      ],
    },
    // WebSocket Game Room Testing
    websocket_load: {
      executor: 'constant-vus',
      vus: 100,
      duration: '10m',
    },
    // Strategic Duel Specific Testing
    strategic_duel: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 10,
      maxDuration: '15m',
    },
  },
  thresholds: {
    // Critical performance thresholds
    http_req_duration: ['p(95)<100'], // 95th percentile under 100ms
    http_req_failed: ['rate<0.10'],   // Failure rate under 10%
    
    // Custom thresholds
    cost_within_target: ['rate>0.9'], // 90% of transactions within cost target
    transaction_cost_lamports: ['p(95)<100000'], // 95th percentile under 100k lamports
    game_room_latency_ms: ['p(95)<50'], // Game room latency under 50ms
    action_latency_ms: ['p(99)<100'],   // Action latency under 100ms (99th percentile)
    
    // WebSocket thresholds
    ws_connecting: ['rate<0.05'],       // Connection failure rate under 5%
    ws_msgs_received: ['rate>0.95'],    // Message success rate over 95%
  },
};

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:5000';
const COST_TARGET_LAMPORTS = parseInt(__ENV.COST_TARGET_LAMPORTS || '100000');

// Test data
const testUsers = [
  { wallet: 'BK7wKXakARNrFQ6LYjGXGrxUUfQfDQ6MDbR6nSkzHkm4', name: 'TestPlayer1' },
  { wallet: '8YGmoCgnZ9YUnqzVrTfLHzCLpujqtZnkpNWVUqPuzU8x', name: 'TestPlayer2' },
];

// Authentication helper
function authenticateUser(userIndex = 0) {
  const user = testUsers[userIndex % testUsers.length];
  
  const authResponse = http.post(`${BASE_URL}/api/auth/verify-wallet`, {
    wallet: user.wallet,
    signature: 'mock_signature_for_load_testing',
  });

  check(authResponse, {
    'Auth successful': (r) => r.status === 200,
    'JWT token received': (r) => r.json('token') !== undefined,
  });

  return authResponse.json('token');
}

// Strategic Duel game flow testing
export function strategicDuelFlow() {
  group('Strategic Duel Complete Flow', () => {
    const startTime = Date.now();
    
    // 1. Authentication
    const token = authenticateUser();
    const headers = { 'Authorization': `Bearer ${token}` };

    // 2. Join matchmaking
    const matchmakingStart = Date.now();
    const matchResponse = http.post(`${BASE_URL}/api/games/strategic-duel/matchmaking`, {
      priority: 'MEDIUM',
      betAmount: 50000, // 0.05 SOL in lamports
    }, { headers });

    check(matchResponse, {
      'Matchmaking successful': (r) => r.status === 200,
      'Game session created': (r) => r.json('sessionId') !== undefined,
    });

    const gameSession = matchResponse.json();
    const matchmakingLatency = Date.now() - matchmakingStart;
    gameRoomLatency.add(matchmakingLatency);

    // 3. Initialize session with MagicBlock
    const sessionStart = Date.now();
    const sessionResponse = http.post(`${BASE_URL}/api/magicblock/session/init`, {
      gameSessionId: gameSession.sessionId,
      playerWallet: testUsers[0].wallet,
    }, { headers });

    check(sessionResponse, {
      'Session initialized': (r) => r.status === 200,
      'Session key received': (r) => r.json('sessionKey') !== undefined,
      'Delegation setup': (r) => r.json('delegationPda') !== undefined,
    });

    const sessionLatency = Date.now() - sessionStart;
    actionLatency.add(sessionLatency);

    const session = sessionResponse.json();

    // 4. Execute game actions (simulate 10-round strategic duel)
    for (let round = 1; round <= 10; round++) {
      const actionStart = Date.now();
      
      // Random action for load testing
      const actions = ['CHECK', 'RAISE', 'CALL', 'STRATEGIC_FOLD'];
      const action = actions[Math.floor(Math.random() * actions.length)];
      const amount = action === 'RAISE' ? Math.floor(Math.random() * 10000) + 5000 : 0;

      const actionResponse = http.post(`${BASE_URL}/api/magicblock/action/execute`, {
        sessionId: gameSession.sessionId,
        action: {
          type: action,
          amount: amount,
          sessionKey: session.sessionKey,
          round: round,
        }
      }, { headers });

      const actionResponseTime = Date.now() - actionStart;
      actionLatency.add(actionResponseTime);

      check(actionResponse, {
        [`Round ${round} action executed`]: (r) => r.status === 200,
        [`Round ${round} under 50ms`]: (r) => actionResponseTime < 50,
        'Transaction cost available': (r) => r.json('executionCost') !== undefined,
      });

      // Track transaction costs
      if (actionResponse.json('executionCost')) {
        const cost = actionResponse.json('executionCost');
        transactionCost.add(cost);
        costWithinTarget.add(cost <= COST_TARGET_LAMPORTS);
      }

      sleep(0.1); // Small delay between actions
    }

    // 5. Complete game and verify results
    const completeResponse = http.post(`${BASE_URL}/api/games/${gameSession.sessionId}/complete`, {}, { headers });

    check(completeResponse, {
      'Game completed': (r) => r.status === 200,
      'Winner determined': (r) => r.json('winner') !== undefined,
      'Pot distributed': (r) => r.json('potDistribution') !== undefined,
    });

    const totalDuelTime = Date.now() - startTime;
    
    check({}, {
      'Complete duel under 30 seconds': () => totalDuelTime < 30000,
    });
  });
}

// WebSocket load testing for real-time game rooms
export function websocketLoad() {
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  
  const response = ws.connect(url, {}, function (socket) {
    websocketConnections.add(1);
    
    socket.on('open', () => {
      // Join game room
      socket.send(JSON.stringify({
        type: 'join_room',
        roomId: 'load_test_room_' + Math.floor(Math.random() * 10),
        playerData: testUsers[0],
      }));
    });

    socket.on('message', (data) => {
      const messageStart = Date.now();
      const message = JSON.parse(data);
      
      check(message, {
        'Valid message format': (m) => m.type !== undefined,
        'Room updates received': (m) => m.type === 'room_update' || m.type === 'game_state',
      });

      // Simulate game interactions
      if (message.type === 'game_state') {
        socket.send(JSON.stringify({
          type: 'player_action',
          action: 'CHECK',
          timestamp: Date.now(),
        }));
      }
      
      const messageLatency = Date.now() - messageStart;
      gameRoomLatency.add(messageLatency);
    });

    socket.on('close', () => {
      websocketConnections.add(-1);
    });

    // Keep connection alive for test duration
    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });
}

// HTTP API stress testing
export default function apiStressTest() {
  group('API Stress Testing', () => {
    const token = authenticateUser();
    const headers = { 'Authorization': `Bearer ${token}` };

    // 1. Health check
    const healthResponse = http.get(`${BASE_URL}/health`);
    check(healthResponse, {
      'Health check passes': (r) => r.status === 200,
      'Health response time OK': (r) => r.timings.duration < 50,
    });

    // 2. Game listing with pagination
    const gamesResponse = http.get(`${BASE_URL}/api/games?page=1&limit=20`, { headers });
    check(gamesResponse, {
      'Games API responsive': (r) => r.status === 200,
      'Games pagination works': (r) => r.json('pagination') !== undefined,
    });

    // 3. Player stats
    const statsResponse = http.get(`${BASE_URL}/api/players/profile`, { headers });
    check(statsResponse, {
      'Player stats accessible': (r) => r.status === 200,
      'Player data complete': (r) => r.json('stats') !== undefined,
    });

    // 4. Leaderboard
    const leaderboardResponse = http.get(`${BASE_URL}/api/leaderboard/top/50`);
    check(leaderboardResponse, {
      'Leaderboard loads': (r) => r.status === 200,
      'Leaderboard has data': (r) => r.json().length > 0,
    });

    // 5. Tournament listing
    const tournamentsResponse = http.get(`${BASE_URL}/api/tournaments`, { headers });
    check(tournamentsResponse, {
      'Tournaments accessible': (r) => r.status === 200,
    });

    sleep(Math.random() * 2); // Random delay 0-2 seconds
  });
}

// Setup and teardown
export function setup() {
  console.log(`Starting load test with ${options.scenarios.api_load.stages[1].target} peak VUs`);
  console.log(`Cost target: ${COST_TARGET_LAMPORTS} lamports`);
  
  // Verify test environment
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`Test environment not ready: ${healthCheck.status}`);
  }
  
  return { baseUrl: BASE_URL, wsUrl: WS_URL };
}

export function teardown(data) {
  console.log('Load test completed');
  console.log(`Base URL: ${data.baseUrl}`);
  console.log(`WebSocket URL: ${data.wsUrl}`);
}

// Performance analysis for strategic duel specific scenarios
export function handleSummary(data) {
  const costMetrics = data.metrics.transaction_cost_lamports;
  const actionMetrics = data.metrics.action_latency_ms;
  const costTargetRate = data.metrics.cost_within_target.rate;

  return {
    'test-results.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests: data.metrics.http_reqs.count,
        errorRate: data.metrics.http_req_failed.rate,
        p95ResponseTime: data.metrics.http_req_duration.p95,
        avgTransactionCost: costMetrics ? costMetrics.avg : null,
        costTargetMet: costTargetRate >= 0.9,
        avgActionLatency: actionMetrics ? actionMetrics.avg : null,
        websocketConnections: data.metrics.websocket_connections.count,
      },
      thresholds: {
        passed: Object.keys(data.metrics).filter(key => 
          data.metrics[key].thresholds && 
          Object.values(data.metrics[key].thresholds).every(t => t.ok)
        ).length,
        failed: Object.keys(data.metrics).filter(key => 
          data.metrics[key].thresholds && 
          Object.values(data.metrics[key].thresholds).some(t => !t.ok)
        ).length,
      },
      performance: {
        costAnalysis: {
          averageCost: costMetrics ? costMetrics.avg : null,
          p95Cost: costMetrics ? costMetrics.p95 : null,
          costTargetRate: costTargetRate,
          recommendation: costTargetRate >= 0.9 ? 'PASS' : 'OPTIMIZE_COSTS',
        },
        latencyAnalysis: {
          averageActionLatency: actionMetrics ? actionMetrics.avg : null,
          p99ActionLatency: actionMetrics ? actionMetrics.p99 : null,
          recommendation: (actionMetrics && actionMetrics.p99 < 100) ? 'PASS' : 'OPTIMIZE_LATENCY',
        }
      }
    }, null, 2),
    
    stdout: `
📊 LOAD TEST RESULTS SUMMARY
============================

🎯 Performance Targets:
- 200 concurrent users: ${data.metrics.http_reqs ? 'TESTED' : 'SKIPPED'}
- P95 latency < 100ms: ${data.metrics.http_req_duration.p95 < 100 ? '✅ PASS' : '❌ FAIL'} (${data.metrics.http_req_duration.p95.toFixed(2)}ms)
- Failure rate < 10%: ${data.metrics.http_req_failed.rate < 0.1 ? '✅ PASS' : '❌ FAIL'} (${(data.metrics.http_req_failed.rate * 100).toFixed(2)}%)

💰 Cost Analysis:
- Cost target (${COST_TARGET_LAMPORTS} lamports): ${costTargetRate >= 0.9 ? '✅ PASS' : '❌ FAIL'} (${(costTargetRate * 100).toFixed(2)}% within target)
- Average transaction cost: ${costMetrics ? costMetrics.avg.toFixed(0) : 'N/A'} lamports
- P95 transaction cost: ${costMetrics ? costMetrics.p95.toFixed(0) : 'N/A'} lamports

⚡ Game Performance:
- Average action latency: ${actionMetrics ? actionMetrics.avg.toFixed(2) : 'N/A'}ms
- P99 action latency: ${actionMetrics ? actionMetrics.p99.toFixed(2) : 'N/A'}ms
- WebSocket connections: ${data.metrics.websocket_connections ? data.metrics.websocket_connections.count : 'N/A'}

📈 Next Steps:
${costTargetRate < 0.9 ? '- Optimize transaction costs\n' : ''}${data.metrics.http_req_duration.p95 >= 100 ? '- Optimize response latency\n' : ''}${data.metrics.http_req_failed.rate >= 0.1 ? '- Investigate error sources\n' : ''}
    `,
  };
}