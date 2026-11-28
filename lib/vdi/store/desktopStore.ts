// lib/vdi/store/desktopStore.ts
// The ONLY place that touches Supabase for VDI desktop broker state.
// Broker service calls these; they never scatter queries.

import { supabaseAdmin } from '@/lib/supabaseClient';
import type {
  TenantScope,
  DesktopSpec,
  Desktop,
  DesktopPhase,
  DesktopSessionLease,
  ExecutionLease,
  DesktopSnapshot
} from '@/lib/intelligence/execution/vdi/contracts';

export interface VdiDesktopRow {
  id: string;
  desktop_id: string;
  tenant_id: string;
  workspace_id: string;
  generation: number;
  provider: string;
  provider_id: string;
  provider_region: string | null;
  runtime_type: string;
  persistence: string;
  image_version: string;
  memory_mb: number | null;
  cpu_shares: number | null;
  storage_gb: number | null;
  spec_hash: string;
  phase: DesktopPhase;
  resume_key: string | null;
  session_lease_id: string | null;
  session_lease_user_id: string | null;
  session_lease_expires_at: string | null;
  execution_lease_id: string | null;
  execution_lease_agent_id: string | null;
  execution_lease_expires_at: string | null;
  input_control_lease_id: string | null;
  input_control_lease_type: string | null;
  input_control_lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
  destroyed_at: string | null;
  operation_key: string | null;
}

export interface VdiSessionLeaseRow {
  id: string;
  desktop_id: string;
  session_id: string;
  user_id: string;
  connection_grant: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
}

export interface VdiExecutionLeaseRow {
  id: string;
  desktop_id: string;
  execution_id: string;
  agent_id: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
}

export interface VdiConnectionGrantRow {
  id: string;
  desktop_id: string;
  session_lease_id: string;
  grant_token: string;
  protocol: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface VdiInputControlLeaseRow {
  id: string;
  desktop_id: string;
  lease_id: string;
  holder_type: 'human' | 'agent';
  holder_id: string;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export interface VdiOperationKeyRow {
  id: string;
  operation_key: string;
  tenant_id: string;
  workspace_id: string;
  spec_hash: string;
  status: 'in_progress' | 'completed' | 'failed';
  desktop_id: string | null;
  provider_id: string | null;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface VdiEvidenceRow {
  id: string;
  desktop_id: string;
  operation_key: string | null;
  operation_type: string;
  desired_state: string | null;
  observed_state: string | null;
  timing_ms: number | null;
  failure_class: string | null;
  metadata: Record<string, unknown> | null;
  recorded_at: string;
}

function sb() {
  if (!supabaseAdmin) throw new Error('supabaseAdmin not configured');
  return supabaseAdmin;
}

// ── Map DB row → Desktop (contract type) ─────────────────────────────────────

function mapRowToDesktop(row: VdiDesktopRow): Desktop {
  return {
    desktopId: row.desktop_id,
    spec: {
      runtimeType: row.runtime_type as DesktopSpec['runtimeType'],
      persistence: row.persistence as DesktopSpec['persistence'],
      imageVersion: row.image_version,
      memoryMb: row.memory_mb ?? undefined,
      cpuShares: row.cpu_shares ?? undefined,
      storageGb: row.storage_gb ?? undefined,
    },
    providerId: row.provider_id,
    provider: row.provider,
    phase: row.phase,
    createdAt: row.created_at,
    resumeKey: row.resume_key ?? undefined,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    sessionLease: row.session_lease_id && row.session_lease_expires_at
      ? {
          sessionId: row.session_lease_id,
          userId: row.session_lease_user_id ?? 'unknown',
          grantedAt: row.created_at,
          expiresAt: row.session_lease_expires_at,
          connectionGrant: '', // populated by join or separate fetch
        }
      : undefined,
    executionLease: row.execution_lease_id && row.execution_lease_expires_at
      ? {
          executionId: row.execution_lease_id,
          agentId: row.execution_lease_agent_id ?? 'unknown',
          grantedAt: row.created_at,
          expiresAt: row.execution_lease_expires_at,
        }
      : undefined,
  };
}

// ── Desktop CRUD ──────────────────────────────────────────────────────────────

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
  const { data, error } = await sb()
    .from('vdi_desktops')
    .insert({
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
      operation_key: args.operationKey ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`vdi createDesktop failed: ${error.message}`);
  return data as VdiDesktopRow;
}

export async function getDesktopById(desktopId: string, scope: TenantScope): Promise<VdiDesktopRow | null> {
  const { data, error } = await sb()
    .from('vdi_desktops')
    .select()
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (error) throw new Error(`vdi getDesktopById failed: ${error.message}`);
  return (data as VdiDesktopRow) ?? null;
}

export async function getDesktopByProviderId(provider: string, providerId: string, scope: TenantScope): Promise<VdiDesktopRow | null> {
  const { data, error } = await sb()
    .from('vdi_desktops')
    .select()
    .eq('provider', provider)
    .eq('provider_id', providerId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (error) throw new Error(`vdi getDesktopByProviderId failed: ${error.message}`);
  return (data as VdiDesktopRow) ?? null;
}

export async function updateDesktopPhase(
  desktopId: string,
  scope: TenantScope,
  phase: DesktopPhase,
  expectedGeneration: number
): Promise<VdiDesktopRow> {
  const updates: Record<string, unknown> = { phase, generation: expectedGeneration + 1 };
  if (phase === 'suspended') updates.suspended_at = new Date().toISOString();
  if (phase === 'destroyed') updates.destroyed_at = new Date().toISOString();

  const { data, error } = await sb()
    .from('vdi_desktops')
    .update(updates)
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('generation', expectedGeneration)
    .select()
    .maybeSingle();

  if (error) throw new Error(`vdi updateDesktopPhase failed: ${error.message}`);
  if (!data) throw new Error(`Desktop ${desktopId} generation mismatch (expected ${expectedGeneration})`);
  return data as VdiDesktopRow;
}

export async function updateDesktopResumeKey(
  desktopId: string,
  scope: TenantScope,
  resumeKey: string,
  expectedGeneration: number
): Promise<VdiDesktopRow> {
  const { data, error } = await sb()
    .from('vdi_desktops')
    .update({ resume_key: resumeKey, generation: expectedGeneration + 1 })
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('generation', expectedGeneration)
    .select()
    .maybeSingle();

  if (error) throw new Error(`vdi updateDesktopResumeKey failed: ${error.message}`);
  if (!data) throw new Error(`Desktop ${desktopId} generation mismatch (expected ${expectedGeneration})`);
  return data as VdiDesktopRow;
}

export async function listDesktops(scope: TenantScope): Promise<VdiDesktopRow[]> {
  const { data, error } = await sb()
    .from('vdi_desktops')
    .select()
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`vdi listDesktops failed: ${error.message}`);
  return (data as VdiDesktopRow[]) ?? [];
}

// ── Session Leases ────────────────────────────────────────────────────────────

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

  const { data, error } = await sb()
    .from('vdi_session_leases')
    .upsert({
      desktop_id: args.desktopId,
      session_id: args.sessionId,
      user_id: args.userId,
      connection_grant: args.connectionGrant,
      granted_at: now,
      expires_at: expiresAt,
      revoked_at: null,
      revoked_by: null,
      revoked_reason: null,
    }, { onConflict: 'desktop_id,user_id' })
    .select()
    .single();

  if (error) throw new Error(`vdi grantSessionLease failed: ${error.message}`);

  // Update desktop with session lease info
  const { data: desktop } = await sb()
    .from('vdi_desktops')
    .select('generation')
    .eq('desktop_id', args.desktopId)
    .eq('tenant_id', args.scope.tenantId)
    .eq('workspace_id', args.scope.workspaceId)
    .single();

  await sb()
    .from('vdi_desktops')
    .update({
      session_lease_id: args.sessionId,
      session_lease_user_id: args.userId,
      session_lease_expires_at: expiresAt,
      generation: (desktop?.generation ?? 0) + 1,
    })
    .eq('desktop_id', args.desktopId)
    .eq('tenant_id', args.scope.tenantId)
    .eq('workspace_id', args.scope.workspaceId)
    .eq('generation', desktop?.generation ?? 0);

  return data as VdiSessionLeaseRow;
}

export async function revokeSessionLease(
  desktopId: string,
  sessionId: string,
  scope: TenantScope,
  revokedBy: string,
  revokedReason: string
): Promise<void> {
  const now = new Date().toISOString();

  await sb()
    .from('vdi_session_leases')
    .update({
      revoked_at: now,
      revoked_by: revokedBy,
      revoked_reason: revokedReason,
    })
    .eq('desktop_id', desktopId)
    .eq('session_id', sessionId);

  // Clear session lease from desktop if it matches
  const { data: desktop } = await sb()
    .from('vdi_desktops')
    .select('generation')
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .single();

  await sb()
    .from('vdi_desktops')
    .update({
      session_lease_id: null,
      session_lease_user_id: null,
      session_lease_expires_at: null,
      generation: (desktop?.generation ?? 0) + 1,
    })
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('session_lease_id', sessionId)
    .eq('generation', desktop?.generation ?? 0);
}

export async function getActiveSessionLease(desktopId: string, scope: TenantScope): Promise<VdiSessionLeaseRow | null> {
  const { data, error } = await sb()
    .from('vdi_session_leases')
    .select()
    .eq('desktop_id', desktopId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`vdi getActiveSessionLease failed: ${error.message}`);
  return (data as VdiSessionLeaseRow) ?? null;
}

// ── Execution Leases ──────────────────────────────────────────────────────────

export async function grantExecutionLease(args: {
  desktopId: string;
  executionId: string;
  agentId: string;
  ttlMs: number;
  scope: TenantScope;
}): Promise<VdiExecutionLeaseRow> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + args.ttlMs).toISOString();

  const { data, error } = await sb()
    .from('vdi_execution_leases')
    .upsert({
      desktop_id: args.desktopId,
      execution_id: args.executionId,
      agent_id: args.agentId,
      granted_at: now,
      expires_at: expiresAt,
      revoked_at: null,
      revoked_by: null,
      revoked_reason: null,
    }, { onConflict: 'desktop_id,agent_id' })
    .select()
    .single();

  if (error) throw new Error(`vdi grantExecutionLease failed: ${error.message}`);

  // Update desktop with execution lease info
  const { data: desktop } = await sb()
    .from('vdi_desktops')
    .select('generation')
    .eq('desktop_id', args.desktopId)
    .eq('tenant_id', args.scope.tenantId)
    .eq('workspace_id', args.scope.workspaceId)
    .single();

  await sb()
    .from('vdi_desktops')
    .update({
      execution_lease_id: args.executionId,
      execution_lease_agent_id: args.agentId,
      execution_lease_expires_at: expiresAt,
      generation: (desktop?.generation ?? 0) + 1,
    })
    .eq('desktop_id', args.desktopId)
    .eq('tenant_id', args.scope.tenantId)
    .eq('workspace_id', args.scope.workspaceId)
    .eq('generation', desktop?.generation ?? 0);

  return data as VdiExecutionLeaseRow;
}

export async function revokeExecutionLease(
  desktopId: string,
  executionId: string,
  scope: TenantScope,
  revokedBy: string,
  revokedReason: string
): Promise<void> {
  const now = new Date().toISOString();

  await sb()
    .from('vdi_execution_leases')
    .update({
      revoked_at: now,
      revoked_by: revokedBy,
      revoked_reason: revokedReason,
    })
    .eq('desktop_id', desktopId)
    .eq('execution_id', executionId);

  // Clear execution lease from desktop if it matches
  const { data: desktop } = await sb()
    .from('vdi_desktops')
    .select('generation')
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .single();

  await sb()
    .from('vdi_desktops')
    .update({
      execution_lease_id: null,
      execution_lease_agent_id: null,
      execution_lease_expires_at: null,
      generation: (desktop?.generation ?? 0) + 1,
    })
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('execution_lease_id', executionId)
    .eq('generation', desktop?.generation ?? 0);
}

export async function getActiveExecutionLease(desktopId: string, scope: TenantScope): Promise<VdiExecutionLeaseRow | null> {
  const { data, error } = await sb()
    .from('vdi_execution_leases')
    .select()
    .eq('desktop_id', desktopId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`vdi getActiveExecutionLease failed: ${error.message}`);
  return (data as VdiExecutionLeaseRow) ?? null;
}

// ── Connection Grants ─────────────────────────────────────────────────────────

export async function createConnectionGrant(args: {
  desktopId: string;
  sessionLeaseId: string;
  grantToken: string;
  protocol: string;
  ttlMs: number;
}): Promise<VdiConnectionGrantRow> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + args.ttlMs).toISOString();

  const { data, error } = await sb()
    .from('vdi_connection_grants')
    .insert({
      desktop_id: args.desktopId,
      session_lease_id: args.sessionLeaseId,
      grant_token: args.grantToken,
      protocol: args.protocol,
      granted_at: now,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw new Error(`vdi createConnectionGrant failed: ${error.message}`);
  return data as VdiConnectionGrantRow;
}

export async function revokeConnectionGrants(
  desktopId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  await sb()
    .from('vdi_connection_grants')
    .update({
      revoked_at: now,
      revoked_reason: reason,
    })
    .eq('desktop_id', desktopId)
    .is('revoked_at', null);
}

export async function validateConnectionGrant(
  grantToken: string
): Promise<{ desktopId: string; sessionLeaseId: string; protocol: string } | null> {
  const { data, error } = await sb()
    .from('vdi_connection_grants')
    .select('desktop_id, session_lease_id, protocol')
    .eq('grant_token', grantToken)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`vdi validateConnectionGrant failed: ${error.message}`);
  return data ? { desktopId: data.desktop_id, sessionLeaseId: data.session_lease_id, protocol: data.protocol } : null;
}

// ── Input Control Leases (exclusive keyboard/mouse) ──────────────────────────

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

  // Revoke any existing active input control lease
  await sb()
    .from('vdi_input_control_leases')
    .update({
      revoked_at: now,
      revoked_reason: 'takeover',
    })
    .eq('desktop_id', args.desktopId)
    .is('revoked_at', null)
    .gt('expires_at', now);

  // Update desktop with new input control lease
  const { data: desktop } = await sb()
    .from('vdi_desktops')
    .select('generation')
    .eq('desktop_id', args.desktopId)
    .eq('tenant_id', args.scope.tenantId)
    .eq('workspace_id', args.scope.workspaceId)
    .single();

  if (!desktop) {
    throw new Error(`Desktop ${args.desktopId} not found`);
  }

  const { data: updateData, error } = await sb()
    .from('vdi_desktops')
    .update({
      input_control_lease_id: args.leaseId,
      input_control_lease_type: args.holderType,
      input_control_lease_expires_at: expiresAt,
      generation: desktop.generation + 1,
    })
    .eq('desktop_id', args.desktopId)
    .eq('tenant_id', args.scope.tenantId)
    .eq('workspace_id', args.scope.workspaceId)
    .eq('generation', desktop.generation)
    .select()
    .single();

  if (error) throw new Error(`vdi grantInputControlLease (desktop update) failed: ${error.message}`);
  if (!updateData) throw new Error(`Desktop ${args.desktopId} generation mismatch during input control grant`);

  const { data: leaseData, error: leaseError } = await sb()
    .from('vdi_input_control_leases')
    .insert({
      desktop_id: args.desktopId,
      lease_id: args.leaseId,
      holder_type: args.holderType,
      holder_id: args.holderId,
      granted_at: now,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (leaseError) throw new Error(`vdi grantInputControlLease failed: ${leaseError.message}`);
  return leaseData as VdiInputControlLeaseRow;
}

export async function revokeInputControlLease(
  desktopId: string,
  leaseId: string,
  scope: TenantScope,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();

  await sb()
    .from('vdi_input_control_leases')
    .update({
      revoked_at: now,
      revoked_reason: reason,
    })
    .eq('desktop_id', desktopId)
    .eq('lease_id', leaseId);

  const { data: desktop } = await sb()
    .from('vdi_desktops')
    .select('generation')
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .single();

  if (desktop) {
    await sb()
      .from('vdi_desktops')
      .update({
        input_control_lease_id: null,
        input_control_lease_type: null,
        input_control_lease_expires_at: null,
        generation: desktop.generation + 1,
      })
      .eq('desktop_id', desktopId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('input_control_lease_id', leaseId)
      .eq('generation', desktop.generation);
  }
}

export async function getActiveInputControlLease(desktopId: string, scope: TenantScope): Promise<VdiInputControlLeaseRow | null> {
  const { data, error } = await sb()
    .from('vdi_input_control_leases')
    .select()
    .eq('desktop_id', desktopId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`vdi getActiveInputControlLease failed: ${error.message}`);
  return (data as VdiInputControlLeaseRow) ?? null;
}

// ── Operation Keys (idempotent provisioning) ─────────────────────────────────

export async function checkOperationKey(operationKey: string): Promise<{ desktopId: string } | { status: 'in_progress' } | null> {
  const { data, error } = await sb()
    .from('vdi_operation_keys')
    .select('status, desktop_id, provider_id')
    .eq('operation_key', operationKey)
    .maybeSingle();

  if (error) throw new Error(`vdi checkOperationKey failed: ${error.message}`);
  if (!data) return null;

  if (data.status === 'completed' && data.desktop_id) {
    return { desktopId: data.desktop_id };
  }
  if (data.status === 'in_progress') {
    return { status: 'in_progress' };
  }
  return null;
}

export async function recordOperationKey(operationKey: string, outcome: { desktopId: string; providerId: string } | { error: string }): Promise<void> {
  const now = new Date().toISOString();
  const status = 'desktopId' in outcome ? 'completed' : 'failed';

  const { error } = await sb()
    .from('vdi_operation_keys')
    .upsert({
      operation_key: operationKey,
      tenant_id: operationKey.split(':')[2], // extract tenant from key format
      workspace_id: operationKey.split(':')[3], // extract workspace from key format
      spec_hash: operationKey.split(':')[4], // extract spec hash
      status,
      desktop_id: 'desktopId' in outcome ? outcome.desktopId : null,
      provider_id: 'desktopId' in outcome ? outcome.providerId : null,
      error_message: 'error' in outcome ? outcome.error : null,
      completed_at: now,
    }, { onConflict: 'operation_key' });

  if (error) throw new Error(`vdi recordOperationKey failed: ${error.message}`);
}

// ── Evidence ──────────────────────────────────────────────────────────────────

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
  const { error } = await sb()
    .from('vdi_evidence')
    .insert({
      desktop_id: event.desktopId,
      operation_key: event.operationKey ?? null,
      operation_type: event.operationType,
      desired_state: event.desiredState ?? null,
      observed_state: event.observedState ?? null,
      timing_ms: event.timingMs ?? null,
      failure_class: event.failureClass ?? null,
      metadata: event.metadata ?? null,
    });

  if (error) throw new Error(`vdi recordEvidence failed: ${error.message}`);
}

// ── Fleet Observations (VDI-3A) ──────────────────────────────────────────────

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
  // RPC vdi_record_observation: locks the row, drops stale writes
  // (older collectedAt can never overwrite newer), and coalesces NULL
  // provider fields so an outage keeps the last good report.
  const { error } = await sb().rpc('vdi_record_observation', {
    p_desktop_id: outcome.desktopId,
    p_provider_reachable: outcome.providerReachable,
    p_provider_phase: outcome.providerPhase,
    p_provider_class: outcome.providerClass,
    p_provider_observed_at: outcome.providerObservedAt,
    p_provider_error: outcome.providerError,
    p_guest_display_healthy: outcome.guestDisplayHealthy,
    p_guest_error: outcome.guestError,
    p_guest_observed_at: outcome.guestObservedAt,
    p_broker_phase: outcome.brokerPhase,
    p_generation: outcome.generation,
    p_session_lease_active: outcome.sessionLeaseActive,
    p_execution_lease_active: outcome.executionLeaseActive,
    p_input_control_holder: outcome.inputControlHolder,
    p_last_operation_key: outcome.lastOperationKey,
    p_checked_at: outcome.collectedAt ?? new Date().toISOString(),
  });

  if (error) throw new Error(`vdi recordObservation failed: ${error.message}`);
}

export async function getObservation(desktopId: string): Promise<{
  providerPhase: string | null;
  providerClass: string | null;
  providerObservedAt: string | null;
  [k: string]: unknown;
} | null> {
  const { data, error } = await sb()
    .from('vdi_observations')
    .select()
    .eq('desktop_id', desktopId)
    .maybeSingle();

  if (error) throw new Error(`vdi getObservation failed: ${error.message}`);
  if (!data) return null;
  // Normalize snake_case row → camelCase (console reads camelCase; the memory
  // store returns camelCase natively — this is the shared boundary).
  const r = data as Record<string, unknown>;
  return {
    desktopId: r.desktop_id,
    providerReachable: r.provider_reachable,
    providerPhase: r.provider_phase,
    providerClass: r.provider_class,
    providerObservedAt: r.provider_observed_at,
    providerError: r.provider_error,
    guestDisplayHealthy: r.guest_display_healthy,
    guestError: r.guest_error,
    guestObservedAt: r.guest_observed_at,
    brokerPhase: r.broker_phase,
    generation: r.generation,
    sessionLeaseActive: r.session_lease_active,
    executionLeaseActive: r.execution_lease_active,
    inputControlHolder: r.input_control_holder,
    lastOperationKey: r.last_operation_key,
    checkedAt: r.checked_at,
  } as { providerPhase: string | null; providerClass: string | null; providerObservedAt: string | null; [k: string]: unknown };
}

// ── Can Suspend Check (atomic, uses denormalized lease state) ────────────────

export async function canSuspendDesktop(desktopId: string, scope: TenantScope): Promise<boolean> {
  const { data, error } = await sb()
    .from('vdi_desktops')
    .select('session_lease_expires_at, execution_lease_expires_at')
    .eq('desktop_id', desktopId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (error) throw new Error(`vdi canSuspendDesktop failed: ${error.message}`);
  if (!data) return false;

  const now = new Date().toISOString();
  const hasActiveSession = data.session_lease_expires_at && data.session_lease_expires_at > now;
  const hasActiveExecution = data.execution_lease_expires_at && data.execution_lease_expires_at > now;

  return !hasActiveSession && !hasActiveExecution;
}

// ── Workspace Authorization ───────────────────────────────────────────────────

export async function validateWorkspaceMembership(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data, error } = await sb()
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`vdi validateWorkspaceMembership failed: ${error.message}`);
  return !!data;
}

export async function validateWorkspaceOwnership(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const { data, error } = await sb()
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`vdi validateWorkspaceOwnership failed: ${error.message}`);
  return !!data;
}
// ── Alerts (VDI-3C) ──────────────────────────────────────────────────────────

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
  evaluatedAt?: string;
}): Promise<string | null> {
  const { data, error } = await sb().rpc('vdi_upsert_alert', {
    p_desktop_id: args.desktopId,
    p_tenant_id: args.tenantId,
    p_workspace_id: args.workspaceId,
    p_rule: args.rule,
    p_severity: args.severity,
    p_generation: args.generation,
    p_detail: args.detail,
    p_resolve: args.resolve,
    p_evidence_at: args.evidenceAt ?? null,
    p_now: args.evaluatedAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(`vdi upsertAlert failed: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function listAlerts(scope: TenantScope, status?: 'open' | 'resolved'): Promise<Array<Record<string, unknown>>> {
  let q = sb().from('vdi_alerts').select()
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(`vdi listAlerts failed: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(r => ({
    desktopId: r.desktop_id,
    rule: r.rule,
    severity: r.severity,
    generation: r.generation,
    status: r.status,
    firstObservedAt: r.first_observed_at,
    lastEvaluatedAt: r.last_evaluated_at,
    resolvedAt: r.resolved_at,
    detail: r.detail,
  }));
}

// ── Usage accounting (VDI-3C) ────────────────────────────────────────────────

export async function getUsageRecord(providerId: string, intervalStart: string, intervalEnd: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb()
    .from('vdi_usage_records')
    .select()
    .eq('provider_id', providerId)
    .eq('interval_start', intervalStart)
    .eq('interval_end', intervalEnd)
    .maybeSingle();
  if (error) throw new Error(`vdi getUsageRecord failed: ${error.message}`);
  return (data as Record<string, unknown>) ?? null;
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
  // Idempotent on (provider_id, interval_start, interval_end): ignoreDuplicates
  // makes replayed intervals a no-op; the unique index is the real guarantee.
  const { error } = await sb()
    .from('vdi_usage_records')
    .upsert({
      tenant_id: args.tenantId, workspace_id: args.workspaceId,
      desktop_id: args.desktopId, provider_id: args.providerId,
      interval_start: args.intervalStart, interval_end: args.intervalEnd,
      phase_at_start: args.phaseAtStart, phase_at_end: args.phaseAtEnd,
      completeness: args.completeness, gap_reason: args.gapReason,
      source: args.source, runtime_seconds: args.runtimeSeconds,
      estimated_cost_usd: args.estimatedCostUsd,
      estimate_rate_version: args.estimateRateVersion,
      provider_reported_cost_usd: args.providerReportedCostUsd,
    }, { onConflict: 'provider_id,interval_start,interval_end', ignoreDuplicates: true });
  if (error) throw new Error(`vdi recordUsage failed: ${error.message}`);
}

export async function listUsage(scope: TenantScope): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await sb()
    .from('vdi_usage_records')
    .select()
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('interval_start', { ascending: true });
  if (error) throw new Error(`vdi listUsage failed: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(r => ({
    providerId: r.provider_id,
    intervalStart: r.interval_start,
    intervalEnd: r.interval_end,
    completeness: r.completeness,
    runtimeSeconds: r.runtime_seconds,
    estimatedCostUsd: r.estimated_cost_usd,
    estimateRateVersion: r.estimate_rate_version,
    providerReportedCostUsd: r.provider_reported_cost_usd,
  }));
}

// ── Remediation attempts (VDI-4A) ────────────────────────────────────────────

export async function recordRemediationAttempt(args: {
  desktopId: string;
  tenantId: string;
  workspaceId: string;
  rule: string;
  policyVersion: string;
  limit: number;
  attemptedAt: string;
}): Promise<number> {
  const { data, error } = await sb().rpc('vdi_record_remediation_attempt', {
    p_desktop_id: args.desktopId,
    p_tenant_id: args.tenantId,
    p_workspace_id: args.workspaceId,
    p_rule: args.rule,
    p_policy_version: args.policyVersion,
    p_limit: args.limit,
    p_now: args.attemptedAt,
  });
  if (error) throw new Error(`vdi recordRemediationAttempt failed: ${error.message}`);
  return (data as number) ?? -1;
}

export async function getRemediationAttempts(desktopId: string): Promise<Array<{
  rule: string; policyVersion: string; attemptCount: number;
  lastAttemptAt: string | null; escalated: boolean; escalatedAt: string | null;
}>> {
  const { data, error } = await sb()
    .from('vdi_remediation_attempts')
    .select()
    .eq('desktop_id', desktopId);
  if (error) throw new Error(`vdi getRemediationAttempts failed: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map(r => ({
    rule: r.rule as string,
    policyVersion: r.policy_version as string,
    attemptCount: r.attempt_count as number,
    lastAttemptAt: (r.last_attempt_at as string) ?? null,
    escalated: r.escalated as boolean,
    escalatedAt: (r.escalated_at as string) ?? null,
  }));
}

// ── Remediation operations (VDI-4B) ─────────────────────────────────────────

export async function claimRemediationOperation(args: {
  operationKey: string; tenantId: string; workspaceId: string; desktopId: string;
  desktopGeneration: number; action: string; reason: string;
  proposal: Record<string, unknown>; policyVersion: string;
  proposedAt: string; expiresAt: string; workerId: string;
  attemptLimit: number; attemptRule: string;
}): Promise<{ claimed: boolean; status: string; owner: string | null; attemptNumber: number | null }> {
  const { data, error } = await sb().rpc('vdi_claim_remediation_operation', {
    p_operation_key: args.operationKey,
    p_tenant_id: args.tenantId,
    p_workspace_id: args.workspaceId,
    p_desktop_id: args.desktopId,
    p_desktop_generation: args.desktopGeneration,
    p_action: args.action,
    p_reason: args.reason,
    p_proposal: args.proposal,
    p_policy_version: args.policyVersion,
    p_proposed_at: args.proposedAt,
    p_expires_at: args.expiresAt,
    p_worker_id: args.workerId,
    p_attempt_limit: args.attemptLimit,
    p_attempt_rule: args.attemptRule,
  });
  if (error) throw new Error(`vdi claimRemediationOperation failed: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    claimed: (r.claimed as boolean) ?? false,
    status: (r.status as string) ?? 'unknown',
    owner: (r.owner as string | null) ?? null,
    attemptNumber: (r.attempt_number as number | null) ?? null,
  };
}

export async function updateRemediationOperation(args: {
  operationKey: string; workerId: string;
  newStatus: 'dispatched' | 'success' | 'refused' | 'exhausted' | 'reconciling' | 'unresolved';
  outcomeEvidence?: Record<string, unknown> | null;
  refusalReason?: string | null;
}): Promise<boolean> {
  const { data, error } = await sb().rpc('vdi_update_remediation_operation', {
    p_operation_key: args.operationKey,
    p_worker_id: args.workerId,
    p_new_status: args.newStatus,
    p_outcome_evidence: args.outcomeEvidence ?? null,
    p_refusal_reason: args.refusalReason ?? null,
  });
  if (error) throw new Error(`vdi updateRemediationOperation failed: ${error.message}`);
  return (data as boolean) ?? false;
}

export async function getRemediationOperation(operationKey: string): Promise<{
  status: string; workerId: string | null; attemptNumber: number | null;
  outcomeEvidence: Record<string, unknown> | null; refusalReason: string | null;
} | null> {
  const { data, error } = await sb()
    .from('vdi_remediation_operations')
    .select('status, worker_id, attempt_number, outcome_evidence, refusal_reason')
    .eq('operation_key', operationKey)
    .maybeSingle();
  if (error) throw new Error(`vdi getRemediationOperation failed: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    status: r.status as string,
    workerId: (r.worker_id as string | null) ?? null,
    attemptNumber: (r.attempt_number as number | null) ?? null,
    outcomeEvidence: (r.outcome_evidence as Record<string, unknown> | null) ?? null,
    refusalReason: (r.refusal_reason as string | null) ?? null,
  };
}

// ── Budget admission (VDI-4C) ─────────────────────────────────────────────────

export async function admitReservation(args: {
  operationKey: string; tenantId: string; workspaceId: string; budgetPeriod: string;
  currency: string; amountMicros: number | null; unknownCeilingMicros: number | null;
  resourceSpec: Record<string, unknown>; pricingVersion: string; horizonExpiresAt: string;
}): Promise<{ admitted: boolean; replay: boolean; reason?: string; amountMicros?: number; pricingKnown?: boolean; status?: string }> {
  const { data, error } = await sb().rpc('vdi_admit_reservation', {
    p_operation_key: args.operationKey,
    p_tenant_id: args.tenantId,
    p_workspace_id: args.workspaceId,
    p_budget_period: args.budgetPeriod,
    p_currency: args.currency,
    p_amount_micros: args.amountMicros,
    p_unknown_ceiling_micros: args.unknownCeilingMicros,
    p_resource_spec: args.resourceSpec,
    p_pricing_version: args.pricingVersion,
    p_horizon_expires_at: args.horizonExpiresAt,
  });
  if (error) throw new Error(`vdi admitReservation failed: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    admitted: (r.admitted as boolean) ?? false,
    replay: (r.replay as boolean) ?? false,
    reason: (r.reason as string) ?? undefined,
    amountMicros: (r.amount_micros as number) ?? undefined,
    pricingKnown: (r.pricing_known as boolean) ?? undefined,
    status: (r.status as string) ?? undefined,
  };
}

export async function resolveProvisioning(args: {
  operationKey: string; outcome: 'uncertain' | 'failed'; now: string;
}): Promise<{ ok: boolean; status?: string; reason?: string }> {
  const { data, error } = await sb().rpc('vdi_resolve_provisioning', {
    p_operation_key: args.operationKey,
    p_outcome: args.outcome,
    p_now: args.now,
  });
  if (error) throw new Error(`vdi resolveProvisioning failed: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: (r.ok as boolean) ?? false, status: (r.status as string) ?? undefined, reason: (r.reason as string) ?? undefined };
}

export async function settleReservation(args: {
  operationKey: string; actualMicros: number; blockAdmissionOnOverrun: boolean; now: string;
}): Promise<{ ok: boolean; replay: boolean; settledMicros?: number; overrunRecorded?: number; reason?: string }> {
  const { data, error } = await sb().rpc('vdi_settle_reservation', {
    p_operation_key: args.operationKey,
    p_actual_micros: args.actualMicros,
    p_block_admission_on_overrun: args.blockAdmissionOnOverrun,
    p_now: args.now,
  });
  if (error) throw new Error(`vdi settleReservation failed: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: (r.ok as boolean) ?? false,
    replay: (r.replay as boolean) ?? false,
    settledMicros: (r.settled_micros as number) ?? undefined,
    overrunRecorded: (r.overrun_recorded as number) ?? undefined,
    reason: (r.reason as string) ?? undefined,
  };
}

export async function adjustSettledCharge(args: {
  operationKey: string; chargeMicros: number; now: string;
}): Promise<{ ok: boolean; replay: boolean; deltaMicros?: number; reason?: string }> {
  const { data, error } = await sb().rpc('vdi_adjust_settled_charge', {
    p_operation_key: args.operationKey,
    p_charge_micros: args.chargeMicros,
    p_now: args.now,
  });
  if (error) throw new Error(`vdi adjustSettledCharge failed: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: (r.ok as boolean) ?? false,
    replay: (r.replay as boolean) ?? false,
    deltaMicros: (r.delta_micros as number) ?? undefined,
    reason: (r.reason as string) ?? undefined,
  };
}

export async function extendReservationHorizon(args: {
  operationKey: string; newHorizon: string; now: string;
}): Promise<boolean> {
  const { data, error } = await sb().rpc('vdi_extend_reservation_horizon', {
    p_operation_key: args.operationKey,
    p_new_horizon: args.newHorizon,
    p_now: args.now,
  });
  if (error) throw new Error(`vdi extendReservationHorizon failed: ${error.message}`);
  return (data as boolean) ?? false;
}

export async function getBudget(args: {
  tenantId: string; workspaceId: string; budgetPeriod: string;
}): Promise<{ limitMicros: number; accountedSpendMicros: number; overrunMicros: number; admissionBlocked: boolean } | null> {
  const { data, error } = await sb()
    .from('vdi_budgets')
    .select('limit_micros, accounted_spend_micros, overrun_micros, admission_blocked')
    .eq('tenant_id', args.tenantId)
    .eq('workspace_id', args.workspaceId)
    .eq('budget_period', args.budgetPeriod)
    .maybeSingle();
  if (error) throw new Error(`vdi getBudget failed: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    limitMicros: r.limit_micros as number,
    accountedSpendMicros: r.accounted_spend_micros as number,
    overrunMicros: r.overrun_micros as number,
    admissionBlocked: (r.admission_blocked as boolean) ?? false,
  };
}

export async function getReservation(operationKey: string): Promise<{
  status: string; amountMicros: number; budgetPeriod: string;
  pricingKnown: boolean; settledMicros: number | null;
  providerChargeAdjustmentsMicros: number; horizonExpiresAt: string; reconciling: boolean;
} | null> {
  const { data, error } = await sb()
    .from('vdi_budget_reservations')
    .select('status, amount_micros, budget_period, pricing_known, settled_micros, provider_charge_adjustments_micros, horizon_expires_at, reconciling')
    .eq('operation_key', operationKey)
    .maybeSingle();
  if (error) throw new Error(`vdi getReservation failed: ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    status: r.status as string,
    amountMicros: r.amount_micros as number,
    budgetPeriod: r.budget_period as string,
    pricingKnown: (r.pricing_known as boolean) ?? false,
    settledMicros: (r.settled_micros as number) ?? null,
    providerChargeAdjustmentsMicros: (r.provider_charge_adjustments_micros as number) ?? 0,
    horizonExpiresAt: r.horizon_expires_at as string,
    reconciling: (r.reconciling as boolean) ?? false,
  };
}
