#!/bin/bash

# Database restore script for MagicBlock PvP
# This script restores PostgreSQL and Redis from backup files

set -e

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# Logging functions
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

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -f, --file BACKUP_FILE    Specify PostgreSQL backup file"
    echo "  -r, --redis REDIS_FILE    Specify Redis backup file"
    echo "  -d, --date DATE           Restore from specific date (YYYYMMDD_HHMMSS)"
    echo "  -l, --list               List available backups"
    echo "  --schema-only            Restore schema only (no data)"
    echo "  --data-only              Restore data only (no schema)"
    echo "  --exclude-tables TABLES   Comma-separated list of tables to exclude"
    echo "  --dry-run                Show what would be done without executing"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --date 20240103_140530        # Restore from specific backup"
    echo "  $0 --file backup.sql.gz          # Restore from specific file"
    echo "  $0 --schema-only --date latest    # Restore only schema from latest backup"
    echo "  $0 --list                        # List all available backups"
}

# Default values
BACKUP_DIR="/var/backups/magicblock-pvp"
PG_BACKUP_FILE=""
REDIS_BACKUP_FILE=""
BACKUP_DATE=""
SCHEMA_ONLY=false
DATA_ONLY=false
EXCLUDE_TABLES=""
DRY_RUN=false
LIST_BACKUPS=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--file)
            PG_BACKUP_FILE="$2"
            shift 2
            ;;
        -r|--redis)
            REDIS_BACKUP_FILE="$2"
            shift 2
            ;;
        -d|--date)
            BACKUP_DATE="$2"
            shift 2
            ;;
        -l|--list)
            LIST_BACKUPS=true
            shift
            ;;
        --schema-only)
            SCHEMA_ONLY=true
            shift
            ;;
        --data-only)
            DATA_ONLY=true
            shift
            ;;
        --exclude-tables)
            EXCLUDE_TABLES="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

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
    DB_USER=$(echo $DATABASE_URL | sed -n 's|postgresql://\\([^:]*\\):.*@.*:.*/.*.*/\\1/p')
    DB_PASS=$(echo $DATABASE_URL | sed -n 's|postgresql://[^:]*:\\([^@]*\\)@.*:.*/.*.*/\\1/p')
    DB_HOST=$(echo $DATABASE_URL | sed -n 's|postgresql://[^@]*@\\([^:]*\\):.*/.*.*/\\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's|postgresql://[^@]*@[^:]*:\\([0-9]*\\)/.*.*/\\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's|postgresql://[^/]*/\\([^?]*\\).*.*/\\1/p')
else
    DB_HOST=${DB_HOST:-localhost}
    DB_PORT=${DB_PORT:-5432}
    DB_USER=${DB_USER:-postgres}
    DB_NAME=${DB_NAME:-magicblock_pvp}
fi

# Redis configuration
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-""}

# List available backups
list_backups() {
    log "Available backups in $BACKUP_DIR:"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ]; then
        warn "Backup directory does not exist: $BACKUP_DIR"
        return
    fi
    
    cd "$BACKUP_DIR"
    
    # Find all backup manifests
    for manifest in backup_manifest_*.json; do
        if [ -f "$manifest" ]; then
            DATE_FROM_FILE=$(echo "$manifest" | sed 's/backup_manifest_\\(.*\\)\\.json/\\1/')
            
            # Extract info from manifest
            TIMESTAMP=$(jq -r '.timestamp // "unknown"' "$manifest" 2>/dev/null)
            ENV=$(jq -r '.environment // "unknown"' "$manifest" 2>/dev/null)
            PG_SIZE=$(jq -r '.database.size // "unknown"' "$manifest" 2>/dev/null)
            REDIS_SIZE=$(jq -r '.redis.size // "unknown"' "$manifest" 2>/dev/null)
            
            echo "📅 Date: $DATE_FROM_FILE"
            echo "   Timestamp: $TIMESTAMP"
            echo "   Environment: $ENV"
            echo "   PostgreSQL: $PG_SIZE"
            echo "   Redis: $REDIS_SIZE"
            echo ""
        fi
    done
    
    # If no manifests found, look for backup files directly
    if ! ls backup_manifest_*.json 1> /dev/null 2>&1; then
        warn "No backup manifests found, listing files directly:"
        ls -la *.sql.gz *.rdb.gz 2>/dev/null || warn "No backup files found"
    fi
}

if [ "$LIST_BACKUPS" = true ]; then
    list_backups
    exit 0
fi

# Determine backup files to use
if [ -z "$PG_BACKUP_FILE" ] && [ -z "$REDIS_BACKUP_FILE" ]; then
    if [ -z "$BACKUP_DATE" ]; then
        error "Please specify either backup files (-f, -r) or a backup date (-d)"
    fi
    
    cd "$BACKUP_DIR"
    
    if [ "$BACKUP_DATE" = "latest" ]; then
        BACKUP_DATE=$(ls backup_manifest_*.json 2>/dev/null | sort | tail -1 | sed 's/backup_manifest_\\(.*\\)\\.json/\\1/')
        if [ -z "$BACKUP_DATE" ]; then
            error "No backups found"
        fi
        log "Using latest backup: $BACKUP_DATE"
    fi
    
    PG_BACKUP_FILE="postgres_${BACKUP_DATE}.sql.gz"
    REDIS_BACKUP_FILE="redis_${BACKUP_DATE}.rdb.gz"
fi

# Verify backup files exist
if [ ! -z "$PG_BACKUP_FILE" ] && [ ! -f "$BACKUP_DIR/$PG_BACKUP_FILE" ]; then
    error "PostgreSQL backup file not found: $BACKUP_DIR/$PG_BACKUP_FILE"
fi

if [ ! -z "$REDIS_BACKUP_FILE" ] && [ ! -f "$BACKUP_DIR/$REDIS_BACKUP_FILE" ]; then
    warn "Redis backup file not found: $BACKUP_DIR/$REDIS_BACKUP_FILE"
    REDIS_BACKUP_FILE=""
fi

# Safety check for production
if [[ "$NODE_ENV" == "production" && "$FORCE_RESTORE" != "true" ]]; then
    echo -e "${RED}⚠️  WARNING: You are about to restore a PRODUCTION database!${NC}"
    echo "This will DESTROY all current data and replace it with backup data."
    echo ""
    echo "Database: $DB_NAME on $DB_HOST:$DB_PORT"
    echo "PostgreSQL backup: $PG_BACKUP_FILE"
    echo "Redis backup: $REDIS_BACKUP_FILE"
    echo ""
    read -p "Type 'CONFIRM RESTORE' to proceed: " -r
    echo ""
    if [[ $REPLY != "CONFIRM RESTORE" ]]; then
        error "Restore cancelled"
    fi
fi

log "Starting database restore process..."

# Dry run mode
if [ "$DRY_RUN" = true ]; then
    info "DRY RUN MODE - No actual changes will be made"
    info "Would restore PostgreSQL from: $PG_BACKUP_FILE"
    if [ ! -z "$REDIS_BACKUP_FILE" ]; then
        info "Would restore Redis from: $REDIS_BACKUP_FILE"
    fi
    info "Target database: $DB_NAME on $DB_HOST:$DB_PORT"
    exit 0
fi

# Set password for PostgreSQL
if [ ! -z "$DB_PASS" ]; then
    export PGPASSWORD="$DB_PASS"
fi

# PostgreSQL Restore
if [ ! -z "$PG_BACKUP_FILE" ]; then
    log "Restoring PostgreSQL from: $PG_BACKUP_FILE"
    
    cd "$BACKUP_DIR"
    
    # Check if backup file is valid
    if ! gzip -t "$PG_BACKUP_FILE"; then
        error "Invalid or corrupted backup file: $PG_BACKUP_FILE"
    fi
    
    # Prepare restore options
    RESTORE_OPTS="--verbose --single-transaction"
    
    if [ "$SCHEMA_ONLY" = true ]; then
        RESTORE_OPTS="$RESTORE_OPTS --schema-only"
    elif [ "$DATA_ONLY" = true ]; then
        RESTORE_OPTS="$RESTORE_OPTS --data-only"
    fi
    
    # Add excluded tables
    if [ ! -z "$EXCLUDE_TABLES" ]; then
        IFS=',' read -ra TABLES <<< "$EXCLUDE_TABLES"
        for table in "${TABLES[@]}"; do
            RESTORE_OPTS="$RESTORE_OPTS --exclude-table=$table"
        done
    fi
    
    # Create a temporary database for restoration testing
    TEMP_DB="${DB_NAME}_restore_temp"
    
    log "Creating temporary database: $TEMP_DB"
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEMP_DB" || warn "Temporary database may already exist"
    
    # Test restore to temporary database first
    log "Testing restore to temporary database..."
    if gunzip -c "$PG_BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEMP_DB" $RESTORE_OPTS > /dev/null; then
        log "Test restore successful"
    else
        dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEMP_DB" 2>/dev/null
        error "Test restore failed - backup may be corrupted"
    fi
    
    # Drop temporary database
    log "Cleaning up temporary database"
    dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEMP_DB"
    
    # Terminate active connections to target database
    log "Terminating active connections to target database..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "postgres" -c "
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
    " > /dev/null 2>&1
    
    # Actual restore
    log "Performing actual restore to: $DB_NAME"
    if gunzip -c "$PG_BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" $RESTORE_OPTS; then
        log "PostgreSQL restore completed successfully"
        
        # Update statistics
        log "Analyzing database statistics..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ANALYZE;" > /dev/null
        
    else
        error "PostgreSQL restore failed"
    fi
fi

# Redis Restore
if [ ! -z "$REDIS_BACKUP_FILE" ]; then
    log "Restoring Redis from: $REDIS_BACKUP_FILE"
    
    cd "$BACKUP_DIR"
    
    # Redis auth
    if [ ! -z "$REDIS_PASSWORD" ]; then
        REDIS_AUTH="-a $REDIS_PASSWORD"
    else
        REDIS_AUTH=""
    fi
    
    # Check Redis connection
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH ping > /dev/null; then
        error "Cannot connect to Redis server"
    fi
    
    # Flush current Redis data (with confirmation)
    log "Flushing current Redis data..."
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH FLUSHALL
    
    # Get Redis data directory
    REDIS_DATA_DIR=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH CONFIG GET dir | tail -1)
    REDIS_RDB_FILE=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH CONFIG GET dbfilename | tail -1)
    
    # Stop Redis temporarily to replace RDB file
    log "Stopping Redis to restore RDB file..."
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl stop redis-server
    elif command -v service >/dev/null 2>&1; then
        sudo service redis-server stop
    else
        warn "Cannot stop Redis automatically - please stop Redis manually"
        read -p "Press enter when Redis is stopped..."
    fi
    
    # Restore RDB file
    log "Restoring RDB file to: $REDIS_DATA_DIR/$REDIS_RDB_FILE"
    gunzip -c "$REDIS_BACKUP_FILE" > "$REDIS_DATA_DIR/$REDIS_RDB_FILE"
    
    # Set proper ownership
    if [ -f "/etc/redis/redis.conf" ]; then
        REDIS_USER=$(grep "^user " /etc/redis/redis.conf | cut -d' ' -f2 2>/dev/null || echo "redis")
        sudo chown $REDIS_USER:$REDIS_USER "$REDIS_DATA_DIR/$REDIS_RDB_FILE"
    fi
    
    # Start Redis
    log "Starting Redis..."
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl start redis-server
    elif command -v service >/dev/null 2>&1; then
        sudo service redis-server start
    else
        warn "Please start Redis manually"
    fi
    
    # Wait for Redis to start
    sleep 2
    
    # Verify Redis restore
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH ping > /dev/null; then
        KEY_COUNT=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" $REDIS_AUTH DBSIZE)
        log "Redis restore completed successfully. Keys restored: $KEY_COUNT"
    else
        error "Redis restore verification failed"
    fi
fi

# Post-restore tasks
log "Running post-restore tasks..."

# Run Prisma generate and deploy
if [ -f "package.json" ] && command -v npm >/dev/null 2>&1; then
    log "Generating Prisma client..."
    npm run db:generate > /dev/null 2>&1 || warn "Failed to generate Prisma client"
fi

# Create restore log entry
RESTORE_LOG_FILE="$BACKUP_DIR/restore_log_$(date +"%Y%m%d_%H%M%S").json"
cat > "$RESTORE_LOG_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "${NODE_ENV:-development}",
  "restored_files": {
    "postgres": "$PG_BACKUP_FILE",
    "redis": "$REDIS_BACKUP_FILE"
  },
  "options": {
    "schema_only": $SCHEMA_ONLY,
    "data_only": $DATA_ONLY,
    "excluded_tables": "$EXCLUDE_TABLES"
  },
  "target_database": {
    "host": "$DB_HOST",
    "port": "$DB_PORT",
    "name": "$DB_NAME"
  },
  "restored_by": "$(whoami)",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
}
EOF

log "Restore log created: $RESTORE_LOG_FILE"

# Optional: Send notification
if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \\
        --data '{"text":"🔄 MagicBlock PvP Database restored successfully\\nPostgreSQL: '"$PG_BACKUP_FILE"'\\nRedis: '"$REDIS_BACKUP_FILE"'\\nEnvironment: '"${NODE_ENV:-development}"'"}' \\
        "$SLACK_WEBHOOK_URL" > /dev/null 2>&1
fi

log "Database restore completed successfully!"
log "PostgreSQL: $PG_BACKUP_FILE"
if [ ! -z "$REDIS_BACKUP_FILE" ]; then
    log "Redis: $REDIS_BACKUP_FILE"
fi
log "Target: $DB_NAME on $DB_HOST:$DB_PORT"

# Final recommendations
echo ""
info "Post-restore recommendations:"
info "1. Run application tests to verify data integrity"
info "2. Check application logs for any issues"
info "3. Monitor database performance for any anomalies"
info "4. Consider running VACUUM ANALYZE on large tables"