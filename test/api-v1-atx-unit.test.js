/**
 * ATX API v1 Phase 1 Unit Tests
 * Tests validation logic and business rules in isolation per PDF specification
 * Covers all Phase 1 functionality without requiring a running server
 */

import fs from 'fs';
import { jest } from '@jest/globals';

// Mock dependencies
const mockConfig = {
  atx: {
    isActive: true,
    controlSockFilePath: '/tmp/test-atx.sock'
  }
};

const mockATXState = {
  ledPwr: true,
  ledHdd: false
};

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => JSON.stringify(mockConfig)),
  default: {
    readFileSync: jest.fn(() => JSON.stringify(mockConfig))
  }
}));

// Mock unix-dgram
const mockSocket = {
  on: jest.fn(),
  send: jest.fn((message, start, length, path, callback) => {
    // Simulate successful socket write
    setImmediate(() => callback(null));
  }),
  close: jest.fn()
};

jest.mock('unix-dgram', () => ({
  createSocket: jest.fn(() => mockSocket)
}));

// Mock ATX module
jest.mock('../src/modules/kvmd/kvmd_atx.js', () => {
  return jest.fn().mockImplementation(() => ({
    getATXState: jest.fn(() => mockATXState)
  }));
});

// Mock atomic file operations
jest.mock('../src/common/atomic-file.js', () => ({
  writeJsonAtomic: jest.fn((path, updateFn) => {
    const config = JSON.parse(JSON.stringify(mockConfig));
    updateFn(config);
    return Promise.resolve();
  })
}));

// Import the functions under test after mocking
import { getATXStatus, updateATXConfig, createATXAction } from '../src/server/api/v1/atx.route.js';

// Mock Express request/response objects
function createMockReq(body = {}, ip = '127.0.0.1') {
  return { 
    body, 
    ip,
    connection: { remoteAddress: ip }
  };
}

function createMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

function createMockNext() {
  return jest.fn();
}

describe('ATX API v1 Phase 1 Unit Tests', () => {

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset rate limiting map
    const atxRoute = await import('../src/server/api/v1/atx.route.js');
    if (atxRoute.lastActionTime) {
      atxRoute.lastActionTime.clear();
    }
  });

  describe('GET /api/v1/atx/status - getATXStatus', () => {
    test('returns correct status format per PDF specification', async () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await getATXStatus(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        enabled: true,
        power: true,
        hdd_active: false
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('handles missing ATX config gracefully', async () => {
      // Mock config without atx section
      const configWithoutATX = {};
      fs.readFileSync.mockReturnValueOnce(JSON.stringify(configWithoutATX));

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await getATXStatus(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        enabled: true, // Default value
        power: true,
        hdd_active: false
      });
    });

    test('converts LED states correctly', async () => {
      // Test different LED state combinations
      const testCases = [
        { ledPwr: true, ledHdd: true, expected: { enabled: true, power: true, hdd_active: true } },
        { ledPwr: false, ledHdd: false, expected: { enabled: true, power: false, hdd_active: false } },
        { ledPwr: null, ledHdd: undefined, expected: { enabled: true, power: false, hdd_active: false } }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        const ATX = (await import('../src/modules/kvmd/kvmd_atx.js')).default;
        ATX.mockImplementation(() => ({
          getATXState: () => ({ ledPwr: testCase.ledPwr, ledHdd: testCase.ledHdd })
        }));

        const req = createMockReq();
        const res = createMockRes();
        const next = createMockNext();

        await getATXStatus(req, res, next);

        expect(res.json).toHaveBeenCalledWith(testCase.expected);
      }
    });

    test('handles config file read errors', async () => {
      fs.readFileSync.mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await getATXStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('PUT /api/v1/atx - updateATXConfig', () => {
    test('enables ATX control correctly', async () => {
      const req = createMockReq({ enabled: true });
      const res = createMockRes();
      const next = createMockNext();

      const { writeJsonAtomic } = await import('../src/common/atomic-file.js');
      
      await updateATXConfig(req, res, next);

      expect(writeJsonAtomic).toHaveBeenCalledWith(
        expect.stringContaining('config'),
        expect.any(Function)
      );
      expect(res.json).toHaveBeenCalledWith({ enabled: true });
    });

    test('disables ATX control correctly', async () => {
      const req = createMockReq({ enabled: false });
      const res = createMockRes();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ enabled: false });
    });

    test('validates enabled field type - rejects string', async () => {
      const req = createMockReq({ enabled: 'true' });
      const res = createMockRes();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'validation_failed',
        message: "Field 'enabled' must be boolean"
      });
    });

    test('validates enabled field type - rejects number', async () => {
      const req = createMockReq({ enabled: 1 });
      const res = createMockRes();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'validation_failed',
        message: "Field 'enabled' must be boolean"
      });
    });

    test('validates enabled field type - rejects null', async () => {
      const req = createMockReq({ enabled: null });
      const res = createMockRes();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('validates enabled field type - rejects undefined', async () => {
      const req = createMockReq({ enabled: undefined });
      const res = createMockRes();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('handles atomic write errors', async () => {
      const { writeJsonAtomic } = await import('../src/common/atomic-file.js');
      writeJsonAtomic.mockRejectedValueOnce(new Error('Write failed'));

      const req = createMockReq({ enabled: true });
      const res = createMockRes();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('POST /api/v1/atx/actions - createATXAction', () => {
    
    describe('Action Type Validation', () => {
      test('accepts valid mechanism-based action types per PDF', async () => {
        const validTypes = ['short_press', 'long_press', 'reset'];
        
        for (const type of validTypes) {
          jest.clearAllMocks();
          const req = createMockReq({ type });
          const res = createMockRes();
          const next = createMockNext();

          await createATXAction(req, res, next);

          expect(res.json).toHaveBeenCalledWith({ type });
          expect(res.status).not.toHaveBeenCalled(); // Should be 200 (default)
        }
      });

      test('rejects intent-based action types', async () => {
        const intentTypes = ['power_on', 'power_off', 'power_reset'];
        
        for (const type of intentTypes) {
          jest.clearAllMocks();
          const req = createMockReq({ type });
          const res = createMockRes();
          const next = createMockNext();

          await createATXAction(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({
            error: 'validation_failed',
            message: `Invalid action type '${type}'. Use: short_press, long_press, reset`
          });
        }
      });

      test('rejects completely invalid action types', async () => {
        const invalidTypes = ['explode', 'restart', 'shutdown', 'hibernate'];
        
        for (const type of invalidTypes) {
          jest.clearAllMocks();
          const req = createMockReq({ type });
          const res = createMockRes();
          const next = createMockNext();

          await createATXAction(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({
            error: 'validation_failed',
            message: `Invalid action type '${type}'. Use: short_press, long_press, reset`
          });
        }
      });

      test('rejects missing type field', async () => {
        const req = createMockReq({});
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          error: 'validation_failed',
          message: `Invalid action type 'undefined'. Use: short_press, long_press, reset`
        });
      });

      test('rejects non-string type field', async () => {
        const nonStringTypes = [123, true, [], {}, null];
        
        for (const type of nonStringTypes) {
          jest.clearAllMocks();
          const req = createMockReq({ type });
          const res = createMockRes();
          const next = createMockNext();

          await createATXAction(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
        }
      });
    });

    describe('ATX Disabled State Handling', () => {
      test('returns 403 when ATX is disabled', async () => {
        const disabledConfig = {
          atx: { isActive: false, controlSockFilePath: '/tmp/test.sock' }
        };
        fs.readFileSync.mockReturnValueOnce(JSON.stringify(disabledConfig));

        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          error: 'atx_disabled',
          message: 'ATX control is disabled. Enable via PUT /api/v1/atx.'
        });
      });

      test('handles missing ATX config (defaults to enabled)', async () => {
        const configWithoutATX = {};
        fs.readFileSync.mockReturnValueOnce(JSON.stringify(configWithoutATX));

        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        // Should succeed since default is enabled
        expect(res.json).toHaveBeenCalledWith({ type: 'short_press' });
        expect(res.status).not.toHaveBeenCalledWith(403);
      });
    });

    describe('Rate Limiting Logic', () => {
      test('allows first action immediately', async () => {
        const req = createMockReq({ type: 'short_press' }, '192.168.1.100');
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(res.json).toHaveBeenCalledWith({ type: 'short_press' });
        expect(res.status).not.toHaveBeenCalledWith(429);
      });

      test('blocks rapid successive actions within 3 seconds', async () => {
        const req1 = createMockReq({ type: 'short_press' }, '192.168.1.101');
        const req2 = createMockReq({ type: 'long_press' }, '192.168.1.101'); // Same IP
        const res1 = createMockRes();
        const res2 = createMockRes();
        const next1 = createMockNext();
        const next2 = createMockNext();

        // First action should succeed
        await createATXAction(req1, res1, next1);
        expect(res1.json).toHaveBeenCalledWith({ type: 'short_press' });

        // Second action should be rate limited
        await createATXAction(req2, res2, next2);
        expect(res2.status).toHaveBeenCalledWith(429);
        expect(res2.json).toHaveBeenCalledWith({
          error: 'rate_limited',
          message: expect.stringMatching(/Minimum 3s interval between power commands\. Retry in \d+s/)
        });
        expect(res2.set).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      });

      test('rate limiting is per-client IP', async () => {
        const req1 = createMockReq({ type: 'short_press' }, '192.168.1.100');
        const req2 = createMockReq({ type: 'long_press' }, '192.168.1.101'); // Different IP
        const res1 = createMockRes();
        const res2 = createMockRes();
        const next1 = createMockNext();
        const next2 = createMockNext();

        // First client action
        await createATXAction(req1, res1, next1);
        expect(res1.json).toHaveBeenCalledWith({ type: 'short_press' });

        // Second client should not be rate limited
        await createATXAction(req2, res2, next2);
        expect(res2.json).toHaveBeenCalledWith({ type: 'long_press' });
        expect(res2.status).not.toHaveBeenCalledWith(429);
      });

      test('calculates correct Retry-After header', async () => {
        const req1 = createMockReq({ type: 'short_press' }, '192.168.1.102');
        const req2 = createMockReq({ type: 'reset' }, '192.168.1.102');
        const res1 = createMockRes();
        const res2 = createMockRes();
        const next1 = createMockNext();
        const next2 = createMockNext();

        await createATXAction(req1, res1, next1);
        
        // Small delay to test retry calculation
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await createATXAction(req2, res2, next2);

        expect(res2.set).toHaveBeenCalledWith('Retry-After', expect.any(Number));
        const retryAfter = res2.set.mock.calls.find(call => call[0] === 'Retry-After')[1];
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(3); // Should be <= 3 seconds
      });
    });

    describe('Action Mapping and Socket Communication', () => {
      test('maps short_press to correct command', async () => {
        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(mockSocket.send).toHaveBeenCalledWith(
          Buffer.from([128]), // power_on command
          0,
          1,
          '/tmp/test-atx.sock',
          expect.any(Function)
        );
      });

      test('maps long_press to correct command', async () => {
        const req = createMockReq({ type: 'long_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(mockSocket.send).toHaveBeenCalledWith(
          Buffer.from([192]), // power_off command
          0,
          1,
          '/tmp/test-atx.sock',
          expect.any(Function)
        );
      });

      test('maps reset to correct command', async () => {
        const req = createMockReq({ type: 'reset' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(mockSocket.send).toHaveBeenCalledWith(
          Buffer.from([8]), // power_reset command
          0,
          1,
          '/tmp/test-atx.sock',
          expect.any(Function)
        );
      });

      test('handles socket creation', async () => {
        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        const { createSocket } = await import('unix-dgram');
        expect(createSocket).toHaveBeenCalledWith('unix_dgram');
      });

      test('handles socket errors', async () => {
        mockSocket.send.mockImplementationOnce((msg, start, len, path, callback) => {
          setImmediate(() => callback(new Error('Socket write failed')));
        });

        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      test('handles missing socket path', async () => {
        const configWithoutSocket = { atx: { isActive: true } };
        fs.readFileSync.mockReturnValueOnce(JSON.stringify(configWithoutSocket));

        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
          message: 'ATX control socket path not configured'
        }));
      });

      test('closes socket after operation', async () => {
        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(mockSocket.close).toHaveBeenCalled();
      });
    });

    describe('Phase 1 Compliance', () => {
      test('returns 200 status (not 201) per Phase 1 spec', async () => {
        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        // Phase 1 returns 200, not 201 (no storage)
        expect(res.status).not.toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ type: 'short_press' });
      });

      test('response contains only type field (no ID or timestamp)', async () => {
        const req = createMockReq({ type: 'reset' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        const response = res.json.mock.calls[0][0];
        expect(Object.keys(response)).toEqual(['type']);
        expect(response).not.toHaveProperty('id');
        expect(response).not.toHaveProperty('executed_at');
        expect(response).not.toHaveProperty('executed_by');
      });
    });

    describe('Error Handling', () => {
      test('handles config file read errors during action', async () => {
        fs.readFileSync.mockImplementationOnce(() => {
          throw new Error('Config read failed');
        });

        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      test('handles malformed config JSON', async () => {
        fs.readFileSync.mockReturnValueOnce('invalid json');

        const req = createMockReq({ type: 'short_press' });
        const res = createMockRes();
        const next = createMockNext();

        await createATXAction(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });

  describe('Client IP Detection', () => {
    test('uses req.ip when available', async () => {
      const req = createMockReq({ type: 'short_press' }, '10.0.0.1');
      req.ip = '10.0.0.1';
      const res = createMockRes();
      const next = createMockNext();

      await createATXAction(req, res, next);

      // First action should succeed
      expect(res.json).toHaveBeenCalledWith({ type: 'short_press' });

      // Second action from same IP should be rate limited
      jest.clearAllMocks();
      const req2 = createMockReq({ type: 'long_press' }, '10.0.0.1');
      req2.ip = '10.0.0.1';
      const res2 = createMockRes();
      const next2 = createMockNext();

      await createATXAction(req2, res2, next2);

      expect(res2.status).toHaveBeenCalledWith(429);
    });

    test('falls back to req.connection.remoteAddress', async () => {
      const req = createMockReq({ type: 'short_press' });
      req.ip = undefined;
      req.connection = { remoteAddress: '172.16.0.1' };
      const res = createMockRes();
      const next = createMockNext();

      await createATXAction(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ type: 'short_press' });

      // Verify rate limiting uses the fallback IP
      jest.clearAllMocks();
      const req2 = createMockReq({ type: 'reset' });
      req2.ip = undefined;
      req2.connection = { remoteAddress: '172.16.0.1' };
      const res2 = createMockRes();
      const next2 = createMockNext();

      await createATXAction(req2, res2, next2);

      expect(res2.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Integration with Mocked Dependencies', () => {
    test('reads config from correct path', async () => {
      const req = createMockReq({ type: 'short_press' });
      const res = createMockRes();
      const next = createMockNext();

      await createATXAction(req, res, next);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config'),
        'utf8'
      );
    });

    test('creates ATX instance correctly', async () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = createMockNext();

      await getATXStatus(req, res, next);

      const ATX = (await import('../src/modules/kvmd/kvmd_atx.js')).default;
      expect(ATX).toHaveBeenCalled();
    });
  });
});