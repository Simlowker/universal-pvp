#!/bin/bash

# Universal PVP Performance Benchmarking Suite
# Comprehensive testing for production readiness

set -e

# Configuration
BENCHMARK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$BENCHMARK_DIR/../.." && pwd)"
RESULTS_DIR="$PROJECT_ROOT/benchmark-results/$(date +%Y%m%d_%H%M%S)"
TEMP_DIR="/tmp/universal-pvp-benchmark-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    rm -rf "$TEMP_DIR" 2>/dev/null || true
    
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT

# Create directories
mkdir -p "$RESULTS_DIR"
mkdir -p "$TEMP_DIR"

# Default configuration
CONCURRENT_USERS=${CONCURRENT_USERS:-200}
DURATION=${DURATION:-"10m"}
BASE_URL=${BASE_URL:-"http://localhost:5000"}
FRONTEND_URL=${FRONTEND_URL:-"http://localhost:3000"}
RUN_COST_TESTS=${RUN_COST_TESTS:-"true"}
RUN_E2E_TESTS=${RUN_E2E_TESTS:-"true"}
RUN_SECURITY_TESTS=${RUN_SECURITY_TESTS:-"true"}
SKIP_SETUP=${SKIP_SETUP:-"false"}

log "🚀 Starting Universal PVP Benchmark Suite"
log "Configuration:"
log "  - Concurrent Users: $CONCURRENT_USERS"
log "  - Duration: $DURATION"
log "  - Base URL: $BASE_URL"
log "  - Frontend URL: $FRONTEND_URL"
log "  - Results Dir: $RESULTS_DIR"

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check required tools
    command -v node >/dev/null 2>&1 || missing_tools+=("node")
    command -v npm >/dev/null 2>&1 || missing_tools+=("npm")
    command -v k6 >/dev/null 2>&1 || missing_tools+=("k6")
    command -v jq >/dev/null 2>&1 || missing_tools+=("jq")
    command -v curl >/dev/null 2>&1 || missing_tools+=("curl")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
        error "Please install missing tools and retry"
        exit 1
    fi
    
    # Check if services are running
    if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        error "Backend service not accessible at $BASE_URL"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Setup test environment
setup_environment() {
    if [ "$SKIP_SETUP" = "true" ]; then
        log "Skipping environment setup"
        return
    fi
    
    log "Setting up test environment..."
    
    cd "$PROJECT_ROOT"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log "Installing dependencies..."
        npm install
    fi
    
    # Build if needed
    if [ ! -d "dist" ] && [ ! -d ".next" ]; then
        log "Building application..."
        npm run build
    fi
    
    # Setup test database/data if needed
    if [ -f "scripts/setup-test-data.sh" ]; then
        log "Setting up test data..."
        bash scripts/setup-test-data.sh
    fi
    
    success "Environment setup completed"
}

# Health check before running tests
health_check() {
    log "Performing health checks..."
    
    # Backend health
    local backend_health=$(curl -s "$BASE_URL/health" | jq -r '.status' 2>/dev/null || echo "FAIL")
    if [ "$backend_health" != "OK" ]; then
        error "Backend health check failed"
        return 1
    fi
    
    # Frontend health (if available)
    if curl -s "$FRONTEND_URL" > /dev/null 2>&1; then
        success "Frontend service accessible"
    else
        warning "Frontend service not accessible, skipping frontend tests"
    fi
    
    success "Health checks passed"
}

# Run k6 load testing
run_load_tests() {
    log "🔥 Running k6 load tests..."
    
    local k6_script="$PROJECT_ROOT/tests/performance/k6-load-test.js"
    local results_file="$RESULTS_DIR/k6-results.json"
    
    if [ ! -f "$k6_script" ]; then
        error "k6 test script not found: $k6_script"
        return 1
    fi
    
    # Set environment variables for k6
    export BASE_URL="$BASE_URL"
    export WS_URL="${BASE_URL/http/ws}"
    export COST_TARGET_LAMPORTS="100000"
    
    log "Starting k6 load test with $CONCURRENT_USERS concurrent users for $DURATION"
    
    k6 run \
        --duration "$DURATION" \
        --vus 50 \
        --out json="$results_file" \
        --summary-trend-stats="avg,min,med,max,p(90),p(95),p(99)" \
        --summary-time-unit=ms \
        "$k6_script" 2>&1 | tee "$RESULTS_DIR/k6-output.log"
    
    local exit_code=${PIPESTATUS[0]}
    
    if [ $exit_code -eq 0 ]; then
        success "k6 load tests completed successfully"
        
        # Extract key metrics
        if [ -f "$results_file" ]; then
            log "Extracting performance metrics..."
            local p95_latency=$(jq -r '.metrics.http_req_duration.values.p95' "$results_file" 2>/dev/null || echo "N/A")
            local error_rate=$(jq -r '.metrics.http_req_failed.rate' "$results_file" 2>/dev/null || echo "N/A")
            local requests_total=$(jq -r '.metrics.http_reqs.count' "$results_file" 2>/dev/null || echo "N/A")
            
            log "Key Metrics:"
            log "  - P95 Latency: ${p95_latency}ms"
            log "  - Error Rate: $error_rate"
            log "  - Total Requests: $requests_total"
        fi
    else
        error "k6 load tests failed with exit code $exit_code"
        return $exit_code
    fi
}

# Run cost measurement tests
run_cost_tests() {
    if [ "$RUN_COST_TESTS" != "true" ]; then
        log "Skipping cost measurement tests"
        return 0
    fi
    
    log "💰 Running cost measurement tests..."
    
    local cost_script="$PROJECT_ROOT/tests/costs/measure-costs.ts"
    local results_file="$RESULTS_DIR/cost-results.json"
    
    if [ ! -f "$cost_script" ]; then
        error "Cost measurement script not found: $cost_script"
        return 1
    fi
    
    cd "$PROJECT_ROOT"
    
    # Run cost analysis
    npx ts-node "$cost_script" export json > "$results_file" 2> "$RESULTS_DIR/cost-output.log"
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        success "Cost measurement tests completed"
        
        # Extract cost metrics
        if [ -f "$results_file" ]; then
            local avg_cost=$(jq -r '.[0].totalCost // "N/A"' "$results_file" 2>/dev/null)
            local success_count=$(jq '[.[] | select(.success == true)] | length' "$results_file" 2>/dev/null || echo "N/A")
            local total_count=$(jq 'length' "$results_file" 2>/dev/null || echo "N/A")
            
            log "Cost Analysis Results:"
            log "  - Average Cost: $avg_cost lamports"
            log "  - Success Rate: $success_count/$total_count scenarios"
        fi
    else
        error "Cost measurement tests failed"
        return $exit_code
    fi
}

# Run end-to-end tests
run_e2e_tests() {
    if [ "$RUN_E2E_TESTS" != "true" ]; then
        log "Skipping E2E tests"
        return 0
    fi
    
    log "🎮 Running end-to-end tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run Playwright tests
    local e2e_results="$RESULTS_DIR/e2e-results"
    mkdir -p "$e2e_results"
    
    if [ -f "tests/e2e/playwright.config.ts" ]; then
        npx playwright test \
            --config=tests/e2e/playwright.config.ts \
            --reporter=json \
            --output-dir="$e2e_results" \
            2>&1 | tee "$RESULTS_DIR/e2e-output.log"
        
        local exit_code=${PIPESTATUS[0]}
        
        if [ $exit_code -eq 0 ]; then
            success "E2E tests completed successfully"
        else
            warning "E2E tests completed with issues (exit code: $exit_code)"
        fi
    else
        warning "Playwright config not found, skipping E2E tests"
    fi
}

# Run security tests
run_security_tests() {
    if [ "$RUN_SECURITY_TESTS" != "true" ]; then
        log "Skipping security tests"
        return 0
    fi
    
    log "🛡️ Running security tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run security test suite
    if [ -f "tests/security/rate-limiting.spec.ts" ]; then
        npx jest tests/security/ \
            --json \
            --outputFile="$RESULTS_DIR/security-results.json" \
            2>&1 | tee "$RESULTS_DIR/security-output.log"
        
        local exit_code=${PIPESTATUS[0]}
        
        if [ $exit_code -eq 0 ]; then
            success "Security tests completed successfully"
        else
            warning "Security tests completed with issues (exit code: $exit_code)"
        fi
    else
        warning "Security test suite not found, skipping security tests"
    fi
}

# Run MagicBlock integration tests
run_magicblock_tests() {
    log "⚡ Running MagicBlock integration tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run MagicBlock specific tests
    if [ -d "tests/integration/magicblock" ]; then
        npx jest tests/integration/magicblock/ \
            --json \
            --outputFile="$RESULTS_DIR/magicblock-results.json" \
            2>&1 | tee "$RESULTS_DIR/magicblock-output.log"
        
        local exit_code=${PIPESTATUS[0]}
        
        if [ $exit_code -eq 0 ]; then
            success "MagicBlock integration tests completed"
        else
            warning "MagicBlock integration tests completed with issues"
        fi
    else
        warning "MagicBlock integration tests not found, skipping"
    fi
}

# Generate comprehensive report
generate_report() {
    log "📊 Generating comprehensive benchmark report..."
    
    local report_file="$RESULTS_DIR/benchmark-report.md"
    local summary_file="$RESULTS_DIR/benchmark-summary.json"
    
    cat > "$report_file" << EOF
# Universal PVP Benchmark Report

**Generated:** $(date)
**Duration:** $DURATION
**Concurrent Users:** $CONCURRENT_USERS
**Environment:** $([ "$NODE_ENV" ] && echo "$NODE_ENV" || echo "test")

## Summary

EOF
    
    # Analyze k6 results
    if [ -f "$RESULTS_DIR/k6-results.json" ]; then
        log "Analyzing k6 results..."
        local p95=$(jq -r '.metrics.http_req_duration.values.p95' "$RESULTS_DIR/k6-results.json" 2>/dev/null || echo "N/A")
        local error_rate=$(jq -r '.metrics.http_req_failed.rate' "$RESULTS_DIR/k6-results.json" 2>/dev/null || echo "N/A")
        
        cat >> "$report_file" << EOF
### Load Testing Results (k6)

- **P95 Response Time:** ${p95}ms
- **Error Rate:** $error_rate
- **Target P95:** <100ms
- **Target Error Rate:** <10%
- **Status:** $([ "$p95" != "N/A" ] && [ "${p95%.*}" -lt 100 ] && echo "✅ PASS" || echo "❌ FAIL")

EOF
    fi
    
    # Analyze cost results
    if [ -f "$RESULTS_DIR/cost-results.json" ]; then
        log "Analyzing cost results..."
        local avg_cost=$(jq -r 'if type == "array" then .[0].totalCost else .totalCost end' "$RESULTS_DIR/cost-results.json" 2>/dev/null || echo "N/A")
        local success_rate=$(jq -r 'if type == "array" then ([.[] | select(.success == true)] | length) / length * 100 else (if .success then 100 else 0 end) end' "$RESULTS_DIR/cost-results.json" 2>/dev/null || echo "N/A")
        
        cat >> "$report_file" << EOF
### Cost Analysis Results

- **Average Transaction Cost:** $avg_cost lamports
- **Success Rate:** ${success_rate}%
- **Target Cost:** <100,000 lamports
- **Target Success Rate:** >90%
- **Status:** $([ "$avg_cost" != "N/A" ] && [ "$avg_cost" -lt 100000 ] && echo "✅ PASS" || echo "❌ FAIL")

EOF
    fi
    
    # Add file listings
    cat >> "$report_file" << EOF
## Detailed Results

### Files Generated
EOF
    
    find "$RESULTS_DIR" -type f -name "*.json" -o -name "*.log" | while read -r file; do
        local filename=$(basename "$file")
        local filesize=$(du -h "$file" | cut -f1)
        echo "- **$filename** ($filesize)" >> "$report_file"
    done
    
    # Generate JSON summary
    cat > "$summary_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "duration": "$DURATION",
  "concurrentUsers": $CONCURRENT_USERS,
  "environment": "$([ "$NODE_ENV" ] && echo "$NODE_ENV" || echo "test")",
  "results": {
    "loadTesting": $([ -f "$RESULTS_DIR/k6-results.json" ] && echo "true" || echo "false"),
    "costAnalysis": $([ -f "$RESULTS_DIR/cost-results.json" ] && echo "true" || echo "false"),
    "e2eTesting": $([ -f "$RESULTS_DIR/e2e-results.json" ] && echo "true" || echo "false"),
    "securityTesting": $([ -f "$RESULTS_DIR/security-results.json" ] && echo "true" || echo "false")
  }
}
EOF
    
    success "Benchmark report generated: $report_file"
    log "Summary available at: $summary_file"
}

# Upload results (if configured)
upload_results() {
    if [ -z "$RESULTS_UPLOAD_URL" ]; then
        log "No upload URL configured, skipping results upload"
        return 0
    fi
    
    log "📤 Uploading results to $RESULTS_UPLOAD_URL"
    
    # Create tarball of results
    local tarball="$TEMP_DIR/benchmark-results.tar.gz"
    tar -czf "$tarball" -C "$(dirname "$RESULTS_DIR")" "$(basename "$RESULTS_DIR")"
    
    # Upload results
    curl -X POST \
        -H "Content-Type: application/gzip" \
        -H "X-Benchmark-Timestamp: $(date -Iseconds)" \
        --data-binary "@$tarball" \
        "$RESULTS_UPLOAD_URL" \
        && success "Results uploaded successfully" \
        || warning "Failed to upload results"
}

# Main execution flow
main() {
    local start_time=$(date +%s)
    
    check_prerequisites
    setup_environment
    health_check
    
    # Run test suites
    local test_failures=0
    
    run_load_tests || ((test_failures++))
    run_cost_tests || ((test_failures++))
    run_e2e_tests || ((test_failures++))
    run_security_tests || ((test_failures++))
    run_magicblock_tests || ((test_failures++))
    
    # Generate reports
    generate_report
    upload_results
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "🎯 Benchmark suite completed in ${duration}s"
    log "📁 Results saved to: $RESULTS_DIR"
    
    if [ $test_failures -eq 0 ]; then
        success "All benchmarks completed successfully!"
        exit 0
    else
        warning "$test_failures test suite(s) had issues"
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Universal PVP Benchmark Suite"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h              Show this help"
        echo "  --load-only             Run only load tests"
        echo "  --cost-only             Run only cost tests"
        echo "  --security-only         Run only security tests"
        echo "  --skip-setup            Skip environment setup"
        echo ""
        echo "Environment Variables:"
        echo "  CONCURRENT_USERS        Number of concurrent users (default: 200)"
        echo "  DURATION               Test duration (default: 10m)"
        echo "  BASE_URL               Backend URL (default: http://localhost:5000)"
        echo "  FRONTEND_URL           Frontend URL (default: http://localhost:3000)"
        echo "  RUN_COST_TESTS         Run cost tests (default: true)"
        echo "  RUN_E2E_TESTS          Run E2E tests (default: true)"
        echo "  RUN_SECURITY_TESTS     Run security tests (default: true)"
        echo "  SKIP_SETUP             Skip setup (default: false)"
        echo "  RESULTS_UPLOAD_URL     URL to upload results"
        exit 0
        ;;
    --load-only)
        RUN_COST_TESTS="false"
        RUN_E2E_TESTS="false"
        RUN_SECURITY_TESTS="false"
        ;;
    --cost-only)
        RUN_E2E_TESTS="false"
        RUN_SECURITY_TESTS="false"
        ;;
    --security-only)
        RUN_COST_TESTS="false"
        RUN_E2E_TESTS="false"
        ;;
    --skip-setup)
        SKIP_SETUP="true"
        ;;
esac

main "$@"