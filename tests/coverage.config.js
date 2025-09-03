/**
 * Test Coverage Configuration
 * Comprehensive coverage reporting setup for all test types
 */

module.exports = {
  // Coverage collection patterns
  collectCoverageFrom: [
    // Source code
    'src/**/*.{js,jsx,ts,tsx}',
    'src/**/*.rs',
    
    // Include backend
    'src/backend/**/*.js',
    'src/backend/**/*.ts',
    
    // Include frontend
    'src/frontend/**/*.tsx',
    'src/frontend/**/*.ts',
    
    // Include smart contracts
    'src/programs/**/*.rs',
    
    // Exclude patterns
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,jsx,ts,tsx}',
    '!src/**/*.spec.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/**/node_modules/**',
    '!src/**/target/**',
    '!src/**/build/**',
    '!src/**/dist/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    
    // Specific thresholds for different areas
    'src/backend/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    
    'src/frontend/components/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    
    'src/frontend/services/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    
    'src/programs/': {
      // Lower threshold for Rust code due to testing complexity
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',           // Console output
    'text-summary',   // Summary in console
    'html',           // HTML report
    'lcov',           // For CI/CD integration
    'json',           // JSON format
    'cobertura',      // XML format for some CI systems
    'clover'          // For IDE integration
  ],
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Coverage provider
  coverageProvider: 'v8', // Use V8 coverage for better performance
  
  // Path ignore patterns for coverage
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/target/',
    '/build/',
    '/dist/',
    '/__tests__/',
    '/__mocks__/',
    '\\.test\\.',
    '\\.spec\\.',
    'test-utils.js',
    'setupTests.js'
  ],
  
  // Additional coverage configuration
  collectCoverage: process.env.COVERAGE === 'true',
  
  // Custom coverage processors
  coverageProcessors: {
    '**/*.rs': '<rootDir>/tests/processors/rust-coverage-processor.js'
  }
};

// Configuration for different environments
const configs = {
  development: {
    ...module.exports,
    collectCoverage: false,
    verbose: true
  },
  
  ci: {
    ...module.exports,
    collectCoverage: true,
    coverageReporters: ['text', 'lcov', 'json'],
    verbose: false,
    silent: true
  },
  
  production: {
    ...module.exports,
    collectCoverage: true,
    coverageReporters: ['text-summary', 'html', 'json'],
    coverageThreshold: {
      global: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85
      }
    }
  }
};

// Export appropriate config based on environment
const env = process.env.NODE_ENV || 'development';
module.exports = configs[env] || module.exports;