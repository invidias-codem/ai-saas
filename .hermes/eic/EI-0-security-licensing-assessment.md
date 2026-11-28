# EI-0 — Security and Licensing Assessment

## Reference System: morluto/rea (v6.10.1)

**License**: MIT  
**Third-party notices**: `THIRD_PARTY_NOTICES.md`  
**Vendored third-party**: pwntools, wabt, evmole, pwndbg (each with own LICENSE)  
**License inventory script**: `npm run licenses:generate` / `licenses:check`

---

## 1. Security Model

### Authentication and Authorization

REA is a **local-only reverse-engineering tool** — it does not implement multi-tenant authentication or authorization. The security model is:

| Aspect | REA Approach | Lattice OS Equivalent |
|--------|-------------|----------------------|
| Authentication | None (single-user local tool) | Clerk + Credential Broker |
| Authorization | None (single-user) | `role === 'owner'` for C1; `workspace:read` insufficient |
| Session identity | `randomUUID()` per MCP connection | Session binding via Credential Broker |
| Transport security | Local process / stdio / HTTP (no TLS by default) | Must be evaluated for remote MCP |
| Credential handling | Redact transport auth credentials; don't persist ambient env | Credential Broker (Windows Credential Manager, etc.) |
| Access control | Host filesystem permissions (EACCES/EPERM) | User-only ACL on named pipes |

### Security Boundaries

REA explicitly states:
- **Local-only**: Analysis runs locally; no cloud execution
- **Bring-your-own**: Ghidra and IDA not installed by installer
- **Read-only default**: IDA analysis is read-only; never save/close attached GUI database
- **Installer constraints**: Shows planned changes, requires approval before writing
- **No silent expansion**: "Before adding complexity for speculative security edge cases, explain failure mode, likelihood, cost"

### Error Security

REA uses a **tagged error algebra** with stable domain tags:
- `AnalysisAccessDeniedError` — filesystem EACCES/EPERM
- `AnalysisInputError` — invalid caller input (secret-safe)
- `ProviderSelectionError` — provider unavailability with rejections
- `AnalysisResourceConstraintError` — memory/cpu/file-size/transport/capacity limits
- Provider-owned errors can define their own branded tags

**Key principle**: Errors preserve `partialObservation`, `capturedOutput`, `diagnostics` through typed projection. Secrets are redacted from diagnostics.

---

## 2. Licensing Assessment

### Primary License

| Aspect | Detail |
|--------|--------|
| License | MIT |
| Copyright | morluto |
| Permissive | Yes — allows use, copy, modify, merge, publish, distribute, sublicense, sell |
| Attribution required | Yes — copyright notice and permission notice must be included |
| Liability | Disclaimed "AS IS" |

### Third-Party Dependencies (from package.json)

**Runtime dependencies** (all MIT/BSD/ISC compatible unless noted):
- `@modelcontextprotocol/server: 2.4.0` — MIT
- `@modelcontextprotocol/client: 2.4.0` — MIT
- `zod: 4.6.7` — MIT
- `pino: 10.4.0` — MIT
- `playwright-core: 1.65.1` — BSD-3-Clause
- `frida: 17.23.2` (optional) — various (LGPL components)
- `canonicalize: 5.1.0` — ISC
- `cborc: 7.0.0` — MIT
- `ajv: 8.20.0` — MIT
- `cross-spawn: 7.0.6` — MIT

**Vendored third-party** (in `third_party/`):
- `pwntools/` — has own README and LICENSE
- `wabt/` — has own README and LICENSE
- `evmole/` — has own README and LICENSE
- `pwndbg/` — has own README and LICENSE.md

### License Obligations for Lattice OS

| Obligation | Requirement | Lattice OS Impact |
|------------|-------------|-------------------|
| MIT attribution | Include copyright + permission notice | Must include in `THIRD_PARTY_NOTICES.md` or equivalent |
| BSD-3-Clause (playwright) | Include copyright notice | Same as MIT |
| Frida (optional) | LGPL components may require source availability | Only if frida is bundled; currently optional |
| Vendored tools | Each has own license | Review each before bundling |

### Compatibility with Lattice OS

- **MIT is compatible** with Lattice OS's proprietary/commercial model
- **No GPL/AGPL dependencies** in runtime deps (frida optional, LGPL — avoid bundling)
- **Third-party notices** should be generated and checked (`licenses:check`)
- **Vendored bridges** (Hopper, Ghidra, IDA) are bring-your-own — no license obligation

---

## 3. Security Gaps in REA Reference (for Lattice OS consideration)

| Gap | Description | Lattice OS Mitigation |
|-----|-------------|----------------------|
| No transport auth | HTTP transport has no built-in auth | WP-O: Implement fail-closed auth middleware |
| No tenant isolation | Single-user local tool | Workspace-scoped sessions; tenant-bound RPC params |
| No credential rotation | No built-in credential expiry/revocation | Credential Broker integration |
| No origin validation | No HTTP origin checking | Origin validation in transport layer |
| No replay protection | Nonce not mentioned in MCP context | Nonce-based challenge-response (WP-M.3) |
| No session termination auth | Session IDs are randomUUID only | Session ownership and termination authorization |

---

## 4. Recommended Lattice OS Security Controls (from REA patterns)

1. **Tagged error algebra**: Adopt REA's `AnalysisError` pattern with stable `_tag` discriminators for all Lattice OS native/runtime errors
2. **Target identity**: Every IPC/MCP operation should carry a tagged target identity (file/url/process/session/unknown)
3. **Process supervision**: Use owned process groups with deterministic cleanup (REA's `ProviderProcess` pattern)
4. **Evidence provenance**: Every investigation artifact records source revision, provider, observed paths, limitations
5. **Fail-closed**: No unauthenticated fallback; reject-all placeholder auth (already Lattice OS policy)
6. **Credential redaction**: Never log credential material; redact transport auth credentials