-- ============================================================================
-- Slice 3A: Decision Evidence Integrity — telemetry key contract.
--
-- logRoutingTelemetry() upserts with onConflict: 'request_id', which requires
-- a UNIQUE constraint/index. The original migration only created a plain
-- index, so every upsert either errored (no unique) or, if prod was manually
-- altered, silently relied on an un-ledgered invariant. This makes the
-- invariant explicit: one canonical routing-outcome row per request.
-- ============================================================================

create unique index if not exists
  uq_ucol_routing_telemetry_request_id
on ucol_routing_telemetry(request_id);
