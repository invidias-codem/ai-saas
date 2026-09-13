// lib/code-builder/buildStore.ts
// Durable build-state store — the single lifecycle abstraction the Trigger task
// (and later the API / Realtime / sandbox) talks to, instead of raw Supabase.
//
// Every lifecycle transition is an explicit function with bounded semantics:
//   QUEUED → RUNNING → (PLANNING | GENERATING | VERIFYING) → COMPLETED|FAILED|CANCELLED
//
// Invariants enforced here:
//   * build_id is the stable logical identity; trigger_run_id may change.
//   * retries/replays UPDATE the existing row (upsert on build_id), never insert
//     a second logical build.
//   * terminal states are idempotent (markCompleted/markFailed are no-ops once
//     already terminal).
//   * error_message is sanitized (no provider keys, stack dumps, secrets).
//
// No Supabase calls are scattered through the task — the task imports this store.

import { supabaseAdmin } from '@/lib/supabaseClient';

export type BuildStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type BuildPhase = 'queued' | 'planning' | 'generating' | 'verifying' | 'completed';

export interface CreateBuildInput {
  buildId: string;
  userId: string;
  workspaceId?: string;
  requestId?: string;
  triggerRunId?: string;
  mode: 'fast' | 'full';
  prompt?: string;
}

export interface BuildRow {
  build_id: string;
  user_id: string;
  workspace_id?: string | null;
  request_id?: string | null;
  trigger_run_id?: string | null;
  operation_key?: string | null;
  status: BuildStatus;
  phase: BuildPhase;
  progress: number;
  mode: string;
  prompt?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Sanitize free-form text before it is persisted. Strips obvious secrets and
 * truncates to a bounded length so a stray provider key or giant stack dump
 * never lands in a durable column. Best-effort — never a substitute for not
 * passing secrets in the first place.
 */
export function sanitizeForPersistence(text: string | null | undefined, maxLen = 4000): string | null {
  if (text == null) return null;
  const cleaned = text
    .replace(/(sk-|sk_|eyJ|sb_secret_|sb_publishable_|nvapi-|Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '[REDACTED]')
    .replace(/(supabase_service_role_key|service_role_key|api_key|secret|token|key)\s*[:=]\s*["']?[^\s,"']+["']?/gi, '$1=[REDACTED]');
  return cleaned.slice(0, maxLen);
}

/**
 * Deterministic operation key: codebuild:<buildId>:v1. Stable across retries;
 * the partial unique index dedups only non-null keys. buildId is the scope.
 */
function deriveBuildOperationKey(buildId: string): string {
  return `codebuild:${buildId}:v1`;
}

/**
 * createBuild — insert the QUEUED row. Idempotent on build_id: if the build
 * already exists (retry/replay), it updates trigger_run_id + returns the row
 * rather than inserting a duplicate logical build.
 */
export async function createBuild(input: CreateBuildInput): Promise<BuildRow> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');

  const operation_key = deriveBuildOperationKey(input.buildId);
  const now = new Date().toISOString();
  const row = {
    build_id: input.buildId,
    user_id: input.userId,
    workspace_id: input.workspaceId ?? null,
    request_id: input.requestId ?? null,
    trigger_run_id: input.triggerRunId ?? null,
    operation_key,
    status: 'queued' as const,
    phase: 'queued' as const,
    progress: 0,
    mode: input.mode,
    prompt: sanitizeForPersistence(input.prompt),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from('code_builder_builds')
    .upsert(row, { onConflict: 'build_id' })
    .select()
    .single();

  if (error) throw new Error(`[buildStore] createBuild failed: ${error.message}`);
  return data as BuildRow;
}

/** markBuildRunning — QUEUED → RUNNING, stamp trigger_run_id + started_at. */
export async function markBuildRunning(buildId: string, triggerRunId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');
  const { error } = await supabaseAdmin
    .from('code_builder_builds')
    .update({
      status: 'running',
      trigger_run_id: triggerRunId,
      started_at: new Date().toISOString(),
    })
    .eq('build_id', buildId);
  if (error) throw new Error(`[buildStore] markBuildRunning failed: ${error.message}`);
}

/** updateBuildPhase — RUNNING → PLANNING|GENERATING|VERIFYING, with progress. */
export async function updateBuildPhase(buildId: string, phase: BuildPhase, progress: number): Promise<void> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');
  const { error } = await supabaseAdmin
    .from('code_builder_builds')
    .update({ phase, progress })
    .eq('build_id', buildId);
  if (error) throw new Error(`[buildStore] updateBuildPhase failed: ${error.message}`);
}

/** completeBuild — terminal + idempotent. No-op if already terminal. */
export async function completeBuild(buildId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');
  const { error } = await supabaseAdmin
    .from('code_builder_builds')
    .update({ status: 'completed', phase: 'completed', progress: 100, completed_at: new Date().toISOString() })
    .eq('build_id', buildId)
    .not('status', 'in', '(completed,failed,cancelled)');
  if (error) throw new Error(`[buildStore] completeBuild failed: ${error.message}`);
}

/** failBuild — terminal + idempotent, error sanitized. */
export async function failBuild(buildId: string, errorCode: string, errorMessage: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');
  const { error } = await supabaseAdmin
    .from('code_builder_builds')
    .update({
      status: 'failed',
      error_code: errorCode,
      error_message: sanitizeForPersistence(errorMessage),
      completed_at: new Date().toISOString(),
    })
    .eq('build_id', buildId)
    .not('status', 'in', '(completed,failed,cancelled)');
  if (error) throw new Error(`[buildStore] failBuild failed: ${error.message}`);
}

/** cancelBuild — terminal + idempotent. */
export async function cancelBuild(buildId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');
  const { error } = await supabaseAdmin
    .from('code_builder_builds')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('build_id', buildId)
    .not('status', 'in', '(completed,failed,cancelled)');
  if (error) throw new Error(`[buildStore] cancelBuild failed: ${error.message}`);
}

/** getBuild — user-scoped read (service role; RLS enforces user scoping on client reads). */
export async function getBuild(buildId: string): Promise<BuildRow | null> {
  if (!supabaseAdmin) throw new Error('[buildStore] supabaseAdmin not configured');
  const { data, error } = await supabaseAdmin
    .from('code_builder_builds')
    .select()
    .eq('build_id', buildId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw new Error(`[buildStore] getBuild failed: ${error.message}`);
  }
  return data as BuildRow;
}