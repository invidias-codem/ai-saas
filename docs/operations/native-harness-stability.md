# Native harness stability and release gates

The command layer is a release candidate under review in PR #448. It is not an
installed desktop release. Passing command tests does not qualify the complete
offline agent, local profile, Copilot/Teams adapter, or installer.

## Runtime guarantees in this slice

- Initialization is shared across concurrent callers. A ready daemon is reused;
  restart is explicit and generates a new credential. Mutation requests are
  never retried automatically, including requests whose outcome is unknown.
- The ready message must be valid JSON with an integer loopback port in 1–65535.
  The handshake is limited to 4 KiB and five seconds. Invalid/late messages do
  not make a failed daemon available. Failed startup kills the child.
- A missing executable, failed database initialization, or early process exit
  fails startup. An explicitly selected native harness never falls back to a
  different execution policy.
- RPC has a deadline covering connection, headers, and streamed response body.
  Normal operations have 30 seconds; commands have their declared capped runtime
  plus five seconds for cleanup. Responses are limited to 2 MiB and validated
  for protocol version, matching request identity, and result/error shape.
- Shutdown immediately disables the session and aborts pending requests. Callers
  should await `shutdown()` to wait for process exit; after five seconds the
  client escalates termination. Stale child events cannot clear a new session.
- The Go listener bounds request bodies to 2 MiB, rejects unapproved browser
  origins, and applies header/body/idle deadlines. Origin checks supplement the
  daemon token; they do not authenticate native clients.
- Go shutdown cancels HTTP request contexts and waits for active handlers to
  finish cleanup before releasing workspace handles and the memory database.
  Commands retain the process-tree, output, timeout, and grant checks described
  in `windows-command-harness.md`.

An RPC deadline or broken connection can leave the caller uncertain whether a
mutation completed before disconnection. Do not resubmit automatically. Reconcile
observable state first; exactly-once command execution needs durable operation
identities and outcome recording in a separate implementation.

## Required evidence

`Windows command harness` CI now covers native Go command/RPC tests repeatedly
on Windows and Linux, Go race detection on Linux, and Node-to-Go tests using the
daemon built from the current commit. The Node integration tests verify grant
denial, authorized failure diagnostics, project checkpoint recall after daemon
restart, failure when the database is unavailable, and command termination on
application shutdown. If `LATTICE_TEST_DAEMON_PATH` is absent locally, those
integration tests are explicitly skipped; CI supplies it and must execute them.

Example local verification from the repository root:

```sh
cd go-harness
go test -race ./internal/fsutil ./internal/executil ./harness ./cmd/lattice-harness
go build -o /tmp/lattice-test-daemon ./cmd/lattice-harness
cd ..
LATTICE_TEST_DAEMON_PATH=/tmp/lattice-test-daemon pnpm exec jest --runInBand lib/harness/nativeDaemonClient.integration.test.ts lib/harness/GoIOHarness.test.ts lib/harness/IOHarness.stability.test.ts
```

The existing full Go parity suite additionally requires its external fixture
manifest. Do not report it green when the fixtures are missing. Hosted Windows
Server runtime tests also do not replace installation tests on Windows 11.

## Remaining gates before calling the desktop stable

| Gate | Evidence needed |
| --- | --- |
| Production client | Packaged desktop UI starts without localhost development services; authenticated remote features have explicit failure states |
| Native security | Rust owns a per-launch credential and child lifecycle; packaged daemon refuses missing auth; scoped IPC and exact approvals survive resume without bypassing sandbox policy |
| Restricted execution | Company file/network boundaries are enforced by an appropriate OS sandbox; cwd and Job Objects alone do not provide this |
| Durable profile | OS-resolved tenant/account/workspace data paths, protected keys, migrations, backup/restore, corruption recovery and reset/restart tests |
| Offline mode | No implicit cloud inference, telemetry, license or model-download dependency; child-process egress is covered; a qualified local model is required for offline reasoning |
| Load and crash qualification | Bounded simultaneous commands, sustained-session memory/handle measurements, parent-crash recovery and durable reconciliation of ambiguous mutations |
| Distribution | Signed standard/offline installers; final-byte checksums and provenance; clean-machine install, upgrade, interruption recovery, rollback and uninstall |

The daemon now refuses missing launch authentication; the former unset-token
compatibility mode was removed during #448 review. Rust credential injection and
authenticated RPC remain packaging blockers. The follow-up
[native capability security slice](native-capability-security.md) adds pinned,
identity-scoped file grants and outbound HTTP/credential restrictions.
The memory database remains relative
to the launch directory; the restart test establishes persistence at that location,
not encryption, enterprise identity isolation, or recovery after workspace removal.
Local Node fallback and cloud approval/resume routes are not qualified by this slice.

Stabilization order: finish the command/host regression gate, prove the production
desktop client, complete native auth and profile isolation, qualify offline/load
behavior, then qualify signed installer lifecycle. Keep desktop downloads inactive
until the corresponding final artifacts have passed those gates.
