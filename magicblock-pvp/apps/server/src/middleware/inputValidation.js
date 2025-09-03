const Joi = require('joi');
const { logger } = require('../utils/logger');

/**
 * Input validation and sanitization middleware
 */

/**
 * Generic validation middleware factory
 */
function validateInput(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      logger.warn('Input validation failed:', {
        source,
        errors: details,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid input data',
        details
      });
    }

    // Replace original data with validated/sanitized data
    req[source] = value;
    next();
  };
}

/**
 * SQL injection prevention patterns
 */
const sqlInjectionPatterns = [
  /('|(\\')|(;)|(\\)|(\/\*)|(\\*\/)|(--)|(\s)(or|and)\s.*(=|>|<)/i,
  /(union|select|insert|delete|update|drop|create|alter|exec|execute)/i,
  /(script|javascript|vbscript|onload|onerror)/i
];

/**
 * Check for SQL injection attempts
 */
function detectSQLInjection(input) {
  if (typeof input !== 'string') return false;
  
  return sqlInjectionPatterns.some(pattern => pattern.test(input));
}

/**
 * XSS prevention patterns
 */
const xssPatterns = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<[^>]*script[^>]*>/gi,
  /<[^>]*on\w+[^>]*>/gi
];

/**
 * Check for XSS attempts
 */
function detectXSS(input) {
  if (typeof input !== 'string') return false;
  
  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Security validation middleware
 */
function securityValidation(req, res, next) {
  const checkObject = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return null;
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string') {
        if (detectSQLInjection(value)) {
          return {
            type: 'SQL Injection',
            field: currentPath,
            value: value.substring(0, 100)
          };
        }
        
        if (detectXSS(value)) {
          return {
            type: 'XSS Attack',
            field: currentPath,
            value: value.substring(0, 100)
          };
        }
      } else if (typeof value === 'object') {
        const nestedResult = checkObject(value, currentPath);
        if (nestedResult) return nestedResult;
      }
    }
    
    return null;
  };

  // Check all input sources
  const sources = ['body', 'query', 'params'];
  
  for (const source of sources) {
    const attack = checkObject(req[source]);
    if (attack) {
      logger.warn('Security attack detected:', {
        type: attack.type,
        field: attack.field,
        source,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl
      });

      return res.status(400).json({
        error: 'Security Violation',
        message: `${attack.type} attempt detected`,
        field: attack.field
      });
    }
  }

  next();
}

/**
 * Rate limiting for sensitive operations
 */
const rateLimit = require('express-rate-limit');

const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Rate Limit Exceeded',
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded:', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl
      });
      
      res.status(429).json(options.message || defaults.message);
    }
  };

  return rateLimit({ ...defaults, ...options });
};

/**
 * Sensitive operation rate limiter (lower limits)
 */
const sensitiveRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: 'Rate Limit Exceeded',
    message: 'Too many sensitive operations from this IP'
  }
});

/**
 * Common validation schemas
 */
const commonSchemas = {
  id: Joi.string().guid().required(),
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),
  email: Joi.string().email().max(255),
  username: Joi.string().alphanum().min(3).max(30),
  password: Joi.string().min(8).max(128).pattern(
    new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')
  ).message('Password must contain uppercase, lowercase, number and special character'),
  walletAddress: Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
};

module.exports = {
  validateInput,
  securityValidation,
  createRateLimiter,
  sensitiveRateLimit,
  commonSchemas,
  detectSQLInjection,
  detectXSS
};