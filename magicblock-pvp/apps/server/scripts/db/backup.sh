#!/bin/bash

# Database backup script for MagicBlock PvP
# This script creates compressed backups of both PostgreSQL and Redis

set -e

# Configuration
BACKUP_DIR="/var/backups/magicblock-pvp"
DATE=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if running in production
if [[ "$NODE_ENV" == "production" && -z "$FORCE_BACKUP" ]]; then
    read -p "Are you sure you want to backup production database? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        error "Backup cancelled"
    fi
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
elif [ -f .env.production ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
else
    warn "No environment file found, using system defaults"
fi

# Parse DATABASE_URL if provided
if [ ! -z "$DATABASE_URL" ]; then
    # Extract components from postgresql://user:pass@host:port/dbname
    DB_USER=$(echo $DATABASE_URL | sed -n 's|postgresql://\\([^:]*\\):.*@.*:.*/.*.*/\\1/p')
    DB_PASS=$(echo $DATABASE_URL | sed -n 's|postgresql://[^:]*:\\([^@]*\\)@.*:.*/.*.*/\\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's|postgresql://[^@]*@\\([^:]*\\):.*/.*.*/\\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's|postgresql://[^@]*@[^:]*:\\([0-9]*\\)/.*.*/\\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's|postgresql://[^/]*/\\([^?]*\\).*.*/\\1/p')
else
    # Fallback to individual env vars
    DB_HOST=${DB_HOST:-localhost}
    DB_PORT=${DB_PORT:-5432}
    DB_USER=${DB_USER:-postgres}
    DB_NAME=${DB_NAME:-magicblock_pvp}
fi

# Redis configuration
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-""}

# Create backup directory
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

log "Starting backup process..."

# PostgreSQL Backup
log "Creating PostgreSQL backup..."
PG_BACKUP_FILE="postgres_${DATE}.sql.gz"

if [ ! -z "$DB_PASS" ]; then
    export PGPASSWORD="$DB_PASS"
fi

# Create the backup
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \\
    --verbose --clean --no-owner --no-privileges \\
    --exclude-table-data='sessions' \\
    --exclude-table-data='cost_metrics' | gzip > "$PG_BACKUP_FILE"; then
    
    log "PostgreSQL backup created: $PG_BACKUP_FILE"
    
    # Get backup size
    PG_SIZE=$(du -h "$PG_BACKUP_FILE" | cut -f1)
    log "PostgreSQL backup size: $PG_SIZE"
else
    error "PostgreSQL backup failed"
fi

# Schema-only backup for version control
SCHEMA_BACKUP_FILE="schema_${DATE}.sql"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \\
    --schema-only --no-owner --no-privileges > "$SCHEMA_BACKUP_FILE"; then
    
    log "Schema backup created: $SCHEMA_BACKUP_FILE"
else
    warn "Schema backup failed"
fi

# Redis Backup
log "Creating Redis backup..."
REDIS_BACKUP_FILE="redis_${DATE}.rdb"

if [ ! -z "$REDIS_PASSWORD" ]; then
    REDIS_AUTH="-a $REDIS_PASSWORD"
else
    REDIS_AUTH=""
fi

# Force Redis to save current state
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH BGSAVE; then
    log "Redis background save initiated"
    
    # Wait for background save to complete
    while [ "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH LASTSAVE)" = "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH LASTSAVE)" ]; do
        sleep 1
    done
    
    # Copy the RDB file
    REDIS_DATA_DIR=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH CONFIG GET dir | tail -1)
    REDIS_RDB_FILE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH CONFIG GET dbfilename | tail -1)
    
    if [ -f "$REDIS_DATA_DIR/$REDIS_RDB_FILE" ]; then
        cp "$REDIS_DATA_DIR/$REDIS_RDB_FILE" "$REDIS_BACKUP_FILE"
        gzip "$REDIS_BACKUP_FILE"
        REDIS_BACKUP_FILE="${REDIS_BACKUP_FILE}.gz"
        
        REDIS_SIZE=$(du -h "$REDIS_BACKUP_FILE" | cut -f1)
        log "Redis backup created: $REDIS_BACKUP_FILE (Size: $REDIS_SIZE)"
    else
        warn "Could not locate Redis RDB file"
    fi
else
    warn "Redis backup failed"
fi

# Create backup manifest
MANIFEST_FILE="backup_manifest_${DATE}.json"
cat > "$MANIFEST_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "${NODE_ENV:-development}",
  "database": {
    "host": "$DB_HOST",
    "port": "$DB_PORT",
    "name": "$DB_NAME",
    "backup_file": "$PG_BACKUP_FILE",
    "schema_file": "$SCHEMA_BACKUP_FILE",
    "size": "$PG_SIZE"
  },
  "redis": {
    "host": "$REDIS_HOST",
    "port": "$REDIS_PORT",
    "backup_file": "$REDIS_BACKUP_FILE",
    "size": "$REDIS_SIZE"
  },
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF

log "Backup manifest created: $MANIFEST_FILE"

# Verify backups
log "Verifying backups..."

# Test PostgreSQL backup
if gzip -t "$PG_BACKUP_FILE" && [ -s "$PG_BACKUP_FILE" ]; then
    log "PostgreSQL backup verification: PASSED"
else
    error "PostgreSQL backup verification: FAILED"
fi

# Test Redis backup if it exists
if [ -f "$REDIS_BACKUP_FILE" ]; then
    if gzip -t "$REDIS_BACKUP_FILE" && [ -s "$REDIS_BACKUP_FILE" ]; then
        log "Redis backup verification: PASSED"
    else
        warn "Redis backup verification: FAILED"
    fi
fi

# Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.rdb.gz" -type f -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.sql" -type f -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "backup_manifest_*.json" -type f -mtime +$RETENTION_DAYS -delete

# Summary
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Backup completed successfully!"
log "Backup directory: $BACKUP_DIR"
log "Total backup size: $TOTAL_SIZE"

# Optional: Upload to cloud storage
if [ ! -z "$BACKUP_S3_BUCKET" ] && command -v aws >/dev/null 2>&1; then
    log "Uploading backups to S3..."
    aws s3 cp "$PG_BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/postgres/" --storage-class STANDARD_IA
    aws s3 cp "$REDIS_BACKUP_FILE" "s3://$BACKUP_S3_BUCKET/redis/" --storage-class STANDARD_IA
    aws s3 cp "$MANIFEST_FILE" "s3://$BACKUP_S3_BUCKET/manifests/"
    log "Backups uploaded to S3"
fi

# Send notification (optional)
if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \\
        --data '{"text":"✅ MagicBlock PvP Database backup completed successfully\\nSize: '"$TOTAL_SIZE"'\\nLocation: '"$BACKUP_DIR"'"}' \\
        "$SLACK_WEBHOOK_URL" > /dev/null 2>&1
fi

log "All backup operations completed!"