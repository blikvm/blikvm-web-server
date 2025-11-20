/**
 * OpenAPI v1 Routes Configuration
 * REST-compliant API routes with validation
 */

import { getATXPower, setATXPower, getATXActive, setATXActive } from './atx.route.js';
import { getAirGapStatus, setAirGapMode } from '../system/airgap.route.js';
import { getMdnsStatus, setMdnsMode } from '../system/mdns.route.js';
import { validateRequestBody } from '../../middleware/openapi-validator.js';
import { 
  ATXPowerRequestSchema, 
  ATXActiveRequestSchema 
} from '../../schemas/atx-schemas.js';

/**
 * OpenAPI v1 route definitions
 */
const v1Routes = [
  // ATX Power Control
  {
    path: '/api/v1/atx/power',
    method: 'get',
    handler: getATXPower,
    middleware: []
  },
  {
    path: '/api/v1/atx/power',
    method: 'put',
    handler: setATXPower,
    middleware: [validateRequestBody(ATXPowerRequestSchema)]
  },
  
  // ATX Active State
  {
    path: '/api/v1/atx',
    method: 'get',
    handler: getATXActive,
    middleware: []
  },
  {
    path: '/api/v1/atx',
    method: 'put',
    handler: setATXActive,
    middleware: [validateRequestBody(ATXActiveRequestSchema)]
  },

  // System Air-Gap Management
  {
    path: '/api/v1/system/airgap',
    method: 'get',
    handler: getAirGapStatus,
    middleware: []
  },
  {
    path: '/api/v1/system/airgap',
    method: 'put',
    handler: setAirGapMode,
    middleware: []
  },

  // System mDNS Management
  {
    path: '/api/v1/system/mdns',
    method: 'get',
    handler: getMdnsStatus,
    middleware: []
  },
  {
    path: '/api/v1/system/mdns',
    method: 'put',
    handler: setMdnsMode,
    middleware: []
  }
];

export default v1Routes;