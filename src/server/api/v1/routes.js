/**
 * ATX API v1 Phase 1 Routes
 * Implements PDF specification with professional validation middleware
 */

import { getATXStatus, updateATXConfig, createATXAction, clearRateLimitsForTesting } from './atx.route.js';
import { validateRequestBody } from '../../middleware/openapi-validator.js';
import { ATXActiveRequestSchema, ATXPowerRequestSchema } from '../../schemas/atx-schemas-v1.js';

/**
 * Phase 1 route definitions
 */
const v1Routes = [

  // GET /api/v1/atx/status
  {
    path: '/api/v1/atx/status',
    method: 'get',
    handler: getATXStatus,
    middleware: []
  },
  
  // PUT /api/v1/atx  
  {
    path: '/api/v1/atx',
    method: 'put', 
    handler: updateATXConfig,
    middleware: [validateRequestBody(ATXActiveRequestSchema)]
  },
  
  // POST /api/v1/atx/actions
  {
    path: '/api/v1/atx/actions',
    method: 'post',
    handler: createATXAction,
    middleware: [validateRequestBody(ATXPowerRequestSchema)]
  },

  // Test-only endpoint to clear rate limits
  {
    path: '/api/v1/_test/rate-limits',
    method: 'delete',
    handler: clearRateLimitsForTesting,
    middleware: []
  }
];

export default v1Routes;