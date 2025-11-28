/**
 * OpenAPI v1 HID schemas for AJV validation
 * Real-time input control for KVM operations
 */

export const HIDStatusResponseSchema = {
  type: 'object',
  required: ['enabled', 'mode', 'hardware_status'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Whether HID is enabled'
    },
    mode: {
      type: 'string',
      enum: ['absolute', 'relative', 'dual'],
      description: 'Current mouse mode'
    },
    hardware_status: {
      type: 'string',
      enum: ['connected', 'disconnected', 'error'],
      description: 'Hardware connection status'
    },
    passthrough: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        active: { type: 'boolean' }
      },
      required: ['enabled', 'active']
    }
  },
  additionalProperties: false
};

export const HIDModeRequestSchema = {
  type: 'object',
  required: ['mode'],
  properties: {
    mode: {
      type: 'string',
      enum: ['absolute', 'relative', 'dual'],
      description: 'Mouse mode to set'
    }
  },
  additionalProperties: false
};

export const KeyEventRequestSchema = {
  type: 'object',
  required: ['key'],
  properties: {
    key: {
      type: 'string',
      pattern: '^[A-Za-z0-9]+$',
      minLength: 1,
      maxLength: 25,
      description: 'KeyboardEvent.code identifier (e.g., KeyA, Enter, Space, ControlLeft, ShiftLeft)'
    },
    state: {
      type: 'boolean',
      description: 'true: press, false: release. Default: true (press)'
    },
    finish: {
      type: 'boolean', 
      description: 'For press events, immediately release after press. Default: false'
    }
  },
  additionalProperties: false
};

export const MouseEventRequestSchema = {
  type: 'object',
  properties: {
    buttons: {
      type: 'object',
      properties: {
        left: { type: 'boolean' },
        right: { type: 'boolean' },
        middle: { type: 'boolean' }
      },
      additionalProperties: false
    },
    move: {
      type: 'object',
      properties: {
        x: { 
          type: 'integer', 
          minimum: -32768, 
          maximum: 32767,
          description: 'X coordinate (absolute mode) or X delta (relative mode)'
        },
        y: { 
          type: 'integer', 
          minimum: -32768, 
          maximum: 32767,
          description: 'Y coordinate (absolute mode) or Y delta (relative mode)'
        }
      },
      required: ['x', 'y'],
      additionalProperties: false
    },
    wheel: {
      type: 'object',
      properties: {
        x: { 
          type: 'integer', 
          minimum: -127, 
          maximum: 127,
          description: 'Horizontal wheel delta'
        },
        y: { 
          type: 'integer', 
          minimum: -127, 
          maximum: 127,
          description: 'Vertical wheel delta'
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false,
  anyOf: [
    { required: ['buttons'] },
    { required: ['move'] },
    { required: ['wheel'] }
  ]
};

export const HIDEventResponseSchema = {
  type: 'object',
  required: ['success', 'response_time_ms'],
  properties: {
    success: {
      type: 'boolean',
      description: 'Whether the event was processed successfully'
    },
    response_time_ms: {
      type: 'number',
      minimum: 0,
      description: 'Response time in milliseconds'
    },
    hardware_status: {
      type: 'string',
      enum: ['connected', 'disconnected', 'error'],
      description: 'Hardware status after event'
    }
  },
  additionalProperties: false
};

export const ErrorResponseSchema = {
  type: 'object',
  required: ['msg', 'code'],
  properties: {
    msg: {
      type: 'string',
      description: 'Human-readable error message'
    },
    code: {
      type: 'integer',
      description: 'Numeric error code'
    },
    data: {
      type: 'object',
      properties: {
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              message: { type: 'string' }
            },
            required: ['message']
          }
        }
      }
    }
  },
  additionalProperties: false
};