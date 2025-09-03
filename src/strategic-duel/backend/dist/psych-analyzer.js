"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PsychologicalAnalyzer = void 0;
const events_1 = require("events");
class PsychologicalAnalyzer extends events_1.EventEmitter {
    constructor() {
        super();
        this.playerProfiles = new Map();
        this.gameSessions = new Map();
        this.timingPatterns = new Map();
        this.behavioralTells = new Map();
        // Timing thresholds for different decision types (milliseconds)
        this.TIMING_THRESHOLDS = {
            INSTANT: 500, // Very fast decision
            QUICK: 2000, // Quick decision
            NORMAL: 5000, // Normal thinking time
            SLOW: 10000, // Deliberate thinking
            VERY_SLOW: 20000 // Unusually long thinking
        };
    }
    /**
     * Initialize player psychological profile
     */
    initializePlayerProfile(playerId) {
        const profile = {
            playerId,
            aggressionIndex: 50,
            bluffTendency: 50,
            riskTolerance: 50,
            decisionSpeed: 50,
            consistencyScore: 50,
            pressureResponse: 50,
            adaptabilityIndex: 50,
            confidenceLevel: 50,
            lastUpdated: Date.now(),
            gamesAnalyzed: 0
        };
        this.playerProfiles.set(playerId, profile);
        return profile;
    }
    /**
     * Start analyzing a new game session
     */
    startGameSession(sessionId, playerId) {
        const session = {
            sessionId,
            playerId,
            actions: [],
            startTime: Date.now(),
            outcome: null
        };
        this.gameSessions.set(sessionId, session);
        return session;
    }
    /**
     * Record a player action for psychological analysis
     */
    recordAction(sessionId, action) {
        const session = this.gameSessions.get(sessionId);
        if (!session) {
            throw new Error('Game session not found');
        }
        session.actions.push(action);
        // Real-time analysis for immediate tells
        this.analyzeRealtimeTells(session.playerId, action);
        this.emit('actionRecorded', {
            sessionId,
            playerId: session.playerId,
            action,
            immediateAnalysis: this.getImmediateAnalysis(action)
        });
    }
    /**
     * Analyze real-time psychological tells
     */
    analyzeRealtimeTells(playerId, action) {
        const tells = [];
        // Timing-based tells
        if (action.decisionTime < this.TIMING_THRESHOLDS.INSTANT) {
            tells.push({
                type: 'timing',
                indicator: 'instant_decision',
                confidence: 85,
                description: 'Instant decision may indicate strong hand or predetermined bluff',
                frequency: this.calculateTellFrequency(playerId, 'instant_decision'),
                reliability: 75
            });
        }
        if (action.decisionTime > this.TIMING_THRESHOLDS.VERY_SLOW && action.type === 'call') {
            tells.push({
                type: 'timing',
                indicator: 'slow_call',
                confidence: 70,
                description: 'Extended thinking before calling often indicates marginal hand',
                frequency: this.calculateTellFrequency(playerId, 'slow_call'),
                reliability: 80
            });
        }
        // Betting pattern tells
        if (action.type === 'raise' && action.amount > action.contextData.potSize * 1.5) {
            tells.push({
                type: 'pattern',
                indicator: 'overbet',
                confidence: 65,
                description: 'Large overbet may indicate bluff or very strong hand',
                frequency: this.calculateTellFrequency(playerId, 'overbet'),
                reliability: 60
            });
        }
        // Confidence vs action mismatch
        if (action.confidence && action.type === 'fold' && action.confidence > 70) {
            tells.push({
                type: 'behavioral',
                indicator: 'confident_fold',
                confidence: 90,
                description: 'High confidence reported while folding - possible misdirection',
                frequency: this.calculateTellFrequency(playerId, 'confident_fold'),
                reliability: 85
            });
        }
        // Store tells for this player
        if (tells.length > 0) {
            const existingTells = this.behavioralTells.get(playerId) || [];
            this.behavioralTells.set(playerId, [...existingTells, ...tells]);
            this.emit('tellsDetected', {
                playerId,
                tells,
                timestamp: Date.now()
            });
        }
    }
    /**
     * Get immediate analysis of an action
     */
    getImmediateAnalysis(action) {
        const analysis = {
            decisionSpeedCategory: this.categorizeDecisionSpeed(action.decisionTime),
            riskLevel: this.calculateRiskLevel(action),
            suspiciousPatterns: []
        };
        // Check for suspicious patterns
        if (action.decisionTime < 100) {
            analysis.suspiciousPatterns.push('extremely_fast_decision');
        }
        if (action.type === 'raise' && action.decisionTime < this.TIMING_THRESHOLDS.INSTANT) {
            analysis.suspiciousPatterns.push('instant_aggressive_action');
        }
        return analysis;
    }
    /**
     * Categorize decision speed
     */
    categorizeDecisionSpeed(decisionTime) {
        if (decisionTime < this.TIMING_THRESHOLDS.INSTANT)
            return 'instant';
        if (decisionTime < this.TIMING_THRESHOLDS.QUICK)
            return 'quick';
        if (decisionTime < this.TIMING_THRESHOLDS.NORMAL)
            return 'normal';
        if (decisionTime < this.TIMING_THRESHOLDS.SLOW)
            return 'slow';
        return 'very_slow';
    }
    /**
     * Calculate risk level of an action
     */
    calculateRiskLevel(action) {
        const potRatio = action.amount / (action.contextData.potSize || 1);
        if (action.type === 'fold')
            return 'low';
        if (action.type === 'check' || action.type === 'call')
            return 'low';
        if (potRatio < 0.5)
            return 'low';
        if (potRatio < 1.5)
            return 'medium';
        return 'high';
    }
    /**
     * End game session and perform comprehensive analysis
     */
    endGameSession(sessionId, outcome) {
        const session = this.gameSessions.get(sessionId);
        if (!session) {
            throw new Error('Game session not found');
        }
        session.endTime = Date.now();
        session.outcome = outcome;
        // Perform comprehensive analysis
        const analysis = this.performComprehensiveAnalysis(session);
        // Update player profile
        this.updatePlayerProfile(session.playerId, session, analysis);
        this.emit('sessionAnalyzed', {
            sessionId,
            playerId: session.playerId,
            analysis,
            outcome
        });
        return analysis;
    }
    /**
     * Perform comprehensive behavioral analysis
     */
    performComprehensiveAnalysis(session) {
        const actions = session.actions;
        const playerId = session.playerId;
        // Analyze timing patterns
        const fastDecisions = actions.filter(a => a.decisionTime < this.TIMING_THRESHOLDS.QUICK);
        const slowDecisions = actions.filter(a => a.decisionTime > this.TIMING_THRESHOLDS.SLOW);
        const inconsistentTiming = this.findInconsistentTiming(actions);
        // Calculate risk profile
        const totalActions = actions.length;
        const lowRiskActions = actions.filter(a => this.calculateRiskLevel(a) === 'low').length;
        const mediumRiskActions = actions.filter(a => this.calculateRiskLevel(a) === 'medium').length;
        const highRiskActions = actions.filter(a => this.calculateRiskLevel(a) === 'high').length;
        const riskProfile = {
            lowRisk: (lowRiskActions / totalActions) * 100,
            mediumRisk: (mediumRiskActions / totalActions) * 100,
            highRisk: (highRiskActions / totalActions) * 100
        };
        // Calculate adaptation rate
        const adaptationRate = this.calculateAdaptationRate(actions);
        // Calculate exploitability
        const exploitability = this.calculateExploitability(actions);
        // Get all tells for this player
        const tells = this.behavioralTells.get(playerId) || [];
        return {
            playerId,
            sessionId: session.sessionId,
            patterns: {
                fastDecisions: this.createTimingPatterns(fastDecisions),
                slowDecisions: this.createTimingPatterns(slowDecisions),
                inconsistentTiming: this.createTimingPatterns(inconsistentTiming)
            },
            tells: tells.slice(-10), // Last 10 tells
            riskProfile,
            adaptationRate,
            exploitability
        };
    }
    /**
     * Find inconsistent timing patterns
     */
    findInconsistentTiming(actions) {
        const inconsistent = [];
        // Group actions by type
        const actionsByType = actions.reduce((acc, action) => {
            if (!acc[action.type])
                acc[action.type] = [];
            acc[action.type].push(action);
            return acc;
        }, {});
        // Check for inconsistency within each action type
        for (const [actionType, actionList] of Object.entries(actionsByType)) {
            if (actionList.length < 3)
                continue; // Need at least 3 samples
            const times = actionList.map(a => a.decisionTime);
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const variance = this.calculateVariance(times);
            // If variance is high, mark as inconsistent
            if (variance > avgTime * 0.8) {
                inconsistent.push(...actionList);
            }
        }
        return inconsistent;
    }
    /**
     * Create timing patterns from actions
     */
    createTimingPatterns(actions) {
        const patterns = [];
        // Group by action type and context
        const grouped = actions.reduce((acc, action) => {
            const key = `${action.type}_${action.contextData.gamePhase}_${this.categorizeAmount(action.amount, action.contextData.potSize)}`;
            if (!acc[key])
                acc[key] = [];
            acc[key].push(action);
            return acc;
        }, {});
        for (const [key, actionList] of Object.entries(grouped)) {
            if (actionList.length < 2)
                continue;
            const times = actionList.map(a => a.decisionTime);
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const variance = this.calculateVariance(times);
            const [actionType, gamePhase, betSizeCategory] = key.split('_');
            patterns.push({
                action: actionType,
                averageTime: avgTime,
                variance,
                contextFactors: {
                    betSize: betSizeCategory,
                    gamePhase: gamePhase,
                    position: actionList[0].contextData.playerPosition
                }
            });
        }
        return patterns;
    }
    /**
     * Categorize bet amount relative to pot size
     */
    categorizeAmount(amount, potSize) {
        const ratio = amount / (potSize || 1);
        if (ratio < 0.3)
            return 'small';
        if (ratio < 1.0)
            return 'medium';
        return 'large';
    }
    /**
     * Calculate adaptation rate
     */
    calculateAdaptationRate(actions) {
        if (actions.length < 10)
            return 50; // Not enough data
        // Split actions into early and late game
        const midPoint = Math.floor(actions.length / 2);
        const earlyActions = actions.slice(0, midPoint);
        const lateActions = actions.slice(midPoint);
        // Calculate average aggression in each phase
        const earlyAggression = this.calculateAggression(earlyActions);
        const lateAggression = this.calculateAggression(lateActions);
        // Adaptation is measured by how much the player changed their play style
        const adaptationMagnitude = Math.abs(lateAggression - earlyAggression);
        // Convert to 0-100 scale
        return Math.min(adaptationMagnitude * 2, 100);
    }
    /**
     * Calculate aggression level from actions
     */
    calculateAggression(actions) {
        if (actions.length === 0)
            return 0;
        const aggressiveActions = actions.filter(a => a.type === 'raise' || a.type === 'bet');
        const passiveActions = actions.filter(a => a.type === 'call' || a.type === 'check');
        const aggressionRatio = aggressiveActions.length / actions.length;
        return aggressionRatio * 100;
    }
    /**
     * Calculate exploitability score
     */
    calculateExploitability(actions) {
        if (actions.length < 5)
            return 50;
        let predictabilityScore = 0;
        let patterns = 0;
        // Check for predictable timing patterns
        const timingConsistency = this.calculateTimingConsistency(actions);
        predictabilityScore += timingConsistency * 0.4;
        // Check for betting pattern consistency
        const bettingConsistency = this.calculateBettingConsistency(actions);
        predictabilityScore += bettingConsistency * 0.4;
        // Check for positional play consistency
        const positionalConsistency = this.calculatePositionalConsistency(actions);
        predictabilityScore += positionalConsistency * 0.2;
        return Math.min(predictabilityScore, 100);
    }
    /**
     * Calculate timing consistency
     */
    calculateTimingConsistency(actions) {
        const actionsByType = actions.reduce((acc, action) => {
            if (!acc[action.type])
                acc[action.type] = [];
            acc[action.type].push(action.decisionTime);
            return acc;
        }, {});
        let totalConsistency = 0;
        let typeCount = 0;
        for (const times of Object.values(actionsByType)) {
            if (times.length < 2)
                continue;
            const variance = this.calculateVariance(times);
            const mean = times.reduce((a, b) => a + b, 0) / times.length;
            const coefficientOfVariation = variance / mean;
            // Lower coefficient of variation = higher consistency
            const consistency = Math.max(0, 100 - (coefficientOfVariation * 50));
            totalConsistency += consistency;
            typeCount++;
        }
        return typeCount > 0 ? totalConsistency / typeCount : 50;
    }
    /**
     * Calculate betting consistency
     */
    calculateBettingConsistency(actions) {
        const bettingActions = actions.filter(a => a.amount > 0);
        if (bettingActions.length < 3)
            return 50;
        const amounts = bettingActions.map(a => a.amount);
        const variance = this.calculateVariance(amounts);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const coefficientOfVariation = variance / mean;
        return Math.max(0, 100 - (coefficientOfVariation * 30));
    }
    /**
     * Calculate positional consistency
     */
    calculatePositionalConsistency(actions) {
        // Group actions by position
        const positionGroups = actions.reduce((acc, action) => {
            const pos = action.contextData.playerPosition;
            if (!acc[pos])
                acc[pos] = [];
            acc[pos].push(action);
            return acc;
        }, {});
        let totalConsistency = 0;
        let positionCount = 0;
        for (const [position, posActions] of Object.entries(positionGroups)) {
            if (posActions.length < 2)
                continue;
            // Calculate consistency of play in this position
            const aggressionLevels = posActions.map(a => a.type === 'raise' || a.type === 'bet' ? 1 : 0);
            const avgAggression = aggressionLevels.reduce((a, b) => a + b, 0) / aggressionLevels.length;
            const variance = this.calculateVariance(aggressionLevels);
            const consistency = Math.max(0, 100 - (variance * 100));
            totalConsistency += consistency;
            positionCount++;
        }
        return positionCount > 0 ? totalConsistency / positionCount : 50;
    }
    /**
     * Update player psychological profile
     */
    updatePlayerProfile(playerId, session, analysis) {
        let profile = this.playerProfiles.get(playerId);
        if (!profile) {
            profile = this.initializePlayerProfile(playerId);
        }
        const weight = Math.min(0.3, 1 / Math.sqrt(profile.gamesAnalyzed + 1)); // Decreasing weight as more games analyzed
        // Update aggression index
        const sessionAggression = this.calculateAggression(session.actions);
        profile.aggressionIndex = (profile.aggressionIndex * (1 - weight)) + (sessionAggression * weight);
        // Update decision speed
        const avgDecisionTime = session.actions.reduce((sum, a) => sum + a.decisionTime, 0) / session.actions.length;
        const speedScore = Math.max(0, 100 - (avgDecisionTime / 100)); // Convert to 0-100 scale
        profile.decisionSpeed = (profile.decisionSpeed * (1 - weight)) + (speedScore * weight);
        // Update consistency score
        profile.consistencyScore = (profile.consistencyScore * (1 - weight)) + ((100 - analysis.exploitability) * weight);
        // Update adaptability
        profile.adaptabilityIndex = (profile.adaptabilityIndex * (1 - weight)) + (analysis.adaptationRate * weight);
        // Update risk tolerance
        const riskScore = (analysis.riskProfile.lowRisk * 0.2) + (analysis.riskProfile.mediumRisk * 0.6) + (analysis.riskProfile.highRisk * 1.0);
        profile.riskTolerance = (profile.riskTolerance * (1 - weight)) + (riskScore * weight);
        // Update games analyzed counter
        profile.gamesAnalyzed++;
        profile.lastUpdated = Date.now();
        this.playerProfiles.set(playerId, profile);
        this.emit('profileUpdated', {
            playerId,
            profile,
            changesApplied: {
                aggression: sessionAggression,
                decisionSpeed: speedScore,
                consistency: 100 - analysis.exploitability,
                adaptability: analysis.adaptationRate,
                riskTolerance: riskScore
            }
        });
    }
    /**
     * Calculate variance of an array of numbers
     */
    calculateVariance(values) {
        if (values.length === 0)
            return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }
    /**
     * Calculate frequency of a specific tell for a player
     */
    calculateTellFrequency(playerId, tellType) {
        const playerTells = this.behavioralTells.get(playerId) || [];
        const specificTells = playerTells.filter(tell => tell.indicator === tellType);
        const totalTells = playerTells.length;
        return totalTells > 0 ? (specificTells.length / totalTells) * 100 : 0;
    }
    /**
     * Get player's psychological profile
     */
    getPlayerProfile(playerId) {
        return this.playerProfiles.get(playerId);
    }
    /**
     * Get recent tells for a player
     */
    getPlayerTells(playerId, limit = 10) {
        const tells = this.behavioralTells.get(playerId) || [];
        return tells.slice(-limit);
    }
    /**
     * Get comparative analysis between two players
     */
    getComparativeAnalysis(playerId1, playerId2) {
        const profile1 = this.playerProfiles.get(playerId1);
        const profile2 = this.playerProfiles.get(playerId2);
        if (!profile1 || !profile2) {
            throw new Error('One or both player profiles not found');
        }
        return {
            aggressionComparison: {
                player1: profile1.aggressionIndex,
                player2: profile2.aggressionIndex,
                difference: profile1.aggressionIndex - profile2.aggressionIndex,
                advantage: profile1.aggressionIndex > profile2.aggressionIndex ? playerId1 : playerId2
            },
            speedComparison: {
                player1: profile1.decisionSpeed,
                player2: profile2.decisionSpeed,
                difference: profile1.decisionSpeed - profile2.decisionSpeed,
                advantage: profile1.decisionSpeed > profile2.decisionSpeed ? playerId1 : playerId2
            },
            adaptabilityComparison: {
                player1: profile1.adaptabilityIndex,
                player2: profile2.adaptabilityIndex,
                difference: profile1.adaptabilityIndex - profile2.adaptabilityIndex,
                advantage: profile1.adaptabilityIndex > profile2.adaptabilityIndex ? playerId1 : playerId2
            },
            exploitabilityAnalysis: {
                moreExploitable: profile1.consistencyScore < profile2.consistencyScore ? playerId1 : playerId2,
                consistencyGap: Math.abs(profile1.consistencyScore - profile2.consistencyScore)
            }
        };
    }
}
exports.PsychologicalAnalyzer = PsychologicalAnalyzer;
