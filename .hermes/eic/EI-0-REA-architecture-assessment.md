# EI-0 — REA Architecture Assessment

## Reference System: morluto/rea (v6.10.1)

**Repository**: https://github.com/morluto/rea  
**License**: MIT  
**Package**: `rea-agents` (npm)  
**MCP name**: `io.github.morluto/rea`  
**MCP invocation**: `npx -y rea-agents@6.10.1 mcp`  
**CLI entry**: `scripts/rea.mjs`

---

## 1. MCP Server Architecture

| Component | Detail |
|-----------|--------|
| SDK | `@modelcontextprotocol/server: 2.4.0`, `@modelcontextprotocol/client: 2.4.0` |
| Transport | `StreamableHTTPServerTransport` (HTTP), stdio (CLI) |
| Session ID | `randomUUID()` per connection |
| Server lifecycle | `createServer()` builds MCP `Server` instance; `createTransport()` builds transport; `handleRequest()` wires them |
| Tool registration | `mcp.setRequestHandler(ListToolsRequestSchema, ...)` and `CallToolRequestSchema` |
| Error handling | Tagged error algebra via `AnalysisError` base class with stable `_tag` discriminators |

**Key pattern**: Server and transport are created per-request in `handleRequest()`, not long-lived. Transport and server cross-reference each other's `onclose`.

---

## 2. CLI Execution Model

| Component | Detail |
|-----------|--------|
| Entry | `scripts/rea.mjs` (bin: `rea`, `rea-agents`) |
| Subcommands | `mcp` (starts MCP server), plus analysis subcommands |
| Module type | ESM (`"type": "module"`) |
| Node engine | `^22.23.4 || ^24.22.1 || >=26.12.1` |
| Package manager | `npm@11.21.3` |
| Build | `npm run build` → turbo → `artifacts:skills`; `npm run build:cached` |

---

## 3. Analysis Provider Abstraction

**Directory flow (dependencies inward)**:

```
domain/          → semantics and contracts (stable tags, errors, identities)
application/     → shared application workflows
adapters/        → provider-specific adapters
composition/     → wiring (javascriptRecovery, webRuntime, electronScenario, etc.)
cli/mcp adapters → outermost layer
```

**Provider selection**: `ProviderSelectionError` with reasons: `unknown_provider`, `provider_unavailable`, `target_unsupported`, `ambiguous`, `invalid_options`. Rejections carry `providerId`, `origin` (availability vs target), `code`, `reason`, `remediation`, `diagnostics`.

**Provider process lifecycle**: `ProviderProcess` supervises child processes with:
- `OwnedProviderProcessSpawnOptions` (command, args, runId, memoryLimitBytes, cwd, env, signal)
- `SpawnedOwnedProviderProcess` (process, ownership, cleanup, requestStop)
- `ProviderProcessSupervisor` with diagnostic byte budget, output retention (head/tail), memory limit events
- Windows Job Object memory limits; POSIX process group cleanup
- `ProcessOwnership` identity primitives (PID + executable path insufficient after exit/reuse)

---

## 4. Evidence Contracts and Identity

**Target Identity** (`src/domain/targetIdentity.ts`, ADR accepted 2026-11-15):

Discriminated by `kind`:
- `file`: `sha256`, `format`, `architecture` (nullable), `selection` (entry point, ESP offsets, universal-binary slice)
- `url`: URL (userinfo stripped), `origin` — userinfo is transport credential, never in identity
- `process`: `pid`, `start_time`, `executable_sha256` (nullable)
- `session`: `session_kind` (rizin, gdb), session `id`, bound `target`
- `unknown`: `reason` from closed set (`derived-from-linked-evidence`, `not-observed`, `unsupported-subject`, `withheld-by-caller`)

**Key properties**:
- `targetIdentityKey(identity)` = RFC 8785 canonical digest — single comparison key
- Every `createEvidence` call takes a `TargetIdentity` (not undefined)
- `unknown` with explicit reason replaces absent-field limitations
- Evidence format revision 2 breaks all Evidence IDs (content commitment)

**Error tags** (stable, domain-defined):
`AnalysisProtocolError`, `AnalysisInputError`, `AnalysisAccessDeniedError`, `AnalysisArtifactChangedError`, `AnalysisOutputError`, `AnalysisCapabilityUnavailableError`, `AnalysisTargetFailureError`, `AnalysisCancelledError`, `AnalysisTimeoutError`, `AnalysisResourceConstraintError`, `ProviderSelectionError`, `ProviderAdapterError`, `BrowserObservationError`, `ArtifactOperationError`, `ProcessCaptureError`, `EvidenceIntegrityError`, `EvidenceFileError`, `UnknownRegistryError`, `ConfigurationError`, `NoBinaryOpenError`, `BinaryTargetError`

**Resource kinds**: `memory`, `cpu`, `file-size`, `transport`, `capacity`

---

## 5. Evidence Retention and Export

| Mechanism | Detail |
|-----------|--------|
| `evidence:check:built` | `generate-completion-ledger.mjs --check` |
| `docs:prepare` | Generates `product-catalog.json`, `managed-evidence`, `error-schema` |
| Managed evidence | `artifacts:managed-evidence` |
| Ignored outputs | `docs/public/product-catalog.json`, `docs/verification/managed-conformance-*.json`, `skills/` |
| Source of truth | Edit source contracts + `.agents/skills/reverse-engineer-anything/`, then regenerate |

---

## 6. Native and JavaScript Analysis Capabilities

| Domain | Capabilities |
|--------|-------------|
| Native binaries | ELF, Mach-O, PE, raw binary; Hopper/Ghidra/IDA/Cutter bridges; Frida (optional); Windows native `.node` addon |
| JavaScript | V8 code cache, source maps, web bundle analysis, Playwright traces, Electron active hook |
| Android | APK signature, jadx bridge, adb |
| Firmware | ESP NVS, UEFI, vector tables |
| Web | Network captures, module traces, event listeners, execution observation |

**Native bridges**: Hopper (Python), Ghidra (Java), IDA (Java), Cutter (Python), Android jadx (Java), mitmproxy (Python), pwntools/pwndbg (Python), Windows native UI (Swift)

---

## 7. Behavioral Comparison Workflows

| Component | File |
|-----------|------|
| Artifact comparison | `src/domain/artifactComparison.ts` |
| Reconstruction coverage | `src/domain/reconstructionCoverage.ts` |
| Reconstruction verification | `src/domain/reconstructionVerification.ts` |
| Artifact graph | `src/domain/artifactGraph.ts` |

---

## 8. Agent Investigation Instructions

| Location | Purpose |
|----------|---------|
| `.agents/skills/reverse-engineer-anything/` | Core REA skill (43KB SKILL.md + references) |
| `.agents/skills/rea-analysis-optimization/` | Analysis optimization skill |
| `.agents/skills/rea-changelog-update/` | Changelog skill |
| `.agents/skills/rea-ci-tests-audit/` | CI audit skill |
| `.agents/skills/rea-tool-design/` | Tool design skill |
| `AGENTS.md` | Repository guidelines (fail-closed integration, additive config, evidence provenance) |
| `CONTRIBUTING.md` | Contribution scope, fail-closed integration rule |

---

## 9. Sandbox Requirements

- **Local-only**: Analysis runs locally; no cloud execution by default
- **Bring-your-own**: Ghidra and IDA are not installed by installer; Hopper optional with approval
- **Installer constraints**: Must show planned changes, require approval before writing; must not install unrelated software (Homebrew, Node.js, npm, Java, Ghidra)
- **Frida**: Optional dependency (`allowScripts: { frida: true }`)
- **Read-only default**: IDA analysis is read-only; never save/close attached GUI database
- **Ghidra**: Ephemeral databases, no executable byte modification, no GUI control

---

## 10. Filesystem and Network Access

- **Filesystem**: Absolute paths, file URLs, HTTP paths have different semantics; normalize once at owning boundary
- **Network**: Playwright Core for browser observation; mitmproxy for network capture; no unrestricted outbound
- **Credentials**: Redact transport authentication credentials; do not infer secrecy from names/patterns; do not persist ambient environment

---

## 11. Installation and Update Behavior

| Aspect | Detail |
|--------|--------|
| Installer | `install.sh` (8350 bytes) |
| Setup command | `rea setup` — shows planned changes, requires approval |
| Optional install | Hopper with explicit approval |
| Bring-your-own | Ghidra, IDA, Java |
| Config changes | Additive and idempotent, with backups |
| Release | `release-please` conventional commits |

---

## 12. Dependency Integrity

| Aspect | Detail |
|--------|--------|
| Lockfile | `package-lock.json`, `npm-shrinkwrap.json` |
| Package manager | `npm@11.21.3` pinned |
| Dependency check | `npm run deps:check` (`check-dependency-install.mjs`) |
| Production reachability | `knip:production` |
| Duplicate detection | `jscpd` |
| Mutation testing | Stryker on reverse-tools |

---

## 13. Licensing

| Aspect | Detail |
|--------|--------|
| Primary | MIT |
| Third-party notices | `THIRD_PARTY_NOTICES.md` |
| License inventory | `npm run licenses:generate` / `licenses:check` |
| Vendored third-party | `third_party/pwntools/`, `third_party/wabt/`, `third_party/evmole/`, `third_party/pwndbg/` (each with own LICENSE) |
| License files shipped | `licenses/` directory |

---

## Key Architectural Patterns for Lattice OS Adoption

1. **Tagged error algebra**: Every error has a stable `_tag`; domain defines the tag set; providers can define their own branded tags
2. **Target identity**: One tagged identity per observation; canonical key for comparison; `unknown` with reason instead of absent field
3. **Process supervision**: Owned process groups with deterministic cleanup, memory limits, diagnostic byte budgets
4. **Evidence first**: Every record carries subject identity; format revision with breaking changes; no migration of stored evidence
5. **Provider selection**: Typed failures with rejections, origins (availability vs target), remediation actions
6. **Fail-closed integration**: Maintainer scope decision required before new provider or target execution/injection/mutation
7. **Architecture guards**: `verify:architecture-guards`, `verify:module-boundaries` enforce dependency flow inward

---

## What Remains Unknown

- REA's internal provider registration mechanism (how providers are discovered/registered)
- Exact MCP tool schema format (Zod vs JSON Schema)
- How REA handles cross-tenant isolation (single-user local tool)
- REA's approach to credential storage/retrieval (Keychain, Credential Manager, or env vars)
- Whether REA's `StreamableHTTPServerTransport` usage includes any auth middleware in newer versions

---

## How Lattice Enforces Its Own Security Invariants

- C1: `role === 'owner'` required; `workspace:read` insufficient
- Production fail-closed: `isProduction()` checks `VERCEL_ENV === 'production'` only
- No API keys/tokens in summaries; `[REDACTED]` placeholder
- WP-G: No unauthenticated TCP fallback; reject-all placeholder auth; fail-closed Windows transport
- WP-O: Remote MCP must implement fail-closed auth before session init
- No production deployments, database migrations, or cloud provisioning without authorization