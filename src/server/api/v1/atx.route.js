/**
 * OpenAPI v1 ATX (Power Control) Routes
 * REST-compliant endpoints following OpenAPI specification
 */

import ATX from '../../../modules/kvmd/kvmd_atx.js';
import fs from 'fs';
import { writeJsonAtomic } from '../../../common/atomic-file.js';
import { CONFIG_PATH, UTF8 } from '../../../common/constants.js';
import { createSocket } from 'unix-dgram';

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
    
    // Get active state from config
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const enabled = config.atx?.isActive ?? true;
    
    // Convert legacy state format to v1 format
    let power = 'unknown';
    if (state && typeof state.power !== 'undefined') {
      power = state.power ? 'on' : 'off';
    }
    
    res.json({
      enabled,
      power
    });
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
    if (!command) {
      const error = new Error(`Invalid action: ${action}`);
      error.statusCode = 400;
      error.code = 'INVALID_ACTION';
      throw error;
    }
    
    // Execute power command
    await writeToSocket(command.cmd);
    
    // Return updated state
    const atx = new ATX();
    const state = atx.getATXState();
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const enabled = config.atx?.isActive ?? true;
    
    let power = 'unknown';
    if (state && typeof state.power !== 'undefined') {
      power = state.power ? 'on' : 'off';
    }
    
    res.json({
      enabled,
      power
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
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
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
 * @returns {Promise<void>}
 */
function writeToSocket(cmd) {
  return new Promise((resolve, reject) => {
    const message = Buffer.from([cmd]);
    const client = createSocket('unix_dgram');
    
    client.on('error', (err) => {
      client.close();
      reject(err);
    });
    
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const socketPath = config.atx?.controlSockFilePath;
    
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