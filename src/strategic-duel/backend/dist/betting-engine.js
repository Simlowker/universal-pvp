"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BettingEngine = void 0;
const events_1 = require("events");
class BettingEngine extends events_1.EventEmitter {
    constructor() {
        super();
        this.activePools = new Map();
        this.betHistory = new Map();
        this.playerBalances = new Map();
        this.MIN_BET = 0.001; // SOL
        this.MAX_BET = 10; // SOL
        this.HOUSE_EDGE = 2.5; // 2.5%
    }
    /**
     * Create a new betting pool for a match
     */
    createBettingPool(matchId, players, initialBets) {
        if (players.length !== 2 || initialBets.length !== 2) {
            throw new Error('Strategic Duel requires exactly 2 players');
        }
        if (initialBets.some(bet => bet < this.MIN_BET || bet > this.MAX_BET)) {
            throw new Error(`Bet must be between ${this.MIN_BET} and ${this.MAX_BET} SOL`);
        }
        const poolId = `pool_${matchId}_${Date.now()}`;
        const totalPool = initialBets.reduce((sum, bet) => sum + bet, 0);
        const pool = {
            id: poolId,
            matchId,
            players: players.map((player, index) => ({
                playerId: player.playerId,
                wallet: player.wallet,
                initialBet: initialBets[index],
                currentPosition: initialBets[index],
                totalWagered: initialBets[index],
                isActive: true
            })),
            totalPool,
            houseEdge: this.HOUSE_EDGE,
            currentRound: 1,
            status: 'waiting',
            createdAt: Date.now(),
            finalOdds: {}
        };
        this.activePools.set(poolId, pool);
        this.betHistory.set(matchId, []);
        this.emit('poolCreated', {
            poolId,
            matchId,
            players: pool.players,
            totalPool: pool.totalPool
        });
        return pool;
    }
    /**
     * Process a betting action
     */
    processBet(betAction) {
        const pool = this.getPoolByMatchId(betAction.matchId);
        if (!pool) {
            throw new Error('Betting pool not found');
        }
        if (pool.status !== 'active') {
            throw new Error('Betting pool is not active');
        }
        const player = pool.players.find(p => p.playerId === betAction.playerId);
        if (!player) {
            throw new Error('Player not found in pool');
        }
        if (!player.isActive) {
            throw new Error('Player is not active in this pool');
        }
        // Validate bet amount
        if (betAction.amount < 0) {
            throw new Error('Invalid bet amount');
        }
        // Check player balance (mock - in real implementation, check blockchain)
        const playerBalance = this.getPlayerBalance(betAction.playerId);
        if (playerBalance < betAction.amount) {
            throw new Error('Insufficient balance');
        }
        // Process the betting action
        switch (betAction.type) {
            case 'raise':
                return this.processRaise(pool, player, betAction);
            case 'call':
                return this.processCall(pool, player, betAction);
            case 'fold':
                return this.processFold(pool, player, betAction);
            case 'all-in':
                return this.processAllIn(pool, player, betAction);
            default:
                throw new Error('Unknown betting action type');
        }
    }
    /**
     * Process a raise action
     */
    processRaise(pool, player, betAction) {
        const opponent = pool.players.find(p => p.playerId !== player.playerId);
        if (!opponent)
            return false;
        // Validate raise amount
        const currentHighest = Math.max(player.currentPosition, opponent.currentPosition);
        const minRaise = Math.max(this.MIN_BET, currentHighest * 1.5); // At least 50% increase
        if (betAction.amount < minRaise) {
            throw new Error(`Minimum raise is ${minRaise} SOL`);
        }
        // Update player position
        player.currentPosition = betAction.amount;
        player.totalWagered += betAction.amount;
        pool.totalPool += betAction.amount;
        // Record action
        this.recordBetAction(betAction);
        // Update odds
        this.updateOdds(pool);
        this.emit('betProcessed', {
            poolId: pool.id,
            action: betAction,
            newTotalPool: pool.totalPool,
            playerPosition: player.currentPosition
        });
        return true;
    }
    /**
     * Process a call action
     */
    processCall(pool, player, betAction) {
        const opponent = pool.players.find(p => p.playerId !== player.playerId);
        if (!opponent)
            return false;
        const callAmount = Math.max(0, opponent.currentPosition - player.currentPosition);
        if (betAction.amount < callAmount) {
            throw new Error(`Must call ${callAmount} SOL to match opponent`);
        }
        player.currentPosition += callAmount;
        player.totalWagered += callAmount;
        pool.totalPool += callAmount;
        this.recordBetAction(betAction);
        this.updateOdds(pool);
        this.emit('betProcessed', {
            poolId: pool.id,
            action: betAction,
            newTotalPool: pool.totalPool,
            playerPosition: player.currentPosition
        });
        // Check if round is complete (both players have equal positions)
        if (player.currentPosition === opponent.currentPosition) {
            pool.currentRound++;
            this.emit('roundComplete', {
                poolId: pool.id,
                round: pool.currentRound - 1,
                totalPool: pool.totalPool
            });
        }
        return true;
    }
    /**
     * Process a fold action
     */
    processFold(pool, player, betAction) {
        player.isActive = false;
        this.recordBetAction(betAction);
        // Opponent wins by default
        const opponent = pool.players.find(p => p.playerId !== player.playerId);
        if (opponent) {
            this.resolvePool(pool.id, opponent.playerId, 'fold');
        }
        this.emit('betProcessed', {
            poolId: pool.id,
            action: betAction,
            winner: opponent?.playerId,
            reason: 'opponent folded'
        });
        return true;
    }
    /**
     * Process an all-in action
     */
    processAllIn(pool, player, betAction) {
        const playerBalance = this.getPlayerBalance(betAction.playerId);
        const allInAmount = Math.min(betAction.amount, playerBalance);
        player.currentPosition += allInAmount;
        player.totalWagered += allInAmount;
        pool.totalPool += allInAmount;
        this.recordBetAction({
            ...betAction,
            amount: allInAmount
        });
        this.updateOdds(pool);
        this.emit('betProcessed', {
            poolId: pool.id,
            action: { ...betAction, amount: allInAmount },
            newTotalPool: pool.totalPool,
            playerPosition: player.currentPosition,
            allIn: true
        });
        return true;
    }
    /**
     * Calculate current odds for all players
     */
    calculateOdds(pool) {
        const totalPool = pool.totalPool;
        const houseAmount = totalPool * (pool.houseEdge / 100);
        const payoutPool = totalPool - houseAmount;
        return pool.players.map(player => {
            // Simple implied probability based on current position
            const playerShare = player.currentPosition / totalPool;
            const impliedProbability = playerShare * 100;
            // Calculate decimal odds
            const decimalOdds = payoutPool / player.currentPosition;
            // Potential payout
            const potentialPayout = player.currentPosition * decimalOdds;
            return {
                playerId: player.playerId,
                impliedProbability,
                decimalOdds: Math.round(decimalOdds * 100) / 100,
                potentialPayout: Math.round(potentialPayout * 1000) / 1000,
                currentRisk: player.totalWagered
            };
        });
    }
    /**
     * Update odds for a pool
     */
    updateOdds(pool) {
        const odds = this.calculateOdds(pool);
        // Store final odds
        pool.finalOdds = {};
        for (const odd of odds) {
            pool.finalOdds[odd.playerId] = odd.decimalOdds;
        }
        this.emit('oddsUpdated', {
            poolId: pool.id,
            odds
        });
    }
    /**
     * Resolve a betting pool with winner
     */
    resolvePool(poolId, winnerId, reason) {
        const pool = this.activePools.get(poolId);
        if (!pool) {
            throw new Error('Pool not found');
        }
        if (pool.status === 'resolved') {
            throw new Error('Pool already resolved');
        }
        const winner = pool.players.find(p => p.playerId === winnerId);
        if (!winner) {
            throw new Error('Winner not found in pool');
        }
        // Calculate final payouts
        const totalPool = pool.totalPool;
        const houseAmount = totalPool * (pool.houseEdge / 100);
        const winnerPayout = totalPool - houseAmount;
        // Update pool status
        pool.status = 'resolved';
        pool.winner = winnerId;
        pool.resolvedAt = Date.now();
        // Update player balances (mock - in real implementation, execute blockchain transaction)
        this.updatePlayerBalance(winnerId, winnerPayout);
        this.emit('poolResolved', {
            poolId,
            winnerId,
            winnerPayout,
            totalPool,
            houseAmount,
            reason
        });
        // Clean up
        setTimeout(() => {
            this.activePools.delete(poolId);
        }, 300000); // Keep for 5 minutes for queries
        return true;
    }
    /**
     * Cancel a betting pool (refund players)
     */
    cancelPool(poolId, reason) {
        const pool = this.activePools.get(poolId);
        if (!pool) {
            throw new Error('Pool not found');
        }
        pool.status = 'cancelled';
        // Refund players
        for (const player of pool.players) {
            this.updatePlayerBalance(player.playerId, player.totalWagered);
        }
        this.emit('poolCancelled', {
            poolId,
            reason,
            refunds: pool.players.map(p => ({
                playerId: p.playerId,
                amount: p.totalWagered
            }))
        });
        return true;
    }
    /**
     * Get pool by match ID
     */
    getPoolByMatchId(matchId) {
        for (const pool of this.activePools.values()) {
            if (pool.matchId === matchId) {
                return pool;
            }
        }
        return undefined;
    }
    /**
     * Record betting action in history
     */
    recordBetAction(action) {
        const history = this.betHistory.get(action.matchId) || [];
        history.push(action);
        this.betHistory.set(action.matchId, history);
    }
    /**
     * Get player balance (mock implementation)
     */
    getPlayerBalance(playerId) {
        return this.playerBalances.get(playerId) || 1.0; // Default 1 SOL
    }
    /**
     * Update player balance (mock implementation)
     */
    updatePlayerBalance(playerId, amount) {
        const currentBalance = this.getPlayerBalance(playerId);
        this.playerBalances.set(playerId, currentBalance + amount);
    }
    /**
     * Get betting analytics for a match
     */
    getMatchAnalytics(matchId) {
        const pool = this.getPoolByMatchId(matchId);
        const history = this.betHistory.get(matchId) || [];
        if (!pool)
            return null;
        const totalVolume = pool.totalPool;
        const betAmounts = history.map(h => h.amount);
        const averageBet = betAmounts.length > 0
            ? betAmounts.reduce((a, b) => a + b, 0) / betAmounts.length
            : 0;
        const largestBet = Math.max(...betAmounts, 0);
        // Count player actions
        const playerActions = {};
        for (const action of history) {
            playerActions[action.playerId] = (playerActions[action.playerId] || 0) + 1;
        }
        // Risk distribution
        const riskDistribution = {
            low: history.filter(h => h.amount < totalVolume * 0.1).length,
            medium: history.filter(h => h.amount >= totalVolume * 0.1 && h.amount < totalVolume * 0.3).length,
            high: history.filter(h => h.amount >= totalVolume * 0.3).length
        };
        return {
            totalVolume,
            averageBet,
            largestBet,
            activeRounds: pool.currentRound,
            playerActions,
            riskDistribution
        };
    }
    /**
     * Get current odds for a match
     */
    getCurrentOdds(matchId) {
        const pool = this.getPoolByMatchId(matchId);
        if (!pool) {
            throw new Error('Pool not found');
        }
        return this.calculateOdds(pool);
    }
    /**
     * Get pool information
     */
    getPool(poolId) {
        return this.activePools.get(poolId);
    }
    /**
     * Get all active pools
     */
    getActivePools() {
        return Array.from(this.activePools.values()).filter(pool => pool.status === 'active');
    }
    /**
     * Get betting history for a match
     */
    getBettingHistory(matchId) {
        return this.betHistory.get(matchId) || [];
    }
    /**
     * Activate a pool (start betting)
     */
    activatePool(poolId) {
        const pool = this.activePools.get(poolId);
        if (!pool)
            return false;
        pool.status = 'active';
        this.updateOdds(pool);
        this.emit('poolActivated', {
            poolId,
            matchId: pool.matchId,
            totalPool: pool.totalPool
        });
        return true;
    }
}
exports.BettingEngine = BettingEngine;
