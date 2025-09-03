import { EventEmitter } from 'events';
import { logger } from '@/config/logger';
import { config } from '@/config/environment';
import { costTrackingService } from './costTracking';
import { transactionQueueService } from './transactionQueue';
import { feeEstimationService } from './feeEstimation';
import { recordBusinessMetric } from '@/config/prometheus';

export interface Alert {
  id: string;
  type: 'cost' | 'performance' | 'network' | 'queue' | 'business';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  value: number;
  threshold: number;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface AlertConfig {
  // Cost thresholds
  maxDailyCostUsd: number;
  maxHourlyCostUsd: number;
  maxGameCostUsd: number;
  maxTransactionCostLamports: number;
  
  // Performance thresholds
  maxProcessingTimeMs: number;
  maxQueueSizeTotal: number;
  maxQueueWaitTimeMs: number;
  minSuccessRatePercent: number;
  
  // Network thresholds
  maxPriorityFeeLamports: number;
  maxConfirmationTimeMs: number;
  
  // Business thresholds
  maxErrorRatePercent: number;
  minGamesPerHour: number;
  maxRetryRatePercent: number;
  
  // Alert settings
  alertCooldownMs: number;
  maxActiveAlerts: number;
  enableSlack: boolean;
  enableEmail: boolean;
  enableWebhooks: boolean;
}

export interface NotificationChannel {
  type: 'slack' | 'email' | 'webhook' | 'console';
  config: any;
  enabled: boolean;
  severityFilter: Array<'low' | 'medium' | 'high' | 'critical'>;
}

export class AlertSystem extends EventEmitter {
  private alerts: Map<string, Alert> = new Map();
  private alertCooldowns: Map<string, number> = new Map();
  private notificationChannels: NotificationChannel[] = [];
  private config: AlertConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;

  constructor(alertConfig?: Partial<AlertConfig>) {
    super();
    
    // Default configuration
    this.config = {
      // Cost thresholds (conservative defaults)
      maxDailyCostUsd: 50,
      maxHourlyCostUsd: 5,
      maxGameCostUsd: 0.1,
      maxTransactionCostLamports: 100000, // 100k lamports max
      
      // Performance thresholds
      maxProcessingTimeMs: 10000, // 10 seconds
      maxQueueSizeTotal: 100,
      maxQueueWaitTimeMs: 30000, // 30 seconds
      minSuccessRatePercent: 95,
      
      // Network thresholds
      maxPriorityFeeLamports: 75000, // 75k lamports
      maxConfirmationTimeMs: 45000, // 45 seconds
      
      // Business thresholds
      maxErrorRatePercent: 5,
      minGamesPerHour: 10,
      maxRetryRatePercent: 20,
      
      // Alert settings
      alertCooldownMs: 300000, // 5 minutes
      maxActiveAlerts: 50,
      enableSlack: false,
      enableEmail: false,
      enableWebhooks: false,
      
      ...alertConfig
    };

    this.setupDefaultChannels();
    this.startMonitoring();
  }

  private setupDefaultChannels(): void {
    // Console logging (always enabled)
    this.notificationChannels.push({
      type: 'console',
      config: {},
      enabled: true,
      severityFilter: ['low', 'medium', 'high', 'critical']
    });

    // Slack (if configured)
    if (this.config.enableSlack && process.env.SLACK_WEBHOOK_URL) {
      this.notificationChannels.push({
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#alerts',
          username: 'Solana PvP Alert System'
        },
        enabled: true,
        severityFilter: ['high', 'critical']
      });
    }

    // Email (if configured)
    if (this.config.enableEmail && process.env.ALERT_EMAIL_CONFIG) {
      this.notificationChannels.push({
        type: 'email',
        config: JSON.parse(process.env.ALERT_EMAIL_CONFIG),
        enabled: true,
        severityFilter: ['medium', 'high', 'critical']
      });
    }

    // Custom webhooks (if configured)
    if (this.config.enableWebhooks && process.env.ALERT_WEBHOOK_URLS) {
      const webhooks = process.env.ALERT_WEBHOOK_URLS.split(',');
      webhooks.forEach(url => {
        this.notificationChannels.push({
          type: 'webhook',
          config: { url: url.trim() },
          enabled: true,
          severityFilter: ['high', 'critical']
        });
      });
    }
  }

  private startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllThresholds();
    }, 30000);

    // Listen to transaction queue events
    transactionQueueService.on('transaction_failed', (data) => {
      this.handleTransactionFailure(data);
    });

    transactionQueueService.on('congestion_updated', (congestion) => {
      this.checkNetworkCongestion(congestion);
    });

    logger.info('Alert system monitoring started');
  }

  private async checkAllThresholds(): Promise<void> {
    try {
      await Promise.all([
        this.checkCostThresholds(),
        this.checkPerformanceThresholds(),
        this.checkNetworkThresholds(),
        this.checkBusinessThresholds()
      ]);
    } catch (error) {
      logger.error('Error checking alert thresholds:', error);
    }
  }

  private async checkCostThresholds(): Promise<void> {
    // Check hourly and daily costs
    const [hourlyCosts, dailyCosts] = await Promise.all([
      costTrackingService.getCostSummary('24h'),
      costTrackingService.getCostSummary('24h')
    ]);

    // Daily cost check
    if (dailyCosts.totalCostUsd > this.config.maxDailyCostUsd) {
      this.createAlert({
        type: 'cost',
        severity: 'high',
        title: 'Daily Cost Limit Exceeded',
        description: `Daily costs ($${dailyCosts.totalCostUsd.toFixed(2)}) exceed limit ($${this.config.maxDailyCostUsd})`,
        value: dailyCosts.totalCostUsd,
        threshold: this.config.maxDailyCostUsd,
        metadata: { timeframe: '24h', breakdown: dailyCosts.byCategory }
      });
    }

    // Hourly cost check
    if (hourlyCosts.totalCostUsd > this.config.maxHourlyCostUsd) {
      this.createAlert({
        type: 'cost',
        severity: 'medium',
        title: 'Hourly Cost Spike Detected',
        description: `Hourly costs ($${hourlyCosts.totalCostUsd.toFixed(2)}) exceed normal levels ($${this.config.maxHourlyCostUsd})`,
        value: hourlyCosts.totalCostUsd,
        threshold: this.config.maxHourlyCostUsd,
        metadata: { timeframe: '1h', breakdown: hourlyCosts.byCategory }
      });
    }
  }

  private async checkPerformanceThresholds(): Promise<void> {
    const queueStats = transactionQueueService.getStats();
    const queueStatus = transactionQueueService.getQueueStatus();
    
    // Total queue size
    const totalQueueSize = Object.values(queueStatus).reduce((sum, size) => sum + size, 0);
    if (totalQueueSize > this.config.maxQueueSizeTotal) {
      this.createAlert({
        type: 'performance',
        severity: 'medium',
        title: 'Transaction Queue Overload',
        description: `Queue size (${totalQueueSize}) exceeds threshold (${this.config.maxQueueSizeTotal})`,
        value: totalQueueSize,
        threshold: this.config.maxQueueSizeTotal,
        metadata: { queueBreakdown: queueStatus }
      });
    }

    // Processing time
    if (queueStats.avgProcessingTime > this.config.maxProcessingTimeMs) {
      this.createAlert({
        type: 'performance',
        severity: 'medium',
        title: 'Slow Transaction Processing',
        description: `Average processing time (${queueStats.avgProcessingTime}ms) exceeds threshold (${this.config.maxProcessingTimeMs}ms)`,
        value: queueStats.avgProcessingTime,
        threshold: this.config.maxProcessingTimeMs,
        metadata: { queueStats }
      });
    }

    // Success rate
    const totalTransactions = queueStats.completed + queueStats.failed;
    if (totalTransactions > 0) {
      const successRate = (queueStats.completed / totalTransactions) * 100;
      if (successRate < this.config.minSuccessRatePercent) {
        this.createAlert({
          type: 'performance',
          severity: 'high',
          title: 'Low Transaction Success Rate',
          description: `Success rate (${successRate.toFixed(1)}%) below threshold (${this.config.minSuccessRatePercent}%)`,
          value: successRate,
          threshold: this.config.minSuccessRatePercent,
          metadata: { completed: queueStats.completed, failed: queueStats.failed }
        });
      }
    }
  }

  private async checkNetworkThresholds(): Promise<void> {
    const congestion = await transactionQueueService.getCurrentCongestion();
    
    // Priority fee check
    if (congestion.priorityFeePercentile > this.config.maxPriorityFeeLamports) {
      this.createAlert({
        type: 'network',
        severity: 'medium',
        title: 'High Priority Fees',
        description: `Priority fees (${congestion.priorityFeePercentile} lamports) exceed threshold (${this.config.maxPriorityFeeLamports} lamports)`,
        value: congestion.priorityFeePercentile,
        threshold: this.config.maxPriorityFeeLamports,
        metadata: { congestionLevel: congestion.level }
      });
    }

    // Confirmation time check
    if (congestion.avgConfirmationTime > this.config.maxConfirmationTimeMs) {
      this.createAlert({
        type: 'network',
        severity: 'medium',
        title: 'Slow Confirmation Times',
        description: `Average confirmation time (${congestion.avgConfirmationTime}ms) exceeds threshold (${this.config.maxConfirmationTimeMs}ms)`,
        value: congestion.avgConfirmationTime,
        threshold: this.config.maxConfirmationTimeMs,
        metadata: { congestionLevel: congestion.level }
      });
    }
  }

  private async checkBusinessThresholds(): Promise<void> {
    // This would integrate with actual business metrics
    // For now, we'll check basic operational health
    
    const queueStats = transactionQueueService.getStats();
    const totalTransactions = queueStats.completed + queueStats.failed;
    
    if (totalTransactions > 0) {
      const errorRate = (queueStats.failed / totalTransactions) * 100;
      
      if (errorRate > this.config.maxErrorRatePercent) {
        this.createAlert({
          type: 'business',
          severity: 'high',
          title: 'High Error Rate',
          description: `Transaction error rate (${errorRate.toFixed(1)}%) exceeds threshold (${this.config.maxErrorRatePercent}%)`,
          value: errorRate,
          threshold: this.config.maxErrorRatePercent,
          metadata: { totalTransactions, failures: queueStats.failed }
        });
      }
    }
  }

  private checkNetworkCongestion(congestion: any): void {
    if (congestion.level === 'high') {
      this.createAlert({
        type: 'network',
        severity: 'medium',
        title: 'High Network Congestion',
        description: 'Solana network is experiencing high congestion',
        value: 2, // high = 2
        threshold: 1, // medium = 1
        metadata: congestion
      });
    }
  }

  private handleTransactionFailure(data: any): void {
    this.createAlert({
      type: 'performance',
      severity: 'low',
      title: 'Transaction Failed',
      description: `Transaction ${data.id} failed: ${data.error}`,
      value: 1,
      threshold: 0,
      metadata: data
    });
  }

  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    const alertKey = `${alertData.type}_${alertData.title.replace(/\s+/g, '_').toLowerCase()}`;
    
    // Check cooldown
    const lastAlert = this.alertCooldowns.get(alertKey);
    if (lastAlert && Date.now() - lastAlert < this.config.alertCooldownMs) {
      return; // Still in cooldown
    }

    // Create alert
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      resolved: false,
      ...alertData
    };

    // Store alert
    this.alerts.set(alert.id, alert);
    this.alertCooldowns.set(alertKey, Date.now());

    // Clean up old alerts if necessary
    this.cleanupOldAlerts();

    // Send notifications
    this.sendNotifications(alert);

    // Record metric
    recordBusinessMetric('error', 1, {
      errorType: alertData.type,
      service: 'alert_system',
      severity: alertData.severity
    });

    // Emit event
    this.emit('alert_created', alert);

    logger.warn('Alert created', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      value: alert.value,
      threshold: alert.threshold
    });
  }

  private cleanupOldAlerts(): void {
    const alerts = Array.from(this.alerts.values());
    
    if (alerts.length <= this.config.maxActiveAlerts) {
      return;
    }

    // Remove oldest resolved alerts first
    const resolved = alerts.filter(a => a.resolved).sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = resolved.slice(0, alerts.length - this.config.maxActiveAlerts);
    
    toRemove.forEach(alert => {
      this.alerts.delete(alert.id);
    });
  }

  private async sendNotifications(alert: Alert): Promise<void> {
    const channels = this.notificationChannels.filter(
      channel => channel.enabled && channel.severityFilter.includes(alert.severity)
    );

    for (const channel of channels) {
      try {
        await this.sendNotification(channel, alert);
      } catch (error) {
        logger.error(`Failed to send ${channel.type} notification:`, error);
      }
    }
  }

  private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    switch (channel.type) {
      case 'console':
        this.sendConsoleNotification(alert);
        break;
      case 'slack':
        await this.sendSlackNotification(channel.config, alert);
        break;
      case 'email':
        await this.sendEmailNotification(channel.config, alert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(channel.config, alert);
        break;
    }
  }

  private sendConsoleNotification(alert: Alert): void {
    const emoji = {
      low: '🟡',
      medium: '🟠',
      high: '🔴',
      critical: '🚨'
    }[alert.severity];
    
    console.log(`\n${emoji} ALERT [${alert.severity.toUpperCase()}] ${emoji}`);
    console.log(`Title: ${alert.title}`);
    console.log(`Description: ${alert.description}`);
    console.log(`Type: ${alert.type}`);
    console.log(`Value: ${alert.value} (threshold: ${alert.threshold})`);
    console.log(`Time: ${new Date(alert.timestamp).toISOString()}`);
    if (alert.metadata) {
      console.log(`Metadata:`, JSON.stringify(alert.metadata, null, 2));
    }
    console.log('─'.repeat(60));
  }

  private async sendSlackNotification(config: any, alert: Alert): Promise<void> {
    const color = {
      low: '#ffeb3b',
      medium: '#ff9800',
      high: '#f44336',
      critical: '#d32f2f'
    }[alert.severity];

    const payload = {
      channel: config.channel,
      username: config.username,
      attachments: [{
        color,
        title: `🚨 ${alert.title}`,
        text: alert.description,
        fields: [
          { title: 'Type', value: alert.type, short: true },
          { title: 'Severity', value: alert.severity, short: true },
          { title: 'Value', value: alert.value.toString(), short: true },
          { title: 'Threshold', value: alert.threshold.toString(), short: true }
        ],
        timestamp: Math.floor(alert.timestamp / 1000)
      }]
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }
  }

  private async sendEmailNotification(config: any, alert: Alert): Promise<void> {
    // Email implementation would go here
    // This would typically use a service like SendGrid, AWS SES, etc.
    logger.info('Email notification would be sent', { alertId: alert.id });
  }

  private async sendWebhookNotification(config: any, alert: Alert): Promise<void> {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert,
        timestamp: new Date().toISOString(),
        source: 'solana-pvp-alert-system'
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.status}`);
    }
  }

  // Public API methods

  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  updateConfig(newConfig: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Alert system configuration updated', newConfig);
  }

  addNotificationChannel(channel: NotificationChannel): void {
    this.notificationChannels.push(channel);
    logger.info('Notification channel added', { type: channel.type });
  }

  removeNotificationChannel(type: string): boolean {
    const index = this.notificationChannels.findIndex(c => c.type === type);
    if (index >= 0) {
      this.notificationChannels.splice(index, 1);
      logger.info('Notification channel removed', { type });
      return true;
    }
    return false;
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isMonitoring = false;
    logger.info('Alert system monitoring stopped');
  }

  getStats(): {
    totalAlerts: number;
    activeAlerts: number;
    resolvedAlerts: number;
    alertsBySeverity: Record<string, number>;
    alertsByType: Record<string, number>;
  } {
    const alerts = Array.from(this.alerts.values());
    
    const alertsBySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsByType = alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter(a => !a.resolved).length,
      resolvedAlerts: alerts.filter(a => a.resolved).length,
      alertsBySeverity,
      alertsByType
    };
  }
}

// Export singleton instance
export const alertSystem = new AlertSystem();