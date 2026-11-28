# Code Builder: completed build without saved output

## Observed production evidence

Build `87150c28-3ea3-4e1e-b0c3-e65a84dc375e`, Trigger run
`run_06gjq15nojfouisvp6sfn7ad01`, started October 14, 2026 at
20:44:42 EDT. At 20:55 EDT the UI showed an empty plan after 10m 31s.

Read-only production queries showed:

- Initially: `running / planning / 10%`, last update 20:44:46 EDT, no plan or files.
- Subsequently: `completed / completed / 100%` at 21:00:21 EDT, with
  `plan_json IS NULL` and `files_json IS NULL`, and no recorded error.
- Both artifact columns and the `updated_at` touch trigger exist in production.

Vercel recorded repeated 300-second timeouts on the build's `/events` route.
Those were observer timeouts; they do not establish that the Trigger worker failed.

The deployed web application was `dpl_FnU1evVZbANar4QV5585ktS3Gtjz`, source
`ec56dbae80e5967861e1317e5ced489796ba1b32`. Its task source, also present at main
`f4a4b40815219619bbd4c381d27163e65a136f40`, already passes artifacts to
`completeBuild`. The deployed Trigger worker version has **not** been inspected.
A stale worker deployment is a leading hypothesis for the terminal null fields,
not a confirmed cause. A Vercel deployment alone does not deploy a Trigger worker.

## Confirmed code defects and changes

1. The worker emits no per-phase progress and saves artifacts only when the entire
   engine returns. Awaited plan and component checkpoints now persist progress
   and recoverable output before the next generation call.
2. The status API and UI previously exposed artifacts only at completion. Owner
   reads now include partial checkpoints; unchanged versions omit large payloads.
   Reloads fetch the complete current snapshot, including partial failed builds.
3. Every successful poll reset the progress clock. Only durable changes now reset
   it; connectivity and forward progress are reported separately.
4. The relay had no rotation deadline. It now closes at 240 seconds, cancels its
   reader, unsubscribes, removes its abort listener, and clears its timer.
5. Terminal labels were inconsistent with installed Trigger SDK 4.5.16. The relay
   and client now share its `COMPLETED` / `FAILED` / other terminal statuses.
6. Completion accepted missing artifacts. It now requires a named plan and usable
   files. Historical completed rows with missing output remain unchanged, but the
   API explicitly reports `artifactsMissing` and the UI retains their recovery key.
7. Provider timeout timers remained live after successful calls. They now clear
   on settlement; tests exit without lingering handles.

Existing artifact columns are reused; no schema migration is required. This
supersedes the completion-only artifact semantics described in the original B2
migration comments. Terminal snapshots remain protected against later checkpoints.

## Release build blocker (commit 77e04afc)

The 21:18 EDT Vercel redeploy compiled successfully, then failed TypeScript in
`acquisitionIngestTask.ts`. It imported the nonexistent Apify directory entry
point and a missing `client.ts`. The registry function already existed in
`actorRegistry.ts`; the task now imports it directly.

The restored official SDK boundary reads credentials at operation time, refuses
missing credentials and unsupported/invalid pricing, pins the requested build,
uses one asynchronous `start()` with SDK retries disabled, forwards spending and
record caps, and bounds dataset collection. Importing the task performs no SDK
calls. Contract tests use mocked SDK operations; no paid Actor was launched.

## Verification

Thirteen focused Jest suites pass (128 tests, including the 53 Code Builder contracts): worker checkpoint wiring, canonical engine
checkpoint ordering, unchanged-poll staleness, owner-only partial reads, missing
output detection, terminal guards, provider cleanup, and two idle relay rotations.
Changed TypeScript/TSX files pass ESLint.

`pnpm run typecheck` now passes for the full repository with the acquisition
repair and Code Builder changes together. No TypeScript exclusions or ignored
build errors were added. The acquisition boundary adds 26 focused contracts;
all 75 acquisition contracts pass. Workspace dependencies were built before
checking. The local Next.js production build also passes (exit 0): compilation
in 41 seconds, TypeScript validation in 47 seconds, and 161/161 static pages.
The existing NFT tracing warning remains nonfatal.

The host denied the `tsx` CLI IPC socket during the normal prebuild wrapper.
All four workspace builds passed; the same manifest script was then run with
`node --import tsx`, followed by the production Next.js build directly. No source
configuration or typecheck bypass was added to obtain this result.

## Release and recovery

1. Human review and CI are required before merge. Verify the production build
   with the deployment environment before claiming release qualification.
2. Deploy the reviewed API/UI, then deploy the matching Trigger worker version.
   Verify the actual version handling new runs; source changes alone are insufficient.
3. Run a bounded build: observe the plan before completion, then a non-empty file
   checkpoint. Reload while running and confirm the same build/output recovers.
4. Confirm a final owner-authorized status read returns non-empty artifacts and
   a relay connection rotates cleanly. Stream expiry must not fail/cancel the run.
5. Inspect retained Trigger output/traces for the affected run before considering a
   replacement build. Do not label its output recovered: no artifacts exist in its
   durable row. No paid replacement run or production mutation was performed here.
