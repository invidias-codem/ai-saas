/**
 * Profile Settings Manager — Loads, validates, and saves profile configuration.
 * Uses the versioned contracts and integrates with the credential broker.
 */

import {
  ProfileSettings,
  ProviderConnection,
  ProviderKind,
  CredentialRef,
  CONTRACT_VERSION,
  validateProfileSettings,
  validateProviderConnection,
} from '@/lib/contracts/provider-registry';
import { credentialBroker } from '@/lib/credentials/credential-broker-client';
import { getProfileConfigPath, isValidProfileId, generateProfileId } from '@/lib/native/path-resolution';
import { invoke } from '@tauri-apps/api/core';

export interface ProfileManagerOptions {
  profileId: string;
  channel?: 'stable' | 'preview';
}

export class ProfileManager {
  private readonly _profileId: string;
  private readonly _channel: 'stable' | 'preview';
  private settings: ProfileSettings | null = null;
  private listeners: Set<(settings: ProfileSettings) => void> = new Set();

  constructor(options: ProfileManagerOptions) {
    if (!isValidProfileId(options.profileId)) {
      throw new Error(`Invalid profile ID: ${options.profileId}`);
    }
    this._profileId = options.profileId;
    this._channel = options.channel ?? 'stable';
  }

  get profileId(): string {
    return this._profileId;
  }

  get channel(): 'stable' | 'preview' {
    return this._channel;
  }

  get currentSettings(): ProfileSettings | null {
    return this.settings;
  }

  /** Subscribe to settings changes */
  subscribe(listener: (settings: ProfileSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    if (this.settings) {
      this.listeners.forEach(l => l(this.settings!));
    }
  }

  /** Load settings from disk (Tauri) or return defaults */
  async load(): Promise<ProfileSettings> {
    try {
      // Try to load from Tauri native side
      const configPath = getProfileConfigPath(this._profileId, this._channel);
      const result = await invoke<ProfileSettings | null>('load_profile_config', {
        path: configPath,
      });

      if (result && validateProfileSettings(result)) {
        this.settings = result;
      } else {
        this.settings = this.createDefaultSettings();
      }
    } catch {
      // Fallback to defaults if native load fails
      this.settings = this.createDefaultSettings();
    }

    this.notify();
    return this.settings!;
  }

  /** Save settings to disk (Tauri) */
  async save(): Promise<void> {
    if (!this.settings) {
      throw new Error('No settings to save');
    }

    // Validate before saving
    if (!validateProfileSettings(this.settings)) {
      throw new Error('Invalid settings structure');
    }

    // Update timestamp by creating new settings object
    this.settings = {
      ...this.settings,
      // updatedAt doesn't exist in ProfileSettings, it's on connections
    };

    const configPath = getProfileConfigPath(this._profileId, this._channel);
    await invoke('save_profile_config', {
      path: configPath,
      settings: this.settings,
    });

    this.notify();
  }

  /** Create default settings for a new profile */
  private createDefaultSettings(): ProfileSettings {
    const now = new Date().toISOString();
    return {
      version: CONTRACT_VERSION,
      profileId: this._profileId,
      defaultConnectionId: null,
      connections: [],
      ui: {
        theme: 'system',
        compactMode: false,
        showReasoning: true,
        streamChunks: true,
      },
      privacy: {
        telemetryOptIn: false,
        conversationRetentionDays: null,
        memoryRetentionDays: null,
        webSyncEnabled: false,
      },
      advanced: {
        logLevel: 'info',
        maxConcurrentStreams: 4,
        requestTimeoutMs: 120000,
        enableExperimentalFeatures: false,
      },
    };
  }

  // --- Connection Management ---

  /** Get all provider connections */
  getConnections(): ProviderConnection[] {
    return this.settings?.connections ?? [];
  }

  /** Get a connection by ID */
  getConnection(id: string): ProviderConnection | undefined {
    return this.settings?.connections.find(c => c.id === id);
  }

  /** Get the default connection */
  getDefaultConnection(): ProviderConnection | null {
    if (!this.settings?.defaultConnectionId) return null;
    return this.getConnection(this.settings.defaultConnectionId) ?? null;
  }

  /** Add or update a provider connection */
  async upsertConnection(connection: ProviderConnection): Promise<void> {
    if (!this.settings) throw new Error('Settings not loaded');

    if (!validateProviderConnection(connection)) {
      throw new Error('Invalid provider connection');
    }

    // Ensure version is current
    const updatedConnection = {
      ...connection,
      version: CONTRACT_VERSION,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = this.settings.connections.findIndex(c => c.id === connection.id);
    if (existingIndex >= 0) {
      this.settings.connections[existingIndex] = updatedConnection;
    } else {
      this.settings.connections.push(updatedConnection);
    }

    await this.save();
  }

  /** Remove a provider connection */
  async removeConnection(id: string): Promise<void> {
    if (!this.settings) throw new Error('Settings not loaded');

    // Also delete associated credentials from the broker
    const connection = this.getConnection(id);
    if (connection) {
      for (const credRef of connection.credentials) {
        // Extract provider and kind from credential ID
        const parts = credRef.id.split(':');
        if (parts.length >= 2) {
          const provider = parts[0] as ProviderKind;
          const kind = parts[1] as 'api-key' | 'refresh-token' | 'local-endpoint';
          try {
            if (kind === 'api-key') await credentialBroker.deleteApiKey(provider);
            else if (kind === 'refresh-token') await credentialBroker.deleteRefreshToken(provider);
            else if (kind === 'local-endpoint') await credentialBroker.deleteLocalEndpoint(provider);
          } catch {
            // Credential might not exist; continue cleanup
          }
        }
      }
    }

    this.settings.connections = this.settings.connections.filter(c => c.id !== id);

    // Clear default if it was the removed connection
    if (this.settings.defaultConnectionId === id) {
      this.settings.defaultConnectionId = null;
    }

    await this.save();
  }

  /** Set the default connection */
  async setDefaultConnection(id: string | null): Promise<void> {
    if (!this.settings) throw new Error('Settings not loaded');
    if (id && !this.getConnection(id)) {
      throw new Error(`Connection not found: ${id}`);
    }
    this.settings.defaultConnectionId = id;
    await this.save();
  }

  /** Create a new provider connection with credentials */
  async createConnection(
    kind: ProviderKind,
    label: string,
    credentials: { apiKey?: string; refreshToken?: string; endpointUrl?: string; modelId?: string },
    config: Record<string, unknown> = {}
  ): Promise<ProviderConnection> {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const credentialRefs: CredentialRef[] = [];

    // Store credentials in the broker
    if (credentials.apiKey) {
      const ref = await credentialBroker.storeApiKey(kind, credentials.apiKey, `${label} API Key`);
      credentialRefs.push(ref);
    }
    if (credentials.refreshToken) {
      const ref = await credentialBroker.storeRefreshToken(kind, credentials.refreshToken, `${label} Refresh Token`);
      credentialRefs.push(ref);
    }
    if (credentials.endpointUrl && credentials.modelId) {
      const ref = await credentialBroker.storeLocalEndpoint(kind, credentials.endpointUrl, credentials.modelId, `${label} Local Endpoint`);
      credentialRefs.push(ref);
    }

    const connection: ProviderConnection = {
      id: connectionId,
      kind,
      label,
      isDefault: this.settings?.connections.length === 0, // First connection is default
      credentials: credentialRefs,
      config: { kind, ...config } as any, // Type narrowed by kind
      createdAt: now,
      updatedAt: now,
      version: CONTRACT_VERSION,
    };

    await this.upsertConnection(connection);
    return connection;
  }

  // --- Settings Accessors ---

  getUISettings() {
    return this.settings?.ui ?? this.createDefaultSettings().ui;
  }

  getPrivacySettings() {
    return this.settings?.privacy ?? this.createDefaultSettings().privacy;
  }

  getAdvancedSettings() {
    return this.settings?.advanced ?? this.createDefaultSettings().advanced;
  }

  async updateUISettings(ui: Partial<ProfileSettings['ui']>): Promise<void> {
    if (!this.settings) throw new Error('Settings not loaded');
    this.settings.ui = { ...this.settings.ui, ...ui };
    await this.save();
  }

  async updatePrivacySettings(privacy: Partial<ProfileSettings['privacy']>): Promise<void> {
    if (!this.settings) throw new Error('Settings not loaded');
    this.settings.privacy = { ...this.settings.privacy, ...privacy };
    await this.save();
  }

  async updateAdvancedSettings(advanced: Partial<ProfileSettings['advanced']>): Promise<void> {
    if (!this.settings) throw new Error('Settings not loaded');
    this.settings.advanced = { ...this.settings.advanced, ...advanced };
    await this.save();
  }
}

/** Create a new profile with a generated ID */
export async function createProfile(channel: 'stable' | 'preview' = 'stable'): Promise<ProfileManager> {
  const profileId = generateProfileId();
  const manager = new ProfileManager({ profileId, channel });
  await manager.load(); // Creates default settings
  return manager;
}

/** List all profile IDs for a channel */
export async function listProfiles(channel: 'stable' | 'preview' = 'stable'): Promise<string[]> {
  try {
    const { getChannelPaths } = await import('@/lib/native/path-resolution');
    const paths = getChannelPaths(channel);
    const result = await invoke<string[]>('list_profiles', { profilesRoot: paths.profilesRoot });
    return result.filter(isValidProfileId);
  } catch {
    return [];
  }
}