/**
 * OpenAPI v1 ATX Unit Tests
 * Tests validation middleware and handlers without requiring a running server
 * Uses Bun-compatible Jest syntax for future migration
 */

import { validateRequestBody } from '../src/server/middleware/openapi-validator.js';
import { ATXPowerRequestSchema, ATXActiveRequestSchema } from '../src/server/schemas/atx-schemas.js';

// Mock Express request/response objects
function createMockReq(body = {}) {
  return { body };
}

function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createMockNext() {
  return jest.fn();
}

describe('OpenAPI v1 ATX Validation Unit Tests', () => {

  describe('ATX Power Request Validation', () => {
    const validator = validateRequestBody(ATXPowerRequestSchema);

    test('accepts valid power actions', () => {
      const validActions = ['on', 'off', 'reset', 'short_press', 'long_press'];
      
      validActions.forEach(action => {
        const req = createMockReq({ action });
        const res = createMockRes();
        const next = createMockNext();
        
        validator(req, res, next);
        
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    test('rejects invalid action', () => {
      const req = createMockReq({ action: 'explode' });
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      
      const errorResponse = res.json.mock.calls[0][0];
      expect(errorResponse).toHaveProperty('error', 'Validation failed');
      expect(errorResponse).toHaveProperty('message');
      expect(errorResponse.message).toContain('validation error');
      expect(Array.isArray(errorResponse.details.errors)).toBe(true);
    });

    test('rejects missing action field', () => {
      const req = createMockReq({});
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      
      const errorResponse = res.json.mock.calls[0][0];
      expect(errorResponse.details.errors.some(e => e.field === 'action')).toBe(true);
    });

    test('rejects extra fields', () => {
      const req = createMockReq({ action: 'reset', extraField: 'not-allowed' });
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects wrong type for action', () => {
      const req = createMockReq({ action: 123 });
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      
      const errorResponse = res.json.mock.calls[0][0];
      expect(errorResponse).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('ATX Active Request Validation', () => {
    const validator = validateRequestBody(ATXActiveRequestSchema);

    test('accepts boolean enabled values', () => {
      [true, false].forEach(enabled => {
        const req = createMockReq({ enabled });
        const res = createMockRes();
        const next = createMockNext();
        
        validator(req, res, next);
        
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    test('rejects non-boolean enabled', () => {
      const invalidValues = ['true', 'false', 1, 0, null, undefined, 'yes', 'no'];
      
      invalidValues.forEach(enabled => {
        const req = createMockReq({ enabled });
        const res = createMockRes();
        const next = createMockNext();
        
        validator(req, res, next);
        
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        
        const errorResponse = res.json.mock.calls[res.json.mock.calls.length - 1][0];
        expect(errorResponse.details.errors.some(e => e.field === 'enabled')).toBe(true);
      });
    });

    test('rejects missing enabled field', () => {
      const req = createMockReq({});
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('rejects extra fields', () => {
      const req = createMockReq({ enabled: true, extraField: 'not-allowed' });
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Validation Error Format Consistency', () => {
    test('all validation errors follow same format', () => {
      const testCases = [
        { schema: ATXPowerRequestSchema, body: { action: 'invalid' } },
        { schema: ATXActiveRequestSchema, body: { enabled: 'not-boolean' } },
        { schema: ATXPowerRequestSchema, body: {} }, // missing required field
      ];
      
      testCases.forEach(({ schema, body }) => {
        const validator = validateRequestBody(schema);
        const req = createMockReq(body);
        const res = createMockRes();
        const next = createMockNext();
        
        validator(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(400);
        
        const errorResponse = res.json.mock.calls[res.json.mock.calls.length - 1][0];
        
        // Consistent v1 error structure
        expect(errorResponse).toHaveProperty('error', 'Validation failed');
        expect(errorResponse).toHaveProperty('message');
        expect(errorResponse).toHaveProperty('details');
        expect(Array.isArray(errorResponse.details.errors)).toBe(true);
        
        // Each error has required fields
        errorResponse.details.errors.forEach(error => {
          expect(error).toHaveProperty('field');
          expect(error).toHaveProperty('message');
        });
      });
    });
  });

  describe('Schema Definitions', () => {
    test('ATXPowerRequestSchema has correct structure', () => {
      expect(ATXPowerRequestSchema).toHaveProperty('type', 'object');
      expect(ATXPowerRequestSchema).toHaveProperty('required', ['action']);
      expect(ATXPowerRequestSchema).toHaveProperty('additionalProperties', false);
      expect(ATXPowerRequestSchema.properties.action.enum).toEqual([
        'on', 'off', 'reset', 'short_press', 'long_press'
      ]);
    });

    test('ATXActiveRequestSchema has correct structure', () => {
      expect(ATXActiveRequestSchema).toHaveProperty('type', 'object');
      expect(ATXActiveRequestSchema).toHaveProperty('required', ['enabled']);
      expect(ATXActiveRequestSchema).toHaveProperty('additionalProperties', false);
      expect(ATXActiveRequestSchema.properties.enabled.type).toBe('boolean');
    });
  });

  describe('AJV Integration', () => {
    test('validation middleware creates proper AJV error format', () => {
      const validator = validateRequestBody(ATXPowerRequestSchema);
      const req = createMockReq({ action: 'invalid-action' });
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      const errorResponse = res.json.mock.calls[0][0];
      const ajvError = errorResponse.details.errors[0];
      
      // AJV error structure
      expect(ajvError).toHaveProperty('field', 'action');
      expect(ajvError).toHaveProperty('message');
      expect(ajvError.message).toContain('allowed values');
    });

    test('validation passes clean requests through unchanged', () => {
      const validator = validateRequestBody(ATXPowerRequestSchema);
      const originalBody = { action: 'reset' };
      const req = createMockReq(originalBody);
      const res = createMockRes();
      const next = createMockNext();
      
      validator(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual(originalBody);
    });
  });
});

// Mock Jest functions for Bun compatibility
if (typeof jest === 'undefined') {
  global.jest = {
    fn: () => {
      const fn = (...args) => {
        fn.mock.calls.push(args);
        return fn.mock.returnValue;
      };
      fn.mock = { calls: [], returnValue: undefined };
      fn.mockReturnValue = (value) => {
        fn.mock.returnValue = value;
        return fn;
      };
      fn.toHaveBeenCalled = () => fn.mock.calls.length > 0;
      fn.toHaveBeenCalledWith = (...args) => 
        fn.mock.calls.some(call => JSON.stringify(call) === JSON.stringify(args));
      return fn;
    }
  };
}