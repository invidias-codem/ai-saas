// lib/acquisition/store/acquisitionStore.ts
// The ONLY place that touches Supabase for the Acquisition Plane. Webhook
// route and Trigger task call these; they never scatter queries.
//
// claimIngestion() is the authoritative replay lock: an atomic
// status-transition guarded by operation_key identity — NOT application
// timing.

import { supabaseAdmin } from '@/lib/supabaseClient';
import type { RawEvidence } from '../contracts';

export interface AcquisitionRequestRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  request_id: string;
  mode: string;
  objective: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ProviderRunRow {
  id: string;
  acquisition_request_id: string;
  provider: string;
  provider_run_id: string;
  provider_actor_id: string | null;
  dataset_id: string | null;
  operation_key: string | null;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  estimated_cost_usd: number | null;
  final_cost_usd: number | null;
  authorized_max_cost_usd: number | null;
  authorized_max_records: number | null;
  record_count: number | null;
  trigger_run_id: string | null;
  provider_started_at: string | null;
  provider_completed_at: string | null;
  ingestion_started_at: string | null;
  ingestion_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function sb() {
  if (!supabaseAdmin) throw new Error('supabaseAdmin not configured');
  return supabaseAdmin;
}

export async function createRequest(args: {
  userId: string;
  workspaceId?: string | null;
  requestId: string;
  mode: 'resource' | 'discovery';
  objective: string;
}): Promise<AcquisitionRequestRow> {
  const { data, error } = await sb()
    .from('acquisition_requests')
    .upsert(
      {
        user_id: args.userId,
        workspace_id: args.workspaceId ?? null,
        request_id: args.requestId,
        mode: args.mode,
        objective: args.objective,
        status: 'queued',
      },
      { onConflict: 'request_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`acquisition createRequest failed: ${error.message}`);
  return data as ProviderRunRow as unknown as AcquisitionRequestRow;
}

export async function getRequestByRequestId(requestId: string): Promise<AcquisitionRequestRow | null> {
  const { data, error } = await sb()
    .from('acquisition_requests')
    .select()
    .eq('request_id', requestId)
    .maybeSingle();
  if (error) throw new Error(`acquisition getRequest failed: ${error.message}`);
  return (data as AcquisitionRequestRow) ?? null;
}

export async function attachProviderRun(args: {
  acquisitionRequestId: string;
  provider: string;
  providerRunId: string;
  providerActorId?: string | null;
  datasetId?: string | null;
  operationKey: string;
  authorizedMaxCostUsd: number;
  authorizedMaxRecords: number;
}): Promise<ProviderRunRow | null> {
  // Idempotent by (provider, provider_run_id) — a duplicate attach returns
  // the EXISTING row, never a second one.
  const { data, error } = await sb()
    .from('acquisition_provider_runs')
    .upsert(
      {
        acquisition_request_id: args.acquisitionRequestId,
        provider: args.provider,
        provider_run_id: args.providerRunId,
        provider_actor_id: args.providerActorId ?? null,
        dataset_id: args.datasetId ?? null,
        operation_key: args.operationKey,
        status: 'provider_running',
        authorized_max_cost_usd: args.authorizedMaxCostUsd,
        authorized_max_records: args.authorizedMaxRecords,
        provider_started_at: new Date().toISOString(),
      },
      { onConflict: 'provider,provider_run_id', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error) throw new Error(`acquisition attachProviderRun failed: ${error.message}`);
  // ignoreDuplicates returns no row on conflict → fetch the existing one.
  if (data) return data as ProviderRunRow;
  return getProviderRun(args.provider, args.providerRunId);
}

export async function getProviderRun(provider: string, providerRunId: string): Promise<ProviderRunRow | null> {
  const { data, error } = await sb()
    .from('acquisition_provider_runs')
    .select()
    .eq('provider', provider)
    .eq('provider_run_id', providerRunId)
    .maybeSingle();
  if (error) throw new Error(`acquisition getProviderRun failed: ${error.message}`);
  return (data as ProviderRunRow) ?? null;
}

export async function markProviderTerminal(args: {
  provider: string;
  providerRunId: string;
  status: 'ingesting' | 'failed';
  failureCode?: string | null;
  failureMessage?: string | null;
  estimatedCostUsd?: number | null;
}): Promise<void> {
  const { error } = await sb()
    .from('acquisition_provider_runs')
    .update({
      status: args.status,
      ...(args.failureCode !== undefined ? { failure_code: args.failureCode } : {}),
      ...(args.failureMessage !== undefined ? { failure_message: args.failureMessage } : {}),
      ...(args.estimatedCostUsd !== undefined ? { estimated_cost_usd: args.estimatedCostUsd } : {}),
      provider_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('provider', args.provider)
    .eq('provider_run_id', args.providerRunId);
  if (error) throw new Error(`acquisition markProviderTerminal failed: ${error.message}`);
}

/**
 * ATOMIC ingestion claim — the authoritative replay lock.
 * Transitions provider_pending|provider_running → ingesting for the row
 * owning operationKey. Returns false when already ingesting/terminal:
 * duplicate webhooks and racing workers lose here, deterministically.
 */
export async function claimIngestion(operationKey: string): Promise<ProviderRunRow | null> {
  const { data, error } = await sb()
    .from('acquisition_provider_runs')
    .update({ status: 'ingesting', ingestion_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('operation_key', operationKey)
    .in('status', ['provider_pending', 'provider_running'])
    .select()
    .maybeSingle();
  if (error) throw new Error(`acquisition claimIngestion failed: ${error.message}`);
  return (data as ProviderRunRow) ?? null;
}

/** Re-read the claimed row regardless of status (post-claim identity check). */
export async function getProviderRunByOperationKey(operationKey: string): Promise<ProviderRunRow | null> {
  const { data, error } = await sb()
    .from('acquisition_provider_runs')
    .select()
    .eq('operation_key', operationKey)
    .maybeSingle();
  if (error) throw new Error(`acquisition getProviderRunByOperationKey failed: ${error.message}`);
  return (data as ProviderRunRow) ?? null;
}

export async function persistRawEvidence(args: {
  acquisitionRequestId: string;
  evidence: RawEvidence[];
  now: string;
}): Promise<number> {
  if (args.evidence.length === 0) return 0;
  const rows = args.evidence.map((e, ordinal) => ({
    acquisition_request_id: args.acquisitionRequestId,
    provider_run_id: e.retrievalMetadata.providerRunId,
    ordinal,
    content_hash: e.contentHash,
    raw_json: e.raw as object,
    provider: e.retrievalMetadata.provider,
    provider_actor_id: e.retrievalMetadata.providerActorId ?? null,
    dataset_id: e.retrievalMetadata.datasetId ?? null,
    retrieved_at: e.retrievalMetadata.retrievedAt,
  }));
  // Idempotent on (provider_run_id, ordinal, content_hash): crash-retry
  // re-inserts the same rows and conflicts harmlessly.
  const { error } = await sb()
    .from('acquisition_raw_evidence')
    .upsert(rows, { onConflict: 'provider_run_id,ordinal,content_hash', ignoreDuplicates: true });
  if (error) throw new Error(`acquisition persistRawEvidence failed: ${error.message}`);
  return rows.length;
}

export async function countRawEvidence(providerRunId: string): Promise<number> {
  const { count, error } = await sb()
    .from('acquisition_raw_evidence')
    .select('id', { count: 'exact', head: true })
    .eq('provider_run_id', providerRunId);
  if (error) throw new Error(`acquisition countRawEvidence failed: ${error.message}`);
  return count ?? 0;
}

export async function completeIngestion(args: {
  provider: string;
  providerRunId: string;
  recordCount: number;
  triggerRunId?: string | null;
}): Promise<void> {
  const { error } = await sb()
    .from('acquisition_provider_runs')
    .update({
      status: 'normalizing',
      record_count: args.recordCount,
      ...(args.triggerRunId !== undefined ? { trigger_run_id: args.triggerRunId } : {}),
      ingestion_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('provider', args.provider)
    .eq('provider_run_id', args.providerRunId);
  if (error) throw new Error(`acquisition completeIngestion failed: ${error.message}`);
}

export async function failAcquisition(args: {
  provider: string;
  providerRunId: string;
  failureCode: string;
  failureMessage?: string | null;
}): Promise<void> {
  const { error } = await sb()
    .from('acquisition_provider_runs')
    .update({
      status: 'failed',
      failure_code: args.failureCode,
      failure_message: args.failureMessage ?? null,
      ingestion_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('provider', args.provider)
    .eq('provider_run_id', args.providerRunId);
  if (error) throw new Error(`acquisition failAcquisition failed: ${error.message}`);
}

/** Post-settlement cost reconciliation (called ~10s after terminal state). */
export async function reconcileFinalCost(args: {
  provider: string;
  providerRunId: string;
  finalCostUsd: number;
}): Promise<void> {
  const { error } = await sb()
    .from('acquisition_provider_runs')
    .update({ final_cost_usd: args.finalCostUsd, updated_at: new Date().toISOString() })
    .eq('provider', args.provider)
    .eq('provider_run_id', args.providerRunId);
  if (error) throw new Error(`acquisition reconcileFinalCost failed: ${error.message}`);
}
