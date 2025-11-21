/**
 * Avahi Integration Test
 * Tests actual Avahi service publication and discovery
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

jest.setTimeout(15000);

describe('Avahi Integration Test', () => {
  let testProcess;
  const testServiceName = 'jest-test-blikvm';
  const testPort = '19443';

  afterEach(() => {
    if (testProcess) {
      testProcess.kill('SIGTERM');
      testProcess = null;
    }
  });

  test('BliKVM service can be published', (done) => {
    // Start test service with unique name to avoid conflicts
    const uniqueName = `${testServiceName}-${Date.now()}`;
    
    testProcess = spawn('avahi-publish-service', [
      uniqueName,
      '_blikvm._tcp',
      testPort,
      'protocol=https version=1.0.0 test=jest'
    ]);

    testProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      if (output.includes('Established under name')) {
        expect(output).toContain(uniqueName);
        done();
      }
    });

    testProcess.stderr.on('data', (data) => {
      done(new Error(`avahi-publish-service error: ${data.toString()}`));
    });

    testProcess.on('exit', (code) => {
      if (code !== 0) {
        done(new Error(`Service failed to start, exit code: ${code}`));
      }
    });

    // Timeout fallback
    setTimeout(() => {
      done(new Error('Service did not establish within timeout'));
    }, 8000);
  });

  test('service responds to SIGTERM correctly', (done) => {
    testProcess = spawn('avahi-publish-service', [
      `${testServiceName}-sigterm`,
      '_blikvm._tcp', 
      testPort,
      'test=sigterm'
    ]);

    let established = false;
    let terminated = false;

    testProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      if (output.includes('Established under name')) {
        established = true;
        // Send SIGTERM after establishment
        setTimeout(() => testProcess.kill('SIGTERM'), 500);
      }
      
      if (output.includes('Got SIGTERM, quitting')) {
        terminated = true;
        expect(established).toBe(true);
        done();
      }
    });

    testProcess.on('exit', (code) => {
      if (established && terminated) {
        expect(code).toBe(0);
      } else if (!established) {
        done(new Error('Service never established'));
      }
    });

    setTimeout(() => {
      if (!terminated) {
        done(new Error('SIGTERM handling timeout'));
      }
    }, 8000);
  });
});