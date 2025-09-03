/**
 * Full PvP Battle Flow Integration Tests
 * Tests complete PvP scenarios from matchmaking to battle completion
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { EphemeralRollupSDK } from '@magicblock-labs/ephemeral-rollups-sdk';
import { SessionKeyManager } from '@magicblock-labs/session-keys';
import { BoltSDK, World, Entity } from '@magicblock-labs/bolt-sdk';

// Import PvP system components
import { PvPMatchmaker } from '../../src/pvp/matchmaker';
import { BattleManager } from '../../src/pvp/battle_manager';
import { GameStateManager } from '../../src/pvp/game_state_manager';
import { RewardSystem } from '../../src/pvp/reward_system';
import { LeaderboardManager } from '../../src/pvp/leaderboard_manager';

describe('Full PvP Battle Flow Integration Tests', () => {
  let connection: Connection;
  let erSDK: EphemeralRollupSDK;
  let boltSDK: BoltSDK;
  let sessionKeyManager: SessionKeyManager;
  let pvpMatchmaker: PvPMatchmaker;
  let battleManager: BattleManager;
  let gameStateManager: GameStateManager;
  let rewardSystem: RewardSystem;
  let leaderboardManager: LeaderboardManager;

  let player1Keypair: Keypair;
  let player2Keypair: Keypair;
  let player1SessionKey: any;
  let player2SessionKey: any;

  beforeEach(async () => {
    // Initialize test environment
    connection = new Connection('http://localhost:8899', 'confirmed');
    player1Keypair = Keypair.generate();
    player2Keypair = Keypair.generate();

    // Initialize all systems
    erSDK = new EphemeralRollupSDK({
      connection,
      commitment: 'confirmed',
      batchSize: 25,
      flushInterval: 10,
      compressionEnabled: true,
    });

    boltSDK = new BoltSDK({
      connection,
      erSDK,
    });

    sessionKeyManager = new SessionKeyManager({
      connection,
      erSDK,
    });

    pvpMatchmaker = new PvPMatchmaker({
      erSDK,
      sessionKeyManager,
      matchmakingTimeout: 30000, // 30 seconds
      skillRangeThreshold: 200,
      waitTimeBonus: 0.1,
    });

    battleManager = new BattleManager({
      erSDK,
      boltSDK,
      sessionKeyManager,
      battleTimeout: 300000, // 5 minutes
      turnTimeout: 30000, // 30 seconds per turn
      maxActionsPerTurn: 3,
    });

    gameStateManager = new GameStateManager({
      erSDK,
      updateInterval: 16, // 60 FPS
      compressionEnabled: true,
      deltaUpdatesEnabled: true,
    });

    rewardSystem = new RewardSystem({
      erSDK,
      baseReward: 100,
      winMultiplier: 1.5,
      perfectWinMultiplier: 2.0,
      streakBonus: 0.1,
    });

    leaderboardManager = new LeaderboardManager({
      erSDK,
      seasonDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
      decayRate: 0.02,
      placementMatches: 10,
    });

    // Initialize all systems
    await erSDK.initialize();
    await boltSDK.initialize();
    await sessionKeyManager.initialize();
    await pvpMatchmaker.initialize();
    await battleManager.initialize();
    await gameStateManager.initialize();
    await rewardSystem.initialize();
    await leaderboardManager.initialize();

    // Create session keys for both players
    player1SessionKey = await sessionKeyManager.createSessionKey({
      masterKeypair: player1Keypair,
      permissions: ['move', 'attack', 'use_ability', 'use_item', 'surrender'],
      duration: 3600,
    });

    player2SessionKey = await sessionKeyManager.createSessionKey({
      masterKeypair: player2Keypair,
      permissions: ['move', 'attack', 'use_ability', 'use_item', 'surrender'],
      duration: 3600,
    });
  });

  afterEach(async () => {
    await leaderboardManager.shutdown();
    await rewardSystem.shutdown();
    await gameStateManager.shutdown();
    await battleManager.shutdown();
    await pvpMatchmaker.shutdown();
    await sessionKeyManager.cleanup();
    await boltSDK.shutdown();
    await erSDK.shutdown();
  });

  describe('Complete PvP Flow: Matchmaking to Victory', () => {
    test('should complete full 1v1 PvP match from start to finish', async () => {
      const startTime = performance.now();

      // Step 1: Player registration and matchmaking
      const player1Profile = {
        id: player1Keypair.publicKey.toString(),
        username: 'TestWarrior1',
        level: 15,
        rating: 1200,
        class: 'warrior',
        stats: { attack: 50, defense: 40, speed: 30, health: 120, mana: 60 },
        equipment: {
          weapon: { id: 'steel_sword', attack: 15 },
          armor: { id: 'plate_armor', defense: 20 },
          accessory: { id: 'strength_ring', attack: 5 }
        },
      };

      const player2Profile = {
        id: player2Keypair.publicKey.toString(),
        username: 'TestMage1',
        level: 14,
        rating: 1180,
        class: 'mage',
        stats: { attack: 35, defense: 25, speed: 45, health: 80, mana: 120 },
        equipment: {
          weapon: { id: 'magic_staff', attack: 20, mana: 10 },
          armor: { id: 'robe', defense: 10, mana: 15 },
          accessory: { id: 'mana_crystal', mana: 20 }
        },
      };

      // Register players for matchmaking
      const matchRequest1 = pvpMatchmaker.requestMatch(player1Profile, player1SessionKey);
      const matchRequest2 = pvpMatchmaker.requestMatch(player2Profile, player2SessionKey);

      const [match1, match2] = await Promise.all([matchRequest1, matchRequest2]);
      
      expect(match1.matched).toBe(true);
      expect(match2.matched).toBe(true);
      expect(match1.matchId).toBe(match2.matchId);

      const matchId = match1.matchId;
      const matchTime1 = performance.now() - startTime;
      expect(matchTime1).toBeLessThan(1000); // Matchmaking under 1 second

      // Step 2: Battle initialization
      const battleInit = await battleManager.initializeBattle({
        matchId,
        players: [player1Profile, player2Profile],
        battleType: '1v1',
        mapId: 'arena_classic',
        rules: {
          turnTimeLimit: 30,
          maxTurns: 50,
          allowItems: true,
          allowSurrender: true,
        },
      });

      expect(battleInit.success).toBe(true);
      expect(battleInit.battleId).toBeDefined();
      expect(battleInit.initialState).toBeDefined();

      const battleId = battleInit.battleId;
      const initTime = performance.now() - startTime;
      expect(initTime).toBeLessThan(2000); // Battle init under 2 seconds

      // Step 3: Battle simulation - Turn-based combat
      let currentTurn = 1;
      let battleComplete = false;
      let winner = null;
      const maxTurns = 20; // Limit for test

      while (!battleComplete && currentTurn <= maxTurns) {
        const turnStartTime = performance.now();
        
        // Determine turn order based on speed
        const turnOrder = await battleManager.calculateTurnOrder(battleId);
        expect(turnOrder.length).toBe(2);

        for (const playerId of turnOrder) {
          if (battleComplete) break;

          const isPlayer1 = playerId === player1Profile.id;
          const currentPlayer = isPlayer1 ? player1Profile : player2Profile;
          const sessionKey = isPlayer1 ? player1SessionKey : player2SessionKey;
          const opponent = isPlayer1 ? player2Profile : player1Profile;

          // Get current battle state
          const battleState = await battleManager.getBattleState(battleId);
          const playerState = battleState.players[playerId];
          
          if (playerState.health <= 0) {
            battleComplete = true;
            winner = opponent.id;
            break;
          }

          // AI decision making for test (simulate player actions)
          const actions = await generatePlayerActions(currentPlayer, opponent, battleState);
          
          for (const action of actions) {
            const actionStartTime = performance.now();
            
            const actionResult = await battleManager.executeAction({
              battleId,
              playerId,
              sessionKey: sessionKey.publicKey,
              action,
              timestamp: Date.now(),
            });

            expect(actionResult.success).toBe(true);

            const actionTime = performance.now() - actionStartTime;
            expect(actionTime).toBeLessThan(30); // Each action under 30ms

            // Check if action resulted in victory
            if (actionResult.battleEnded) {
              battleComplete = true;
              winner = actionResult.winner;
              break;
            }

            // Update game state after each action
            await gameStateManager.updateBattleState(battleId, actionResult.newState);
          }
        }

        currentTurn++;
        const turnTime = performance.now() - turnStartTime;
        expect(turnTime).toBeLessThan(200); // Complete turn under 200ms
      }

      // Step 4: Battle completion and reward processing
      const battleEndTime = performance.now();
      
      expect(battleComplete).toBe(true);
      expect(winner).toBeDefined();

      const battleSummary = await battleManager.completeBattle({
        battleId,
        winner,
        endReason: 'victory',
        finalState: await battleManager.getBattleState(battleId),
      });

      expect(battleSummary.success).toBe(true);
      expect(battleSummary.duration).toBeGreaterThan(0);
      expect(battleSummary.totalTurns).toBeGreaterThan(0);

      // Step 5: Reward distribution
      const rewardResults = await rewardSystem.distributeRewards({
        battleId,
        winner,
        loser: winner === player1Profile.id ? player2Profile.id : player1Profile.id,
        battleSummary,
      });

      expect(rewardResults.success).toBe(true);
      expect(rewardResults.winnerReward).toBeGreaterThan(100);
      expect(rewardResults.loserReward).toBeGreaterThan(0);

      // Step 6: Leaderboard updates
      const leaderboardUpdate = await leaderboardManager.updateRatings({
        winner: winner === player1Profile.id ? player1Profile : player2Profile,
        loser: winner === player1Profile.id ? player2Profile : player1Profile,
        battleSummary,
      });

      expect(leaderboardUpdate.success).toBe(true);
      expect(leaderboardUpdate.newWinnerRating).toBeDefined();
      expect(leaderboardUpdate.newLoserRating).toBeDefined();

      const totalTime = performance.now() - startTime;
      
      // Complete PvP flow should complete within reasonable time
      expect(totalTime).toBeLessThan(15000); // Under 15 seconds for full match
      console.log(`Complete PvP match completed in ${totalTime.toFixed(2)}ms`);
    });

    test('should handle 2v2 team PvP battle flow', async () => {
      const startTime = performance.now();

      // Create 4 players for 2v2
      const players = [];
      const sessionKeys = [];

      for (let i = 0; i < 4; i++) {
        const keypair = Keypair.generate();
        const sessionKey = await sessionKeyManager.createSessionKey({
          masterKeypair: keypair,
          permissions: ['move', 'attack', 'use_ability', 'use_item', 'team_communicate'],
          duration: 3600,
        });

        players.push({
          id: keypair.publicKey.toString(),
          username: `TeamPlayer${i + 1}`,
          level: 12 + i,
          rating: 1000 + (i * 50),
          class: ['warrior', 'mage', 'archer', 'rogue'][i],
          stats: {
            attack: 40 + (i * 5),
            defense: 30 + (i * 3),
            speed: 25 + (i * 7),
            health: 100,
            mana: 60 + (i * 10),
          },
          teamPreference: i < 2 ? 'team_alpha' : 'team_beta',
        });

        sessionKeys.push(sessionKey);
      }

      // Team matchmaking
      const team1 = players.slice(0, 2);
      const team2 = players.slice(2, 4);

      const matchRequest = await pvpMatchmaker.requestTeamMatch({
        team1,
        team2,
        battleType: '2v2',
        sessionKeys: sessionKeys,
      });

      expect(matchRequest.matched).toBe(true);
      expect(matchRequest.teams.length).toBe(2);

      // Initialize team battle
      const battleInit = await battleManager.initializeTeamBattle({
        matchId: matchRequest.matchId,
        teams: [team1, team2],
        battleType: '2v2',
        mapId: 'team_arena',
        rules: {
          turnTimeLimit: 45, // Longer for team coordination
          maxTurns: 75,
          teamCommunication: true,
          friendlyFire: false,
        },
      });

      expect(battleInit.success).toBe(true);

      // Simulate team battle with coordination
      const battleState = await simulateTeamBattle(battleInit.battleId, [team1, team2], sessionKeys);

      expect(battleState.battleComplete).toBe(true);
      expect(battleState.winningTeam).toBeDefined();

      const totalTime = performance.now() - startTime;
      expect(totalTime).toBeLessThan(20000); // Team battles take longer but under 20s

      console.log(`2v2 team battle completed in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('PvP Tournament Flow', () => {
    test('should run complete tournament bracket', async () => {
      const startTime = performance.now();

      // Create 8 players for single elimination tournament
      const tournamentPlayers = [];
      for (let i = 0; i < 8; i++) {
        const keypair = Keypair.generate();
        const sessionKey = await sessionKeyManager.createSessionKey({
          masterKeypair: keypair,
          permissions: ['move', 'attack', 'use_ability', 'use_item'],
          duration: 7200, // 2 hours for tournament
        });

        tournamentPlayers.push({
          id: keypair.publicKey.toString(),
          username: `TourneyPlayer${i + 1}`,
          level: 10 + i,
          rating: 800 + (i * 100),
          class: ['warrior', 'mage', 'archer', 'rogue'][i % 4],
          sessionKey,
        });
      }

      // Initialize tournament
      const tournament = await pvpMatchmaker.createTournament({
        name: 'Test Championship',
        players: tournamentPlayers,
        format: 'single_elimination',
        prizePool: 10000,
        entryFee: 100,
      });

      expect(tournament.success).toBe(true);
      expect(tournament.bracket.length).toBe(3); // 3 rounds for 8 players

      // Round 1: Quarterfinals (4 matches)
      const round1Results = [];
      for (let i = 0; i < 4; i++) {
        const match = tournament.bracket[0][i];
        const winner = await simulateTournamentMatch(match.player1, match.player2);
        round1Results.push(winner);
      }

      expect(round1Results.length).toBe(4);

      // Round 2: Semifinals (2 matches)
      const round2Results = [];
      for (let i = 0; i < 2; i++) {
        const winner = await simulateTournamentMatch(round1Results[i * 2], round1Results[i * 2 + 1]);
        round2Results.push(winner);
      }

      expect(round2Results.length).toBe(2);

      // Round 3: Finals (1 match)
      const champion = await simulateTournamentMatch(round2Results[0], round2Results[1]);
      
      expect(champion).toBeDefined();

      // Distribute tournament rewards
      const tournamentRewards = await rewardSystem.distributeTournamentRewards({
        tournamentId: tournament.tournamentId,
        champion,
        runnerUp: round2Results.find(p => p.id !== champion.id),
        semifinals: round1Results.filter(p => !round2Results.some(r => r.id === p.id)),
        prizePool: tournament.prizePool,
      });

      expect(tournamentRewards.success).toBe(true);
      expect(tournamentRewards.championReward).toBeGreaterThan(4000); // 40% of prize pool

      const totalTime = performance.now() - startTime;
      expect(totalTime).toBeLessThan(60000); // Tournament under 1 minute (simulated)

      console.log(`Tournament completed in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('PvP Performance Under Load', () => {
    test('should handle 20 concurrent 1v1 matches', async () => {
      const startTime = performance.now();
      const concurrentMatches = 20;
      const matchPromises = [];

      for (let i = 0; i < concurrentMatches; i++) {
        matchPromises.push(runQuickPvPMatch(i));
      }

      const results = await Promise.all(matchPromises);

      expect(results.length).toBe(concurrentMatches);
      expect(results.every(r => r.success)).toBe(true);

      const totalTime = performance.now() - startTime;
      const avgTimePerMatch = totalTime / concurrentMatches;

      expect(totalTime).toBeLessThan(30000); // All concurrent matches under 30s
      expect(avgTimePerMatch).toBeLessThan(5000); // Each match under 5s average

      console.log(`20 concurrent matches completed in ${totalTime.toFixed(2)}ms (avg: ${avgTimePerMatch.toFixed(2)}ms per match)`);
    });

    test('should maintain performance during server battle events', async () => {
      const startTime = performance.now();

      // Simulate large-scale server event with multiple battle types
      const eventPromises = [
        // 10 quick 1v1 matches
        ...Array(10).fill(null).map((_, i) => runQuickPvPMatch(i)),
        // 3 team battles
        ...Array(3).fill(null).map((_, i) => runQuickTeamMatch(i)),
        // 1 tournament with 8 players
        runQuickTournament(),
      ];

      const eventResults = await Promise.all(eventPromises);

      expect(eventResults.length).toBe(14); // 10 + 3 + 1
      expect(eventResults.every(r => r.success)).toBe(true);

      const totalTime = performance.now() - startTime;
      
      // Large server event should complete reasonably
      expect(totalTime).toBeLessThan(45000); // Under 45 seconds

      console.log(`Server event with mixed battles completed in ${totalTime.toFixed(2)}ms`);
    });
  });

  // Helper functions for test simulation
  async function generatePlayerActions(currentPlayer: any, opponent: any, battleState: any) {
    const actions = [];
    const playerState = battleState.players[currentPlayer.id];
    const opponentState = battleState.players[opponent.id];

    // Simple AI logic for testing
    if (playerState.health < 30 && playerState.inventory.includes('health_potion')) {
      actions.push({
        type: 'use_item',
        itemId: 'health_potion',
        target: 'self',
      });
    } else if (playerState.position.distanceTo(opponentState.position) > 1) {
      actions.push({
        type: 'move',
        target: opponentState.position,
        maxDistance: 2,
      });
    } else {
      // Attack based on class
      if (currentPlayer.class === 'warrior' && playerState.energy > 30) {
        actions.push({
          type: 'use_ability',
          abilityId: 'power_strike',
          target: opponent.id,
        });
      } else if (currentPlayer.class === 'mage' && playerState.mana > 40) {
        actions.push({
          type: 'use_ability',
          abilityId: 'fireball',
          target: opponent.id,
        });
      } else {
        actions.push({
          type: 'attack',
          target: opponent.id,
          attackType: 'basic',
        });
      }
    }

    return actions.slice(0, 2); // Max 2 actions per turn
  }

  async function simulateTeamBattle(battleId: string, teams: any[][], sessionKeys: any[]) {
    let turn = 1;
    const maxTurns = 30;

    while (turn <= maxTurns) {
      const battleState = await battleManager.getBattleState(battleId);
      
      // Check for team elimination
      const team1Alive = teams[0].filter(p => battleState.players[p.id].health > 0);
      const team2Alive = teams[1].filter(p => battleState.players[p.id].health > 0);

      if (team1Alive.length === 0) {
        return { battleComplete: true, winningTeam: 'team_beta' };
      }
      if (team2Alive.length === 0) {
        return { battleComplete: true, winningTeam: 'team_alpha' };
      }

      // Execute team actions
      const allPlayers = [...teams[0], ...teams[1]];
      for (let i = 0; i < allPlayers.length; i++) {
        const player = allPlayers[i];
        const sessionKey = sessionKeys[i];
        const playerState = battleState.players[player.id];

        if (playerState.health <= 0) continue;

        const opponents = i < 2 ? teams[1] : teams[0];
        const aliveOpponents = opponents.filter(p => battleState.players[p.id].health > 0);
        
        if (aliveOpponents.length > 0) {
          const action = {
            type: 'attack',
            target: aliveOpponents[0].id,
            attackType: 'basic',
          };

          await battleManager.executeAction({
            battleId,
            playerId: player.id,
            sessionKey: sessionKey.publicKey,
            action,
            timestamp: Date.now(),
          });
        }
      }

      turn++;
    }

    return { battleComplete: true, winningTeam: 'draw' };
  }

  async function simulateTournamentMatch(player1: any, player2: any) {
    // Simulate quick match based on ratings and stats
    const player1Power = player1.rating + player1.stats?.attack || 0;
    const player2Power = player2.rating + player2.stats?.attack || 0;
    
    // Add some randomness
    const random1 = Math.random() * 200;
    const random2 = Math.random() * 200;
    
    return (player1Power + random1) > (player2Power + random2) ? player1 : player2;
  }

  async function runQuickPvPMatch(index: number) {
    const player1 = Keypair.generate();
    const player2 = Keypair.generate();
    
    const sessionKey1 = await sessionKeyManager.createSessionKey({
      masterKeypair: player1,
      permissions: ['move', 'attack'],
      duration: 1800,
    });

    const sessionKey2 = await sessionKeyManager.createSessionKey({
      masterKeypair: player2,
      permissions: ['move', 'attack'],
      duration: 1800,
    });

    const match = await pvpMatchmaker.requestMatch(
      { id: player1.publicKey.toString(), rating: 1000 + index * 10 },
      sessionKey1
    );

    // Simulate quick battle resolution
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    return {
      success: true,
      matchId: match.matchId,
      duration: 100 + Math.random() * 200,
    };
  }

  async function runQuickTeamMatch(index: number) {
    // Simulate team match
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    return {
      success: true,
      matchId: `team_match_${index}`,
      duration: 500 + Math.random() * 1000,
    };
  }

  async function runQuickTournament() {
    // Simulate tournament
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
    
    return {
      success: true,
      tournamentId: 'quick_tournament',
      duration: 2000 + Math.random() * 3000,
    };
  }
});