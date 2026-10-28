# Native desktop host: authenticated startup and lifecycle

S2a/S2b replace the Tauri bridge's unauthenticated port-only readiness check with a Rust-owned authenticated session. It builds on [S1](native-capability-security.md); it does not qualify a downloadable installer.

## Startup contract

Rust generates 32 bytes from the OS random source for every launch. The credential has no serialization or debug implementation and is never returned to JavaScript, written to an application file, put in argv, or logged. It is passed to the owned daemon as `LATTICE_AUTH_TOKEN`; only an allowlist of ordinary OS environment variables is inherited. This does not protect environment values from a process with sufficient same-user or administrator privileges.

The child works in `<app_local_data_dir>/native-host`, rather than the installation directory. On Unix the directory is made private to the user; a symlink at the final directory component is refused. This is a transitional per-OS-user location for the daemon's SQLite files. It is not an account/workspace-isolated profile store. S4 must define ownership, migration and recovery before qualifying persistent project memory. Existing files in a previous development working directory are not migrated here.

The raw stdout parser accepts one newline-terminated JSON object with exactly `status: "ready"` and a nonzero `u16` port, within 4 KiB. The announcement only selects `127.0.0.1:<port>/rpc`. Readiness requires a subsequent credential-authenticated `status` response with the current JSON-RPC request ID, version and typed payload. Startup verification has a seven-second deadline after spawn; each RPC has a 1.5-second deadline and a 2 MiB response cap. Proxies and redirects are disabled. No generic action, destination or credential setter is available to the webview.

## Frontend and lifecycle

Only the local `main` window can invoke the heartbeat. Release origins are `tauri://localhost` and `http://tauri.localhost`; the configured `http://localhost:3000` development origin is accepted only in debug builds. The frontend receives status, static error codes/messages and typed display events. It receives no credential, daemon port, arbitrary response payload or raw child output.

Rust retains the child handle through the shared `lattice-native-host` lifecycle coordinator. The Tauri adapter only spawns the bundled service, forwards bounded events, and terminates/releases its owned process handle. Concurrent lifecycle operations return `LOCAL_SERVICE_BUSY`. A caller disappearing does not cancel an already owned transition. Generation checks invalidate old heartbeat results and readiness callbacks.

The local main window can request `restart_daemon`. Rust closes the old heartbeat session, sends one authenticated typed `shutdown` RPC, and waits for a confirmed normal zero exit before launching a replacement with a fresh credential. Grants are not carried into the replacement. S2c must re-enroll the user/workspace and inject approved grants through typed native operations. The frontend offers a restart action and ignores heartbeat replies from the previous restart generation.

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

The real lifecycle tests exercise the production coordinator with a headless OS process adapter: three clean restarts, retired-token rejection, no overlapping daemons, command-descendant cleanup, grant reset, parent loss and refusal after a crash. Virtual-time tests cover concurrent requests, abandoned IPC callers and bounded unresponsive-child cleanup.

The full Tauri workflow compiles the adapter, runs adapter tests, and checks clippy on Windows and Linux, with Linux GUI build dependencies installed. This is compilation and headless test evidence. It is not a launched production webview, a clean-machine Windows test, an installer artifact, offline inference, profile isolation or signing qualification. The production frontend remains S3, Windows/Linux installer candidates S5, and signed download publication S6.
