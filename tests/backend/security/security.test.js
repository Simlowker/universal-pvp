const request = require('supertest');
const app = require('../../../src/backend/server');
const { envValidator } = require('../../../src/backend/utils/envValidator');
const { detectSQLInjection, detectXSS } = require('../../../src/backend/middleware/inputValidation');

describe('Security Tests', () => {
  beforeAll(() => {
    // Set test environment variables
    process.env.JWT_SECRET = 'test-jwt-secret-very-long-and-secure-for-testing-purposes-only';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-very-long-and-secure-for-testing-different';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test_db';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_password';
  });

  describe('Environment Validation', () => {
    test('should validate required environment variables', () => {
      expect(() => envValidator.validateEnvironment()).not.toThrow();
    });

    test('should validate JWT secrets', () => {
      expect(() => envValidator.validateJWTSecret()).not.toThrow();
    });

    test('should reject weak JWT secrets', () => {
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'weak';
      
      expect(() => envValidator.validateJWTSecret()).toThrow();
      
      process.env.JWT_SECRET = originalSecret;
    });

    test('should reject same JWT and refresh secrets', () => {
      const originalRefresh = process.env.JWT_REFRESH_SECRET;
      process.env.JWT_REFRESH_SECRET = process.env.JWT_SECRET;
      
      expect(() => envValidator.validateJWTSecret()).toThrow();
      
      process.env.JWT_REFRESH_SECRET = originalRefresh;
    });
  });

  describe('SQL Injection Detection', () => {
    test('should detect basic SQL injection attempts', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1 OR 1=1",
        "admin'--",
        "1' UNION SELECT * FROM users--",
        "'; INSERT INTO users VALUES('hacker'); --"
      ];

      maliciousInputs.forEach(input => {
        expect(detectSQLInjection(input)).toBe(true);
      });
    });

    test('should allow safe inputs', () => {
      const safeInputs = [
        "john@example.com",
        "ValidUsername123",
        "This is a normal message",
        "user-id-123"
      ];

      safeInputs.forEach(input => {
        expect(detectSQLInjection(input)).toBe(false);
      });
    });
  });

  describe('XSS Detection', () => {
    test('should detect XSS attempts', () => {
      const xssInputs = [
        "<script>alert('xss')</script>",
        "<iframe src='javascript:alert(1)'></iframe>",
        "javascript:alert(1)",
        "<img onerror='alert(1)' src='x'>",
        "<div onload='alert(1)'></div>"
      ];

      xssInputs.forEach(input => {
        expect(detectXSS(input)).toBe(true);
      });
    });

    test('should allow safe HTML-like content', () => {
      const safeInputs = [
        "This is <b>bold</b> text",
        "Email: user@example.com",
        "Price: $100",
        "Normal text content"
      ];

      safeInputs.forEach(input => {
        expect(detectXSS(input)).toBe(false);
      });
    });
  });

  describe('API Security', () => {
    test('should reject requests with SQL injection in query params', async () => {
      const response = await request(app)
        .get('/api/games')
        .query({ status: "'; DROP TABLE games; --" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Security Violation');
    });

    test('should reject requests with XSS in body', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: "<script>alert('xss')</script>",
          email: "test@example.com",
          password: "password123",
          walletAddress: "1234567890abcdef"
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Security Violation');
    });

    test('should reject requests without proper authentication', async () => {
      const response = await request(app)
        .post('/api/games')
        .send({
          gameType: 'duel',
          wagerAmount: 1.0
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access Denied');
    });

    test('should handle rate limiting', async () => {
      // Make multiple requests quickly to trigger rate limiting
      const requests = Array(10).fill().map(() =>
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          })
      );

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimited = responses.some(res => res.status === 429);
      expect(rateLimited).toBe(true);
    }, 10000);
  });

  describe('Security Headers', () => {
    test('should set security headers', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    test('should not expose server information', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).not.toContain('Express');
    });
  });

  describe('Input Validation', () => {
    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'invalid-email',
          password: 'Password123!',
          walletAddress: '11111111111111111111111111111111'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'weak',
          walletAddress: '11111111111111111111111111111111'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });

    test('should validate wallet address format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123!',
          walletAddress: 'invalid-wallet'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
    });
  });
});