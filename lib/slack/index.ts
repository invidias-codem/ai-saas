/**
 * Slack Integration Module
 * 
 * This module provides multi-tenant Slack integration support.
 * All Slack-related utilities are exported from here.
 */

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
