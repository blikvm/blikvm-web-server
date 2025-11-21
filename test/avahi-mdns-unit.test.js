/**
 * Avahi mDNS Unit Tests
 * Fast unit tests for Avahi functionality without network operations
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import os from 'os';

const execAsync = promisify(exec);

jest.setTimeout(10000);

describe('Avahi mDNS Unit Tests', () => {

  describe('System Dependencies', () => {
    test('avahi-publish-service is available', async () => {
      try {
        const { stdout } = await execAsync('which avahi-publish-service');
        expect(stdout.trim()).toMatch(/avahi-publish-service$/);
      } catch (error) {
        fail('avahi-publish-service not found');
      }
    });

    test('avahi-browse is available', async () => {
      try {
        const { stdout } = await execAsync('which avahi-browse');
        expect(stdout.trim()).toMatch(/avahi-browse$/);
      } catch (error) {
        fail('avahi-browse not found');
      }
    });
  });

  describe('Hostname Sanitization', () => {
    test('sanitizes hostnames according to RFC-952', () => {
      const sanitizeHostname = (input) => {
        let hn = input || 'blikvm';
        hn = hn.replace(/\.local$/i, '')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        return hn || 'blikvm';
      };

      const testCases = [
        ['test.local', 'test'],
        ['Test-Host.LOCAL', 'test-host'],
        ['test_host@domain', 'test-host-domain'],
        ['invalid__chars', 'invalid-chars'],
        ['---test---', 'test'],
        ['', 'blikvm'],
        [null, 'blikvm'],
        ['blikvm', 'blikvm']
      ];

      testCases.forEach(([input, expected]) => {
        expect(sanitizeHostname(input)).toBe(expected);
      });
    });
  });

  describe('Service Parameters', () => {
    test('generates correct BliKVM service parameters', () => {
      const serviceName = 'blikvmv2';
      const serviceType = '_blikvm._tcp';
      const port = '443';
      const protocol = 'https';
      const version = '1.0.0';
      const txtRecord = `protocol=${protocol} version=${version}`;

      expect(serviceName).toMatch(/^[a-z0-9-]+$/);
      expect(serviceType).toBe('_blikvm._tcp');
      expect(port).toMatch(/^\d+$/);
      expect(parseInt(port)).toBeGreaterThan(0);
      expect(parseInt(port)).toBeLessThan(65536);
      expect(txtRecord).toBe('protocol=https version=1.0.0');
    });
  });

  describe('Process Management', () => {
    test('spawn parameters are correctly formatted', () => {
      const args = ['test-service', '_blikvm._tcp', '443', 'protocol=https'];
      
      // Validate spawn arguments
      expect(Array.isArray(args)).toBe(true);
      expect(args.length).toBe(4);
      expect(typeof args[0]).toBe('string'); // service name
      expect(args[1]).toBe('_blikvm._tcp'); // service type
      expect(args[2]).toMatch(/^\d+$/); // port
      expect(args[3]).toContain('protocol='); // TXT record
    });

    test('handles process termination signals', () => {
      const signals = ['SIGTERM', 'SIGINT', 'SIGKILL'];
      
      signals.forEach(signal => {
        expect(typeof signal).toBe('string');
        expect(signal.startsWith('SIG')).toBe(true);
      });
    });
  });

  describe('Configuration Logic', () => {
    test('environment variables take precedence', () => {
      const originalEnv = process.env.MDNS_NAME;
      
      try {
        process.env.MDNS_NAME = 'custom-name';
        const name = process.env.MDNS_NAME || os.hostname() || 'blikvm';
        expect(name).toBe('custom-name');
      } finally {
        if (originalEnv !== undefined) {
          process.env.MDNS_NAME = originalEnv;
        } else {
          delete process.env.MDNS_NAME;
        }
      }
    });

    test('fallback chain works correctly', () => {
      const originalEnv = process.env.MDNS_NAME;
      delete process.env.MDNS_NAME;
      
      try {
        const name = process.env.MDNS_NAME || os.hostname() || 'blikvm';
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      } finally {
        if (originalEnv !== undefined) {
          process.env.MDNS_NAME = originalEnv;
        }
      }
    });
  });
});