# Quick Clip durable video rollout

Quick Clip previously lost both preview and download after a media load error.
It also delivered expiring provider URLs and polled with a different Replicate
token. The repair retains download controls, saves validated MP4s privately,
and serves both preview and download from authenticated application routes.

## Activation order

1. Apply **only** `supabase/migrations/20261014000000_video_artifacts.sql` to the
   target database, using the established targeted migration/ledger process.
   Do not use a broad `supabase db push` against the existing migration drift.
   Verify `video_generation_jobs` has owner RLS and `video-artifacts` is private.
2. Confirm the worker and app share the same main Supabase instance, service-role
   key, and video Replicate account. `REPLICATE_API_TOKEN_VIDEO` is preferred;
   `REPLICATE_API_TOKEN` is a consistent fallback in both submission and worker.
   The app needs `TRIGGER_SECRET_KEY`. These existing env keys are Zod-validated;
   the Trigger config syncs the video token and dispatch key without logging them.
3. Deploy Trigger tasks `video-completion` and `video-completion-recovery` from
   this commit to the matching environment. Confirm the two-minute recovery
   schedule is active in production and the worker can read/write the bucket.
4. Deploy the reviewed app commit. Generation fails before charging if database,
   provider, or worker-key configuration is missing. The app cannot verify that
   the task has actually been deployed; step 3 is mandatory before enabling it.
5. Generate one short real clip. Check inline playback and seeking on iPhone/
   Safari; download an MP4 with the correct filename. Reload during generation
   and after completion. Close the page during generation and return later.
   Verify the stored clip still plays after the original provider URL expires.
6. Verify a second user cannot poll the prediction or access preview/download.
   A legacy prediction with no owner record intentionally returns 404.

## Contracts and recovery

- Quick Clip is a personal, owner-only surface: workspace membership does not
  grant access, and there are no public share links. Both API and service-role
  store reads bind the authenticated Clerk user. The page prefetches that user's
  latest recorded prediction on the server, then resumes polling if necessary.
- Completion is withheld until storage upload and durable metadata commit.
  Delivery forwards single HTTP byte ranges and supports HEAD. Download uses
  `Content-Disposition: attachment`; preview uses `inline`. Signed storage
  URLs remain on the server. Responses use `private, no-store`.
- Files are limited to 50 MiB, constrained to DNS-validated HTTPS Replicate CDN
  hosts, fetched without redirects, and checked for the MP4 `ftyp` signature.
  This is container identification, not full codec validation or transcoding.
- A unique `(user_id, operation_key)` reserves submission before debit. A retry
  with the same key returns the same prediction, never another paid run. A
  reservation without a recorded prediction is refused rather than resubmitted.
- Durable dispatch IDs avoid re-triggering on every poll. Undispatched recorded
  predictions are an outbox recovered by the two-minute scheduled task. Trigger
  dedupe complements an atomic five-minute database persistence lease.
- Uploads never overwrite an object. A retry after an upload-before-commit crash
  checks the private object's metadata and commits without fetching Replicate.
- Worker errors retry three times; after retries exhaust, the row records an
  explicit failure. A 45-minute wall-clock observation deadline also records a
  failure. Successful provider submissions are never refunded on later storage
  or dispatch errors; generation-credit reconciliation beyond submission is
  unchanged and requires a separate policy.
- The provider-accepted / database-unavailable gap cannot be made transactional
  across Replicate and Postgres. Binding retries three times. If all fail,
  `[VIDEO_PREDICTION_RECORD_FAILED]` logs only `jobId` and `predictionId` for
  operator reconciliation. If the process dies before that log, reconcile the
  reserved row against the provider account manually. Do not launch another paid
  run or infer ownership from possession of a prediction ID. Recovery of old
  expired provider files is outside this migration.
- Files remain private until operator deletion. Automated retention and account
  deletion for this new bucket are not implemented in this slice; the existing
  Clerk deletion webhook only soft-marks accounts. There is no workspace sharing
  model or public share link.

## Review checks

The regression suites cover stored-output contracts, provider URL/body limits,
owner denial, byte ranges, download disposition, HEAD, upload crash recovery,
leases, credit preflight, idempotent submission, and dispatch outages. An isolated
Postgres check validates the migration, owner RLS, private bucket configuration,
denied browser writes, completion constraints, lease exclusivity, and unique
operation keys. Browser playback and a paid provider/storage smoke run still
need the deployment checks above.
