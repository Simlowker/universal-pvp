import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/playwright-junit.xml' }],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Global timeout for each action */
    actionTimeout: 30000,
    
    /* Global timeout for navigation */
    navigationTimeout: 30000,
  },

  /* Global timeout for each test */
  timeout: 60000,

  /* Global timeout for the whole test run */
  globalTimeout: 1800000, // 30 minutes

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      teardown: 'cleanup'
    },
    
    {
      name: 'cleanup',
      testMatch: /.*\.cleanup\.ts/
    },

    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Custom viewport for game UI
        viewport: { width: 1440, height: 900 }
      },
      dependencies: ['setup']
    },

    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 }
      },
      dependencies: ['setup']
    },

    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 }
      },
      dependencies: ['setup']
    },

    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        // Enable mobile-specific features
        hasTouch: true,
        isMobile: true
      },
      dependencies: ['setup']
    },
    
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
        hasTouch: true,
        isMobile: true
      },
      dependencies: ['setup']
    },

    /* Performance testing project */
    {
      name: 'performance',
      testMatch: /.*\.perf\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      },
      dependencies: ['setup']
    },

    /* Load testing project */
    {
      name: 'load',
      testMatch: /.*\.load\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      },
      dependencies: ['setup'],
      // Run load tests separately
      fullyParallel: false
    },

    /* API testing project */
    {
      name: 'api',
      testMatch: /.*\.api\.ts/,
      use: {
        // API tests don't need a browser
        baseURL: process.env.BASE_URL || 'http://localhost:3000'
      },
      dependencies: ['setup']
    }
  ],

  /* Configure test environment */
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),

  /* Configure test data directory */
  outputDir: 'test-results/',

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes to start dev server
    env: {
      NODE_ENV: 'test',
      // Use test database
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/magicblock_test',
      REDIS_URL: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1',
      // Mock external services in test
      VRF_MOCK: 'true',
      SOLANA_RPC_URL: 'https://api.devnet.solana.com',
      // Test-specific config
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
      RATE_LIMIT_DISABLED: 'true'
    }
  },

  /* Configure expect assertions */
  expect: {
    // Global expect timeout
    timeout: 10000,
    
    // Custom matchers for game-specific assertions
    toHaveGameStatus: async (page, expected) => {
      const status = await page.getAttribute('[data-testid="game-status"]', 'data-status');
      return {
        pass: status === expected,
        message: () => `Expected game status to be ${expected}, got ${status}`
      };
    },
    
    toHavePlayerCount: async (page, expected) => {
      const count = await page.locator('[data-testid="player-list"] [data-testid="player"]').count();
      return {
        pass: count === expected,
        message: () => `Expected ${expected} players, got ${count}`
      };
    },
    
    toHaveValidTransaction: async (page) => {
      const txElement = await page.locator('[data-testid="transaction-hash"]');
      const txHash = await txElement.textContent();
      const isValid = txHash && txHash.length === 88; // Solana tx signature length
      
      return {
        pass: isValid,
        message: () => `Expected valid transaction hash, got ${txHash}`
      };
    }
  },

  /* Configure test metadata */
  metadata: {
    testType: 'e2e',
    application: 'magicblock-pvp',
    environment: process.env.NODE_ENV || 'test',
    version: process.env.npm_package_version || '0.1.0'
  },

  /* Configure test fixtures */
  fixtures: {
    // Custom fixture for authenticated user
    authenticatedPage: async ({ page, context }, use) => {
      // Mock authentication for testing
      await page.goto('/');
      
      await page.evaluate(() => {
        localStorage.setItem('user', JSON.stringify({
          id: 'test-user-id',
          username: 'testuser',
          email: 'test@example.com'
        }));
        localStorage.setItem('authToken', 'mock-jwt-token');
      });
      
      await use(page);
    },

    // Custom fixture for game test context
    gameTestContext: async ({ page }, use) => {
      // Setup game-specific test context
      await page.addInitScript(() => {
        // Mock WebSocket for testing
        window.WebSocket = class MockWebSocket {
          constructor(url) {
            this.url = url;
            this.readyState = 1; // OPEN
            setTimeout(() => this.onopen?.(), 100);
          }
          
          send(data) {
            // Mock message handling
            setTimeout(() => {
              this.onmessage?.({ data: JSON.stringify({
                type: 'ack',
                data: JSON.parse(data)
              })});
            }, 50);
          }
          
          close() {
            this.readyState = 3; // CLOSED
            this.onclose?.();
          }
        };
      });
      
      await use(page);
    }
  }
});