import { 
  PrismaClient, 
  GameType, 
  GameStatus, 
  ActionType, 
  ProofType, 
  TransactionType, 
  CostCategory,
  WinReason,
  Currency,
  PlayerTier,
  GameDifficulty,
  CongestionLevel,
  LeaderboardType,
  LeaderboardPeriod
} from '@prisma/client';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('🧹 Cleaning existing data...');
    await prisma.leaderboard.deleteMany({});
    await prisma.playerStats.deleteMany({});
    await prisma.costMetrics.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.proof.deleteMany({});
    await prisma.gameAction.deleteMany({});
    await prisma.game.deleteMany({});
    await prisma.player.deleteMany({});
  }

  console.log('👥 Creating test players...');
  
  // Create test players
  const players = await Promise.all([
    prisma.player.create({
      data: {
        walletId: '11111111111111111111111111111112',
        username: 'alice_crypto',
        displayName: 'Alice The Brave',
        rating: 1450,
        peakRating: 1500,
        gamesPlayed: 25,
        gamesWon: 18,
        gamesLost: 7,
        gamesDraw: 0,
        winRate: 0.72,
        netPnL: new Decimal('2.45'),
        allTimePnL: new Decimal('2.45'),
        totalEarnings: new Decimal('5.67'),
        totalSpent: new Decimal('3.22'),
        streakDays: 5,
        longestStreak: 12,
        totalPlayTime: 450, // 7.5 hours
        tier: PlayerTier.GOLD,
        vipLevel: 1,
        seasonRating: 1475,
        seasonGames: 20,
        seasonWins: 15,
        isActive: true,
        isBanned: false,
        ratingHistory: [
          {
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
            oldRating: 1420,
            newRating: 1450,
            change: 30,
            gameId: 'game1',
          },
        ],
        lastActiveAt: new Date(),
      },
    }),
    
    prisma.player.create({
      data: {
        walletId: '22222222222222222222222222222223',
        username: 'bob_gamer',
        displayName: 'Lightning Bob',
        rating: 1380,
        peakRating: 1420,
        gamesPlayed: 32,
        gamesWon: 19,
        gamesLost: 13,
        winRate: 0.594,
        netPnL: new Decimal('1.23'),
        totalEarnings: new Decimal('4.56'),
        totalSpent: new Decimal('3.33'),
        streakDays: 2,
        longestStreak: 8,
        totalPlayTime: 620, // 10.33 hours
        ratingHistory: [
          {
            timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
            oldRating: 1360,
            newRating: 1380,
            change: 20,
            gameId: 'game2',
          },
        ],
        lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    }),

    prisma.player.create({
      data: {
        walletId: '33333333333333333333333333333334',
        username: 'charlie_pro',
        displayName: 'Pro Charlie',
        rating: 1650,
        peakRating: 1680,
        gamesPlayed: 47,
        gamesWon: 35,
        gamesLost: 12,
        winRate: 0.744,
        netPnL: new Decimal('8.91'),
        totalEarnings: new Decimal('12.45'),
        totalSpent: new Decimal('3.54'),
        streakDays: 1,
        longestStreak: 15,
        totalPlayTime: 890, // 14.83 hours
        ratingHistory: [],
        lastActiveAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    }),

    prisma.player.create({
      data: {
        walletId: '44444444444444444444444444444445',
        username: 'diana_rookie',
        displayName: 'Rookie Diana',
        rating: 1150,
        peakRating: 1200,
        gamesPlayed: 8,
        gamesWon: 3,
        gamesLost: 5,
        winRate: 0.375,
        netPnL: new Decimal('-0.45'),
        totalEarnings: new Decimal('0.89'),
        totalSpent: new Decimal('1.34'),
        streakDays: 0,
        longestStreak: 2,
        totalPlayTime: 120, // 2 hours
        ratingHistory: [],
        lastActiveAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  console.log('🎮 Creating test games...');

  // Create test games
  const games = await Promise.all([
    // Completed game
    prisma.game.create({
      data: {
        gameId: 'GAME_001',
        player1Id: players[0].id,
        player2Id: players[1].id,
        gameType: GameType.RANKED_MATCH,
        status: GameStatus.COMPLETED,
        betAmount: new Decimal('0.5'),
        player1Odds: new Decimal('1.85'),
        player2Odds: new Decimal('1.95'),
        houseEdge: new Decimal('0.05'),
        gameData: {
          player1Health: 0,
          player2Health: 25,
          rounds: 12,
          finalRound: 12,
        },
        seed: 'vrf_seed_001',
        vrfProof: 'proof_001',
        winnerId: players[1].id,
        winReason: 'ELIMINATION',
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endedAt: new Date(Date.now() - 90 * 60 * 1000),
        escrowTx: '5KJp7XgVtTKKzQAQ9wHpLqE2BBz2vP4xDmHvFx8zRvQK',
        settlementTx: '7MNr9YhXvVMNzRAQ1wHpLqE2BBz2vP4xDmHvFx8zRvTL',
      },
    }),

    // Active game
    prisma.game.create({
      data: {
        gameId: 'GAME_002',
        player1Id: players[0].id,
        player2Id: players[2].id,
        gameType: GameType.QUICK_MATCH,
        status: GameStatus.ACTIVE,
        betAmount: new Decimal('0.25'),
        player1Odds: new Decimal('2.1'),
        player2Odds: new Decimal('1.75'),
        houseEdge: new Decimal('0.05'),
        gameData: {
          player1Health: 75,
          player2Health: 80,
          rounds: 8,
          currentRound: 8,
        },
        seed: 'vrf_seed_002',
        startedAt: new Date(Date.now() - 15 * 60 * 1000),
        escrowTx: '8PQs8ZhYwVNOzSBR2wHpLqE2BBz2vP4xDmHvFx8zRvUM',
      },
    }),

    // Waiting game
    prisma.game.create({
      data: {
        gameId: 'GAME_003',
        player1Id: players[3].id,
        gameType: GameType.RANKED_MATCH,
        status: GameStatus.WAITING,
        betAmount: new Decimal('1.0'),
        player1Odds: new Decimal('1.0'),
        player2Odds: new Decimal('1.0'),
        houseEdge: new Decimal('0.05'),
        gameData: {},
      },
    }),
  ]);

  console.log('⚡ Creating game actions...');

  // Create game actions for the completed game
  const gameActions = await Promise.all([
    prisma.gameAction.create({
      data: {
        gameId: games[0].id,
        playerId: players[0].id,
        actionType: ActionType.MOVE,
        roundNumber: 1,
        actionData: {
          direction: 'north',
          distance: 2,
          position: { x: 5, y: 7 },
        },
        clientTimestamp: new Date(Date.now() - 110 * 60 * 1000),
        serverLatency: 45,
        networkLatency: 12,
        signature: 'sig_move_001',
      },
    }),

    prisma.gameAction.create({
      data: {
        gameId: games[0].id,
        playerId: players[1].id,
        actionType: ActionType.ATTACK,
        roundNumber: 1,
        actionData: {
          target: { x: 5, y: 7 },
          damage: 25,
          weaponType: 'sword',
        },
        clientTimestamp: new Date(Date.now() - 108 * 60 * 1000),
        serverLatency: 32,
        networkLatency: 8,
        signature: 'sig_attack_001',
      },
    }),

    prisma.gameAction.create({
      data: {
        gameId: games[1].id,
        playerId: players[0].id,
        actionType: ActionType.SPECIAL,
        roundNumber: 8,
        actionData: {
          abilityId: 'lightning_bolt',
          target: { x: 3, y: 4 },
          cooldown: 30,
        },
        clientTimestamp: new Date(Date.now() - 2 * 60 * 1000),
        serverLatency: 28,
        networkLatency: 15,
        signature: 'sig_special_001',
      },
    }),
  ]);

  console.log('🔐 Creating proofs...');

  // Create proofs
  const proofs = await Promise.all([
    prisma.proof.create({
      data: {
        gameId: games[0].id,
        playerId: players[1].id,
        proofType: ProofType.WIN_CONDITION,
        proofData: {
          finalState: { player1Health: 0, player2Health: 25 },
          proof: 'zk_proof_data_001',
          publicInputs: ['player1_dead', 'player2_alive'],
        },
        hash: 'proof_hash_001',
        transcript: 'transcript_data_001',
        weights: {
          layer1: [0.5, 0.3, 0.8],
          layer2: [0.2, 0.9, 0.1],
        },
        status: 'VERIFIED',
        verifiedAt: new Date(Date.now() - 88 * 60 * 1000),
        verifier: 'zk_verifier_v1',
      },
    }),

    prisma.proof.create({
      data: {
        gameId: games[1].id,
        playerId: players[0].id,
        proofType: ProofType.ACTION_VALID,
        proofData: {
          actionHash: 'action_hash_special_001',
          stateProof: 'state_proof_001',
          validityProof: 'validity_proof_001',
        },
        hash: 'proof_hash_002',
        status: 'PENDING',
      },
    }),
  ]);

  console.log('🔑 Creating sessions...');

  // Create sessions
  const sessions = await Promise.all([
    prisma.session.create({
      data: {
        playerId: players[0].id,
        sessionToken: 'session_token_alice_001',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        permissions: ['PLAY_GAMES', 'VIEW_STATS'],
      },
    }),

    prisma.session.create({
      data: {
        playerId: players[2].id,
        sessionToken: 'session_token_charlie_001',
        ipAddress: '10.0.0.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        delegatedFrom: 'main_session_charlie',
        delegationExpiry: new Date(Date.now() + 6 * 60 * 60 * 1000),
        permissions: ['PLAY_GAMES'],
      },
    }),
  ]);

  console.log('💰 Creating transactions...');

  // Create transactions
  const transactions = await Promise.all([
    prisma.transaction.create({
      data: {
        playerId: players[0].id,
        type: TransactionType.DEPOSIT,
        amount: new Decimal('2.5'),
        currency: 'SOL',
        status: 'CONFIRMED',
        signature: '3XYz8BcDeFgHiJkLmNoPqRsTuVwXyZ1234567890AbCdEf',
        blockHeight: BigInt('245123456'),
        slot: BigInt('245123460'),
        confirmedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        metadata: {
          source: 'phantom_wallet',
          confirmations: 32,
        },
        expectedAmount: new Decimal('2.5'),
        actualAmount: new Decimal('2.5'),
        fees: new Decimal('0.000005'),
      },
    }),

    prisma.transaction.create({
      data: {
        playerId: players[1].id,
        type: TransactionType.WINNINGS,
        amount: new Decimal('0.95'),
        currency: 'SOL',
        status: 'CONFIRMED',
        signature: '4ABc9DeFgHiJkLmNoPqRsTuVwXyZ1234567890CdEfGh',
        blockHeight: BigInt('245123500'),
        slot: BigInt('245123505'),
        gameId: games[0].id,
        confirmedAt: new Date(Date.now() - 88 * 60 * 1000),
        metadata: {
          gameWin: true,
          payout: '0.95',
        },
        expectedAmount: new Decimal('0.95'),
        actualAmount: new Decimal('0.95'),
        fees: new Decimal('0.000005'),
      },
    }),

    prisma.transaction.create({
      data: {
        playerId: players[0].id,
        type: TransactionType.BET,
        amount: new Decimal('0.5'),
        currency: 'SOL',
        status: 'CONFIRMED',
        signature: '5CdE9FgHiJkLmNoPqRsTuVwXyZ1234567890EfGhIj',
        blockHeight: BigInt('245123445'),
        slot: BigInt('245123448'),
        gameId: games[0].id,
        confirmedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        metadata: {
          betType: 'game_entry',
          escrowAccount: '5KJp7XgVtTKKzQAQ9wHpLqE2BBz2vP4xDmHvFx8zRvQK',
        },
        expectedAmount: new Decimal('0.5'),
        actualAmount: new Decimal('0.5'),
        fees: new Decimal('0.000005'),
      },
    }),
  ]);

  console.log('📊 Creating cost metrics...');

  // Create cost metrics
  const costMetrics = await Promise.all([
    prisma.costMetrics.create({
      data: {
        playerId: players[0].id,
        category: CostCategory.TRANSACTION_FEE,
        operation: 'game_bet_escrow',
        costUsd: new Decimal('0.001234'),
        solanaFees: new Decimal('0.000005'),
        computeUnits: BigInt('15000'),
        executionTime: 1250,
        gameId: games[0].id,
        congestionLevel: 'LOW',
        priorityFee: new Decimal('0.000001'),
        baseFee: new Decimal('0.000005'),
        totalFee: new Decimal('0.000005'),
        isOptimized: true,
        metadata: {
          programId: 'MagicBlockProgram',
          instruction: 'CreateEscrow',
        },
      },
    }),

    prisma.costMetrics.create({
      data: {
        playerId: players[1].id,
        category: CostCategory.COMPUTE_COST,
        operation: 'proof_verification',
        costUsd: new Decimal('0.002456'),
        solanaFees: new Decimal('0.000012'),
        computeUnits: BigInt('45000'),
        executionTime: 3400,
        gameId: games[0].id,
        congestionLevel: 'MEDIUM',
        priorityFee: new Decimal('0.000005'),
        baseFee: new Decimal('0.000005'),
        totalFee: new Decimal('0.000012'),
        isOptimized: false,
        optimizationTips: ['use_batch_verification', 'reduce_proof_size'],
        potentialSavings: new Decimal('0.000789'),
        metadata: {
          proofType: 'win_condition',
          verificationTime: 2100,
        },
      },
    }),

    prisma.costMetrics.create({
      data: {
        category: CostCategory.INFRASTRUCTURE,
        operation: 'websocket_connection',
        costUsd: new Decimal('0.000123'),
        solanaFees: new Decimal('0'),
        executionTime: 150,
        congestionLevel: 'LOW',
        isOptimized: true,
        metadata: {
          connectionType: 'game_session',
          duration: 1800000, // 30 minutes
        },
      },
    }),
  ]);

  console.log('✅ Database seeded successfully!');
  console.log(`Created:`);
  console.log(`  - ${players.length} players`);
  console.log(`  - ${games.length} games`);
  console.log(`  - ${gameActions.length} game actions`);
  console.log(`  - ${proofs.length} proofs`);
  console.log(`  - ${sessions.length} sessions`);
  console.log(`  - ${transactions.length} transactions`);
  console.log(`  - ${costMetrics.length} cost metrics`);

  // Display some sample data
  console.log('\\n📈 Sample leaderboard:');
  const leaderboard = await prisma.player.findMany({
    take: 3,
    orderBy: { rating: 'desc' },
    select: {
      username: true,
      displayName: true,
      rating: true,
      winRate: true,
      netPnL: true,
      gamesPlayed: true,
    },
  });

  leaderboard.forEach((player, index) => {
    console.log(`  ${index + 1}. ${player.displayName} (@${player.username}) - Rating: ${player.rating}, Win Rate: ${(player.winRate * 100).toFixed(1)}%, PnL: ${player.netPnL} SOL`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });