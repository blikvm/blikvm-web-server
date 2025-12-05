/**
 * ATX API v1 PDF-Compliant Schemas
 * 
 * These schemas match the BliKVM ATX API v1 Design PDF specification exactly.
 * Field names, types, and descriptions follow the PDF document (pages 21-22).
 * 
 * Key differences from existing schemas:
 * - Uses 'type' field (not 'action') per PDF specification
 * - Mechanism-based enum values: short_press, long_press, reset
 * - Field descriptions match PDF exactly
 */

export const ATXStatusSchema = {
  type: 'object',
  required: ['enabled', 'power', 'hdd_active'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'ATX control available in config'
    },
    power: {
      type: 'boolean',
      description: 'Host power state (true = ON)'
    },
    hdd_active: {
      type: 'boolean',
      description: 'HDD activity indicator'
    }
  },
  additionalProperties: false
};

export const ATXActiveRequestSchema = {
  type: 'object',
  required: ['enabled'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Enable or disable ATX control'
    }
  },
  additionalProperties: false
};

export const ATXPowerRequestSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: ['short_press', 'long_press', 'reset'],
      description: 'ATX power action type - mechanism-based naming'
    }
  },
  additionalProperties: false
};

export const ATXActiveResponseSchema = {
  type: 'object',
  required: ['enabled'],
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Current ATX control state'
    }
  },
  additionalProperties: false
};

export const ATXPowerResponseSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: ['short_press', 'long_press', 'reset'],
      description: 'Action type that was executed'
    }
  },
  additionalProperties: false
};

export const ErrorResponseSchema = {
  type: 'object',
  required: ['error', 'message'],
  properties: {
    error: {
      type: 'string',
      description: 'Machine-readable error code (snake_case)'
    },
    message: {
      type: 'string',
      description: 'Human-readable message - frontend displays directly'
    }
  },
  additionalProperties: false
};