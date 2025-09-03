#!/bin/bash

# Production Deployment Script for MagicBlock PvP Game
# This script handles blue-green deployment with health checks and rollback capability

set -e

# Configuration
ENVIRONMENT="production"
AWS_REGION="us-east-1"
ECS_CLUSTER="magicblock-pvp-production"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
HEALTH_CHECK_URL="${PRODUCTION_URL}/health"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL}"

# Service configurations
SERVICES=(
  "magicblock-pvp-server:3000"
  "magicblock-pvp-web:80"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a deployment.log
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a deployment.log
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a deployment.log
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a deployment.log
}

# Send Slack notification
send_slack_notification() {
  local message="$1"
  local color="$2"
  
  if [ -n "$SLACK_WEBHOOK" ]; then
    curl -X POST -H 'Content-type: application/json' \
      --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$message\"}]}" \
      "$SLACK_WEBHOOK"
  fi
}

# Pre-deployment checks
pre_deployment_checks() {
  log_info "Running pre-deployment checks..."
  
  # Check AWS credentials
  if ! aws sts get-caller-identity > /dev/null 2>&1; then
    log_error "AWS credentials not configured"
    exit 1
  fi
  
  # Check required environment variables
  required_vars=("AWS_ACCOUNT_ID" "PRODUCTION_URL" "GITHUB_SHA")
  for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
      log_error "Required environment variable $var is not set"
      exit 1
    fi
  done
  
  # Check ECS cluster exists
  if ! aws ecs describe-clusters --clusters "$ECS_CLUSTER" > /dev/null 2>&1; then
    log_error "ECS cluster $ECS_CLUSTER not found"
    exit 1
  fi
  
  # Check database connectivity
  log_info "Checking database connectivity..."
  if ! timeout 10s bash -c "</dev/tcp/${DB_HOST:-localhost}/5432"; then
    log_error "Cannot connect to database"
    exit 1
  fi
  
  # Check Redis connectivity
  log_info "Checking Redis connectivity..."
  if ! timeout 5s bash -c "</dev/tcp/${REDIS_HOST:-localhost}/6379"; then
    log_error "Cannot connect to Redis"
    exit 1
  fi
  
  log_success "Pre-deployment checks passed"
}

# Build and push Docker images
build_and_push_images() {
  log_info "Building and pushing Docker images..."
  
  # Login to ECR
  aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "$ECR_REGISTRY"
  
  # Build server image
  log_info "Building server image..."
  docker build -t magicblock-pvp-server:latest -f apps/server/Dockerfile .
  docker tag magicblock-pvp-server:latest "$ECR_REGISTRY/magicblock-pvp-server:$GITHUB_SHA"
  docker tag magicblock-pvp-server:latest "$ECR_REGISTRY/magicblock-pvp-server:latest"
  
  # Build web image
  log_info "Building web image..."
  docker build -t magicblock-pvp-web:latest -f apps/web/Dockerfile .
  docker tag magicblock-pvp-web:latest "$ECR_REGISTRY/magicblock-pvp-web:$GITHUB_SHA"
  docker tag magicblock-pvp-web:latest "$ECR_REGISTRY/magicblock-pvp-web:latest"
  
  # Push images
  log_info "Pushing images to ECR..."
  docker push "$ECR_REGISTRY/magicblock-pvp-server:$GITHUB_SHA"
  docker push "$ECR_REGISTRY/magicblock-pvp-server:latest"
  docker push "$ECR_REGISTRY/magicblock-pvp-web:$GITHUB_SHA"
  docker push "$ECR_REGISTRY/magicblock-pvp-web:latest"
  
  log_success "Images built and pushed successfully"
}

# Run database migrations
run_migrations() {
  log_info "Running database migrations..."
  
  # Create migration task
  aws ecs run-task \
    --cluster "$ECS_CLUSTER" \
    --task-definition "magicblock-pvp-migration" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
    --overrides "{
      \"containerOverrides\": [{
        \"name\": \"migration\",
        \"environment\": [
          {\"name\": \"DATABASE_URL\", \"value\": \"$DATABASE_URL\"},
          {\"name\": \"NODE_ENV\", \"value\": \"production\"}
        ]
      }]
    }" > migration-task.json
  
  # Wait for migration to complete
  MIGRATION_TASK_ARN=$(jq -r '.tasks[0].taskArn' migration-task.json)
  
  log_info "Waiting for migration task to complete..."
  aws ecs wait tasks-stopped \
    --cluster "$ECS_CLUSTER" \
    --tasks "$MIGRATION_TASK_ARN"
  
  # Check migration status
  MIGRATION_STATUS=$(aws ecs describe-tasks \
    --cluster "$ECS_CLUSTER" \
    --tasks "$MIGRATION_TASK_ARN" \
    --query 'tasks[0].lastStatus' \
    --output text)
  
  if [ "$MIGRATION_STATUS" != "STOPPED" ]; then
    log_error "Migration failed"
    exit 1
  fi
  
  log_success "Database migrations completed"
}

# Deploy to ECS with blue-green strategy
deploy_to_ecs() {
  log_info "Starting blue-green deployment..."
  
  for service_config in "${SERVICES[@]}"; do
    IFS=':' read -r service_name service_port <<< "$service_config"
    
    log_info "Deploying $service_name..."
    
    # Get current task definition
    CURRENT_TASK_DEF=$(aws ecs describe-services \
      --cluster "$ECS_CLUSTER" \
      --services "$service_name" \
      --query 'services[0].taskDefinition' \
      --output text)
    
    # Create new task definition with updated image
    NEW_TASK_DEF=$(aws ecs describe-task-definition \
      --task-definition "$CURRENT_TASK_DEF" \
      --query 'taskDefinition' \
      --output json | \
      jq --arg IMAGE "$ECR_REGISTRY/$service_name:$GITHUB_SHA" \
      '.containerDefinitions[0].image = $IMAGE | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy)')
    
    # Register new task definition
    NEW_TASK_DEF_ARN=$(echo "$NEW_TASK_DEF" | \
      aws ecs register-task-definition \
      --cli-input-json file:///dev/stdin \
      --query 'taskDefinition.taskDefinitionArn' \
      --output text)
    
    # Update service with new task definition
    aws ecs update-service \
      --cluster "$ECS_CLUSTER" \
      --service "$service_name" \
      --task-definition "$NEW_TASK_DEF_ARN" \
      --desired-count 2 > /dev/null
    
    log_info "Waiting for $service_name to stabilize..."
    aws ecs wait services-stable \
      --cluster "$ECS_CLUSTER" \
      --services "$service_name"
    
    log_success "$service_name deployed successfully"
  done
}

# Health checks
run_health_checks() {
  log_info "Running health checks..."
  
  local max_attempts=10
  local attempt=1
  local health_ok=false
  
  while [ $attempt -le $max_attempts ]; do
    log_info "Health check attempt $attempt/$max_attempts"
    
    # Basic health check
    if curl -f -s "$HEALTH_CHECK_URL" > /dev/null; then
      log_info "Basic health check passed"
      
      # Detailed health check
      local health_response=$(curl -s "$HEALTH_CHECK_URL")
      local health_status=$(echo "$health_response" | jq -r '.status')
      
      if [ "$health_status" = "healthy" ]; then
        log_success "Detailed health check passed"
        health_ok=true
        break
      else
        log_warning "Detailed health check failed: $health_status"
      fi
    else
      log_warning "Basic health check failed"
    fi
    
    if [ $attempt -eq $max_attempts ]; then
      log_error "Health checks failed after $max_attempts attempts"
      return 1
    fi
    
    sleep 30
    ((attempt++))
  done
  
  if [ "$health_ok" = true ]; then
    log_success "All health checks passed"
    return 0
  else
    return 1
  fi
}

# Performance tests
run_performance_tests() {
  log_info "Running performance tests..."
  
  # Run critical path smoke tests
  local test_results=$(curl -s "$PRODUCTION_URL/api/health/performance")
  local p95_latency=$(echo "$test_results" | jq -r '.p95Latency')
  local success_rate=$(echo "$test_results" | jq -r '.successRate')
  
  # Check performance targets
  if (( $(echo "$p95_latency > 100" | bc -l) )); then
    log_error "P95 latency ${p95_latency}ms exceeds 100ms target"
    return 1
  fi
  
  if (( $(echo "$success_rate < 0.999" | bc -l) )); then
    log_error "Success rate ${success_rate} below 99.9% target"
    return 1
  fi
  
  # Test critical game flows
  log_info "Testing critical game flows..."
  
  local game_creation_test=$(curl -s -X POST "$PRODUCTION_URL/api/games" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"gameType":"PVP","betAmount":1000000,"maxPlayers":2,"timeLimit":30000}' \
    -w "%{http_code}")
  
  if [ "${game_creation_test: -3}" != "201" ]; then
    log_error "Game creation test failed"
    return 1
  fi
  
  log_success "Performance tests passed"
  return 0
}

# Rollback function
rollback_deployment() {
  log_warning "Rolling back deployment..."
  
  send_slack_notification "🚨 Production deployment rollback initiated" "warning"
  
  for service_config in "${SERVICES[@]}"; do
    IFS=':' read -r service_name service_port <<< "$service_config"
    
    log_info "Rolling back $service_name..."
    
    # Get previous task definition
    PREVIOUS_TASK_DEF=$(aws ecs list-task-definitions \
      --family-prefix "$service_name" \
      --status ACTIVE \
      --sort DESC \
      --max-items 2 \
      --query 'taskDefinitionArns[1]' \
      --output text)
    
    # Update service with previous task definition
    aws ecs update-service \
      --cluster "$ECS_CLUSTER" \
      --service "$service_name" \
      --task-definition "$PREVIOUS_TASK_DEF" > /dev/null
    
    # Wait for rollback to complete
    aws ecs wait services-stable \
      --cluster "$ECS_CLUSTER" \
      --services "$service_name"
    
    log_success "$service_name rolled back successfully"
  done
  
  log_success "Rollback completed"
  send_slack_notification "✅ Production deployment rollback completed" "good"
}

# Main deployment function
main() {
  log_info "Starting production deployment for commit $GITHUB_SHA"
  send_slack_notification "🚀 Production deployment started for commit $GITHUB_SHA" "#439FE0"
  
  # Record start time
  local start_time=$(date +%s)
  
  # Trap errors for rollback
  trap 'log_error "Deployment failed, initiating rollback..."; rollback_deployment; exit 1' ERR
  
  # Deployment steps
  pre_deployment_checks
  build_and_push_images
  run_migrations
  deploy_to_ecs
  
  # Post-deployment verification
  if ! run_health_checks; then
    log_error "Health checks failed"
    rollback_deployment
    exit 1
  fi
  
  if ! run_performance_tests; then
    log_error "Performance tests failed"
    rollback_deployment
    exit 1
  fi
  
  # Calculate deployment time
  local end_time=$(date +%s)
  local deployment_time=$((end_time - start_time))
  
  log_success "Production deployment completed successfully in ${deployment_time}s"
  
  # Send success notification
  send_slack_notification "✅ Production deployment completed successfully in ${deployment_time}s
  
Commit: $GITHUB_SHA
Environment: Production
Services: $(IFS=,; echo "${SERVICES[*]}")
Health Status: ✅ All checks passed" "good"

  # Update deployment status
  curl -X POST "$PRODUCTION_URL/api/internal/deployment-status" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
    -d "{
      \"status\": \"success\",
      \"commit\": \"$GITHUB_SHA\",
      \"deploymentTime\": $deployment_time,
      \"environment\": \"production\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }"
}

# Cleanup function
cleanup() {
  log_info "Cleaning up deployment artifacts..."
  rm -f migration-task.json deployment.log
}

# Set cleanup trap
trap cleanup EXIT

# Validate arguments
if [ $# -eq 0 ]; then
  echo "Usage: $0 [deploy|rollback|health-check]"
  exit 1
fi

case "$1" in
  deploy)
    main
    ;;
  rollback)
    rollback_deployment
    ;;
  health-check)
    run_health_checks
    ;;
  *)
    echo "Unknown command: $1"
    echo "Usage: $0 [deploy|rollback|health-check]"
    exit 1
    ;;
esac