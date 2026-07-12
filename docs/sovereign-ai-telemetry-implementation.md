# Sovereign AI Telemetry — Implementation Plan (Lattice OS)

> **For Hermes:** Reference this doc when building the telemetry feature. Execute phase-by-phase using the `plan` skill structure (bite-sized tasks, TDD, frequent commits). Each phase gates on the previous. Do NOT start Phase 1 until Phase 0 is merged and green.
>
> **Compliance gate:** Per `AGENTS.md`, `vision.md` is the source of truth. Any task below that conflicts with `vision.md` must STOP and ask the user. The governance/active-modules schema (Phase 2) is the highest-conflict-risk area — confirm the single source of truth for "active modules" before writing code there.

**Goal:** Implement the *Sovereign AI Telemetry, Multi-Agent Routing & Modular Governance* MVP from the PRD (`Sovereign_AI_Telemetry_PRD.pdf`) as a net-new, non-breaking subsystem of Lattice OS, integrated with the existing Next.js 16 / React 18 / Supabase / Clerk stack and the existing Runtime Bridge layer.

**Architecture:** A client-side **UDIF 2.0 ledger** (per PRD §3) is the sovereign source of truth, persisted in **IndexedDB** (edge/native, no server round-trip — PRD "context sovereignty"). Telemetry is emitted from the existing **Runtime Bridge** layer (`lib/llm/conversationEngine.ts`, `codeEngine.ts`, `lib/ucol/*`) via a thin `TelemetrySink` abstraction. A **Service Worker** batches and flushes signed records to a Supabase `ai_interaction_audit` table for the enterprise tier (PRD §4). The Vite overlay in the PRD becomes a **Next.js client dashboard** reusing existing `WorkspaceTelemetryViewer` patterns.

**Tech Stack:** TypeScript (strict), Next.js 16 app router + React 18, `idb` (IndexedDB wrapper), `@opentelemetry/*` (semantic conventions only, optional), Supabase JS, existing Clerk auth for ownership scoping. Web Crypto API for signing (Phase 3). No new framework (Vite/Tauri deferred to Phase 4 expansion).

**Source PRD:** `/Users/jjem/.hermes/cache/documents/doc_72065a3b477a_Sovereign_AI_Telemetry_PRD.pdf` (4 pages; schema in §3, JSON example in §3.1).

---

## 0. Current-State Grounding (verified)

These are FACTS established by inspecting the repo this session — not assumptions.

| PRD requirement | Status in ai-saas today | Evidence |
|---|---|---|
| UDIF 2.0 schema / `ai_ledger` | **Absent** | grep for `UDIF\|ai_ledger\|trace_context` → 0 hits |
| OpenTelemetry | **Absent** | grep for `@opentelemetry\|otel` → 0 hits |
| IndexedDB ledger | **Absent** (Supabase is the DB) | no `indexedDB` usage in app |
| Multi-model routing capture | **Partially real** | `lib/llm/conversationEngine.ts:394` `providerResolution.execution.modelId`, fallback at `:681` — real routing to capture |
| `actions[]` tool log | **Partial** | agentic tool calls exist in swarm orchestrator; need explicit span hooks |
| Governance (active/disabled modules) | **No single source of truth** | must be defined in Phase 2 |
| Tauri native client | **Not built** | `isTauri` exists only as a harness-heartbeat guard, not a Tauri app |
| Existing telemetry UI | **Different concern** | `WorkspaceTelemetryViewer` = Go-daemon (harness) telemetry; coexists, do not merge |

**Injection seam (from `ai/skills/.../session-architecture-overlay.md`):** the "Runtime Bridge" layer is where telemetry belongs. Concretely:
- `lib/llm/conversationEngine.ts` — model selection at L394/L480/L681, swarm orchestrator at L324.
- `lib/llm/codeEngine.ts` — analogous code-gen path.
- `lib/ucol/sessionHandler.ts`, `lib/ucol/runtimeContextResolver.ts` — session/context setup.

---

## 1. Phase 0 — Schema + Ledger Foundation (NON-BREAKING)

Pure addition. No runtime behavior change. Safety net: lint + tsc must stay green (CI gate from prior work).

### Task 0.1: UDIF 2.0 TypeScript types
**Files:** Create `lib/telemetry/udif.ts`
**Step 1 (test):** `tests/telemetry/udif.test.ts` — assert a sample record matches `UdifInteractionAudit` and that the PRD §3.1 example is assignable.
**Step 2 (impl):** Define interfaces from PRD §3 + §3.1:
```ts
export const UDIF_VERSION = "2.0" as const;
export type UdifRecordType = "ai_interaction_audit";

export interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
}
export interface AgentIdentity { name: string; role: string; }
export interface ModelRouting {
  "gen_ai.request.model": string;
  "gen_ai.response.model": string;
  system_provider: "anthropic" | "openai" | "google" | "local" | string;
}
export interface ToolAction {
  span_type: "execute_tool" | string;
  "tool.name": string;
  duration_ms: number;
  status: "success" | "error" | string;
}
export interface GovernanceState {
  context_role: string;
  active_modules: string[];
  disabled_modules: string[];
  defense_triggers: string[];
}
export interface UdifInteractionAudit {
  udif_version: typeof UDIF_VERSION;
  record_type: UdifRecordType;
  timestamp: string; // ISO8601
  trace_context: TraceContext;
  context_baggage?: Record<string, string>;
  ai_ledger: {
    system_provider: string;
    "gen_ai.request.model": string;
    "gen_ai.response.model": string;
    agent_identity?: AgentIdentity;
    performance?: { "gen_ai.client.operation.duration": number };
    usage?: { prompt_tokens: number; completion_tokens: number };
    actions?: ToolAction[];
    governance?: GovernanceState;
  };
}
```
**Step 3 (verify):** `pnpm jest tests/telemetry/udif.test.ts` → PASS. `npx tsc --noEmit --skipLibCheck` → clean.

### Task 0.2: W3C Trace Context generator
**Files:** Create `lib/telemetry/trace.ts`
**Step:** `generateTraceContext(parentSpanId?: string): TraceContext` using `crypto.randomUUID()` (server) / `self.crypto.randomUUID()` (client). Helper `newSpan(parent?: TraceContext): TraceContext`.
**Test:** deterministic shape; `parent_span_id` propagates.

### Task 0.3: IndexedDB ledger (sovereign store)
**Files:** Create `lib/telemetry/ledger.ts`; add dep `idb@8`.
**Step:** `openLedger()` → `IDBPDatabase`; `appendRecord(rec: UdifInteractionAudit)`; `getRecords(filter?)`. Store name `udif_ledger`, keyPath `trace_context.trace_id` + index on `timestamp`. Guard for SSR (no `indexedDB` on server → no-op).
**Test:** jsdom env; write+read round-trip.

### Task 0.4: TelemetrySink abstraction
**Files:** Create `lib/telemetry/sink.ts`
**Step:** `TelemetrySink` interface `{ emit(rec): void }`. `LocalLedgerSink` (writes IndexedDB). Factory `getSink()` returns LocalLedgerSink in browser, no-op on server. This is the single seam Phase 1 calls.
**Commit:** `feat(telemetry): Phase 0 schema, trace, IndexedDB ledger, sink`

---

## 2. Phase 1 — Instrumentation (emit real spans)

Wire the sink into the Runtime Bridge. **Highest-value, lowest-risk** because the routing seam already exists.

### Task 1.1: Trace lifecycle in conversation engine
**Files:** Modify `lib/llm/conversationEngine.ts` (around L322/L394/L480/L681).
**Step:** At request entry, `const trace = generateTraceContext();` store on the session/context object. At model resolution, capture `gen_ai.request.model` (the *requested* id from config) and `gen_ai.response.model` (the *actual* `actualModelId` at L480/L681) + `system_provider`. On completion, build `UdifInteractionAudit` and `getSink().emit(rec)`.
**Note:** requested vs actual will currently be equal (single-model path) — that's correct; schema future-proofs real routing.

### Task 1.2: Mirror in code engine
**Files:** Modify `lib/llm/codeEngine.ts` analogously.

### Task 1.3: Tool-action spans
**Files:** Modify swarm orchestrator tool-call sites (`lib/llm/conversationEngine.ts` ~L324 region) to push `ToolAction` entries (tool.name, duration_ms, status) into the in-progress record's `actions[]`.

### Task 1.4: Credit-cost attribution join
**Files:** Reference `lib/subscription/packs.ts` (CREDITS_PER_DOLLAR, per-type costs).
**Step:** Map `usage.prompt_tokens + completion_tokens` → credit cost and store in `context_baggage` (`credit_cost`). No change to billing logic — read-only join.
**Test:** unit test token→credit math matches `packs.ts` constants.
**Commit:** `feat(telemetry): Phase 1 instrumentation in Runtime Bridge`

---

## 3. Phase 2 — Governance Schema + Observability UI

### Task 2.1: Governance single-source-of-truth — Runtime Resolver + ephemeral cache + Supabase  ✅ DECIDED
**Files:** New `lib/telemetry/governance.ts`; new migration `supabase/migrations/xxxx_agent_governance_policies.sql`.
**Decision (user, 2026-07-12):** Do NOT rely on hardcoded LLM agentic config or a raw per-turn DB query. Three-tier design:
1. **Core storage (Supabase):** table `agent_governance_policies` mapping `context_role` → authorized module matrix (active/disabled modules, defense triggers). This is where security teams edit access controls / baseline restrictions.
2. **Edge resolver (Runtime Layer):** a `resolveGovernance(contextRole, sessionState, liveVars)` function dynamically fetches the policy, cross-references the user's active session state, and evaluates alongside local state variables. Runs inside the service worker / backend at request-packaging time.
3. **Ephemeral cache:** resolver result is cached short-TTL (in-memory + IndexedDB) so adversarial stress / network drops don't force a slow static lookup on every inference. Cache is invalidated on session/role change.
**Why a runtime resolver (not static lookup):** frontier modules can fail or switch state instantly under adversarial load; the resolver evaluates the *live, operational configuration* at the exact millisecond the inference request is packaged into the W3C trace span, then drops the resolved snapshot into the local IndexedDB ledger under the UDIF `governance` block.
**Step:** `resolveGovernance()` returns `GovernanceState` (PRD §3 schema: `context_role`, `active_modules`, `disabled_modules`, `defense_triggers`). In `telemetry/sink.ts` emit, attach to `ai_ledger.governance`.
**Supabase table shape (initial):**
```sql
create table agent_governance_policies (
  id uuid primary key default gen_random_uuid(),
  context_role text not null unique,
  active_modules text[] not null default '{}',
  disabled_modules text[] not null default '{}',
  defense_triggers text[] not null default '{}',
  updated_at timestamptz not null default now()
);
-- seed baseline (PRD §3.1 example)
insert into agent_governance_policies (context_role, active_modules, disabled_modules, defense_triggers)
values ('public_baseline', '{general_reasoning,syntax_analysis}', '{offensive_cybersecurity}', '{}');
```
RLS: security-team write; authenticated read of own role row only.

### Task 2.2: Telemetry dashboard (Next client)
**Files:** Create `components/telemetry/InteractionAuditViewer.tsx` + route `app/[locale]/(dashboard)/(routes)/telemetry/page.tsx`.
**Step:** Reuse `WorkspaceTelemetryViewer` styling/patterns (that component is Go-daemon telemetry — keep separate). Read from IndexedDB ledger, render trace trees + model-routing table + token/credit cost.

### Task 2.3: Service Worker batch flush
**Files:** Create `public/sw-telemetry.js` + register in root layout.
**Step:** Intercept `/api/telemetry/flush`; batch IndexedDB records; post to Phase 3 endpoint. Keep PRD's "Service Worker polling/OTel interception" intent.
**Commit:** `feat(telemetry): Phase 2 governance + dashboard + SW flush`

---

## 4. Phase 3 — Enterprise Audit Tier (Supabase + signing)

### Task 3.1: Supabase schema + RLS
**Files:** New migration `supabase/migrations/xxxx_ai_interaction_audit.sql`.
**Step:** Table `ai_interaction_audit` (jsonb `record`, `user_id` FK to Clerk, `created_at`). RLS: owner-read; service-role write only.

### Task 3.2: Hash-chain signing
**Files:** `lib/telemetry/sign.ts` using Web Crypto (`crypto.subtle.digest` SHA-256 over canonical record + prev hash).
**Step:** Append `governance_signature` + `prev_record_hash` to each enterprise record → tamper-evident chain (PRD §4 "cryptographic hashing and signing").

### Task 3.3: Flush endpoint
**Files:** `app/api/telemetry/flush/route.ts` — verifies signature, inserts with service role, scoped to authenticated `user_id`.
**Commit:** `feat(telemetry): Phase 3 enterprise audit + signing`

---

## 5. Phase 4 — Native Expansion (deferred)

Tauri desktop client lift (PRD §4). **Out of scope until Phase 0-3 ship.** `isTauri` guards in `hooks/useHarnessHeartbeat.ts` already exist as the seam. Revisit after clientele launch.

---

## 6. Cross-Cutting Concerns

- **Non-breaking:** every phase is additive; no change to chat/code runtime paths beyond emitting a record.
- **CI:** `pnpm lint` (0 errors enforced this session), `npx tsc --noEmit --skipLibCheck`, jest. Keep green.
- **Privacy:** records may contain prompt text? PRD §3.1 omits message content — keep `ai_ledger` free of raw user input by default; log tokens/tool only. Confirm with user if governance needs content.
- **Secrets:** never log API keys; `system_provider` is the only provider signal.

## 7. Risks / Tradeoffs / Open Questions

| Risk | Mitigation |
|---|---|
| PRD assumes Vite/Tauri; repo is Next | Use Next client components; defer Tauri (Phase 4) |
| IndexedDB vs Supabase duplication | Dual-write intentional (sovereign local + enterprise cloud) |
| Governance source undefined | Task 2.1 blocks on user decision |
| Multi-model routing not yet real | Capture requested==actual now; future-proofs |
| PRD example uses fictional `claude-fable-5` | Use real `actualModelId` from `providerResolution` |

**Open questions for user:**
1. ~~What is the source of truth for "active/disabled modules" (Task 2.1)?~~ ✅ **DECIDED:** Runtime Resolver + ephemeral cache + Supabase `agent_governance_policies`.
2. ~~Should audit records include message content, or tokens/tool only?~~ ✅ **DECIDED:** Hybrid, user-controlled (see below).
3. ~~Supabase `ai_interaction_audit` — same project DB or separate?~~ ✅ **DECIDED:** Separate Supabase project / strictly isolated DB instance (see below).

**Q2 — Audit content (DECIDED, 2026-07-12): Hybrid, user-controlled.**
- *Baseline default:* metadata only — tokens, model identifiers, tool execution params, performance metrics. Auto-tracked; zero privacy leakage; fulfills billing.
- *Sovereign overlap (opt-in, two user-controlled flags):*
  1. **Hashed context:** store SHA-256 hash of prompt/completion (not plaintext) → cryptographic verification without storing content.
  2. **Local-only storage:** if full message content tracked for debugging, enforce strict local-only policy in IndexedDB / local desktop; **strip entirely** on sync/export to external analytics.
- Implement as `context_baggage.content_mode: "metadata" | "hashed" | "local_only"`; never send `local_only` payloads off-device.

**Q3 — DB topology (DECIDED, 2026-07-12): Separate Supabase project / isolated instance.**
- High-fidelity multi-agent telemetry = intense write volume (every tool step, reasoning loop, token calc). Keeping on main transactional DB risks resource starvation for auth/payments/core logic.
- Logical boundary: enterprise clients route telemetry DB to their own/local/compliance instances while primary app interaction stays on centralized SaaS tier.
- Implication: `lib/telemetry/` uses a **dedicated Supabase admin client** (separate `SUPABASE_TELEMETRY_URL` / `SUPABASE_TELEMETRY_SERVICE_ROLE`) — NOT the main app client. Flush endpoint (Phase 3) writes there.

## 8. Verification Gates (per phase)

- Phase 0: `pnpm jest tests/telemetry/*` PASS; tsc clean; lint 0 errors.
- Phase 1: a real chat call produces a `UdifInteractionAudit` in IndexedDB with correct `response.model` == `actualModelId`.
- Phase 2: dashboard renders trace; governance populated per Task 2.1 decision.
- Phase 3: signed record in Supabase; tamper test fails verification on mutate.
