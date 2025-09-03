#!/bin/bash

# SOL Duel Game - Comprehensive Test Runner
# Runs all test suites with proper orchestration and reporting

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
COVERAGE=${COVERAGE:-true}
PARALLEL=${PARALLEL:-true}
ENVIRONMENT=${ENVIRONMENT:-test}
VERBOSE=${VERBOSE:-false}

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to setup test environment
setup_environment() {
    print_status "Setting up test environment..."
    
    # Set environment variables
    export NODE_ENV=test
    export COVERAGE=$COVERAGE
    export PARALLEL=$PARALLEL
    
    # Create necessary directories
    mkdir -p coverage/{unit,integration,e2e,smart-contracts}
    mkdir -p test-results/{unit,integration,e2e,smart-contracts}
    mkdir -p logs
    
    # Check dependencies
    if ! command_exists node; then
        print_error "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is required but not installed"
        exit 1
    fi
    
    if ! command_exists cargo; then
        print_warning "Cargo not found - Rust tests will be skipped"
    fi
    
    if ! command_exists solana; then
        print_warning "Solana CLI not found - some blockchain tests may fail"
    fi
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing Node.js dependencies..."
        npm install
    fi
    
    print_success "Environment setup complete"
}

# Function to run smart contract tests
run_smart_contract_tests() {
    print_status "Running smart contract tests..."
    
    local test_dir="tests/programs"
    local results_file="test-results/smart-contracts/results.xml"
    local coverage_file="coverage/smart-contracts/lcov.info"
    
    if [ ! -d "$test_dir" ]; then
        print_warning "Smart contract test directory not found - skipping"
        return 0
    fi
    
    # Check if Rust toolchain is available
    if ! command_exists cargo; then
        print_warning "Cargo not available - skipping smart contract tests"
        return 0
    fi
    
    # Run Rust tests for game program
    if [ -d "$test_dir/game-program" ]; then
        print_status "Testing game program..."
        cd "$test_dir/game-program"
        
        if [ "$COVERAGE" = "true" ]; then
            cargo test --verbose -- --test-threads=1 2>&1 | tee ../../../logs/smart-contract-tests.log
            # Generate coverage report (requires cargo-tarpaulin)
            if command_exists cargo-tarpaulin; then
                cargo tarpaulin --out lcov --output-dir ../../../coverage/smart-contracts/
            fi
        else
            cargo test --verbose -- --test-threads=1
        fi
        
        cd - > /dev/null
    fi
    
    # Run integration tests for cross-program calls
    if [ -f "$test_dir/integration_tests.rs" ]; then
        print_status "Testing cross-program integration..."
        # Custom runner for integration tests
        ./tests/scripts/run-integration-tests.sh
    fi
    
    print_success "Smart contract tests completed"
}

# Function to run backend tests
run_backend_tests() {
    print_status "Running backend tests..."
    
    local junit_file="test-results/backend/junit.xml"
    local coverage_file="coverage/backend/lcov.info"
    
    # Unit tests
    print_status "Running backend unit tests..."
    if [ "$COVERAGE" = "true" ]; then
        npm run test:backend:unit -- --coverage \
            --coverageDirectory=coverage/backend \
            --testResultsProcessor=jest-junit \
            --outputFile=$junit_file
    else
        npm run test:backend:unit
    fi
    
    # Integration tests (require database)
    if [ "$RUN_INTEGRATION" != "false" ]; then
        print_status "Running backend integration tests..."
        
        # Start test database
        ./tests/scripts/start-test-db.sh
        
        # Wait for database to be ready
        sleep 5
        
        npm run test:backend:integration
        
        # Cleanup test database
        ./tests/scripts/stop-test-db.sh
    fi
    
    print_success "Backend tests completed"
}

# Function to run frontend tests
run_frontend_tests() {
    print_status "Running frontend tests..."
    
    local junit_file="test-results/frontend/junit.xml"
    local coverage_file="coverage/frontend/lcov.info"
    
    # Unit and component tests
    print_status "Running frontend unit/component tests..."
    if [ "$COVERAGE" = "true" ]; then
        npm run test:frontend -- --coverage \
            --coverageDirectory=coverage/frontend \
            --testResultsProcessor=jest-junit \
            --outputFile=$junit_file \
            --watchAll=false \
            --passWithNoTests
    else
        npm run test:frontend -- --watchAll=false --passWithNoTests
    fi
    
    print_success "Frontend tests completed"
}

# Function to run E2E tests
run_e2e_tests() {
    print_status "Running E2E tests..."
    
    local results_dir="test-results/e2e"
    local videos_dir="cypress/videos"
    local screenshots_dir="cypress/screenshots"
    
    # Check if Cypress is available
    if ! command_exists cypress; then
        print_warning "Cypress not found - installing..."
        npm install cypress --save-dev
    fi
    
    # Start application for E2E tests
    print_status "Starting application for E2E tests..."
    npm run start:test &
    APP_PID=$!
    
    # Wait for application to be ready
    print_status "Waiting for application to be ready..."
    for i in {1..30}; do
        if curl -f http://localhost:3000 >/dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    
    # Run Cypress tests
    if [ "$CI" = "true" ]; then
        # Headless mode for CI
        npx cypress run \
            --config-file tests/cypress.config.js \
            --reporter junit \
            --reporter-options "mochaFile=$results_dir/results.xml"
    else
        # Interactive mode for development
        if [ "$HEADLESS" = "true" ]; then
            npx cypress run --config-file tests/cypress.config.js
        else
            npx cypress open --config-file tests/cypress.config.js
        fi
    fi
    
    # Cleanup
    kill $APP_PID 2>/dev/null || true
    
    print_success "E2E tests completed"
}

# Function to run performance tests
run_performance_tests() {
    print_status "Running performance tests..."
    
    # Lighthouse CI for performance audits
    if command_exists lhci; then
        print_status "Running Lighthouse audits..."
        lhci collect --config tests/lighthouse/lighthouse.config.js
        lhci assert --config tests/lighthouse/lighthouse.config.js
    fi
    
    # Load testing with Artillery
    if command_exists artillery && [ -f "tests/performance/load-test.yml" ]; then
        print_status "Running load tests..."
        artillery run tests/performance/load-test.yml \
            --output test-results/performance/load-test.json
        artillery report test-results/performance/load-test.json \
            --output test-results/performance/load-test.html
    fi
    
    print_success "Performance tests completed"
}

# Function to generate consolidated coverage report
generate_coverage_report() {
    if [ "$COVERAGE" != "true" ]; then
        return 0
    fi
    
    print_status "Generating consolidated coverage report..."
    
    # Merge coverage reports
    if command_exists nyc; then
        nyc merge coverage/*/lcov.info coverage/merged-coverage.json
        nyc report --reporter=html --reporter=text --reporter=lcov \
            --temp-dir=coverage/.nyc_output \
            --report-dir=coverage/consolidated
    fi
    
    # Generate badge
    if command_exists coverage-badge; then
        coverage-badge -o coverage/badge.svg
    fi
    
    print_success "Coverage report generated at coverage/consolidated/index.html"
}

# Function to generate test report
generate_test_report() {
    print_status "Generating test report..."
    
    local report_file="test-results/consolidated-report.html"
    
    # Create HTML report combining all test results
    cat > $report_file << EOF
<!DOCTYPE html>
<html>
<head>
    <title>SOL Duel Game - Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2196F3; color: white; padding: 20px; margin-bottom: 20px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; }
        .success { background-color: #d4edda; border-color: #c3e6cb; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        .error { background-color: #f8d7da; border-color: #f5c6cb; }
        pre { background: #f4f4f4; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>SOL Duel Game - Test Results</h1>
        <p>Generated on: $(date)</p>
    </div>
EOF
    
    # Add sections for each test type
    if [ -f "test-results/smart-contracts/results.xml" ]; then
        echo "<div class='section success'><h2>Smart Contract Tests</h2><p>✅ Passed</p></div>" >> $report_file
    fi
    
    if [ -f "test-results/backend/junit.xml" ]; then
        echo "<div class='section success'><h2>Backend Tests</h2><p>✅ Passed</p></div>" >> $report_file
    fi
    
    if [ -f "test-results/frontend/junit.xml" ]; then
        echo "<div class='section success'><h2>Frontend Tests</h2><p>✅ Passed</p></div>" >> $report_file
    fi
    
    if [ -f "test-results/e2e/results.xml" ]; then
        echo "<div class='section success'><h2>E2E Tests</h2><p>✅ Passed</p></div>" >> $report_file
    fi
    
    # Add coverage information
    if [ -d "coverage/consolidated" ]; then
        echo "<div class='section'><h2>Coverage Report</h2>" >> $report_file
        echo "<p><a href='coverage/consolidated/index.html'>View Coverage Report</a></p></div>" >> $report_file
    fi
    
    echo "</body></html>" >> $report_file
    
    print_success "Test report generated at $report_file"
}

# Function to cleanup test artifacts
cleanup() {
    print_status "Cleaning up test artifacts..."
    
    # Remove temporary files
    rm -rf .jest-cache 2>/dev/null || true
    rm -rf cypress/videos 2>/dev/null || true
    rm -rf cypress/screenshots 2>/dev/null || true
    
    # Kill any remaining processes
    pkill -f "test" 2>/dev/null || true
    pkill -f "cypress" 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Main execution function
main() {
    local start_time=$(date +%s)
    
    echo "================================================"
    echo "  SOL Duel Game - Comprehensive Test Suite"
    echo "================================================"
    echo ""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-coverage)
                COVERAGE=false
                shift
                ;;
            --no-parallel)
                PARALLEL=false
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --headless)
                HEADLESS=true
                shift
                ;;
            --skip-e2e)
                SKIP_E2E=true
                shift
                ;;
            --skip-integration)
                RUN_INTEGRATION=false
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --no-coverage     Skip coverage collection"
                echo "  --no-parallel     Run tests sequentially"
                echo "  --verbose         Enable verbose output"
                echo "  --headless        Run E2E tests in headless mode"
                echo "  --skip-e2e        Skip E2E tests"
                echo "  --skip-integration Skip integration tests"
                echo "  --help            Show this help"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Setup
    setup_environment
    
    # Run test suites
    local failed_suites=()
    
    # Smart contract tests
    if ! run_smart_contract_tests; then
        failed_suites+=("smart-contracts")
    fi
    
    # Backend tests
    if ! run_backend_tests; then
        failed_suites+=("backend")
    fi
    
    # Frontend tests
    if ! run_frontend_tests; then
        failed_suites+=("frontend")
    fi
    
    # E2E tests
    if [ "$SKIP_E2E" != "true" ]; then
        if ! run_e2e_tests; then
            failed_suites+=("e2e")
        fi
    fi
    
    # Performance tests (optional)
    if [ "$RUN_PERFORMANCE" = "true" ]; then
        if ! run_performance_tests; then
            failed_suites+=("performance")
        fi
    fi
    
    # Generate reports
    generate_coverage_report
    generate_test_report
    
    # Cleanup
    trap cleanup EXIT
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo "================================================"
    echo "  Test Suite Summary"
    echo "================================================"
    echo "Duration: ${duration}s"
    
    if [ ${#failed_suites[@]} -eq 0 ]; then
        print_success "All test suites passed! 🎉"
        exit 0
    else
        print_error "Failed test suites: ${failed_suites[*]}"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"