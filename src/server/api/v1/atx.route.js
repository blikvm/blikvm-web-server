/**
 * OpenAPI v1 ATX (Power Control) Routes
 * REST-compliant endpoints following OpenAPI specification
 */

import ATX from '../../../modules/kvmd/kvmd_atx.js';
import fs from 'fs';
import { writeJsonAtomic } from '../../../common/atomic-file.js';
import { CONFIG_PATH, UTF8 } from '../../../common/constants.js';
import { createSocket } from 'unix-dgram';

// Read static config once at module load
const SOCKET_PATH = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8)).atx?.controlSockFilePath;

// Cache only dynamic user configuration
let userConfigCache = null;
let userConfigLastRead = 0;
const USER_CONFIG_TTL = 5000; // 5 second cache for user settings

/**
 * Get cached user configuration (only dynamic settings)
 * @returns {Promise<Object>} Cached user configuration object
 */
async function getUserConfig() {
  const now = Date.now();
  if (!userConfigCache || (now - userConfigLastRead) > USER_CONFIG_TTL) {
    const configText = await fs.promises.readFile(CONFIG_PATH, UTF8);
    const config = JSON.parse(configText);
    userConfigCache = {
      isActive: config.atx?.isActive ?? true
    };
    userConfigLastRead = now;
  }
  return userConfigCache;
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
    
    // Execute power command using static socket path
    await writeToSocket(command.cmd, SOCKET_PATH);
    
    // Return command confirmation (GPIO takes minutes to update)
    res.json({ 
      success: true, 
      action: action,
      message: command.msg,
      timestamp: new Date().toISOString()
    });
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
    const userConfig = await getUserConfig();
    const enabled = userConfig.isActive;
    
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