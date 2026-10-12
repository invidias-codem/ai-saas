// lib/vdi/store/memoryDesktopStore.ts
// In-memory implementation of desktop store for testing

import type {
  VdiDesktopRow,
  VdiSessionLeaseRow,
  VdiExecutionLeaseRow,
  VdiConnectionGrantRow,
  VdiInputControlLeaseRow,
  VdiOperationKeyRow,
  VdiEvidenceRow,
} from '@/lib/vdi/store/desktopStore';
import type { TenantScope, DesktopSpec, DesktopPhase, Desktop, DesktopSessionLease, ExecutionLease, DesktopSnapshot } from '@/lib/intelligence/execution/vdi/contracts';

const desktops = new Map<string, VdiDesktopRow>();
const sessionLeases = new Map<string, VdiSessionLeaseRow>(); // key: desktopId:userId
const executionLeases = new Map<string, VdiExecutionLeaseRow>(); // key: desktopId:agentId
const connectionGrants = new Map<string, VdiConnectionGrantRow>(); // key: grantToken
const inputControlLeases = new Map<string, VdiInputControlLeaseRow>(); // key: desktopId
const operationKeys = new Map<string, VdiOperationKeyRow>();
const evidence = new Map<string, VdiEvidenceRow[]>(); // key: desktopId

let generationCounter = 1;

export function resetMemoryStore() {
  desktops.clear();
  sessionLeases.clear();
  executionLeases.clear();
  connectionGrants.clear();
  inputControlLeases.clear();
  operationKeys.clear();
  evidence.clear();
  observations.clear();
  alerts.clear();
  usage.length = 0;
  usageKeys.clear();
  remediationAttempts.clear();
  remediationOps.clear();
  budgetReservations.clear();
  remediationOpOwners.clear();
  budgets.clear();
  generationCounter = 1;
}

function nextGeneration(): number {
  return generationCounter++;
}

function getDesktopKey(desktopId: string, scope: TenantScope): string {
  return `${scope.tenantId}:${scope.workspaceId}:${desktopId}`;
}

export async function createDesktop(args: {
  desktopId: string;
  spec: DesktopSpec;
  scope: TenantScope;
  provider: string;
  providerId: string;
  providerRegion?: string | null;
  operationKey?: string | null;
  specHash: string;
}): Promise<VdiDesktopRow> {
  const now = new Date().toISOString();
  const row: VdiDesktopRow = {
    id: `uuid-${Date.now()}`,
    desktop_id: args.desktopId,
    tenant_id: args.scope.tenantId,
    workspace_id: args.scope.workspaceId,
    generation: 1,
    provider: args.provider,
    provider_id: args.providerId,
    provider_region: args.providerRegion ?? null,
    runtime_type: args.spec.runtimeType,
    persistence: args.spec.persistence,
    image_version: args.spec.imageVersion,
    memory_mb: args.spec.memoryMb ?? null,
    cpu_shares: args.spec.cpuShares ?? null,
    storage_gb: args.spec.storageGb ?? null,
    spec_hash: args.specHash,
    phase: 'provisioning',
    resume_key: null,
    session_lease_id: null,
    session_lease_user_id: null,
    session_lease_expires_at: null,
    execution_lease_id: null,
    execution_lease_agent_id: null,
    execution_lease_expires_at: null,
    input_control_lease_id: null,
    input_control_lease_type: null,
    input_control_lease_expires_at: null,
    created_at: now,
    updated_at: now,
    suspended_at: null,
    destroyed_at: null,
    operation_key: args.operationKey ?? null,
  };
  desktops.set(getDesktopKey(args.desktopId, args.scope), row);
  return row;
}

export async function getDesktopById(desktopId: string, scope: TenantScope): Promise<VdiDesktopRow | null> {
  return desktops.get(getDesktopKey(desktopId, scope)) ?? null;
}

export async function getDesktopByProviderId(provider: string, providerId: string, scope: TenantScope): Promise<VdiDesktopRow | null> {
  for (const row of desktops.values()) {
    if (row.provider === provider && row.provider_id === providerId && row.tenant_id === scope.tenantId && row.workspace_id === scope.workspaceId) {
      return row;
    }
  }
  return null;
}

export async function updateDesktopPhase(
  desktopId: string,
  scope: TenantScope,
  phase: DesktopPhase,
  expectedGeneration: number
): Promise<VdiDesktopRow> {
  const key = getDesktopKey(desktopId, scope);
  const desktop = desktops.get(key);
  if (!desktop) throw new Error(`Desktop ${desktopId} not found`);
  if (desktop.generation !== expectedGeneration) {
    throw new Error(`Desktop ${desktopId} generation mismatch (expected ${expectedGeneration}, got ${desktop.generation})`);
  }
  desktop.generation = nextGeneration();
  desktop.phase = phase;
  desktop.updated_at = new Date().toISOString();
  if (phase === 'suspended') desktop.suspended_at = desktop.updated_at;
  if (phase === 'destroyed') desktop.destroyed_at = desktop.updated_at;
  return desktop;
}

export async function updateDesktopResumeKey(
  desktopId: string,
  scope: TenantScope,
  resumeKey: string,
  expectedGeneration: number
): Promise<VdiDesktopRow> {
  const key = getDesktopKey(desktopId, scope);
  const desktop = desktops.get(key);
  if (!desktop) throw new Error(`Desktop ${desktopId} not found`);
  if (desktop.generation !== expectedGeneration) {
    throw new Error(`Desktop ${desktopId} generation mismatch (expected ${expectedGeneration}, got ${desktop.generation})`);
  }
  desktop.generation = nextGeneration();
  desktop.resume_key = resumeKey;
  desktop.updated_at = new Date().toISOString();
  return desktop;
}

export async function listDesktops(scope: TenantScope): Promise<VdiDesktopRow[]> {
  const results: VdiDesktopRow[] = [];
  for (const row of desktops.values()) {
    if (row.tenant_id === scope.tenantId && row.workspace_id === scope.workspaceId) {
      results.push(row);
    }
  }
  return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Session Leases
export async function grantSessionLease(args: {
  desktopId: string;
  sessionId: string;
  userId: string;
  connectionGrant: string;
  ttlMs: number;
  scope: TenantScope;
}): Promise<VdiSessionLeaseRow> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + args.ttlMs).toISOString();

  const leaseKey = `${args.desktopId}:${args.userId}`;
  const row: VdiSessionLeaseRow = {
    id: `uuid-${Date.now()}`,
    desktop_id: args.desktopId,
    session_id: args.sessionId,
    user_id: args.userId,
    connection_grant: args.connectionGrant,
    granted_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
  };
  sessionLeases.set(leaseKey, row);

  // Update desktop
  const desktop = desktops.get(getDesktopKey(args.desktopId, args.scope));
  if (desktop) {
    desktop.generation = nextGeneration();
    desktop.session_lease_id = args.sessionId;
    desktop.session_lease_user_id = args.userId;
    desktop.session_lease_expires_at = expiresAt;
    desktop.updated_at = now;
  }

  return row;
}

export async function revokeSessionLease(
  desktopId: string,
  sessionId: string,
  scope: TenantScope,
  revokedBy: string,
  revokedReason: string
): Promise<void> {
  const now = new Date().toISOString();
  const desktop = desktops.get(getDesktopKey(desktopId, scope));
  if (desktop && desktop.session_lease_id === sessionId) {
    const leaseKey = `${desktopId}:${desktop.session_lease_user_id}`;
    const lease = sessionLeases.get(leaseKey);
    if (lease) {
      lease.revoked_at = now;
      lease.revoked_by = revokedBy;
      lease.revoked_reason = revokedReason;
    }
    desktop.generation = nextGeneration();
    desktop.session_lease_id = null;
    desktop.session_lease_user_id = null;
    desktop.session_lease_expires_at = null;
    desktop.updated_at = now;
  }
}

export async function getActiveSessionLease(desktopId: string, scope: TenantScope): Promise<VdiSessionLeaseRow | null> {
  const desktop = desktops.get(getDesktopKey(desktopId, scope));
  if (!desktop || !desktop.session_lease_id || !desktop.session_lease_user_id) return null;

  const leaseKey = `${desktopId}:${desktop.session_lease_user_id}`;
  const lease = sessionLeases.get(leaseKey);
  if (!lease) return null;

  const now = new Date().toISOString();
  if (lease.revoked_at || lease.expires_at <= now) return null;

  return lease;
}

// Execution Leases
export async function grantExecutionLease(args: {
  desktopId: string;
  executionId: string;
  agentId: string;
  ttlMs: number;
  scope: TenantScope;
}): Promise<VdiExecutionLeaseRow> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + args.ttlMs).toISOString();

  const leaseKey = `${args.desktopId}:${args.agentId}`;
  const row: VdiExecutionLeaseRow = {
    id: `uuid-${Date.now()}`,
    desktop_id: args.desktopId,
    execution_id: args.executionId,
    agent_id: args.agentId,
    granted_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    revoked_by: null,
    revoked_reason: null,
  };
  executionLeases.set(leaseKey, row);

  // Update desktop
  const desktop = desktops.get(getDesktopKey(args.desktopId, args.scope));
  if (desktop) {
    desktop.generation = nextGeneration();
    desktop.execution_lease_id = args.executionId;
    desktop.execution_lease_agent_id = args.agentId;
    desktop.execution_lease_expires_at = expiresAt;
    desktop.updated_at = now;
  }

  return row;
}

export async function revokeExecutionLease(
  desktopId: string,
  executionId: string,
  scope: TenantScope,
  revokedBy: string,
  revokedReason: string
): Promise<void> {
  const now = new Date().toISOString();
  const desktop = desktops.get(getDesktopKey(desktopId, scope));
  if (desktop && desktop.execution_lease_id === executionId) {
    const leaseKey = `${desktopId}:${desktop.execution_lease_agent_id}`;
    const lease = executionLeases.get(leaseKey);
    if (lease) {
      lease.revoked_at = now;
      lease.revoked_by = revokedBy;
      lease.revoked_reason = revokedReason;
    }
    desktop.generation = nextGeneration();
    desktop.execution_lease_id = null;
    desktop.execution_lease_agent_id = null;
    desktop.execution_lease_expires_at = null;
    desktop.updated_at = now;
  }
}

export async function getActiveExecutionLease(desktopId: string, scope: TenantScope): Promise<VdiExecutionLeaseRow | null> {
  const desktop = desktops.get(getDesktopKey(desktopId, scope));
  if (!desktop || !desktop.execution_lease_id || !desktop.execution_lease_agent_id) return null;

  const leaseKey = `${desktopId}:${desktop.execution_lease_agent_id}`;
  const lease = executionLeases.get(leaseKey);
  if (!lease) return null;

  const now = new Date().toISOString();
  if (lease.revoked_at || lease.expires_at <= now) return null;

  return lease;
}

// Connection Grants
export async function createConnectionGrant(args: {
  desktopId: string;
  sessionLeaseId: string;
  grantToken: string;
  protocol: string;
  ttlMs: number;
}): Promise<VdiConnectionGrantRow> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + args.ttlMs).toISOString();

  const row: VdiConnectionGrantRow = {
    id: `uuid-${Date.now()}`,
    desktop_id: args.desktopId,
    session_lease_id: args.sessionLeaseId,
    grant_token: args.grantToken,
    protocol: args.protocol,
    granted_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    revoked_reason: null,
  };
  connectionGrants.set(args.grantToken, row);
  return row;
}

export async function revokeConnectionGrants(
  desktopId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  for (const grant of connectionGrants.values()) {
    if (grant.desktop_id === desktopId && !grant.revoked_at) {
      grant.revoked_at = now;
      grant.revoked_reason = reason;
    }
  }
}

export async function validateConnectionGrant(
  grantToken: string
): Promise<{ desktopId: string; sessionLeaseId: string; protocol: string } | null> {
  const grant = connectionGrants.get(grantToken);
  if (!grant) return null;

  const now = new Date().toISOString();
  if (grant.revoked_at || grant.expires_at <= now) return null;

  return { desktopId: grant.desktop_id, sessionLeaseId: grant.session_lease_id, protocol: grant.protocol };
}

// Input Control Leases
export async function grantInputControlLease(args: {
  desktopId: string;
  leaseId: string;
  holderType: 'human' | 'agent';
  holderId: string;
  ttlMs: number;
  scope: TenantScope;
}): Promise<VdiInputControlLeaseRow> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + args.ttlMs).toISOString();

  // Revoke existing
  const existing = inputControlLeases.get(args.desktopId);
  if (existing && !existing.revoked_at && existing.expires_at > now) {
    existing.revoked_at = now;
    existing.revoked_reason = 'takeover';
  }

  const row: VdiInputControlLeaseRow = {
    id: `uuid-${Date.now()}`,
    desktop_id: args.desktopId,
    lease_id: args.leaseId,
    holder_type: args.holderType,
    holder_id: args.holderId,
    granted_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    revoked_reason: null,
  };
  inputControlLeases.set(args.desktopId, row);

  // Update desktop
  const desktop = desktops.get(getDesktopKey(args.desktopId, args.scope));
  if (desktop) {
    desktop.generation = nextGeneration();
    desktop.input_control_lease_id = args.leaseId;
    desktop.input_control_lease_type = args.holderType;
    desktop.input_control_lease_expires_at = expiresAt;
    desktop.updated_at = now;
  }

  return row;
}

export async function revokeInputControlLease(
  desktopId: string,
  leaseId: string,
  scope: TenantScope,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  const lease = inputControlLeases.get(desktopId);
  if (lease && lease.lease_id === leaseId) {
    lease.revoked_at = now;
    lease.revoked_reason = reason;
  }

  const desktop = desktops.get(getDesktopKey(desktopId, scope));
  if (desktop && desktop.input_control_lease_id === leaseId) {
    desktop.generation = nextGeneration();
    desktop.input_control_lease_id = null;
    desktop.input_control_lease_type = null;
    desktop.input_control_lease_expires_at = null;
    desktop.updated_at = now;
  }
}

export async function getActiveInputControlLease(desktopId: string, scope: TenantScope): Promise<VdiInputControlLeaseRow | null> {
  const lease = inputControlLeases.get(desktopId);
  if (!lease) return null;

  const now = new Date().toISOString();
  if (lease.revoked_at || lease.expires_at <= now) return null;

  return lease;
}

// Operation Keys
export async function checkOperationKey(operationKey: string): Promise<{ desktopId: string } | { status: 'in_progress' } | null> {
  const row = operationKeys.get(operationKey);
  if (!row) return null;

  if (row.status === 'completed' && row.desktop_id) {
    return { desktopId: row.desktop_id };
  }
  if (row.status === 'in_progress') {
    return { status: 'in_progress' };
  }
  return null;
}

export async function recordOperationKey(operationKey: string, outcome: { desktopId: string; providerId: string } | { error: string }): Promise<void> {
  const now = new Date().toISOString();
  const status = 'desktopId' in outcome ? 'completed' : 'failed';

  operationKeys.set(operationKey, {
    id: `uuid-${Date.now()}`,
    operation_key: operationKey,
    tenant_id: operationKey.split(':')[2] ?? 'unknown',
    workspace_id: operationKey.split(':')[3] ?? 'unknown',
    spec_hash: operationKey.split(':')[4] ?? 'unknown',
    status,
    desktop_id: 'desktopId' in outcome ? outcome.desktopId : null,
    provider_id: 'desktopId' in outcome ? outcome.providerId : null,
    error_message: 'error' in outcome ? outcome.error : null,
    requested_at: now,
    completed_at: now,
  });
}

// Evidence
export async function recordEvidence(event: {
  desktopId: string;
  operationKey?: string | null;
  operationType: string;
  desiredState?: string | null;
  observedState?: string | null;
  timingMs?: number | null;
  failureClass?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const row: VdiEvidenceRow = {
    id: `uuid-${Date.now()}`,
    desktop_id: event.desktopId,
    operation_key: event.operationKey ?? null,
    operation_type: event.operationType,
    desired_state: event.desiredState ?? null,
    observed_state: event.observedState ?? null,
    timing_ms: event.timingMs ?? null,
    failure_class: event.failureClass ?? null,
    metadata: event.metadata ?? null,
    recorded_at: now,
  };
  const arr = evidence.get(event.desktopId) ?? [];
  arr.push(row);
  evidence.set(event.desktopId, arr);
}

// Fleet observations (VDI-3A) — one current row per desktop.
interface ObservationRow {
  desktop_id: string;
  provider_reachable: boolean;
  provider_phase: string | null;
  provider_class: string | null;
  provider_observed_at: string | null;
  provider_error: string | null;
  guest_display_healthy: boolean | null;
  guest_error: string | null;
  guest_observed_at: string | null;
  broker_phase: string;
  generation: number;
  session_lease_active: boolean;
  execution_lease_active: boolean;
  input_control_holder: string | null;
  last_operation_key: string | null;
  checked_at: string;
}
const observations = new Map<string, ObservationRow>();

export async function recordObservation(outcome: {
  desktopId: string;
  providerReachable: boolean;
  providerPhase: string | null;
  providerClass: string | null;
  providerObservedAt: string | null;
  providerError: string | null;
  guestDisplayHealthy: boolean | null;
  guestError: string | null;
  guestObservedAt: string | null;
  brokerPhase: string;
  generation: number;
  sessionLeaseActive: boolean;
  executionLeaseActive: boolean;
  inputControlHolder: string | null;
  lastOperationKey: string | null;
  /** When this collection STARTED. Older collections cannot overwrite newer. */
  collectedAt?: string;
}): Promise<void> {
  const prev = observations.get(outcome.desktopId);
  const next: ObservationRow = {
    desktop_id: outcome.desktopId,
    provider_reachable: outcome.providerReachable,
    // Outage keeps the last good provider report + its timestamp.
    provider_phase: outcome.providerPhase ?? prev?.provider_phase ?? null,
    provider_class: outcome.providerClass ?? prev?.provider_class ?? null,
    provider_observed_at: outcome.providerObservedAt ?? prev?.provider_observed_at ?? null,
    provider_error: outcome.providerError,
    guest_display_healthy: outcome.guestDisplayHealthy,
    guest_error: outcome.guestError,
    guest_observed_at: outcome.guestObservedAt,
    broker_phase: outcome.brokerPhase,
    generation: outcome.generation,
    session_lease_active: outcome.sessionLeaseActive,
    execution_lease_active: outcome.executionLeaseActive,
    input_control_holder: outcome.inputControlHolder,
    last_operation_key: outcome.lastOperationKey,
    checked_at: outcome.collectedAt ?? new Date().toISOString(),
  };
  // Concurrent-collection guard: an older collection never overwrites a newer
  // write (slow provider read finishing after a fast one).
  if (prev && prev.checked_at > next.checked_at) return;
  observations.set(outcome.desktopId, next);
}

export async function getObservation(desktopId: string): Promise<{
  providerPhase: string | null;
  providerClass: string | null;
  providerObservedAt: string | null;
  [k: string]: unknown;
} | null> {
  const row = observations.get(desktopId);
  if (!row) return null;
  return {
    desktopId: row.desktop_id,
    providerReachable: row.provider_reachable,
    providerPhase: row.provider_phase,
    providerClass: row.provider_class,
    providerObservedAt: row.provider_observed_at,
    providerError: row.provider_error,
    guestDisplayHealthy: row.guest_display_healthy,
    guestError: row.guest_error,
    guestObservedAt: row.guest_observed_at,
    brokerPhase: row.broker_phase,
    generation: row.generation,
    sessionLeaseActive: row.session_lease_active,
    executionLeaseActive: row.execution_lease_active,
    inputControlHolder: row.input_control_holder,
    lastOperationKey: row.last_operation_key,
    checkedAt: row.checked_at,
  };
}

// Can Suspend
export async function canSuspendDesktop(desktopId: string, scope: TenantScope): Promise<boolean> {
  const desktop = desktops.get(getDesktopKey(desktopId, scope));
  if (!desktop) return false;

  const now = new Date().toISOString();
  const hasActiveSession = desktop.session_lease_expires_at && desktop.session_lease_expires_at > now;
  const hasActiveExecution = desktop.execution_lease_expires_at && desktop.execution_lease_expires_at > now;

  return !hasActiveSession && !hasActiveExecution;
}

// Workspace Authorization (mock - always true for tests)
export async function validateWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean> {
  return true;
}

export async function validateWorkspaceOwnership(userId: string, workspaceId: string): Promise<boolean> {
  return true;
}
// ── Alerts (VDI-3C) ──────────────────────────────────────────────────────────

export interface AlertRow {
  id: string;
  desktop_id: string;
  tenant_id: string;
  workspace_id: string;
  rule: string;
  severity: string;
  generation: number;
  status: string;
  first_observed_at: string;
  last_evaluated_at: string;
  resolved_at: string | null;
  detail: Record<string, unknown> | null;
}
const alerts = new Map<string, AlertRow>(); // key: desktopId|rule|generation|status

export async function upsertAlert(args: {
  desktopId: string;
  tenantId: string;
  workspaceId: string;
  rule: string;
  severity: string;
  generation: number;
  detail: Record<string, unknown> | null;
  resolve: boolean;
  evidenceAt?: string;
  /** Evaluator-provided time; stores never invent timestamps (single clock domain). */
  evaluatedAt?: string;
}): Promise<string | null> {
  const now = args.evaluatedAt ?? new Date().toISOString();
  const openKey = `${args.desktopId}|${args.rule}|${args.generation}|open`;
  const open = alerts.get(openKey);

  if (args.resolve) {
    if (!open) return null; // nothing open to resolve
    // STALE evidence cannot resolve: must be newer than the last evaluation.
    if (!args.evidenceAt || args.evidenceAt <= open.last_evaluated_at) return open.id;
    alerts.delete(openKey);
    const resolved: AlertRow = { ...open, status: 'resolved', resolved_at: now };
    alerts.set(`${args.desktopId}|${args.rule}|${args.generation}|resolved`, resolved);
    return resolved.id;
  }

  if (open) {
    // Dedup: repeated/concurrent evaluation UPDATES the open alert.
    open.last_evaluated_at = now;
    open.severity = args.severity;
    if (args.detail) open.detail = args.detail;
    return open.id;
  }

  const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  alerts.set(openKey, {
    id,
    desktop_id: args.desktopId,
    tenant_id: args.tenantId,
    workspace_id: args.workspaceId,
    rule: args.rule,
    severity: args.severity,
    generation: args.generation,
    status: 'open',
    first_observed_at: now,
    last_evaluated_at: now,
    resolved_at: null,
    detail: args.detail,
  });
  return id;
}

export async function listAlerts(scope: TenantScope, status?: 'open' | 'resolved'): Promise<Array<{
    desktopId: string; rule: string; severity: string; generation: number; status: string;
    firstObservedAt: string; lastEvaluatedAt: string; resolvedAt: string | null;
    detail: Record<string, unknown> | null;
  }>> {
  return Array.from(alerts.values())
    .filter(a => a.tenant_id === scope.tenantId && a.workspace_id === scope.workspaceId
      && (status === undefined || a.status === status))
    .map(a => ({
      desktopId: a.desktop_id,
      rule: a.rule,
      severity: a.severity,
      generation: a.generation,
      status: a.status,
      firstObservedAt: a.first_observed_at,
      lastEvaluatedAt: a.last_evaluated_at,
      resolvedAt: a.resolved_at,
      detail: a.detail,
    }));
}

// ── Usage accounting (VDI-3C) ────────────────────────────────────────────────

export interface UsageRow {
  tenant_id: string;
  workspace_id: string;
  desktop_id: string;
  provider_id: string;
  interval_start: string;
  interval_end: string;
  phase_at_start: string;
  phase_at_end: string | null;
  completeness: string;
  gap_reason: string | null;
  source: string;
  runtime_seconds: number | null;
  estimated_cost_usd: number | null;
  estimate_rate_version: string | null;
  provider_reported_cost_usd: number | null;
}
const usage: UsageRow[] = [];
const usageKeys = new Set<string>(); // providerId|start|end — idempotency

export async function getUsageRecord(providerId: string, intervalStart: string, intervalEnd: string): Promise<{
    providerId: string; intervalStart: string; intervalEnd: string; completeness: string;
    runtimeSeconds: number | null; estimatedCostUsd: number | null;
    estimateRateVersion: string | null; providerReportedCostUsd: number | null;
  } | null> {
  const u = usage.find(x => x.provider_id === providerId && x.interval_start === intervalStart && x.interval_end === intervalEnd);
  if (!u) return null;
  return {
    providerId: u.provider_id, intervalStart: u.interval_start, intervalEnd: u.interval_end,
    completeness: u.completeness, runtimeSeconds: u.runtime_seconds,
    estimatedCostUsd: u.estimated_cost_usd, estimateRateVersion: u.estimate_rate_version,
    providerReportedCostUsd: u.provider_reported_cost_usd,
  };
}

export async function recordUsage(args: {
  tenantId: string; workspaceId: string; desktopId: string; providerId: string;
  intervalStart: string; intervalEnd: string;
  phaseAtStart: string; phaseAtEnd: string | null;
  completeness: 'complete' | 'partial' | 'gap'; gapReason: string | null;
  source: string; runtimeSeconds: number | null;
  estimatedCostUsd: number | null; estimateRateVersion: string | null;
  providerReportedCostUsd: number | null;
}): Promise<void> {
  const key = `${args.providerId}|${args.intervalStart}|${args.intervalEnd}`;
  if (usageKeys.has(key)) return; // replayed interval: never double-count
  usageKeys.add(key);
  usage.push({
    tenant_id: args.tenantId, workspace_id: args.workspaceId,
    desktop_id: args.desktopId, provider_id: args.providerId,
    interval_start: args.intervalStart, interval_end: args.intervalEnd,
    phase_at_start: args.phaseAtStart, phase_at_end: args.phaseAtEnd,
    completeness: args.completeness, gap_reason: args.gapReason,
    source: args.source, runtime_seconds: args.runtimeSeconds,
    estimated_cost_usd: args.estimatedCostUsd,
    estimate_rate_version: args.estimateRateVersion,
    provider_reported_cost_usd: args.providerReportedCostUsd,
  });
}

export async function listUsage(scope: TenantScope): Promise<Array<{
    providerId: string; intervalStart: string; intervalEnd: string; completeness: string;
    runtimeSeconds: number | null; estimatedCostUsd: number | null;
    estimateRateVersion: string | null; providerReportedCostUsd: number | null;
  }>> {
  return usage
    .filter(u => u.tenant_id === scope.tenantId && u.workspace_id === scope.workspaceId)
    .map(u => ({
      providerId: u.provider_id,
      intervalStart: u.interval_start,
      intervalEnd: u.interval_end,
      completeness: u.completeness,
      runtimeSeconds: u.runtime_seconds,
      estimatedCostUsd: u.estimated_cost_usd,
      estimateRateVersion: u.estimate_rate_version,
      providerReportedCostUsd: u.provider_reported_cost_usd,
    }));
}

// ── Remediation attempts (VDI-4A) ────────────────────────────────────────────

export interface RemediationAttemptRow {
  desktop_id: string;
  tenant_id: string;
  workspace_id: string;
  rule: string;
  policy_version: string;
  attempt_count: number;
  last_attempt_at: string | null;
  escalated: boolean;
  escalated_at: string | null;
}
const remediationAttempts = new Map<string, RemediationAttemptRow>(); // key: desktopId|rule|policyVersion

export async function recordRemediationAttempt(args: {
  desktopId: string;
  tenantId: string;
  workspaceId: string;
  rule: string;
  policyVersion: string;
  limit: number;
  attemptedAt: string;
}): Promise<number> {
  const key = `${args.desktopId}|${args.rule}|${args.policyVersion}`;
  const existing = remediationAttempts.get(key);
  if (!existing) {
    remediationAttempts.set(key, {
      desktop_id: args.desktopId, tenant_id: args.tenantId, workspace_id: args.workspaceId,
      rule: args.rule, policy_version: args.policyVersion,
      attempt_count: 1, last_attempt_at: args.attemptedAt,
      escalated: false, escalated_at: null,
    });
    return 1;
  }
  if (existing.escalated) return -1; // exhausted; never a second escalation
  const next = existing.attempt_count + 1;
  if (next > args.limit) {
    existing.escalated = true;
    existing.escalated_at = args.attemptedAt;
    return -1;
  }
  existing.attempt_count = next;
  existing.last_attempt_at = args.attemptedAt;
  return next;
}

export async function getRemediationAttempts(desktopId: string): Promise<Array<{
  rule: string; policyVersion: string; attemptCount: number;
  lastAttemptAt: string | null; escalated: boolean; escalatedAt: string | null;
}>> {
  return Array.from(remediationAttempts.values())
    .filter(a => a.desktop_id === desktopId)
    .map(a => ({
      rule: a.rule, policyVersion: a.policy_version, attemptCount: a.attempt_count,
      lastAttemptAt: a.last_attempt_at, escalated: a.escalated, escalatedAt: a.escalated_at,
    }));
}

// ── Remediation operations (VDI-4B) ─────────────────────────────────────────

export interface RemediationOpRow {
  operation_key: string;
  tenant_id: string;
  workspace_id: string;
  desktop_id: string;
  desktop_generation: number;
  action: string;
  reason: string;
  proposal: Record<string, unknown>;
  policy_version: string;
  proposed_at: string;
  expires_at: string;
  status: string;
  worker_id: string | null;
  attempt_number: number | null;
  outcome_evidence: Record<string, unknown> | null;
  refusal_reason: string | null;
}
const remediationOps = new Map<string, RemediationOpRow>();
const remediationOpOwners = new Map<string, string>(); // opKey -> workerId (claim lock)

// Synchronous claim reservation: exactly one worker wins across interleaved
// async flows (the map is the lock, like the RPC's FOR UPDATE).
const remediationClaimReservations = new Set<string>();

export async function claimRemediationOperation(args: {
  operationKey: string; tenantId: string; workspaceId: string; desktopId: string;
  desktopGeneration: number; action: string; reason: string;
  proposal: Record<string, unknown>; policyVersion: string;
  proposedAt: string; expiresAt: string; workerId: string;
  attemptLimit: number; attemptRule: string;
}): Promise<{ claimed: boolean; status: string; owner: string | null; attemptNumber: number | null }> {
  const existing = remediationOps.get(args.operationKey);
  if (existing) {
    return { claimed: false, status: existing.status, owner: existing.worker_id, attemptNumber: existing.attempt_number };
  }
  // Reserve the key SYNCHRONOUSLY before any await: concurrent claims on the
  // same key see the reservation and lose immediately.
  if (remediationClaimReservations.has(args.operationKey)) {
    return { claimed: false, status: 'claimed', owner: 'another worker', attemptNumber: null };
  }
  remediationClaimReservations.add(args.operationKey);
  try {
    return await claimRemediationOperationInner(args);
  } finally {
    remediationClaimReservations.delete(args.operationKey);
  }
}

async function claimRemediationOperationInner(args: {
  operationKey: string; tenantId: string; workspaceId: string; desktopId: string;
  desktopGeneration: number; action: string; reason: string;
  proposal: Record<string, unknown>; policyVersion: string;
  proposedAt: string; expiresAt: string; workerId: string;
  attemptLimit: number; attemptRule: string;
}): Promise<{ claimed: boolean; status: string; owner: string | null; attemptNumber: number | null }> {
  // Attempt budget consumed AT ADMISSION.
  const attemptNo = await recordRemediationAttempt({
    desktopId: args.desktopId, tenantId: args.tenantId, workspaceId: args.workspaceId,
    rule: args.attemptRule, policyVersion: args.policyVersion,
    limit: args.attemptLimit, attemptedAt: new Date().toISOString(),
  });
  if (attemptNo === -1) {
    remediationOps.set(args.operationKey, {
      operation_key: args.operationKey, tenant_id: args.tenantId, workspace_id: args.workspaceId,
      desktop_id: args.desktopId, desktop_generation: args.desktopGeneration,
      action: args.action, reason: args.reason, proposal: args.proposal, policy_version: args.policyVersion,
      proposed_at: args.proposedAt, expires_at: args.expiresAt,
      status: 'exhausted', worker_id: null, attempt_number: null,
      outcome_evidence: { outcome: 'exhausted', attempt_limit: args.attemptLimit },
      refusal_reason: null,
    });
    return { claimed: false, status: 'exhausted', owner: null, attemptNumber: -1 };
  }
  const row: RemediationOpRow = {
    operation_key: args.operationKey, tenant_id: args.tenantId, workspace_id: args.workspaceId,
    desktop_id: args.desktopId, desktop_generation: args.desktopGeneration,
    action: args.action, reason: args.reason, proposal: args.proposal, policy_version: args.policyVersion,
    proposed_at: args.proposedAt, expires_at: args.expiresAt,
    status: 'claimed', worker_id: args.workerId, attempt_number: attemptNo,
    outcome_evidence: null, refusal_reason: null,
  };
  remediationOps.set(args.operationKey, row);
  remediationOpOwners.set(args.operationKey, args.workerId);
  return { claimed: true, status: 'claimed', owner: args.workerId, attemptNumber: attemptNo };
}

const TERMINAL_OP_STATUSES = new Set(['success', 'refused', 'exhausted']);

export async function updateRemediationOperation(args: {
  operationKey: string; workerId: string;
  newStatus: 'dispatched' | 'success' | 'refused' | 'exhausted' | 'reconciling' | 'unresolved';
  outcomeEvidence?: Record<string, unknown> | null;
  refusalReason?: string | null;
}): Promise<boolean> {
  const row = remediationOps.get(args.operationKey);
  if (!row) return false;
  // Terminal states are immutable; replaying the SAME outcome is a no-op ok.
  if (TERMINAL_OP_STATUSES.has(row.status)) {
    return row.status === args.newStatus;
  }
  // Only the dispatch owner may advance the operation.
  if (row.worker_id !== args.workerId) return false;
  row.status = args.newStatus;
  if (args.outcomeEvidence) row.outcome_evidence = args.outcomeEvidence;
  if (args.refusalReason !== undefined && args.refusalReason !== null) row.refusal_reason = args.refusalReason;
  return true;
}

export async function getRemediationOperation(operationKey: string): Promise<{
  status: string; workerId: string | null; attemptNumber: number | null;
  outcomeEvidence: Record<string, unknown> | null; refusalReason: string | null;
} | null> {
  const row = remediationOps.get(operationKey);
  if (!row) return null;
  return {
    status: row.status, workerId: row.worker_id, attemptNumber: row.attempt_number,
    outcomeEvidence: row.outcome_evidence, refusalReason: row.refusal_reason,
  };
}

// ── Budget admission (VDI-4C) — micro-USD integers, exact ───────────────────

export interface BudgetRow {
  tenant_id: string; workspace_id: string; budget_period: string;
  limit_micros: number; accounted_spend_micros: number;
  overrun_micros: number; admission_blocked: boolean;
}
const budgets = new Map<string, BudgetRow>(); // key: tenant|ws|period

export interface BudgetReservationRow {
  operation_key: string; tenant_id: string; workspace_id: string;
  budget_period: string; currency: string; amount_micros: number;
  resource_spec: Record<string, unknown>; pricing_version: string;
  pricing_known: boolean; horizon_expires_at: string;
  status: string; reconciling: boolean;
  settled_micros: number | null;
  provider_charge_adjustments_micros: number;
  released_at: string | null;
}
const budgetReservations = new Map<string, BudgetReservationRow>();

const bKey = (t: string, w: string, p: string) => `${t}|${w}|${p}`;

export function seedBudget(args: {
  tenantId: string; workspaceId: string; budgetPeriod: string;
  limitMicros: number; accountedSpendMicros?: number;
}): void {
  budgets.set(bKey(args.tenantId, args.workspaceId, args.budgetPeriod), {
    tenant_id: args.tenantId, workspace_id: args.workspaceId, budget_period: args.budgetPeriod,
    limit_micros: args.limitMicros,
    accounted_spend_micros: args.accountedSpendMicros ?? 0,
    overrun_micros: 0, admission_blocked: false,
  });
}

export async function admitReservation(args: {
  operationKey: string; tenantId: string; workspaceId: string; budgetPeriod: string;
  currency: string; amountMicros: number | null; unknownCeilingMicros: number | null;
  resourceSpec: Record<string, unknown>; pricingVersion: string; horizonExpiresAt: string;
}): Promise<{ admitted: boolean; replay: boolean; reason?: string; amountMicros?: number; pricingKnown?: boolean; status?: string }> {
  const existing = budgetReservations.get(args.operationKey);
  if (existing) {
    // Replay: same binding → original reservation; different → conflict.
    const sameBinding = existing.budget_period === args.budgetPeriod
      && existing.currency === args.currency
      && (args.amountMicros === null || existing.amount_micros === args.amountMicros);
    if (sameBinding) {
      return { admitted: true, replay: true, amountMicros: existing.amount_micros, status: existing.status };
    }
    return { admitted: false, replay: false, reason: 'conflicting replay: same key, different binding' };
  }
  let requested: number;
  if (args.amountMicros === null) {
    if (args.unknownCeilingMicros === null) {
      return { admitted: false, replay: false, reason: 'pricing unknown and no conservative ceiling supplied: refusing (unknown is never zero)' };
    }
    requested = args.unknownCeilingMicros;
  } else {
    requested = args.amountMicros;
  }
  const b = budgets.get(bKey(args.tenantId, args.workspaceId, args.budgetPeriod));
  if (!b) return { admitted: false, replay: false, reason: 'budget not configured for period' };
  if (b.admission_blocked) return { admitted: false, replay: false, reason: 'admission blocked by overrun policy' };
  let outstanding = 0;
  for (const r of budgetReservations.values()) {
    if (r.tenant_id === args.tenantId && r.workspace_id === args.workspaceId
      && r.budget_period === args.budgetPeriod
      && (r.status === 'reserved' || r.status === 'held-for-reconciliation')) {
      outstanding += r.amount_micros;
    }
  }
  if (b.accounted_spend_micros + outstanding + requested > b.limit_micros) {
    return { admitted: false, replay: false, reason: 'over admission limit', amountMicros: requested };
  }
  budgetReservations.set(args.operationKey, {
    operation_key: args.operationKey, tenant_id: args.tenantId, workspace_id: args.workspaceId,
    budget_period: args.budgetPeriod, currency: args.currency, amount_micros: requested,
    resource_spec: args.resourceSpec,
    pricing_version: args.amountMicros === null ? 'unknown-ceiling' : args.pricingVersion,
    pricing_known: args.amountMicros !== null,
    horizon_expires_at: args.horizonExpiresAt,
    status: 'reserved', reconciling: false,
    settled_micros: null, provider_charge_adjustments_micros: 0, released_at: null,
  });
  return { admitted: true, replay: false, amountMicros: requested, pricingKnown: args.amountMicros !== null };
}

export async function resolveProvisioning(args: {
  operationKey: string; outcome: 'uncertain' | 'failed'; now: string;
}): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const r = budgetReservations.get(args.operationKey);
  if (!r) return { ok: false, reason: 'reservation not found' };
  if (r.status !== 'reserved') return { ok: false, reason: `reservation status ${r.status} not resolvable` };
  if (args.outcome === 'uncertain') {
    r.status = 'held-for-reconciliation';
    r.reconciling = true;
    return { ok: true, status: 'held-for-reconciliation' };
  }
  r.status = 'released';
  r.released_at = args.now;
  return { ok: true, status: 'released' };
}

export async function settleReservation(args: {
  operationKey: string; actualMicros: number; blockAdmissionOnOverrun: boolean; now: string;
}): Promise<{ ok: boolean; replay: boolean; settledMicros?: number; overrunRecorded?: number; reason?: string }> {
  const r = budgetReservations.get(args.operationKey);
  if (!r) return { ok: false, replay: false, reason: 'reservation not found' };
  if (r.status === 'settled') {
    if (r.settled_micros === args.actualMicros) return { ok: true, replay: true, settledMicros: args.actualMicros };
    return { ok: false, replay: false, reason: 'already settled with different amount; use adjustment' };
  }
  if (r.status === 'released') return { ok: false, replay: false, reason: 'reservation released; nothing to settle' };
  const b = budgets.get(bKey(r.tenant_id, r.workspace_id, r.budget_period));
  if (!b) return { ok: false, replay: false, reason: 'budget not found' };
  const newSpend = b.accounted_spend_micros + args.actualMicros;
  const overrun = Math.max(newSpend - b.limit_micros, 0) - b.overrun_micros;
  b.accounted_spend_micros = newSpend;
  b.overrun_micros += Math.max(overrun, 0);
  if (args.blockAdmissionOnOverrun && newSpend > b.limit_micros) b.admission_blocked = true;
  r.status = 'settled';
  r.settled_micros = args.actualMicros;
  // The entry's initial true charge: later corrections delta from here.
  r.provider_charge_adjustments_micros = args.actualMicros;
  r.reconciling = false;
  return { ok: true, replay: false, settledMicros: args.actualMicros, overrunRecorded: Math.max(overrun, 0) };
}

export async function adjustSettledCharge(args: {
  operationKey: string; chargeMicros: number; now: string;
}): Promise<{ ok: boolean; replay: boolean; deltaMicros?: number; reason?: string }> {
  const r = budgetReservations.get(args.operationKey);
  if (!r) return { ok: false, replay: false, reason: 'reservation not found' };
  if (r.status !== 'settled') return { ok: false, replay: false, reason: 'reservation not settled' };
  if (r.provider_charge_adjustments_micros === args.chargeMicros) return { ok: true, replay: true };
  const b = budgets.get(bKey(r.tenant_id, r.workspace_id, r.budget_period));
  if (!b) return { ok: false, replay: false, reason: 'budget not found' };
  const delta = args.chargeMicros - r.provider_charge_adjustments_micros;
  b.accounted_spend_micros += delta;
  r.provider_charge_adjustments_micros = args.chargeMicros;
  return { ok: true, replay: false, deltaMicros: delta };
}

export async function extendReservationHorizon(args: {
  operationKey: string; newHorizon: string; now: string;
}): Promise<boolean> {
  const r = budgetReservations.get(args.operationKey);
  if (!r) return false;
  if (r.status !== 'reserved' && r.status !== 'held-for-reconciliation') return false;
  r.horizon_expires_at = args.newHorizon;
  return true;
}

export async function getBudget(args: {
  tenantId: string; workspaceId: string; budgetPeriod: string;
}): Promise<{ limitMicros: number; accountedSpendMicros: number; overrunMicros: number; admissionBlocked: boolean } | null> {
  const b = budgets.get(bKey(args.tenantId, args.workspaceId, args.budgetPeriod));
  if (!b) return null;
  return { limitMicros: b.limit_micros, accountedSpendMicros: b.accounted_spend_micros, overrunMicros: b.overrun_micros, admissionBlocked: b.admission_blocked };
}

export async function getReservation(operationKey: string): Promise<{
  status: string; amountMicros: number; budgetPeriod: string;
  pricingKnown: boolean; settledMicros: number | null;
  providerChargeAdjustmentsMicros: number; horizonExpiresAt: string; reconciling: boolean;
} | null> {
  const r = budgetReservations.get(operationKey);
  if (!r) return null;
  return {
    status: r.status, amountMicros: r.amount_micros, budgetPeriod: r.budget_period,
    pricingKnown: r.pricing_known, settledMicros: r.settled_micros,
    providerChargeAdjustmentsMicros: r.provider_charge_adjustments_micros,
    horizonExpiresAt: r.horizon_expires_at, reconciling: r.reconciling,
  };
}
