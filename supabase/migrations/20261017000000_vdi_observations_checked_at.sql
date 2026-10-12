-- ============================================================================
-- VDI observation column fix (canary-discovered production defect).
--
-- 20261011000000 created `vdi_observations` WITHOUT the `checked_at` column
-- its own vdi_record_observation RPC references (PL/pgSQL validates column
-- references at CALL time, not CREATE time — the migration applied clean and
-- the RPC failed at first production use). Every consumer (RPC, TS store
-- interface, memory twin) speaks `checked_at` = collection START time, the
-- anchor of the stale-collection guard.
--
-- Fix: add the column the contract always required. Additive; guard preserved.
-- ============================================================================

alter table vdi_observations
  add column if not exists checked_at timestamptz;

-- Backfill: observations collected before this fix have their provider check
-- time as the closest proxy for collection time.
update vdi_observations
   set checked_at = provider_checked_at
 where checked_at is null;
