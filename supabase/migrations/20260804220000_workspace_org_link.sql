-- Migration: link workspaces to organizations for P1 enterprise context isolation
-- Date: 2026-08-04

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_workspaces_org_id
  ON workspaces (org_id);
