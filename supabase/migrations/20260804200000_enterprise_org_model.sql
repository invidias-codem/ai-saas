-- Migration: P1 Enterprise Controls — Org Model, Roles, Audit Log Extension
-- Date: 2026-08-04
-- Purpose: Multi-tenant RBAC and trace-linked audit logging for UCOL.

-- ─── Table: organizations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  owner_id     TEXT NOT NULL,                -- Clerk user ID
  settings     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id
  ON organizations (owner_id, created_at DESC);

-- ─── Table: organization_members ──────────────────────────────────────────────

CREATE TYPE org_role AS ENUM ('owner', 'admin', 'developer', 'auditor');

CREATE TABLE IF NOT EXISTS organization_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,               -- Clerk user ID
  role           org_role NOT NULL DEFAULT 'developer',
  invited_by     TEXT,                         -- Clerk user ID
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_org_user
  ON organization_members (org_id, user_id, created_at DESC);

-- ─── Org Role → Permission Mapping ───────────────────────────────────────────

-- owner:        full org access
-- admin:        member management, sensitive tools
-- developer:    standard tool use, no destructive actions without approval
-- auditor:      read-only access to logs and traces

CREATE TABLE IF NOT EXISTS organization_role_permissions (
  role         org_role NOT NULL,
  permission   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (role, permission)
);

INSERT INTO organization_role_permissions (role, permission) VALUES
  ('owner',    'org:read'),
  ('owner',    'org:update'),
  ('owner',    'org:delete'),
  ('owner',    'member:invite'),
  ('owner',    'member:update'),
  ('owner',    'member:remove'),
  ('owner',    'sensitive_tools:use'),
  ('owner',    'external_actions:use'),
  ('owner',    'audit:read'),

  ('admin',    'org:read'),
  ('admin',    'member:invite'),
  ('admin',    'member:update'),
  ('admin',    'member:remove'),
  ('admin',    'sensitive_tools:use'),
  ('admin',    'audit:read'),

  ('developer','org:read'),
  ('developer','external_actions:use'),

  ('auditor',  'org:read'),
  ('auditor',  'audit:read')
ON CONFLICT DO NOTHING;

-- ─── Extend audit_log with enterprise fields ───────────────────────────────────

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS org_id      UUID,
  ADD COLUMN IF NOT EXISTS actor_id    TEXT,
  ADD COLUMN IF NOT EXISTS event_type  TEXT,
  ADD COLUMN IF NOT EXISTS harness     TEXT,
  ADD COLUMN IF NOT EXISTS decision    TEXT CHECK (decision IN ('ALLOW', 'DENY')),
  ADD COLUMN IF NOT EXISTS trace_id    TEXT,
  ADD COLUMN IF NOT EXISTS payload     JSONB;

CREATE INDEX IF NOT EXISTS idx_audit_log_org_id
  ON audit_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_trace_id
  ON audit_log (trace_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_decision
  ON audit_log (decision, created_at DESC);

-- ─── Trigger: updated_at for organizations ────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_organization_members_updated_at ON organization_members;
CREATE TRIGGER trg_organization_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
