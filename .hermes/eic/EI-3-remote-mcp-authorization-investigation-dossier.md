# EI-3 Investigation B — Remote MCP Authorization Investigation Dossier

## Investigation Objective

Investigate Remote MCP authorization boundaries, translate findings into Lattice's own capability and authorization contracts, and produce an implementation specification for fail-closed authorization on `StreamableHTTPServerTransport`.

## Current Lattice OS Remote MCP State

**File**: `packages/lattice-mcp-remote/src/server.ts`

### What Exists

| Component | Detail |
|-----------|--------|
| MCP SDK | `@modelcontextprotocol/sdk: ^1.32.0` (PR #548) |
| Transport | `StreamableHTTPServerTransport` with `sessionIdGenerator: () => randomUUID()` |
| Server | `Server` with `tools` capability only |
| Tools | `preflight.run`, `license.validate_key`, `license.validate_payload`, `license.supported_tiers`, `platform.constants` |
| Transport wiring | `createServer()` + `createTransport()` wired in `handleRequest(req, res, body)` |

### What Is Missing (Security Gaps)

| Gap | Severity | Detail |
|-----|----------|--------|
| **No authentication middleware** | Critical | `StreamableHTTPServerTransport` created without any auth; any HTTP client can connect |
| **No auth on initialization** | Critical | MCP `initialize` request not authenticated |
| **No auth on subsequent requests** | Critical | `CallToolRequestSchema` handler has no auth check |
| **No session identity binding** | High | Session ID is `randomUUID()` only; not bound to authenticated user/workspace |
| **No workspace authorization** | High | No tenant/workspace scope on sessions |
| **No tool-specific permissions** | High | All tools accessible to any authenticated/unauthenticated user |
| **No credential expiration/revocation** | High | No mechanism to expire or revoke MCP credentials |
| **No origin validation** | Medium | No HTTP `Origin` or `Referer` validation |
| **No session termination authorization** | Medium | Any client can close any session |
| **No redacted audit records** | Medium | No security audit trail with credential redaction |
| `skip_auth` in `preflight.run` input | Medium | Suggests auth bypass was considered but not implemented |
| **Local stdio behavior** | OK | Local MCP (`lattice-mcp-local`) preserves stdio behavior (unchanged) |

---

## Reference: REA MCP Architecture

| Aspect | REA Approach |
|--------|-------------|
| MCP SDK | `@modelcontextprotocol/server: 2.4.0`, `@modelcontextprotocol/client: 2.4.0` |
| Transport | `StreamableHTTPServerTransport` (HTTP) and stdio (CLI) |
| Session ID | `randomUUID()` per connection |
| Server lifecycle | Per-request in `handleRequest()` |
| Auth | Local-only tool; no multi-tenant auth |
| Error handling | Tagged `AnalysisError` with stable `_tag` |
| Credential handling | Redact transport auth credentials |
| Installation | `rea setup` shows planned changes, requires approval |

---

## Reference: Official MCP Specification

**Specification**: Model Context Protocol (MCP)  
**Transport**: `StreamableHTTPServerTransport` (HTTP with session IDs)  
**Authentication**: MCP spec does not mandate a specific auth mechanism; transport security is delegated to the implementation

**MCP Lifecycle**:
1. Client connects via HTTP POST with `MCP-Protocol-Version` header
2. Server responds with session ID (`Mcp-Session-Id` header)
3. Client sends `initialize` request with session ID
4. Server responds with capabilities
5. Client sends `initialized` notification
6. Client sends tool calls with session ID
7. Server can close session

**Security considerations** (implementation-level, not spec-mandated):
- Transport-layer auth (Bearer token, API key, OAuth)
- Session binding to authenticated identity
- Origin validation (CORS, `Origin` header)
- Rate limiting per session
- Audit logging with credential redaction

---

## Required Authorization Layer (WP-O)

### Fail-Closed Authentication Before Initialization

```
MCP Request Flow:
  1. HTTP request arrives at StreamableHTTPServerTransport
  2. Auth middleware checks: Authorization header / session cookie / API key
  3. If no valid credentials → 401 Unauthorized (fail-closed)
  4. If valid → extract user identity, bind to session
  5. MCP initialize proceeds only with authenticated session
  6. All subsequent requests require same session + re-validation
```

### Authentication on Every Applicable Transport Request

| Request Type | Auth Required |
|-------------|---------------|
| `initialize` | Yes — before capability response |
| `initialized` | Yes — session binding |
| `tools/list` | Yes — tool discovery permissions |
| `tools/call` | Yes — tool execution permissions |
| `ping` | Yes — session liveness |
| Session close | Yes — session ownership authorization |

### Session Identity Binding

```
Session record:
  session_id: string (from transport)
  user_id: string (from auth)
  workspace_id: string (from auth)
  tenant_id: string (from auth)
  created_at: timestamp
  last_activity: timestamp
  credentials: [credential_ref] (redacted in logs)
  revoked: boolean
```

### Tenant and Workspace Authorization

- Every request carries `tenant_id` and `workspace_id` from authenticated context
- Tool execution checks: user is member of workspace, workspace belongs to tenant
- Cross-tenant access rejected
- Cross-workspace access rejected (unless user has cross-workspace role)

### Tool-Specific Discovery and Execution Permissions

| Tool | Discovery Permission | Execution Permission |
|------|---------------------|---------------------|
| `preflight.run` | `workspace:read` | `workspace:admin` |
| `license.validate_key` | `workspace:read` | `workspace:read` |
| `license.validate_payload` | `workspace:read` | `workspace:read` |
| `license.supported_tiers` | `workspace:read` | `workspace:read` |
| `platform.constants` | `workspace:read` | `workspace:read` |

### Credential Expiration and Revocation

- Credentials have TTL; expired credentials rejected
- Revocation list checked on each request (or short-lived tokens)
- Revoked sessions terminated immediately
- Credential rotation supported

### Origin Validation

- Validate HTTP `Origin` header against allowed origins
- Reject requests with mismatched or missing origin (for browser clients)
- CORS headers configured appropriately

### Session Ownership and Termination Authorization

- Only session owner (or workspace admin) can terminate session
- Session close requires valid session ID + auth context
- Orphaned sessions cleaned up after TTL

### Redacted Security Audit Records

| Field | Treatment |
|-------|-----------|
| `session_id` | Logged (not secret) |
| `user_id` | Logged (not secret) |
| `workspace_id` | Logged (not secret) |
| `tenant_id` | Logged (not secret) |
| `tool_name` | Logged (not secret) |
| `authorization_header` | **REDACTED** |
| `api_key` | **REDACTED** |
| `request_body` | Sanitized (remove secrets) |
| `response_body` | Sanitized (remove secrets) |
| `timestamp` | Logged |
| `source_ip` | Logged |

---

## Local MCP stdio Preservation

| Requirement | Status |
|-------------|--------|
| Local stdio transport unchanged | Must not modify `lattice-mcp-local` |
| Local MCP unavailable to unauthenticated external clients | Already true (stdio is local process) |
| No regression in local MCP behavior | Verified by existing tests |

---

## What Remains Unknown

| Unknown | Impact |
|---------|--------|
| Clerk integration pattern for MCP HTTP endpoints | Determines auth implementation approach |
| Whether Vercel edge functions support middleware | Affects deployment architecture |
| Token format for MCP auth (JWT? API key? session cookie?) | Affects client integration |
| Credential Broker API for MCP credential storage/revocation | Affects credential management |
| Session TTL values | Affects UX and security trade-off |
| Rate limiting requirements | Affects DoS protection |

---

## How Lattice Enforces Its Own Security Invariants

| Invariant | Current State | Required for WP-O |
|-----------|--------------|-------------------|
| C1: `role === 'owner'` for sensitive ops | Implemented in web routes | Not yet in MCP remote |
| Production fail-closed: `VERCEL_ENV === 'production'` | Implemented in `isProduction()` | Must apply to MCP remote in production |
| No API keys/tokens in summaries | Policy | MCP audit logs must redact credentials |
| No production deployment without authorization | Policy | MCP remote not deployed publicly |
| Fail-closed: reject-all placeholder auth | WP-G policy | MCP remote must reject all unauthenticated |
| No unauthenticated TCP fallback | WP-G policy | Not applicable (HTTP only) |