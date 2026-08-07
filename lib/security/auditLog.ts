/**
 * auditLog.ts — Immutable Operation Audit Log
 *
 * Records every significant action taken in the system — API calls, memory
 * writes, agent dispatches, bulk operations, auth events — to an append-only
 * Supabase table. Rows are INSERT-only (no UPDATE, no DELETE) enforced by RLS.
 *
 * Inspired by Paperclip AI's immutable audit trail model.
 *
 * Design principles:
 *  - Fire-and-forget: NEVER awaited on the critical path. Always async, always non-blocking.
 *  - Never throws: all errors are logged internally, never surfaced to callers.
 *  - Payload hashing: sensitive data is hashed (SHA-256), never stored raw.
 *  - Compliance-ready: structured for SOC2, HIPAA (Journey Financial), FINRA audit trails.
 *
 * Usage:
 *   import { audit } from '@/lib/security/auditLog';
 *
 *   // Fire-and-forget (recommended)
 *   void audit('memory.write', userId, { memoryId, type });
 *
 *   // With request context
 *   void audit('chat.request', userId, { model, tokenCount }, req);
 */

import { supabaseAdmin } from '@/lib/supabaseClient';
import { createHash } from 'crypto';

// ─── Action Types ─────────────────────────────────────────────────────────────

export type AuditAction =
  // Auth
  | 'auth.login'
  | 'auth.logout'
  | 'auth.unauthorized'
  // Chat / LLM
  | 'chat.request'
  | 'chat.blocked'          // Security agent blocked a prompt
  | 'chat.budget_exceeded'
  | 'chat.insufficient_credits'
  // Memory
  | 'memory.write'
  | 'memory.delete'
  | 'memory.bulk_delete'
  | 'memory.export'
  | 'memory.event.ingested'
  // Workspace / enterprise administration
  | 'workspace.create'
  | 'workspace.update'
  | 'workspace.delete'
  | 'workspace.member.invite'
  | 'workspace.member.role_change'
  | 'workspace.member.remove'
  | 'workspace.repository.link'
  | 'workspace.repository.unlink'
  | 'partner_key.create'
  | 'partner_key.revoke'
  | 'provider_key.create'
  | 'provider_key.update'
  | 'provider_key.delete'
  | 'license.activation_attempt'
  | 'license.activation_success'
  | 'license.activation_failed'
  | 'preflight.check'
  // Agent / UCOL
  | 'agent.dispatch'
  | 'agent.task.created'
  | 'agent.task.cancelled'
  | 'agent.task.completed'
  | 'agent.task.failed'
  | 'agent.pr_opened'
  | 'agent.pr_blocked'      // Agent wanted to merge but was gated
  | 'tool.executed'
  | 'tool.intercepted'
  | 'tool.external_action' // Remote API execution via synthesized tool
  | 'tool.failed'
  // Import / Export
  | 'import.start'
  | 'import.complete'
  | 'import.failed'
  | 'export.request'
  // Admin
  | 'admin.credits_adjust'
  | 'admin.user_tier_change'
  // Security
  | 'security.rate_limit'
  | 'security.pii_detected'
  | 'security.ssrf_blocked'
  | 'security.injection_blocked';

// ─── Severity ─────────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warn' | 'critical';

const ACTION_SEVERITY: Partial<Record<AuditAction, AuditSeverity>> = {
  'auth.unauthorized':        'warn',
  'chat.blocked':             'warn',
  'chat.budget_exceeded':     'warn',
  'memory.bulk_delete':       'warn',
  'memory.delete':            'info',
  'workspace.delete':         'warn',
  'workspace.member.invite':  'warn',
  'workspace.member.role_change': 'warn',
  'workspace.member.remove':  'warn',
  'partner_key.create':       'warn',
  'partner_key.revoke':       'warn',
  'provider_key.create':      'warn',
  'provider_key.update':      'warn',
  'provider_key.delete':      'warn',
  'license.activation_attempt': 'warn',
  'license.activation_failed': 'warn',
  'agent.pr_blocked':         'warn',
  'security.rate_limit':      'warn',
  'security.pii_detected':    'critical',
  'security.ssrf_blocked':    'critical',
  'security.injection_blocked': 'critical',
  'admin.credits_adjust':     'warn',
  'admin.user_tier_change':   'warn',
};

function getSeverity(action: AuditAction): AuditSeverity {
  return ACTION_SEVERITY[action] ?? 'info';
}

// ─── Payload Sanitization ────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'api_key', 'apikey', 'apiKey',
  'authorization', 'credit_card', 'ssn', 'dob', 'licenseKey', 'license_key',
]);

/**
 * Redacts sensitive keys and hashes values >500 chars (e.g. file content).
 * Returns a safe-to-store metadata object.
 */
function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      // Hash large strings (file content, prompts) instead of storing raw
      sanitized[key] = `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ─── Core Audit Function ──────────────────────────────────────────────────────

/**
 * Records an audit event. Always fire-and-forget — call with `void`.
 *
 * @param action   - The action type (see AuditAction)
 * @param userId   - Clerk user ID (or 'system' for automated actions)
 * @param metadata - Arbitrary context — sensitive values are auto-redacted
 * @param req      - Optional Request object to extract IP and user-agent
 */
export async function audit(
  action: AuditAction,
  userId: string,
  metadata: Record<string, unknown> = {},
  req?: Request,
  enterprise?: {
    orgId?: string;
    actorId?: string;
    eventType?: string;
    harness?: string;
    decision?: 'ALLOW' | 'DENY';
    traceId?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    const severity = getSeverity(action);
    const safeMetadata = sanitizePayload(metadata);

    // Extract request context if available
    const ip = req ? extractIP(req) : null;
    const userAgent = req ? (req.headers.get('user-agent') ?? null) : null;

    const { error } = await supabaseAdmin
      .from('audit_log')
      .insert({
        action,
        user_id: userId,
        severity,
        metadata: safeMetadata,
        ip_address: ip,
        user_agent: userAgent,
        org_id: enterprise?.orgId ?? null,
        actor_id: enterprise?.actorId ?? userId,
        event_type: enterprise?.eventType ?? action,
        harness: enterprise?.harness ?? null,
        decision: enterprise?.decision ?? null,
        trace_id: enterprise?.traceId ?? null,
        payload: enterprise?.payload ? sanitizePayload(enterprise.payload) : null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error(`[AuditLog] Failed to write audit event "${action}":`, error.message);
    }

    // Also log critical events to console for immediate visibility in Vercel logs
    if (severity === 'critical') {
      console.warn(`[AUDIT:CRITICAL] ${action} | user=${userId} | ${JSON.stringify(safeMetadata)}`);
    }
  } catch (e: any) {
    // Never let audit logging break the application
    console.error('[AuditLog] Exception writing audit event:', e.message);
  }
}

// ─── Convenience Wrappers ─────────────────────────────────────────────────────

/** Log a blocked security event (critical severity) */
export function auditSecurityBlock(
  action: AuditAction,
  userId: string,
  reason: string,
  req?: Request
): void {
  audit(action, userId, { reason, blocked: true }, req).catch(err => console.error("[AuditLog] Failed to write block event:", err));
}

/** Log an agent action (dispatch, PR open, etc.) */
export function auditAgentAction(
  action: AuditAction,
  userId: string,
  agentMetadata: { targetNode?: string; taskType?: string; prUrl?: string; [key: string]: unknown }
): void {
  audit(action, userId, agentMetadata).catch(err => console.error("[AuditLog] Failed to write agent event:", err));
}

export function auditEnterprise(
  action: AuditAction,
  userId: string,
  metadata: Record<string, unknown> = {},
  enterprise?: {
    orgId?: string;
    actorId?: string;
    eventType?: string;
    harness?: string;
    decision?: 'ALLOW' | 'DENY';
    traceId?: string;
    payload?: Record<string, unknown>;
  },
  req?: Request
): void {
  audit(action, userId, metadata, req, enterprise).catch(err => console.error("[AuditLog] Failed to write enterprise event:", err));
}

/** Log a memory operation */
export function auditMemoryOp(
  action: AuditAction,
  userId: string,
  memoryMetadata: { memoryId?: string; count?: number; type?: string }
): void {
  audit(action, userId, memoryMetadata).catch(err => console.error("[AuditLog] Failed to write memory event:", err));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractIP(req: Request): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    null
  );
}
