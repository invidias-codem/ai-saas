# S2c: native workspace authority and approved operations

Status: planned; no runtime changes in this planning branch.

Goal: let a desktop user select a project folder, read permitted files, review an exact proposed change and authorize one attempt, while Rust retains the service credential, identity and permission decisions.

## Starting point

This plan is based on S2b commit `924b162b9b13072ec0bdbd656da092f10531c30b` in [draft PR #453](https://github.com/invidias-codem/ai-saas/pull/453). S1 #451 merged into main as `5757f425a598201529922abd7b47a320228985ff`. S2a #452 subsequently merged into the former S1 branch, `fix/native-capability-boundaries`, as `986c8a68a4c78e49d87c5a51a1c1f729bc6d593b`; that does not put S2a on main. The first integration gate is to reconcile S2a/S2b onto current main through human-reviewed PRs and run CodeQL. S2b's implementation checks pass; it has not qualified an installer. These branch facts were checked October 28, 2026.

| Current source | Established behavior | S2c gap |
| --- | --- | --- |
| `src-tauri/native-host/src/lifecycle.rs` | Owns daemon generations, cancellation, clean restart and fresh launch credentials | No enrolled workspace or operation coordinator |
| `src-tauri/native-host/src/lib.rs` | Strict typed status/shutdown RPC with bounded responses | No negotiated capability protocol or typed file operations; the 1.5-second control deadline cannot serve long commands |
| `src-tauri/src/lib.rs` | Checks the local main window for heartbeat/restart | No trusted folder selection or independent approval surface |
| `go-harness/cmd/lattice-harness/main.go` | Authenticates requests and dispatches grant-checked capabilities | Identity is supplied in RPC inputs; grant synchronization and legacy authenticated actions share the dispatcher |
| `go-harness/internal/fsutil/root_registry.go` | Pins `os.Root` handles; checks identity, read-only roots and revocation for file operations | Desktop has no trusted grant producer or grant revision contract |
| `go-harness/harness/command_execution.go` | Checks a matching root, identity and destructive permission before execution | No approval bound to the exact request; cwd lookup is separate from launch and does not confine the process |
| `lib/agents/core/approvalStore.ts` | Holds temporary SaaS tool approvals | It is not the native authority store and must not authorize desktop execution |
| `src-tauri/tauri.conf.json`, `capabilities/default.json`, `build.rs` | Main-window plugin permissions; CSP is null; default build helper | Privileged additions need explicit application-command ACLs and a restricted review surface |

The existing installer design supplies the governing requirements: command approval binds payload, shell, cwd, identity, revisions and expiry; recovery preserves uncertain outcomes; company scripts require qualified isolation. This plan applies those requirements to S2c. Durable project memory and crash reconciliation remain S4.

## User experience and scope

The first supported path is a local workspace under the current OS user. The user selects a folder through a native picker, confirms read access and can browse bounded text files. A proposed mutation opens a separate trusted review window showing the resolved project, paths and exact change. Confirmation permits one attempt. Denial, expiry or a changed request requires a new review.

Folder selection grants no shell permission. Command proposals can be reviewed, but execution requires a policy-approved isolation provider. The current runner supplies process ownership, not filesystem or network confinement, so it cannot satisfy a company sandbox requirement. Until a provider is qualified, the native command path returns `LOCAL_SANDBOX_REQUIRED` and launches nothing. This applies to direct executables as well as CMD, PowerShell, pwsh and sh.

S2c does not enroll a company tenant, attach Windows Copilot, publish a Teams endpoint, expose memory/embedding RPCs or activate downloads. Local workspace IDs are not company credentials. The local file preview is not company deployment qualification.

## Authority and protocol

### One active native workspace

- Rust creates an opaque, session-local principal and workspace ID using OS randomness. Display names from the webview confer no authority. The IDs represent this local workspace session, not a verified Clerk or company account.
- Keep one active workspace per daemon generation. Switching workspaces closes admission, cancels owned operations, invalidates pending reviews and performs an S2b clean restart. Uncertain cleanup blocks the switch.
- The replacement starts with no grants or approvals. The user selects and confirms folders again. Persistent profiles and automatic restoration require S4; restoring a remembered path must never silently restore authority.
- Future connected enrollment must validate the issuer, audience, expiry, tenant and workspace membership in a native trusted adapter. Until that adapter exists, refuse company-bound operations rather than accepting account IDs or role claims from JavaScript.

### Versioned native mode

Add an explicit native-host launch mode, separate from the stdin lifeline option. After authenticated liveness, Rust negotiates the S2c protocol version/features and binds the native session before permitting workspace operations. JSON-RPC `2.0` is not the capability protocol version. An old or incompatible daemon remains unavailable for file and command IPC.

In native mode, allow only typed lifecycle/protocol control, session/grant control and the approved file/operation endpoints. Before binding, permit only protocol/liveness/shutdown. Reject legacy file/command routes and unexposed memory, cloud, repository, ingestion and arbitrary network actions even when authenticated. Keep standalone compatibility explicit and test it separately; the desktop cannot fall back to it.

The binding fixes principal, workspace and native generation for that daemon. Grant updates are complete, identity-matching snapshots with a monotonically increasing grant revision. Policy has a separate revision. Control messages come only from Rust's private RPC session. Do not couple local grant installation to cloud telemetry configuration.

Every operation carries the bound generation and current policy/grant revisions. Go validates them at admission as defense in depth. Install a snapshot atomically or reject the whole update. A partial or unknown control outcome blocks workspace operations until a clean rebind; it cannot retain a silently usable old permission set.

### Webview boundary

The main webview can request a picker, read through a grant handle, propose an operation, query its status, cancel it or request revocation. It cannot set the principal, tenant, workspace, raw grant list, launch credential, daemon URL, approval decision or arbitrary RPC action.

Use explicit Tauri application-command permissions through `AppManifest::commands` and permission files, in addition to per-command origin/window checks. Merely registering an invoke handler does not establish that permission boundary [1]. Remove unused frontend Stronghold permissions from the local operation surface; do not grant generic shell, filesystem, HTTP or window-creation plugin access.

Rust creates a dedicated `native-review` window from a minimal bundled, fixed review asset. Only that exact native-created window instance can submit a decision for its current review. It receives a Rust-owned immutable display record and renders content as text, never executable HTML. The main window cannot approve by knowing a proposal ID. Allow one active review, bind it to its instance and generation, and destroy it after completion. Window close, unexpected navigation or incomplete display means denial.

Use separate capabilities for main and review. Give the review no network, arbitrary resource loading, opener, shell or window-management access. Restrict its CSP, including scripts, connections, objects and frames; do not load remote or model-generated scripts. Disable untrusted frames/navigation on any surface that has local file IPC. Establish and test the main local capability surface's CSP in S2c.1 before data-bearing IPC is enabled; reconcile its production asset requirements with S3 instead of keeping `csp: null` [1, 2].

Native pickers are invoked by Rust; cancellation installs no grant. Use nonblocking dialog callbacks or a suitable blocking worker, never a blocking picker on the event loop [3]. Native confirmation shows the actual selected path and requested access. A model-provided label cannot replace it.

## Grant and operation contracts

### Grants and reads

The default grant is workspace-specific and read-only. The host generates its ID and sends its actual selected absolute directory to Go for pinning. The main view receives an opaque grant ID plus safe display metadata. S2c creates no workspace-independent grants.

Calls use `grant_id` and a relative path. Reject absolute, drive/UNC, traversal, NUL, URI and Windows device/alternate-stream forms. Normalize with platform-aware rules; do not trust a JavaScript path join. Resolve through the selected grant and existing `os.Root` boundary, preserving nested read-only restrictions, junction/symlink regressions and root-mutation denial.

Start with `list`, `stat` and bounded text `read`. Reuse the existing 256 KiB file and 10,000-entry directory limits; return explicit errors at limits. File content and names remain untrusted text in every view. Discovery, extraction, embeddings and ingestion are not implicit side effects of selecting a folder.

Elevating a root to writable or destructive access requires a separate native review and a new grant revision. Grant policy is an upper bound: every mutation still needs its own exact approval. Destructive access does not enable shell execution.

Revocation immediately closes new host admission and invalidates affected proposals. Wait for already admitted file operations to leave the registry boundary before acknowledging revocation. Cancel registered commands if any are supported. Report incomplete cleanup honestly; revocation cannot undo a side effect that already occurred. A failed revocation acknowledgement leaves that workspace blocked.

### Proposals and approvals

Define a closed Rust operation enum and strict input/result schemas. Separate read operations from mutating proposals; do not accept generic `{ action, inputs }` tunnels or an `approved: true` flag.

An immutable proposal includes:

| Field | Binding |
| --- | --- |
| Operation identity | OS-random operation/proposal ID and native generation |
| Authority | Principal/workspace, policy revision and grant revision |
| File operation | Operation kind, grant ID, source/destination relative paths, exact content bytes and applicable preconditions |
| Command operation | Exact script bytes or structured executable/argv, explicit shell, resolved executable identity, cwd grant/path, effective timeout/output limits, environment policy and isolation-provider revision |
| Review lifetime | Monotonic expiry and the exact native review instance |
| Integrity | Digest over a versioned canonical encoding, with shared Rust/Go fixtures |

Resolve and clamp effective options before review. The approval covers what will run, not the unnormalized input. Use structured argv for direct execution and explicit script transport for a selected shell. Never reinterpret a direct request as a shell or substitute a missing shell.

Store proposals and decisions in the native core, independently of the SaaS approval store. A proposal ID may cross IPC as a reference; it is not a bearer approval. No approval credential or internal authorization envelope crosses into the main webview.

At dispatch, serialize approval consumption with checks of generation, identity, revisions, expiry, payload digest, grant permissions and execution policy. Consume once before starting an attempt. Go receives the typed envelope constructed by Rust, validates its binding, and atomically records the operation ID before any side effect. Its native mode has no alternate authenticated dispatch route that skips this admission.

Use bounded native state: initially 32 pending proposals, one active review and one mutation/command dispatch per workspace. Proposal expiry is five monotonic minutes. Retain dispatched-ID protection for the entire daemon generation; cap it at 4,096 attempts and fail closed at capacity instead of evicting replay protection. Tune these declared limits only with tests and an explicit protocol change where required.

Approval consumption is an at-most-one dispatch attempt within a live generation. It is not exactly-once filesystem or shell execution across crashes. A transport timeout after dispatch produces `OUTCOME_UNKNOWN`; never retry automatically. Allow status queries against the existing operation ID. Go retains ownership and records the observed result even if the initiating connection disappears; a cancellation signal cannot promise reversal of a completed file syscall. Restart/switch ends all old authority and cannot replay work. S4 must persist the operation journal and reconcile interrupted attempts before offering resume/recovery.

### File mutations

Expose bounded file creation, text write and directory creation first. Require a writable grant and native review of the exact targets/content. Use exclusive creation for new files. Overwrites include a reviewed base-content/file-identity precondition and return a conflict when a change is detected; revalidate against the pinned target immediately before mutation.

Do not claim a general atomic compare-and-swap against unrelated external writers: `os.Root` and the grant lock do not serialize other applications editing the same file. Test and document the exact handle/precondition behavior; if an operation cannot meet its reviewed target contract on a platform, keep it unavailable there.

Add delete and same-root move only after explicit destructive grant elevation and a separate exact operation review. Keep recursive deletion, grant-root mutation and cross-root move unsupported. Reuse the Go file boundary rather than adding a second unrestricted filesystem implementation in Rust. Crash-safe replacement, rollback and durable file history are separate S4 contracts.

### Commands

Create a typed native command broker with explicit `direct`, `cmd`, `powershell`, `pwsh` and `sh` choices as supported by the platform. Detect the selected executable before review, bind its resolved identity and revalidate before dispatch. PowerShell 7 remains optional; do not install it or substitute Windows PowerShell. Reject changed cwd/executable identity and stale or revoked authority.

Default to 30 seconds, cap at 120 seconds, retain the existing 64 KiB command and 10 KiB captured-output limits, and show effective values in review. Use a separate bounded execution deadline plus cleanup allowance; the status/shutdown transport deadline stays short. Never expose environment overrides, credentials or a caller-selected executable search path through IPC.

The native policy requires a qualified execution provider that confines permitted files and network access, runs without elevation, controls descendants and enforces current workspace policy. The existing process runner cannot advertise those properties. Folder grants, approval, a Job Object or a Unix process group do not satisfy `requiresSandbox`. With no qualified provider, refuse before launching any process, including apparently harmless commands. Test the policy with a fake provider and test denial against the real daemon; that is not production provider qualification.

Do not reuse the command runner's path-based grant lookup as proof of a pinned execution cwd. Provider admission must validate the current grant and target identity through launch, including replacement/alias races and revocation. If the platform/provider cannot establish the required binding, deny it.

An approved dispatch becomes an owned native task with typed status/cancel access. Disappearing IPC callers do not launch a duplicate or abandon tracking. Cancellation must reach Go's work context and registered process ownership; no replacement starts while cleanup is uncertain. Never log scripts, file bodies, argv, captured output or credentials. Return bounded output only to the current permitted local caller.

## Implementation sequence

Each row is a reviewable implementation slice, split further into small schema, admission, adapter and regression changes. Do not expose an endpoint before its denying and successful paths are covered.

| Slice | Deliverable and main files | Acceptance |
| --- | --- | --- |
| S2c.1 — Bind authority | Native authority types/module in `src-tauri/native-host`; version/mode/session admission in `go-harness/cmd/lattice-harness`; Tauri `build.rs`, command ACLs and tested local-surface CSP | Wrong/missing identity, protocol, revisions and unbound or legacy native-mode actions fail before touching data; lifecycle still works |
| S2c.2 — Select grants and read | Rust-owned picker adapter, grant snapshot/revocation, strict read/list/stat RPC and safe local client adapter | Read-only default; a user-selected root works; arbitrary path/identity injection, nested denial and symlink/junction escape do not; failed updates block admission |
| S2c.3 — Review exact proposals | Native proposal coordinator, bundled review asset, isolated review capability/CSP, immutable display and one-use decision | Main/remote/wrong/stale windows cannot approve; changed payload, concurrent consumption, expiry, navigation and close fail safely |
| S2c.4 — Apply file mutations | Typed create/write/directory endpoints, preconditions and dispatch-ID admission; later destructive variants in the same sequence | Exact approved change attempts once; denied/stale/replayed/conflicting work leaves files unchanged; unknown outcomes never cause an automatic retry |
| S2c.5 — Broker commands | Typed command proposals, execution-provider contract, policy denial, owned status/cancel path | Real daemon launches zero commands without a qualified provider; test adapters verify exact binding, cancellation and no shell fallback |
| S2c.6 — Verify integration | Extend native-host, Go, native-shell and client workflows; minimal review-window smoke tests | Windows/Linux real-daemon and native UI checks establish the contracts below; CodeQL and human review remain merge gates |

S2c.1 is the first implementation PR. Stack it on S2b only while necessary; reconcile S2a/S2b onto main, then rebase/retarget and rerun required checks. Closing a PR into an old feature branch does not satisfy that gate. Parent integration does not require delaying local planning or isolated implementation.

## Verification and completion

Reuse the existing headless core and real-daemon lanes, and preserve S2b's clean restart, parent loss, retired-token and descendant-cleanup regressions. Do not count skipped integration tests as evidence.

Use minimal bundled native workspace/review fixtures for local UI and network checks. The existing connected SaaS dashboard does not become an offline client through these tests. S3 must qualify the actual packaged frontend and its asset/network policy.

| Boundary | Required evidence on Windows and Linux |
| --- | --- |
| Protocol and authority | Incompatible versions; missing/wrong identity; forged workspace/role; stale generation/policy/grant; privileged native action before bind; extra/unknown fields; standalone/native mode separation |
| Filesystem | Native picker cancellation; default read-only; other grant/root/workspace; traversal and Windows path forms; nested restrictions; symlink/junction and target replacement; size/entry bounds; root mutation; write conflict |
| Approval | Payload/shell/cwd/timeout/content changes; expiry with wall-clock changes; duplicate/concurrent decisions; main-window approve attempt; replay; pending/attempt capacity; review-window close/navigation; escaped hostile file text |
| Operations and lifecycle | Revocation vs dispatch; restart/switch while reviewing/running; late completion cannot cross scope; status after timeout; zero automatic mutation retries; unconfirmed cleanup blocks reuse; no old grants/approvals after restart |
| Execution policy | Real-daemon refusal with no provider; no bypass through direct or legacy routes; fake-provider contract checks clearly distinguished from qualified OS containment |
| Local path | No cloud/embedding/telemetry/ingestion endpoint reachable in native local mode; scoped heartbeat/status excludes another workspace's content; webview cannot open remote connections in the enabled local surface |
| Native UI | Launch the minimal bundled review fixture, verify capability/window isolation and actual CSP on each OS; compile/clippy/fmt alone is insufficient to enable privileged UI |

Completion means a user can select and revoke a local folder, read allowed text, approve an exact supported file mutation once, and observe clear denied/expired/conflict/unknown states. Workspace changes and restarts clear authority. Command admission is implemented and demonstrably fails closed until its execution provider is qualified.

This is a local permission broker milestone. Packaged full frontend remains S3; isolated durable profiles, journal/checkpoints and recovery remain S4; clean-machine installers remain S5; signing and download publication remain S6. Company identity/leases, Copilot Studio/Teams adapters, local model inference and OS isolation each retain their own qualification work.

## References

Repository contracts: [native host](native-desktop-host.md), [capability boundary](native-capability-security.md), [implementation epic](../../tasks/native-workspace-authority.md), [desktop roadmap](../../plan.md).

The previously prepared installer architecture plan applies *Designing Data-Intensive Applications* to versioning, durable operation identity and uncertain external outcomes. S2c adopts the boundary and no-replay requirements; it does not claim to implement the book's durable storage requirements before S4.

Primary platform references checked October 28, 2026:

1. [Tauri capabilities](https://v2.tauri.app/security/capabilities/): application commands need explicit command permission configuration; capability sets can merge; window labels and the Linux iframe limitation require careful surface isolation. These platform mechanisms support, but do not supply, Lattice's application authorization.
2. [Tauri CSP](https://v2.tauri.app/security/csp/): CSP must be configured and tailored to bundled assets. The particular main/review split above is a Lattice design choice.
3. [Tauri dialog plugin](https://v2.tauri.app/plugin/dialog/) and [FileDialogBuilder](https://docs.rs/tauri-plugin-dialog/latest/tauri_plugin_dialog/struct.FileDialogBuilder.html): Rust-owned file/folder selection and nonblocking variants; blocking APIs must not run on the main thread.
