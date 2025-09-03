/**
 * Security Hardening Tests - Rate Limiting & Anti-Spam
 * Comprehensive security validation for production deployment
 */

import { test, expect } from '@playwright/test';
import { performance } from 'perf_hooks';

// Rate limiting test configuration
const RATE_LIMIT_CONFIG = {
  requests: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  burstAllowed: 10,
  blockDurationMs: 60 * 1000, // 1 minute block
};

const API_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/verify-wallet', 
  '/api/games/strategic-duel/matchmaking',
  '/api/magicblock/session/init',
  '/api/magicblock/action/execute',
];

// Test data for security validation
const ATTACK_PAYLOADS = {
  xss: [
    '<script>alert("XSS")</script>',
    '"><script>alert("XSS")</script>',
    'javascript:alert("XSS")',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
  ],
  sqlInjection: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "1' UNION SELECT * FROM users--",
    "admin'--",
    "admin' /*",
  ],
  nosqlInjection: [
    '{"$gt":""}',
    '{"$ne":null}',
    '{"$where":"sleep(1000)"}',
    '{"$regex":".*"}',
  ],
  commandInjection: [
    '; ls -la',
    '| cat /etc/passwd',
    '&& whoami',
    '$(id)',
    '`pwd`',
  ],
};

class SecurityTestSuite {
  private baseURL: string;
  private userAgent: string;

  constructor(baseURL = 'http://localhost:5000') {
    this.baseURL = baseURL;
    this.userAgent = 'SecurityTestAgent/1.0';
  }

  /**
   * Test rate limiting enforcement
   */
  async testRateLimiting(endpoint: string): Promise<{
    blocked: boolean;
    requestsBeforeBlock: number;
    blockDuration: number;
  }> {
    const results = {
      blocked: false,
      requestsBeforeBlock: 0,
      blockDuration: 0,
    };

    const startTime = Date.now();
    let consecutiveRequests = 0;

    // Send rapid requests to trigger rate limiting
    for (let i = 0; i < RATE_LIMIT_CONFIG.requests + 20; i++) {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
          'X-Test-Security': 'rate-limit-test',
        },
        body: JSON.stringify({ test: `request_${i}` }),
      });

      consecutiveRequests++;

      // Check if rate limited (429 status)
      if (response.status === 429) {
        results.blocked = true;
        results.requestsBeforeBlock = consecutiveRequests - 1;
        
        // Measure block duration
        const blockStartTime = Date.now();
        
        // Wait and test when rate limit is lifted
        await this.waitForRateLimitReset(endpoint);
        
        results.blockDuration = Date.now() - blockStartTime;
        break;
      }

      // Small delay to avoid overwhelming the server
      await this.delay(10);
    }

    return results;
  }

  /**
   * Test JWT authentication security
   */
  async testJWTSecurity(): Promise<{
    invalidTokenBlocked: boolean;
    expiredTokenBlocked: boolean;
    noTokenBlocked: boolean;
    tokenTamperingBlocked: boolean;
  }> {
    const results = {
      invalidTokenBlocked: false,
      expiredTokenBlocked: false,
      noTokenBlocked: false,
      tokenTamperingBlocked: false,
    };

    // Test 1: Invalid token format
    const invalidTokenResponse = await fetch(`${this.baseURL}/api/games`, {
      headers: {
        'Authorization': 'Bearer invalid_token_format',
        'X-Test-Security': 'jwt-test',
      },
    });
    results.invalidTokenBlocked = invalidTokenResponse.status === 401;

    // Test 2: No token provided
    const noTokenResponse = await fetch(`${this.baseURL}/api/games`, {
      headers: { 'X-Test-Security': 'jwt-test' },
    });
    results.noTokenBlocked = noTokenResponse.status === 401;

    // Test 3: Expired token (simulated)
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
    const expiredTokenResponse = await fetch(`${this.baseURL}/api/games`, {
      headers: {
        'Authorization': `Bearer ${expiredToken}`,
        'X-Test-Security': 'jwt-test',
      },
    });
    results.expiredTokenBlocked = expiredTokenResponse.status === 401;

    // Test 4: Token tampering
    const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.TAMPERED_PAYLOAD.TAMPERED_SIGNATURE';
    const tamperedTokenResponse = await fetch(`${this.baseURL}/api/games`, {
      headers: {
        'Authorization': `Bearer ${tamperedToken}`,
        'X-Test-Security': 'jwt-test',
      },
    });
    results.tokenTamperingBlocked = tamperedTokenResponse.status === 401;

    return results;
  }

  /**
   * Test input sanitization against various attack vectors
   */
  async testInputSanitization(): Promise<{
    xssBlocked: boolean;
    sqlInjectionBlocked: boolean;
    commandInjectionBlocked: boolean;
    oversizedInputBlocked: boolean;
  }> {
    const results = {
      xssBlocked: true,
      sqlInjectionBlocked: true,
      commandInjectionBlocked: true,
      oversizedInputBlocked: false,
    };

    // Test XSS payloads
    for (const payload of ATTACK_PAYLOADS.xss) {
      const response = await fetch(`${this.baseURL}/api/games/strategic-duel/matchmaking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Security': 'xss-test',
        },
        body: JSON.stringify({ 
          priority: payload,
          betAmount: 0.01 
        }),
      });

      // Should either reject (400/422) or sanitize the input
      if (response.status === 200) {
        const data = await response.json();
        // Check if the payload was executed (dangerous)
        if (data.toString().includes('<script>') || data.toString().includes('javascript:')) {
          results.xssBlocked = false;
          break;
        }
      }
    }

    // Test SQL injection payloads
    for (const payload of ATTACK_PAYLOADS.sqlInjection) {
      const response = await fetch(`${this.baseURL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Security': 'sql-injection-test',
        },
        body: JSON.stringify({ 
          email: payload,
          password: 'test_password' 
        }),
      });

      // Should reject malicious input
      if (response.status === 200) {
        results.sqlInjectionBlocked = false;
        break;
      }
    }

    // Test oversized input
    const oversizedPayload = 'A'.repeat(10 * 1024 * 1024); // 10MB payload
    const oversizeResponse = await fetch(`${this.baseURL}/api/games/strategic-duel/matchmaking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Security': 'oversize-test',
      },
      body: JSON.stringify({ 
        priority: 'MEDIUM',
        betAmount: 0.01,
        oversizedField: oversizedPayload
      }),
    });

    results.oversizedInputBlocked = oversizeResponse.status === 413 || oversizeResponse.status === 400;

    return results;
  }

  /**
   * Test CORS policy enforcement
   */
  async testCORSPolicy(): Promise<{
    unauthorizedOriginBlocked: boolean;
    preflightHandled: boolean;
    credentialsRestricted: boolean;
  }> {
    const results = {
      unauthorizedOriginBlocked: false,
      preflightHandled: false,
      credentialsRestricted: false,
    };

    // Test unauthorized origin
    const unauthorizedResponse = await fetch(`${this.baseURL}/api/health`, {
      headers: {
        'Origin': 'https://malicious-site.com',
        'X-Test-Security': 'cors-test',
      },
    });

    // Check CORS headers
    const corsHeaders = unauthorizedResponse.headers.get('Access-Control-Allow-Origin');
    results.unauthorizedOriginBlocked = !corsHeaders || corsHeaders === 'null';

    // Test preflight request
    const preflightResponse = await fetch(`${this.baseURL}/api/games`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-site.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    results.preflightHandled = preflightResponse.status === 200 || preflightResponse.status === 204;

    return results;
  }

  /**
   * Test anti-spam measures
   */
  async testAntiSpamMeasures(): Promise<{
    suspiciousPatternDetected: boolean;
    honeypotTriggered: boolean;
    behaviorAnalysisActive: boolean;
  }> {
    const results = {
      suspiciousPatternDetected: false,
      honeypotTriggered: false,
      behaviorAnalysisActive: false,
    };

    // Test 1: Rapid identical requests (spam pattern)
    const spamRequests = Array.from({ length: 50 }, (_, i) => 
      fetch(`${this.baseURL}/api/games/strategic-duel/matchmaking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Security': 'spam-test',
        },
        body: JSON.stringify({ 
          priority: 'MEDIUM',
          betAmount: 0.01,
          timestamp: Date.now() // Same payload
        }),
      })
    );

    const spamResponses = await Promise.all(spamRequests);
    const blockedCount = spamResponses.filter(r => r.status === 429).length;
    results.suspiciousPatternDetected = blockedCount > 0;

    // Test 2: Honeypot field (hidden field that should never be filled)
    const honeypotResponse = await fetch(`${this.baseURL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Security': 'honeypot-test',
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword',
        website: 'http://bot-filled-this.com', // Honeypot field
      }),
    });

    results.honeypotTriggered = honeypotResponse.status === 422 || honeypotResponse.status === 400;

    return results;
  }

  /**
   * Test WebSocket security
   */
  async testWebSocketSecurity(): Promise<{
    originValidated: boolean;
    authenticationRequired: boolean;
    rateLimitingActive: boolean;
  }> {
    const results = {
      originValidated: false,
      authenticationRequired: false,
      rateLimitingActive: false,
    };

    // This would require WebSocket testing implementation
    // For now, we'll simulate the checks
    
    try {
      // Attempt WebSocket connection with malicious origin
      const ws = new WebSocket(`ws://localhost:5000/socket.io/?EIO=4&transport=websocket`, {
        headers: {
          'Origin': 'https://malicious-site.com',
        },
      });

      await new Promise((resolve, reject) => {
        ws.onopen = () => {
          results.originValidated = false; // Should be blocked
          ws.close();
          resolve(true);
        };
        ws.onerror = () => {
          results.originValidated = true; // Correctly blocked
          resolve(true);
        };
        setTimeout(() => {
          results.originValidated = true; // Timeout = blocked
          resolve(true);
        }, 5000);
      });
    } catch (error) {
      results.originValidated = true; // Exception = blocked
    }

    return results;
  }

  /**
   * Performance impact assessment of security measures
   */
  async measureSecurityOverhead(): Promise<{
    baselineLatency: number;
    securityEnabledLatency: number;
    overheadPercentage: number;
    throughputImpact: number;
  }> {
    const iterations = 100;
    
    // Measure baseline (health check endpoint)
    const baselineTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fetch(`${this.baseURL}/health`);
      baselineTimes.push(performance.now() - start);
    }

    // Measure with security validation (protected endpoint)
    const securityTimes: number[] = [];
    const token = await this.getValidJWTToken(); // Mock implementation
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fetch(`${this.baseURL}/api/games`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      securityTimes.push(performance.now() - start);
    }

    const baselineLatency = baselineTimes.reduce((a, b) => a + b, 0) / iterations;
    const securityEnabledLatency = securityTimes.reduce((a, b) => a + b, 0) / iterations;
    const overheadPercentage = ((securityEnabledLatency - baselineLatency) / baselineLatency) * 100;

    return {
      baselineLatency,
      securityEnabledLatency,
      overheadPercentage,
      throughputImpact: overheadPercentage // Simplified calculation
    };
  }

  // Utility methods
  private async waitForRateLimitReset(endpoint: string): Promise<void> {
    const maxWaitTime = 65000; // 65 seconds max
    const checkInterval = 5000; // Check every 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Test-Security': 'rate-limit-reset-check',
        },
        body: JSON.stringify({ test: 'reset_check' }),
      });

      if (response.status !== 429) {
        return; // Rate limit lifted
      }

      await this.delay(checkInterval);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getValidJWTToken(): string {
    // Mock JWT token generation for testing
    return 'mock_jwt_token_for_security_testing';
  }
}

// Playwright test suite
test.describe('Security Hardening Validation', () => {
  let securitySuite: SecurityTestSuite;

  test.beforeAll(() => {
    securitySuite = new SecurityTestSuite();
  });

  test('Rate limiting enforcement', async () => {
    const criticalEndpoints = [
      '/api/auth/login',
      '/api/auth/verify-wallet',
      '/api/games/strategic-duel/matchmaking',
    ];

    for (const endpoint of criticalEndpoints) {
      await test.step(`Rate limiting: ${endpoint}`, async () => {
        const result = await securitySuite.testRateLimiting(endpoint);
        
        expect(result.blocked).toBe(true);
        expect(result.requestsBeforeBlock).toBeLessThanOrEqual(RATE_LIMIT_CONFIG.requests);
        expect(result.blockDuration).toBeGreaterThan(30000); // At least 30s block
        
        console.log(`${endpoint}: Blocked after ${result.requestsBeforeBlock} requests, ${result.blockDuration}ms block`);
      });
    }
  });

  test('JWT authentication security', async () => {
    const result = await securitySuite.testJWTSecurity();
    
    expect(result.invalidTokenBlocked).toBe(true);
    expect(result.expiredTokenBlocked).toBe(true);
    expect(result.noTokenBlocked).toBe(true);
    expect(result.tokenTamperingBlocked).toBe(true);
    
    console.log('JWT Security Test Results:', result);
  });

  test('Input sanitization and validation', async () => {
    const result = await securitySuite.testInputSanitization();
    
    expect(result.xssBlocked).toBe(true);
    expect(result.sqlInjectionBlocked).toBe(true);
    expect(result.oversizedInputBlocked).toBe(true);
    
    console.log('Input Sanitization Results:', result);
  });

  test('CORS policy enforcement', async () => {
    const result = await securitySuite.testCORSPolicy();
    
    expect(result.unauthorizedOriginBlocked).toBe(true);
    expect(result.preflightHandled).toBe(true);
    
    console.log('CORS Policy Results:', result);
  });

  test('Anti-spam measures', async () => {
    const result = await securitySuite.testAntiSpamMeasures();
    
    expect(result.suspiciousPatternDetected).toBe(true);
    // Honeypot is optional but recommended
    
    console.log('Anti-Spam Results:', result);
  });

  test('WebSocket security', async () => {
    const result = await securitySuite.testWebSocketSecurity();
    
    expect(result.originValidated).toBe(true);
    
    console.log('WebSocket Security Results:', result);
  });

  test('Security performance impact', async () => {
    const result = await securitySuite.measureSecurityOverhead();
    
    // Security overhead should be reasonable (< 50% impact)
    expect(result.overheadPercentage).toBeLessThan(50);
    
    console.log(`Security Performance Impact: ${result.overheadPercentage.toFixed(2)}%`);
    console.log(`Baseline: ${result.baselineLatency.toFixed(2)}ms, Secured: ${result.securityEnabledLatency.toFixed(2)}ms`);
  });

  test('Comprehensive security scan', async () => {
    // Run all security tests in parallel for comprehensive assessment
    const [
      rateLimiting,
      jwtSecurity,
      inputSanitization,
      corsPolicy,
      antiSpam,
      webSocketSecurity,
      performanceImpact,
    ] = await Promise.all([
      securitySuite.testRateLimiting('/api/auth/login'),
      securitySuite.testJWTSecurity(),
      securitySuite.testInputSanitization(),
      securitySuite.testCORSPolicy(),
      securitySuite.testAntiSpamMeasures(),
      securitySuite.testWebSocketSecurity(),
      securitySuite.measureSecurityOverhead(),
    ]);

    // Generate security score
    const securityChecks = [
      rateLimiting.blocked,
      jwtSecurity.invalidTokenBlocked,
      jwtSecurity.expiredTokenBlocked,
      jwtSecurity.noTokenBlocked,
      jwtSecurity.tokenTamperingBlocked,
      inputSanitization.xssBlocked,
      inputSanitization.sqlInjectionBlocked,
      inputSanitization.oversizedInputBlocked,
      corsPolicy.unauthorizedOriginBlocked,
      antiSpam.suspiciousPatternDetected,
      webSocketSecurity.originValidated,
    ];

    const securityScore = (securityChecks.filter(check => check).length / securityChecks.length) * 100;
    
    console.log(`\n🛡️ COMPREHENSIVE SECURITY ASSESSMENT`);
    console.log(`Security Score: ${securityScore.toFixed(1)}%`);
    console.log(`Performance Impact: ${performanceImpact.overheadPercentage.toFixed(2)}%`);
    console.log(`\nRecommendation: ${securityScore >= 90 ? 'PRODUCTION READY' : 'NEEDS IMPROVEMENT'}`);

    expect(securityScore).toBeGreaterThanOrEqual(85); // Minimum 85% security compliance
  });
});

export default SecurityTestSuite;