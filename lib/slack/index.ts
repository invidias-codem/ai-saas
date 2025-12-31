/**
 * Slack Integration Module
 * 
 * This module provides multi-tenant Slack integration support.
 * All Slack-related utilities are exported from here.
 */

// App Home Manager
export { publishAppHome } from './appHome';

// Thread Manager - For conversation context
export {
  getThreadHistory,
  updateThreadHistory,
  type SlackThreadMessage,
} from './threadManager';

// Token Manager - Core multi-tenant functionality
export {
  getSlackConfig,
  saveSlackInstallation,
  removeSlackInstallation,
  getInstallationsForUser,
  hasInstallation,
  getInstallation,
  linkInstallationToUser,
  logInstallationEvent,
  getAllInstallations,
  validateInstallation,
  type SlackConfig,
  type SlackInstallation,
} from './tokenManager';

// User Resolver - Map Slack IDs to Internal IDs
// User Resolver - Map Slack IDs to Internal IDs
export {
  resolveSlackUser,
  linkSlackUser,
} from './userResolver';

// Config Manager - Channel-specific settings
export {
  getChannelConfig,
  saveChannelConfig,
  type ChannelConfig,
} from './configManager';
