/**
 * Jest Configuration for SOL Duel Game Testing
 * Comprehensive test configuration for all test types
 */

const coverageConfig = require('./coverage.config');

module.exports = {
  // Test environment roots
  roots: [
    '<rootDir>/src',
    '<rootDir>/tests'
  ],
  
  // Test match patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
    '<rootDir>/tests/**/*.spec.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}'
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript'
      ],
      plugins: [
        '@babel/plugin-proposal-class-properties',
        '@babel/plugin-transform-runtime'
      ]
    }],
    '^.+\\.css$': 'identity-obj-proxy',
    '^.+\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/tests/mocks/fileMock.js'
  },
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(@solana|@coral-xyz|@metaplex|bs58|borsh)/)'
  ],
  
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/frontend/components/$1',
    '^@services/(.*)$': '<rootDir>/src/frontend/services/$1',
    '^@hooks/(.*)$': '<rootDir>/src/frontend/hooks/$1',
    '^@contexts/(.*)$': '<rootDir>/src/frontend/contexts/$1',
    '^@utils/(.*)$': '<rootDir>/src/frontend/utils/$1',
    '^@backend/(.*)$': '<rootDir>/src/backend/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Setup files
  setupFiles: [
    '<rootDir>/tests/setup/enzyme.setup.js',
    '<rootDir>/tests/setup/globals.setup.js'
  ],
  
  // Setup files after env
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js',
    '@testing-library/jest-dom/extend-expect'
  ],
  
  // Test environment
  testEnvironment: 'jsdom',
  
  // Test environment options
  testEnvironmentOptions: {
    url: 'http://localhost:3000'
  },
  
  // Global configuration
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
      isolatedModules: true
    },
    __DEV__: true,
    __TEST__: true,
    __SOLANA_NETWORK__: 'devnet'
  },
  
  // Module file extensions
  moduleFileExtensions: [
    'js',
    'jsx',
    'ts',
    'tsx',
    'json',
    'node'
  ],
  
  // Module directories
  moduleDirectories: [
    'node_modules',
    '<rootDir>/src',
    '<rootDir>/tests'
  ],
  
  // Test timeout
  testTimeout: 30000,
  
  // Coverage configuration (from separate file)
  ...coverageConfig,
  
  // Reporter configuration
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'coverage',
      outputName: 'junit.xml',
      ancestorSeparator: ' › ',
      uniqueOutputName: 'false',
      suiteNameTemplate: '{filepath}',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }],
    ['jest-html-reporters', {
      publicPath: './coverage',
      filename: 'report.html',
      expand: true,
      hideIcon: false,
      pageTitle: 'SOL Duel Test Report'
    }]
  ],
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Collect coverage on all files
  collectCoverageFrom: coverageConfig.collectCoverageFrom,
  
  // Mock patterns
  modulePathIgnorePatterns: [
    '<rootDir>/build/',
    '<rootDir>/dist/',
    '<rootDir>/target/',
    '<rootDir>/node_modules/'
  ],
  
  // Preset for React Testing Library
  preset: 'ts-jest',
  
  // Test projects for different types
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: [
        '<rootDir>/tests/**/unit/**/*.test.{js,ts,tsx}',
        '<rootDir>/tests/**/*.unit.test.{js,ts,tsx}'
      ],
      testEnvironment: 'jsdom'
    },
    {
      displayName: 'Integration Tests',
      testMatch: [
        '<rootDir>/tests/**/integration/**/*.test.{js,ts,tsx}',
        '<rootDir>/tests/**/*.integration.test.{js,ts,tsx}'
      ],
      testEnvironment: 'node',
      testTimeout: 60000
    },
    {
      displayName: 'Smart Contract Tests',
      testMatch: [
        '<rootDir>/tests/programs/**/*.rs'
      ],
      runner: '<rootDir>/tests/runners/rust-test-runner.js',
      testEnvironment: 'node',
      testTimeout: 120000
    }
  ],
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Notify mode
  notify: false,
  
  // Verbose output
  verbose: process.env.CI !== 'true',
  
  // Silent mode for CI
  silent: process.env.CI === 'true',
  
  // Maximum worker threads
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Cache directory
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Dependency extractor for better caching
  dependencyExtractor: '<rootDir>/tests/utils/dependencyExtractor.js'
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'ci') {
  module.exports.reporters = [
    ['default', { silent: true }],
    ['jest-junit', { outputDirectory: 'coverage' }]
  ];
  module.exports.collectCoverage = true;
  module.exports.coverageReporters = ['text', 'lcov', 'json'];
}

if (process.env.NODE_ENV === 'development') {
  module.exports.collectCoverage = false;
  module.exports.watchAll = false;
  module.exports.watch = true;
}