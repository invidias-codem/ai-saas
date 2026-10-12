-- Quick Clip: private durable video outputs. Apply this migration alone;
-- migration-ledger reconciliation is a separate operation.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.video_generation_jobs (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  operation_key text NOT NULL,
  input_hash text NOT NULL,
  prediction_id text UNIQUE,
  trigger_run_id text,
  status text NOT NULL DEFAULT 'submitting'
    CHECK (status IN ('submitting', 'starting', 'processing', 'persisting', 'succeeded', 'failed', 'canceled')),
  object_path text UNIQUE,
  byte_size bigint CHECK (byte_size > 0 AND byte_size <= 52428800),
  error_message text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, operation_key),
  CHECK (status <> 'succeeded' OR
    (prediction_id IS NOT NULL AND object_path IS NOT NULL AND byte_size IS NOT NULL))
);
CREATE INDEX video_jobs_owner_created ON public.video_generation_jobs (user_id, created_at DESC);
ALTER TABLE public.video_generation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.video_generation_jobs FROM anon, authenticated;
GRANT SELECT ON public.video_generation_jobs TO authenticated;
GRANT ALL ON public.video_generation_jobs TO service_role;
CREATE POLICY video_jobs_owner_read ON public.video_generation_jobs
  FOR SELECT TO authenticated USING (user_id = (auth.jwt() ->> 'sub'));

-- No browser INSERT/UPDATE/SELECT policies on storage.objects: all file access
-- goes through the authenticated, owner-scoped application routes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-artifacts', 'video-artifacts', false, 52428800, ARRAY['video/mp4'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4'];
COMMIT;
