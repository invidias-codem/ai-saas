/**
 * Native Path Resolution — Shared path utilities for stable/preview channels.
 * Mirrors the Rust implementation for consistent paths across CLI, desktop, and web.
 */

import { resolveDevicePaths as resolveDevicePathsCore, DevicePaths } from '@/lib/contracts/provider-registry';

// Re-export the core function and types
export { resolveDevicePathsCore, type DevicePaths };

// Platform detection
export const isWindows = typeof navigator !== 'undefined'
  ? navigator.userAgent.includes('Windows')
  : process.platform === 'win32';

export const isMacOS = typeof navigator !== 'undefined'
  ? navigator.userAgent.includes('Mac')
  : process.platform === 'darwin';

export const isLinux = !isWindows && !isMacOS;

// App identifiers
export const STABLE_APP_ID = 'xyz.gen1e.lattice-os';
export const PREVIEW_APP_ID = 'xyz.gen1e.lattice-os.preview';

// Channel type
export type Channel = 'stable' | 'preview';

export interface ChannelPaths {
  channel: Channel;
  root: string;
  profilesRoot: string;
  profileConfigTemplate: string;
  profileStateTemplate: string;
  profileLogsTemplate: string;
  profileCacheTemplate: string;
  credentialsRoot: string;  // Not used — credentials go to OS keychain
}

/**
 * Get paths for a specific channel.
 * In the browser, this returns the expected native paths (for display only).
 * In Tauri, the actual native paths are resolved by the Rust side.
 */
export function getChannelPaths(channel: Channel = 'stable'): ChannelPaths {
  const paths = resolveDevicePathsCore(channel === 'stable' ? STABLE_APP_ID : PREVIEW_APP_ID);

  if (channel === 'stable') {
    return {
      channel: 'stable',
      root: paths.stableRoot,
      profilesRoot: paths.profilesRoot,
      profileConfigTemplate: paths.profileConfigTemplate,
      profileStateTemplate: paths.profileStateTemplate,
      profileLogsTemplate: paths.profileLogsTemplate,
      profileCacheTemplate: paths.profileCacheTemplate,
      credentialsRoot: '', // OS keychain
    };
  } else {
    return {
      channel: 'preview',
      root: paths.previewRoot,
      profilesRoot: paths.previewProfilesRoot,
      profileConfigTemplate: paths.previewProfileConfigTemplate,
      profileStateTemplate: paths.previewProfileStateTemplate,
      profileLogsTemplate: paths.previewProfileLogsTemplate,
      profileCacheTemplate: paths.previewProfileCacheTemplate,
      credentialsRoot: '', // OS keychain
    };
  }
}

/**
 * Get the profile config path for a given profile ID and channel.
 */
export function getProfileConfigPath(profileId: string, channel: Channel = 'stable'): string {
  return getChannelPaths(channel).profileConfigTemplate.replace('{profileId}', profileId);
}

/**
 * Get the profile state (SQLite) path for a given profile ID and channel.
 */
export function getProfileStatePath(profileId: string, channel: Channel = 'stable'): string {
  return getChannelPaths(channel).profileStateTemplate.replace('{profileId}', profileId);
}

/**
 * Get the profile logs directory for a given profile ID and channel.
 */
export function getProfileLogsPath(profileId: string, channel: Channel = 'stable'): string {
  return getChannelPaths(channel).profileLogsTemplate.replace('{profileId}', profileId);
}

/**
 * Get the profile cache directory for a given profile ID and channel.
 */
export function getProfileCachePath(profileId: string, channel: Channel = 'stable'): string {
  return getChannelPaths(channel).profileCacheTemplate.replace('{profileId}', profileId);
}

/**
 * Validate that a profile ID is safe (no path traversal).
 */
export function isValidProfileId(profileId: string): boolean {
  // Only alphanumeric, dash, underscore; no path separators
  return /^[a-zA-Z0-9_-]+$/.test(profileId) && profileId.length > 0 && profileId.length <= 64;
}

/**
 * Generate a new profile ID (UUID v4 without hyphens, or timestamp-based).
 */
export function generateProfileId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback for non-browser environments
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Tauri-specific: invoke native path resolution.
 * This should be used in Tauri context to get actual native paths.
 */
export async function resolveNativePaths(channel: Channel = 'stable'): Promise<ChannelPaths> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    // Not in Tauri — return computed paths
    return getChannelPaths(channel);
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ChannelPaths>('resolve_native_paths', { channel });
}
