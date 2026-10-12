// lib/intelligence/execution/vdi/contracts.ts
// VDI-0: Desktop Broker & VM Lifecycle Contracts
//
// Locked invariants (mirror ExecutionRuntime pattern):
//   UCOL expresses a DesktopRequirement.
//   Deterministic policy resolves it against REGISTERED providers (Daytona/Kasm/KubeVirt).
//   Adapters provision; nothing in contracts calls them.
//   Evidence records what actually happened — provider state is NOT policy truth.
//   Tenant/workspace ownership is enforced at every boundary.
//   Reconciliation: timed-out provisioning cannot create duplicate VMs.

import { z } from 'zod';
import type { RuntimeType, RuntimePersistence } from '../contracts';

// ── Tenant/Workspace ownership (every VDI resource carries this) ──────────

export interface TenantScope {
  tenantId: string;
  workspaceId: string;
}

// ── Desktop Specification ────────────────────────────────────────────────

export const DesktopRuntimeTypeSchema = z.enum([
  'linux_vm',
  'windows_vm',
  'macos',
  // VDI-2 closure correction (live-verified 2026-10-11): this org provisions
  // sandboxClass 'container' only. Providers advertise what they actually run;
  // resolveRuntime abstains (runtime_type_unavailable) when a requirement asks
  // for a class the provider does not provide — a container must never
  // silently satisfy a linux_vm request. VM eligibility is enabled separately
  // after its capabilities are verified.
  'container',
]);
export type DesktopRuntimeType = z.infer<typeof DesktopRuntimeTypeSchema>;

export const DesktopPersistenceSchema = z.enum(['task', 'workspace', 'personal']);
export type DesktopPersistence = z.infer<typeof DesktopPersistenceSchema>;

export const DesktopPhaseSchema = z.enum([
  'provisioning',
  'ready',
  'degraded',
  'suspending',
  'suspended',
  'destroying',
  'destroyed',
  'failed',
  'quarantined',
]);
export type DesktopPhase = z.infer<typeof DesktopPhaseSchema>;

export interface DesktopSpec {
  runtimeType: DesktopRuntimeType;
  persistence: DesktopPersistence;
  /** Resource ceiling; provider maps to actual VM size. */
  memoryMb?: number;
  cpuShares?: number;
  storageGb?: number;
  /** Image version to boot — must exist in ImageRegistry. */
  imageVersion: string;
  /** Files/env to seed the desktop with. Provider owns transport. */
  seedFiles?: Array<{ path: string; content: string }>;
  env?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface Desktop extends TenantScope {
  desktopId: string;
  spec: DesktopSpec;
  /** Provider-assigned identity (e.g., Daytona sandbox ID, KubeVirt VM name). */
  providerId: string;
  /** Provider type for routing: 'daytona' | 'kasm' | 'kubevirt'. */
  provider: string;
  phase: DesktopPhase;
  createdAt: string;
  /** Resume key for persistent desktops — provider-specific. */
  resumeKey?: string;
  /** Human session lease (if any). */
  sessionLease?: DesktopSessionLease;
  /** Agent execution lease (if any). */
  executionLease?: ExecutionLease;
}

// ── Session & Execution Leases (prevent premature suspension) ────────────

export interface DesktopSessionLease {
  sessionId: string;
  userId: string;
  grantedAt: string;
  expiresAt: string;
  /** Connection grant token for the streaming viewer. */
  connectionGrant: string;
}

export interface ExecutionLease {
  executionId: string;
  agentId: string;
  grantedAt: string;
  expiresAt: string;
}

// ── Desktop Broker Surface (provider-neutral) ────────────────────────────

/**
 * The ONLY desktop lifecycle surface. Six operations mirroring ExecutionRuntime
 * plus session/lease management. Providers implement; contracts never call.
 */
export interface DesktopBroker {
  readonly id: string;
  readonly capabilities: DesktopCapabilities;

  /** Provision a new desktop per spec. Idempotent on (tenant, workspace, spec). */
  create(spec: DesktopSpec, scope: TenantScope): Promise<Desktop>;

  /** Resume a suspended persistent desktop. */
  resume(desktopId: string, scope: TenantScope): Promise<Desktop>;

  /** Execute an action inside the desktop (shell, file, http). */
  execute(desktopId: string, action: DesktopAction, scope: TenantScope): Promise<ActionResult>;

  /** Create a restorable snapshot. */
  snapshot(desktopId: string, scope: TenantScope): Promise<DesktopSnapshot>;

  /** Suspend — preserves state for persistent desktops. */
  suspend(desktopId: string, scope: TenantScope): Promise<void>;

  /** Destroy — idempotent, releases all resources. */
  destroy(desktopId: string, scope: TenantScope): Promise<void>;

  /** Grant a human session lease (browser streaming viewer). */
  grantSession(desktopId: string, userId: string, ttlMs: number, scope: TenantScope): Promise<DesktopSessionLease>;

  /** Revoke a human session lease. */
  revokeSession(desktopId: string, sessionId: string, scope: TenantScope): Promise<void>;

  /** Grant an agent execution lease. */
  grantExecution(desktopId: string, agentId: string, ttlMs: number, scope: TenantScope): Promise<ExecutionLease>;

  /** Revoke an agent execution lease. */
  revokeExecution(desktopId: string, executionId: string, scope: TenantScope): Promise<void>;

  /** Get current desktop state (authoritative provider read). */
  get(desktopId: string, scope: TenantScope): Promise<Desktop | null>;

  /** List desktops for a workspace. */
  list(scope: TenantScope): Promise<Desktop[]>;
}

export interface DesktopCapabilities {
  runtimeTypes: readonly DesktopRuntimeType[];
  persistenceScopes: readonly DesktopPersistence[];
  durableSuspend: boolean;
  snapshots: boolean;
  /** Max concurrent desktops per workspace. */
  maxDesktopsPerWorkspace?: number;
  /** Supported session protocols: 'vnc' | 'webvnc' | 'rdp' | 'kasm'. */
  sessionProtocols: readonly string[];
}

export type DesktopAction =
  | { kind: 'shell'; command: string; timeoutMs?: number }
  | { kind: 'file_read'; path: string }
  | { kind: 'file_write'; path: string; content: string }
  | { kind: 'http'; url: string; method?: string; body?: string }
  | { kind: 'screenshot'; path?: string };

export interface ActionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface DesktopSnapshot {
  snapshotId: string;
  desktopId: string;
  createdAt: string;
}

// ── Health & Capacity ────────────────────────────────────────────────────

export interface DesktopHealth {
  desktopId: string;
  providerId: string;
  phase: DesktopPhase;
  /** Infrastructure signals. */
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
  /** Session delivery signals. */
  brokerLatencyMs?: number;
  connectionSuccessRate?: number;
  gatewayHealthy?: boolean;
  /** Agent operations signals. */
  stuckOperations?: number;
  recentFailures?: number;
  /** Security signals. */
  permissionDenials?: number;
  abnormalEgress?: boolean;
  /** Last successful health check. */
  checkedAt: string;
}

export interface DesktopCapacity {
  tenantId: string;
  totalDesktops: number;
  readyDesktops: number;
  suspendedDesktops: number;
  degradedDesktops: number;
  provisioningDesktops: number;
  /** Provider-reported capacity ceiling. */
  providerCapacityLimit?: number;
  /** Running hours for financial tracking. */
  runningHours: number;
  /** Budget utilization (0-1). */
  budgetUtilization?: number;
}

// ── Image Registry ───────────────────────────────────────────────────────

export const ImageStatusSchema = z.enum([
  'building',
  'scanning',
  'staged',
  'promoted',
  'deprecated',
  'failed',
]);
export type ImageStatus = z.infer<typeof ImageStatusSchema>;

export interface DesktopImage {
  imageId: string;
  version: string;
  runtimeType: DesktopRuntimeType;
  /** Provider-specific image reference (AMI, Daytona image, KubeVirt PVC, etc.). */
  providerRef: Record<string, string>;
  status: ImageStatus;
  /** Vulnerability scan result. */
  scanResult?: {
    passed: boolean;
    criticalCount: number;
    highCount: number;
    scannedAt: string;
  };
  /** Contract test result. */
  contractTestResult?: {
    passed: boolean;
    testedAt: string;
  };
  createdAt: string;
  promotedAt?: string;
  deprecatedAt?: string;
}

export interface ImageRegistry {
  /** Register a new image version. */
  register(image: Omit<DesktopImage, 'imageId' | 'createdAt'>): Promise<DesktopImage>;

  /** Get image by version. */
  get(version: string): Promise<DesktopImage | null>;

  /** Promote staged image to production. */
  promote(version: string): Promise<void>;

  /** Deprecate an image version. */
  deprecate(version: string): Promise<void>;

  /** List images for a runtime type. */
  list(runtimeType: DesktopRuntimeType): Promise<DesktopImage[]>;
}

// ── Reconciliation Proof (VDI-0 requirement) ─────────────────────────────

/**
 * Reconciliation invariant: a timed-out provisioning request CANNOT create
 * duplicate VMs. The provider MUST support idempotent create on a
 * client-generated operation key.
 */
export interface ProvisioningOperationKey {
  operationKey: string; // e.g., "vdi:create:tenant:workspace:spec-hash:v1"
  tenantId: string;
  workspaceId: string;
  specHash: string;
  requestedAt: string;
}

/**
 * Provider MUST implement this check before any create:
 * - If operationKey exists and is COMPLETED → return existing desktop
 * - If operationKey exists and is IN_PROGRESS → wait or return conflict
 * - If operationKey does not exist → create with this key, record outcome
 */
export interface IdempotentProvisioner {
  /** Check if an operation key has a recorded outcome. */
  checkOperationKey(key: string): Promise<{ desktopId: string } | { status: 'in_progress' } | null>;

  /** Record the outcome of a provisioning operation. */
  recordOperationKey(key: string, outcome: { desktopId: string } | { error: string } | { status: 'in_progress' }): Promise<void>;
}

// ── Policy ────────────────────────────────────────────────────────────────

export interface DesktopPolicy {
  /** Max idle time before suspend (ms) — requires NO session lease AND NO execution lease. */
  maxIdleMs: number;
  /** Max desktop lifetime (ms) — hard limit. */
  maxLifetimeMs?: number;
  /** Default desktop spec for a workspace. */
  defaultSpec?: Partial<DesktopSpec>;
  /** Allowed image versions. */
  allowedImageVersions?: string[];
  /** Network egress policy. */
  egressPolicy?: 'allow_all' | 'deny_all' | 'allowlist' | 'denylist';
  /** Allowed egress destinations (if allowlist). */
  egressAllowlist?: string[];
}

// ── Pure Helpers ──────────────────────────────────────────────────────────

/** Stable spec hash for operation keys and deduplication. */
export function hashDesktopSpec(spec: DesktopSpec): string {
  let h = 5381;
  const str = JSON.stringify(spec, Object.keys(spec).sort());
  for (let i = 0; i < str.length; i += 1) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/** Determine if a desktop can be safely suspended. */
export function canSuspend(desktop: Desktop): boolean {
  // Must have NO active human session lease
  if (desktop.sessionLease && new Date(desktop.sessionLease.expiresAt) > new Date()) {
    return false;
  }
  // Must have NO active agent execution lease
  if (desktop.executionLease && new Date(desktop.executionLease.expiresAt) > new Date()) {
    return false;
  }
  return true;
}

/** Check if a desktop is idle (no leases). */
export function isIdle(desktop: Desktop): boolean {
  return canSuspend(desktop);
}

/** Generate a provisioning operation key. */
export function makeProvisioningOperationKey(
  tenantId: string,
  workspaceId: string,
  spec: DesktopSpec,
): string {
  const specHash = hashDesktopSpec(spec);
  return `vdi:create:${tenantId}:${workspaceId}:${specHash}:v1`;
}