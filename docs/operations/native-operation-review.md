# Isolated native review and exact decisions

S2c.3 builds on #455's read-only workspace session. It introduces immutable proposals and a dedicated native review origin. Accepting a proposal records a decision; this build still has no writable grant, file mutation, command execution or approval-consumption IPC. The existing connected dashboard is not wired to these APIs. Installed UI qualification and signed distribution retain their later gates.

## Supported intent and scope

Main can propose only `create_file` (exact UTF-8 content, at most 256 KiB and no NUL) or `create_directory`, using a current grant ID and portable relative path. Both bind the precondition `must_be_absent`. The root itself, absolute/traversal/device/stream paths, unknown fields, caller approvals and command/overwrite/delete/move variants are rejected. Overwrites require trusted base-content/file-identity preparation in S2c.4; no unverified caller precondition is accepted here.

Rust captures local principal/workspace/generation, policy/grant revisions, native-selected display root, read-only ceiling and exact operation bytes. It generates an independent 128-bit proposal ID. No frontend can update an existing proposal. A changed request requires a new proposal/review.

`testdata/native-proposal-digests.json` specifies SHA3-256 fixtures independently calculated with Python and checked by Rust/Go. Canonical v1 starts with `LATTICE_NATIVE_PROPOSAL\0\x01`; it encodes UTF-8 strings with big-endian u32 byte lengths, revisions as big-endian u64, then grant/root/read-only, the fixed 300,000 ms lifetime, operation tag (1 file, 2 directory), relative path, applicable content and `must_be_absent`. The digest is public integrity metadata, not an approval credential or signature. The Go helper validates this material but is not reachable through native dispatch.

## Native review instance

Rust reserves one live review and creates a unique, never-reused `native-review-<random>` window. Its exact label is bound to an opaque Rust-only lease; Tauri forbids duplicate live labels. The runtime also requires the current native window registration, live lease and exact review URL. Closing/destroying invalidates the lease before any label/OS handle can be reused. A forged review-prefix window has no usable lease.

The fixed origin is `lattice-review://localhost/index.html`, mapped by Tauri to `http://lattice-review.localhost/index.html` on Windows. A custom protocol serves only three embedded assets. Queries, other paths and non-GET methods receive a fixed 404. It never reads requested filesystem paths, loads the SaaS dashboard or needs a development server. `withGlobalTauri` supplies the documented core bridge; it grants no commands by itself.

The review capability permits only immutable-document fetch, exact-display acknowledgement, one decision and cancellation. It has no workspace read/picker, main proposal management, lifecycle, filesystem/dialog/shell/secret-store/opener/window-management or event-emission permission. Main has proposal/status/cancel/open-review controls and cannot fetch or approve review documents. Runtime guards supplement the real Tauri ACL resolver.

`review-assets/policy.json` supplies a dedicated CSP in all builds: no inline/eval code, remote connections, frames, objects, workers, media or arbitrary resources; scripts/styles are fixed same-origin assets and connections are limited to native IPC. Responses also deny framing and caching. Popup creation is denied. Unexpected navigation/reload invalidates review; close, expiry, grant change, cancellation and session shutdown signal native cleanup. A failed/unconfirmed window cleanup leaves its slot unavailable rather than creating another active review.

## Complete display and decision

Rust supplies an immutable display record with quoted/escaped root and target, operation, exact precondition, byte count, digest, escaped JSON content and complete UTF-8 hex bytes. Control/bidirectional content is represented explicitly. Oversized complete display fails; it is never silently shortened. The asset validates the closed record and verifies JSON-to-UTF-8/hex/byte-count agreement, then writes only `textContent`. It renders no model HTML.

Only after all document fields are inserted does the view acknowledge the exact proposal ID/digest. Acceptance additionally requires scrolling the complete byte view when needed and explicit user confirmation. The fixed script accepts trusted user clicks and disables submission after the first attempt. A malformed/incomplete display cancels without acknowledging. Native consumption does not trust these UI conveniences alone: the book checks its own display flag, lease, current scope, payload, expiry and decision state.

Decisions have a five-minute monotonic lifetime. Native expiry remains authoritative when a browser timer is delayed or wall-clock time changes. One mutex serializes decisions/consumption; grant read locks bind them to current revisions. Invalid digest/display, close/navigation and stale lease attempts fail closed. Changing grants invalidates all outstanding/accepted proposals before its control request; restart creates a new empty book. Main never receives the opaque lease or nonserializable approved-operation carrier.

State is bounded to 32 pending/accepted proposals, one active review, 64 terminal metadata summaries and 4,096 consumed IDs for the entire generation. Old consumed IDs are never evicted to regain capacity. A changed consumption payload invalidates the old acceptance. The trusted Rust-only consumption API emits one opaque attempt after writable permission and exact binding checks; current production grants are all read-only, so real-daemon tests observe `LOCAL_WRITE_GRANT_REQUIRED` and no file changes. There is no Go dispatch action or automatic execution/retry in this slice. S2c.4 must add Go attempt admission and actual target revalidation before enabling mutations. This is not exactly-once execution or crash recovery; those require the later operation journal.

## Evidence and remaining qualification

Tests combine native state/clock/capacity/race regressions, independent Rust/Go canonical fixtures, real Go daemon acceptance/revocation/no-write checks and production Tauri MockRuntime ACL/instance tests. MockRuntime does not deliver OS destruction events: tests invoke the production close callback explicitly and recreate an app/window registration with the same host and label to verify that ACL membership cannot recreate a lease. The full Tauri lane requires this revision's sidecar for positive IPC tests rather than returning early without integration evidence. Browser tests execute the actual bundled HTML/JS/CSS, verify hostile text/incomplete-display denial and exercise the review CSP alongside main policies.

Windows IPC tests use WebView2's documented `http://lattice-review.localhost` origin: MockRuntime keeps the untranslated builder URL, which Windows Tauri correctly rejects as nonlocal. No remote capability exception is added; positive tests must pass the real platform ACL and stale/forged/closed tests must reach the native `LOCAL_REVIEW_DENIED` guard.

MockRuntime and Chromium response-header tests do not prove actual WebKit/WebView2 enforcement or native window presentation. S2c.6 must qualify those before enabling privileged data-changing UI; S3 still owns the complete packaged frontend. This slice records review decisions under a read-only ceiling, so approval cannot reach a side effect while those gates remain open. Company identity, Copilot/Teams adapters, durable memory/profiles, command isolation, installers and download activation are unchanged.

S2c.4 extends this contract with trusted canonical v2 parent/base preparation, complete before/after review and a native-only guarded mutation broker. See [guarded native file mutations](native-file-mutations.md). Privileged desktop UI remains gated on S2c.6; current review decisions alone do not dispatch.
