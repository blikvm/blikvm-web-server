/**
 * OpenAPI v1 ATX schemas for AJV validation
 * Extracted from blikvm-api-v1.yaml for Bun/Elysia compatibility
 */

export const ATXStateSchema = {
  type: 'object',
  required: ['enabled', 'power'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Whether ATX control is enabled'
    },
    power: {
      type: 'string',
      enum: ['on', 'off', 'unknown'],
      description: 'Current power state'
    }
  },
  additionalProperties: false
};

export const ATXPowerRequestSchema = {
  type: 'object',
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['on', 'off', 'reset', 'short_press', 'long_press'],
      description: 'Power action to perform'
    }
  },
  additionalProperties: false
};

export const ATXActiveRequestSchema = {
  type: 'object',
  required: ['enabled'],
  properties: {
    enabled: {
      type: 'boolean'
    }
  },
  additionalProperties: false
};

export const ErrorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'string',
      description: 'Error message'
    },
    code: {
      type: 'string',
      description: 'Machine-readable error code'
    },
    details: {
      type: 'object',
      description: 'Additional error details'
    }
  }
};