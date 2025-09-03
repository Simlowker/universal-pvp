const io = require('socket.io-client');
const { expect } = require('chai');
const { setupTestServer, shutdownTestServer } = require('../helpers/server');
const { createTestUser, createTestToken } = require('../helpers/auth');
const { createTestMatch } = require('../helpers/match');

/**
 * WebSocket Integration Tests
 * Tests real-time communication and game state synchronization
 */

describe('WebSocket Integration Tests', () => {
  let server;
  let serverUrl;
  let testUser1, testUser2;
  let authToken1, authToken2;
  
  before(async () => {
    server = await setupTestServer();
    serverUrl = `http://localhost:${server.port}`;
    
    testUser1 = await createTestUser({ username: 'player1', wallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9' });
    testUser2 = await createTestUser({ username: 'player2', wallet: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9' });
    
    authToken1 = createTestToken(testUser1.id);
    authToken2 = createTestToken(testUser2.id);
  });
  
  after(async () => {
    await shutdownTestServer(server);
  });
  
  describe('Connection Management', () => {
    it('should establish WebSocket connection with valid auth', (done) => {
      const client = io(serverUrl, {
        auth: { token: authToken1 }
      });
      
      client.on('connect', () => {
        expect(client.connected).to.be.true;
        client.disconnect();
        done();
      });
      
      client.on('connect_error', (error) => {
        done(error);
      });
      
      setTimeout(() => {
        done(new Error('Connection timeout'));
      }, 5000);
    });
    
    it('should reject connection with invalid auth', (done) => {
      const client = io(serverUrl, {
        auth: { token: 'invalid_token' }
      });
      
      client.on('connect_error', (error) => {
        expect(error.message).to.contain('Authentication failed');
        done();
      });
      
      client.on('connect', () => {
        client.disconnect();
        done(new Error('Should not connect with invalid token'));
      });
      
      setTimeout(() => {
        done(new Error('Connection timeout'));
      }, 3000);
    });
    
    it('should handle multiple concurrent connections', (done) => {
      const connections = [];
      let connectedCount = 0;
      const targetConnections = 5;
      
      for (let i = 0; i < targetConnections; i++) {
        const client = io(serverUrl, {
          auth: { token: authToken1 }
        });
        
        connections.push(client);
        
        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === targetConnections) {
            // All connected successfully
            connections.forEach(c => c.disconnect());
            done();
          }
        });
        
        client.on('connect_error', (error) => {
          connections.forEach(c => c.disconnect());
          done(error);
        });
      }
      
      setTimeout(() => {
        connections.forEach(c => c.disconnect());
        done(new Error('Connection timeout'));
      }, 10000);
    });
  });
  
  describe('Match Lobby Real-time Updates', () => {
    let client1, client2;
    let testMatch;
    
    beforeEach((done) => {
      client1 = io(serverUrl, { auth: { token: authToken1 } });
      client2 = io(serverUrl, { auth: { token: authToken2 } });
      
      let connectCount = 0;
      const onConnect = () => {
        connectCount++;
        if (connectCount === 2) {
          createTestMatch(testUser1.id, {
            maxPlayers: 4,
            entryFee: 1000000,
            turnTimeout: 60,
            matchDuration: 1800
          }).then(match => {
            testMatch = match;
            done();
          }).catch(done);
        }
      };
      
      client1.on('connect', onConnect);
      client2.on('connect', onConnect);
    });
    
    afterEach(() => {
      if (client1) client1.disconnect();
      if (client2) client2.disconnect();
    });
    
    it('should broadcast match creation to lobby', (done) => {
      client2.emit('join_lobby');
      
      client2.on('match_created', (data) => {
        expect(data).to.have.property('matchId');
        expect(data).to.have.property('creator');
        expect(data.creator.id).to.equal(testUser1.id);
        done();
      });
      
      // Simulate match creation
      setTimeout(() => {
        client1.emit('create_match', {
          maxPlayers: 2,
          entryFee: 1000000,
          turnTimeout: 60,
          matchDuration: 1800
        });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Match creation event timeout'));
      }, 5000);
    });
    
    it('should notify players when someone joins match', (done) => {
      client1.emit('join_match_room', { matchId: testMatch.id });
      
      client1.on('player_joined', (data) => {
        expect(data).to.have.property('playerId');
        expect(data).to.have.property('username');
        expect(data.playerId).to.equal(testUser2.id);
        done();
      });
      
      // Player 2 joins the match
      setTimeout(() => {
        client2.emit('join_match', { matchId: testMatch.id });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Player join event timeout'));
      }, 5000);
    });
    
    it('should notify when match becomes full and starts', (done) => {
      client1.emit('join_match_room', { matchId: testMatch.id });
      client2.emit('join_match_room', { matchId: testMatch.id });
      
      let eventCount = 0;
      const checkDone = () => {
        eventCount++;
        if (eventCount === 2) done(); // Both clients received event
      };
      
      client1.on('match_started', (data) => {
        expect(data).to.have.property('matchId');
        expect(data).to.have.property('players');
        expect(data.players).to.have.length(2);
        checkDone();
      });
      
      client2.on('match_started', (data) => {
        expect(data.matchId).to.equal(testMatch.id);
        checkDone();
      });
      
      // Fill the match (assuming it's a 2-player match)
      setTimeout(() => {
        client2.emit('join_match', { matchId: testMatch.id });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Match start event timeout'));
      }, 5000);
    });
  });
  
  describe('Real-time Game State Updates', () => {
    let client1, client2;
    let testMatch;
    
    beforeEach(async () => {
      client1 = io(serverUrl, { auth: { token: authToken1 } });
      client2 = io(serverUrl, { auth: { token: authToken2 } });
      
      // Wait for connections and create in-progress match
      await new Promise((resolve) => {
        let connectCount = 0;
        const onConnect = () => {
          connectCount++;
          if (connectCount === 2) resolve();
        };
        client1.on('connect', onConnect);
        client2.on('connect', onConnect);
      });
      
      testMatch = await createTestMatch(testUser1.id, {
        maxPlayers: 2,
        entryFee: 1000000,
        status: 'in_progress',
        players: [testUser1.id, testUser2.id]
      });
    });
    
    afterEach(() => {
      if (client1) client1.disconnect();
      if (client2) client2.disconnect();
    });
    
    it('should broadcast combat actions to all players', (done) => {
      client1.emit('join_game_room', { matchId: testMatch.id });
      client2.emit('join_game_room', { matchId: testMatch.id });
      
      client2.on('combat_action_executed', (data) => {
        expect(data).to.have.property('action');
        expect(data).to.have.property('playerId');
        expect(data).to.have.property('damage');
        expect(data.playerId).to.equal(testUser1.id);
        expect(data.action.type).to.equal('attack');
        done();
      });
      
      // Player 1 executes attack
      setTimeout(() => {
        client1.emit('execute_combat_action', {
          matchId: testMatch.id,
          action: {
            type: 'attack',
            target: 1,
            power: 50
          }
        });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Combat action event timeout'));
      }, 5000);
    });
    
    it('should synchronize player health updates', (done) => {
      client1.emit('join_game_room', { matchId: testMatch.id });
      client2.emit('join_game_room', { matchId: testMatch.id });
      
      client1.on('player_health_updated', (data) => {
        expect(data).to.have.property('playerId');
        expect(data).to.have.property('newHealth');
        expect(data).to.have.property('damage');
        expect(data.playerId).to.equal(testUser1.id);
        expect(data.newHealth).to.be.a('number');
        done();
      });
      
      // Simulate damage to player 1
      setTimeout(() => {
        client2.emit('execute_combat_action', {
          matchId: testMatch.id,
          action: {
            type: 'attack',
            target: 0, // Target player 1
            power: 30
          }
        });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Health update event timeout'));
      }, 5000);
    });
    
    it('should handle turn-based mechanics', (done) => {
      client1.emit('join_game_room', { matchId: testMatch.id });
      client2.emit('join_game_room', { matchId: testMatch.id });
      
      let turnChanges = 0;
      
      const onTurnChange = (data) => {
        expect(data).to.have.property('currentPlayer');
        expect(data).to.have.property('turnNumber');
        expect(data).to.have.property('timeRemaining');
        
        turnChanges++;
        if (turnChanges === 2) {
          // Received turn change events
          done();
        }
      };
      
      client1.on('turn_changed', onTurnChange);
      client2.on('turn_changed', onTurnChange);
      
      // Execute action that should trigger turn change
      setTimeout(() => {
        client1.emit('execute_combat_action', {
          matchId: testMatch.id,
          action: {
            type: 'attack',
            target: 1,
            power: 25
          }
        });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Turn change event timeout'));
      }, 8000);
    });
    
    it('should notify match completion and results', (done) => {
      client1.emit('join_game_room', { matchId: testMatch.id });
      client2.emit('join_game_room', { matchId: testMatch.id });
      
      let completionEvents = 0;
      
      const onMatchComplete = (data) => {
        expect(data).to.have.property('matchId');
        expect(data).to.have.property('winner');
        expect(data).to.have.property('results');
        expect(data).to.have.property('rewards');
        
        completionEvents++;
        if (completionEvents === 2) {
          done();
        }
      };
      
      client1.on('match_completed', onMatchComplete);
      client2.on('match_completed', onMatchComplete);
      
      // Simulate match-ending scenario
      setTimeout(() => {
        client1.emit('execute_combat_action', {
          matchId: testMatch.id,
          action: {
            type: 'finishing_move',
            target: 1,
            power: 999
          }
        });
      }, 100);
      
      setTimeout(() => {
        done(new Error('Match completion event timeout'));
      }, 8000);
    });
  });
  
  describe('Error Handling and Recovery', () => {
    let client;
    
    beforeEach((done) => {
      client = io(serverUrl, { auth: { token: authToken1 } });
      client.on('connect', () => done());
    });
    
    afterEach(() => {
      if (client) client.disconnect();
    });
    
    it('should handle invalid event data gracefully', (done) => {
      client.on('error', (error) => {
        expect(error).to.have.property('message');
        expect(error.message).to.contain('Invalid');
        done();
      });
      
      // Send malformed event
      client.emit('execute_combat_action', {
        invalidData: true
      });
      
      setTimeout(() => {
        done(new Error('Error event timeout'));
      }, 3000);
    });
    
    it('should reconnect automatically after disconnection', (done) => {
      let reconnectCount = 0;
      
      client.on('reconnect', () => {
        reconnectCount++;
        if (reconnectCount === 1) {
          done();
        }
      });
      
      // Force disconnect
      setTimeout(() => {
        client.disconnect();
        // Reconnect after short delay
        setTimeout(() => {
          client.connect();
        }, 500);
      }, 100);
      
      setTimeout(() => {
        done(new Error('Reconnection timeout'));
      }, 10000);
    });
    
    it('should handle rate limiting on rapid events', (done) => {
      let rateLimitHit = false;
      
      client.on('rate_limit_exceeded', (data) => {
        expect(data).to.have.property('message');
        expect(data.message).to.contain('rate limit');
        rateLimitHit = true;
      });
      
      // Send rapid-fire events
      for (let i = 0; i < 50; i++) {
        client.emit('execute_combat_action', {
          matchId: 'test-match',
          action: { type: 'attack', target: 0, power: 10 }
        });
      }
      
      setTimeout(() => {
        if (rateLimitHit) {
          done();
        } else {
          done(new Error('Rate limit not triggered'));
        }
      }, 2000);
    });
  });
  
  describe('Room Management', () => {
    let client1, client2;
    
    beforeEach((done) => {
      client1 = io(serverUrl, { auth: { token: authToken1 } });
      client2 = io(serverUrl, { auth: { token: authToken2 } });
      
      let connectCount = 0;
      const onConnect = () => {
        connectCount++;
        if (connectCount === 2) done();
      };
      
      client1.on('connect', onConnect);
      client2.on('connect', onConnect);
    });
    
    afterEach(() => {
      if (client1) client1.disconnect();
      if (client2) client2.disconnect();
    });
    
    it('should join and leave rooms correctly', (done) => {
      const roomId = 'test-lobby';
      let joinEvents = 0;
      let leaveEvents = 0;
      
      client2.on('user_joined_room', (data) => {
        expect(data.userId).to.equal(testUser1.id);
        joinEvents++;
        checkCompletion();
      });
      
      client2.on('user_left_room', (data) => {
        expect(data.userId).to.equal(testUser1.id);
        leaveEvents++;
        checkCompletion();
      });
      
      const checkCompletion = () => {
        if (joinEvents === 1 && leaveEvents === 1) {
          done();
        }
      };
      
      // Join room sequence
      client2.emit('join_room', { roomId });
      
      setTimeout(() => {
        client1.emit('join_room', { roomId });
      }, 100);
      
      setTimeout(() => {
        client1.emit('leave_room', { roomId });
      }, 200);
      
      setTimeout(() => {
        done(new Error('Room events timeout'));
      }, 5000);
    });
    
    it('should broadcast messages within rooms only', (done) => {
      const roomId = 'private-room';
      let messageReceived = false;
      
      client1.emit('join_room', { roomId });
      client2.emit('join_room', { roomId });
      
      client2.on('room_message', (data) => {
        expect(data.message).to.equal('Hello room!');
        expect(data.senderId).to.equal(testUser1.id);
        messageReceived = true;
      });
      
      setTimeout(() => {
        client1.emit('send_room_message', {
          roomId,
          message: 'Hello room!'
        });
      }, 200);
      
      setTimeout(() => {
        if (messageReceived) {
          done();
        } else {
          done(new Error('Room message not received'));
        }
      }, 3000);
    });
  });
  
  describe('Performance and Load Testing', () => {
    it('should handle multiple simultaneous matches', (done) => {
      const numMatches = 10;
      const clients = [];
      let completedMatches = 0;
      
      // Create clients for multiple matches
      for (let i = 0; i < numMatches * 2; i++) {
        const client = io(serverUrl, {
          auth: { token: i % 2 === 0 ? authToken1 : authToken2 }
        });
        clients.push(client);
      }
      
      const onAllConnected = () => {
        // Create matches
        for (let i = 0; i < numMatches; i++) {
          const creator = clients[i * 2];
          const joiner = clients[i * 2 + 1];
          
          creator.on('match_started', () => {
            completedMatches++;
            if (completedMatches === numMatches) {
              clients.forEach(c => c.disconnect());
              done();
            }
          });
          
          creator.emit('create_match', {
            maxPlayers: 2,
            entryFee: 1000000
          });
          
          setTimeout(() => {
            joiner.emit('join_match', { matchId: `match-${i}` });
          }, 100 * i);
        }
      };
      
      let connectedCount = 0;
      clients.forEach(client => {
        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === clients.length) {
            onAllConnected();
          }
        });
      });
      
      setTimeout(() => {
        clients.forEach(c => c.disconnect());
        done(new Error('Load test timeout'));
      }, 30000);
    });
    
    it('should maintain low latency under load', (done) => {
      const client = io(serverUrl, { auth: { token: authToken1 } });
      let latencies = [];
      let messageCount = 0;
      const totalMessages = 20;
      
      client.on('connect', () => {
        const sendMessage = () => {
          const startTime = Date.now();
          
          client.emit('ping', { timestamp: startTime }, (response) => {
            const endTime = Date.now();
            const latency = endTime - startTime;
            latencies.push(latency);
            messageCount++;
            
            if (messageCount >= totalMessages) {
              const avgLatency = latencies.reduce((a, b) => a + b) / latencies.length;
              const maxLatency = Math.max(...latencies);
              
              console.log(`Average latency: ${avgLatency}ms, Max latency: ${maxLatency}ms`);
              
              expect(avgLatency).to.be.below(100); // Average should be < 100ms
              expect(maxLatency).to.be.below(500);  // Max should be < 500ms
              
              client.disconnect();
              done();
            } else {
              setTimeout(sendMessage, 50);
            }
          });
        };
        
        sendMessage();
      });
      
      setTimeout(() => {
        client.disconnect();
        done(new Error('Latency test timeout'));
      }, 15000);
    });
  });
});