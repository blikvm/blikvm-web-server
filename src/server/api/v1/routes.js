/**
 * OpenAPI v1 Routes Configuration
 * REST-compliant API routes with validation
 */

import { getATXPower, setATXPower, getATXActive, setATXActive } from './atx.route.js';
import { getHIDStatus, setHIDMode, sendKeyboardEvent, sendMouseEvent } from './hid.route.js';
import { validateRequestBody } from '../../middleware/openapi-validator.js';
import { 
  ATXPowerRequestSchema, 
  ATXActiveRequestSchema 
} from '../../schemas/atx-schemas.js';
import {
  HIDModeRequestSchema,
  KeyEventRequestSchema,
  MouseEventRequestSchema
} from '../../schemas/hid-schemas.js';

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
  
  // HID Status and Configuration
  {
    path: '/api/v1/hid/status',
    method: 'get',
    handler: getHIDStatus,
    middleware: []
  },
  {
    path: '/api/v1/hid/mode',
    method: 'put',
    handler: setHIDMode,
    middleware: [validateRequestBody(HIDModeRequestSchema)]
  },
  
  // HID Input Events (Performance Critical)
  {
    path: '/api/v1/hid/keyboard/event',
    method: 'post',
    handler: sendKeyboardEvent,
    middleware: [validateRequestBody(KeyEventRequestSchema)]
  },
  {
    path: '/api/v1/hid/mouse/event',
    method: 'post',
    handler: sendMouseEvent,
    middleware: [validateRequestBody(MouseEventRequestSchema)]
  }
];

export default v1Routes;