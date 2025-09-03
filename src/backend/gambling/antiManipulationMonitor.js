const { logger } = require('../utils/logger');
const { redis } = require('../utils/redis');

/**
 * Anti-Manipulation Monitoring System
 * Detects and prevents various forms of gambling manipulation and fraud
 */
class AntiManipulationMonitor {
  constructor() {
    this.suspiciousActivities = new Map();
    this.bannedWallets = new Set();
    this.monitoringRules = new Map();
    this.alertThresholds = {
      rapidBetting: 10, // bets per minute
      largeWagerIncrease: 5.0, // 5x increase threshold
      coordinatedBetting: 3, // minimum coordinated wallets
      oddsBias: 0.8, // 80% of bets on one outcome
      withdrawalDelay: 3600000, // 1 hour delay for suspicious accounts
      maxSimilarBets: 5, // max identical bet patterns
      accountAgeThreshold: 86400000 // 1 day minimum account age
    };
    
    this.patterns = {
      RAPID_BETTING: 'rapid_betting',
      COORDINATED_BETTING: 'coordinated_betting',
      WASH_TRADING: 'wash_trading',
      INSIDE_INFORMATION: 'inside_information',
      OUTCOME_MANIPULATION: 'outcome_manipulation',
      ACCOUNT_FARMING: 'account_farming',
      BOT_ACTIVITY: 'bot_activity'
    };
    
    // Initialize monitoring
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring rules and background processes
   */
  initializeMonitoring() {
    // Set up monitoring rules
    this.setupMonitoringRules();
    
    // Start background monitoring processes
    this.startRealTimeMonitoring();
    
    // Load existing suspicious activities
    this.loadSuspiciousActivities();
    
    logger.info('Anti-manipulation monitoring system initialized');
  }

  /**
   * Setup comprehensive monitoring rules
   */
  setupMonitoringRules() {
    // Rapid betting detection
    this.monitoringRules.set(this.patterns.RAPID_BETTING, {
      name: 'Rapid Betting Detection',
      enabled: true,
      threshold: this.alertThresholds.rapidBetting,
      timeWindow: 60000, // 1 minute
      action: 'flag_and_rate_limit',
      severity: 'medium'
    });

    // Coordinated betting detection
    this.monitoringRules.set(this.patterns.COORDINATED_BETTING, {
      name: 'Coordinated Betting Detection',
      enabled: true,
      threshold: this.alertThresholds.coordinatedBetting,
      timeWindow: 300000, // 5 minutes
      action: 'flag_and_investigate',
      severity: 'high'
    });

    // Wash trading detection
    this.monitoringRules.set(this.patterns.WASH_TRADING, {
      name: 'Wash Trading Detection',
      enabled: true,
      threshold: 0.9, // 90% similarity threshold
      action: 'immediate_suspension',
      severity: 'critical'
    });

    // Account farming detection
    this.monitoringRules.set(this.patterns.ACCOUNT_FARMING, {
      name: 'Account Farming Detection',
      enabled: true,
      threshold: 0.85, // 85% similarity in behavior
      action: 'flag_all_accounts',
      severity: 'high'
    });

    logger.info(`Loaded ${this.monitoringRules.size} monitoring rules`);
  }

  /**
   * Monitor a betting transaction in real-time
   */
  async monitorBettingActivity(userId, betData) {
    try {
      const alerts = [];
      
      // Get user's betting history
      const userHistory = await this.getUserBettingHistory(userId);
      
      // Run all monitoring checks
      const rapidBettingAlert = await this.checkRapidBetting(userId, betData, userHistory);
      if (rapidBettingAlert) alerts.push(rapidBettingAlert);

      const coordinatedAlert = await this.checkCoordinatedBetting(userId, betData);
      if (coordinatedAlert) alerts.push(coordinatedAlert);

      const washTradingAlert = await this.checkWashTrading(userId, betData);
      if (washTradingAlert) alerts.push(washTradingAlert);

      const insiderAlert = await this.checkInsiderTrading(userId, betData);
      if (insiderAlert) alerts.push(insiderAlert);

      const accountFarmingAlert = await this.checkAccountFarming(userId, betData);
      if (accountFarmingAlert) alerts.push(accountFarmingAlert);

      const botActivityAlert = await this.checkBotActivity(userId, betData, userHistory);
      if (botActivityAlert) alerts.push(botActivityAlert);

      // Process alerts
      for (const alert of alerts) {
        await this.processAlert(alert);
      }

      // Update user activity tracking
      await this.updateUserActivity(userId, betData);

      return {
        allowed: alerts.filter(a => a.severity === 'critical').length === 0,
        alerts,
        riskScore: this.calculateRiskScore(alerts)
      };

    } catch (error) {
      logger.error('Monitoring error:', error);
      return { allowed: false, alerts: [{ type: 'system_error', severity: 'critical' }] };
    }
  }

  /**
   * Check for rapid betting patterns
   */
  async checkRapidBetting(userId, betData, userHistory) {
    try {
      const recentBets = userHistory.filter(bet => 
        Date.now() - bet.timestamp < 60000 // Last minute
      );

      if (recentBets.length >= this.alertThresholds.rapidBetting) {
        return {
          type: this.patterns.RAPID_BETTING,
          severity: 'medium',
          userId,
          details: {
            betsInLastMinute: recentBets.length,
            threshold: this.alertThresholds.rapidBetting,
            betAmounts: recentBets.map(b => b.amount)
          },
          timestamp: Date.now()
        };
      }

      return null;
    } catch (error) {
      logger.error('Rapid betting check error:', error);
      return null;
    }
  }

  /**
   * Check for coordinated betting patterns
   */
  async checkCoordinatedBetting(userId, betData) {
    try {
      const timeWindow = 300000; // 5 minutes
      const recentSimilarBets = await this.findSimilarRecentBets(betData, timeWindow);
      
      if (recentSimilarBets.length >= this.alertThresholds.coordinatedBetting) {
        // Analyze coordination patterns
        const walletAddresses = recentSimilarBets.map(bet => bet.userWallet);
        const uniqueWallets = new Set(walletAddresses);
        
        // Check for wallet clustering or similar behavior
        const coordination = await this.analyzeWalletCoordination(Array.from(uniqueWallets));
        
        if (coordination.suspiciousLevel > 0.7) {
          return {
            type: this.patterns.COORDINATED_BETTING,
            severity: 'high',
            userId,
            details: {
              coordinatedWallets: Array.from(uniqueWallets),
              similarBets: recentSimilarBets.length,
              coordinationScore: coordination.suspiciousLevel,
              patterns: coordination.patterns
            },
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('Coordinated betting check error:', error);
      return null;
    }
  }

  /**
   * Check for wash trading patterns
   */
  async checkWashTrading(userId, betData) {
    try {
      const userWallet = betData.userWallet;
      
      // Check for bets on opposite outcomes in the same pool
      const opposingBets = await this.findOpposingBets(userId, betData.poolId);
      
      if (opposingBets.length > 0) {
        // Analyze if this could be wash trading
        const washTrading = this.analyzeWashTrading(betData, opposingBets);
        
        if (washTrading.confidence > 0.8) {
          return {
            type: this.patterns.WASH_TRADING,
            severity: 'critical',
            userId,
            details: {
              opposingBets: opposingBets.length,
              washTradingScore: washTrading.confidence,
              evidence: washTrading.evidence
            },
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('Wash trading check error:', error);
      return null;
    }
  }

  /**
   * Check for insider trading patterns
   */
  async checkInsiderTrading(userId, betData) {
    try {
      // Check betting patterns around match events
      const matchEvents = await this.getMatchEvents(betData.eventId);
      const suspiciousOddsShifts = await this.analyzeSuspiciousOddsShifts(betData, matchEvents);
      
      if (suspiciousOddsShifts.suspiciousLevel > 0.75) {
        return {
          type: this.patterns.INSIDE_INFORMATION,
          severity: 'high',
          userId,
          details: {
            oddsShifts: suspiciousOddsShifts.shifts,
            timing: suspiciousOddsShifts.timing,
            suspicionLevel: suspiciousOddsShifts.suspiciousLevel
          },
          timestamp: Date.now()
        };
      }

      return null;
    } catch (error) {
      logger.error('Insider trading check error:', error);
      return null;
    }
  }

  /**
   * Check for account farming patterns
   */
  async checkAccountFarming(userId, betData) {
    try {
      const userProfile = await this.getUserProfile(userId);
      
      // Check account age and activity patterns
      if (Date.now() - userProfile.createdAt < this.alertThresholds.accountAgeThreshold) {
        const similarAccounts = await this.findSimilarNewAccounts(userProfile);
        
        if (similarAccounts.length >= 3) {
          const farmingAnalysis = await this.analyzeAccountFarming(userProfile, similarAccounts);
          
          if (farmingAnalysis.confidence > 0.8) {
            return {
              type: this.patterns.ACCOUNT_FARMING,
              severity: 'high',
              userId,
              details: {
                suspiciousAccounts: similarAccounts.map(acc => acc.id),
                farmingScore: farmingAnalysis.confidence,
                patterns: farmingAnalysis.patterns
              },
              timestamp: Date.now()
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Account farming check error:', error);
      return null;
    }
  }

  /**
   * Check for bot activity patterns
   */
  async checkBotActivity(userId, betData, userHistory) {
    try {
      const botIndicators = {
        uniformTimings: 0,
        perfectPatterns: 0,
        humanLikeVariation: 0,
        responseTimeConsistency: 0
      };

      // Analyze timing patterns
      if (userHistory.length >= 5) {
        const timingIntervals = [];
        for (let i = 1; i < userHistory.length; i++) {
          timingIntervals.push(userHistory[i].timestamp - userHistory[i-1].timestamp);
        }
        
        // Check for unnatural consistency
        const variance = this.calculateVariance(timingIntervals);
        const mean = timingIntervals.reduce((sum, interval) => sum + interval, 0) / timingIntervals.length;
        
        if (variance / mean < 0.1) { // Very low variance indicates bot-like behavior
          botIndicators.uniformTimings = 1;
        }
        
        // Check for perfect mathematical patterns
        const patterns = this.detectMathematicalPatterns(timingIntervals);
        if (patterns.detected) {
          botIndicators.perfectPatterns = patterns.strength;
        }
      }

      const botScore = Object.values(botIndicators).reduce((sum, val) => sum + val, 0) / 
                      Object.keys(botIndicators).length;

      if (botScore > 0.7) {
        return {
          type: this.patterns.BOT_ACTIVITY,
          severity: 'medium',
          userId,
          details: {
            botScore,
            indicators: botIndicators,
            behaviorPatterns: 'Automated betting patterns detected'
          },
          timestamp: Date.now()
        };
      }

      return null;
    } catch (error) {
      logger.error('Bot activity check error:', error);
      return null;
    }
  }

  /**
   * Process security alert
   */
  async processAlert(alert) {
    try {
      // Store alert
      await this.storeAlert(alert);
      
      // Determine action based on severity and type
      const action = this.determineAction(alert);
      
      // Execute action
      await this.executeAction(action, alert);
      
      // Update user risk profile
      await this.updateUserRiskProfile(alert.userId, alert);
      
      // Send notifications to security team
      if (alert.severity === 'critical' || alert.severity === 'high') {
        await this.notifySecurityTeam(alert);
      }

      logger.warn(
        `Security alert processed: ${alert.type} for user ${alert.userId}. ` +
        `Severity: ${alert.severity}, Action: ${action.type}`
      );

    } catch (error) {
      logger.error('Failed to process alert:', error);
    }
  }

  /**
   * Determine appropriate action for alert
   */
  determineAction(alert) {
    const rule = this.monitoringRules.get(alert.type);
    
    switch (alert.severity) {
      case 'critical':
        return { type: 'immediate_suspension', duration: 86400000 }; // 24 hours
      case 'high':
        return { type: 'flag_and_restrict', restrictions: ['limit_betting', 'manual_review'] };
      case 'medium':
        return { type: 'rate_limit', factor: 0.5 }; // Reduce betting rate by 50%
      default:
        return { type: 'monitor', increasedSurveillance: true };
    }
  }

  /**
   * Execute security action
   */
  async executeAction(action, alert) {
    try {
      switch (action.type) {
        case 'immediate_suspension':
          await this.suspendUser(alert.userId, action.duration, alert.type);
          break;
        
        case 'flag_and_restrict':
          await this.flagUser(alert.userId, action.restrictions);
          break;
        
        case 'rate_limit':
          await this.applyRateLimit(alert.userId, action.factor);
          break;
        
        case 'monitor':
          await this.increaseUserSurveillance(alert.userId);
          break;
      }

      logger.info(`Executed action ${action.type} for user ${alert.userId}`);

    } catch (error) {
      logger.error('Failed to execute security action:', error);
    }
  }

  /**
   * Calculate overall risk score for a user
   */
  calculateRiskScore(alerts) {
    if (alerts.length === 0) return 0;
    
    const severityWeights = {
      low: 0.25,
      medium: 0.5,
      high: 0.75,
      critical: 1.0
    };

    const totalScore = alerts.reduce((sum, alert) => {
      return sum + (severityWeights[alert.severity] || 0);
    }, 0);

    return Math.min(totalScore / alerts.length, 1.0);
  }

  /**
   * Get comprehensive user betting history
   */
  async getUserBettingHistory(userId, timeWindow = 86400000) {
    try {
      const historyKey = `bet_history:${userId}`;
      const history = await redis.lrange(historyKey, 0, -1);
      
      return history
        .map(item => JSON.parse(item))
        .filter(bet => Date.now() - bet.timestamp <= timeWindow)
        .sort((a, b) => a.timestamp - b.timestamp);
        
    } catch (error) {
      logger.error('Failed to get user betting history:', error);
      return [];
    }
  }

  /**
   * Store security alert
   */
  async storeAlert(alert) {
    try {
      // Store in alerts log
      await redis.lpush('security_alerts', JSON.stringify(alert));
      
      // Store in user-specific alerts
      await redis.lpush(`user_alerts:${alert.userId}`, JSON.stringify(alert));
      
      // Update suspicious activities tracking
      const activityKey = `${alert.type}_${alert.userId}`;
      this.suspiciousActivities.set(activityKey, {
        ...alert,
        count: (this.suspiciousActivities.get(activityKey)?.count || 0) + 1
      });

    } catch (error) {
      logger.error('Failed to store alert:', error);
    }
  }

  /**
   * Notify security team of critical alerts
   */
  async notifySecurityTeam(alert) {
    try {
      const notification = {
        type: 'security_alert',
        severity: alert.severity,
        userId: alert.userId,
        alertType: alert.type,
        details: alert.details,
        timestamp: alert.timestamp,
        requiresImmediate: alert.severity === 'critical'
      };

      // Store in security notifications queue
      await redis.lpush('security_notifications', JSON.stringify(notification));
      
      // In production, this would send to security dashboard, email, Slack, etc.
      logger.warn(`SECURITY ALERT: ${alert.type} - User: ${alert.userId} - Severity: ${alert.severity}`);

    } catch (error) {
      logger.error('Failed to notify security team:', error);
    }
  }

  /**
   * Start real-time monitoring background processes
   */
  startRealTimeMonitoring() {
    // Monitor for coordinated activities every minute
    setInterval(async () => {
      await this.scanForCoordinatedActivities();
    }, 60000);

    // Clean up old monitoring data every hour
    setInterval(async () => {
      await this.cleanupOldMonitoringData();
    }, 3600000);

    // Generate monitoring reports every 6 hours
    setInterval(async () => {
      await this.generateMonitoringReport();
    }, 21600000);

    logger.info('Real-time monitoring processes started');
  }

  /**
   * Load existing suspicious activities from storage
   */
  async loadSuspiciousActivities() {
    try {
      const activities = await redis.get('suspicious_activities');
      if (activities) {
        const parsed = JSON.parse(activities);
        this.suspiciousActivities = new Map(Object.entries(parsed));
      }

      const banned = await redis.smembers('banned_wallets');
      this.bannedWallets = new Set(banned);

      logger.info(`Loaded ${this.suspiciousActivities.size} suspicious activities and ${this.bannedWallets.size} banned wallets`);

    } catch (error) {
      logger.error('Failed to load suspicious activities:', error);
    }
  }

  // Additional helper methods for pattern analysis, wallet coordination, etc.
  async analyzeWalletCoordination(wallets) {
    // Implementation for analyzing wallet coordination patterns
    return { suspiciousLevel: 0, patterns: [] };
  }

  analyzeWashTrading(betData, opposingBets) {
    // Implementation for wash trading analysis
    return { confidence: 0, evidence: [] };
  }

  calculateVariance(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  detectMathematicalPatterns(intervals) {
    // Implementation for detecting mathematical patterns in timing
    return { detected: false, strength: 0 };
  }
}

module.exports = { AntiManipulationMonitor: new AntiManipulationMonitor() };