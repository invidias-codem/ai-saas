# Native desktop host: authenticated startup and lifecycle

S2a/S2b establish the Rust-owned authenticated session and lifecycle. S2c.1 adds versioned local authority and a closed native action allowlist; S2c.2 adds [native-confirmed read-only folder grants](native-workspace-reads.md). This builds on [S1](native-capability-security.md); it does not qualify a downloadable installer.

## Startup contract

Rust generates 32 bytes from the OS random source for every launch. The credential has no serialization or debug implementation and is never returned to JavaScript, written to an application file, put in argv, or logged. It is passed to the owned daemon as `LATTICE_AUTH_TOKEN`; only an allowlist of ordinary OS environment variables is inherited. This does not protect environment values from a process with sufficient same-user or administrator privileges.

The child works in `<app_local_data_dir>/native-host`, rather than the installation directory. On Unix the directory is made private to the user; a symlink at the final directory component is refused. Native mode does not open or initialize the legacy shared vector/episodic SQLite database. Existing data is not deleted or migrated. The working directory remains transitional per-OS-user storage, not an isolated profile store; S4 must define ownership, migration and recovery before qualifying persistent project memory.

The raw stdout parser accepts one newline-terminated JSON object with exactly `status: "ready"` and a nonzero `u16` port, within 4 KiB. The announcement only selects `127.0.0.1:<port>/rpc`. Rust then requires authenticated liveness, compatible native protocol/features, an exact authority binding acknowledgement and a subsequent authority-scoped heartbeat. Startup verification has a seven-second deadline after spawn; each RPC has a 1.5-second deadline and a 2 MiB response cap. Proxies and redirects are disabled. No generic action, destination or credential setter is available to the webview.

## Native authority protocol

The launcher always supplies `--native-host`, separately from `--parent-stdio`. Native protocol version 1 requires mode `local` and features `session-authority-v1`, `native-action-allowlist-v1` and `read-grants-v1`. These are separate from JSON-RPC `2.0`. A standalone or earlier two-feature daemon cannot satisfy this contract; no native-to-standalone fallback exists.

Rust generates independent 128-bit random local principal, workspace and generation identifiers for each launch, with initial policy revision 1 and grant revision 0. This is ephemeral authority under the current OS user, not a verified company/Clerk account. No frontend command accepts these values. Go permits one binding after negotiation, atomically, and rejects rebinding, company namespaces and noninitial revisions. A failed/ambiguous bind closes the Rust session; it is never automatically retried.

Native frames use closed schemas: required/exact fields, no duplicates or case aliases, no null primitive authority fields, no trailing JSON and a maximum nesting depth of 64. Authentication remains mandatory before control or capability dispatch. Bound heartbeats and `native_session_status` require exactly matching identity, generation and policy/grant revisions. Lifecycle shutdown remains available with launch authentication even before binding or when authority is uncertain.

The native allowlist contains `status`, `native_protocol`, `bind_native_session`, `native_session_status`, `shutdown`, private `native_update_grants`, and typed `native_read_text`/`native_list`/`native_stat`. Only Rust can install complete identity-matching snapshots at the next grant revision. Every legacy file/command route and every memory, cloud, ingestion, repository, network or unknown action is denied before the standalone dispatcher. Native status returns no global telemetry backlog. No file mutation or shell execution is exposed. Standalone clients retain their existing authenticated routes and tests.

Tauri application commands are declared through `AppManifest::commands` with `native-host-control` and `native-workspace-read` permissions. Only the exact local `main` webview receives lifecycle controls, typed read/picker/revoke operations and event listen/unlisten; it has no generic dialog/filesystem plugin, shell, generic RPC, grant/identity setter, event emit or Stronghold permission. A navigation hook rejects destinations outside the approved local main origins. The earlier browser-owned Stronghold/cloud-login path is not enrolled by this local surface. Company/native credential custody and production desktop login remain separate work.

Release and development CSPs restrict scripts, frames, objects, forms and connections to the declared local sources/IPC transport. Development additionally permits the configured HMR websocket and eval needed by development tooling, without allowing inline scripts. These policies do not turn the connected Next.js dashboard into a packaged/offline client. S3 must reconcile the actual production assets and verify native enforcement before data-bearing UI qualification.

## Frontend and lifecycle

Only the local `main` window can invoke the heartbeat. Release origins are `tauri://localhost` and `http://tauri.localhost`; the configured `http://localhost:3000` development origin is accepted only in debug builds. The frontend receives status, static error codes/messages and typed display events. It receives no credential, daemon port, arbitrary response payload or raw child output.

Rust retains the child handle through the shared `lattice-native-host` lifecycle coordinator. The Tauri adapter only spawns the bundled service, forwards bounded events, and terminates/releases its owned process handle. Concurrent lifecycle operations return `LOCAL_SERVICE_BUSY`. A caller disappearing does not cancel an already owned transition. Generation checks invalidate old heartbeat results and readiness callbacks.

The local main window can request `restart_daemon`. Rust closes the old heartbeat session, sends one authenticated typed `shutdown` RPC, and waits for a confirmed normal zero exit before launching a replacement with fresh credentials and local authority. Grants are not carried into the replacement. Selected grants and exact-operation approvals remain S2c.2 onward. The frontend offers a restart action and ignores heartbeat replies from the previous restart generation.

The Go daemon closes work admission at shutdown, cancels active request contexts and registered background ingestion, and waits for them before closing shared resources. Command runners cancel and wait for their own process groups/jobs; internal Git commands now use the same management. Embedding, repository upload and telemetry requests inherit cancellation. Telemetry close joins its workers. Unfinished work after the five-second daemon deadline produces a nonzero exit, not a clean shutdown result.

Native launches use `--parent-stdio`: EOF/error on the owned stdin lifeline initiates the same graceful stop if the desktop parent disappears. The default standalone CLI mode keeps its existing stdin behavior. This is parent-loss handling, not durable task recovery.

The Rust stop path allows a 1.5-second control request, six seconds for normal exit, then two seconds for confirmation after fallback termination. Kill/wait does not block the Tauri event loop. Startup retains its seven-second verification deadline after spawn; storage and OS spawn calls are synchronous. App exit is deferred while bounded cleanup completes; a second exit request does not start another cleanup. A failed cleanup exits with a failure status.

Any forced, abnormal or unconfirmed daemon termination sets `LOCAL_CLEANUP_UNCONFIRMED` and blocks a replacement for that app session. The user must close Lattice and check running tasks before reopening. In particular, force-killing a Unix daemon cannot prove that separately grouped command descendants have exited. The host refuses to treat this as a successful restart. The outer Windows job and Unix process group do not establish OS filesystem/network isolation. Those qualifications remain separate; no generic file or shell operation is exposed by S2b.

The app-local working directory remains transitional per-OS-user storage. Profile ownership, migrations, checkpoint durability and interrupted-task reconciliation remain S4. Downloads, clean-machine installers and signing remain gated through S3/S5/S6.

## Verification

The GTK-independent `src-tauri/native-host` crate tests protocol boundaries and talks to a freshly built real Go daemon. Windows/Linux CI builds the daemon and a process-tree helper from the PR revision, then supplies `LATTICE_TEST_DAEMON_PATH` and `LATTICE_TEST_PROCESS_HELPER_PATH`. Local runs without the daemon path skip the real-process suites and cannot count as integration evidence; supplying the daemon path without the required helper fails the lifecycle suite.

```sh
go -C go-harness build -o /tmp/lattice-rust-host-test ./cmd/lattice-harness
go -C go-harness test -c -o /tmp/lattice-process-helper ./internal/executil
LATTICE_TEST_DAEMON_PATH=/tmp/lattice-rust-host-test \
  LATTICE_TEST_PROCESS_HELPER_PATH=/tmp/lattice-process-helper \
  cargo test --locked --manifest-path src-tauri/native-host/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/native-host/Cargo.toml --all-targets -- -D warnings
```

The real lifecycle tests exercise the production coordinator with a native-mode headless adapter: three clean restarts, retired-token rejection, no overlapping daemons and refusal after a crash. Explicit standalone fixtures retain command-descendant shutdown and parent-loss tests; native permissions are never relaxed to start test commands. Native enrollment tests prove standalone refusal and that native startup leaves shared memory unopened. Virtual-time tests retain concurrent requests, abandoned IPC callers and bounded unresponsive-child cleanup.

The full Tauri workflow compiles the adapter and checks clippy on Windows/Linux. Its MockRuntime IPC tests exercise the production capability manifest and permission resolver, including wrong-window/origin and denied shell/secret-store/generic RPC calls. A separate Chromium test serves the actual configured CSP as a response header and proves blocked script/frame/fetch requests against a reachable probe, with a permissive control. MockRuntime and Chromium-header tests are not a launched native WebKit/WebView2, an installer or an offline inference/profile/signing qualification. Native UI smoke tests remain required before enabling data-bearing desktop UI; the production frontend remains S3, clean-machine installers S5 and signed download publication S6.

On Windows, run `./scripts/native-host/test-shell-windows.ps1` from PowerShell with Rust and the Windows SDK installed. It compiles the unit-test executable identified by Cargo, embeds the Common Controls v6 manifest with SDK `mt.exe`, then runs every test and propagates its exit status. This handles [Tauri's library-test manifest issue](https://github.com/tauri-apps/tauri/issues/13419); the production application's Tauri-generated manifest remains independent.
