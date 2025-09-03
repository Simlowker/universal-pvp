-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'STARTING', 'ACTIVE', 'PAUSED', 'SETTLING', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('QUICK_MATCH', 'RANKED_MATCH', 'TOURNAMENT', 'PRACTICE');

-- CreateEnum
CREATE TYPE "WinReason" AS ENUM ('ELIMINATION', 'TIMEOUT', 'FORFEIT', 'DISPUTE');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('MOVE', 'ATTACK', 'DEFEND', 'SPECIAL', 'ITEM_USE', 'SURRENDER');

-- CreateEnum
CREATE TYPE "ProofType" AS ENUM ('GAME_STATE', 'ACTION_VALID', 'WIN_CONDITION', 'RANDOMNESS');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('PENDING', 'VERIFIED', 'INVALID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'BET', 'WINNINGS', 'FEE', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('TRANSACTION_FEE', 'COMPUTE_COST', 'RENT_COST', 'INFRASTRUCTURE', 'THIRD_PARTY', 'STORAGE');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "gamesLost" INTEGER NOT NULL DEFAULT 0,
    "totalEarnings" DECIMAL(18,9) NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(18,9) NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "ratingHistory" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "peakRating" INTEGER NOT NULL DEFAULT 1200,
    "netPnL" DECIMAL(18,9) NOT NULL DEFAULT 0,
    "dailyPnL" DECIMAL(18,9) NOT NULL DEFAULT 0,
    "weeklyPnL" DECIMAL(18,9) NOT NULL DEFAULT 0,
    "monthlyPnL" DECIMAL(18,9) NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "totalPlayTime" INTEGER NOT NULL DEFAULT 0,
    "maxLossPerDay" DECIMAL(18,9),
    "maxBetSize" DECIMAL(18,9),
    "autoStopLoss" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT,
    "status" "GameStatus" NOT NULL DEFAULT 'WAITING',
    "gameType" "GameType" NOT NULL,
    "betAmount" DECIMAL(18,9) NOT NULL,
    "gameData" JSONB,
    "seed" TEXT,
    "vrfProof" TEXT,
    "player1Odds" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "player2Odds" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "houseEdge" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "stateRoot" TEXT,
    "attestation" JSONB,
    "finalProof" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "winReason" "WinReason",
    "escrowTx" TEXT,
    "settlementTx" TEXT,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_actions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "actionData" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "clientTimestamp" TIMESTAMP(3),
    "serverLatency" INTEGER,
    "networkLatency" INTEGER,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "proofHash" TEXT,
    "signature" TEXT,

    CONSTRAINT "game_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "proofType" "ProofType" NOT NULL,
    "proofData" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "transcript" TEXT,
    "weights" JSONB,
    "vrfOutput" TEXT,
    "status" "ProofStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "verifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "delegatedFrom" TEXT,
    "delegationExpiry" TIMESTAMP(3),
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(18,9) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SOL',
    "signature" TEXT,
    "blockHeight" BIGINT,
    "slot" BIGINT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "gameId" TEXT,
    "expectedAmount" DECIMAL(18,9),
    "actualAmount" DECIMAL(18,9),
    "fees" DECIMAL(18,9),
    "slippage" DECIMAL(10,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_metrics" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "category" "CostCategory" NOT NULL,
    "operation" TEXT NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "solanaFees" DECIMAL(18,9) NOT NULL,
    "computeUnits" BIGINT,
    "executionTime" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gameId" TEXT,
    "metadata" JSONB,
    "congestionLevel" TEXT,
    "priorityFee" DECIMAL(18,9),
    "baseFee" DECIMAL(18,9),
    "totalFee" DECIMAL(18,9),
    "isOptimized" BOOLEAN NOT NULL DEFAULT false,
    "optimizationTips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "potentialSavings" DECIMAL(10,6),

    CONSTRAINT "cost_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_walletId_key" ON "players"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "players_username_key" ON "players"("username");

-- CreateIndex
CREATE INDEX "players_rating_idx" ON "players"("rating" DESC);

-- CreateIndex
CREATE INDEX "players_netPnL_idx" ON "players"("netPnL" DESC);

-- CreateIndex
CREATE INDEX "players_winRate_idx" ON "players"("winRate" DESC);

-- CreateIndex
CREATE INDEX "players_lastActiveAt_idx" ON "players"("lastActiveAt" DESC);

-- CreateIndex
CREATE INDEX "players_gamesPlayed_idx" ON "players"("gamesPlayed" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "games_gameId_key" ON "games"("gameId");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "games_gameType_idx" ON "games"("gameType");

-- CreateIndex
CREATE INDEX "games_createdAt_idx" ON "games"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "games_player1Id_idx" ON "games"("player1Id");

-- CreateIndex
CREATE INDEX "games_player2Id_idx" ON "games"("player2Id");

-- CreateIndex
CREATE INDEX "games_winnerId_idx" ON "games"("winnerId");

-- CreateIndex
CREATE INDEX "games_betAmount_idx" ON "games"("betAmount" DESC);

-- CreateIndex
CREATE INDEX "game_actions_gameId_timestamp_idx" ON "game_actions"("gameId", "timestamp");

-- CreateIndex
CREATE INDEX "game_actions_playerId_idx" ON "game_actions"("playerId");

-- CreateIndex
CREATE INDEX "game_actions_actionType_idx" ON "game_actions"("actionType");

-- CreateIndex
CREATE INDEX "game_actions_roundNumber_idx" ON "game_actions"("roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "proofs_hash_key" ON "proofs"("hash");

-- CreateIndex
CREATE INDEX "proofs_gameId_status_idx" ON "proofs"("gameId", "status");

-- CreateIndex
CREATE INDEX "proofs_playerId_idx" ON "proofs"("playerId");

-- CreateIndex
CREATE INDEX "proofs_proofType_idx" ON "proofs"("proofType");

-- CreateIndex
CREATE INDEX "proofs_status_idx" ON "proofs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_playerId_isActive_idx" ON "sessions"("playerId", "isActive");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_signature_key" ON "transactions"("signature");

-- CreateIndex
CREATE INDEX "transactions_playerId_status_idx" ON "transactions"("playerId", "status");

-- CreateIndex
CREATE INDEX "transactions_signature_idx" ON "transactions"("signature");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_gameId_idx" ON "transactions"("gameId");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "cost_metrics_category_timestamp_idx" ON "cost_metrics"("category", "timestamp");

-- CreateIndex
CREATE INDEX "cost_metrics_playerId_timestamp_idx" ON "cost_metrics"("playerId", "timestamp");

-- CreateIndex
CREATE INDEX "cost_metrics_gameId_idx" ON "cost_metrics"("gameId");

-- CreateIndex
CREATE INDEX "cost_metrics_operation_idx" ON "cost_metrics"("operation");

-- CreateIndex
CREATE INDEX "cost_metrics_costUsd_idx" ON "cost_metrics"("costUsd" DESC);

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_actions" ADD CONSTRAINT "game_actions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_metrics" ADD CONSTRAINT "cost_metrics_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;