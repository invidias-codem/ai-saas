# Native desktop host: authenticated startup

S2a replaces the Tauri bridge's unauthenticated port-only readiness check with a Rust-owned authenticated session. It builds on [S1](native-capability-security.md); it does not qualify a downloadable installer.

## Startup contract

Rust generates 32 bytes from the OS random source for every launch. The credential has no serialization or debug implementation and is never returned to JavaScript, written to an application file, put in argv, or logged. It is passed to the owned daemon as `LATTICE_AUTH_TOKEN`; only an allowlist of ordinary OS environment variables is inherited. This does not protect environment values from a process with sufficient same-user or administrator privileges.

The child works in `<app_local_data_dir>/native-host`, rather than the installation directory. On Unix the directory is made private to the user; a symlink at the final directory component is refused. This is a transitional per-OS-user location for the daemon's SQLite files. It is not an account/workspace-isolated profile store. S4 must define ownership, migration and recovery before qualifying persistent project memory. Existing files in a previous development working directory are not migrated here.

The raw stdout parser accepts one newline-terminated JSON object with exactly `status: "ready"` and a nonzero `u16` port, within 4 KiB. The announcement only selects `127.0.0.1:<port>/rpc`. Readiness requires a subsequent credential-authenticated `status` response with the current JSON-RPC request ID, version and typed payload. Startup verification has a seven-second deadline after spawn; each RPC has a 1.5-second deadline and a 2 MiB response cap. Proxies and redirects are disabled. No generic action, destination or credential setter is available to the webview.

## Frontend and lifecycle

Only the local `main` window can invoke the heartbeat. Release origins are `tauri://localhost` and `http://tauri.localhost`; the configured `http://localhost:3000` development origin is accepted only in debug builds. The frontend receives status, static error codes/messages and typed display events. It receives no credential, daemon port, arbitrary response payload or raw child output.

Rust retains the child handle. Startup, protocol failure and app exit close the session and dispose of the owned child; closing a session cancels in-flight heartbeat requests. Generation checks prevent late callbacks from reviving a stopped or failed launch. This slice does not offer an explicit restart command. Recovering from a terminal startup error currently requires restarting the application.

The shell plugin launches the daemon in an owned process group/job. This establishes ownership of the service; it does not prove cleanup of arbitrary commands. The Go command runner can create separate Unix process groups. S2b must implement a graceful daemon shutdown that cancels and reaps active work, bounded fallback termination, fresh-credential restart and platform lifecycle tests. S2c then adds typed identity/grant injection and explicitly approved operations. No new file or shell operation is exposed by S2a.

## Verification

The GTK-independent `src-tauri/native-host` crate tests protocol boundaries and talks to a freshly built real Go daemon. CI builds that daemon from the PR revision on Windows and Linux and supplies `LATTICE_TEST_DAEMON_PATH`; local runs without that variable skip the two real-daemon tests and cannot count as integration evidence.

```sh
go -C go-harness build -o /tmp/lattice-rust-host-test ./cmd/lattice-harness
LATTICE_TEST_DAEMON_PATH=/tmp/lattice-rust-host-test \
  cargo test --locked --manifest-path src-tauri/native-host/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/native-host/Cargo.toml --all-targets -- -D warnings
```

The full Tauri workflow compiles the adapter, runs child-monitor/state tests, and checks clippy on Windows and Linux, with Linux GUI build dependencies installed. This is compilation and headless test evidence. It is not a launched production webview, a clean-machine Windows test, an installer artifact, offline inference, profile isolation or signing qualification. The production frontend remains S3, Windows/Linux installer candidates S5, and signed download publication S6.
