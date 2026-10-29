# S2c.6: Native integration verification — acceptance criteria defined, WebView smoke test pending

Verify the complete S2c stack through actual native UI on Windows and Linux. This slice does not add new capabilities; it proves the existing S2c.1–S2c.5 flows compose correctly through the Tauri webview.

## Scope

Prove the following user-visible flows work in the real desktop app:

1. **Folder selection and revocation** — Native folder picker opens, read-access confirmation displays the exact path, grant is recorded, revocation removes it.
2. **Permitted text reads** — After grant confirmation, `native_read_text`, `native_list` and `native_stat` return exact content/metadata for UTF-8 files under the grant.
3. **One supported file mutation** — Propose `create_file`, open the bundled native review window, scroll through complete byte views, acknowledge, accept — observe `OperationState::Succeeded` and the file on disk.
4. **Honest outcomes** — Status, output and error codes match the contract; no hidden fallbacks or silent successes.
5. **Restart clears authority** — `restart_daemon` invalidates all grants, proposals and review leases; a fresh bind is required.
6. **Commands fail closed** — Every supported command mode returns `LOCAL_SANDBOX_REQUIRED` without launching a process.

## Acceptance evidence (not yet met)

| Platform | Required evidence |
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

## Files changed (integration wiring complete)

1. `src-tauri/src/workspace.rs` — `native_request_write_access` command registered
2. `src-tauri/src/review.rs` — `native_dispatch_operation`, `native_operation_status`, `native_cancel_operation`, `native_command_output` commands registered
3. `src-tauri/src/lib.rs` — All 5 new commands registered in invoke handler
4. `src-tauri/native-host/src/command.rs` — `CommandOutput` exported publicly
5. `lib/harness/nativeWorkspace.ts` — Client methods + schemas added
6. `src-tauri/src/ipc_tests.rs` — Tests updated for new command permissions
7. `docs/operations/native-integration-verification.md` — Acceptance criteria documented
8. `plan.md` — S2c.6 as current slice

## Bounded acceptance cases (will be tested via WebView smoke test)

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