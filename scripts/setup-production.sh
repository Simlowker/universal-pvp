#!/bin/bash

# Universal PVP Production Setup Script
# Complete production environment setup with monitoring and security

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="universal-pvp"
DOMAIN=${DOMAIN:-"universalpvp.com"}
EMAIL=${EMAIL:-"admin@universalpvp.com"}
ENVIRONMENT=${ENVIRONMENT:-"production"}
DB_NAME=${DB_NAME:-"universal_pvp_prod"}
BACKUP_DIR=${BACKUP_DIR:-"/opt/backups/universal-pvp"}

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

header() {
    echo -e "\n${PURPLE}================================================================${NC}"
    echo -e "${PURPLE} $1${NC}"
    echo -e "${PURPLE}================================================================${NC}\n"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root for security reasons"
    fi
}

# Install system dependencies
install_system_dependencies() {
    header "Installing System Dependencies"
    
    log "Updating package repositories..."
    sudo apt-get update
    
    log "Installing required packages..."
    sudo apt-get install -y \
        curl \
        wget \
        git \
        nginx \
        postgresql \
        postgresql-contrib \
        redis-server \
        docker.io \
        docker-compose \
        certbot \
        python3-certbot-nginx \
        ufw \
        fail2ban \
        htop \
        iotop \
        jq \
        unzip
    
    success "System dependencies installed"
}

# Install Node.js and npm
install_nodejs() {
    header "Installing Node.js and npm"
    
    # Install Node.js 18.x LTS
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Install global npm packages
    sudo npm install -g pm2 k6
    
    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)
    
    log "Node.js version: $node_version"
    log "npm version: $npm_version"
    
    success "Node.js and npm installed successfully"
}

# Setup application directory and user
setup_application() {
    header "Setting Up Application Environment"
    
    # Create application user
    if ! id "$PROJECT_NAME" &>/dev/null; then
        log "Creating application user: $PROJECT_NAME"
        sudo useradd -m -s /bin/bash $PROJECT_NAME
        sudo usermod -aG docker $PROJECT_NAME
    fi
    
    # Create application directory
    APP_DIR="/opt/$PROJECT_NAME"
    sudo mkdir -p $APP_DIR
    sudo chown $PROJECT_NAME:$PROJECT_NAME $APP_DIR
    
    # Create necessary directories
    sudo -u $PROJECT_NAME mkdir -p \
        $APP_DIR/logs \
        $APP_DIR/data \
        $APP_DIR/backups \
        $APP_DIR/ssl
    
    success "Application environment set up"
}

# Clone and setup the application
deploy_application() {
    header "Deploying Universal PVP Application"
    
    APP_DIR="/opt/$PROJECT_NAME"
    
    log "Cloning application repository..."
    if [ -d "$APP_DIR/app" ]; then
        log "Application directory exists, pulling latest changes..."
        cd $APP_DIR/app
        sudo -u $PROJECT_NAME git pull origin main
    else
        sudo -u $PROJECT_NAME git clone https://github.com/universal-pvp/strategic-duel.git $APP_DIR/app
    fi
    
    cd $APP_DIR/app
    
    log "Installing application dependencies..."
    sudo -u $PROJECT_NAME npm ci --production
    
    log "Building application..."
    sudo -u $PROJECT_NAME npm run build
    
    success "Application deployed successfully"
}

# Setup database
setup_database() {
    header "Setting Up PostgreSQL Database"
    
    log "Configuring PostgreSQL..."
    
    # Generate database password
    DB_PASSWORD=$(openssl rand -base64 32)
    
    # Create database and user
    sudo -u postgres psql << EOF
CREATE DATABASE $DB_NAME;
CREATE USER $PROJECT_NAME WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $PROJECT_NAME;
ALTER USER $PROJECT_NAME CREATEDB;
\q
EOF
    
    # Configure PostgreSQL for production
    PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oP '(?<=PostgreSQL )\d+')
    PG_CONFIG="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
    PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"
    
    sudo tee -a $PG_CONFIG > /dev/null << EOF

# Universal PVP Production Settings
shared_preload_libraries = 'pg_stat_statements'
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
min_wal_size = 1GB
max_wal_size = 4GB
EOF
    
    # Restart PostgreSQL
    sudo systemctl restart postgresql
    sudo systemctl enable postgresql
    
    # Store database credentials securely
    echo "DB_PASSWORD=$DB_PASSWORD" | sudo tee /opt/$PROJECT_NAME/.env.db > /dev/null
    sudo chown $PROJECT_NAME:$PROJECT_NAME /opt/$PROJECT_NAME/.env.db
    sudo chmod 600 /opt/$PROJECT_NAME/.env.db
    
    success "PostgreSQL database configured"
}

# Setup Redis
setup_redis() {
    header "Setting Up Redis"
    
    log "Configuring Redis for production..."
    
    # Configure Redis
    sudo tee /etc/redis/redis.conf > /dev/null << EOF
# Universal PVP Redis Configuration
bind 127.0.0.1
port 6379
timeout 300
keepalive 60
tcp-backlog 511
databases 16
save 900 1
save 300 10
save 60 10000
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /var/lib/redis
maxmemory 512mb
maxmemory-policy allkeys-lru
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
EOF
    
    sudo systemctl restart redis-server
    sudo systemctl enable redis-server
    
    success "Redis configured and started"
}

# Setup monitoring stack
setup_monitoring() {
    header "Setting Up Monitoring Stack"
    
    APP_DIR="/opt/$PROJECT_NAME"
    MONITORING_DIR="$APP_DIR/monitoring"
    
    log "Setting up monitoring directory..."
    sudo -u $PROJECT_NAME mkdir -p $MONITORING_DIR
    
    # Copy monitoring configuration
    if [ -d "$APP_DIR/app/config/monitoring" ]; then
        sudo -u $PROJECT_NAME cp -r $APP_DIR/app/config/monitoring/* $MONITORING_DIR/
    fi
    
    log "Starting monitoring stack..."
    cd $MONITORING_DIR
    sudo -u $PROJECT_NAME docker-compose -f docker-compose.monitoring.yml up -d
    
    success "Monitoring stack deployed"
}

# Setup SSL certificates
setup_ssl() {
    header "Setting Up SSL Certificates"
    
    log "Obtaining SSL certificate for $DOMAIN..."
    
    # Stop nginx temporarily
    sudo systemctl stop nginx || true
    
    # Get certificate
    sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN --email $EMAIL --agree-tos --non-interactive
    
    success "SSL certificates obtained"
}

# Configure Nginx
configure_nginx() {
    header "Configuring Nginx"
    
    log "Creating Nginx configuration..."
    
    sudo tee /etc/nginx/sites-available/$PROJECT_NAME > /dev/null << EOF
# Universal PVP Nginx Configuration
upstream backend {
    server 127.0.0.1:5000;
    keepalive 32;
}

upstream frontend {
    server 127.0.0.1:3000;
    keepalive 32;
}

# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=100r/m;
limit_req_zone \$binary_remote_addr zone=general:10m rate=1000r/m;

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS Configuration
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;";
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # API routes (backend)
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # WebSocket connections
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
    
    # Metrics endpoint (restrict access)
    location /metrics {
        allow 127.0.0.1;
        deny all;
        proxy_pass http://backend;
    }
    
    # Frontend (Next.js)
    location / {
        limit_req zone=general burst=50 nodelay;
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Static files
    location /_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_pass http://frontend;
    }
    
    # Error pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /var/www/html;
    }
}

# Monitoring endpoints (internal only)
server {
    listen 8080;
    server_name localhost;
    
    location /nginx_status {
        stub_status;
        access_log off;
        allow 127.0.0.1;
        deny all;
    }
}
EOF
    
    # Enable site
    sudo ln -sf /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test configuration
    sudo nginx -t
    
    # Start and enable nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    success "Nginx configured and started"
}

# Setup firewall
setup_firewall() {
    header "Configuring Firewall (UFW)"
    
    log "Setting up firewall rules..."
    
    # Reset UFW
    sudo ufw --force reset
    
    # Default policies
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    
    # SSH access
    sudo ufw allow ssh
    
    # HTTP and HTTPS
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    
    # Internal monitoring (restrict to localhost)
    sudo ufw allow from 127.0.0.1 to any port 9090  # Prometheus
    sudo ufw allow from 127.0.0.1 to any port 3001  # Grafana
    sudo ufw allow from 127.0.0.1 to any port 9093  # Alertmanager
    
    # Enable firewall
    sudo ufw --force enable
    
    success "Firewall configured"
}

# Setup fail2ban
setup_fail2ban() {
    header "Setting Up Fail2Ban"
    
    log "Configuring fail2ban..."
    
    sudo tee /etc/fail2ban/jail.local > /dev/null << EOF
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/error.log
findtime = 600
bantime = 7200
maxretry = 10

[nginx-noscript]
enabled = true

[nginx-badbots]
enabled = true
EOF
    
    sudo systemctl restart fail2ban
    sudo systemctl enable fail2ban
    
    success "Fail2ban configured"
}

# Setup PM2 for process management
setup_pm2() {
    header "Setting Up PM2 Process Manager"
    
    APP_DIR="/opt/$PROJECT_NAME/app"
    
    log "Creating PM2 ecosystem file..."
    
    sudo -u $PROJECT_NAME tee $APP_DIR/ecosystem.config.js > /dev/null << EOF
module.exports = {
  apps: [
    {
      name: '$PROJECT_NAME-backend',
      script: 'src/backend/server.js',
      cwd: '$APP_DIR',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: '/opt/$PROJECT_NAME/logs/backend-error.log',
      out_file: '/opt/$PROJECT_NAME/logs/backend-out.log',
      log_file: '/opt/$PROJECT_NAME/logs/backend.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024'
    },
    {
      name: '$PROJECT_NAME-frontend',
      script: 'npm',
      args: 'start',
      cwd: '$APP_DIR',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/opt/$PROJECT_NAME/logs/frontend-error.log',
      out_file: '/opt/$PROJECT_NAME/logs/frontend-out.log',
      log_file: '/opt/$PROJECT_NAME/logs/frontend.log',
      time: true,
      max_memory_restart: '512M'
    },
    {
      name: '$PROJECT_NAME-cost-monitor',
      script: 'npx',
      args: 'ts-node scripts/monitoring/cost-monitor.ts daily',
      cwd: '$APP_DIR',
      cron_restart: '0 6 * * *',
      autorestart: false,
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/opt/$PROJECT_NAME/logs/cost-monitor-error.log',
      out_file: '/opt/$PROJECT_NAME/logs/cost-monitor-out.log',
    }
  ]
};
EOF
    
    # Start applications
    cd $APP_DIR
    sudo -u $PROJECT_NAME pm2 start ecosystem.config.js
    sudo -u $PROJECT_NAME pm2 save
    
    # Setup PM2 startup
    sudo -u $PROJECT_NAME pm2 startup systemd -u $PROJECT_NAME --hp /home/$PROJECT_NAME
    
    success "PM2 configured and applications started"
}

# Create environment file
create_env_file() {
    header "Creating Production Environment File"
    
    APP_DIR="/opt/$PROJECT_NAME/app"
    ENV_FILE="$APP_DIR/.env.production"
    
    # Source database password
    source /opt/$PROJECT_NAME/.env.db
    
    log "Creating production environment configuration..."
    
    # Generate secrets
    JWT_SECRET=$(openssl rand -base64 64)
    SESSION_SECRET=$(openssl rand -base64 32)
    
    sudo -u $PROJECT_NAME tee $ENV_FILE > /dev/null << EOF
# Universal PVP Production Environment Configuration
NODE_ENV=production
PORT=5000
FRONTEND_PORT=3000
DOMAIN=$DOMAIN

# Database Configuration
DATABASE_URL=postgresql://$PROJECT_NAME:$DB_PASSWORD@localhost:5432/$DB_NAME

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET

# MagicBlock Configuration
MAGICBLOCK_RPC_URL=https://mainnet.magicblock.app
EPHEMERAL_ROLLUP_ENDPOINT=wss://mainnet-er.magicblock.app
GAME_PROGRAM_ID=YourGameProgramIdHere

# Monitoring
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3001

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENABLE_CORS=true
CORS_ORIGIN=https://$DOMAIN

# Logging
LOG_LEVEL=info
LOG_DIR=/opt/$PROJECT_NAME/logs

# Email Configuration (update with your SMTP settings)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAIL=$EMAIL

# Backup Configuration
BACKUP_DIR=$BACKUP_DIR
BACKUP_RETENTION_DAYS=30

# Performance
MAX_REQUEST_SIZE=10mb
BODY_LIMIT=10mb
EOF
    
    sudo chmod 600 $ENV_FILE
    
    success "Production environment file created"
}

# Setup backup system
setup_backup() {
    header "Setting Up Backup System"
    
    log "Creating backup directories..."
    sudo mkdir -p $BACKUP_DIR/{database,application,logs}
    sudo chown -R $PROJECT_NAME:$PROJECT_NAME $BACKUP_DIR
    
    log "Creating backup script..."
    sudo tee /opt/$PROJECT_NAME/backup.sh > /dev/null << 'EOF'
#!/bin/bash

# Universal PVP Backup Script
BACKUP_DIR="/opt/backups/universal-pvp"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Database backup
pg_dump -h localhost -U universal-pvp universal_pvp_prod | gzip > "$BACKUP_DIR/database/backup_$DATE.sql.gz"

# Application backup (excluding node_modules and logs)
tar --exclude='node_modules' --exclude='.next' --exclude='logs' -czf "$BACKUP_DIR/application/app_$DATE.tar.gz" /opt/universal-pvp/app

# Log backup
tar -czf "$BACKUP_DIR/logs/logs_$DATE.tar.gz" /opt/universal-pvp/logs

# Cleanup old backups
find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
EOF
    
    sudo chmod +x /opt/$PROJECT_NAME/backup.sh
    sudo chown $PROJECT_NAME:$PROJECT_NAME /opt/$PROJECT_NAME/backup.sh
    
    # Setup cron job for daily backups
    (sudo -u $PROJECT_NAME crontab -l 2>/dev/null; echo "0 2 * * * /opt/$PROJECT_NAME/backup.sh >> /opt/$PROJECT_NAME/logs/backup.log 2>&1") | sudo -u $PROJECT_NAME crontab -
    
    success "Backup system configured"
}

# Health check and validation
run_health_check() {
    header "Running Health Checks"
    
    log "Checking service status..."
    
    # Check PostgreSQL
    if sudo systemctl is-active --quiet postgresql; then
        success "PostgreSQL is running"
    else
        error "PostgreSQL is not running"
    fi
    
    # Check Redis
    if sudo systemctl is-active --quiet redis-server; then
        success "Redis is running"
    else
        error "Redis is not running"
    fi
    
    # Check Nginx
    if sudo systemctl is-active --quiet nginx; then
        success "Nginx is running"
    else
        error "Nginx is not running"
    fi
    
    # Check application endpoints
    log "Checking application endpoints..."
    
    sleep 10  # Wait for services to fully start
    
    if curl -f http://localhost:5000/health > /dev/null 2>&1; then
        success "Backend health check passed"
    else
        warning "Backend health check failed"
    fi
    
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        success "Frontend is accessible"
    else
        warning "Frontend accessibility check failed"
    fi
    
    # Check HTTPS
    if curl -f -k https://$DOMAIN > /dev/null 2>&1; then
        success "HTTPS is working"
    else
        warning "HTTPS check failed"
    fi
    
    success "Health checks completed"
}

# Main installation flow
main() {
    header "Universal PVP Production Setup"
    
    log "Starting production deployment for $DOMAIN"
    log "Environment: $ENVIRONMENT"
    
    # Pre-flight checks
    check_root
    
    # System setup
    install_system_dependencies
    install_nodejs
    setup_application
    
    # Database and cache
    setup_database
    setup_redis
    
    # Application deployment
    deploy_application
    create_env_file
    
    # Web server and SSL
    setup_ssl
    configure_nginx
    
    # Security
    setup_firewall
    setup_fail2ban
    
    # Process management
    setup_pm2
    
    # Monitoring and backups
    setup_monitoring
    setup_backup
    
    # Final validation
    run_health_check
    
    # Success summary
    header "Deployment Complete!"
    
    echo -e "${GREEN}Universal PVP has been successfully deployed!${NC}"
    echo ""
    echo -e "${BLUE}Application URLs:${NC}"
    echo -e "  • Main site: https://$DOMAIN"
    echo -e "  • API: https://$DOMAIN/api"
    echo -e "  • Health check: https://$DOMAIN/health"
    echo ""
    echo -e "${BLUE}Monitoring:${NC}"
    echo -e "  • Grafana: http://localhost:3001"
    echo -e "  • Prometheus: http://localhost:9090"
    echo -e "  • Alertmanager: http://localhost:9093"
    echo ""
    echo -e "${BLUE}Management Commands:${NC}"
    echo -e "  • View logs: sudo -u $PROJECT_NAME pm2 logs"
    echo -e "  • Restart app: sudo -u $PROJECT_NAME pm2 restart all"
    echo -e "  • Check status: sudo -u $PROJECT_NAME pm2 status"
    echo -e "  • Run backup: /opt/$PROJECT_NAME/backup.sh"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "  1. Update MagicBlock configuration in .env.production"
    echo -e "  2. Configure email settings for alerts"
    echo -e "  3. Review and customize monitoring alerts"
    echo -e "  4. Set up external backup storage (AWS S3, etc.)"
    echo -e "  5. Configure DNS for $DOMAIN"
    echo ""
    echo -e "${GREEN}Deployment completed successfully!${NC}"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi