/**
 * OpenAPI v1 ATX Endpoints Test Suite
 * Tests dual routing: legacy /api vs new /api/v1 endpoints
 * Uses Bun-compatible Jest syntax for future migration
 */

import { api, authenticate, clearAuth } from './_helpers/apiClient.js';

// Test both legacy and v1 endpoints for compatibility
describe('ATX API Compatibility Tests', () => {

  beforeAll(async () => {
    // Authenticate before running tests
    try {
      await authenticate('admin', 'admin');
      console.log('✅ Authenticated successfully for OpenAPI v1 ATX tests');
    } catch (error) {
      console.error('❌ Failed to authenticate:', error.message);
      throw error;
    }
  });

  afterAll(async () => {
    // Clean up authentication
    clearAuth();
  });

  describe('GET /api/v1/atx/power - Power State', () => {
    test('returns valid power state format', async () => {
      const { status, json } = await api('GET', '/api/v1/atx/power');
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled');
      expect(json).toHaveProperty('power');
      expect(typeof json.enabled).toBe('boolean');
      expect(['on', 'off', 'unknown']).toContain(json.power);
    });

    test('response matches OpenAPI schema', async () => {
      const { status, json } = await api('GET', '/api/v1/atx/power');
      
      expect(status).toBe(200);
      // OpenAPI v1 format (no legacy 'result' wrapper)
      expect(json).not.toHaveProperty('result');
      expect(json).not.toHaveProperty('msg');
      expect(json).not.toHaveProperty('code');
      
      // Only contains schema-defined properties
      const allowedProps = ['enabled', 'power'];
      Object.keys(json).forEach(key => {
        expect(allowedProps).toContain(key);
      });
    });
  });

  describe('PUT /api/v1/atx/power - Power Control', () => {
    const validActions = ['on', 'off', 'reset', 'short_press', 'long_press'];

    test.each(validActions)('accepts valid action: %s', async (action) => {
      const { status, json } = await api('PUT', '/api/v1/atx/power', { action });
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled');
      expect(json).toHaveProperty('power');
      expect(['on', 'off', 'unknown']).toContain(json.power);
    });

    test('rejects invalid action with validation error', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx/power', { action: 'explode' });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('msg');
      expect(json.msg).toContain('validation');
      expect(json).toHaveProperty('code', 200);
      expect(json).toHaveProperty('data');
      expect(Array.isArray(json.data.errors)).toBe(true);
      
      // AJV validation error format
      const error = json.data.errors[0];
      expect(error).toHaveProperty('field');
      expect(error).toHaveProperty('message');
    });

    test('rejects missing action field', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx/power', {});
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('code', 200);
      expect(json.data.errors.some(e => e.field === 'action')).toBe(true);
    });

    test('rejects extra fields', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx/power', { 
        action: 'reset', 
        extraField: 'should-not-be-here' 
      });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('code', 200);
    });
  });

  describe('GET /api/v1/atx - ATX Active State', () => {
    test('returns enabled state', async () => {
      const { status, json } = await api('GET', '/api/v1/atx');
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled');
      expect(typeof json.enabled).toBe('boolean');
    });

    test('matches OpenAPI schema exactly', async () => {
      const { status, json } = await api('GET', '/api/v1/atx');
      
      expect(status).toBe(200);
      expect(Object.keys(json)).toEqual(['enabled']);
    });
  });

  describe('PUT /api/v1/atx - Set ATX Active State', () => {
    test('accepts boolean enabled values', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', { enabled: true });
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled', true);
    });

    test('accepts false value', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', { enabled: false });
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled', false);
    });

    test('rejects non-boolean enabled', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', { enabled: 'true' });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('code', 200);
      expect(json.data.errors.some(e => e.field === 'enabled')).toBe(true);
    });

    test('rejects missing enabled field', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', {});
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('code', 200);
    });
  });

  describe('Legacy vs v1 API Compatibility', () => {
    test('legacy GET /api/atx and v1 GET /api/v1/atx return equivalent data', async () => {
      const [legacy, v1] = await Promise.all([
        api('GET', '/api/atx'),
        api('GET', '/api/v1/atx')
      ]);
      
      expect(legacy.status).toBe(200);
      expect(v1.status).toBe(200);
      
      // Legacy has wrapper, v1 is direct
      expect(legacy.json.data.isActive).toBe(v1.json.enabled);
    });

    test('legacy POST /api/atx/click and v1 PUT /api/v1/atx/power both control power', async () => {
      // Legacy format: query param
      const legacy = await api('POST', '/api/atx/click?button=reboot');
      
      // v1 format: request body
      const v1 = await api('PUT', '/api/v1/atx/power', { action: 'reset' });
      
      expect(legacy.status).toBe(200);
      expect(v1.status).toBe(200);
      
      // Both should succeed (exact response comparison would require mocking)
      expect(legacy.json).toHaveProperty('data');    // Legacy format has 'data' property
      expect(legacy.json.code).toBe(0);              // Legacy success code
      expect(v1.json).toHaveProperty('enabled');     // v1 format
    });

    test('legacy POST /api/atx and v1 PUT /api/v1/atx both set active state', async () => {
      // Test enabling ATX
      const [legacy, v1] = await Promise.all([
        api('POST', '/api/atx', { isActive: true }),
        api('PUT', '/api/v1/atx', { enabled: true })
      ]);
      
      expect(legacy.status).toBe(200);
      expect(v1.status).toBe(200);
      
      // Legacy has wrapper format
      expect(legacy.json.data.isActive).toBe(true);
      // v1 is direct
      expect(v1.json.enabled).toBe(true);
    });
  });

  describe('Error Handling Consistency', () => {
    test('v1 APIs return consistent error format', async () => {
      const tests = [
        { endpoint: '/api/v1/atx/power', method: 'PUT', body: { action: 'invalid' } },
        { endpoint: '/api/v1/atx', method: 'PUT', body: { enabled: 'not-boolean' } },
      ];
      
      for (const { endpoint, method, body } of tests) {
        const { status, json } = await api(method, endpoint, body);
        
        expect(status).toBe(400);
        expect(json).toHaveProperty('msg');
        expect(json).toHaveProperty('code', 200);
        expect(json).toHaveProperty('data');
        expect(Array.isArray(json.data.errors)).toBe(true);
        
        // Each error has required fields
        json.data.errors.forEach(error => {
          expect(error).toHaveProperty('field');
          expect(error).toHaveProperty('message');
        });
      }
    });

    test('v1 APIs handle content-type validation', async () => {
      // Should work with proper content-type
      const good = await api('PUT', '/api/v1/atx/power', { action: 'reset' });
      expect(good.status).toBe(200);
    });
  });

  describe('OpenAPI Compliance', () => {
    test('v1 responses contain no legacy wrapper properties', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/v1/atx/power' },
        { method: 'GET', path: '/api/v1/atx' },
      ];
      
      for (const { method, path } of endpoints) {
        const { status, json } = await api(method, path);
        
        expect(status).toBe(200);
        
        // No legacy BliKVM API wrapper properties
        expect(json).not.toHaveProperty('result');
        expect(json).not.toHaveProperty('msg');
        expect(json).not.toHaveProperty('code');
        expect(json).not.toHaveProperty('data');
      }
    });
    
    test('v1 endpoints follow REST semantics', async () => {
      // GET endpoints are idempotent
      const [get1, get2] = await Promise.all([
        api('GET', '/api/v1/atx/power'),
        api('GET', '/api/v1/atx/power')
      ]);
      
      expect(get1.status).toBe(200);
      expect(get2.status).toBe(200);
      expect(get1.json).toEqual(get2.json);
      
      // PUT endpoints accept JSON body
      const put = await api('PUT', '/api/v1/atx/power', { action: 'on' });
      expect(put.status).toBe(200);
    });
  });
});