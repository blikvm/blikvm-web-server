/**
 * ATX API v1 Phase 1 Implementation
 * Follows PDF specification exactly
 */

import ATX from '../../../modules/kvmd/kvmd_atx.js';
import fs from 'fs';
import { writeJsonAtomic } from '../../../common/atomic-file.js';
import { CONFIG_PATH, UTF8 } from '../../../common/constants.js';
import { createSocket } from 'unix-dgram';
import Logger from '../../../log/logger.js';

const logger = new Logger();

// Read static config once at module load
let SOCKET_PATH;
try {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
  SOCKET_PATH = config.atx?.controlSockFilePath;
} catch (error) {
  logger.error('Failed to parse ATX config at module load:', error);
  SOCKET_PATH = '/var/blikvm/atx.sock';
}

const atxInstance = new ATX();

// Rate limiting with test isolation
let lastActionTime = new Map();
const RATE_LIMIT_MS = 3000; // 3 seconds

/**
 * Test-only endpoint to clear rate limits
 * Only available in test environment
 */
export function clearRateLimitsForTesting(req, res, next) {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({
      error: 'not_found',
      message: 'Test endpoints only available in test environment'
    });
  }
  
  try {
    // Create a new Map to fully reset rate limiting state
    lastActionTime = new Map();
    res.json({ 
      cleared: true, 
      message: 'Rate limits cleared for testing' 
    });
  } catch (error) {
    next(error);
  }
}

// Direct command mapping (PDF page 26)
const COMMAND_MAP = {
  'short_press': 128,    // power_on - 500ms
  'long_press': 192,     // power_off - 5000ms
  'reset': 8             // power_reset - 500ms
};

/**
 * GET /api/v1/atx/status
 */
export async function getATXStatus(req, res, next) {
  try {
    const state = atxInstance.getATXState();
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    
    res.json({
      enabled: config.atx?.isActive ?? true,
      power: state.ledPwr === true,
      hdd_active: state.ledHdd === true
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/atx
 */
export async function updateATXConfig(req, res, next) {
  try {
    const { enabled } = req.body;

    await writeJsonAtomic(CONFIG_PATH, (cfg) => {
      if (!cfg.atx) cfg.atx = {};
      cfg.atx.isActive = enabled;
    });
    
    res.json({ enabled });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/atx/actions
 */
export async function createATXAction(req, res, next) {
  try {
    const { type } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // Check if ATX is enabled
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const isActive = config.atx?.isActive ?? true;
    if (!isActive) {
      return res.status(403).json({
        error: 'atx_disabled',
        message: 'ATX control is disabled. Enable via PUT /api/v1/atx.'
      });
    }

    // Rate limiting (3s interval)
    const now = Date.now();
    const lastTime = lastActionTime.get(clientIp) || 0;
    const timeDiff = now - lastTime;
    
    if (timeDiff < RATE_LIMIT_MS) {
      const retryAfter = Math.ceil((RATE_LIMIT_MS - timeDiff) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'rate_limited',
        message: `Minimum 3s interval between power commands. Retry in ${retryAfter}s`
      });
    }

    // Execute action via consolidated mapping
    const cmd = COMMAND_MAP[type];
    if (cmd === undefined) {
      return res.status(400).json({
        error: 'invalid_type',
        message: `Invalid action type '${type}'. Use: short_press, long_press, reset`
      });
    }
    
    await writeToSocket(cmd, SOCKET_PATH);
    
    // Update rate limiting
    lastActionTime.set(clientIp, now);
    
    // Phase 1 response (no storage)
    res.json({ type });
  } catch (error) {
    next(error);
  }
}

/**
 * Write command to ATX socket
 */
function writeToSocket(cmd, socketPath) {
  return new Promise((resolve, reject) => {
    const message = Buffer.from([cmd]);
    const client = createSocket('unix_dgram');
    
    client.on('error', (err) => {
      client.close();
      reject(err);
    });
    
    if (!socketPath) {
      client.close();
      reject(new Error('ATX control socket path not configured'));
      return;
    }
    
    client.send(message, 0, message.length, socketPath, (err) => {
      client.close();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}