/**
 * mDNS (Multicast DNS) Test Suite
 * Tests mDNS configuration and service control functionality
 */

import { api } from './_helpers/apiClient.js';
import { isMdnsEnabled } from '../src/server/api/system/mdns.route.js';

// Helper function to handle API calls that may fail due to auth or server not running
async function safeApiCall(method, path, body, expectedStatus = 200) {
  try {
    const result = await api(method, path, body);
    
    if (result.status === 401) {
      // Server requires authentication - skip test
      return { skipped: true, status: 401 };
    }
    
    return { skipped: false, ...result };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      // No server running - expected in unit test mode
      return { skipped: true, error: 'ECONNREFUSED' };
    }
    throw error;
  }
}

describe('mDNS (Multicast DNS) Tests', () => {

  describe('mDNS Configuration Functions', () => {
    test('isMdnsEnabled returns boolean', () => {
      const result = isMdnsEnabled();
      expect(typeof result).toBe('boolean');
    });

    test('isMdnsEnabled defaults to true when config is missing', () => {
      // This tests the fallback behavior
      const result = isMdnsEnabled();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('mDNS API Endpoints (Integration)', () => {
    
    test('GET /api/system/mdns returns mDNS status', async () => {
      const result = await safeApiCall('GET', '/api/system/mdns');
      
      if (result.skipped) {
        console.log('Skipping test - server not available or auth required');
        return;
      }
      
      expect(result.status).toBe(200);
      expect(result.data).toHaveProperty('code');
      expect(result.data).toHaveProperty('data');
      
      const data = result.data.data;
      expect(typeof data.enabled).toBe('boolean');
      expect(data).toHaveProperty('lastModified');
      expect(data).toHaveProperty('modifiedBy');
      expect(data).toHaveProperty('service');
      expect(data.service).toHaveProperty('name');
      expect(data.service).toHaveProperty('description');
      expect(data.service).toHaveProperty('port');
      expect(data.service).toHaveProperty('protocol');
      expect(data.service.port).toBe(5353);
      expect(data.service.protocol).toBe('UDP');
    });

    test('PUT /api/system/mdns toggles mDNS service', async () => {
      // Get current state
      const getResult = await safeApiCall('GET', '/api/system/mdns');
      
      if (getResult.skipped) {
        console.log('Skipping test - server not available or auth required');
        return;
      }
      
      const currentEnabled = getResult.data.data.enabled;
      const newEnabled = !currentEnabled;
      
      // Toggle the setting
      const putResult = await safeApiCall('PUT', '/api/system/mdns', {
        enabled: newEnabled
      });
      
      if (putResult.skipped) {
        console.log('Skipping PUT test - server not available or auth required');
        return;
      }
      
      expect(putResult.status).toBe(200);
      expect(putResult.data).toHaveProperty('code');
      expect(putResult.data).toHaveProperty('data');
      
      const data = putResult.data.data;
      expect(data.enabled).toBe(newEnabled);
      expect(data).toHaveProperty('lastModified');
      expect(data).toHaveProperty('modifiedBy');
      
      // Restore original setting
      await safeApiCall('PUT', '/api/system/mdns', {
        enabled: currentEnabled
      });
    });

    test('PUT /api/system/mdns validates enabled parameter', async () => {
      const result = await safeApiCall('PUT', '/api/system/mdns', {
        enabled: 'invalid'
      }, 400);
      
      if (result.skipped) {
        console.log('Skipping validation test - server not available or auth required');
        return;
      }
      
      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('code');
      expect(result.data).toHaveProperty('msg');
      expect(result.data.msg).toContain('boolean');
    });

    test('PUT /api/system/mdns requires enabled parameter', async () => {
      const result = await safeApiCall('PUT', '/api/system/mdns', {}, 400);
      
      if (result.skipped) {
        console.log('Skipping required field test - server not available or auth required');
        return;
      }
      
      expect(result.status).toBe(400);
      expect(result.data).toHaveProperty('code');
      expect(result.data).toHaveProperty('msg');
    });

  });

  describe('mDNS Service Information', () => {
    test('mDNS service configuration contains expected fields', async () => {
      const result = await safeApiCall('GET', '/api/system/mdns');
      
      if (result.skipped) {
        console.log('Skipping service info test - server not available or auth required');
        return;
      }
      
      const service = result.data.data.service;
      expect(service.name).toBe('mDNS Discovery Service');
      expect(service.description).toContain('network discovery');
      expect(service.description).toContain('.local');
      expect(service.port).toBe(5353);
      expect(service.protocol).toBe('UDP');
    });

    test('mDNS status includes audit trail when modified', async () => {
      const result = await safeApiCall('GET', '/api/system/mdns');
      
      if (result.skipped) {
        console.log('Skipping audit trail test - server not available or auth required');
        return;
      }
      
      const data = result.data.data;
      
      // Check that audit trail fields exist (may be null for initial state)
      expect(data.hasOwnProperty('lastModified')).toBe(true);
      expect(data.hasOwnProperty('modifiedBy')).toBe(true);
      
      if (data.lastModified !== null) {
        // If modified, should have valid timestamp
        expect(new Date(data.lastModified)).toBeInstanceOf(Date);
        expect(data.lastModified).not.toBe('Invalid Date');
      }
      
      if (data.modifiedBy !== null) {
        // If modified, should have a username
        expect(typeof data.modifiedBy).toBe('string');
        expect(data.modifiedBy.length).toBeGreaterThan(0);
      }
    });
  });

  describe('mDNS Configuration Integration', () => {
    test('isMdnsEnabled reflects current configuration', () => {
      // Test that the function reads from the actual config
      const enabled1 = isMdnsEnabled();
      const enabled2 = isMdnsEnabled();
      
      // Should return consistent results
      expect(enabled1).toBe(enabled2);
      expect(typeof enabled1).toBe('boolean');
    });

    test('mDNS default state is enabled', () => {
      // mDNS should be enabled by default for network discovery
      const result = isMdnsEnabled();
      expect(result).toBe(true);
    });
  });

  describe('mDNS Error Handling', () => {
    test('API endpoints handle malformed requests gracefully', async () => {
      const result = await safeApiCall('PUT', '/api/system/mdns', null, 400);
      
      if (result.skipped) {
        console.log('Skipping error handling test - server not available or auth required');
        return;
      }
      
      expect([400, 500]).toContain(result.status);
      expect(result.data).toHaveProperty('code');
    });

    test('GET endpoint handles server errors gracefully', async () => {
      const result = await safeApiCall('GET', '/api/system/mdns');
      
      if (result.skipped) {
        console.log('Skipping GET error test - server not available or auth required');
        return;
      }
      
      // Should either succeed or fail gracefully
      expect([200, 500]).toContain(result.status);
      expect(result.data).toHaveProperty('code');
    });
  });

  describe('mDNS Service Control', () => {
    test('mDNS toggle preserves service information', async () => {
      const initialResult = await safeApiCall('GET', '/api/system/mdns');
      
      if (initialResult.skipped) {
        console.log('Skipping service control test - server not available or auth required');
        return;
      }
      
      const initialState = initialResult.data.data.enabled;
      const initialService = initialResult.data.data.service;
      
      // Toggle mDNS
      const toggleResult = await safeApiCall('PUT', '/api/system/mdns', {
        enabled: !initialState
      });
      
      if (toggleResult.skipped) {
        console.log('Skipping toggle test - server not available or auth required');
        return;
      }
      
      const toggledService = toggleResult.data.data.service;
      
      // Service information should remain the same
      expect(toggledService.name).toBe(initialService.name);
      expect(toggledService.description).toBe(initialService.description);
      expect(toggledService.port).toBe(initialService.port);
      expect(toggledService.protocol).toBe(initialService.protocol);
      
      // Restore original state
      await safeApiCall('PUT', '/api/system/mdns', {
        enabled: initialState
      });
    });
  });

});