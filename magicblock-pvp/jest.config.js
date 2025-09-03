/** @type {import('jest').Config} */
module.exports = {
  // Projects for monorepo testing
  projects: [
    {
      displayName: 'SDK',
      testMatch: ['<rootDir>/packages/sdk/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/packages/sdk/tests/setup.ts'],
      collectCoverageFrom: [
        'packages/sdk/src/**/*.ts',
        '!packages/sdk/src/**/*.d.ts',
        '!packages/sdk/src/index.ts'
      ],
      coverageDirectory: '<rootDir>/coverage/sdk',
      coverageThreshold: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    },
    
    {
      displayName: 'Server',
      testMatch: ['<rootDir>/apps/server/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/apps/server/tests/setup.ts'],
      collectCoverageFrom: [
        'apps/server/src/**/*.ts',
        '!apps/server/src/**/*.d.ts',
        '!apps/server/src/index.ts'
      ],
      coverageDirectory: '<rootDir>/coverage/server',
      coverageThreshold: {
        global: {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        }
      }
    },

    {
      displayName: 'UI Components',
      testMatch: ['<rootDir>/packages/ui/**/*.test.{ts,tsx}'],
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/packages/ui/tests/setup.ts'],
      collectCoverageFrom: [
        'packages/ui/src/**/*.{ts,tsx}',
        '!packages/ui/src/**/*.d.ts',
        '!packages/ui/src/index.ts'
      ],
      coverageDirectory: '<rootDir>/coverage/ui',
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      },
      moduleNameMapping: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      }
    },

    {
      displayName: 'Config',
      testMatch: ['<rootDir>/packages/config/**/*.test.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node',
      collectCoverageFrom: [
        'packages/config/src/**/*.ts',
        '!packages/config/src/**/*.d.ts'
      ],
      coverageDirectory: '<rootDir>/coverage/config',
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  ],

  // Global configuration
  rootDir: '.',
  
  // Global setup and teardown
  globalSetup: '<rootDir>/tests/global-setup.js',
  globalTeardown: '<rootDir>/tests/global-teardown.js',

  // Test patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/apps/contracts/' // Anchor tests run separately
  ],

  // Module resolution
  moduleNameMapping: {
    '^@magicblock-pvp/(.*)$': '<rootDir>/packages/$1/src',
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.tsx$': 'ts-jest'
  },

  // File extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Coverage configuration
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    'apps/*/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**'
  ],

  coverageDirectory: '<rootDir>/coverage',
  
  coverageReporters: [
    'text',
    'text-summary', 
    'html',
    'lcov',
    'json-summary',
    'clover'
  ],

  // Overall coverage thresholds
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },

  // Test environment configuration
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],

  // Test timeout (30 seconds)
  testTimeout: 30000,

  // Verbose output for CI
  verbose: process.env.CI === 'true',

  // Fail fast on CI
  bail: process.env.CI === 'true' ? 1 : 0,

  // Max workers
  maxWorkers: process.env.CI === 'true' ? 2 : '50%',

  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,

  // Error handling
  errorOnDeprecated: true,

  // Test result processor for custom reporting
  testResultsProcessor: '<rootDir>/tests/results-processor.js',

  // Custom reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results',
        outputName: 'jest-junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{displayName}: {filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ],
    [
      'jest-html-reporter',
      {
        pageTitle: 'MagicBlock PvP Test Report',
        outputPath: '<rootDir>/test-results/test-report.html',
        includeFailureMsg: true,
        includeSuiteFailure: true
      }
    ]
  ],

  // Watch configuration for development
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],

  // Performance monitoring
  detectOpenHandles: true,
  detectLeaks: process.env.NODE_ENV === 'test',

  // Custom matchers and utilities
  setupFiles: [
    '<rootDir>/tests/polyfills.js'
  ],

  // Environment variables for tests
  globalSetup: '<rootDir>/tests/setup-test-env.js',

  // Snapshot configuration
  snapshotSerializers: ['jest-snapshot-serializer-raw'],

  // Module directories
  moduleDirectories: ['node_modules', '<rootDir>'],

  // Ignore patterns for transforming
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@solana|@coral-xyz))'
  ]
};