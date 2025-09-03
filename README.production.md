# Universal PVP - Production Deployment Guide

## 🚀 Production-Ready Strategic Duel Game

Universal PVP is a blockchain-powered strategic duel game built with Next.js, MagicBlock integration, and comprehensive monitoring. This guide covers the complete production deployment process.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Monitoring & Observability](#monitoring--observability)
- [Security](#security)
- [Performance](#performance)
- [Deployment](#deployment)
- [Operations](#operations)
- [Troubleshooting](#troubleshooting)

## 🔧 Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04 LTS or newer
- **Memory**: 8GB RAM minimum (16GB recommended)
- **Storage**: 100GB SSD minimum
- **CPU**: 4+ cores recommended
- **Network**: Stable internet connection with low latency

### Required Services
- **Node.js**: 18.x LTS
- **PostgreSQL**: 15+
- **Redis**: 7+
- **Nginx**: Latest stable
- **Docker & Docker Compose**: Latest
- **SSL Certificate**: Let's Encrypt or commercial

## ⚡ Quick Start

### Automated Production Setup
```bash
# Clone the repository
git clone https://github.com/universal-pvp/strategic-duel.git
cd universal-pvp

# Make setup script executable
chmod +x scripts/setup-production.sh

# Run production setup (requires sudo)
DOMAIN=yourdomain.com EMAIL=admin@yourdomain.com ./scripts/setup-production.sh
```

### Manual Setup
```bash
# Install dependencies
npm ci

# Build the application
npm run build

# Run comprehensive tests
npm run test:comprehensive

# Start monitoring stack
npm run monitoring:start

# Start applications with PM2
pm2 start ecosystem.config.js
```

## 🏗️ Architecture Overview

### Core Components

```
┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   Monitoring    │
│     (Nginx)     │    │     Stack       │
└─────────────────┘    └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Prometheus    │
│   (Next.js)     │    │   Grafana       │
└─────────────────┘    │   Alertmanager  │
         │              └─────────────────┘
         ▼
┌─────────────────┐    ┌─────────────────┐
│   Backend API   │───▶│   PostgreSQL    │
│   (Express.js)  │    │   Database      │
└─────────────────┘    └─────────────────┘
         │
         ▼              ┌─────────────────┐
┌─────────────────┐───▶│     Redis       │
│  MagicBlock     │    │     Cache       │
│  Integration    │    └─────────────────┘
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Solana/Devnet  │
│  Ephemeral      │
│  Rollups        │
└─────────────────┘
```

### Technology Stack
- **Frontend**: Next.js 14, React 18, TypeScript
- **Backend**: Node.js, Express.js, Socket.IO
- **Blockchain**: Solana, MagicBlock Ephemeral Rollups
- **Database**: PostgreSQL 15+, Redis 7+
- **Monitoring**: Prometheus, Grafana, Alertmanager
- **Testing**: Jest, Playwright, k6, Security Tests
- **Infrastructure**: Docker, Nginx, PM2, Certbot

## 🧪 Testing & Quality Assurance

### Comprehensive Test Suite

Our production deployment includes extensive testing to ensure quality and reliability:

#### 1. Load Testing (k6)
```bash
# Run k6 load tests with 200 concurrent users
npm run test:k6

# Custom load test configuration
CONCURRENT_USERS=500 DURATION=15m npm run test:k6
```

**Targets:**
- P95 latency < 100ms
- Error rate < 10%
- 200+ concurrent users
- WebSocket stability

#### 2. Cost Measurement & Validation
```bash
# Run comprehensive cost analysis
npm run test:costs

# Daily cost monitoring (automated)
npm run cost:daily

# Export cost metrics for Prometheus
npm run cost:export
```

**Validation:**
- Transaction costs < 100k lamports
- Rent-exempt calculations
- Session initialization costs
- Strategic fold refund accuracy (50%)

#### 3. End-to-End Testing (Playwright)
```bash
# Run complete E2E test suite
npm run test:e2e

# Run with UI mode for debugging
npm run test:e2e:ui
```

**Coverage:**
- Complete game flow testing
- Multi-browser compatibility
- Mobile responsiveness
- Accessibility compliance
- Performance benchmarks

#### 4. Security Testing
```bash
# Comprehensive security validation
npm run test:security
```

**Security Measures:**
- Rate limiting enforcement
- JWT authentication validation
- Input sanitization (XSS, SQL injection)
- CORS policy compliance
- Anti-spam measures

#### 5. MagicBlock Integration Tests
```bash
# Test MagicBlock devnet integration
npm run test:magicblock
```

**Validation:**
- Session management
- Action execution latency (10-50ms)
- Cost tracking accuracy
- Error handling

### Automated Testing Pipeline
```bash
# Run all tests in production pipeline
npm run test:comprehensive

# Individual test suites
npm run test:security      # Security validation
npm run test:magicblock     # Blockchain integration
npm run test:costs          # Cost analysis
npm run test:e2e            # End-to-end testing
```

## 📊 Monitoring & Observability

### Metrics Collection

Our monitoring stack provides comprehensive observability:

#### Prometheus Metrics
- **Application**: Response times, error rates, throughput
- **Game-Specific**: Action latency, transaction costs, player activity
- **System**: CPU, memory, disk, network
- **Database**: Query performance, connection pools
- **WebSocket**: Connection health, message rates

#### Grafana Dashboards
- **Strategic Duel Dashboard**: Game performance, cost analysis
- **System Overview**: Infrastructure health
- **Security Dashboard**: Attack patterns, rate limiting
- **Business Metrics**: Player engagement, revenue

#### Alerting (Alertmanager)
- **Critical**: System down, high error rates, cost overruns
- **Warning**: Performance degradation, approaching limits
- **Info**: Deployment notifications, daily reports

### Monitoring Stack Deployment
```bash
# Start monitoring services
npm run monitoring:start

# View monitoring logs
npm run monitoring:logs

# Stop monitoring services
npm run monitoring:stop
```

#### Access URLs (Production)
- **Grafana**: `https://yourdomain.com:3001`
- **Prometheus**: `https://yourdomain.com:9090` (internal)
- **Alertmanager**: `https://yourdomain.com:9093` (internal)

### Cost Monitoring (CRON)

Automated daily cost validation with alerting:

```bash
# Manual cost validation
npm run cost:monitor

# View cost history and trends
npm run cost:export csv
```

**Daily Reports Include:**
- Average transaction costs
- Success rates
- Performance trends
- Cost optimization recommendations
- Alert notifications via email/Slack

## 🔐 Security

### Security Hardening Checklist

#### Application Security
- ✅ Rate limiting (100 req/15min per IP)
- ✅ JWT authentication with wallet signatures
- ✅ Input sanitization and validation
- ✅ XSS and injection protection
- ✅ CORS policy enforcement
- ✅ Anti-spam measures
- ✅ Session management security

#### Infrastructure Security
- ✅ UFW firewall configuration
- ✅ Fail2Ban intrusion prevention
- ✅ SSL/TLS encryption (Let's Encrypt)
- ✅ Security headers (HSTS, CSP, etc.)
- ✅ Database access restrictions
- ✅ Regular security updates

#### Monitoring & Alerting
- ✅ Security event logging
- ✅ Suspicious activity detection
- ✅ Failed authentication tracking
- ✅ Rate limiting alerts
- ✅ System intrusion monitoring

### Security Testing
```bash
# Run comprehensive security tests
npm run security:scan

# Results include:
# - Rate limiting enforcement
# - Authentication bypass attempts
# - Input injection testing
# - CORS validation
# - WebSocket security
```

## ⚡ Performance

### Performance Targets

#### Response Time Targets
- **API Responses**: P95 < 100ms
- **Game Actions**: P99 < 50ms (MagicBlock)
- **Page Load**: < 2s (First Contentful Paint)
- **WebSocket Latency**: < 10ms

#### Throughput Targets
- **Concurrent Users**: 200+ simultaneous
- **Requests/Second**: 1000+ sustained
- **WebSocket Connections**: 500+ concurrent
- **Database**: 100+ queries/second

#### Cost Efficiency
- **Transaction Costs**: < 100k lamports average
- **Session Initialization**: < 50k lamports
- **Strategic Fold**: Accurate 50% refunds

### Performance Testing
```bash
# Comprehensive performance benchmarks
npm run benchmark:comprehensive

# Individual performance tests
npm run test:stress         # Stress testing
npm run test:k6            # Load testing
npm run performance:profile # Memory profiling
```

### Optimization Features
- **CDN Integration**: Static asset delivery
- **Gzip Compression**: Response compression
- **Connection Pooling**: Database optimization
- **Caching Strategy**: Redis-based caching
- **Load Balancing**: Multi-instance deployment

## 🚀 Deployment

### Production Deployment Process

#### 1. Automated Deployment
```bash
# Complete production setup
DOMAIN=yourdomain.com ./scripts/setup-production.sh
```

#### 2. Manual Deployment Steps

1. **System Preparation**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y nginx postgresql redis-server docker.io
```

2. **Application Setup**
```bash
# Create application user and directories
sudo useradd -m universal-pvp
sudo mkdir -p /opt/universal-pvp/{app,logs,data}
```

3. **Database Configuration**
```bash
# Setup PostgreSQL
sudo -u postgres createdb universal_pvp_prod
sudo -u postgres createuser universal-pvp
```

4. **SSL Certificate**
```bash
# Obtain Let's Encrypt certificate
sudo certbot --nginx -d yourdomain.com
```

5. **Application Start**
```bash
# Build and start with PM2
npm run build
pm2 start ecosystem.config.js
```

### Environment Configuration

#### Production Environment Variables
```env
NODE_ENV=production
DOMAIN=yourdomain.com
DATABASE_URL=postgresql://user:pass@localhost/db
REDIS_URL=redis://localhost:6379
MAGICBLOCK_RPC_URL=https://mainnet.magicblock.app
JWT_SECRET=your-secure-secret
```

### Health Checks

#### Automated Health Monitoring
```bash
# Application health check
npm run health:check

# Service status verification
sudo systemctl status nginx postgresql redis-server
```

#### Health Check Endpoints
- **Backend**: `/health`
- **Frontend**: `/api/health`
- **Database**: Connection pool status
- **Redis**: Cache connectivity
- **MagicBlock**: RPC endpoint status

## 🛠️ Operations

### Process Management (PM2)

#### Application Control
```bash
# View application status
pm2 status

# View logs
pm2 logs

# Restart applications
pm2 restart all

# Reload without downtime
pm2 reload all

# Monitor performance
pm2 monit
```

#### Process Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'universal-pvp-backend',
      script: 'src/backend/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '1G'
    },
    {
      name: 'universal-pvp-frontend', 
      script: 'npm',
      args: 'start',
      max_memory_restart: '512M'
    }
  ]
};
```

### Database Operations

#### Backup & Recovery
```bash
# Create database backup
pg_dump universal_pvp_prod | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip -c backup_20240101.sql.gz | psql universal_pvp_prod

# Automated daily backups (configured in cron)
0 2 * * * /opt/universal-pvp/backup.sh
```

#### Performance Monitoring
```bash
# Monitor database performance
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Check slow queries
sudo -u postgres psql -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

### Log Management

#### Log Locations
- **Application**: `/opt/universal-pvp/logs/`
- **Nginx**: `/var/log/nginx/`
- **PostgreSQL**: `/var/log/postgresql/`
- **System**: `/var/log/syslog`

#### Log Monitoring
```bash
# View application logs
npm run logs:backend
npm run logs:frontend

# Real-time log monitoring
tail -f /opt/universal-pvp/logs/*.log

# Error log analysis
grep ERROR /opt/universal-pvp/logs/*.log | tail -20
```

### Maintenance Tasks

#### Regular Maintenance
```bash
# Update application
git pull origin main
npm ci
npm run build
pm2 reload all

# System updates
sudo apt update && sudo apt upgrade
sudo systemctl restart nginx

# Database maintenance
sudo -u postgres psql -c "VACUUM ANALYZE;"
```

#### Security Updates
```bash
# Check for security updates
sudo apt list --upgradable | grep -i security

# Apply security patches
sudo unattended-upgrade

# Review security logs
sudo fail2ban-client status
```

## 🔧 Troubleshooting

### Common Issues & Solutions

#### Application Won't Start
```bash
# Check PM2 status
pm2 status

# View error logs
pm2 logs --error

# Check port conflicts
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :5000

# Restart services
pm2 restart all
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test database connection
sudo -u postgres psql universal_pvp_prod

# Check connection limits
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Reset connections
sudo systemctl restart postgresql
```

#### High Memory Usage
```bash
# Check memory usage
free -h
pm2 monit

# Restart memory-intensive processes
pm2 restart universal-pvp-backend

# Check for memory leaks
node --inspect src/backend/server.js
```

#### SSL Certificate Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew certificates
sudo certbot renew

# Test SSL configuration
sudo nginx -t
```

#### Performance Issues
```bash
# Check system resources
htop
iotop

# Database performance
sudo -u postgres psql -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Application profiling
npm run performance:profile
```

### Diagnostic Commands

#### Health Check Script
```bash
#!/bin/bash
# Quick system health check

echo "=== System Health Check ==="
echo "Date: $(date)"
echo ""

# Service status
echo "Services:"
systemctl is-active nginx postgresql redis-server | paste <(echo -e "nginx\npostgresql\nredis") -

# Application status
echo ""
echo "Applications:"
pm2 list | grep -E "(name|status)" || echo "PM2 not running"

# Resource usage
echo ""
echo "Resources:"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2}')"
echo "CPU: $(uptime | awk '{print $NF}')"

# Network connectivity
echo ""
echo "Connectivity:"
curl -s -o /dev/null -w "Backend: %{http_code}\n" http://localhost:5000/health
curl -s -o /dev/null -w "Frontend: %{http_code}\n" http://localhost:3000
```

### Getting Help

#### Support Resources
- **Documentation**: This README and inline code comments
- **Monitoring**: Grafana dashboards for real-time insights
- **Logs**: Comprehensive logging throughout the application
- **Health Checks**: Automated system status validation

#### Emergency Procedures
1. **Application Down**: Restart PM2 processes
2. **Database Issues**: Check connections and restart PostgreSQL
3. **High Load**: Scale horizontally with additional instances
4. **Security Breach**: Review fail2ban logs and block malicious IPs
5. **Data Loss**: Restore from automated backups

---

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

Please read CONTRIBUTING.md for contribution guidelines.

---

**Universal PVP** - Production-ready strategic duel gaming with comprehensive monitoring and quality assurance.