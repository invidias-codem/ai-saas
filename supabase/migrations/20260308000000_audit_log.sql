-- Migration: Immutable Operation Audit Log
-- Date: 2026-03-08
-- Purpose: Append-only audit trail for all significant system operations.
--          INSERT-only via RLS — no UPDATE or DELETE ever permitted.
-- Related: lib/security/auditLog.ts
-- Compliance: SOC2, HIPAA (Journey Financial), FINRA (financial operations)

-- ─── Table: audit_log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT NOT NULL,               -- AuditAction enum value
  user_id      TEXT NOT NULL,               -- Clerk user ID or 'system'
  severity     TEXT NOT NULL DEFAULT 'info' -- 'info' | 'warn' | 'critical'
               CHECK (severity IN ('info', 'warn', 'critical')),
  metadata     JSONB NOT NULL DEFAULT '{}', -- Sanitized context (no raw PII)
  ip_address   TEXT,                        -- Hashed/raw client IP
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- Fast user-scoped queries (compliance audits: "what did user X do?")
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
  ON audit_log (user_id, created_at DESC);

-- Fast action queries ("show all chat.blocked events")
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log (action, created_at DESC);

-- Fast severity queries ("show all critical events today")
CREATE INDEX IF NOT EXISTS idx_audit_log_severity
  ON audit_log (severity, created_at DESC);

-- ─── RLS — APPEND-ONLY enforcement ───────────────────────────────────────────
-- This is the key immutability guarantee: nobody can UPDATE or DELETE rows,
-- not even the service role. Only INSERT is permitted.

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Service role can INSERT (application writes via service key)
CREATE POLICY "Service role can insert audit events"
  ON audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Users can SELECT their own audit history (for transparency / GDPR right-of-access)
CREATE POLICY "Users can view own audit history"
  ON audit_log
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- NO UPDATE policy — intentionally omitted
-- NO DELETE policy — intentionally omitted
-- Result: rows are permanent once written

-- ─── Helpful views ────────────────────────────────────────────────────────────

-- Recent critical events (for security dashboard)
CREATE OR REPLACE VIEW recent_critical_events AS
SELECT
  id,
  action,
  user_id,
  metadata,
  ip_address,
  created_at
FROM audit_log
WHERE severity = 'critical'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Per-user action summary (for compliance reports)
CREATE OR REPLACE VIEW user_audit_summary AS
SELECT
  user_id,
  action,
  COUNT(*)        AS event_count,
  MAX(created_at) AS last_seen
FROM audit_log
GROUP BY user_id, action
ORDER BY last_seen DESC;
