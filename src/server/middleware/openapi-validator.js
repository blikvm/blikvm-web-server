/**
 * OpenAPI v1 validation middleware using AJV
 * Bun/Elysia compatible validation layer
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createApiObj, ApiCode } from '../../common/api.js';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

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
      const ret = createApiObj();
      ret.msg = 'Request validation failed';
      ret.code = ApiCode.INVALID_INPUT_PARAM;
      ret.data = {
        errors: validate.errors.map(err => ({
          field: err.instancePath.substring(1) || err.params?.missingProperty,
          message: err.message,
          value: err.data
        }))
      };
      
      return res.status(400).json(ret);
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
        console.warn('Response validation failed:', validate.errors);
        console.warn('Response body:', JSON.stringify(body, null, 2));
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
}

/**
 * OpenAPI v1 error handler
 * Converts errors to consistent v1 format
 */
export function openApiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  console.error('OpenAPI v1 Error:', err);

  const response = {
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  };

  if (err.details) {
    response.details = err.details;
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json(response);
}