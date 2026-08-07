-- Migration: Phase 3 Org Vault / organization_secrets
-- Purpose: store org-scoped secrets for external API auth / vault resolution

CREATE TABLE IF NOT EXISTS organization_secrets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  secret_key   TEXT NOT NULL,
  secret_value TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, secret_key)
);

CREATE INDEX IF NOT EXISTS idx_organization_secrets_org_id
  ON organization_secrets (org_id, secret_key);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organization_secrets_updated_at ON organization_secrets;
CREATE TRIGGER trg_organization_secrets_updated_at
  BEFORE UPDATE ON organization_secrets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
