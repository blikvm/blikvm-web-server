import { api } from './_helpers/apiClient.js';
import { ApiCode } from '../src/common/api.js';
import config from './config.js';

describe('WiFi API', () => {

  // 扫描 WiFi
    // Scan WiFi
  test('GET /api/wifi/scan returns available networks', async () => {
    const { status, json } = await api('GET', '/api/wifi/scan');

    expect([200]).toContain(status);
    expect(json?.code).toBe(ApiCode.OK);

      // systeminformation.wifiNetworks returns an array
    expect(Array.isArray(json?.data?.networks)).toBe(true);
  });

  // WiFi 状态
    // WiFi status
  test('GET /api/wifi/status returns current WiFi connection info', async () => {
    const { status, json } = await api('GET', '/api/wifi/status');

    expect([200]).toContain(status);
    expect(json?.code).toBe(ApiCode.OK);

      // wifiConnections returns an array (may be empty)
    expect(Array.isArray(json?.data?.connections)).toBe(true);
  });

  // 未提供 ssid → 应返回 400
    // Should return 400 if ssid is not provided
  test('POST /api/wifi/connect fails without ssid', async () => {
    const { status, json } = await api('POST', '/api/wifi/connect', {});

    expect(status).toBe(200);
    expect(json?.code).toBe(ApiCode.INVALID_INPUT_PARAM);
    expect(json?.data?.connected).toBe(false);
  });

  // 假 ssid → 返回 connected: false 或 true（通常 false）
    // Fake ssid → should return connected: false or true (usually false)
  test('POST /api/wifi/connect with fake ssid should return fail', async () => {
    const { status, json } = await api('POST', '/api/wifi/connect', {
      ssid: 'FAKE_SSID',
      password: 'FAKE_PASSWORD'
    });

      // Backend returns 500 if nmcli fails
    expect([200, 500]).toContain(status);

      // Backend always returns data.connected
    expect(typeof json?.data?.connected).toBe('boolean');
  });

  // 真实 Wi-Fi 连接测试（根据配置决定是否执行）
    // Real Wi-Fi connection test (executed if enabled in config)
  (config.enableWifiTest ? test : test.skip)(
    'POST /api/wifi/connect with real SSID should connect and disconnect',
    async () => {
      const { status, json } = await api('POST', '/api/wifi/connect', {
        ssid: config.wifiTestSSID,
        password: config.wifiTestPassword
      });
      expect([200, 500]).toContain(status);
      expect(json?.data?.connected).toBe(true);
        // If environment is correct, connected should be true
      if (json?.data?.connected === true) {
          // Immediately test disconnect after successful connect
        const { status: discStatus, json: discJson } = await api('POST', '/api/wifi/disconnect', {
          ssid: config.wifiTestSSID
        });
        expect([200, 500]).toContain(discStatus);
        expect([ApiCode.OK, ApiCode.INTERNAL_SERVER_ERROR]).toContain(discJson?.code);
        expect(discJson?.data?.connected).toBe(false);
      }
    }
  );

  // disconnect API
    // Disconnect API
  test('POST /api/wifi/disconnect returns success or server error', async () => {
    const { status, json } = await api('POST', '/api/wifi/disconnect', {});

    expect([200, 500]).toContain(status);

      // Must be OK or ERROR
    expect([ApiCode.OK, ApiCode.INTERNAL_SERVER_ERROR]).toContain(json?.code);

    expect(json?.data?.connected).toBe(false);
  });
});
