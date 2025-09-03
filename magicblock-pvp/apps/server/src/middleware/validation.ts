import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError as ExpressValidationError } from 'express-validator';
import { logger } from '@/config/logger';
import { ApiResponse, ValidationError } from '@/types/api.types';

/**
 * Middleware to handle express-validator errors
 */
export const validationErrorHandler = (
  req: Request,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.type === 'field' ? (error as any).path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? (error as any).value : undefined,
      location: error.type === 'field' ? (error as any).location : undefined
    }));

    logger.warn('Validation errors:', { 
      endpoint: req.originalUrl,
      method: req.method,
      errors: errorDetails,
      body: req.body,
      params: req.params,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: errorDetails
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
  
  next();
};

/**
 * Middleware to validate request content type
 */
export const validateContentType = (contentType: string = 'application/json') => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const requestContentType = req.get('Content-Type');
      
      if (!requestContentType || !requestContentType.includes(contentType)) {
        logger.warn('Invalid content type:', {
          endpoint: req.originalUrl,
          expected: contentType,
          received: requestContentType
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONTENT_TYPE',
            message: `Content-Type must be ${contentType}`,
            details: {
              expected: contentType,
              received: requestContentType || 'none'
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }
    }
    
    next();
  };
};

/**
 * Middleware to validate request body size
 */
export const validateBodySize = (maxSizeBytes: number = 1024 * 1024) => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      logger.warn('Request body too large:', {
        endpoint: req.originalUrl,
        size: contentLength,
        maxSize: maxSizeBytes
      });

      return res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Request body must be smaller than ${maxSizeBytes} bytes`,
          details: {
            size: parseInt(contentLength),
            maxSize: maxSizeBytes
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }
    
    next();
  };
};

/**
 * Middleware to validate API version
 */
export const validateApiVersion = (supportedVersions: string[] = ['v1']) => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    const version = req.get('API-Version') || req.query.version as string || 'v1';
    
    if (!supportedVersions.includes(version)) {
      logger.warn('Unsupported API version:', {
        endpoint: req.originalUrl,
        requestedVersion: version,
        supportedVersions
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_API_VERSION',
          message: `API version '${version}' is not supported`,
          details: {
            requestedVersion: version,
            supportedVersions
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }
    
    // Store version in request for later use
    (req as any).apiVersion = version;
    next();
  };
};

/**
 * Middleware to validate required headers
 */
export const validateRequiredHeaders = (requiredHeaders: string[]) => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    const missingHeaders: string[] = [];
    
    requiredHeaders.forEach(header => {
      if (!req.get(header)) {
        missingHeaders.push(header);
      }
    });
    
    if (missingHeaders.length > 0) {
      logger.warn('Missing required headers:', {
        endpoint: req.originalUrl,
        missingHeaders,
        headers: req.headers
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_HEADERS',
          message: 'Required headers are missing',
          details: {
            missingHeaders,
            requiredHeaders
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }
    
    next();
  };
};

/**
 * Middleware to sanitize and validate string inputs
 */
export const sanitizeStrings = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      // Basic XSS protection
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    } else if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    } else if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val);
      }
      return sanitized;
    }
    return value;
  };

  // Sanitize body
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  // Sanitize route parameters
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
};

/**
 * Middleware to validate game-specific business rules
 */
export const validateGameRules = (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { body, params } = req;
    
    // Validate bet amounts
    if (body.betAmount !== undefined) {
      const betAmount = parseFloat(body.betAmount);
      
      if (isNaN(betAmount) || betAmount < 0.01 || betAmount > 10) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BET_AMOUNT',
            message: 'Bet amount must be between 0.01 and 10 SOL',
            details: {
              provided: body.betAmount,
              minimum: 0.01,
              maximum: 10
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }
    }

    // Validate game IDs format
    if (params.gameId) {
      const gameIdRegex = /^[a-zA-Z0-9_-]{8,20}$/;
      if (!gameIdRegex.test(params.gameId)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_GAME_ID_FORMAT',
            message: 'Game ID format is invalid',
            details: {
              provided: params.gameId,
              expected: 'Alphanumeric string, 8-20 characters'
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }
    }

    // Validate action data structure
    if (body.actionData) {
      if (typeof body.actionData !== 'object' || Array.isArray(body.actionData)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACTION_DATA',
            message: 'Action data must be a valid object',
            details: {
              provided: typeof body.actionData,
              expected: 'object'
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }
    }

    // Validate timestamp format
    if (body.clientTimestamp) {
      const timestamp = new Date(body.clientTimestamp);
      if (isNaN(timestamp.getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'Client timestamp is invalid',
            details: {
              provided: body.clientTimestamp,
              expected: 'ISO 8601 timestamp string'
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }

      // Check timestamp is not too old or in the future
      const now = Date.now();
      const timestampMs = timestamp.getTime();
      const fiveMinutes = 5 * 60 * 1000;

      if (timestampMs > now + fiveMinutes) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TIMESTAMP_IN_FUTURE',
            message: 'Client timestamp cannot be in the future',
            details: {
              provided: body.clientTimestamp,
              serverTime: new Date().toISOString()
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }

      if (now - timestampMs > fiveMinutes) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TIMESTAMP_TOO_OLD',
            message: 'Client timestamp is too old (max 5 minutes)',
            details: {
              provided: body.clientTimestamp,
              maxAge: '5 minutes'
            }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: res.get('X-Request-ID')
          }
        });
      }
    }

    next();

  } catch (error) {
    logger.error('Game rules validation error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Internal validation error'
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.get('X-Request-ID')
      }
    });
  }
};

/**
 * Middleware to validate pagination parameters
 */
export const validatePagination = (
  defaultLimit: number = 20,
  maxLimit: number = 100
) => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    const limit = parseInt(req.query.limit as string) || defaultLimit;
    const offset = parseInt(req.query.offset as string) || 0;

    if (limit < 1 || limit > maxLimit) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAGINATION',
          message: `Limit must be between 1 and ${maxLimit}`,
          details: {
            provided: limit,
            min: 1,
            max: maxLimit
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }

    if (offset < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAGINATION',
          message: 'Offset must be >= 0',
          details: {
            provided: offset,
            min: 0
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }

    // Set validated values back to query
    req.query.limit = limit.toString();
    req.query.offset = offset.toString();

    next();
  };
};

/**
 * Custom validation error class for business logic
 */
export class BusinessValidationError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'BusinessValidationError';
  }
}

/**
 * Higher-order function to create validation middleware for specific fields
 */
export const createFieldValidator = (fieldName: string, validator: (value: any) => boolean, errorMessage: string) => {
  return (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
    const value = req.body[fieldName] || req.query[fieldName] || req.params[fieldName];
    
    if (value !== undefined && !validator(value)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FIELD_VALIDATION_ERROR',
          message: errorMessage,
          details: {
            field: fieldName,
            value: value
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: res.get('X-Request-ID')
        }
      });
    }
    
    next();
  };
};