# S2c.6: Native integration verification

Verify the complete S2c stack through actual native UI on Windows and Linux. This slice does not add new capabilities; it proves the existing S2c.1–S2c.5 flows compose correctly through the Tauri webview.

## Scope

Prove the following user-visible flows work in the real desktop app:

1. **Folder selection and revocation** — Native folder picker opens, read-access confirmation displays the exact path, grant is recorded, revocation removes it.
2. **Permitted text reads** — After grant confirmation, `native_read_text`, `native_list` and `native_stat` return exact content/metadata for UTF-8 files under the grant.
3. **One supported file mutation** — Propose `create_file`, open the bundled native review window, scroll through complete byte views, acknowledge, accept — observe `OperationState::Succeeded` and the file on disk.
4. **Honest outcomes** — Status, output and error codes match the contract; no hidden fallbacks or silent successes.
5. **Restart clears authority** — `restart_daemon` invalidates all grants, proposals and review leases; a fresh bind is required.
6. **Commands fail closed** — Every supported command mode returns `LOCAL_SANDBOX_REQUIRED` without launching a process.

## Acceptance evidence

| Platform | Evidence |
|---|---|
| Linux | Full Tauri app launch with bundled review assets; real `go-harness` daemon; folder picker, read, mutation, restart and command-denial flows exercise the actual webview and IPC. |
| Windows | Same flows on Windows with native file dialogs, PowerShell/cmd/sh availability checks, and the Common Controls v6 manifest for unit tests. |

## Verified stack

- Rust `src-tauri/native-host` protocol, authority, workspace, review, mutation, command crates
- Go `go-harness/cmd/lattice-harness` daemon with native startup, binds, grants, reads, mutations, commands
- Tauri `src-tauri/src/workspace.rs`, `src-tauri/src/review.rs` commands and review window
- Bundled review assets (`src-tauri/review-assets/index.html`, `review.js`, `review.css`, `policy.json`)
- TypeScript client `lib/harness/nativeWorkspace.ts` (schema-validated IPC)
- CI workflows: `native-host.yml` (protocol + real daemon), `build-tauri.yml` (compile + lib tests)

## Native UI evidence gap

Current CI validates:
- Rust crate unit/integration tests (MockRuntime, protocol fixtures)
- Go daemon unit tests
- Real daemon tests via `LATTICE_TEST_DAEMON_PATH` (Rust IPC directly, not WebView)
- CSP header tests via Playwright Chromium (not Tauri WebView)
- Review renderer tests via Node.js (DOM verification, not WebView)

**Missing**: A Tauri WebView smoke test that launches the real app, opens the native folder picker, confirms read access, reads a file, proposes a mutation, opens the review window, accepts it, and verifies the file on disk — all through the actual `tauri::Window`/`WebviewWindow` and IPC layer. This is the S2c.6 gate.

## Files to change

1. `src-tauri/src/workspace.rs` — Ensure `write_consent` adapter is registered for the webview (currently gated behind S2c.6 comment)
2. `src-tauri/src/lib.rs` — Register the write-consent capability if not already
3. `src-tauri/native-host/src/workspace.rs` — Verify `WriteConsent` trait usage matches the Tauri adapter
3. `docs/operations/native-integration-verification.md` — Document the verified flows and limitations
4. `tasks/native-integration-verification.md` — This file
5. `plan.md` — Update current slice
6. Test additions: Native UI smoke test (Tauri WebView) — may require a new test binary or Playwright+Tauri integration

## Bounded acceptance cases (will be tested)

- Folder selection → confirmation → grant recorded → revocation clears grant
- Read text/list/stat on granted folder → exact content/metadata
- Create file proposal → review window opens → scroll → acknowledge → accept → dispatch → `Succeeded` → file exists
- Write text proposal → base content verified → conflict detection → re-propose → `Succeeded`
- Restart daemon → grants/proposals/leases cleared → new bind required
- All command modes → `LOCAL_SANDBOX_REQUIRED`, no file created
- Review expiration → `ProposalState::Stale`, dispatch denied
- Revoked grant → subsequent reads/dispatches denied

## Out of scope

- Company enrollment, Copilot/Teams adapters
- Qualified command sandbox provider (remains `LOCAL_SANDBOX_REQUIRED`)
- Persistent profiles/checkpoints (S4)
- Installers (S5), signed downloads (S6)
- Production frontend bundling (S3)
- ARM64, macOS, iOS, Android