#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

/**
 * Comprehensive schema validation and testing script
 * Tests all critical database operations and indexes
 */

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration?: number;
}

class SchemaValidator {
  private prisma: PrismaClient;
  private results: TestResult[] = [];

  constructor() {
    this.prisma = new PrismaClient();
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      await testFn();
      this.results.push({
        name,
        success: true,
        duration: Date.now() - start,
      });
      console.log(`✅ ${name} (${Date.now() - start}ms)`);
    } catch (error) {
      this.results.push({
        name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - start,
      });
      console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)} (${Date.now() - start}ms)`);
    }
  }

  /**
   * Test Player model enhancements
   */
  private async testPlayerModel(): Promise<void> {
    await this.runTest('Player Model - Create with new fields', async () => {
      const player = await this.prisma.player.create({
        data: {
          walletId: `test_wallet_${Date.now()}`,
          username: `test_user_${Date.now()}`,
          displayName: 'Test Player',
          tier: 'GOLD',
          vipLevel: 2,
          seasonRating: 1350,
          seasonGames: 15,
          seasonWins: 12,
          gamesDraw: 2,
          allTimePnL: '125.50',
          isActive: true,
          isBanned: false,
        },
      });

      if (!player.id) throw new Error('Player creation failed');
      if (player.tier !== 'GOLD') throw new Error('Player tier not set correctly');
      if (player.gamesDraw !== 2) throw new Error('gamesDraw field not working');
    });

    await this.runTest('Player Model - Index performance test', async () => {
      // Test rating + gamesPlayed index
      const players = await this.prisma.player.findMany({
        where: {
          rating: { gte: 1200 },
          gamesPlayed: { gte: 10 },
        },
        orderBy: [
          { rating: 'desc' },
          { gamesPlayed: 'desc' },
        ],
        take: 10,
      });

      console.log(`   Found ${players.length} players with rating >= 1200 and games >= 10`);
    });

    await this.runTest('Player Model - Complex query with new fields', async () => {
      const topPlayerStats = await this.prisma.player.findMany({
        where: {
          isActive: true,
          isBanned: false,
          tier: { in: ['GOLD', 'PLATINUM', 'DIAMOND'] },
          seasonGames: { gte: 5 },
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          rating: true,
          seasonRating: true,
          tier: true,
          vipLevel: true,
          winRate: true,
          netPnL: true,
          allTimePnL: true,
          gamesDraw: true,
        },
        orderBy: [
          { seasonRating: 'desc' },
          { rating: 'desc' },
        ],
        take: 20,
      });

      console.log(`   Found ${topPlayerStats.length} active high-tier players`);
    });
  }

  /**
   * Test Game model enhancements
   */
  private async testGameModel(): Promise<void> {
    await this.runTest('Game Model - Create with new fields', async () => {
      // First create a player for the game
      const player = await this.prisma.player.create({
        data: {
          walletId: `game_test_wallet_${Date.now()}`,
          username: `game_test_${Date.now()}`,
        },
      });

      const game = await this.prisma.game.create({
        data: {
          gameId: `GAME_TEST_${Date.now()}`,
          player1Id: player.id,
          gameType: 'RANKED_MATCH',
          status: 'WAITING',
          betAmount: '1.5',
          difficulty: 'HARD',
          maxRounds: 15,
          timeLimit: 300,
          player1Odds: '1.850',
          player2Odds: '1.950',
          houseEdge: '0.025000',
        },
      });

      if (!game.id) throw new Error('Game creation failed');
      if (game.difficulty !== 'HARD') throw new Error('Game difficulty not set correctly');
      if (Number(game.betAmount) !== 1.5) throw new Error('Bet amount precision issue');
    });

    await this.runTest('Game Model - Index performance test', async () => {
      const games = await this.prisma.game.findMany({
        where: {
          status: 'ACTIVE',
          gameType: 'RANKED_MATCH',
          betAmount: { gte: '0.5' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      console.log(`   Found ${games.length} active ranked games with bet >= 0.5 SOL`);
    });
  }

  /**
   * Test new analytics models
   */
  private async testAnalyticsModels(): Promise<void> {
    await this.runTest('PlayerStats Model - Create and query', async () => {
      // Create a player first
      const player = await this.prisma.player.create({
        data: {
          walletId: `stats_test_wallet_${Date.now()}`,
          username: `stats_test_${Date.now()}`,
        },
      });

      const playerStats = await this.prisma.playerStats.create({
        data: {
          playerId: player.id,
          date: new Date(),
          gamesPlayed: 10,
          gamesWon: 7,
          gamesLost: 2,
          gamesDraw: 1,
          avgGameDuration: 450,
          winStreaks: 3,
          bestStreak: 5,
          ratingChange: 45,
          totalWagered: '5.25',
          netPnL: '2.15',
          biggestWin: '1.8',
          biggestLoss: '0.9',
        },
      });

      if (!playerStats.id) throw new Error('PlayerStats creation failed');
      if (playerStats.gamesDraw !== 1) throw new Error('gamesDraw tracking failed');
    });

    await this.runTest('Leaderboard Model - Create and query', async () => {
      // Create a player first
      const player = await this.prisma.player.create({
        data: {
          walletId: `lb_test_wallet_${Date.now()}`,
          username: `lb_test_${Date.now()}`,
        },
      });

      const leaderboard = await this.prisma.leaderboard.create({
        data: {
          playerId: player.id,
          type: 'RATING',
          period: 'WEEKLY',
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          rank: 5,
          previousRank: 7,
          rating: 1450,
          gamesPlayed: 25,
          winRate: 0.72,
          netPnL: '3.25',
        },
      });

      if (!leaderboard.id) throw new Error('Leaderboard creation failed');
      if (leaderboard.type !== 'RATING') throw new Error('Leaderboard type not set correctly');
    });
  }

  /**
   * Test enhanced transaction model
   */
  private async testTransactionModel(): Promise<void> {
    await this.runTest('Transaction Model - Enhanced fields', async () => {
      const player = await this.prisma.player.create({
        data: {
          walletId: `tx_test_wallet_${Date.now()}`,
          username: `tx_test_${Date.now()}`,
        },
      });

      const transaction = await this.prisma.transaction.create({
        data: {
          playerId: player.id,
          type: 'DEPOSIT',
          amount: '2.5',
          currency: 'SOL',
          status: 'CONFIRMED',
          signature: `tx_test_${Date.now()}`,
          expectedAmount: '2.5',
          actualAmount: '2.5',
          fees: '0.000005',
          slippage: '0.001',
          confirmationTime: 15,
          retryCount: 0,
        },
      });

      if (!transaction.id) throw new Error('Transaction creation failed');
      if (transaction.currency !== 'SOL') throw new Error('Currency enum not working');
      if (transaction.confirmationTime !== 15) throw new Error('confirmationTime field failed');
    });
  }

  /**
   * Test enhanced cost metrics
   */
  private async testCostMetrics(): Promise<void> {
    await this.runTest('CostMetrics Model - Enhanced tracking', async () => {
      const costMetric = await this.prisma.costMetrics.create({
        data: {
          category: 'VRF_COST',
          operation: 'generate_random_seed',
          costUsd: '0.001234',
          solanaFees: '0.000012',
          computeUnits: BigInt(25000),
          cpuUsage: 15.5,
          memoryUsage: 128.7,
          networkBytes: BigInt(1024),
          executionTime: 850,
          congestionLevel: 'MEDIUM',
          priorityFee: '0.000005',
          baseFee: '0.000005',
          totalFee: '0.000012',
          isOptimized: true,
        },
      });

      if (!costMetric.id) throw new Error('CostMetrics creation failed');
      if (costMetric.category !== 'VRF_COST') throw new Error('New cost category not working');
      if (costMetric.congestionLevel !== 'MEDIUM') throw new Error('CongestionLevel enum failed');
    });
  }

  /**
   * Test enhanced enums
   */
  private async testEnhancements(): Promise<void> {
    await this.runTest('Enhanced Enums - WinReason', async () => {
      const player1 = await this.prisma.player.create({
        data: {
          walletId: `enum_test1_${Date.now()}`,
          username: `enum_test1_${Date.now()}`,
        },
      });

      const player2 = await this.prisma.player.create({
        data: {
          walletId: `enum_test2_${Date.now()}`,
          username: `enum_test2_${Date.now()}`,
        },
      });

      const game = await this.prisma.game.create({
        data: {
          gameId: `ENUM_TEST_${Date.now()}`,
          player1Id: player1.id,
          player2Id: player2.id,
          gameType: 'QUICK_MATCH',
          status: 'COMPLETED',
          betAmount: '1.0',
          winnerId: player1.id,
          winReason: 'DRAW', // Test new enum value
        },
      });

      if (game.winReason !== 'DRAW') throw new Error('New WinReason enum value not working');
    });

    await this.runTest('Enhanced Enums - ActionType', async () => {
      const player = await this.prisma.player.create({
        data: {
          walletId: `action_test_${Date.now()}`,
          username: `action_test_${Date.now()}`,
        },
      });

      const game = await this.prisma.game.create({
        data: {
          gameId: `ACTION_TEST_${Date.now()}`,
          player1Id: player.id,
          gameType: 'PRACTICE',
          status: 'ACTIVE',
          betAmount: '0.1',
        },
      });

      const action = await this.prisma.gameAction.create({
        data: {
          gameId: game.id,
          playerId: player.id,
          actionType: 'EMOTE', // Test new enum value
          actionData: { emoteId: 'wave', target: null },
        },
      });

      if (action.actionType !== 'EMOTE') throw new Error('New ActionType enum value not working');
    });
  }

  /**
   * Run all validation tests
   */
  public async validate(): Promise<void> {
    console.log('🔍 Starting comprehensive schema validation...\n');

    try {
      await this.testPlayerModel();
      await this.testGameModel();
      await this.testAnalyticsModels();
      await this.testTransactionModel();
      await this.testCostMetrics();
      await this.testEnhancements();

      const passed = this.results.filter(r => r.success).length;
      const failed = this.results.filter(r => !r.success).length;
      const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

      console.log('\n📊 Validation Summary:');
      console.log(`   ✅ Passed: ${passed}`);
      console.log(`   ❌ Failed: ${failed}`);
      console.log(`   🕐 Total Duration: ${totalDuration}ms`);
      console.log(`   🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

      if (failed > 0) {
        console.log('\n🚨 Failed Tests:');
        this.results
          .filter(r => !r.success)
          .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
      }

      console.log('\n✨ Schema validation completed!\n');

    } catch (error) {
      console.error('❌ Validation failed:', error);
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  const validator = new SchemaValidator();
  validator.validate().catch(console.error);
}

export default SchemaValidator;