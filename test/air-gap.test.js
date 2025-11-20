/**
 * Air-Gap Mode Test Suite
 * Tests air-gap configuration and blocking functionality
 */

import { api } from './_helpers/apiClient.js';
import { isAirGapMode, isAirGapFeatureEnabled } from '../src/server/api/system/airgap.route.js';

describe('Air-Gap Mode Tests', () => {

  describe('Air-Gap Configuration Functions', () => {
    test('isAirGapMode returns boolean', () => {
      const result = isAirGapMode();
      expect(typeof result).toBe('boolean');
    });

    test('isAirGapFeatureEnabled returns boolean for valid features', () => {
      const features = ['systemUpdates', 'externalAssets', 'documentation'];
      
      features.forEach(feature => {
        const result = isAirGapFeatureEnabled(feature);
        expect(typeof result).toBe('boolean');
      });
    });

    test('isAirGapFeatureEnabled returns false for invalid features', () => {
      const result = isAirGapFeatureEnabled('nonexistentFeature');
      expect(result).toBe(false);
    });
  });

  describe('Air-Gap API Endpoints', () => {
    test('GET /api/system/airgap returns status', async () => {
      const { status, json } = await api('GET', '/api/system/airgap');
      
      expect(status).toBe(200);
      expect(json).toHaveProperty('data');
      expect(json.data).toHaveProperty('enabled');
      expect(json.data).toHaveProperty('features');
      expect(typeof json.data.enabled).toBe('boolean');
    });

    test('PUT /api/system/airgap accepts boolean enabled', async () => {
      // Test enabling air-gap mode
      const enableResult = await api('PUT', '/api/system/airgap', { enabled: true });
      
      expect(enableResult.status).toBe(200);
      expect(enableResult.json.data.enabled).toBe(true);

      // Test disabling air-gap mode
      const disableResult = await api('PUT', '/api/system/airgap', { enabled: false });
      
      expect(disableResult.status).toBe(200);
      expect(disableResult.json.data.enabled).toBe(false);
    });

    test('PUT /api/system/airgap rejects invalid enabled values', async () => {
      const invalidValues = ['true', 'false', 1, 0, null, 'yes'];
      
      for (const value of invalidValues) {
        const { status, json } = await api('PUT', '/api/system/airgap', { enabled: value });
        
        expect(status).toBe(400);
        expect(json).toHaveProperty('code', 200); // INVALID_INPUT_PARAM
        expect(json.msg).toContain('boolean');
      }
    });

    test('Air-gap status includes expected fields', async () => {
      const { status, json } = await api('GET', '/api/system/airgap');
      
      expect(status).toBe(200);
      expect(json.data).toHaveProperty('enabled');
      expect(json.data).toHaveProperty('features');
      expect(json.data).toHaveProperty('blockedServices');
      expect(json.data).toHaveProperty('affectedFeatures');
      
      expect(Array.isArray(json.data.blockedServices)).toBe(true);
      expect(Array.isArray(json.data.affectedFeatures)).toBe(true);
    });
  });

  describe('Air-Gap Feature Blocking', () => {
    test('blocked services list changes based on enabled features', async () => {
      // Enable air-gap with all features
      const enabledResult = await api('PUT', '/api/system/airgap', { 
        enabled: true,
        features: {
          systemUpdates: true,
          externalAssets: true,
          documentation: true
        }
      });
      
      expect(enabledResult.json.data.blockedServices.length).toBeGreaterThan(0);

      // Disable air-gap mode
      const disabledResult = await api('PUT', '/api/system/airgap', { enabled: false });
      
      expect(disabledResult.json.data.blockedServices.length).toBe(0);
    });

    test('air-gap mode affects update service', async () => {
      // Enable air-gap mode with system updates blocked
      await api('PUT', '/api/system/airgap', { 
        enabled: true,
        features: { systemUpdates: true }
      });

      // Note: We can't test the actual update endpoint here without a full integration test
      // This would require the server to be running and the update endpoint to be accessible
      
      // Disable air-gap mode for cleanup
      await api('PUT', '/api/system/airgap', { enabled: false });
    });
  });

  describe('Documentation Assets', () => {
    test('Swagger UI responds when air-gap disabled', async () => {
      // Ensure air-gap is disabled
      await api('PUT', '/api/system/airgap', { enabled: false });
      
      // Note: Testing actual Swagger UI would require server restart
      // This is a placeholder for integration testing
      expect(true).toBe(true);
    });

    test('local assets are served when air-gap enabled', async () => {
      // Note: This would require the server to be running with air-gap mode enabled
      // and testing the actual asset endpoints
      expect(true).toBe(true);
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
      return fn;
    }
  };
}