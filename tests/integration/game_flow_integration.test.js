const { expect } = require('chai');
const { setupIntegrationTest, cleanupIntegrationTest } = require('../helpers/integration');
const { createTestUsers, fundTestUsers } = require('../helpers/users');
const { deployTestPrograms } = require('../helpers/blockchain');
const { startTestServer } = require('../helpers/server');

/**
 * Full Game Flow Integration Tests
 * Tests complete end-to-end game scenarios across all system components
 */

describe('Complete Game Flow Integration Tests', () => {
  let testEnvironment;
  let testUsers;
  let server;
  
  before(async function() {
    this.timeout(60000); // Long timeout for setup
    
    console.log('🚀 Setting up integration test environment...');
    
    // Setup complete test environment
    testEnvironment = await setupIntegrationTest();
    server = await startTestServer();
    
    // Deploy smart contracts
    await deployTestPrograms(testEnvironment.blockchain);
    
    // Create test users
    testUsers = await createTestUsers([
      { username: 'warrior_player', playerClass: 'warrior', rating: 1200 },
      { username: 'mage_player', playerClass: 'mage', rating: 1150 },
      { username: 'rogue_player', playerClass: 'rogue', rating: 1250 },
      { username: 'archer_player', playerClass: 'archer', rating: 1100 }
    ]);
    
    // Fund users with test SOL
    await fundTestUsers(testUsers, 5.0); // 5 SOL each
    
    console.log('✅ Integration test environment ready');
  });
  
  after(async function() {
    this.timeout(30000);
    console.log('🧹 Cleaning up integration test environment...');
    
    if (server) await server.close();
    await cleanupIntegrationTest(testEnvironment);
    
    console.log('✅ Cleanup complete');
  });
  
  describe('Complete 1v1 Game Flow', () => {
    it('should execute full 1v1 match from creation to completion', async function() {
      this.timeout(120000); // 2 minutes for full game
      
      const [player1, player2] = testUsers;
      
      console.log('🎮 Starting 1v1 game flow test...');
      
      // Step 1: Player 1 creates match
      console.log('📝 Player 1 creating match...');
      const matchConfig = {
        maxPlayers: 2,
        entryFee: 1000000, // 0.001 SOL
        turnTimeout: 30,
        matchDuration: 300,
        rewardDistribution: [100]
      };
      
      const createMatchResponse = await player1.api.post('/matches', matchConfig);
      expect(createMatchResponse.status).to.equal(201);
      
      const matchId = createMatchResponse.data.id;
      console.log(`✅ Match created: ${matchId}`);
      
      // Step 2: Verify match on blockchain
      const onChainMatch = await testEnvironment.blockchain.getMatchAccount(matchId);
      expect(onChainMatch.status).to.equal('waiting');
      expect(onChainMatch.creator.toString()).to.equal(player1.publicKey.toString());
      
      // Step 3: Player 2 joins match
      console.log('🤝 Player 2 joining match...');
      const joinMatchResponse = await player2.api.post(`/matches/${matchId}/join`);
      expect(joinMatchResponse.status).to.equal(200);
      
      // Wait for match to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 4: Verify match started
      const startedMatch = await player1.api.get(`/matches/${matchId}`);
      expect(startedMatch.data.status).to.equal('in_progress');
      expect(startedMatch.data.players).to.have.length(2);
      
      console.log('⚔️ Match started, beginning combat...');
      
      // Step 5: Execute combat sequence
      let gameState = await player1.api.get(`/matches/${matchId}/state`);
      let turnCount = 0;
      const maxTurns = 20; // Prevent infinite loop
      
      while (gameState.data.status === 'in_progress' && turnCount < maxTurns) {
        const currentPlayer = gameState.data.currentTurn === 0 ? player1 : player2;
        const opponent = gameState.data.currentTurn === 0 ? player2 : player1;
        
        console.log(`🎯 Turn ${turnCount + 1}: ${currentPlayer.username} attacking...`);
        
        // Execute combat action
        const combatAction = {
          type: 'attack',
          target: gameState.data.currentTurn === 0 ? 1 : 0,
          power: Math.floor(Math.random() * 50) + 25 // Random power 25-75
        };
        
        const actionResponse = await currentPlayer.api.post(
          `/matches/${matchId}/actions`, 
          combatAction
        );
        expect(actionResponse.status).to.equal(200);
        
        // Wait for action to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get updated game state
        gameState = await player1.api.get(`/matches/${matchId}/state`);
        turnCount++;
        
        console.log(`💖 Health after turn: P1=${gameState.data.players[0].health}, P2=${gameState.data.players[1].health}`);
      }
      
      // Step 6: Verify match completion
      expect(gameState.data.status).to.equal('completed');
      expect(gameState.data.winner).to.be.a('string');
      
      const winnerId = gameState.data.winner;
      const winner = winnerId === player1.id ? player1 : player2;
      const loser = winnerId === player1.id ? player2 : player1;
      
      console.log(`🏆 Match completed! Winner: ${winner.username}`);
      
      // Step 7: Verify rewards and stat updates
      const winnerStatsAfter = await winner.api.get('/players/profile');
      const loserStatsAfter = await loser.api.get('/players/profile');
      
      expect(winnerStatsAfter.data.stats.totalMatches).to.be.above(0);
      expect(winnerStatsAfter.data.stats.wins).to.be.above(0);
      expect(loserStatsAfter.data.stats.losses).to.be.above(0);
      
      // Step 8: Verify blockchain state
      const finalOnChainMatch = await testEnvironment.blockchain.getMatchAccount(matchId);
      expect(finalOnChainMatch.status).to.equal('completed');
      expect(finalOnChainMatch.winner.toString()).to.equal(winner.publicKey.toString());
      
      // Step 9: Verify token transfers
      const winnerBalanceAfter = await testEnvironment.blockchain.getBalance(winner.publicKey);
      const loserBalanceAfter = await testEnvironment.blockchain.getBalance(loser.publicKey);
      
      // Winner should have received rewards (minus fees)
      expect(winnerBalanceAfter).to.be.above(winner.initialBalance);
      // Loser should have lost entry fee
      expect(loserBalanceAfter).to.be.below(loser.initialBalance);
      
      console.log('✅ 1v1 game flow completed successfully!');
    });
  });
  
  describe('Multiplayer Battle Royale Flow', () => {
    it('should execute 4-player battle royale match', async function() {
      this.timeout(180000); // 3 minutes for multiplayer game
      
      console.log('🎮 Starting 4-player battle royale test...');
      
      // Step 1: Create 4-player match
      const matchConfig = {
        maxPlayers: 4,
        entryFee: 2000000, // 0.002 SOL
        turnTimeout: 20,
        matchDuration: 600,
        rewardDistribution: [50, 30, 20] // Top 3 get rewards
      };
      
      const createResponse = await testUsers[0].api.post('/matches', matchConfig);
      const matchId = createResponse.data.id;
      
      console.log(`✅ 4-player match created: ${matchId}`);
      
      // Step 2: All other players join
      for (let i = 1; i < testUsers.length; i++) {
        await testUsers[i].api.post(`/matches/${matchId}/join`);
        console.log(`✅ ${testUsers[i].username} joined`);
      }
      
      // Wait for match to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 3: Verify all players joined
      let gameState = await testUsers[0].api.get(`/matches/${matchId}/state`);
      expect(gameState.data.status).to.equal('in_progress');
      expect(gameState.data.players).to.have.length(4);
      
      console.log('⚔️ Battle royale started!');
      
      // Step 4: Execute combat until only one remains
      let alivePlayers = [0, 1, 2, 3];
      let turnCount = 0;
      const maxTurns = 50;
      
      while (alivePlayers.length > 1 && turnCount < maxTurns) {
        const currentPlayerIndex = gameState.data.currentTurn;
        
        // Skip turn if current player is eliminated
        if (!alivePlayers.includes(currentPlayerIndex)) {
          turnCount++;
          continue;
        }
        
        const currentPlayer = testUsers[currentPlayerIndex];
        
        // Find alive targets
        const availableTargets = alivePlayers.filter(i => i !== currentPlayerIndex);
        const targetIndex = availableTargets[Math.floor(Math.random() * availableTargets.length)];
        
        console.log(`🎯 Turn ${turnCount + 1}: ${currentPlayer.username} attacking player ${targetIndex}`);
        
        // Execute attack
        const combatAction = {
          type: 'attack',
          target: targetIndex,
          power: Math.floor(Math.random() * 60) + 30
        };
        
        await currentPlayer.api.post(`/matches/${matchId}/actions`, combatAction);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Update game state
        gameState = await testUsers[0].api.get(`/matches/${matchId}/state`);
        
        // Update alive players list
        alivePlayers = gameState.data.players
          .map((player, index) => player.health > 0 ? index : -1)
          .filter(index => index >= 0);
        
        const healthStatus = gameState.data.players.map((p, i) => 
          `P${i}:${p.health}HP`).join(', ');
        console.log(`💖 Health status: ${healthStatus}`);
        
        turnCount++;
      }
      
      // Step 5: Verify match completion
      expect(gameState.data.status).to.equal('completed');
      expect(alivePlayers).to.have.length(1);
      
      const winnerId = gameState.data.winner;
      const winner = testUsers.find(u => u.id === winnerId);
      
      console.log(`🏆 Battle Royale winner: ${winner.username}`);
      
      // Step 6: Verify ranking system
      const finalStats = gameState.data.finalRanking;
      expect(finalStats).to.have.length(4);
      expect(finalStats[0].playerId).to.equal(winnerId);
      
      // Step 7: Verify reward distribution
      const rewards = gameState.data.rewards;
      expect(rewards[finalStats[0].playerId]).to.be.above(0); // Winner gets reward
      expect(rewards[finalStats[1].playerId]).to.be.above(0); // 2nd place gets reward
      expect(rewards[finalStats[2].playerId]).to.be.above(0); // 3rd place gets reward
      expect(rewards[finalStats[3].playerId]).to.equal(0);    // 4th place gets nothing
      
      console.log('✅ Battle royale completed successfully!');
    });
  });
  
  describe('Tournament System Integration', () => {
    it('should execute complete tournament with multiple rounds', async function() {
      this.timeout(300000); // 5 minutes for tournament
      
      console.log('🏆 Starting tournament system test...');
      
      // Create 8 more players for tournament
      const tournamentPlayers = await createTestUsers(
        Array.from({ length: 8 }, (_, i) => ({
          username: `tournament_player_${i}`,
          playerClass: ['warrior', 'mage', 'rogue', 'archer'][i % 4],
          rating: 1000 + Math.floor(Math.random() * 400)
        }))
      );
      await fundTestUsers(tournamentPlayers, 3.0);
      
      const allPlayers = [...testUsers, ...tournamentPlayers];
      
      // Step 1: Create tournament
      const tournamentConfig = {
        name: 'Test Championship',
        maxParticipants: 12,
        entryFee: 5000000, // 0.005 SOL
        format: 'single_elimination',
        prizePool: 'winner_takes_all'
      };
      
      const tournamentResponse = await testUsers[0].api.post('/tournaments', tournamentConfig);
      const tournamentId = tournamentResponse.data.id;
      
      console.log(`✅ Tournament created: ${tournamentId}`);
      
      // Step 2: Players join tournament
      for (let i = 1; i < allPlayers.length; i++) {
        await allPlayers[i].api.post(`/tournaments/${tournamentId}/join`);
        console.log(`✅ ${allPlayers[i].username} joined tournament`);
      }
      
      // Step 3: Start tournament
      await testUsers[0].api.post(`/tournaments/${tournamentId}/start`);
      
      let tournament = await testUsers[0].api.get(`/tournaments/${tournamentId}`);
      expect(tournament.data.status).to.equal('in_progress');
      
      console.log('🏁 Tournament started!');
      
      // Step 4: Execute all rounds
      let currentRound = 1;
      
      while (tournament.data.status === 'in_progress') {
        console.log(`🔄 Round ${currentRound} starting...`);
        
        const roundMatches = tournament.data.currentRound.matches;
        
        // Execute all matches in current round
        const matchPromises = roundMatches.map(async (match) => {
          const [player1Id, player2Id] = match.playerIds;
          const player1 = allPlayers.find(p => p.id === player1Id);
          const player2 = allPlayers.find(p => p.id === player2Id);
          
          console.log(`⚔️ Match: ${player1.username} vs ${player2.username}`);
          
          // Simulate match execution
          return await simulateMatch(match.id, player1, player2);
        });
        
        const matchResults = await Promise.all(matchPromises);
        console.log(`✅ Round ${currentRound} completed`);
        
        // Get updated tournament state
        tournament = await testUsers[0].api.get(`/tournaments/${tournamentId}`);
        currentRound++;
        
        // Prevent infinite loop
        if (currentRound > 10) break;
      }
      
      // Step 5: Verify tournament completion
      expect(tournament.data.status).to.equal('completed');
      expect(tournament.data.winner).to.be.a('string');
      
      const winner = allPlayers.find(p => p.id === tournament.data.winner);
      console.log(`🏆 Tournament winner: ${winner.username}`);
      
      // Step 6: Verify prize distribution
      const finalPrizePool = tournament.data.finalPrizePool;
      expect(finalPrizePool).to.be.above(0);
      
      // Winner should receive the prize
      const winnerBalanceAfter = await testEnvironment.blockchain.getBalance(winner.publicKey);
      expect(winnerBalanceAfter).to.be.above(winner.initialBalance + finalPrizePool * 0.9); // Minus fees
      
      console.log('✅ Tournament completed successfully!');
    });
  });
  
  describe('Real-time Spectator System', () => {
    it('should allow spectators to watch live matches', async function() {
      this.timeout(60000);
      
      console.log('👀 Testing spectator system...');
      
      // Create spectator user
      const spectator = await createTestUsers([{
        username: 'spectator_user',
        playerClass: 'warrior',
        rating: 1000
      }]);
      await fundTestUsers(spectator, 1.0);
      
      const [player1, player2] = testUsers;
      
      // Step 1: Create and start match
      const matchResponse = await player1.api.post('/matches', {
        maxPlayers: 2,
        entryFee: 1000000,
        allowSpectators: true,
        isPublic: true
      });
      
      const matchId = matchResponse.data.id;
      await player2.api.post(`/matches/${matchId}/join`);
      
      // Wait for match to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Step 2: Spectator joins as viewer
      const spectateResponse = await spectator[0].api.post(`/matches/${matchId}/spectate`);
      expect(spectateResponse.status).to.equal(200);
      
      console.log('✅ Spectator joined match');
      
      // Step 3: Execute some combat actions
      await player1.api.post(`/matches/${matchId}/actions`, {
        type: 'attack',
        target: 1,
        power: 50
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 4: Verify spectator can see game state
      const spectatorView = await spectator[0].api.get(`/matches/${matchId}/spectate`);
      expect(spectatorView.status).to.equal(200);
      expect(spectatorView.data.players).to.have.length(2);
      expect(spectatorView.data.combatLog).to.be.an('array');
      
      // Spectator should not see private information
      expect(spectatorView.data.players[0].privateStats).to.be.undefined;
      
      console.log('✅ Spectator system working correctly');
    });
  });
  
  describe('Error Recovery and Fault Tolerance', () => {
    it('should handle player disconnections gracefully', async function() {
      this.timeout(90000);
      
      console.log('🔌 Testing disconnection handling...');
      
      const [player1, player2] = testUsers;
      
      // Start match
      const matchResponse = await player1.api.post('/matches', {
        maxPlayers: 2,
        entryFee: 1000000,
        turnTimeout: 10 // Short timeout for testing
      });
      
      const matchId = matchResponse.data.id;
      await player2.api.post(`/matches/${matchId}/join`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate player 2 disconnection
      console.log('🔌 Simulating player disconnection...');
      await testEnvironment.network.disconnectUser(player2.id);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Check match state
      const gameState = await player1.api.get(`/matches/${matchId}/state`);
      
      // Match should either pause or continue with AI
      expect(['paused', 'in_progress', 'completed']).to.include(gameState.data.status);
      
      // Reconnect player 2
      console.log('🔌 Reconnecting player...');
      await testEnvironment.network.reconnectUser(player2.id);
      
      // Player should be able to resume
      const resumeResponse = await player2.api.post(`/matches/${matchId}/resume`);
      expect([200, 409]).to.include(resumeResponse.status); // 409 if match already ended
      
      console.log('✅ Disconnection handling tested');
    });
    
    it('should handle blockchain transaction failures', async function() {
      this.timeout(60000);
      
      console.log('⛓️ Testing blockchain failure handling...');
      
      const [player1, player2] = testUsers;
      
      // Temporarily break blockchain connection
      await testEnvironment.blockchain.simulateFailure();
      
      // Try to create match
      const matchResponse = await player1.api.post('/matches', {
        maxPlayers: 2,
        entryFee: 1000000
      });
      
      // Should either queue for retry or fail gracefully
      expect([201, 503]).to.include(matchResponse.status);
      
      if (matchResponse.status === 503) {
        expect(matchResponse.data.error).to.include('blockchain');
      }
      
      // Restore blockchain connection
      await testEnvironment.blockchain.restoreConnection();
      
      // Retry should now work
      if (matchResponse.status === 503) {
        const retryResponse = await player1.api.post('/matches', {
          maxPlayers: 2,
          entryFee: 1000000
        });
        expect(retryResponse.status).to.equal(201);
      }
      
      console.log('✅ Blockchain failure handling tested');
    });
  });
  
  // Helper function to simulate a match
  async function simulateMatch(matchId, player1, player2) {
    // Simple simulation - random winner
    const winner = Math.random() < 0.5 ? player1 : player2;
    const loser = winner === player1 ? player2 : player1;
    
    // Execute a few combat rounds
    for (let i = 0; i < 3; i++) {
      const attacker = i % 2 === 0 ? player1 : player2;
      const target = i % 2 === 0 ? 1 : 0;
      
      await attacker.api.post(`/matches/${matchId}/actions`, {
        type: 'attack',
        target,
        power: Math.floor(Math.random() * 50) + 25
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if match ended
      const state = await player1.api.get(`/matches/${matchId}/state`);
      if (state.data.status === 'completed') {
        return state.data.winner;
      }
    }
    
    // Force end match with predetermined winner
    await testEnvironment.forceEndMatch(matchId, winner.id);
    return winner.id;
  }
});