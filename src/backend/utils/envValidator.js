const { logger } = require('./logger');

/**
 * Environment variable validator for security-critical settings
 */
class EnvironmentValidator {
  constructor() {
    this.requiredVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'DB_HOST',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD'
    ];
    
    this.securityVars = [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'INTERNAL_API_KEY',
      'DB_PASSWORD'
    ];
  }

  /**
   * Validate all required environment variables
   */
  validateEnvironment() {
    const missing = [];
    const weak = [];
    
    for (const varName of this.requiredVars) {
      const value = process.env[varName];
      
      if (!value) {
        missing.push(varName);
        continue;
      }
      
      // Check for weak security variables
      if (this.securityVars.includes(varName)) {
        if (this.isWeakSecret(value, varName)) {
          weak.push(varName);
        }
      }
    }
    
    if (missing.length > 0) {
      const error = `Missing required environment variables: ${missing.join(', ')}`;
      logger.error('Environment validation failed:', error);
      throw new Error(error);
    }
    
    if (weak.length > 0) {
      const warning = `Weak security configuration detected for: ${weak.join(', ')}`;
      logger.warn('Security warning:', warning);
      
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Production deployment blocked: ${warning}`);
      }
    }
    
    logger.info('Environment validation passed');
    return true;
  }

  /**
   * Check if a secret value is weak or using defaults
   */
  isWeakSecret(value, varName) {
    const weakPatterns = [
      'secret',
      'password',
      'your-',
      'test',
      'dev',
      'localhost',
      'changeme',
      '123456',
      'default'
    ];
    
    // Check minimum length
    if (value.length < 32) {
      logger.warn(`${varName} should be at least 32 characters long`);
      return true;
    }
    
    // Check for common weak patterns
    const lowerValue = value.toLowerCase();
    for (const pattern of weakPatterns) {
      if (lowerValue.includes(pattern)) {
        logger.warn(`${varName} contains weak pattern: ${pattern}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Generate secure JWT secret
   */
  generateSecureSecret(length = 64) {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('base64');
  }

  /**
   * Validate JWT secret specifically
   */
  validateJWTSecret() {
    const jwtSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET environment variable is required');
    }
    
    if (jwtSecret === refreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
    }
    
    // Check for development/test secrets in production
    if (process.env.NODE_ENV === 'production') {
      const testPatterns = ['test', 'dev', 'localhost', 'your-', 'secret'];
      const jwtLower = jwtSecret.toLowerCase();
      
      for (const pattern of testPatterns) {
        if (jwtLower.includes(pattern)) {
          throw new Error(`Production JWT_SECRET cannot contain: ${pattern}`);
        }
      }
    }
    
    return true;
  }

  /**
   * Validate database configuration
   */
  validateDatabaseConfig() {
    const requiredDbVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missing = requiredDbVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      throw new Error(`Missing database configuration: ${missing.join(', ')}`);
    }
    
    // Warn about default database credentials
    if (process.env.DB_USER === 'postgres' && process.env.DB_PASSWORD === 'password') {
      logger.warn('Using default database credentials - change in production');
    }
    
    return true;
  }

  /**
   * Initialize environment validation
   */
  init() {
    try {
      this.validateEnvironment();
      this.validateJWTSecret();
      this.validateDatabaseConfig();
      
      logger.info('All environment validations passed');
      return true;
      
    } catch (error) {
      logger.error('Environment validation failed:', error.message);
      
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
      
      throw error;
    }
  }
}

// Create singleton instance
const envValidator = new EnvironmentValidator();

module.exports = {
  EnvironmentValidator,
  envValidator
};