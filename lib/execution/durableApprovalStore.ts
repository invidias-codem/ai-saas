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
  if (!input.userId || input.context.userId !== input.userId || (input.context.workspaceId ?? null) !== (input.workspaceId ?? null)) {
    throw new Error('Approval context scope mismatch');
  }
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

/** Owner-scoped, unexpired pending transition; no unscoped mutation API. */
async function resolveDurable(approvalId: string, userId: string, status: 'APPROVED' | 'REJECTED'): Promise<DurableApprovalRecord | null> {
  if (!userId || !approvalId) return null;
  const { data, error } = await assertAdmin().from('durable_approvals')
    .update({ status })
    .eq('approval_id', approvalId)
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle();
  if (error) throw new Error('Approval transition unavailable');
  return data ? mapRow(data) : null;
}
export function approveDurable(approvalId: string, userId: string) {
  return resolveDurable(approvalId, userId, 'APPROVED');
}
export async function rejectDurable(approvalId: string, userId: string): Promise<boolean> {
  return Boolean(await resolveDurable(approvalId, userId, 'REJECTED'));
}
export function dropDurableApproval(approvalId: string, userId: string) {
  return rejectDurable(approvalId, userId);
}
export async function getDurableApproval(approvalId: string, userId: string): Promise<DurableApprovalRecord | null> {
  if (!userId || !approvalId) return null;
  const { data, error } = await assertAdmin().from('durable_approvals')
    .select('*').eq('approval_id', approvalId).eq('user_id', userId)
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new Error('Approval lookup unavailable');
  return data ? mapRow(data) : null;
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