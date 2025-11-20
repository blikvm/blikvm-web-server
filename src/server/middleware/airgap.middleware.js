/**
 * Air-Gap Mode Middleware
 * Blocks external network requests when air-gap mode is enabled
 */

import { isAirGapMode, isAirGapFeatureEnabled } from '../api/system/airgap.route.js';
import { createApiObj, ApiCode } from '../../common/api.js';
import Logger from '../../log/logger.js';

const logger = new Logger();

/**
 * List of external domains that should be blocked in air-gap mode
 */
const EXTERNAL_DOMAINS = [
  'githubusercontent.com',
  'gitee.com',
  'unpkg.com',
  'jsdelivr.net',
  'cdnjs.com',
  'fontawesome.com',
  'googleapis.com',
  'fonts.google.com',
  'github.com'
];

/**
 * Middleware to block external requests in air-gap mode
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function airGapMiddleware(req, res, next) {
  // Skip if air-gap mode is disabled
  if (!isAirGapMode()) {
    return next();
  }

  const url = req.url || req.originalUrl || '';
  const userAgent = req.get('User-Agent') || '';

  // Check if this is a request that might trigger external calls
  const isExternalRequest = EXTERNAL_DOMAINS.some(domain => 
    url.includes(domain) || 
    req.get('Host')?.includes(domain) ||
    req.get('Referer')?.includes(domain)
  );

  if (isExternalRequest) {
    logger.warn(`[airgap] Blocked external request: ${req.method} ${url} from ${req.ip}`);
    
    const ret = createApiObj();
    ret.code = ApiCode.INTERNAL_SERVER_ERROR;
    ret.msg = 'External requests are blocked in air-gap mode';
    ret.data = {
      airGapMode: true,
      blockedUrl: url,
      workaround: 'Disable air-gap mode or use local alternatives'
    };
    
    return res.status(503).json(ret);
  }

  next();
}

/**
 * Check if a URL is external and should be blocked
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is external
 */
export function isExternalUrl(url) {
  if (!url) return false;
  
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Allow localhost and local network
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.endsWith('.local')) {
      return false;
    }
    
    // Block known external domains
    return EXTERNAL_DOMAINS.some(domain => hostname.includes(domain));
  } catch (error) {
    // If URL parsing fails, assume it's safe
    return false;
  }
}

/**
 * Air-gap error handler for blocked requests
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function airGapErrorHandler(err, req, res, next) {
  // Only handle air-gap related errors
  if (!err.message?.includes('air-gap') && !err.message?.includes('ENOTFOUND')) {
    return next(err);
  }

  if (res.headersSent) {
    return next(err);
  }

  logger.error(`[airgap] Air-gap error: ${err.message}`);

  const ret = createApiObj();
  ret.code = ApiCode.INTERNAL_SERVER_ERROR;
  ret.msg = 'Request blocked by air-gap mode';
  ret.data = {
    airGapMode: isAirGapMode(),
    error: err.message,
    suggestion: 'This operation requires external network access. Disable air-gap mode if this is intended.'
  };

  res.status(503).json(ret);
}

/**
 * Add air-gap headers to responses
 * @param {Object} req - Express request object  
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function airGapHeaders(req, res, next) {
  if (isAirGapMode()) {
    res.setHeader('X-Air-Gap-Mode', 'enabled');
    res.setHeader('X-Air-Gap-Features', JSON.stringify({
      systemUpdates: isAirGapFeatureEnabled('systemUpdates'),
      externalAssets: isAirGapFeatureEnabled('externalAssets'),
      documentation: isAirGapFeatureEnabled('documentation')
    }));
  }
  next();
}