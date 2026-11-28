# EI-0 — Existing Infrastructure Compatibility Matrix

## Reference System: morluto/rea (v6.10.1) vs Lattice OS

| Domain | REA Reference | Lattice OS Current State | Compatible? | Gap / Action |
|--------|--------------|-------------------------|-------------|--------------|
| **MCP Server** | `@modelcontextprotocol/server: 2.4.0`, `StreamableHTTPServerTransport`, stdio | `@modelcontextprotocol/sdk: ^1.32.0`, `StreamableHTTPServerTransport` (remote), stdio (local) | Partial | SDK major version gap (1.x → 2.x); remote lacks auth middleware |
| **CLI** | `scripts/rea.mjs`, ESM, Node ^22/^24/>=26 | Tauri v2 desktop app, Next.js web | No | Different execution models (desktop vs CLI) |
| **Error model** | Tagged `AnalysisError` with `_tag` discriminator, provider-branded tags | `IpcError` enum with variants (`ConnectionFailed`, `AuthenticationFailed`, `Unauthorized`, `Unsupported`, etc.) | Partial | Lattice OS errors lack provider-branded tag extensibility |
| **Target identity** | `TargetIdentity` discriminated by kind (file/url/process/session/unknown), RFC 8785 key | No equivalent; IPC messages use raw strings/IDs | No | Need to adopt TargetIdentity pattern for IPC sessions |
| **Process supervision** | `ProviderProcess` with owned groups, memory limits, diagnostic budgets, Windows Job Object | `IpcServer`/`IpcClient` with tokio tasks, `OwnedHandle` (Windows planned) | Partial | Need Windows Job Object memory limits, diagnostic byte budgets |
| **Evidence contracts** | `createEvidence` takes `TargetIdentity`; format revision 2; no migration of stored evidence | Research Plane has `VerificationReceipt`, `FrozenSpecInput`, artifact hashes | Partial | Different domains; can adapt evidence provenance pattern |
| **Provider selection** | `ProviderSelectionError` with rejections, origins, remediation actions | No provider selection in IPC; MCP remote has no provider concept | No | Not directly applicable to IPC; relevant for WP-O MCP authorization |
| **Credential handling** | Redact transport auth credentials; don't persist ambient env | `CredentialBroker` with `get_secret()`; Windows Credential Manager planned | Partial | Lattice OS has Credential Broker but IPC doesn't use it yet (WP-M.3 fixes this) |
| **Installer** | `install.sh` — shows planned changes, requires approval, no unrelated installs | No installer; pnpm/npm for JS, cargo for Rust | N/A | Not applicable |
| **Sandbox** | Local-only; bring-your-own Ghidra/IDA; Hopper optional with approval | macOS sandbox; no Windows sandbox yet | Partial | Windows named-pipe needs user-only ACL (implemented in WP-M.3) |
| **Licensing** | MIT + third-party notices inventory | MIT OR Apache-2.0 (lattice-agent-runtime) | Yes | Compatible |
| **Testing** | vitest with project boundaries (source/built/boundary/acceptance); Stryker mutation | Jest for TS; cargo test for Rust | Partial | Different test runners; patterns adaptable |
| **Architecture guards** | `verify:architecture-guards`, `verify:module-boundaries` | `tsc --noEmit --skipLibCheck`, cargo clippy | Partial | No module boundary enforcement in Lattice OS |

---

## Key Compatibility Findings

### 1. MCP SDK Version Gap (WP-D / WP-O)

REA uses `@modelcontextprotocol/server: 2.4.0` and `@modelcontextprotocol/client: 2.4.0`. Lattice OS uses `@modelcontextprotocol/sdk: ^1.32.0` (PR #548). The MCP SDK 1.x → 2.x is a major version migration that requires:
- Review of breaking API changes in `@modelcontextprotocol/server` 2.x
- Verification that `StreamableHTTPServerTransport` API is compatible
- Independent qualification before any migration (WP-D constraint: no major-version migrations until shared native baseline qualified)

### 2. Error Model Adaptation

REA's tagged error algebra is directly applicable to Lattice OS IPC:

```
REA pattern:
  class AnalysisError extends Error { readonly _tag: AnalysisErrorTag }
  Provider-branded tags: string & { [brand]: true }
  Errors carry: diagnostics, capturedOutput, partialObservation, limit, related, cleanup

Lattice OS current:
  enum IpcError { ConnectionFailed, AuthenticationFailed, Unauthorized, ... }
  No provider-branded extensibility
  No capturedOutput/partialObservation on IPC errors
```

**Recommendation**: Adapt REA's error pattern for `IpcError` to support provider-branded tags and structured diagnostics.

### 3. Target Identity for IPC Sessions

REA's `TargetIdentity` is directly applicable to Lattice OS IPC:

```
REA TargetIdentity kinds:
  file: sha256, format, architecture, selection
  url: url (userinfo stripped), origin
  process: pid, start_time, executable_sha256
  session: session_kind, session_id, target
  unknown: reason (derived-from-linked-evidence, not-observed, unsupported-subject, withheld-by-caller)
```

**Recommendation**: Add `TargetIdentity` to `IpcMessage` for session binding and replay tracking (WP-M.3).

### 4. Process Supervision

REA's `ProviderProcess` provides a model for Lattice OS Windows IPC:

```
REA:
  OwnedProviderProcessSpawnOptions (command, args, runId, memoryLimitBytes, cwd, env, signal)
  SpawnedOwnedProviderProcess (process, ownership, cleanup, requestStop)
  ProviderProcessSupervisor (diagnostic byte budget, output retention head/tail, memory limit events)
  Windows Job Object memory limits; POSIX process group cleanup
  ProcessOwnership identity (PID + path insufficient after exit/reuse)
```

**Recommendation**: Adopt REA's process supervision patterns for Windows IPC client lifecycle (WP-M.3 M3.4).

---

## Compatibility Score

| Category | Score | Notes |
|----------|-------|-------|
| MCP protocol | 60% | SDK version gap; remote lacks auth |
| Error handling | 70% | Tagged errors adaptable; no provider-branded tags yet |
| Process supervision | 75% | REA patterns directly applicable to Windows IPC |
| Evidence contracts | 65% | Different domains; provenance pattern adaptable |
| Identity/session | 40% | No target identity in IPC; REA pattern needed |
| Security model | 55% | REA is single-user; Lattice OS is multi-tenant |
| Licensing | 95% | MIT compatible |
| Testing | 60% | Different runners; patterns adaptable |
| **Overall** | **65%** | Significant adaptation needed for auth, identity, SDK version |