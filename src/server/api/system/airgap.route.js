/**
 * Air-Gap Mode API Endpoints
 * Controls external network access for enhanced security
 */

import fs from 'fs';
import { createApiObj, ApiCode } from '../../../common/api.js';
import { writeJsonAtomic } from '../../../common/atomic-file.js';
import { CONFIG_PATH, UTF8 } from '../../../common/constants.js';
import Logger from '../../../log/logger.js';

const logger = new Logger();

/**
 * Get current air-gap mode status
 * GET /api/system/airgap
 */
export async function getAirGapStatus(req, res, next) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const airGap = config.airGap || {
      enabled: false,
      features: {
        systemUpdates: true,
        externalAssets: true,
        documentation: true
      },
      lastModified: null,
      modifiedBy: null
    };

    const ret = createApiObj();
    ret.data = {
      enabled: airGap.enabled,
      features: airGap.features,
      lastModified: airGap.lastModified,
      modifiedBy: airGap.modifiedBy,
      blockedServices: airGap.enabled ? getBlockedServices(airGap.features) : [],
      affectedFeatures: getAffectedFeatures()
    };
    ret.code = ApiCode.OK;
    
    res.json(ret);
  } catch (error) {
    logger.error(`[airgap] Failed to get air-gap status: ${error.message}`);
    next(error);
  }
}

/**
 * Enable or disable air-gap mode
 * PUT /api/system/airgap
 */
export async function setAirGapMode(req, res, next) {
  try {
    const { enabled, features } = req.body;
    
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
      if (!config.airGap) {
        config.airGap = {
          enabled: false,
          features: {
            systemUpdates: true,
            externalAssets: true,
            documentation: true
          },
          lastModified: null,
          modifiedBy: null
        };
      }

      config.airGap.enabled = enabled;
      config.airGap.lastModified = timestamp;
      config.airGap.modifiedBy = user.username;

      // Update features if provided
      if (features && typeof features === 'object') {
        config.airGap.features = {
          ...config.airGap.features,
          ...features
        };
      }
    });

    logger.info(`[airgap] Air-gap mode ${enabled ? 'enabled' : 'disabled'} by ${user.username}`);

    // Return updated status
    const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    const ret = createApiObj();
    ret.data = {
      enabled: updatedConfig.airGap.enabled,
      features: updatedConfig.airGap.features,
      lastModified: updatedConfig.airGap.lastModified,
      modifiedBy: updatedConfig.airGap.modifiedBy,
      blockedServices: enabled ? getBlockedServices(updatedConfig.airGap.features) : [],
      affectedFeatures: getAffectedFeatures()
    };
    ret.code = ApiCode.OK;
    
    res.json(ret);
  } catch (error) {
    logger.error(`[airgap] Failed to set air-gap mode: ${error.message}`);
    next(error);
  }
}

/**
 * Check if air-gap mode is currently enabled
 * @returns {boolean} True if air-gap mode is enabled
 */
export function isAirGapMode() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    return config.airGap?.enabled || false;
  } catch (error) {
    logger.warn(`[airgap] Failed to read air-gap status, defaulting to disabled: ${error.message}`);
    return false;
  }
}

/**
 * Check if a specific air-gap feature is enabled
 * @param {string} feature - Feature name (systemUpdates, externalAssets, documentation)
 * @returns {boolean} True if feature blocking is enabled
 */
export function isAirGapFeatureEnabled(feature) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, UTF8));
    if (!config.airGap?.enabled) return false;
    return config.airGap?.features?.[feature] || false;
  } catch (error) {
    logger.warn(`[airgap] Failed to read air-gap feature status: ${error.message}`);
    return false;
  }
}

/**
 * Get list of services that would be blocked based on features
 * @param {Object} features - Air-gap features configuration
 * @returns {Array} List of blocked services
 */
function getBlockedServices(features) {
  const blockedServices = [];
  
  if (features.systemUpdates) {
    blockedServices.push(
      'GitHub update downloads',
      'Gitee update downloads'
    );
  }
  
  if (features.externalAssets) {
    blockedServices.push(
      'CDN asset loading (Swagger UI)',
      'External font loading',
      'External CSS/JS libraries'
    );
  }
  
  if (features.documentation) {
    blockedServices.push(
      'External documentation assets'
    );
  }
  
  return blockedServices;
}

/**
 * Get list of features that may be affected by air-gap mode
 * @returns {Array} List of affected features
 */
function getAffectedFeatures() {
  return [
    {
      feature: 'System Updates',
      impact: 'Manual updates required via local files',
      workaround: 'Download update scripts manually and run locally'
    },
    {
      feature: 'API Documentation',
      impact: 'Swagger UI may have styling issues',
      workaround: 'Use local bundled assets or raw OpenAPI YAML'
    },
    {
      feature: 'Frontend Styling',
      impact: 'External fonts and icons may not load',
      workaround: 'Use bundled local assets'
    }
  ];
}