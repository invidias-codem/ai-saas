-- =============================================================================
-- Migration: Fix RLS + SECURITY DEFINER linter errors
-- Date: 2026-03-04
-- Author: Security audit fix
-- =============================================================================
-- Resolves the following Supabase security linter ERRORs:
--   1. SECURITY DEFINER view: public.referral_summary
--   2. RLS disabled on: public.import_jobs, public.kofi_donations,
--      public.donations, public.rag_usage, public.logs
--
-- REASONING FOR ALL POLICIES:
--   This app uses Clerk auth (not Supabase Auth), so auth.uid() is not
--   meaningful for row ownership. All server-side DB access uses the
--   service_role key, which BYPASSES RLS entirely.
--
--   For tables with no client-side access (no TypeScript/frontend references
--   found in codebase), the safest posture is:
--     • Enable RLS (blocks all anon + authenticated JWT connections)
--     • Add NO policies (service_role still bypasses RLS and works fine)
--
--   This is a "deny by default" approach: if a table later needs client
--   access, a policy can be added deliberately at that time.
-- =============================================================================


-- =============================================================================
-- SECTION 1: import_jobs
-- =============================================================================
-- Usage: No TypeScript references found. Appears to be a server-side background
-- job tracking table. Written and read exclusively via service_role.
-- Decision: Enable RLS, no policies. service_role bypasses RLS automatically.
-- =============================================================================

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- No policies needed: service_role bypasses RLS.
-- Anon and authenticated roles are blocked by default.


-- =============================================================================
-- SECTION 2: kofi_donations
-- =============================================================================
-- Usage: The /app/api/webhooks/kofi route directory exists but contains no
-- implementation files yet. Ko-fi webhooks send payment notifications with no
-- Supabase user context. Any writes would use the service_role key server-side.
-- Decision: Enable RLS, no policies. Webhook handler uses service_role.
-- =============================================================================

ALTER TABLE public.kofi_donations ENABLE ROW LEVEL SECURITY;

-- No policies needed: Ko-fi webhook handler uses service_role which bypasses RLS.


-- =============================================================================
-- SECTION 3: donations
-- =============================================================================
-- Usage: No TypeScript references found. General donations table, likely
-- populated server-side (webhook or admin tool) using service_role.
-- Decision: Enable RLS, no policies. service_role bypasses RLS automatically.
-- =============================================================================

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- No policies needed: service_role bypasses RLS.


-- =============================================================================
-- SECTION 4: rag_usage
-- =============================================================================
-- Usage: No TypeScript references found. Appears to be a server-side table
-- for tracking RAG (Retrieval-Augmented Generation) usage/telemetry.
-- Written by AI pipeline server code using service_role.
-- Decision: Enable RLS, no policies. service_role bypasses RLS automatically.
-- =============================================================================

ALTER TABLE public.rag_usage ENABLE ROW LEVEL SECURITY;

-- No policies needed: service_role bypasses RLS.


-- =============================================================================
-- SECTION 5: logs
-- =============================================================================
-- Usage: No TypeScript references found in client-facing code. Application
-- audit/error log table populated server-side using service_role.
-- Decision: Enable RLS, no policies. service_role bypasses RLS automatically.
-- =============================================================================

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- No policies needed: service_role bypasses RLS.


-- =============================================================================
-- SECTION 6: Fix SECURITY DEFINER view — public.referral_summary
-- =============================================================================
-- Issue: The view was created with SECURITY DEFINER (or security_invoker=false),
-- meaning it executes with the VIEW OWNER's privileges rather than the
-- calling user's. This bypasses RLS on the underlying tables.
--
-- Fix: Recreate the view with security_invoker = true (PostgreSQL 15+ feature).
-- This ensures the view uses the CALLER's permissions — so if a non-service-role
-- connection queries it, RLS on referral_codes/referral_events will apply and
-- deny access (since those tables have RLS with no policies).
--
-- The admin endpoint (app/api/admin/referrals/route.ts) uses supabaseAdmin
-- (service_role), which bypasses RLS, so it continues to work correctly.
--
-- View sources: referral_codes, referral_events (both have RLS enabled,
-- service_role only — see pr41.patch migration).
-- =============================================================================

DROP VIEW IF EXISTS public.referral_summary;

CREATE VIEW public.referral_summary
  WITH (security_invoker = true)
AS
SELECT
  rc.code,
  rc.creator_handle,
  rc.track,
  rc.bonus_multiplier,
  COUNT(CASE WHEN re.event_type = 'visit'   THEN 1 END) AS total_visits,
  COUNT(CASE WHEN re.event_type = 'signup'  THEN 1 END) AS total_signups,
  COUNT(CASE WHEN re.event_type = 'upgrade' THEN 1 END) AS total_upgrades,
  SUM(CASE WHEN re.event_type = 'upgrade'   THEN re.amount_usd ELSE 0 END) AS total_revenue_usd,
  MIN(re.created_at) AS first_event_at,
  MAX(re.created_at) AS last_event_at
FROM referral_codes rc
LEFT JOIN referral_events re ON re.code = rc.code
WHERE rc.is_active = true
GROUP BY rc.code, rc.creator_handle, rc.track, rc.bonus_multiplier;

-- Grant usage to service_role (view is admin-only; no public grants needed)
-- service_role bypasses RLS so can see all rows in the underlying tables.
-- No GRANT to anon or authenticated — they should not access this view.
