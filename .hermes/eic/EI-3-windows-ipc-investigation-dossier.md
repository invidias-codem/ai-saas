# EI-3 Investigation A — Windows Native IPC Investigation Dossier

## Investigation Objective

Resolve architectural questions for Windows authenticated IPC identified in Cycle 4.1 WP-M.3, comparing findings against the current `feat/wp-m3-windows-ipc-security` implementation (commit 6615bf6f) and producing an evidence-backed implementation specification.

## Reference Sources Investigated

| Source | Purpose |
|--------|---------|
| REA `src/process/ProviderProcess.ts` | Process supervision, owned groups, diagnostic budgets |
| REA `src/process/WindowsAuthority.ts` | Windows-specific process authority |
| REA `src/process/ProcessOwnership.ts` | Process identity primitives |
| REA `AGENTS.md` | Fail-closed integration, additive config, evidence provenance |
| Windows named-pipe documentation | `CreateNamedPipeW`, `ConnectNamedPipe`, `CreateFileW`, security descriptors |
| REA `docs/adr/native/typed-operation-facts.md` | Native operation facts |

## Current Implementation (feat/wp-m3-windows-ipc-security @ 6615bf6f)

### Architecture

- `windows-ipc` feature gate (default-off) in `Cargo.toml`
- `windows-sys` dependency with `Win32_Foundation`, `Win32_Security`, `Win32_System_Pipes`, `Win32_System_IO`, `Win32_System_Threading`, `Win32_System_Services`
- `UserSecurityDescriptor` — DACL allowing only current user's logon SID
- `NonceTracker` — single-use nonces with 5-minute TTL, per-client request ID tracking
- `IpcServer::start()` — named-pipe accept loop, `CreateNamedPipeW` with `PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED`
- `IpcServer::accept_and_handle()` — pipe instance creation, client connect, hello/auth handshake
- `IpcServer::handle_named_pipe_client()` — hello response with nonce, authenticate via Credential Broker, command processing
- `IpcServer::validate_auth_token()` — Credential Broker `get_secret()` + nonce validation
- `IpcClient::connect()` — `CreateFileW`, hello handshake, reader task spawn
- `IpcClient::send_command()` / `disconnect()` — framed message read/write via `spawn_blocking`
- `windows_named_pipe` module — `read_named_pipe_message`, `write_named_pipe_message`, `create_pipe_instance`, `connect_named_pipe`
- Message framing: 4-byte big-endian length prefix + JSON body, 1 MB max
- Negative tests: client starts unauthenticated, nonce replay rejected, unknown nonce rejected, duplicate request ID rejected

### Verification Status

| Check | Result |
|-------|--------|
| `cargo check` (macOS, unix) | Clean |
| `cargo clippy --lib -- -D warnings` | Clean |
| `cargo test` (19 tests, 6 new IPC security) | All pass |
| `cargo fmt --all --check` | Clean |
| `cargo check --features windows-ipc` | NOT RUN (no MSVC linker locally) |
| `cargo clippy --features windows-ipc --all-targets -- -D warnings` | NOT RUN |
| `cargo test --features windows-ipc` | NOT RUN |
| Windows CI (feature-enabled) | NOT RUN |

---

## M3.1 — Genuine Authentication

### Required Behavior

1. `validate_token` must perform **actual Credential Broker authentication** — not accept any nonempty token
2. **Fail closed** when credentials are missing, invalid, expired, revoked, or inaccessible
3. **Bind authenticated identity** to authorized runtime profile and OS session
4. **Client completes authentication before `connect()` returns success**
5. **Server cannot admit commands before successful authentication**
6. Review Unix authentication path for equivalent placeholder behavior
7. **Never log credential material**

### Reference Evidence (REA)

- `ProviderProcess` spawns with `signal?: AbortSignal` for cancellation
- `ProcessOwnership` identity primitives: PID + executable path insufficient after exit/reuse
- `AnalysisAccessDeniedError` for EACCES/EPERM — host permissions, not malformed input
- REA AGENTS.md: "Redact transport authentication credentials and explicitly marked sensitive values"
- REA `ProviderSelectionError`: rejections carry `remediation` from the provider that refused

### Current Implementation Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| `validate_auth_token` compares against broker-stored token | Medium | Accepts any token matching the stored secret; no credential expiry/revocation check |
| No credential revocation check | High | Once a token is stored, it's valid forever; no revocation mechanism |
| No session binding to OS logon session | High | Session ID is `session-<token_len>` — not bound to Windows logon session |
| Unix `validate_auth_token` mirrors Windows | Medium | Same Credential Broker pattern; needs same revocation/expiry checks |
| Credential material not logged | OK | Code does not log tokens |

### Remaining Unknowns

- Does `lattice-credential-broker` support credential expiry/revocation queries?
- What is the Credential Broker API for checking if a credential is revoked?
- Windows logon session API: `GetTokenInformation(TokenUser)` vs `LUID` for session binding?
- How does the Unix domain socket path relate to user identity for session binding?

---

## M3.2 — Windows OS Access Controls

### Required Behavior

1. **Correct ACL and security descriptor memory ownership** — lifetime-safe Windows structures
2. **Genuine logon-session isolation** — per-user, per-session pipe names
3. **Validate client identity using trusted OS information** — not self-reported
4. **Explicitly reject remote named-pipe clients** — local only
5. **Prevent unauthorized pipe instance creation and endpoint impersonation**
6. **Safe handle ownership and deterministic teardown**

### Reference Evidence (REA)

- REA `WindowsAuthority.ts` — Windows process authority
- REA `ProcessOwnership.ts` — `OwnedProcessGroup`, `ProcessOwnershipBaseline`, deterministic cleanup
- REA AGENTS.md: "Reuse `src/process/` supervision and identity primitives"
- REA uses Windows Job Objects for memory limits on child processes

### Current Implementation Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| `UserSecurityDescriptor::new()` allocates DACL on stack via `vec!` | Medium | The `sd` Vec is moved into `SECURITY_ATTRIBUTES`; lifetime is tied to the struct instance — OK if struct outlives pipe creation |
| `PIPE_UNLIMITED_INSTANCES` | Medium | Allows unlimited pipe instances; should be bounded |
| `SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION` on client | Low | Impersonation level is Identification — adequate for client |
| No explicit check for remote vs local client | High | `CreateFileW` on `\\.\pipe\...` is local-only by design, but no explicit validation |
| Pipe name uses `profile_id + client_identity` | Medium | Not tied to Windows logon session LUID |
| `OwnedHandle` cleanup on disconnect | OK | `Drop` impl closes handle via `CloseHandle` |

### Remaining Unknowns

- Windows named-pipe local-only enforcement: does `\\.\pipe\` reject remote connections by default?
- `GetTokenInformation(TokenUser)` vs `GetUserNameEx(NameSamCompatible)` for identity validation
- Windows logon session LUID: how to bind pipe to logon session?
- `SECURITY_IMPERSONATION_LEVEL` values: Identification vs Impersonation vs Delegate

---

## M3.3 — Session and Replay Protection

### Required Behavior

1. **Cryptographically secure random challenges** — not UUID v4 (which is random but not CSPRNG-guaranteed in all implementations)
2. **Bind authentication proof to challenge, session, and intended runtime**
3. **Challenge expiration and single-use enforcement** — implemented via `NonceTracker`
4. **Bounded replay tracking** — per-client request ID tracking
5. **Invalidate sessions on credential revocation or supervisor restart**
6. **Clear replay guarantees across reconnections**
7. **Correct client/server pipe-name derivation**

### Reference Evidence (REA)

- REA `NonceTracker` equivalent: none found; REA uses target identity hashing for evidence dedup
- REA `AnalysisResourceConstraintError` with `retryable` flag — retryability semantics
- REA `fixedCeilingConstraint` — fixed ceiling with `retryable: false`
- REA `AnalysisCancelledError` with `CancellationReason` — structured cancellation

### Current Implementation Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| `Uuid::new_v4()` for nonce | Medium | UUID v4 is random but not explicitly CSPRNG; `getrandom` via `uuid::v4` feature should be verified |
| No session invalidation on supervisor restart | High | NonceTracker state is in-memory; restart loses all nonce state |
| No credential revocation integration | High | `validate_auth_token` doesn't check revocation |
| Replay tracking is per-client, not global | Medium | Cross-client replay not detected (different clients can use same request ID — intentional) |
| Nonce TTL cleanup is lazy (on validate) | Low | Expired nonces only cleaned when validated; memory growth possible |

### Remaining Unknowns

- Does `uuid::v4` feature use `getrandom` (CSPRNG) on Windows?
- How should supervisor restart invalidate sessions? (New nonce tracker instance = all sessions invalid)
- What is the replay window for request IDs? (No expiry on request IDs — could grow unbounded)

---

## M3.4 — Transport Reliability

### Required Behavior

1. **Correct Windows API imports and feature declarations**
2. **`OwnedHandle` lifetime and ownership**
3. **Overlapped I/O correctness**
4. **Read/write synchronization**
5. **Blocking operations inside asynchronous tasks**
6. **Connection and authentication timeouts**
7. **Bounded queues and message sizes**
8. **Failed-handshake cleanup**
9. **Supervisor cancellation and shutdown**

### Reference Evidence (REA)

- REA `ProviderProcessSupervisor` — diagnostic byte budget, `maxDiagnosticBytes`, output retention head/tail
- REA `ProviderProcessHandle` — `kill()`, `unref()`, `ref()`, `exitCode`, `signalCode`
- REA `ProcessTerminationPolicy` — `signal`, `graceMs`
- REA `waitForProcessEvent` — `Promise.race` with timeout and abort signal
- REA `DEFAULT_TERMINATION_GRACE_MS = 250`, `DEFAULT_KILL_GRACE_MS = 1000`
- REA `MAX_LATE_OUTPUT_BYTES = 64 * 1024`

### Current Implementation Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| No connection timeout | High | `ConnectNamedPipe` blocks indefinitely; no timeout |
| No authentication timeout | High | Client can take forever to authenticate |
| No read/write timeout | High | Named pipe reads block indefinitely |
| `FILE_FLAG_OVERLAPPED` on pipe but synchronous `ReadFile`/`WriteFile` | High | Overlapped flag set but using blocking API in `spawn_blocking` — should use `ConnectNamedPipe` with `LPOVERLAPPED` or accept blocking in thread |
| No bounded queue for outgoing messages | Medium | `mpsc::unbounded_channel()` — unbounded |
| No max message size on client write | Medium | Checked on write (1 MB) but not enforced at pipe creation consistently |
| Failed handshake cleanup | Low | Pipe disconnected on auth failure but no explicit cleanup of partially initialized state |
| Supervisor cancellation | Low | No `AbortSignal` equivalent for supervisor shutdown of pipe accept loop |

### Remaining Unknowns

- Windows named-pipe `ConnectNamedPipe` with `FILE_FLAG_OVERLAPPED` + `LPOVERLAPPED` — proper async pattern?
- `WaitNamedPipe` vs `ConnectNamedPipe` for client-side timeout?
- How to implement `CancelIoEx` for cancelling blocked pipe operations?

---

## M3.5 — Real Windows Qualification

### Required CI Execution

```
cargo check —manifest-path src-tauri/Cargo.toml -p lattice-agent-runtime —features windows-ipc —all-targets
cargo clippy —manifest-path src-tauri/Cargo.toml -p lattice-agent-runtime —features windows-ipc —all-targets — -D warnings
cargo test —manifest-path src-tauri/Cargo.toml -p lattice-agent-runtime —features windows-ipc
```

### Required Integration Tests

| Test | Purpose |
|------|---------|
| Successful authenticated connection and command execution | Happy path |
| Missing credentials | Fail-closed when no IPC auth token in Credential Broker |
| Invalid credentials | Wrong token rejected |
| Invalid nonempty credential rejection | Nonempty but wrong token rejected |
| Cross-user denial | Different user SID cannot access pipe |
| Cross-session denial | Different logon session cannot access pipe |
| Authentication challenge replay rejection | Nonce replay rejected |
| Duplicate command rejection | Duplicate request ID rejected |
| Credential revocation | Revoked token rejected after revocation |
| Malformed and oversized message rejection | >1 MB or invalid JSON rejected |
| Disconnect during authentication | Clean cleanup on mid-handshake disconnect |
| Supervisor restart and session invalidation | New server instance rejects old sessions |
| Deterministic teardown | Handles closed, channels drained |

### Constraints

- `windows-ipc` remains **default-off**
- **No unauthenticated TCP fallback**
- Windows IPC remains **unsupported** until functional and security qualification passes
- Windows compilation not verifiable locally (no MSVC C linker); CI required