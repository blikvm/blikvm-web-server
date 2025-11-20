/**
 * Configuration Event System
 * Central event emitter for configuration changes throughout the application
 * Enables clean decoupling between API routes and server components
 */

import { EventEmitter } from 'events';
import Logger from '../../log/logger.js';

const logger = new Logger();

/**
 * Central configuration event emitter
 * Used by route handlers to emit configuration change events
 * Listened to by server components that need to react to changes
 */
class ConfigEventEmitter extends EventEmitter {
  constructor() {
    super();
    
    // Set higher max listeners for production use
    this.setMaxListeners(50);
    
    // Log all configuration events for debugging
    this.on('newListener', (event) => {
      logger.debug(`[config-events] New listener added for event: ${event}`);
    });
  }

  /**
   * Emit configuration change event with standardized format
   * @param {string} configPath - The configuration path that changed (e.g., 'mdns', 'airgap')
   * @param {Object} eventData - Event data containing change details
   * @param {*} eventData.newValue - The new configuration value
   * @param {*} eventData.oldValue - The previous configuration value (optional)
   * @param {string} eventData.changedBy - Username who made the change
   * @param {string} eventData.timestamp - ISO timestamp of the change
   */
  emitConfigChange(configPath, eventData) {
    const event = `config:${configPath}:changed`;
    const standardizedData = {
      configPath,
      newValue: eventData.newValue,
      oldValue: eventData.oldValue || null,
      changedBy: eventData.changedBy || 'unknown',
      timestamp: eventData.timestamp || new Date().toISOString(),
      ...eventData
    };

    logger.info(`[config-events] Configuration changed: ${configPath} by ${standardizedData.changedBy}`);
    
    // Use setImmediate to emit asynchronously and handle errors gracefully
    setImmediate(() => {
      try {
        this.emit(event, standardizedData);
      } catch (error) {
        logger.error(`[config-events] Error in event handler for ${configPath}: ${error.message}`);
      }
    });
  }

  /**
   * Subscribe to configuration changes for a specific path
   * @param {string} configPath - The configuration path to listen to
   * @param {Function} callback - Callback function to handle the event
   */
  onConfigChange(configPath, callback) {
    const event = `config:${configPath}:changed`;
    this.on(event, callback);
    logger.debug(`[config-events] Listener registered for: ${event}`);
  }

  /**
   * Remove listener for configuration changes
   * @param {string} configPath - The configuration path
   * @param {Function} callback - The callback function to remove
   */
  offConfigChange(configPath, callback) {
    const event = `config:${configPath}:changed`;
    this.off(event, callback);
    logger.debug(`[config-events] Listener removed for: ${event}`);
  }
}

// Export singleton instance
export const configEvents = new ConfigEventEmitter();

// Export event names for consistency
export const CONFIG_EVENTS = {
  MDNS_CHANGED: 'config:mdns:changed',
  AIRGAP_CHANGED: 'config:airgap:changed',
  SERVER_CHANGED: 'config:server:changed',
  // Add more as needed
};

export default configEvents;