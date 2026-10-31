# S2c.6: Native integration verification — integration wiring complete, CI passing, manual WebView verification pending

Verify the complete S2c stack through actual native UI on Windows and Linux. This slice does not add new capabilities; it proves the existing S2c.1–S2c.5 flows compose correctly through the Tauri webview.

## Scope

Prove the following user-visible flows work in the real desktop app:

1. **Folder selection and revocation** — Native folder picker opens, read-access confirmation displays the exact path, grant is recorded, revocation removes it.
2. **Permitted text reads** — After grant confirmation, `native_read_text`, `native_list` and `native_stat` return exact content/metadata for UTF-8 files under the grant.
3. **One supported file mutation** — Propose `create_file`, open the bundled native review window, scroll through complete byte views, acknowledge, accept — observe `OperationState::Succeeded` and the file on disk.
4. **Honest outcomes** — Status, output and error codes match the contract; no hidden fallbacks or silent successes.
5. **Restart clears authority** — `restart_daemon` invalidates all grants, proposals and review leases; a fresh bind is required.
6. **Commands fail closed** — Every supported command mode returns `LOCAL_SANDBOX_REQUIRED` without launching a process.

## Acceptance evidence (automated CI passing, manual WebView verification pending)

| Platform | Automated CI | Manual verification required |
|---|---|---|
| Linux (Ubuntu 22.04) | ✅ Compile, clippy, lib tests (MockRuntime + real daemon), ACL tests, CodeQL | GTK folder picker, read-access dialog, review window, native dialogs, disk verification |
| Windows 11 x64 | ✅ Compile, clippy, lib tests (with `mt.exe` manifest), ACL tests, CodeQL | Win32 `IFileOpenDialog`, WebView2 review window, PowerShell/cmd/sh availability, disk verification |

**Commit**: `9fa030ea` (PR #459)
**CI Run**: `40985647471` (Native desktop host), `40976480617` (Validate Tauri Native Shell)

## Verified stack (automated)

- Rust `src-tauri/native-host` protocol, authority, workspace, review, mutation, command crates
- Go `go-harness/cmd/lattice-harness` daemon with native startup, binds, grants, reads, mutations, commands
- Tauri `src-tauri/src/workspace.rs`, `src-tauri/src/review.rs` commands and review window
- Bundled review assets (`src-tauri/review-assets/index.html`, `review.js`, `review.css`, `policy.json`)
- TypeScript client `lib/harness/nativeWorkspace.ts` (schema-validated IPC)
- CI workflows: `native-host.yml` (protocol + real daemon), `build-tauri.yml` (compile + lib tests + webview-smoke-test job)

## Integration wiring complete (files changed)

1. `src-tauri/src/workspace.rs` — `native_request_write_access` command registered (fixed argument order), added `native_daemon_status`
2. `src-tauri/src/review.rs` — `native_dispatch_operation`, `native_operation_status`, `native_cancel_operation`, `native_command_output` commands registered (removed unused `OperationState` import)
3. `src-tauri/src/lib.rs` — All 6 new commands registered in invoke handler
4. `src-tauri/native-host/src/command.rs` — `CommandOutput` exported publicly
5. `lib/harness/nativeWorkspace.ts` — Client methods + schemas added (`dispatchOperation`, `operationStatus`, `cancelOperation`, `commandOutput`, `requestWriteAccess`, `daemonStatus`)
6. `src-tauri/src/ipc_tests.rs` — Tests updated for new command permissions (MockRuntime ACL verification)
7. `src-tauri/permissions/native-host.toml` — Added `native-operation-control` permission, updated `native-workspace-read`
8. `src-tauri/capabilities/default.json` — Added `native-operation-control` (removed `native-review-decision` from main webview)
9. `docs/operations/native-integration-verification.md` — Acceptance criteria documented (not "verified")
10. `plan.md` — S2c.6 as current slice
11. `.github/workflows/build-tauri.yml` — Added `webview-smoke-test` job (Linux Xvfb + Playwright)
12. `scripts/native-host/webview-smoke.test.mjs` — Updated to verify daemon handshake, note manual IPC verification

## CI verification results (commit 9fa030ea)

| Check | Linux | Windows |
|---|---|---|
| Compile Tauri native shell | ✅ | ✅ |
| Rust fmt / clippy | ✅ | ✅ |
| Tauri lifecycle & IPC permission tests (MockRuntime) | ✅ | ✅ |
| Real daemon tests (`LATTICE_TEST_DAEMON_PATH`) | ✅ | ✅ |
| Local webview CSP (Playwright Chromium) | ✅ | ✅ |
| native-commands | ✅ | ✅ |
| native-client | ✅ | ✅ |
| Rust and Go authenticated startup | ✅ | ✅ |
| CodeQL (all languages) | ✅ | ✅ |
| Production Build Validation | ✅ | ✅ |

## Manual WebView smoke test procedure (S2c.6 gate)

### Linux (Ubuntu 22.04/24.04)
```bash
# Prerequisites
sudo apt-get install -y libwebkit2gtk-4.1-dev libxdo-dev xvfb

# Build Go sidecar (placed where Tauri's sidecar launcher expects it)
go -C go-harness build -o ./src-tauri/binaries/lattice-harness-x86_64-unknown-linux-gnu ./cmd/lattice-harness

# Build Next.js frontend to ../out (required by tauri.conf.json frontendDist)
pnpm build

# Build Tauri app (release) - produces `app` executable
cargo build --locked --manifest-path src-tauri/Cargo.toml --release

# Run with Xvfb (headless) - Tauri launches sidecar automatically
Xvfb :99 -screen 0 1280x720x24 &
export DISPLAY=:99
./src-tauri/target/release/app
```

**Verify in running app:**
1. Call `native_select_folder` → GTK file picker opens → pick `testdata/smoke-test-workspace`
2. Read-access dialog shows exact path → confirm → grant recorded (`local-grant-...`, `read_only: true`)
3. Call `native_read_text`/`native_list`/`native_stat` → exact content/metadata returned
4. Call `native_request_write_access` → warning dialog → confirm → grant becomes writable
5. Propose `create_file` (`note.md`, "test content") → `native_open_review` → review window at `lattice-review://localhost/index.html`
6. Scroll byte views → checkbox enables → acknowledge → accept → `native_dispatch_operation` → `Succeeded`
7. Verify file exists on disk with exact content
8. Propose `write_text` → base content shown → external edit → dispatch → `Conflict` → re-propose → `Succeeded`
9. Call `restart_daemon` → grants/proposals cleared → new bind required
10. Propose `execute_command` (any mode) → review shows `requires_sandbox: true`, `provider.id: "unavailable"` → accept → dispatch → `LOCAL_SANDBOX_REQUIRED`

### Windows 11 x64
```powershell
# Prerequisites: Visual Studio C++ Build Tools, WebView2 Runtime, Windows SDK (mt.exe)

# Build Go sidecar (placed where Tauri's sidecar launcher expects it)
go -C go-harness build -o ./src-tauri/binaries/lattice-harness-x86_64-pc-windows-msvc.exe ./cmd/lattice-harness

# Build Next.js frontend to ../out (required by tauri.conf.json frontendDist)
pnpm build

# Build Tauri app (release) - produces `app.exe` executable
cargo build --locked --manifest-path src-tauri/Cargo.toml --release

# Run - Tauri launches sidecar automatically via tauri-plugin-shell
./src-tauri/target/release/app.exe
```

**Verify in running app:**
1. Same flow as Linux, using Win32 `IFileOpenDialog` for folder picker
2. PowerShell/cmd/sh availability: `pwsh` returns `LOCAL_SHELL_UNAVAILABLE` if PowerShell 7 not installed; when `pwsh.exe` IS found, dispatch returns `LOCAL_SANDBOX_REQUIRED`. `sh` returns `LOCAL_SHELL_UNAVAILABLE` on Windows.
3. WebView2 review window renders correctly
4. Disk verification same as Linux

**Note for manual verification:** Xvfb runs headless; use `x11vnc` or `vncviewer` to interact with GTK dialogs on Linux. On Windows, run directly on a desktop session.

## Bounded acceptance cases (to be verified manually)

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

---

## Verification Checklist (per platform)

**Platform**: Linux (Ubuntu 22.04/24.04) / Windows 11 x64
**Commit**: `____`
**OS/Version**: `____`
**Executable hash (SHA256)**: `____`
**Date**: `____`
**Verifier**: `____`

### Prerequisites Built
- [ ] Go sidecar built to `src-tauri/binaries/lattice-harness-<target>`
- [ ] Next.js frontend built to `../out` (`pnpm build`)
- [ ] Tauri app built release (`cargo build --locked --manifest-path src-tauri/Cargo.toml --release`)
- [ ] Executable produced: `app` (Linux) / `app.exe` (Windows)

### Launch & Handshake
- [ ] App launches without error
- [ ] Daemon handshake completes: stdout shows `{"status":"ready","port":N}`
- [ ] Daemon port parsed: `____`
- [ ] App process stable after handshake (30s)

### Authenticated IPC Verification (via WebView)
- [ ] Call `native_daemon_status` from main window → returns `Status { events: [...] }` (non-null)
- [ ] Response contains valid `TelemetryEvent` array
- [ ] Reject: timeout, malformed response, stale session all fail appropriately

### Folder Selection & Consent
- [ ] `native_select_folder` opens native picker (GTK / Win32 `IFileOpenDialog`)
- [ ] Pick `testdata/smoke-test-workspace`
- [ ] Read-access confirmation dialog shows exact absolute path
- [ ] Confirm → grant recorded: `local-grant-<32hex>`, `read_only: true`
- [ ] `native_workspace_grants` returns the grant

### Permitted Reads
- [ ] `native_read_text` on granted file → exact UTF-8 content returned
- [ ] `native_list` on granted folder → exact entries with correct kinds
- [ ] `native_stat` on granted file → exact kind and size

### Write Consent
- [ ] `native_request_write_access` → warning dialog shown
- [ ] Confirm → grant updated to `read_only: false`
- [ ] `native_workspace_grants` reflects writable grant

### File Mutation (create_file)
- [ ] Propose `create_file` (`note.md`, "test content") → `native_propose_operation`
- [ ] `native_open_review` opens review window at `lattice-review://localhost/index.html`
- [ ] Review window renders complete byte views (original, proposed, diff)
- [ ] Scroll to bottom → acknowledge checkbox enables
- [ ] Acknowledge → Accept → `native_dispatch_operation`
- [ ] Returns `OperationStatus { status: "succeeded", ... }`
- [ ] **Disk verification**: File exists at `testdata/smoke-test-workspace/note.md` with exact content "test content"

### Conflict Detection (write_text)
- [ ] External edit: modify `note.md` to "external edit"
- [ ] Propose `write_text` with base "test content" → `native_propose_operation`
- [ ] `native_open_review` → review shows conflict
- [ ] Dispatch → returns `OperationStatus { status: "conflict", ... }`
- [ ] Re-propose with base "external edit" → dispatch → `Succeeded`
- [ ] **Disk verification**: File contains "external edit"

### Restart Clears Authority
- [ ] Call `restart_daemon`
- [ ] `native_workspace_grants` returns empty
- [ ] Previous grant IDs rejected (`LOCAL_GRANT_DENIED`)
- [ ] Previous proposals rejected (`LOCAL_PROPOSAL_UNAVAILABLE`)
- [ ] New `native_select_folder` + consent required for any access

### Command Execution (fail closed)
- [ ] Propose `execute_command` (mode: direct/pwsh/cmd/sh)
- [ ] Review shows `requires_sandbox: true`, `provider.id: "unavailable"`
- [ ] Accept → dispatch → returns `OperationStatus { status: "failed", code: "LOCAL_SANDBOX_REQUIRED" }`
- [ ] **Windows pwsh**: If `pwsh.exe` absent → `LOCAL_SHELL_UNAVAILABLE`; if present → `LOCAL_SANDBOX_REQUIRED`
- [ ] **Windows cmd/sh**: `cmd` → `LOCAL_SANDBOX_REQUIRED`; `sh` → `LOCAL_SHELL_UNAVAILABLE`
- [ ] No process launched, no files created

### Regression: Stdout Readiness Alone Cannot Pass
- [ ] Kill daemon process while app running
- [ ] `native_daemon_status` returns error (`LOCAL_SERVICE_EXITED` / `LOCAL_SERVICE_UNAVAILABLE`)
- [ ] App does not report false readiness

### Results
| Step | Result | Evidence (screenshot/log path) |
|------|--------|-------------------------------|
| Launch & Handshake | | |
| Authenticated IPC | | |
| Folder Selection & Consent | | |
| Permitted Reads | | |
| Write Consent | | |
| create_file Mutation | | |
| Conflict Detection | | |
| Restart Clears Authority | | |
| Command Fail Closed | | |
| Stdout Regression | | |

**Overall**: PASS / FAIL / PARTIAL
**Failures/Skipped**: `____`

---

**S2c.6 Closure Criteria**: Both Linux and Windows checklists completed with PASS, all evidence recorded, commit pinned to integration branch head.