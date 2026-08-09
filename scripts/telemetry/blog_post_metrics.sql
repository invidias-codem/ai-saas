-- blog_post_metrics.sql
-- Reusable telemetry queries for the Lattice OS weekly blog agent.
-- Run these against your Supabase Postgres database after a blog_post run.

-- 1. View: recent blog_post runs with basic health metrics
CREATE OR REPLACE VIEW blog_post_run_telemetry AS
SELECT
  id AS task_id,
  status,
  created_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - created_at)) AS duration_seconds,
  (result->>'executionSteps')::integer AS total_steps,
  result->>'traceId' AS trace_id,
  result->>'error' AS error_message
FROM agent_tasks
WHERE task_type = 'blog_post'
ORDER BY created_at DESC;

-- 2. Raw query: cost/latency/ROI baseline for completed blog_post tasks
SELECT
  id AS task_id,
  status,
  created_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - created_at)) AS duration_seconds,
  (result->>'executionSteps')::integer AS total_steps,
  result->>'traceId' AS trace_id,
  result->>'responseLength' AS response_length,
  result->>'error' AS error_message
FROM agent_tasks
WHERE task_type = 'blog_post'
  AND status = 'completed'
ORDER BY created_at DESC
LIMIT 20;

-- 3. Sub-span latency breakdown from trace ledger
-- Assumes trace spans are stored in a `traces` table with JSON metadata.
SELECT
  trace_id,
  span_id,
  parent_span_id,
  name,
  metadata->>'status' AS status,
  (metadata->>'latencyMs')::numeric AS latency_ms,
  (metadata->>'inputSize')::numeric AS input_bytes
FROM traces
WHERE trace_id IN (
  SELECT result->>'traceId' FROM agent_tasks WHERE task_type = 'blog_post'
)
ORDER BY trace_id, span_id;

-- 4. Tool payload size audit: flag unusually large tool outputs
SELECT
  trace_id,
  span_id,
  name,
  metadata->>'status' AS status,
  (metadata->>'latencyMs')::numeric AS latency_ms,
  (metadata->>'inputSize')::numeric AS input_bytes
FROM traces
WHERE trace_id IN (
  SELECT result->>'traceId' FROM agent_tasks WHERE task_type = 'blog_post'
)
  AND (metadata->>'inputSize')::numeric > 50000
ORDER BY input_bytes DESC;
