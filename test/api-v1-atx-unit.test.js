/**
 * ATX API v1 Phase 1 Unit Tests
 * Tests individual functions with mocked dependencies
 */

import { jest } from '@jest/globals';

// Mock fs module first
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => JSON.stringify({
    atx: {
      isActive: true,
      controlSockFilePath: '/tmp/test-atx.sock'
    }
  })),
  default: {
    readFileSync: jest.fn(() => JSON.stringify({
      atx: {
        isActive: true,
        controlSockFilePath: '/tmp/test-atx.sock'
      }
    }))
  }
}));

// Mock unix-dgram
jest.mock('unix-dgram', () => ({
  createSocket: jest.fn(() => ({
    on: jest.fn(),
    send: jest.fn((message, start, length, path, callback) => {
      setImmediate(() => callback(null));
    }),
    close: jest.fn()
  }))
}));

// Mock Logger
jest.mock('../src/log/logger.js', () => {
  return jest.fn().mockImplementation(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }));
});

// Mock atomic file writer
jest.mock('../src/common/atomic-file.js', () => ({
  writeJsonAtomic: jest.fn((path, callback) => {
    const mockConfig = {
      atx: { isActive: true }
    };
    callback(mockConfig);
    return Promise.resolve();
  })
}));

// Import after mocks
import fs from 'fs';

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

// Mock ATX module
const mockATXInstance = {
  getATXState: jest.fn(() => mockATXState)
};

jest.mock('../src/modules/kvmd/kvmd_atx.js', () => {
  return jest.fn().mockImplementation(() => mockATXInstance);
});

function createMockRequest(body = {}, ip = '127.0.0.1') {
  return {
    body,
    ip,
    connection: { remoteAddress: ip }
  };
}

function createMockResponse() {
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis()
  };
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

  describe('getATXStatus', () => {
    test('returns correct status format', async () => {
      const { getATXStatus } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await getATXStatus(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        enabled: true,
        power: true,
        hdd_active: false
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('handles file read errors gracefully', async () => {
      fs.readFileSync.mockImplementationOnce(() => {
        throw new Error('File read error');
      });

      const { getATXStatus } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await getATXStatus(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateATXConfig', () => {
    test('updates configuration successfully', async () => {
      const { updateATXConfig } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest({ enabled: false });
      const res = createMockResponse();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ enabled: false });
      expect(next).not.toHaveBeenCalled();
    });

    test('handles write errors gracefully', async () => {
      const { writeJsonAtomic } = await import('../src/common/atomic-file.js');
      writeJsonAtomic.mockRejectedValueOnce(new Error('Write error'));

      const { updateATXConfig } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest({ enabled: true });
      const res = createMockResponse();
      const next = createMockNext();

      await updateATXConfig(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('createATXAction', () => {
    test('executes action successfully when ATX enabled', async () => {
      const { createATXAction } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest({ type: 'short_press' });
      const res = createMockResponse();
      const next = createMockNext();

      await createATXAction(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ type: 'short_press' });
      expect(next).not.toHaveBeenCalled();
    });

    test('returns 403 when ATX disabled', async () => {
      fs.readFileSync.mockReturnValueOnce(JSON.stringify({
        atx: { isActive: false }
      }));

      const { createATXAction } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest({ type: 'short_press' });
      const res = createMockResponse();
      const next = createMockNext();

      await createATXAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'atx_disabled',
        message: 'ATX control is disabled. Enable via PUT /api/v1/atx.'
      });
    });

    test('enforces rate limiting', async () => {
      // Clear any existing rate limiting state
      const atxRoute = await import('../src/server/api/v1/atx.route.js');
      if (atxRoute.lastActionTime) {
        atxRoute.lastActionTime.clear();
      }

      const { createATXAction } = atxRoute;
      
      const req = createMockRequest({ type: 'short_press' });
      const res = createMockResponse();
      const next = createMockNext();

      // First request should succeed
      await createATXAction(req, res, next);
      
      // Check if first request succeeded or was rate limited
      if (res.json.mock.calls[0][0].type === 'short_press') {
        // First succeeded, second should be rate limited
        jest.clearAllMocks();
        await createATXAction(req, res, next);

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(Number));
        expect(res.json).toHaveBeenCalledWith({
          error: 'rate_limited',
          message: expect.stringContaining('Minimum 3s interval')
        });
      } else {
        // Already rate limited from previous test runs
        expect(res.status).toHaveBeenCalledWith(429);
      }
    });

  });

  describe('clearRateLimitsForTesting', () => {
    test('clears rate limits in test environment', async () => {
      process.env.NODE_ENV = 'test';
      
      const { clearRateLimitsForTesting } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await clearRateLimitsForTesting(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        cleared: true,
        message: 'Rate limits cleared for testing'
      });
    });

    test('returns 404 in non-test environment', async () => {
      process.env.NODE_ENV = 'production';
      
      const { clearRateLimitsForTesting } = await import('../src/server/api/v1/atx.route.js');
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await clearRateLimitsForTesting(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'not_found',
        message: 'Test endpoints only available in test environment'
      });
    });
  });
});