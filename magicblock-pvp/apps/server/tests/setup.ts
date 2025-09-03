import { config } from 'dotenv';
import { execSync } from 'child_process';

// Load test environment variables
config({ path: '.env.test' });

// Set default test environment variables if not provided
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/magicblock_pvp_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.COST_TRACKING_ENABLED = 'false';

// Global test setup
beforeAll(async () => {
  // Reset test database
  try {
    execSync('npx prisma migrate reset --force --skip-seed', { 
      stdio: 'ignore',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
    
    execSync('npx prisma generate', { 
      stdio: 'ignore' 
    });
  } catch (error) {
    console.warn('Warning: Could not reset test database:', error);
  }
});

// Clean up after all tests
afterAll(async () => {
  // Close database connections
  const { prisma } = require('../src/config/database');
  await prisma.$disconnect();
  
  // Close Redis connections
  const { redisManager } = require('../src/config/redis');
  await redisManager.disconnect().catch(() => {
    // Ignore errors during test cleanup
  });
});

// Global timeout for all tests
jest.setTimeout(30000);