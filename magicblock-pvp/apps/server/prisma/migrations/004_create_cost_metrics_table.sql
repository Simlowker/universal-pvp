-- CreateEnum for cost categories
CREATE TYPE "CostCategory" AS ENUM ('TRANSACTION_FEE', 'COMPUTE_COST', 'INFRASTRUCTURE', 'STORAGE', 'NETWORK_FEE');

-- CreateTable for cost metrics
CREATE TABLE "cost_metrics" (
    "id" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "operation" TEXT NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "solana_fees" DECIMAL(10,6),
    "compute_units" BIGINT,
    "execution_time" INTEGER,
    "metadata" JSONB,
    "game_id" TEXT,
    "player_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for efficient queries
CREATE INDEX "cost_metrics_timestamp_idx" ON "cost_metrics"("timestamp");
CREATE INDEX "cost_metrics_category_idx" ON "cost_metrics"("category");
CREATE INDEX "cost_metrics_operation_idx" ON "cost_metrics"("operation");
CREATE INDEX "cost_metrics_game_id_idx" ON "cost_metrics"("game_id");
CREATE INDEX "cost_metrics_player_id_idx" ON "cost_metrics"("player_id");
CREATE INDEX "cost_metrics_category_timestamp_idx" ON "cost_metrics"("category", "timestamp");
CREATE INDEX "cost_metrics_operation_timestamp_idx" ON "cost_metrics"("operation", "timestamp");

-- Add foreign key constraints if games and players tables exist
-- ALTER TABLE "cost_metrics" ADD CONSTRAINT "cost_metrics_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- ALTER TABLE "cost_metrics" ADD CONSTRAINT "cost_metrics_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;