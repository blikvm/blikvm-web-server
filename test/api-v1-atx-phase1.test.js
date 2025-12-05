/**
 * ATX API v1 Phase 1 Test Suite
 * Tests endpoints per PDF specification
 */

import { api, authenticate, clearAuth, clearRateLimits } from './_helpers/apiClient.js';

describe('ATX API v1 Phase 1', () => {

  beforeAll(async () => {
    await authenticate('admin', 'admin');
  });

  afterAll(async () => {
    clearAuth();
  });

  describe('GET /api/v1/atx/status', () => {
    test('returns unified ATX status', async () => {
      const { status, json } = await api('GET', '/api/v1/atx/status');
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled');
      expect(json).toHaveProperty('power');
      expect(json).toHaveProperty('hdd_active');
      
      expect(typeof json.enabled).toBe('boolean');
      expect(typeof json.power).toBe('boolean');
      expect(typeof json.hdd_active).toBe('boolean');
    });

    test('matches PDF schema exactly', async () => {
      const { status, json } = await api('GET', '/api/v1/atx/status');
      
      expect(status).toBe(200);
      const expectedKeys = ['enabled', 'power', 'hdd_active'];
      expect(Object.keys(json).sort()).toEqual(expectedKeys.sort());
    });
  });

  describe('PUT /api/v1/atx', () => {
    test('enables ATX control', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', { enabled: true });
      
      expect(status).toBe(200);
      expect(json).toEqual({ enabled: true });
    });

    test('disables ATX control', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', { enabled: false });
      
      expect(status).toBe(200);
      expect(json).toEqual({ enabled: false });
    });

    test('validates enabled field', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', { enabled: 'invalid' });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('error', 'validation_failed');
      expect(json).toHaveProperty('message');
    });

    test('rejects missing enabled field', async () => {
      const { status, json } = await api('PUT', '/api/v1/atx', {});
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('error', 'validation_failed');
    });
  });

  describe('POST /api/v1/atx/actions', () => {
    beforeEach(async () => {
      // Clear rate limits and ensure clean state
      const cleared = await clearRateLimits();
      if (!cleared) {
        // Fallback: wait for rate limit to expire (3s)
        await new Promise(resolve => setTimeout(resolve, 3100));
      }
      // Ensure ATX is enabled for action tests
      await api('PUT', '/api/v1/atx', { enabled: true });
    });

    test('executes short_press action', async () => {
      const { status, json } = await api('POST', '/api/v1/atx/actions', { type: 'short_press' });
      
      expect(status).toBe(200);
      expect(json).toEqual({ type: 'short_press' });
    });

    test('executes long_press action', async () => {
      const { status, json } = await api('POST', '/api/v1/atx/actions', { type: 'long_press' });
      
      expect(status).toBe(200);
      expect(json).toEqual({ type: 'long_press' });
    });

    test('executes reset action', async () => {
      const { status, json } = await api('POST', '/api/v1/atx/actions', { type: 'reset' });
      
      expect(status).toBe(200);
      expect(json).toEqual({ type: 'reset' });
    });

    test('rejects invalid action type', async () => {
      const { status, json } = await api('POST', '/api/v1/atx/actions', { type: 'power_on' });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('error', 'validation_failed');
      expect(json.message).toContain('Invalid action type');
      expect(json.message).toContain('short_press, long_press, reset');
    });

    test('rejects missing type field', async () => {
      const { status, json } = await api('POST', '/api/v1/atx/actions', {});
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('error', 'validation_failed');
    });

    test('returns 403 when ATX disabled', async () => {
      // Disable ATX
      await api('PUT', '/api/v1/atx', { enabled: false });
      
      const { status, json } = await api('POST', '/api/v1/atx/actions', { type: 'short_press' });
      
      expect(status).toBe(403);
      expect(json).toHaveProperty('error', 'atx_disabled');
      expect(json.message).toContain('PUT /api/v1/atx');
    });

    test('rate limiting with 429 status', async () => {
      // First request should succeed
      const first = await api('POST', '/api/v1/atx/actions', { type: 'short_press' });
      expect(first.status).toBe(200);

      // Second immediate request should be rate limited
      const second = await api('POST', '/api/v1/atx/actions', { type: 'short_press' });
      expect(second.status).toBe(429);
      expect(second.json).toHaveProperty('error', 'rate_limited');
      expect(second.json.message).toContain('3s interval');
      
      // Should include Retry-After header
      expect(second.headers).toHaveProperty('retry-after');
    }, 10000); // Longer timeout for rate limiting test
  });

  describe('Error Format Consistency', () => {
    test('all endpoints use {error, message} format', async () => {
      const errorTests = [
        { method: 'PUT', path: '/api/v1/atx', body: { enabled: 'invalid' } },
        { method: 'POST', path: '/api/v1/atx/actions', body: { type: 'invalid' } },
      ];

      for (const { method, path, body } of errorTests) {
        const { status, json } = await api(method, path, body);
        
        expect(status).toBeGreaterThanOrEqual(400);
        expect(json).toHaveProperty('error');
        expect(json).toHaveProperty('message');
        expect(typeof json.error).toBe('string');
        expect(typeof json.message).toBe('string');
        
        // No legacy wrapper
        expect(json).not.toHaveProperty('code');
        expect(json).not.toHaveProperty('data');
        expect(json).not.toHaveProperty('result');
      }
    });
  });

  describe('Phase 1 Compliance', () => {
    beforeEach(async () => {
      // Clear rate limits for clean state
      const cleared = await clearRateLimits();
      if (!cleared) {
        // Fallback: wait for rate limit to expire (3s)
        await new Promise(resolve => setTimeout(resolve, 3100));
      }
    });

    test('no storage endpoints exist', async () => {
      // Phase 2 endpoints should not exist yet
      const phase2Tests = [
        { method: 'GET', path: '/api/v1/atx/actions' },
        { method: 'GET', path: '/api/v1/atx/actions/123' },
      ];

      for (const { method, path } of phase2Tests) {
        const { status } = await api(method, path);
        expect(status).toBe(404); // Should not exist in Phase 1
      }
    });

    test('POST actions return 200 not 201', async () => {
      // Phase 1 doesn't store actions, so returns 200 not 201
      const { status } = await api('POST', '/api/v1/atx/actions', { type: 'short_press' });
      expect(status).toBe(200); // Not 201 because no storage
    });

    test('action responses contain no ID', async () => {
      const { status, json } = await api('POST', '/api/v1/atx/actions', { type: 'short_press' });
      
      expect(status).toBe(200);
      expect(json).toEqual({ type: 'short_press' }); // No id, executed_at, etc.
    });
  });
});