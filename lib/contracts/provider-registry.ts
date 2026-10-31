/**
 * Provider Registry Contracts — Versioned schemas for provider connections,
 * credentials, and settings. Shared by CLI, desktop, and web.
 *
 * Version 1 (2026-10-31): Initial contracts for Slice 1.
 * All changes are additive; breaking changes require a new major version.
 */

// ============================================================================
// Versioning
// ============================================================================

export const CONTRACT_VERSION = 1 as const;
export type ContractVersion = 1;

// ============================================================================
// Provider Kinds (must match Rust ProviderKind exactly)
// ============================================================================

export type ProviderKind =
  | 'nvidia-nim-managed'   // Lattice-managed NVIDIA NIM gateway
  | 'nvidia-nim-personal'  // Personal NVIDIA NIM API key
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'huggingface'
  | 'local';               // Local model endpoint

export const PROVIDER_KINDS: ProviderKind[] = [
  'nvidia-nim-managed',
  'nvidia-nim-personal',
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'huggingface',
  'local',
] as const;

export function isProviderKind(value: string): value is ProviderKind {
  return PROVIDER_KINDS.includes(value as ProviderKind);
}

// ============================================================================
// Credential Kinds
// ============================================================================

export type CredentialKind =
  | 'api-key'
  | 'refresh-token'
  | 'local-endpoint';

export const CREDENTIAL_KINDS: CredentialKind[] = [
  'api-key',
  'refresh-token',
  'local-endpoint',
] as const;

export function isCredentialKind(value: string): value is CredentialKind {
  return CREDENTIAL_KINDS.includes(value as CredentialKind);
}

// ============================================================================
// Credential Reference (opaque — never contains secret material)
// ============================================================================

export interface CredentialRef {
  id: string;              // Storage key: "provider:kind[:suffix]"
  label: string;           // Human-readable label
  createdAt: string;       // ISO8601
  updatedAt: string;       // ISO8601
  metadata: Record<string, string>;
}

export interface CredentialStatus {
  reference: CredentialRef;
  isValid: boolean;
  lastVerified: string | null;
}

// ============================================================================
// Provider Connection (what the user configures)
// ============================================================================

export interface ProviderConnection {
  id: string;                    // Unique connection ID (UUID)
  kind: ProviderKind;            // Provider kind
  label: string;                 // User-facing label
  isDefault: boolean;            // Default for new conversations
  credentials: CredentialRef[];  // References to stored credentials
  config: ProviderConfig;        // Provider-specific config
  createdAt: string;             // ISO8601
  updatedAt: string;             // ISO8601
  version: ContractVersion;      // Schema version
}

// Provider-specific configuration
export type ProviderConfig =
  | NvidiaNimManagedConfig
  | NvidiaNimPersonalConfig
  | OpenAIConfig
  | AnthropicConfig
  | GoogleConfig
  | OpenRouterConfig
  | HuggingFaceConfig
  | LocalEndpointConfig;

export interface BaseProviderConfig {
  // Common fields
  timeoutMs?: number;
  maxRetries?: number;
}

export interface NvidiaNimManagedConfig extends BaseProviderConfig {
  kind: 'nvidia-nim-managed';
  // No API key — uses Lattice gateway auth
  workspaceId?: string;
  entitlements?: string[];
}

export interface NvidiaNimPersonalConfig extends BaseProviderConfig {
  kind: 'nvidia-nim-personal';
  baseUrl?: string;              // Override default NIM endpoint
  modelId?: string;              // Default model for this connection
}

export interface OpenAIConfig extends BaseProviderConfig {
  kind: 'openai';
  baseUrl?: string;
  organizationId?: string;
  modelId?: string;
}

export interface AnthropicConfig extends BaseProviderConfig {
  kind: 'anthropic';
  baseUrl?: string;
  modelId?: string;
}

export interface GoogleConfig extends BaseProviderConfig {
  kind: 'google';
  baseUrl?: string;
  modelId?: string;
}

export interface OpenRouterConfig extends BaseProviderConfig {
  kind: 'openrouter';
  baseUrl?: string;
  modelId?: string;
  referer?: string;
  title?: string;
}

export interface HuggingFaceConfig extends BaseProviderConfig {
  kind: 'huggingface';
  baseUrl?: string;
  modelId?: string;
}

export interface LocalEndpointConfig extends BaseProviderConfig {
  kind: 'local';
  endpointUrl: string;           // Required for local endpoints
  modelId: string;               // Required for local endpoints
  compatibleModels?: string[];   // Models available at this endpoint
  strictLocalMode?: boolean;     // Disable cloud fallback
}

// ============================================================================
// Model Catalog (approved/discovered models)
// ============================================================================

export interface ModelCapabilities {
  tools: boolean;
  streaming: boolean;
  reasoning: boolean;
  vision: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface ModelCatalogEntry {
  id: string;                    // e.g., "nvidia/nemotron-3-ultra-550b-a55b"
  providerKind: ProviderKind;
  displayName: string;
  capabilities: ModelCapabilities;
  deprecated?: boolean;
  availability: 'available' | 'limited' | 'unavailable';
  billing: 'lattice-managed' | 'user-billed' | 'local';
}

export interface ModelCatalog {
  version: ContractVersion;
  updatedAt: string;             // ISO8601
  models: ModelCatalogEntry[];
}

// ============================================================================
// Profile Settings (per-profile config.json)
// ============================================================================

export interface ProfileSettings {
  version: ContractVersion;
  profileId: string;
  defaultConnectionId: string | null;  // Default provider connection
  connections: ProviderConnection[];
  ui: UISettings;
  privacy: PrivacySettings;
  advanced: AdvancedSettings;
}

export interface UISettings {
  theme: 'system' | 'light' | 'dark';
  compactMode: boolean;
  showReasoning: boolean;
  streamChunks: boolean;
}

export interface PrivacySettings {
  telemetryOptIn: boolean;
  conversationRetentionDays: number | null;  // null = forever
  memoryRetentionDays: number | null;
  webSyncEnabled: boolean;           // Explicit opt-in for web sync
}

export interface AdvancedSettings {
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  maxConcurrentStreams: number;
  requestTimeoutMs: number;
  enableExperimentalFeatures: boolean;
}

// ============================================================================
// CLI Command Registry (slash commands)
// ============================================================================

export interface CLICommand {
  name: string;                    // e.g., "/setup"
  description: string;
  category: 'setup' | 'account' | 'provider' | 'model' | 'workspace' | 'session' | 'memory' | 'status' | 'help';
  requiresAuth: boolean;
  args: CLICommandArg[];
}

export interface CLICommandArg {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'choice' | 'boolean';
  choices?: string[];
}

// Pre-defined slash commands (matching the design doc)
export const CLI_COMMANDS: CLICommand[] = [
  { name: '/setup', description: 'First-run setup wizard', category: 'setup', requiresAuth: false, args: [] },
  { name: '/login', description: 'Sign into Lattice account', category: 'account', requiresAuth: false, args: [] },
  { name: '/logout', description: 'Sign out of Lattice account', category: 'account', requiresAuth: true, args: [] },
  { name: '/provider', description: 'Manage provider connections', category: 'provider', requiresAuth: true, args: [] },
  { name: '/key add', description: 'Add or replace API key (masked input)', category: 'provider', requiresAuth: true, args: [
    { name: '<provider>', description: 'Provider kind', required: true, type: 'choice', choices: PROVIDER_KINDS.filter(k => k !== 'nvidia-nim-managed' && k !== 'local') },
  ]},
  { name: '/models', description: 'List available models on selected connection', category: 'model', requiresAuth: true, args: [] },
  { name: '/model', description: 'Change current conversation model', category: 'model', requiresAuth: true, args: [
    { name: '<id>', description: 'Model ID', required: true, type: 'string' },
  ]},
  { name: '/model default', description: 'Set default model for new conversations', category: 'model', requiresAuth: true, args: [
    { name: '<id>', description: 'Model ID', required: true, type: 'string' },
  ]},
  { name: '/workspace', description: 'Select workspace folder', category: 'workspace', requiresAuth: true, args: [] },
  { name: '/sessions', description: 'List conversation sessions', category: 'session', requiresAuth: true, args: [] },
  { name: '/resume', description: 'Resume a session', category: 'session', requiresAuth: true, args: [
    { name: '<id>', description: 'Session ID', required: true, type: 'string' },
  ]},
  { name: '/memory', description: 'View/manage local memory', category: 'memory', requiresAuth: true, args: [] },
  { name: '/status', description: 'Show profile, route, model, health', category: 'status', requiresAuth: true, args: [] },
  { name: '/doctor', description: 'Run diagnostics', category: 'status', requiresAuth: true, args: [
    { name: '--paid-probe', description: 'Run paid API probe (requires consent)', required: false, type: 'boolean' },
  ]},
  { name: '/help', description: 'Show command palette', category: 'help', requiresAuth: false, args: [] },
] as const;

// ============================================================================
// Runtime Status (for /status and desktop indicator)
// ============================================================================

export interface RuntimeStatus {
  profileId: string;
  activeConnection: ProviderConnection | null;
  activeModel: string | null;
  dataDestination: 'lattice-gateway' | 'provider-direct' | 'local-endpoint';
  accountStatus: 'signed-in' | 'signed-out' | 'expired';
  credentialStatus: Record<string, CredentialStatus>;
  serviceHealth: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;               // ISO8601
}

// ============================================================================
// Diagnostics (for /doctor)
// ============================================================================

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticReport {
  version: ContractVersion;
  timestamp: string;
  checks: DiagnosticCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
}

// ============================================================================
// Native Path Resolution
// ============================================================================

export interface DevicePaths {
  // Stable channel
  stableRoot: string;              // e.g., %LOCALAPPDATA%\xyz.gen1e.lattice-os\
  profilesRoot: string;            // stableRoot\profiles\
  profileConfigTemplate: string;   // profilesRoot\<id>\config.json (with {profileId} placeholder)
  profileStateTemplate: string;    // profilesRoot\<id>\state.sqlite (with {profileId} placeholder)
  profileLogsTemplate: string;     // profilesRoot\<id>\logs\ (with {profileId} placeholder)
  profileCacheTemplate: string;    // profilesRoot\<id>\cache\ (with {profileId} placeholder)

  // Preview channel (separate root)
  previewRoot: string;             // e.g., %LOCALAPPDATA%\xyz.gen1e.lattice-os.preview\
  previewProfilesRoot: string;
  previewProfileConfigTemplate: string;
  previewProfileStateTemplate: string;
  previewProfileLogsTemplate: string;
  previewProfileCacheTemplate: string;
}

export function resolveDevicePaths(appName: string = 'xyz.gen1e.lattice-os'): DevicePaths {
  const isWindows = process.platform === 'win32';
  const base = isWindows
    ? process.env.LOCALAPPDATA || process.env.APPDATA || ''
    : process.env.HOME || '';

  const stableRoot = isWindows
    ? `${base}\\${appName}\\`
    : `${base}/.local/share/${appName}/`;

  const previewRoot = isWindows
    ? `${base}\\${appName}.preview\\`
    : `${base}/.local/share/${appName}.preview/`;

  const makePaths = (root: string) => ({
    root,
    profilesRoot: `${root}profiles/`,
    profileConfigTemplate: `${root}profiles/{profileId}/config.json`,
    profileStateTemplate: `${root}profiles/{profileId}/state.sqlite`,
    profileLogsTemplate: `${root}profiles/{profileId}/logs/`,
    profileCacheTemplate: `${root}profiles/{profileId}/cache/`,
  });

  return {
    stableRoot,
    ...makePaths(stableRoot),
    previewRoot,
    previewProfilesRoot: `${previewRoot}profiles/`,
    previewProfileConfigTemplate: `${previewRoot}profiles/{profileId}/config.json`,
    previewProfileStateTemplate: `${previewRoot}profiles/{profileId}/state.sqlite`,
    previewProfileLogsTemplate: `${previewRoot}profiles/{profileId}/logs/`,
    previewProfileCacheTemplate: `${previewRoot}profiles/{profileId}/cache/`,
  };
}

// ============================================================================
// Credential Broker IPC Types (match Rust BrokerCommand/BrokerResponse)
// ============================================================================

export type BrokerCommand =
  | { action: 'store-api-key'; provider: ProviderKind; apiKey: string; label: string; metadata?: Record<string, string>; suffix?: string }
  | { action: 'update-api-key'; provider: ProviderKind; apiKey: string; suffix?: string }
  | { action: 'get-api-key-status'; provider: ProviderKind; suffix?: string }
  | { action: 'delete-api-key'; provider: ProviderKind; suffix?: string }
  | { action: 'list-provider-credentials'; provider: ProviderKind }
  | { action: 'store-refresh-token'; provider: ProviderKind; token: string; label: string; suffix?: string }
  | { action: 'get-refresh-token-status'; provider: ProviderKind; suffix?: string }
  | { action: 'delete-refresh-token'; provider: ProviderKind; suffix?: string }
  | { action: 'store-local-endpoint'; provider: ProviderKind; endpointUrl: string; modelId: string; label: string; suffix?: string }
  | { action: 'get-local-endpoint-status'; provider: ProviderKind; suffix?: string }
  | { action: 'get-local-endpoint'; provider: ProviderKind; suffix?: string }
  | { action: 'delete-local-endpoint'; provider: ProviderKind; suffix?: string };

export type BrokerResponse =
  | { status: 'ok'; reference: CredentialRef }
  | { status: 'status'; statusValue: CredentialStatus }
  | { status: 'config'; endpointUrl: string; modelId: string }
  | { status: 'list'; credentials: CredentialRef[] }
  | { status: 'deleted' }
  | { status: 'error'; code: string; message: string };

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateProviderConnection(conn: unknown): conn is ProviderConnection {
  if (!conn || typeof conn !== 'object') return false;
  const c = conn as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    isProviderKind(c.kind as string) &&
    typeof c.label === 'string' &&
    typeof c.isDefault === 'boolean' &&
    Array.isArray(c.credentials) &&
    typeof c.createdAt === 'string' &&
    typeof c.updatedAt === 'string' &&
    c.version === CONTRACT_VERSION
  );
}

export function validateProfileSettings(settings: unknown): settings is ProfileSettings {
  if (!settings || typeof settings !== 'object') return false;
  const s = settings as Record<string, unknown>;
  return (
    s.version === CONTRACT_VERSION &&
    typeof s.profileId === 'string' &&
    (s.defaultConnectionId === null || typeof s.defaultConnectionId === 'string') &&
    Array.isArray(s.connections) &&
    s.connections.every(validateProviderConnection) &&
    typeof s.ui === 'object' &&
    typeof s.privacy === 'object' &&
    typeof s.advanced === 'object'
  );
}

// ============================================================================
// Migration Helpers (for future versions)
// ============================================================================

export interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate: (data: unknown) => unknown;
}

export const MIGRATIONS: MigrationStep[] = [
  // Future migrations go here
];