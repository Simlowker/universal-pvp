/**
 * Playwright Configuration for Universal PVP E2E Testing
 * Comprehensive end-to-end testing suite covering all game flows
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Test directory
  testDir: './specs',
  
  // Global test timeout
  timeout: 60000,
  
  // Expect timeout for assertions
  expect: {
    timeout: 10000
  },
  
  // Run tests in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 3 : 1,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 2 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/results.xml' }],
    ['list'],
  ],
  
  // Global setup and teardown
  globalSetup: require.resolve('./global-setup'),
  globalTeardown: require.resolve('./global-teardown'),
  
  // Shared settings for all the projects below
  use: {
    // Base URL for the application
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    
    // Capture screenshots and videos on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    // Browser context options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    
    // Custom test timeouts
    actionTimeout: 15000,
    navigationTimeout: 30000,
    
    // Storage state for authenticated tests
    storageState: process.env.STORAGE_STATE_PATH,
  },

  // Configure projects for major browsers
  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Enable WebGL for game graphics
        launchOptions: {
          args: [
            '--enable-webgl',
            '--enable-accelerated-2d-canvas',
            '--disable-web-security',
            '--allow-running-insecure-content'
          ]
        }
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox-specific configurations
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'security.tls.skip_ocsp_for_https': true
          }
        }
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile browsers
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        // Mobile-specific settings
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    // Tablet testing
    {
      name: 'iPad',
      use: { ...devices['iPad Pro'] },
    },

    // Performance testing project
    {
      name: 'performance',
      use: { 
        ...devices['Desktop Chrome'],
        // Performance testing specific settings
        launchOptions: {
          args: [
            '--enable-webgl',
            '--enable-precise-memory-info',
            '--enable-logging',
            '--log-level=0'
          ]
        }
      },
      testMatch: '**/performance-*.spec.ts'
    },

    // Security testing project
    {
      name: 'security',
      use: { 
        ...devices['Desktop Chrome'],
        // Security testing configurations
        extraHTTPHeaders: {
          'X-Test-Security': 'true'
        }
      },
      testMatch: '**/security-*.spec.ts'
    },

    // WebSocket testing project
    {
      name: 'websocket',
      use: { 
        ...devices['Desktop Chrome'],
        // WebSocket specific configurations
        launchOptions: {
          args: ['--disable-web-security']
        }
      },
      testMatch: '**/websocket-*.spec.ts'
    }
  ],

  // Web server configuration for local testing
  webServer: process.env.CI ? undefined : [
    {
      command: 'npm run dev',
      port: 3000,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run server:test',
      port: 5000,
      timeout: 60000,
      reuseExistingServer: !process.env.CI,
      cwd: './src/backend',
      env: {
        NODE_ENV: 'test',
        PORT: '5000',
        DATABASE_URL: 'sqlite::memory:',
      }
    }
  ],

  // Test output directory
  outputDir: 'test-results/',

  // Metadata for the test run
  metadata: {
    environment: process.env.NODE_ENV || 'test',
    testSuite: 'Universal PVP E2E Tests',
    version: process.env.npm_package_version || '1.0.0',
  },
});