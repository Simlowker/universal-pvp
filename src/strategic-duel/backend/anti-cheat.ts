import { EventEmitter } from 'events';
import * as crypto from 'crypto';

interface TimingValidation {
  playerId: string;
  actionType: string;
  timestamp: number;
  clientTime: number;
  serverTime: number;
  latency: number;
  isValid: boolean;
  flags: string[];
}

interface SuspiciousActivity {
  playerId: string;
  type: 'timing' | 'pattern' | 'behavior' | 'technical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: any;
  timestamp: number;
  actionTaken: string;
}

interface PlayerMetrics {
  playerId: string;
  avgDecisionTime: number;
  decisionVariance: number;
  actionFrequency: Record<string, number>;
  suspiciousEvents: number;
  lastActionTime: number;
  connectionStability: number;
  inputPattern: number[];
  clientFingerprint: string;
}

interface AntiCheatRule {
  id: string;
  name: string;
  type: 'timing' | 'pattern' | 'statistical';
  threshold: number;
  action: 'warn' | 'flag' | 'suspend' | 'ban';
  enabled: boolean;
}

interface ValidationResult {
  isValid: boolean;
  confidence: number; // 0-100
  flags: string[];
  riskScore: number; // 0-100
  recommendedAction: 'allow' | 'monitor' | 'investigate' | 'block';
}

export class AntiCheatSystem extends EventEmitter {
  private playerMetrics: Map<string, PlayerMetrics> = new Map();
  private suspiciousActivities: Map<string, SuspiciousActivity[]> = new Map();
  private validationHistory: Map<string, TimingValidation[]> = new Map();
  private antiCheatRules: Map<string, AntiCheatRule> = new Map();
  
  // Timing thresholds (milliseconds)
  private readonly HUMAN_MIN_REACTION = 100;
  private readonly HUMAN_MAX_REACTION = 300;
  private readonly SUSPICIOUS_CONSISTENCY = 50; // +/- ms
  private readonly MAX_DECISION_TIME = 30000; // 30 seconds
  private readonly MIN_DECISION_TIME = 50; // 50ms

  // Pattern detection parameters
  private readonly MAX_ACTIONS_PER_SECOND = 5;
  private readonly UNUSUAL_PATTERN_THRESHOLD = 0.95; // Statistical significance
  private readonly MIN_SAMPLES_FOR_ANALYSIS = 10;

  constructor() {
    super();
    this.initializeRules();
    this.startMonitoring();
  }

  /**
   * Initialize anti-cheat rules
   */
  private initializeRules(): void {
    const rules: AntiCheatRule[] = [
      {
        id: 'superhuman_speed',
        name: 'Superhuman Reaction Speed',
        type: 'timing',
        threshold: this.HUMAN_MIN_REACTION,
        action: 'flag',
        enabled: true
      },
      {
        id: 'impossible_consistency',
        name: 'Impossible Timing Consistency',
        type: 'statistical',
        threshold: this.SUSPICIOUS_CONSISTENCY,
        action: 'investigate',
        enabled: true
      },
      {
        id: 'rapid_fire_actions',
        name: 'Rapid Fire Actions',
        type: 'pattern',
        threshold: this.MAX_ACTIONS_PER_SECOND,
        action: 'warn',
        enabled: true
      },
      {
        id: 'prediction_patterns',
        name: 'Prediction Patterns',
        type: 'statistical',
        threshold: 0.9,
        action: 'investigate',
        enabled: true
      },
      {
        id: 'impossible_latency',
        name: 'Impossible Network Latency',
        type: 'timing',
        threshold: 5, // 5ms minimum realistic latency
        action: 'flag',
        enabled: true
      }
    ];

    for (const rule of rules) {
      this.antiCheatRules.set(rule.id, rule);
    }
  }

  /**
   * Validate player action timing
   */
  public validateActionTiming(
    playerId: string,
    actionType: string,
    clientTimestamp: number,
    serverTimestamp: number,
    contextData?: any
  ): ValidationResult {
    const validation: TimingValidation = {
      playerId,
      actionType,
      timestamp: serverTimestamp,
      clientTime: clientTimestamp,
      serverTime: serverTimestamp,
      latency: Math.abs(serverTimestamp - clientTimestamp),
      isValid: true,
      flags: []
    };

    let riskScore = 0;
    const flags: string[] = [];

    // Calculate decision time (time between receiving game state and making decision)
    const decisionTime = this.calculateDecisionTime(playerId, serverTimestamp);
    
    // Check for superhuman reaction times
    if (decisionTime < this.HUMAN_MIN_REACTION) {
      flags.push('superhuman_speed');
      riskScore += 40;
      validation.isValid = false;
    }

    // Check for impossible latency
    if (validation.latency < 5) {
      flags.push('impossible_latency');
      riskScore += 30;
    }

    // Check for suspiciously consistent timing
    if (this.checkTimingConsistency(playerId, decisionTime)) {
      flags.push('suspicious_consistency');
      riskScore += 25;
    }

    // Check for rapid-fire actions
    if (this.checkRapidActions(playerId, serverTimestamp)) {
      flags.push('rapid_fire');
      riskScore += 20;
    }

    // Check for predictive behavior
    if (this.checkPredictiveBehavior(playerId, actionType, contextData)) {
      flags.push('predictive_behavior');
      riskScore += 35;
    }

    validation.flags = flags;

    // Update player metrics
    this.updatePlayerMetrics(playerId, validation, decisionTime);

    // Record validation
    this.recordValidation(playerId, validation);

    // Determine action based on risk score
    let recommendedAction: ValidationResult['recommendedAction'] = 'allow';
    if (riskScore > 80) recommendedAction = 'block';
    else if (riskScore > 60) recommendedAction = 'investigate';
    else if (riskScore > 30) recommendedAction = 'monitor';

    const result: ValidationResult = {
      isValid: validation.isValid && riskScore < 50,
      confidence: Math.max(0, 100 - riskScore),
      flags,
      riskScore,
      recommendedAction
    };

    // Emit events based on severity
    if (riskScore > 70) {
      this.flagSuspiciousActivity(playerId, 'timing', 'high', 
        `High risk score: ${riskScore}`, { validation, decisionTime });
    } else if (riskScore > 40) {
      this.flagSuspiciousActivity(playerId, 'timing', 'medium',
        `Medium risk score: ${riskScore}`, { validation, decisionTime });
    }

    return result;
  }

  /**
   * Calculate decision time for player
   */
  private calculateDecisionTime(playerId: string, currentTime: number): number {
    const metrics = this.playerMetrics.get(playerId);
    if (!metrics || !metrics.lastActionTime) {
      return 1000; // Default assumption for first action
    }

    return currentTime - metrics.lastActionTime;
  }

  /**
   * Check for suspiciously consistent timing
   */
  private checkTimingConsistency(playerId: string, decisionTime: number): boolean {
    const history = this.validationHistory.get(playerId) || [];
    if (history.length < this.MIN_SAMPLES_FOR_ANALYSIS) return false;

    const recentTimes = history.slice(-10).map(h => 
      h.serverTime - h.timestamp // Decision times
    );

    // Calculate variance
    const mean = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
    const variance = recentTimes.reduce((acc, time) => acc + Math.pow(time - mean, 2), 0) / recentTimes.length;
    const stdDev = Math.sqrt(variance);

    // Flag if standard deviation is suspiciously low (too consistent)
    return stdDev < this.SUSPICIOUS_CONSISTENCY && recentTimes.length >= 5;
  }

  /**
   * Check for rapid-fire actions
   */
  private checkRapidActions(playerId: string, currentTime: number): boolean {
    const history = this.validationHistory.get(playerId) || [];
    const oneSecondAgo = currentTime - 1000;

    const recentActions = history.filter(h => h.timestamp > oneSecondAgo);
    return recentActions.length > this.MAX_ACTIONS_PER_SECOND;
  }

  /**
   * Check for predictive behavior (acting before information is available)
   */
  private checkPredictiveBehavior(playerId: string, actionType: string, contextData: any): boolean {
    if (!contextData) return false;

    // Check if action was made before opponent's move was broadcast
    if (contextData.opponentMoveTime && contextData.actionTime < contextData.opponentMoveTime + 50) {
      return true;
    }

    // Check for patterns that suggest knowledge of future events
    const metrics = this.playerMetrics.get(playerId);
    if (metrics) {
      const actionFreq = metrics.actionFrequency[actionType] || 0;
      const totalActions = Object.values(metrics.actionFrequency).reduce((a, b) => a + b, 0);
      
      // Suspiciously high accuracy in predictions
      if (actionFreq / totalActions > 0.95 && totalActions > 20) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update player metrics
   */
  private updatePlayerMetrics(playerId: string, validation: TimingValidation, decisionTime: number): void {
    let metrics = this.playerMetrics.get(playerId);
    
    if (!metrics) {
      metrics = {
        playerId,
        avgDecisionTime: decisionTime,
        decisionVariance: 0,
        actionFrequency: {},
        suspiciousEvents: 0,
        lastActionTime: validation.timestamp,
        connectionStability: 100,
        inputPattern: [],
        clientFingerprint: this.generateFingerprint(validation)
      };
    }

    // Update average decision time
    const alpha = 0.1; // Learning rate
    metrics.avgDecisionTime = (metrics.avgDecisionTime * (1 - alpha)) + (decisionTime * alpha);

    // Update decision variance
    const variance = Math.pow(decisionTime - metrics.avgDecisionTime, 2);
    metrics.decisionVariance = (metrics.decisionVariance * (1 - alpha)) + (variance * alpha);

    // Update action frequency
    metrics.actionFrequency[validation.actionType] = (metrics.actionFrequency[validation.actionType] || 0) + 1;

    // Update suspicious events counter
    if (validation.flags.length > 0) {
      metrics.suspiciousEvents++;
    }

    // Update connection stability
    if (validation.latency > 1000) {
      metrics.connectionStability = Math.max(0, metrics.connectionStability - 5);
    } else {
      metrics.connectionStability = Math.min(100, metrics.connectionStability + 1);
    }

    // Update input pattern
    metrics.inputPattern.push(decisionTime);
    if (metrics.inputPattern.length > 50) {
      metrics.inputPattern.shift(); // Keep last 50 patterns
    }

    metrics.lastActionTime = validation.timestamp;

    this.playerMetrics.set(playerId, metrics);
  }

  /**
   * Generate client fingerprint
   */
  private generateFingerprint(validation: TimingValidation): string {
    const data = `${validation.latency}:${validation.clientTime}:${validation.serverTime}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 8);
  }

  /**
   * Record validation in history
   */
  private recordValidation(playerId: string, validation: TimingValidation): void {
    let history = this.validationHistory.get(playerId) || [];
    history.push(validation);

    // Keep only last 100 validations
    if (history.length > 100) {
      history = history.slice(-100);
    }

    this.validationHistory.set(playerId, history);
  }

  /**
   * Flag suspicious activity
   */
  private flagSuspiciousActivity(
    playerId: string,
    type: SuspiciousActivity['type'],
    severity: SuspiciousActivity['severity'],
    description: string,
    evidence: any
  ): void {
    const activity: SuspiciousActivity = {
      playerId,
      type,
      severity,
      description,
      evidence,
      timestamp: Date.now(),
      actionTaken: this.determineAction(severity)
    };

    let activities = this.suspiciousActivities.get(playerId) || [];
    activities.push(activity);

    // Keep only last 50 activities per player
    if (activities.length > 50) {
      activities = activities.slice(-50);
    }

    this.suspiciousActivities.set(playerId, activities);

    this.emit('suspiciousActivity', activity);

    // Take automatic action if needed
    this.takeAutomaticAction(playerId, activity);
  }

  /**
   * Determine action based on severity
   */
  private determineAction(severity: SuspiciousActivity['severity']): string {
    switch (severity) {
      case 'low': return 'monitor';
      case 'medium': return 'warn';
      case 'high': return 'investigate';
      case 'critical': return 'suspend';
      default: return 'monitor';
    }
  }

  /**
   * Take automatic action
   */
  private takeAutomaticAction(playerId: string, activity: SuspiciousActivity): void {
    const recentActivities = (this.suspiciousActivities.get(playerId) || [])
      .filter(a => Date.now() - a.timestamp < 300000); // Last 5 minutes

    const highSeverityCount = recentActivities.filter(a => a.severity === 'high' || a.severity === 'critical').length;
    
    if (highSeverityCount >= 3) {
      this.emit('playerSuspended', {
        playerId,
        reason: 'Multiple high-severity anti-cheat violations',
        activities: recentActivities,
        timestamp: Date.now()
      });
    } else if (activity.severity === 'critical') {
      this.emit('immediateAction', {
        playerId,
        action: 'suspend',
        activity,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Validate input sequence
   */
  public validateInputSequence(playerId: string, inputSequence: number[]): ValidationResult {
    const metrics = this.playerMetrics.get(playerId);
    if (!metrics) {
      return { isValid: true, confidence: 50, flags: [], riskScore: 0, recommendedAction: 'allow' };
    }

    let riskScore = 0;
    const flags: string[] = [];

    // Check for impossible input sequences
    for (let i = 1; i < inputSequence.length; i++) {
      const timeDiff = inputSequence[i] - inputSequence[i - 1];
      
      if (timeDiff < 10) { // Less than 10ms between inputs
        flags.push('impossible_input_speed');
        riskScore += 30;
      }
    }

    // Check for repeated patterns (bot behavior)
    const patternScore = this.detectRepeatedPatterns(inputSequence);
    if (patternScore > 0.8) {
      flags.push('repeated_patterns');
      riskScore += 25;
    }

    // Check against known human input patterns
    const humanlikeScore = this.calculateHumanlikeScore(inputSequence);
    if (humanlikeScore < 0.3) {
      flags.push('non_human_patterns');
      riskScore += 40;
    }

    return {
      isValid: riskScore < 50,
      confidence: Math.max(0, 100 - riskScore),
      flags,
      riskScore,
      recommendedAction: riskScore > 70 ? 'block' : riskScore > 40 ? 'investigate' : 'allow'
    };
  }

  /**
   * Detect repeated patterns in input
   */
  private detectRepeatedPatterns(sequence: number[]): number {
    if (sequence.length < 6) return 0;

    let maxRepeats = 0;
    for (let patternLen = 2; patternLen <= Math.floor(sequence.length / 3); patternLen++) {
      let repeats = 1;
      
      for (let i = 0; i <= sequence.length - patternLen * 2; i++) {
        const pattern = sequence.slice(i, i + patternLen);
        const nextPattern = sequence.slice(i + patternLen, i + patternLen * 2);
        
        if (this.arraysEqual(pattern, nextPattern)) {
          repeats++;
        }
      }
      
      maxRepeats = Math.max(maxRepeats, repeats);
    }

    return Math.min(1, maxRepeats / (sequence.length / 3));
  }

  /**
   * Calculate human-like score for input sequence
   */
  private calculateHumanlikeScore(sequence: number[]): number {
    if (sequence.length < 5) return 0.5;

    // Calculate variance in timing
    const intervals = [];
    for (let i = 1; i < sequence.length; i++) {
      intervals.push(sequence[i] - sequence[i - 1]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((acc, interval) => acc + Math.pow(interval - mean, 2), 0) / intervals.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;

    // Human input typically has moderate variance (0.1 to 0.8)
    if (coefficientOfVariation > 0.1 && coefficientOfVariation < 0.8) {
      return 0.8;
    } else if (coefficientOfVariation < 0.05) {
      return 0.1; // Too consistent (bot-like)
    } else {
      return 0.4; // Too erratic
    }
  }

  /**
   * Helper function to compare arrays
   */
  private arraysEqual(a: number[], b: number[]): boolean {
    return a.length === b.length && a.every((val, i) => Math.abs(val - b[i]) < 10);
  }

  /**
   * Get player risk assessment
   */
  public getPlayerRiskAssessment(playerId: string): any {
    const metrics = this.playerMetrics.get(playerId);
    const activities = this.suspiciousActivities.get(playerId) || [];
    const history = this.validationHistory.get(playerId) || [];

    if (!metrics) {
      return { riskLevel: 'unknown', confidence: 0 };
    }

    const recentActivities = activities.filter(a => Date.now() - a.timestamp < 3600000); // Last hour
    const highRiskActivities = recentActivities.filter(a => a.severity === 'high' || a.severity === 'critical');
    
    let riskScore = 0;

    // Factor in suspicious events
    riskScore += Math.min(50, metrics.suspiciousEvents * 2);

    // Factor in recent high-risk activities
    riskScore += Math.min(30, highRiskActivities.length * 10);

    // Factor in connection stability
    riskScore += Math.max(0, 100 - metrics.connectionStability) * 0.2;

    // Factor in timing consistency (too consistent is suspicious)
    const timingConsistency = metrics.decisionVariance < 100 ? 20 : 0;
    riskScore += timingConsistency;

    let riskLevel: string;
    if (riskScore > 70) riskLevel = 'high';
    else if (riskScore > 40) riskLevel = 'medium';
    else if (riskScore > 15) riskLevel = 'low';
    else riskLevel = 'minimal';

    return {
      playerId,
      riskLevel,
      riskScore,
      confidence: Math.min(100, history.length * 2), // Confidence based on data amount
      metrics,
      recentViolations: recentActivities.length,
      recommendations: this.generateRecommendations(riskScore, metrics, recentActivities)
    };
  }

  /**
   * Generate recommendations based on risk assessment
   */
  private generateRecommendations(
    riskScore: number,
    metrics: PlayerMetrics,
    activities: SuspiciousActivity[]
  ): string[] {
    const recommendations: string[] = [];

    if (riskScore > 70) {
      recommendations.push('Consider temporary suspension');
      recommendations.push('Manual review required');
    } else if (riskScore > 40) {
      recommendations.push('Increase monitoring frequency');
      recommendations.push('Flag for manual review');
    }

    if (metrics.suspiciousEvents > 10) {
      recommendations.push('Pattern analysis recommended');
    }

    if (metrics.connectionStability < 50) {
      recommendations.push('Check for network manipulation');
    }

    const timingViolations = activities.filter(a => a.type === 'timing').length;
    if (timingViolations > 5) {
      recommendations.push('Focus on timing analysis');
    }

    return recommendations;
  }

  /**
   * Start monitoring system
   */
  private startMonitoring(): void {
    // Cleanup old data every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 3600000);

    // Generate reports every 15 minutes
    setInterval(() => {
      this.generatePeriodicReport();
    }, 900000);
  }

  /**
   * Cleanup old data
   */
  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    // Clean old validation history
    for (const [playerId, history] of this.validationHistory.entries()) {
      const recentHistory = history.filter(h => h.timestamp > cutoffTime);
      if (recentHistory.length === 0) {
        this.validationHistory.delete(playerId);
      } else {
        this.validationHistory.set(playerId, recentHistory);
      }
    }

    // Clean old suspicious activities
    for (const [playerId, activities] of this.suspiciousActivities.entries()) {
      const recentActivities = activities.filter(a => a.timestamp > cutoffTime);
      if (recentActivities.length === 0) {
        this.suspiciousActivities.delete(playerId);
      } else {
        this.suspiciousActivities.set(playerId, recentActivities);
      }
    }

    this.emit('dataCleanup', {
      remainingPlayers: this.playerMetrics.size,
      remainingValidations: this.validationHistory.size,
      remainingActivities: this.suspiciousActivities.size
    });
  }

  /**
   * Generate periodic report
   */
  private generatePeriodicReport(): void {
    const totalPlayers = this.playerMetrics.size;
    const totalValidations = Array.from(this.validationHistory.values()).reduce((sum, h) => sum + h.length, 0);
    const totalActivities = Array.from(this.suspiciousActivities.values()).reduce((sum, a) => sum + a.length, 0);
    
    const highRiskPlayers = Array.from(this.playerMetrics.keys()).filter(playerId => {
      const assessment = this.getPlayerRiskAssessment(playerId);
      return assessment.riskLevel === 'high';
    });

    this.emit('periodicReport', {
      timestamp: Date.now(),
      totalPlayers,
      totalValidations,
      totalActivities,
      highRiskPlayers: highRiskPlayers.length,
      systemHealth: this.calculateSystemHealth()
    });
  }

  /**
   * Calculate system health score
   */
  private calculateSystemHealth(): number {
    const totalValidations = Array.from(this.validationHistory.values()).reduce((sum, h) => sum + h.length, 0);
    const totalFlags = Array.from(this.validationHistory.values()).reduce((sum, h) => 
      sum + h.reduce((flagSum, v) => flagSum + v.flags.length, 0), 0);
    
    const flagRate = totalValidations > 0 ? (totalFlags / totalValidations) * 100 : 0;
    
    // Health decreases as flag rate increases
    return Math.max(0, 100 - flagRate * 2);
  }

  /**
   * Get system statistics
   */
  public getSystemStats(): any {
    return {
      totalPlayers: this.playerMetrics.size,
      activeRules: Array.from(this.antiCheatRules.values()).filter(r => r.enabled).length,
      totalValidations: Array.from(this.validationHistory.values()).reduce((sum, h) => sum + h.length, 0),
      totalSuspiciousActivities: Array.from(this.suspiciousActivities.values()).reduce((sum, a) => sum + a.length, 0),
      systemHealth: this.calculateSystemHealth()
    };
  }
}