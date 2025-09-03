/**
 * Cypress Configuration for E2E Testing
 * Comprehensive E2E test setup with blockchain integration
 */

const { defineConfig } = require('cypress');
const coverage = require('@cypress/code-coverage/task');

module.exports = defineConfig({
  e2e: {
    // Base configuration
    baseUrl: 'http://localhost:3000',
    supportFile: 'tests/cypress/support/e2e.js',
    specPattern: 'tests/frontend/e2e/**/*.cy.{js,jsx,ts,tsx}',
    fixturesFolder: 'tests/cypress/fixtures',
    videosFolder: 'tests/cypress/videos',
    screenshotsFolder: 'tests/cypress/screenshots',
    downloadsFolder: 'tests/cypress/downloads',
    
    // Viewport
    viewportWidth: 1280,
    viewportHeight: 720,
    
    // Timeouts
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    pageLoadTimeout: 30000,
    
    // Test isolation
    testIsolation: true,
    
    // Video recording
    video: true,
    videoCompression: 32,
    
    // Screenshots
    screenshotOnRunFailure: true,
    
    // Environment variables
    env: {
      SOLANA_NETWORK: 'devnet',
      API_BASE_URL: 'http://localhost:8000/api',
      WEBSOCKET_URL: 'ws://localhost:8001',
      COVERAGE: true
    },
    
    setupNodeEvents(on, config) {
      // Code coverage
      coverage(on, config);
      
      // Custom tasks for blockchain interaction
      on('task', {
        // Database operations
        'db:seed': async () => {
          const { seedTestDatabase } = require('./helpers/database');
          await seedTestDatabase();
          return null;
        },
        
        'db:reset': async () => {
          const { resetTestDatabase } = require('./helpers/database');
          await resetTestDatabase();
          return null;
        },
        
        'db:createUser': async (userData) => {
          const { createTestUser } = require('./helpers/database');
          return await createTestUser(userData);
        },
        
        'db:createMultipleMatches': async () => {
          const { createMultipleTestMatches } = require('./helpers/database');
          await createMultipleTestMatches();
          return null;
        },
        
        'db:createMatchInProgress': async (matchData) => {
          const { createMatchInProgress } = require('./helpers/database');
          return await createMatchInProgress(matchData);
        },
        
        'createManyMatches': async (count) => {
          const { createManyTestMatches } = require('./helpers/database');
          await createManyTestMatches(count);
          return null;
        },
        
        // Blockchain operations
        'blockchain:reset': async () => {
          const { resetBlockchain } = require('./helpers/blockchain');
          await resetBlockchain();
          return null;
        },
        
        'setWalletBalance': async ({ balance }) => {
          const { setTestWalletBalance } = require('./helpers/blockchain');
          await setTestWalletBalance(balance);
          return null;
        },
        
        'confirmTransaction': async (txHash) => {
          const { confirmTestTransaction } = require('./helpers/blockchain');
          await confirmTestTransaction(txHash);
          return null;
        },
        
        'setPlayerHealth': async ({ playerId, health }) => {
          const { updatePlayerHealth } = require('./helpers/game');
          await updatePlayerHealth(playerId, health);
          return null;
        },
        
        'simulateTurnTimeout': async (matchId) => {
          const { simulateTimeout } = require('./helpers/game');
          await simulateTimeout(matchId);
          return null;
        },
        
        // Test user management
        'createSecondTestUser': async () => {
          const { createTestUser } = require('./helpers/users');
          return await createTestUser({
            username: 'TestPlayer2',
            wallet: '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9',
            playerClass: 'mage'
          });
        },
        
        // Logging for debugging
        'log': (message) => {
          console.log(`[CYPRESS TASK] ${message}`);
          return null;
        },
        
        // File operations
        'readFile': async (filepath) => {
          const fs = require('fs').promises;
          try {
            return await fs.readFile(filepath, 'utf8');
          } catch (error) {
            return null;
          }
        },
        
        'writeFile': async ({ filepath, content }) => {
          const fs = require('fs').promises;
          await fs.writeFile(filepath, content, 'utf8');
          return null;
        }
      });
      
      // Browser configuration
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.name === 'chrome') {
          launchOptions.args.push('--disable-dev-shm-usage');
          launchOptions.args.push('--disable-gpu');
          launchOptions.args.push('--no-sandbox');
          
          // Enable debugging in development
          if (!process.env.CI) {
            launchOptions.args.push('--auto-open-devtools-for-tabs');
          }
        }
        
        return launchOptions;
      });
      
      // Failed test handling
      on('after:spec', (spec, results) => {
        if (results && results.video) {
          // Keep videos only on failure
          const { existsSync, unlinkSync } = require('fs');
          if (results.tests && results.tests.every(test => test.state === 'passed')) {
            if (existsSync(results.video)) {
              unlinkSync(results.video);
            }
          }
        }
      });
      
      // Performance monitoring
      on('before:spec', () => {
        console.log('Starting spec execution...');
      });
      
      on('after:spec', (spec, results) => {
        console.log(`Spec completed: ${spec.relative}`);
        if (results.stats) {
          console.log(`Duration: ${results.stats.duration}ms`);
          console.log(`Tests: ${results.stats.tests}, Failures: ${results.stats.failures}`);
        }
      });
      
      return config;
    }
  },
  
  component: {
    devServer: {
      framework: 'react',
      bundler: 'webpack'
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'tests/cypress/support/component.js'
  },
  
  // Global configuration
  chromeWebSecurity: false,
  experimentalStudio: true,
  experimentalWebKitSupport: true,
  
  // Retry configuration
  retries: {
    runMode: 2,
    openMode: 0
  },
  
  // Slow test threshold
  slowTestThreshold: 10000,
  
  // Modify obstruction detection
  blockHosts: [
    'www.google-analytics.com',
    'analytics.google.com',
    'googletagmanager.com'
  ],
  
  // User agent
  userAgent: 'Cypress-SOL-Duel-E2E-Tests/1.0.0'
});

// Environment-specific overrides
if (process.env.CI) {
  module.exports.e2e.video = false;
  module.exports.e2e.screenshotOnRunFailure = true;
  module.exports.e2e.defaultCommandTimeout = 20000;
  module.exports.retries.runMode = 3;
}

if (process.env.NODE_ENV === 'development') {
  module.exports.e2e.watchForFileChanges = true;
  module.exports.e2e.video = false;
  module.exports.experimentalStudio = true;
}