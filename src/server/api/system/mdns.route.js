/**
 * mDNS (Multicast DNS) API Endpoints
 * Controls mDNS network discovery service
 */

import fs from 'fs';
import { createApiObj, ApiCode } from '../../../common/api.js';
import { writeJsonAtomic } from '../../../common/atomic-file.js';
import { CONFIG_PATH, UTF8 } from '../../../common/constants.js';
import Logger from '../../../log/logger.js';
import HttpServer from '../../server.js';

const logger = new Logger();

/**
 * Get current mDNS status
 * GET /api/system/mdns
 */
export async function getMdnsStatus(req, res, next) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const mdns = config.mdns || {
      enabled: true,
      lastModified: null,
      modifiedBy: null
    };

    const data = {
      enabled: mdns.enabled,
      lastModified: mdns.lastModified,
      modifiedBy: mdns.modifiedBy,
      service: {
        name: 'mDNS Discovery Service',
        description: 'Allows network discovery via <hostname>.local addresses',
        port: 5353,
        protocol: 'UDP'
      }
    };

    const ret = createApiObj();
    ret.data = data;
    ret.code = ApiCode.OK;
    res.json(ret);
  } catch (error) {
    logger.error(`[mdns] Failed to get mDNS status: ${error.message}`);
    next(error);
  }
}

/**
 * Enable or disable mDNS service
 * PUT /api/system/mdns
 */
export async function setMdnsMode(req, res, next) {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      const ret = createApiObj();
      ret.code = ApiCode.INVALID_INPUT_PARAM;
      ret.msg = 'enabled field must be a boolean value';
      return res.status(400).json(ret);
    }

    // Get user info for audit trail
    const user = req.user || { username: 'unknown' };
    const timestamp = new Date().toISOString();

    await writeJsonAtomic(CONFIG_PATH, (config) => {
      if (!config.mdns) {
        config.mdns = {
          enabled: true,
          lastModified: null,
          modifiedBy: null
        };
      }

      config.mdns.enabled = enabled;
      config.mdns.lastModified = timestamp;
      config.mdns.modifiedBy = user.username;
    });

    logger.info(`[mdns] mDNS service ${enabled ? 'enabled' : 'disabled'} by ${user.username}`);

    // Restart mDNS service to apply changes
    const server = HttpServer.getInstance();
    if (server) {
      try {
        server.restartMdns();
      } catch (error) {
        logger.warn(`[mdns] Failed to restart mDNS service: ${error.message}`);
      }
    }

    // Return updated status
    const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const data = {
      enabled: updatedConfig.mdns.enabled,
      lastModified: updatedConfig.mdns.lastModified,
      modifiedBy: updatedConfig.mdns.modifiedBy,
      service: {
        name: 'mDNS Discovery Service',
        description: 'Allows network discovery via <hostname>.local addresses',
        port: 5353,
        protocol: 'UDP'
      }
    };

    const ret = createApiObj();
    ret.data = data;
    ret.code = ApiCode.OK;
    res.json(ret);
  } catch (error) {
    logger.error(`[mdns] Failed to set mDNS mode: ${error.message}`);
    next(error);
  }
}

/**
 * Check if mDNS is currently enabled
 * @returns {boolean} True if mDNS is enabled
 */
export function isMdnsEnabled() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    return config.mdns?.enabled !== false; // Default to true if not configured
  } catch (error) {
    logger.warn(`[mdns] Failed to read mDNS status, defaulting to enabled: ${error.message}`);
    return true; // Default to enabled if config read fails
  }
}