# Proposed Implementation Slices (Cycle 4.2)

## Slice M3.5a — Windows IPC Windows CI Qualification

**Priority**: P0  
**Branch**: `feat/wp-m3-windows-ipc-security` (commit 6615bf6f)  
**Status**: Implementation complete; Windows CI not yet run

### Required CI Execution

```
cargo check —manifest-path src-tauri/Cargo.toml -p lattice-agent-runtime —features windows-ipc —all-targets
cargo clippy —manifest-path src-tauri/Cargo.toml -p lattice-agent-runtime —features windows-ipc —all-targets — -D warnings
cargo test —manifest-path src-tauri/Cargo.toml -p lattice-agent-runtime —features windows-ipc
```

### Verification Requirements

| Test | Required Result |
|------|-----------------|
| Windows compilation with `windows-ipc` | Pass |
| Windows clippy with `windows-ipc` | Pass (-D warnings) |
| Windows tests with `windows-ipc` | Pass |
| Feature-disabled Windows build | Pass (unchanged behavior) |
| Unix/macOS compatibility | Pass (unchanged behavior) |

### Blocker

No MSVC C linker available locally for `cargo check --target x86_64-pc-windows-msvc`. Windows CI required.

---

## Slice M3.5b — Windows IPC Transport Security Tests

**Priority**: P0 (before feature enablement)  
**Branch**: `feat/wp-m3-windows-ipc-security`  
**Status**: Negative tests implemented (unit level); transport-level tests not yet written

### Required Transport-Level Integration Tests

| Test | Description |
|------|-------------|
| Successful authenticated connection and command execution | Client connects, authenticates via Credential Broker, executes command, receives response |
| Missing credentials | No IPC auth token in Credential Broker → connect() fails with AuthenticationFailed |
| Invalid credentials | Wrong token → connect() fails with AuthenticationFailed |
| Invalid nonempty credential rejection | Nonempty but wrong token → rejected |
| Cross-user denial | Different user SID → pipe access denied (ACL) |
| Cross-session denial | Different logon session → pipe access denied |
| Authentication challenge replay rejection | Nonce replay → validate_challenge returns false |
| Duplicate command rejection | Duplicate request ID → REPLAY_DETECTED error |
| Credential revocation | Revoked token → rejected after revocation |
| Malformed message rejection | Invalid JSON → InvalidMessage error |
| Oversized message rejection | >1 MB → InvalidMessage error |
| Disconnect during authentication | Mid-handshake disconnect → clean cleanup, no partial state |
| Supervisor restart and session invalidation | New server instance → old sessions rejected |
| Deterministic teardown | Handles closed, channels drained, no leaks |

### Implementation Note

These tests require actual Windows named-pipe transport. Cannot run on macOS. Must be executed in Windows CI.

---

## Slice WP-O.1 — Remote MCP Authorization Middleware

**Priority**: P0  
**Branch**: New independent branch from main  
**Status**: Not started

### Required Implementation

```
packages/lattice-mcp-remote/src/auth.ts (new)
  - authenticateRequest(req): Promise<AuthContext>
  - validateCredentials(token): Promise<boolean>
  - checkWorkspaceAccess(user, workspace): Promise<boolean>
  - checkToolPermission(user, tool): Promise<boolean>
  - revokeCredential(credId): Promise<void>
  - isCredentialRevoked(credId): Promise<boolean>

packages/lattice-mcp-remote/src/server.ts (modified)
  - Add auth middleware before transport.handleRequest
  - Bind session to authenticated identity
  - Reject unauthenticated initialize/call/list
  - Redact credentials in audit logs
```

### Authorization Contract

| Aspect | Contract |
|--------|----------|
| Authentication before init | 401 if no valid credentials |
| Auth on every request | Session validated on each MCP message |
| Session identity binding | Session ID bound to user_id, workspace_id, tenant_id |
| Workspace authorization | User must be member of workspace |
| Tool permissions | Per-tool discovery and execution checks |
| Credential expiration | TTL-based; expired rejected |
| Credential revocation | Revoked credentials rejected |
| Origin validation | Origin header checked |
| Session termination auth | Only owner/admin can close |
| Redacted audit | Credentials redacted in logs |

### Constraints

- Preserve local stdio behavior (`lattice-mcp-local` unchanged)
- Do not expose remote MCP publicly
- Deployment absence is not sufficient authorization

---

## Slice WP-P.1 — UCOL Package Exports and RootDir (Slice 1)

**Priority**: P1  
**Branch**: New independent branch from main  
**Status**: Not started

### Required Changes

1. Inspect `tsconfig.json` for `rootDir` setting
2. Fix import paths that violate rootDir
3. Verify package exports are valid
4. Correct dependency declarations

### Verification

- `tsc --noEmit` zero errors for `packages/ucol-node/`
- `pnpm build` (if defined) succeeds

---

## Slice WP-P.2 — UCOL Validators (Slice 2)

**Priority**: P1  
**Branch**: Same as WP-P.1  
**Status**: Not started

### Required Changes

1. Reconcile `isTask` and `isMissionSpec` validators
2. Fail-closed validation logic
3. Clear error messages

### Verification

- Validator unit tests pass
- No invalid input accepted

---

## Slice WP-P.3 — UCOL Handlers and Auth (Slice 3)

**Priority**: P1  
**Branch**: Same as WP-P.1  
**Status**: Not started

### Required Changes

1. Repair handler contracts
2. Implement/restore `authenticateRequest`
3. Fail-closed: unauthenticated rejected

### Verification

- 401 on missing auth
- 403 on insufficient role
- 200 on valid owner auth

---

## Slice WP-P.4 — UCOL Router and Store Types (Slice 4)

**Priority**: P1  
**Branch**: Same as WP-P.1  
**Status**: Not started

### Required Changes

1. Correct router type contracts
2. Resolve store inference failures
3. Preserve routing determinism

### Verification

- `tsc --noEmit` zero errors
- Router tests pass

---

## Slice WP-P.5 — UCOL Test Recovery (Slice 5)

**Priority**: P1  
**Branch**: Same as WP-P.1  
**Status**: Not started

### Required Changes

1. Restore `security.test.ts`
2. Restore `engram.test.ts`
3. Restore `router.test.ts`
4. No disabled/suppressed tests

### Verification

- All 3 test suites pass
- `pnpm test` (ucol-node) all green

---

## Slice WP-L.1 — Requalify #557 and #556

**Priority**: P0 for #557; P1 for #556  
**Branches**: `feat/wp-l1-shell-quote-clean` (#557), `feat/wp-k-esbuild-clean` (#556)  
**Status**: PRs open; CI blocked by #541 type error

### Required Actions

1. Wait for #541 merge to unblock security-tests
2. Re-run CI on #557 and #556 after #541 merge
3. Verify shell-quote regression test executes in CI
4. Verify frozen-lockfile installation
5. Verify security tests and production builds

---

## Slice WP-Q.1 — Next.js and Localization Qualification

**Priority**: P1  
**Branches**: #549 (6ed0599f), #551 (cd121d6e)  
**Status**: PRs open; CI passes except PR Agent

### Required Actions

1. Qualify URL-based request locale authority
2. Qualify cookie preference handling
3. Qualify unsupported locale rejection
4. Qualify HTML lang consistency
5. Qualify metadata and canonical URLs
6. Qualify Clerk and provider ordering
7. Qualify production builds
8. Qualify authentication regression tests

---

## Reproducible Verification Requirements

### For Every Work Package

| Requirement | Method |
|-------------|--------|
| Exact commit SHA | `git rev-parse HEAD` |
| Base SHA | `git merge-base HEAD main` |
| Changed file inventory | `git diff --name-only base..HEAD` |
| Commands executed | Recorded in this document |
| Actual test results | Captured from CI/local runs |
| CI workflow and job IDs | From GitHub Actions API |
| Security guarantees | From tests that demonstrate behavior |
| Known limitations | Documented explicitly |
| Merge disposition | Recommended per PR |

### Verification Commands

```bash
# TypeScript
tsc --noEmit --skipLibCheck

# Rust (Unix)
cargo check
cargo clippy --lib -- -D warnings
cargo test

# Rust (Windows, feature-enabled - CI only)
cargo check --features windows-ipc --all-targets
cargo clippy --features windows-ipc --all-targets -- -D warnings
cargo test --features windows-ipc

# Node.js
pnpm install --frozen-lockfile
pnpm test
pnpm run build

# Security
pnpm test research-plane  (after #541 merge)
```

### Evidence Standards

1. **No fabricated results**: All test outcomes from actual execution
2. **No placeholder credentials**: `[REDACTED]` where needed
3. **No bypassed security**: All gates remain enabled
4. **No force pushes**: Fast-forward merges only
5. **Conductor authorization**: Required before any merge