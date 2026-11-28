# S2c.6: Native integration verification — acceptance criteria

This document defines the acceptance criteria for S2c.6. These flows must be verified through the actual Tauri desktop UI on Windows and Linux before the slice is complete. Current CI validates Rust/Go unit tests, MockRuntime IPC, CSP headers (Playwright Chromium), and review renderer (Node.js DOM) — **not** the end-to-end WebView flows below.

## Acceptance criteria

### 1. Folder selection and revocation

**User action**: Calls `native_select_folder` → native OS folder picker opens → user picks folder → read-access confirmation dialog shows exact path → user confirms → grant recorded.

**Verification**:
- Grant `grant_id` matches `^local-grant-[a-f0-9]{32}$`
- `display_path` is absolute, canonicalized, and matches the selected folder
- `read_only: true`
- `native_workspace_grants` returns the grant
- `native_revoke_grant` removes it; subsequent reads return `LOCAL_GRANT_DENIED`

### 2. Permitted text reads

**User action**: After grant confirmation, calls `native_read_text`/`native_list`/`native_stat` with `grant_id` and relative path.

**Verification**:
- UTF-8 files ≤ 256 KiB return exact content + byte count
- `native_list` returns entries with `name` and `kind` (`file`/`directory`/`symlink`/`other`)
- `native_stat` returns `kind` and `size`
- Paths outside grant or with `..` return `LOCAL_PATH_INVALID`
- Revoked grant returns `LOCAL_GRANT_DENIED`
- Non-UTF-8 or NUL-containing files return `LOCAL_TEXT_UNSUPPORTED`

### 3. One supported file mutation (create_file)

**User action**: Proposes `create_file` → `native_open_review` opens bundled review window at `lattice-review://localhost/index.html` → window displays:
- Operation kind, selected folder, relative path
- Precondition: "The target must not already exist"
- Exact new content as quoted JSON + hex bytes
- Scrollable byte views (content, and base for write_text)
- Checkbox: "I reviewed the exact operation, target and complete content"
- Buttons: "Deny and close", "Accept exact proposal"

**Verification**:
- Window only loads the exact review URL; navigation elsewhere denies the lease
- `ready` only after `native_review_ready` acknowledge
- Checkbox enables only after both byte views scrolled to bottom
- Accept calls `native_review_decide` with exact `proposal_id` and `digest`
- `native_dispatch_operation` returns `OperationState::Succeeded`
- File exists on disk with exact proposed content
- Second dispatch on same proposal returns error (replay protection)

### 4. Write text mutation with conflict detection

**User action**: Enable write access via separate consent dialog → propose `write_text` → review shows base content + precondition "matches_base" → accept → external edit → dispatch returns `Conflict` → re-propose with fresh base → accept → dispatch `Succeeded`.

**Verification**:
- Write consent dialog is separate from read confirmation
- Base content and SHA3-256 match on-disk content at review time
- External edit after review acceptance → `Conflict` status, file unchanged
- Fresh proposal after conflict → new review → `Succeeded`

### 5. Restart clears authority

**User action**: Call `restart_daemon` → Rust sends authenticated `shutdown` RPC → waits for clean exit → launches fresh daemon with new credentials → new local authority (principal/workspace/generation).

**Verification**:
- Old `grant_id` rejected (`LOCAL_GRANT_DENIED`)
- Old `proposal_id` rejected (`LOCAL_PROPOSAL_UNAVAILABLE`)
- Old review lease denied
- `native_session_status` shows fresh generation
- New bind required before any operation

### 6. Commands fail closed

**User action**: Propose `execute_command` with any supported mode (`direct`, `cmd`, `powershell`, `pwsh`, `sh`) → review shows `requires_sandbox: true`, `provider.id: "unavailable"`, `execution_available: false` → accept → dispatch returns `LOCAL_SANDBOX_REQUIRED`.

**Verification**:
- No process launched (no side-effect files created)
- `operation_status` returns `Denied` with `LOCAL_SANDBOX_REQUIRED`
- `command_output` returns `LOCAL_OPERATION_UNAVAILABLE`
- `pwsh` on Windows without PowerShell 7 returns `LOCAL_SHELL_UNAVAILABLE` before review
- `sh` on Windows returns `LOCAL_SHELL_UNAVAILABLE` before review

## Platform-specific notes

### Linux (Ubuntu 22.04/24.04)

- Folder picker: GTK file chooser (requires `libwebkit2gtk-4.1-dev`, `libxdo-dev`)
- Daemon: `lattice-harness-x86_64-unknown-linux-gnu`
- Review window: WebKitGTK
- CI: `ubuntu-latest` in `native-host.yml` and `build-tauri.yml`

### Windows 11 x64

- Folder picker: Win32 `IFileOpenDialog` (Common Controls v6 manifest embedded in test binary)
- Daemon: `lattice-harness-x86_64-pc-windows-msvc.exe`
- Review window: WebView2
- CI: `windows-latest` in `native-host.yml` and `build-tauri.yml`
- Unit tests require `mt.exe` from Windows SDK to embed manifest (handled by `scripts/native-host/test-shell-windows.ps1`)

## Known limitations (not qualified by S2c.6)

- No qualified command sandbox — all commands return `LOCAL_SANDBOX_REQUIRED`
- No persistent profiles/checkpoints — restart loses all grants (S4)
- Bundled evaluation workspace available; complete desktop product qualification remains S3
- Evaluation installer workflow available; clean-machine installation/upgrade qualification remains S5
- No signed downloads — distribution not qualified (S6)
- No company enrollment, Copilot/Teams, local inference
- No ARM64, macOS, iOS, Android
- No multi-device sync
- No durable task recovery across restarts

## Current evidence (not WebView end-to-end)

| Evidence | Path |
|---|---|
| Real daemon integration tests (Rust IPC, not WebView) | `src-tauri/native-host/tests/real_daemon.rs` |
| Real lifecycle tests | `src-tauri/native-host/tests/real_lifecycle.rs` |
| Tauri lib IPC/permission tests (MockRuntime) | `src-tauri/src/ipc_tests.rs` |
| CSP header tests (Playwright Chromium, not WebView) | `scripts/native-host/csp.test.mjs` |
| Review renderer tests (Node.js DOM, not WebView) | `scripts/native-host/review.test.mjs` |
| Go protocol fixtures | `testdata/native-*.json` |
| Go daemon tests | `go-harness/internal/.../*_test.go` |
| Windows unit test runner | `scripts/native-host/test-shell-windows.ps1` |

## Missing: WebView smoke test (S2c.6 gate)

A Tauri WebView test that launches the real app, opens the native folder picker, confirms read access, reads a file, proposes a mutation, opens the review window, accepts it, and verifies the file on disk — all through the actual `tauri::WebviewWindow` and IPC layer.

## CI verification commands

```bash
# Linux real daemon tests
go -C go-harness build -o /tmp/lattice-rust-host-test ./cmd/lattice-harness
go -C go-harness test -c -o /tmp/lattice-process-helper ./internal/executil
LATTICE_TEST_DAEMON_PATH=/tmp/lattice-rust-host-test \
  LATTICE_TEST_PROCESS_HELPER_PATH=/tmp/lattice-process-helper \
  cargo test --locked --manifest-path src-tauri/native-host/Cargo.toml

# Tauri lib tests (Linux)
LATTICE_TEST_DAEMON_PATH=/tmp/lattice-rust-host-test \
  cargo test --locked --manifest-path src-tauri/Cargo.toml --lib

# Tauri lib tests (Windows)
./scripts/native-host/test-shell-windows.ps1

# CSP and review renderer tests
node --test scripts/native-host/csp.test.mjs
node --test scripts/native-host/review.test.mjs

# Full Tauri compile
cargo build --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo clippy --locked --manifest-path src-tauri/native-host/Cargo.toml --all-targets -- -D warnings
```

## Reproducible bundled UI and evaluation packages

Use [desktop-test-downloads.md](desktop-test-downloads.md) for the current build commands, package paths, and remaining gates. The desktop now embeds its own local interface from `desktop/dist`; the SaaS `pnpm build` and `../out` do not prepare this application. Real-WebView IPC evidence and native-dialog/mutation qualification remain distinct.
