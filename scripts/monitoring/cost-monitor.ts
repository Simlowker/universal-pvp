#!/usr/bin/env node
/**
 * CRON Cost Monitoring Script
 * Daily validation and alerting for transaction costs
 */

import { CostMeasurementService } from '../../tests/costs/measure-costs';
import { Connection } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface MonitoringConfig {
  email?: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    from: string;
    to: string[];
  };
  slack?: {
    webhookUrl: string;
    channel: string;
  };
  thresholds: {
    maxAverageCost: number;
    minSuccessRate: number;
    maxLatency: number;
    costVarianceAlert: number; // Percentage change from previous day
  };
  storage: {
    dataDir: string;
    retentionDays: number;
  };
}

const DEFAULT_CONFIG: MonitoringConfig = {
  thresholds: {
    maxAverageCost: 100000, // 100k lamports
    minSuccessRate: 90, // 90%
    maxLatency: 100, // 100ms
    costVarianceAlert: 25, // 25% change
  },
  storage: {
    dataDir: './data/cost-monitoring',
    retentionDays: 90,
  },
};

export class CostMonitoringService {
  private config: MonitoringConfig;
  private costService: CostMeasurementService;
  private emailTransporter?: nodemailer.Transporter;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.costService = new CostMeasurementService();
    
    this.setupEmailTransporter();
    this.ensureDataDirectory();
  }

  /**
   * Main monitoring function - called by CRON
   */
  async runDailyMonitoring(): Promise<void> {
    console.log(`🔍 Starting daily cost monitoring at ${new Date().toISOString()}`);
    
    try {
      // Run cost analysis
      const { status, summary, alerts } = await this.costService.dailyCostValidation();
      
      // Store results
      await this.storeResults(summary);
      
      // Analyze trends
      const trendAnalysis = await this.analyzeTrends();
      
      // Generate and send report
      const report = this.generateReport(status, summary, alerts, trendAnalysis);
      
      if (status === 'FAIL' || alerts.length > 0) {
        await this.sendAlerts(report, status);
      }
      
      await this.sendDailyReport(report);
      
      // Cleanup old data
      await this.cleanupOldData();
      
      // Update Prometheus metrics
      await this.updatePrometheusMetrics(summary);
      
      console.log(`✅ Daily monitoring completed. Status: ${status}`);
      
    } catch (error) {
      console.error('❌ Daily monitoring failed:', error);
      await this.sendErrorAlert(error);
      process.exit(1);
    }
  }

  /**
   * Store monitoring results for trend analysis
   */
  private async storeResults(summary: any): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = path.join(this.config.storage.dataDir, `cost-data-${timestamp}.json`);
    
    const data = {
      timestamp: new Date().toISOString(),
      summary,
      metadata: {
        environment: process.env.NODE_ENV || 'production',
        version: process.env.npm_package_version || '1.0.0',
      },
    };
    
    await fs.promises.writeFile(filename, JSON.stringify(data, null, 2));
    console.log(`💾 Results stored: ${filename}`);
  }

  /**
   * Analyze cost trends over time
   */
  private async analyzeTrends(): Promise<{
    costTrend: 'increasing' | 'decreasing' | 'stable';
    performanceTrend: 'improving' | 'degrading' | 'stable';
    weeklyComparison: any;
    monthlyComparison: any;
  }> {
    const dataFiles = await this.getRecentDataFiles(30); // Last 30 days
    
    if (dataFiles.length < 2) {
      return {
        costTrend: 'stable',
        performanceTrend: 'stable',
        weeklyComparison: null,
        monthlyComparison: null,
      };
    }
    
    const historicalData = await Promise.all(
      dataFiles.map(async (file) => {
        const content = await fs.promises.readFile(file, 'utf-8');
        return JSON.parse(content);
      })
    );
    
    // Calculate trends
    const costs = historicalData.map(d => d.summary?.costAnalysis?.averageCost || 0);
    const latencies = historicalData.map(d => d.summary?.performanceAnalysis?.avgLatency || 0);
    
    const costTrend = this.calculateTrend(costs);
    const performanceTrend = this.calculateTrend(latencies, true); // Lower is better for latency
    
    // Weekly and monthly comparisons
    const weeklyComparison = this.compareTimeFrames(historicalData, 7);
    const monthlyComparison = this.compareTimeFrames(historicalData, 30);
    
    return {
      costTrend,
      performanceTrend,
      weeklyComparison,
      monthlyComparison,
    };
  }

  /**
   * Calculate trend direction from data points
   */
  private calculateTrend(data: number[], inverseTrend = false): 'increasing' | 'decreasing' | 'stable' {
    if (data.length < 3) return 'stable';
    
    const recent = data.slice(-7); // Last 7 days
    const older = data.slice(-14, -7); // Previous 7 days
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    // Account for inverse trends (lower is better for latency)
    const threshold = 5; // 5% threshold
    
    if (Math.abs(change) < threshold) {
      return 'stable';
    }
    
    if (inverseTrend) {
      return change > 0 ? 'degrading' : 'improving';
    } else {
      return change > 0 ? 'increasing' : 'decreasing';
    }
  }

  /**
   * Compare current performance to historical timeframes
   */
  private compareTimeFrames(data: any[], days: number): any {
    if (data.length < days + 1) return null;
    
    const current = data[data.length - 1];
    const historical = data.slice(-days - 1, -1);
    
    const historicalAvgCost = historical.reduce((sum, d) => sum + (d.summary?.costAnalysis?.averageCost || 0), 0) / historical.length;
    const historicalAvgLatency = historical.reduce((sum, d) => sum + (d.summary?.performanceAnalysis?.avgLatency || 0), 0) / historical.length;
    
    const currentCost = current.summary?.costAnalysis?.averageCost || 0;
    const currentLatency = current.summary?.performanceAnalysis?.avgLatency || 0;
    
    return {
      costChange: ((currentCost - historicalAvgCost) / historicalAvgCost) * 100,
      latencyChange: ((currentLatency - historicalAvgLatency) / historicalAvgLatency) * 100,
      period: `${days} days`,
    };
  }

  /**
   * Generate comprehensive monitoring report
   */
  private generateReport(
    status: 'PASS' | 'WARN' | 'FAIL',
    summary: any,
    alerts: string[],
    trendAnalysis: any
  ): string {
    const timestamp = new Date().toISOString();
    
    return `
📊 UNIVERSAL PVP - DAILY COST MONITORING REPORT
=============================================
Date: ${timestamp}
Status: ${status === 'PASS' ? '✅ PASS' : status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'}

🎯 KEY METRICS
--------------
Average Transaction Cost: ${summary.costAnalysis?.averageCost || 0} lamports (${((summary.costAnalysis?.averageCost || 0) / 1000000000).toFixed(6)} SOL)
Max Transaction Cost: ${summary.costAnalysis?.maxCost || 0} lamports
Success Rate: ${summary.summary?.successRate || 0}%
Average Latency: ${summary.performanceAnalysis?.avgLatency || 0}ms

📈 TREND ANALYSIS
-----------------
Cost Trend: ${trendAnalysis.costTrend.toUpperCase()}
Performance Trend: ${trendAnalysis.performanceTrend.toUpperCase()}
${trendAnalysis.weeklyComparison ? `Weekly Change: ${trendAnalysis.weeklyComparison.costChange.toFixed(2)}% cost, ${trendAnalysis.weeklyComparison.latencyChange.toFixed(2)}% latency` : ''}
${trendAnalysis.monthlyComparison ? `Monthly Change: ${trendAnalysis.monthlyComparison.costChange.toFixed(2)}% cost, ${trendAnalysis.monthlyComparison.latencyChange.toFixed(2)}% latency` : ''}

🚨 ALERTS
---------
${alerts.length > 0 ? alerts.map(alert => `• ${alert}`).join('\n') : 'No alerts'}

🎮 SCENARIO PERFORMANCE
-----------------------
${summary.scenarios ? summary.scenarios.map((s: any) => 
  `${s.name}: ${s.cost} lamports (${s.costSOL.toFixed(6)} SOL) - ${s.withinBudget ? '✅' : '❌'} Budget`
).join('\n') : 'No scenario data available'}

💡 RECOMMENDATIONS
------------------
${summary.summary?.successRate < 90 ? '• Investigate test failures and improve system reliability' : ''}
${summary.costAnalysis?.averageCost > 100000 ? '• Optimize transaction costs - exceeding 100k lamports threshold' : ''}
${summary.performanceAnalysis?.avgLatency > 100 ? '• Optimize system performance - exceeding 100ms latency threshold' : ''}
${trendAnalysis.costTrend === 'increasing' ? '• Cost trend is increasing - review optimization strategies' : ''}
${trendAnalysis.performanceTrend === 'degrading' ? '• Performance is degrading - investigate system bottlenecks' : ''}
${alerts.length === 0 && status === 'PASS' ? '✅ All systems operating within normal parameters' : ''}

🔗 LINKS
--------
Grafana Dashboard: ${process.env.GRAFANA_URL || 'http://localhost:3000'}/d/strategic-duel-prod
Prometheus Metrics: ${process.env.PROMETHEUS_URL || 'http://localhost:9090'}/targets

Generated by Universal PVP Cost Monitoring Service
    `.trim();
  }

  /**
   * Send critical alerts for failures
   */
  private async sendAlerts(report: string, status: 'PASS' | 'WARN' | 'FAIL'): Promise<void> {
    const subject = `🚨 Universal PVP Cost Alert - ${status}`;
    
    // Send email alert
    if (this.emailTransporter && this.config.email) {
      try {
        await this.emailTransporter.sendMail({
          from: this.config.email.from,
          to: this.config.email.to,
          subject,
          text: report,
          html: this.formatReportAsHTML(report),
        });
        console.log('📧 Alert email sent');
      } catch (error) {
        console.error('Failed to send email alert:', error);
      }
    }
    
    // Send Slack alert
    if (this.config.slack) {
      await this.sendSlackAlert(subject, report);
    }
  }

  /**
   * Send daily report (less urgent than alerts)
   */
  private async sendDailyReport(report: string): Promise<void> {
    // For now, just log the report
    // In production, this could be sent to a different channel/email list
    console.log('\n📋 DAILY REPORT:');
    console.log(report);
  }

  /**
   * Send error alert when monitoring fails
   */
  private async sendErrorAlert(error: any): Promise<void> {
    const errorReport = `
❌ UNIVERSAL PVP MONITORING ERROR
================================
Time: ${new Date().toISOString()}
Error: ${error.message}
Stack: ${error.stack}

The daily cost monitoring process failed. Immediate investigation required.
    `;
    
    console.error(errorReport);
    
    // Send critical error notification
    if (this.emailTransporter && this.config.email) {
      try {
        await this.emailTransporter.sendMail({
          from: this.config.email.from,
          to: this.config.email.to,
          subject: '🚨 CRITICAL: Universal PVP Monitoring Failure',
          text: errorReport,
        });
      } catch (emailError) {
        console.error('Failed to send error alert email:', emailError);
      }
    }
  }

  /**
   * Update Prometheus metrics with latest data
   */
  private async updatePrometheusMetrics(summary: any): Promise<void> {
    try {
      // Generate Prometheus metrics format
      const metrics = this.costService.exportResults('prometheus');
      
      // Write to metrics file (to be scraped by Prometheus)
      const metricsFile = path.join(this.config.storage.dataDir, 'cost-metrics.prom');
      await fs.promises.writeFile(metricsFile, metrics);
      
      console.log('📊 Prometheus metrics updated');
    } catch (error) {
      console.error('Failed to update Prometheus metrics:', error);
    }
  }

  /**
   * Cleanup old monitoring data files
   */
  private async cleanupOldData(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.config.storage.dataDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.storage.retentionDays);
      
      for (const file of files) {
        if (!file.startsWith('cost-data-')) continue;
        
        const filePath = path.join(this.config.storage.dataDir, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.promises.unlink(filePath);
          console.log(`🗑️ Cleaned up old data: ${file}`);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old data:', error);
    }
  }

  // Utility methods
  private setupEmailTransporter(): void {
    if (this.config.email) {
      this.emailTransporter = nodemailer.createTransporter(this.config.email.smtp);
    }
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.config.storage.dataDir)) {
      fs.mkdirSync(this.config.storage.dataDir, { recursive: true });
    }
  }

  private async getRecentDataFiles(days: number): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.config.storage.dataDir);
      const dataFiles = files
        .filter(f => f.startsWith('cost-data-') && f.endsWith('.json'))
        .sort()
        .slice(-days)
        .map(f => path.join(this.config.storage.dataDir, f));
        
      return dataFiles;
    } catch (error) {
      console.warn('Failed to get recent data files:', error);
      return [];
    }
  }

  private formatReportAsHTML(report: string): string {
    return `
      <html>
        <body style="font-family: monospace; white-space: pre-line; background: #1a1a1a; color: #e0e0e0; padding: 20px;">
          ${report.replace(/\n/g, '<br>')}
        </body>
      </html>
    `;
  }

  private async sendSlackAlert(title: string, message: string): Promise<void> {
    if (!this.config.slack?.webhookUrl) return;
    
    try {
      const { stdout } = await execAsync(`curl -X POST -H 'Content-type: application/json' --data '{"text":"${title}\\n${message}"}' ${this.config.slack.webhookUrl}`);
      console.log('📱 Slack alert sent');
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }
}

// CLI interface
if (require.main === module) {
  const configPath = process.argv[2];
  let config = {};
  
  if (configPath && fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  
  const monitor = new CostMonitoringService(config);
  
  monitor.runDailyMonitoring().catch(error => {
    console.error('Monitoring failed:', error);
    process.exit(1);
  });
}

export default CostMonitoringService;