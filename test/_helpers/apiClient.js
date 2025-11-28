import http from 'http';
import https from 'https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export const baseURL = process.env.TEST_BASE_URL || 'https://127.0.0.1';
export const httpsAgent = new https.Agent({ rejectUnauthorized: false });
export const httpAgent = new http.Agent();

// Authentication cache
let authToken = null;

export async function authenticate(username = 'admin', password = 'blikvm') {
  const response = await api('POST', '/api/login', {
    username,
    password
  });
  
  if (response.status === 200 && response.json?.code === 0) {
    authToken = response.json.data.token;
    return authToken;
  }
  
  throw new Error(`Authentication failed: ${response.json?.msg || 'Unknown error'}`);
}

export async function clearAuth() {
  authToken = null;
}

export async function api(method, urlPath, body, extra = {}) {
  const u = new URL(urlPath, baseURL);
  const isHttps = u.protocol === 'https:';
  const lib = isHttps ? https : http;
  const agent = isHttps ? httpsAgent : httpAgent;

  const headers = { ...(extra.headers || {}) };
  
  // Auto-inject JWT token for authenticated requests (skip login endpoint)
  if (authToken && !urlPath.includes('/api/login')) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  let isStreamBody = false;
  let payload = null;

  if (body !== undefined && body !== null) {
    const looksLikeFormData = typeof body.getHeaders === 'function' && typeof body.pipe === 'function';
    if (looksLikeFormData) {
      Object.assign(headers, body.getHeaders());
      isStreamBody = true;
    } else if (Buffer.isBuffer(body) || typeof body === 'string') {
      payload = body;
      headers['Content-Type'] = headers['Content-Type'] || 'application/octet-stream';
    } else {
      payload = JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }
  } else {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const options = {
    protocol: u.protocol,
    hostname: u.hostname,
    port: u.port || (isHttps ? 443 : 80),
    path: u.pathname + (u.search || ''),
    method,
    headers,
    agent,
  };

  const makeRequest = async () => {
    return await new Promise((resolve, reject) => {
      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (_) {}
          resolve({ status: res.statusCode, json });
        });
      });
      req.on('error', reject);

      if (body !== undefined && body !== null) {
        if (isStreamBody) {
          body.on?.('error', reject);
          body.pipe(req);
        } else {
          if (payload) {
            req.write(payload);
          }
          req.end();
        }
      } else {
        req.end();
      }
    });
  };

  // Make initial request
  const response = await makeRequest();
  
  // If 401 and not a login request, try to re-authenticate once
  if (response.status === 401 && !urlPath.includes('/api/login') && !extra.skipRetry) {
    try {
      await authenticate();
      // Update headers with new token
      if (authToken) {
        options.headers.Authorization = `Bearer ${authToken}`;
      }
      // Retry with skipRetry flag to prevent infinite loop
      return await api(method, urlPath, body, { ...extra, skipRetry: true });
    } catch (authError) {
      // If re-auth fails, return original 401 response
      return response;
    }
  }
  
  return response;
}
