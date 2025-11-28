/**
 * OpenAPI v1 HID Endpoints Test Suite
 * Performance-focused tests for real-time input control
 * Target: <50ms response time for all HID operations
 */

import { api, authenticate, clearAuth } from './_helpers/apiClient.js';

describe('HID API Performance & Functionality Tests', () => {

  beforeAll(async () => {
    try {
      await authenticate('admin', 'admin');
      console.log('✅ Authenticated successfully for OpenAPI v1 HID tests');
    } catch (error) {
      console.error('❌ Failed to authenticate:', error.message);
      throw error;
    }
  });

  afterAll(async () => {
    clearAuth();
  });

  describe('GET /api/v1/hid/status - HID Status', () => {
    test('returns valid HID status format', async () => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('GET', '/api/v1/hid/status');
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('enabled');
      expect(json).toHaveProperty('mode');
      expect(json).toHaveProperty('hardware_status');
      expect(json).toHaveProperty('passthrough');
      expect(json).toHaveProperty('response_time_ms');
      
      expect(typeof json.enabled).toBe('boolean');
      expect(['absolute', 'relative', 'dual']).toContain(json.mode);
      expect(['connected', 'disconnected', 'error']).toContain(json.hardware_status);
      
      // Performance target: <50ms
      expect(responseTime).toBeLessThan(50);
      console.log(`HID status response time: ${responseTime.toFixed(2)}ms`);
    });

    test('response matches OpenAPI schema', async () => {
      const { status, json } = await api('GET', '/api/v1/hid/status');
      
      expect(status).toBe(200);
      // No legacy wrapper properties
      expect(json).not.toHaveProperty('result');
      expect(json).not.toHaveProperty('msg');
      expect(json).not.toHaveProperty('code');
      expect(json).not.toHaveProperty('data');
      
      // Validate passthrough object structure
      expect(json.passthrough).toHaveProperty('enabled');
      expect(json.passthrough).toHaveProperty('active');
      expect(typeof json.passthrough.enabled).toBe('boolean');
      expect(typeof json.passthrough.active).toBe('boolean');
    });
  });

  describe('PUT /api/v1/hid/mode - Mouse Mode Control', () => {
    const validModes = ['absolute', 'relative', 'dual'];

    test.each(validModes)('accepts valid mode: %s', async (mode) => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('PUT', '/api/v1/hid/mode', { mode });
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('mode', mode);
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('response_time_ms');
      
      // Performance target: <50ms
      expect(responseTime).toBeLessThan(50);
      console.log(`HID mode change to ${mode}: ${responseTime.toFixed(2)}ms`);
    });

    test('rejects invalid mode with validation error', async () => {
      const { status, json } = await api('PUT', '/api/v1/hid/mode', { mode: 'invalid' });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('msg');
      expect(json.msg).toContain('validation');
      expect(json).toHaveProperty('code', 200);
      expect(json).toHaveProperty('data');
      expect(Array.isArray(json.data.errors)).toBe(true);
    });

    test('rejects missing mode field', async () => {
      const { status, json } = await api('PUT', '/api/v1/hid/mode', {});
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('code', 200);
      expect(json.data.errors.some(e => e.field === 'mode')).toBe(true);
    });
  });

  describe('POST /api/v1/hid/keyboard/event - Keyboard Events (Performance Critical)', () => {
    const commonKeys = ['KeyA', 'Enter', 'Space', 'Escape', 'Tab', 'ShiftLeft', 'ControlLeft', 'AltLeft'];

    test.each(commonKeys)('processes key event: %s', async (key) => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('POST', '/api/v1/hid/keyboard/event', { 
        key, 
        state: true 
      });
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('response_time_ms');
      expect(json).toHaveProperty('hardware_status');
      expect(['connected', 'disconnected', 'error']).toContain(json.hardware_status);
      
      // Critical performance requirement: <50ms for real-time input
      expect(responseTime).toBeLessThan(50);
      console.log(`Keyboard ${key}: ${responseTime.toFixed(2)}ms`);
    });

    test('handles key press and release sequence', async () => {
      const key = 'KeyA';
      
      // Press
      const pressStart = process.hrtime.bigint();
      const pressResponse = await api('POST', '/api/v1/hid/keyboard/event', { 
        key, 
        state: true 
      });
      const pressTime = Number(process.hrtime.bigint() - pressStart) / 1000000;
      
      expect(pressResponse.status).toBe(200);
      expect(pressTime).toBeLessThan(50);
      
      // Release
      const releaseStart = process.hrtime.bigint();
      const releaseResponse = await api('POST', '/api/v1/hid/keyboard/event', { 
        key, 
        state: false 
      });
      const releaseTime = Number(process.hrtime.bigint() - releaseStart) / 1000000;
      
      expect(releaseResponse.status).toBe(200);
      expect(releaseTime).toBeLessThan(50);
      
      console.log(`Key sequence ${key}: press ${pressTime.toFixed(2)}ms, release ${releaseTime.toFixed(2)}ms`);
    });

    test('handles finish=true for automatic release', async () => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('POST', '/api/v1/hid/keyboard/event', { 
        key: 'KeyA', 
        state: true,
        finish: true 
      });
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(responseTime).toBeLessThan(50);
    });

    test('rejects invalid key with helpful error', async () => {
      const { status, json } = await api('POST', '/api/v1/hid/keyboard/event', { 
        key: 'InvalidKey123' 
      });
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('msg');
      expect(json.msg).toContain('Unknown key');
      expect(json.data).toHaveProperty('valid_keys_sample');
      expect(Array.isArray(json.data.valid_keys_sample)).toBe(true);
    });

    test('validates key format', async () => {
      const invalidKeys = ['', '!@#', 'verylongkeyname1234567890'];
      
      for (const key of invalidKeys) {
        const { status } = await api('POST', '/api/v1/hid/keyboard/event', { key });
        expect(status).toBe(400);
      }
    });
  });

  describe('POST /api/v1/hid/mouse/event - Mouse Events (Performance Critical)', () => {
    test('processes mouse movement', async () => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('POST', '/api/v1/hid/mouse/event', {
        move: { x: 100, y: 200 }
      });
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('response_time_ms');
      expect(json).toHaveProperty('hardware_status');
      
      // Critical performance requirement: <50ms for smooth mouse movement
      expect(responseTime).toBeLessThan(50);
      console.log(`Mouse move: ${responseTime.toFixed(2)}ms`);
    });

    test('processes mouse button events', async () => {
      const buttons = ['left', 'right', 'middle'];
      
      for (const button of buttons) {
        const startTime = process.hrtime.bigint();
        const { status, json } = await api('POST', '/api/v1/hid/mouse/event', {
          buttons: { [button]: true }
        });
        const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        
        expect(status).toBe(200);
        expect(json.success).toBe(true);
        expect(responseTime).toBeLessThan(50);
        console.log(`Mouse ${button} click: ${responseTime.toFixed(2)}ms`);
      }
    });

    test('processes mouse wheel events', async () => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('POST', '/api/v1/hid/mouse/event', {
        wheel: { x: 1, y: -2 }
      });
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(responseTime).toBeLessThan(50);
      console.log(`Mouse wheel: ${responseTime.toFixed(2)}ms`);
    });

    test('handles combined mouse events', async () => {
      const startTime = process.hrtime.bigint();
      const { status, json } = await api('POST', '/api/v1/hid/mouse/event', {
        buttons: { left: true },
        move: { x: 50, y: 75 },
        wheel: { y: 1 }
      });
      const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      expect(status).toBe(200);
      expect(json.success).toBe(true);
      expect(responseTime).toBeLessThan(50);
      console.log(`Combined mouse event: ${responseTime.toFixed(2)}ms`);
    });

    test('validates mouse coordinate ranges', async () => {
      // Test boundary values
      const validCoords = [
        { x: -32768, y: -32768 },
        { x: 32767, y: 32767 },
        { x: 0, y: 0 }
      ];
      
      for (const coords of validCoords) {
        const { status } = await api('POST', '/api/v1/hid/mouse/event', {
          move: coords
        });
        expect(status).toBe(200);
      }
    });

    test('rejects empty mouse event', async () => {
      const { status, json } = await api('POST', '/api/v1/hid/mouse/event', {});
      
      expect(status).toBe(400);
      expect(json).toHaveProperty('msg');
      expect(json.msg).toContain('validation');
    });
  });

  describe('Performance Benchmarks', () => {
    test('rapid keyboard input simulation', async () => {
      const keys = ['KeyH', 'KeyE', 'KeyL', 'KeyL', 'KeyO'];
      const responseTimes = [];
      
      for (const key of keys) {
        const startTime = process.hrtime.bigint();
        await api('POST', '/api/v1/hid/keyboard/event', { key, finish: true });
        const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        responseTimes.push(responseTime);
      }
      
      const avgTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      
      console.log(`Rapid keyboard input - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(50);
      expect(maxTime).toBeLessThan(100); // Allow some variance for rapid input
    });

    test('rapid mouse movement simulation', async () => {
      const movements = [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
        { x: 30, y: 30 },
        { x: 40, y: 40 },
        { x: 50, y: 50 }
      ];
      const responseTimes = [];
      
      for (const move of movements) {
        const startTime = process.hrtime.bigint();
        await api('POST', '/api/v1/hid/mouse/event', { move });
        const responseTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        responseTimes.push(responseTime);
      }
      
      const avgTime = responseTimes.reduce((a, b) => a + b) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      
      console.log(`Rapid mouse movement - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(50);
      expect(maxTime).toBeLessThan(100); // Allow some variance for rapid movement
    });
  });

  describe('Error Handling & Hardware Status', () => {
    test('HID APIs return consistent error format', async () => {
      const invalidRequests = [
        { endpoint: '/api/v1/hid/mode', method: 'PUT', body: { mode: 'invalid' } },
        { endpoint: '/api/v1/hid/keyboard/event', method: 'POST', body: { key: 'Invalid!' } },
        { endpoint: '/api/v1/hid/mouse/event', method: 'POST', body: {} },
      ];
      
      for (const { endpoint, method, body } of invalidRequests) {
        const { status, json } = await api(method, endpoint, body);
        
        expect(status).toBe(400);
        expect(json).toHaveProperty('msg');
        expect(json).toHaveProperty('code', 200);
        expect(json).toHaveProperty('data');
        
        if (json.data.errors) {
          expect(Array.isArray(json.data.errors)).toBe(true);
          json.data.errors.forEach(error => {
            expect(error).toHaveProperty('message');
          });
        }
      }
    });

    test('hardware status reporting consistency', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/v1/hid/status' },
        { method: 'POST', path: '/api/v1/hid/keyboard/event', body: { key: 'KeyA' } },
        { method: 'POST', path: '/api/v1/hid/mouse/event', body: { move: { x: 1, y: 1 } } },
      ];
      
      for (const { method, path, body } of endpoints) {
        const { status, json } = await api(method, path, body);
        
        if (status === 200) {
          expect(json).toHaveProperty('hardware_status');
          expect(['connected', 'disconnected', 'error']).toContain(json.hardware_status);
        }
      }
    });
  });
});