// lib/execution/durableApprovalStore.ts
// Supabase-backed human-in-the-loop approval store.
//
// Replaces the volatile in-memory `approvalStore` Map (5-min TTL, lost on
// serverless cold start) with a durable row in `durable_approvals`. The
// resume/approve flow claims the row via a guarded status transition so a
// paused tool can never be double-executed and survives redeploys.
//
// NOTE — durability contract: we do NOT serialize the live `Tool` object (its
// `execute`/`schema` are runtime functions). We persist `{ toolName, input,
// context }` and the resume route re-fetches the tool from the registry by
// name, then re-runs schema validation + `tool.execute(...)` while bypassing
// the approval gate (the action was already human-approved).

import { supabaseAdmin } from '@/lib/supabaseClient';
import type { AgentContext } from '@/lib/agents/core/types';

/**
 * Serializable subset of AgentContext. We intentionally drop non-serializable
 * runtime handles (ioHarness, onStep, rootSpan, promotionManager) — they are
 * not needed to re-execute an already-approved tool by name.
 */
export type SerializableAgentContext = Pick<
  AgentContext,
  'userId' | 'sessionId' | 'workspaceId' | 'userRole' | 'orgContext' | 'history' | 'enableTelemetry'
>;

export interface DurableApprovalPayload {
  toolName: string;
  input: unknown;
  context: SerializableAgentContext;
}

export interface DurableApprovalRecord {
  approvalId: string;
  userId: string;
  workspaceId: string | null;
  toolName: string;
  input: unknown;
  context: SerializableAgentContext;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}

function assertAdmin(): NonNullable<typeof supabaseAdmin> {
  if (!supabaseAdmin) {
    throw new Error(
      '[durableApprovalStore] supabaseAdmin is not configured — SUPABASE_SERVICE_ROLE_KEY missing.'
    );
  }
  return supabaseAdmin;
}

/** Register a paused tool; returns the approvalId. */
export async function registerDurableApproval(
  input: {
    userId: string;
    toolName: string;
    workspaceId?: string | null;
    input: unknown;
    context: SerializableAgentContext;
    approvalId?: string;
  }
): Promise<string> {
  const admin = assertAdmin();
  const approvalId = input.approvalId ?? crypto.randomUUID();

  const { error } = await admin.from('durable_approvals').insert({
    approval_id: approvalId,
    user_id: input.userId,
    workspace_id: input.workspaceId ?? null,
    tool_name: input.toolName,
    payload: {
      toolName: input.toolName,
      input: input.input,
      context: input.context,
    },
    status: 'PENDING',
  });

  if (error) {
    throw new Error(`[durableApprovalStore] register failed: ${error.message}`);
  }
  return approvalId;
}

/**
 * Atomically claim a PENDING approval as APPROVED. Returns the claimed record,
 * or null when it was already resolved/expired (prevents double execution).
 */
export async function approveDurable(approvalId: string): Promise<DurableApprovalRecord | null> {
  const admin = assertAdmin();
  const { data, error } = await admin
    .from('durable_approvals')
    .update({ status: 'APPROVED' })
    .eq('approval_id', approvalId)
    .eq('status', 'PENDING')
    .select('*')
    .single();

  if (error || !data) return null;
  return mapRow(data);
}

/** Mark a pending approval as REJECTED (idempotent). */
export async function rejectDurable(approvalId: string): Promise<boolean> {
  const admin = assertAdmin();
  const { error } = await admin
    .from('durable_approvals')
    .update({ status: 'REJECTED' })
    .eq('approval_id', approvalId)
    .eq('status', 'PENDING');
  return !error;
}

/** Drop a pending approval (denial timeout); idempotent. */
export async function dropDurableApproval(approvalId: string): Promise<boolean> {
  return rejectDurable(approvalId);
}

/**
 * Read the current record without side effects. Returns null when the row is
 * absent or has expired past its expires_at window.
 */
export async function getDurableApproval(approvalId: string): Promise<DurableApprovalRecord | null> {
  const admin = assertAdmin();
  const { data, error } = await admin
    .from('durable_approvals')
    .select('*')
    .eq('approval_id', approvalId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

type DurableRow = Record<string, unknown> & {
  approval_id: string;
  user_id: string;
  workspace_id: string | null;
  tool_name: string;
  payload: DurableApprovalPayload;
  status: DurableApprovalRecord['status'];
  created_at: string;
  expires_at: string;
};

function mapRow(row: DurableRow): DurableApprovalRecord {
  return {
    approvalId: row.approval_id,
    userId: row.user_id,
    workspaceId: row.workspace_id ?? null,
    toolName: row.tool_name,
    input: row.payload?.input,
    context: row.payload?.context,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}