/**
 * OpenAPI v1 validation middleware using AJV
 * Bun/Elysia compatible validation layer
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import Logger from '../../log/logger.js';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const logger = new Logger();

/**
 * Create validation middleware for request body
 * @param {Object} schema - JSON schema for validation
 * @returns {Function} Express middleware function
 */
export function validateRequestBody(schema) {
  const validate = ajv.compile(schema);
  
  return (req, res, next) => {
    const valid = validate(req.body);
    
    if (!valid) {
      // OpenAPI v1 direct response format (no wrapper)
      // Remove sensitive data exposure in validation errors (CodeRabbit feedback)
      const errors = validate.errors.map(err => ({
        field: err.instancePath.substring(1) || err.params?.missingProperty,
        message: err.message
        // Removed value field to prevent sensitive data exposure
      }));
      
      const response = {
        error: 'Validation failed',
        message: `Invalid request data. ${errors.length} validation error(s) found.`,
        details: {
          errors: errors
        }
      };
      
      return res.status(400).json(response);
    }
    
    next();
  };
}

/**
 * Create validation middleware for response body (development only)
 * @param {Object} schema - JSON schema for validation
 * @returns {Function} Express middleware function
 */
export function validateResponseBody(schema) {
  if (process.env.NODE_ENV !== 'development') {
    return (req, res, next) => next();
  }
  
  const validate = ajv.compile(schema);
  
  return (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(body) {
      const valid = validate(body);
      
      if (!valid) {
        logger.warn('Response validation failed:', validate.errors);
        logger.warn('Response body:', JSON.stringify(body, null, 2));
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
}

/**
 * OpenAPI v1 error handler
 * Converts errors to consistent v1 format (direct response, no wrapper)
 */
export function openApiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  logger.error(`OpenAPI v1 Error: ${err.message || err}`);

  // Consistent v1 error format
  const response = {
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  };

  // Add error details if available
  if (err.details) {
    response.details = err.details;
  }

  // Add error code if available
  if (err.code) {
    response.code = err.code;
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json(response);
}