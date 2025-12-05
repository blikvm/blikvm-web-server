/**
 * ATX API v1 Phase 1 Routes
 * Implements PDF specification with professional validation middleware
 */

import { getATXStatus, updateATXConfig, createATXAction, clearRateLimitsForTesting } from './atx.route.js';
import { validateRequestBody } from '../../middleware/openapi-validator.js';
import { ATXActiveRequestSchema, ATXPowerRequestSchema } from '../../schemas/atx-schemas-v1.js';
import fs from 'fs';
import path from 'path';

/**
 * OpenAPI documentation handler
 */
async function getOpenAPISpec(req, res, next) {
  try {
    const specPath = path.resolve('docs/openapi-v1-atx.yaml');
    const spec = await fs.promises.readFile(specPath, 'utf8');
    
    res.set('Content-Type', 'text/yaml; charset=utf-8');
    res.send(spec);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({
        error: 'not_found',
        message: 'OpenAPI specification not found'
      });
    } else {
      next(error);
    }
  }
}

/**
 * Phase 1 route definitions
 */
const v1Routes = [
  // GET /api/v1/docs - OpenAPI specification
  {
    path: '/api/v1/docs',
    method: 'get',
    handler: getOpenAPISpec,
    middleware: []
  },

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