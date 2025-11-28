/**
 * OpenAPI v1 ATX (Power Control) Routes
 * REST-compliant endpoints following OpenAPI specification
 */

import ATX from '../../../modules/kvmd/kvmd_atx.js';
import fs from 'fs';
import { writeJsonAtomic } from '../../../common/atomic-file.js';
import { CONFIG_PATH, UTF8 } from '../../../common/constants.js';
import { createSocket } from 'unix-dgram';

// Cache config at module level
let cachedConfig = null;
let configLastRead = 0;
const CONFIG_CACHE_TTL = 5000; // 5 second cache

/**
 * Get cached configuration to avoid repeated file I/O
 * @returns {Promise<Object>} Parsed configuration object
 */
async function getConfig() {
  const now = Date.now();
  if (!cachedConfig || (now - configLastRead) > CONFIG_CACHE_TTL) {
    const configText = await fs.promises.readFile(CONFIG_PATH, UTF8);
    cachedConfig = JSON.parse(configText);
    configLastRead = now;
  }
  return cachedConfig;
}

/**
 * Convert ATX state to v1 response format
 * @param {Object} state - ATX state from getATXState()
 * @returns {Object} v1 formatted response
 */
function formatATXResponse(state) {
  const enabled = state.isActive ?? true;
  const power = (state?.ledPwr === true) ? 'on' : 
                (state?.ledPwr === false) ? 'off' : 
                'unknown';
  return { enabled, power };
}

/**
 * Get current ATX power state
 * GET /api/v1/atx/power
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export async function getATXPower(req, res, next) {
  try {
    const atx = new ATX();
    const state = atx.getATXState();
    
    res.json(formatATXResponse(state));
  } catch (error) {
    next(error);
  }
}

/**
 * Control ATX power state
 * PUT /api/v1/atx/power
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next middleware
 */
export async function setATXPower(req, res, next) {
  try {
    const { action } = req.body;
    
    // Map v1 actions to legacy commands
    const actionMap = {
      'short_press': { cmd: 128, msg: 'Short click on the power button' },
      'long_press': { cmd: 192, msg: 'Long press on the power button (5+ seconds)' },
      'on': { cmd: 128, msg: 'Short click on the power button' },
      'off': { cmd: 192, msg: 'Long press on the power button (5+ seconds)' },
      'reset': { cmd: 8, msg: 'Short click on the reset button' }
    };
    
    const command = actionMap[action];
    
    // Get socket path from cached config
    const config = await getConfig();
    const socketPath = config.atx?.controlSockFilePath;
    
    // Execute power command
    await writeToSocket(command.cmd, socketPath);
    
    // Return updated state
    const atx = new ATX();
    const state = atx.getATXState();
    
    res.json(formatATXResponse(state));
  } catch (error) {
    next(error);
  }
}

/**
 * Get ATX active state
 * GET /api/v1/atx
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export async function getATXActive(req, res, next) {
  try {
    const config = await getConfig();
    const enabled = config.atx?.isActive ?? true;
    
    res.json({ enabled });
  } catch (error) {
    next(error);
  }
}

/**
 * Enable/disable ATX
 * PUT /api/v1/atx
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
export async function setATXActive(req, res, next) {
  try {
    const { enabled } = req.body;
    
    // Update configuration
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
 * Write command to ATX socket (shared with legacy implementation)
 * 
 * @param {number} cmd - Command to send
 * @param {string} socketPath - Path to ATX control socket
 * @returns {Promise<void>}
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