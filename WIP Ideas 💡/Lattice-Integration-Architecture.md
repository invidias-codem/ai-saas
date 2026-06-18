# Lattice OS — Frictionless Company Integration Plan

**Goal:** Let any company integrate Lattice OS (UCOL memory + multi-model routing + Weaver agent) into their stack in **under 30 minutes**, self-serve, without a sales call or custom engineering from our side.

**Vision alignment:** Every integration must feed the knowledge graph (UCOL is the moat). Weaver = customer-facing agent, Relay = internal orchestration, Lattice OS = product surface.

---

## Current State (what already exists)

| Surface | Status | Notes |
|---------|--------|-------|
| `app/api/workspaces/` | ✅ Multi-tenant scaffolding | `[workspaceId]/ingest`, `/search`, `/repos`, `/harness/grants` |
| `app/api/harness/` | ✅ Embeddings + telemetry endpoints | Used by go-harness binary |
| `app/api/settings/keys/` | ✅ API key management | Per-user keys |
| `app/api/integrations/` | ✅ OAuth pattern | github, slack, telegram, trello, zapier |
| `app/api/integrations/zapier/` | ✅ Best template | auth → callback → context/facts/memory |
| Clerk auth | ✅ | `auth()` gate on workspace routes |
| Supabase RLS | ✅ | Per-workspace isolation |

**Gap:** No unified, documented, self-serve **partner integration layer**. Each integration is bespoke. A new company can't onboard without us building a custom connector.

---

## The Frictionless Integration Model

Three tiers of integration depth, each lower-friction than custom work:

### Tier 1 — Drop-in SDK (lowest friction, target: 5 min)
A npm/pip package that wraps the Lattice API. Company installs, adds an API key, calls 3 methods.

```bash
npm install @lattice-os/sdk
```
```typescript
import { Lattice } from '@lattice-os/sdk';

const lattice = new Lattice({ apiKey: process.env.LATTICE_API_KEY });

// 1. Remember (write to knowledge graph)
await lattice.remember({ workspace: 'acme', content: '...', source: 'github-pr-247' });

// 2. Ask (multi-model routed query with memory)
const answer = await lattice.ask({ workspace: 'acme', query: 'What caused the prod incident last March?' });

// 3. Stream (Weaver agent with full context)
for await (const chunk of lattice.stream({ workspace: 'acme', messages })) { ... }
```

### Tier 2 — REST API + Webhooks (target: 15 min)
For non-JS/Python stacks. Documented OpenAPI spec, API-key auth, webhooks for async events.

```
POST /api/v1/workspaces/{id}/memory      → write fact
POST /api/v1/workspaces/{id}/query       → routed query
POST /api/v1/workspaces/{id}/stream      → SSE stream
POST /api/v1/webhooks                     → register callback (e.g. on knowledge-extracted)
```

### Tier 3 — Native Connectors (target: 30 min, OAuth)
Pre-built connectors for the platforms companies already use. One-click OAuth → Lattice ingests + acts.

- **GitHub** (exists) → PR review, codebase memory
- **Slack** (exists) → Weaver in-channel, thread memory
- **Linear/Jira** → sprint context, auto-spec
- **Notion/Confluence** → docs → knowledge graph
- **Datadog/Sentry** → incident context → runbooks

---

## Architecture: The Integration Spine

```
┌─────────────────────────────────────────────────────────────┐
│                     Company's Stack                          │
│   SDK  │  REST  │  OAuth Connector  │  Webhook receiver      │
└───┬───────┬──────────┬────────────────────┬─────────────────┘
    │       │          │                    │
    ▼       ▼          ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              Lattice Gateway (NEW)                           │
│  app/api/v1/*  — versioned, API-key auth, rate-limited       │
│  - Key validation (settings/keys + new partner_keys table)   │
│  - Workspace resolution + RLS scoping                        │
│  - Request signing / HMAC for webhooks                       │
│  - Usage metering (per-key, for billing)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌─────────────┐  ┌──────────────┐
   │  UCOL    │   │  Weaver     │  │  Knowledge   │
   │  Router  │   │  Agent      │  │  Graph       │
   │ (models) │   │ (streaming) │  │ (Supabase)   │
   └──────────┘   └─────────────┘  └──────────────┘
```

**Key principle:** The Gateway is a thin, versioned facade over existing UCOL/Weaver/KG internals. We never expose internal architecture — partners see `remember/ask/stream`, not `cuckoo_embedding` or `ucol_procedural_memory`.

---

## What We Build (priority order)

### Phase 1 — Partner API Key System (foundation)
- [ ] `partner_keys` table: `key_hash`, `workspace_id`, `scopes[]`, `rate_limit`, `created_at`, `last_used`, `revoked`
- [ ] Key generation UI in settings (`lat_live_...` / `lat_test_...` prefixes)
- [ ] Middleware: `lib/api/partnerAuth.ts` — validate key, resolve workspace, check scopes
- [ ] Rate limiting per-key (Upstash — already a dep)
- [ ] Usage metering → `partner_usage` table (for billing later)

### Phase 2 — Versioned `/api/v1/` Gateway
- [ ] `app/api/v1/memory/route.ts` — write fact (wraps KG ingest)
- [ ] `app/api/v1/query/route.ts` — routed query (wraps UCOL)
- [ ] `app/api/v1/stream/route.ts` — SSE stream (wraps Weaver)
- [ ] OpenAPI 3.1 spec at `app/api/v1/openapi.json`
- [ ] Zod validation on all inputs (vision constraint)
- [ ] SSRF/injection guards on any URL/content inputs

### Phase 3 — TypeScript SDK
- [ ] `packages/sdk/` — `@lattice-os/sdk`
- [ ] Typed client, retries, streaming helper
- [ ] Auto-generated from OpenAPI spec
- [ ] Publish to npm (or private registry first)

### Phase 4 — Self-Serve Onboarding
- [ ] `/integrate` landing page: pick stack → get key → copy-paste snippet
- [ ] Interactive API playground (like Stripe docs)
- [ ] Webhook tester
- [ ] "First fact remembered" activation event → KG flywheel starts

### Phase 5 — Native Connectors (extend existing)
- [ ] Generalize OAuth pattern from Zapier connector into `lib/integrations/connectorBase.ts`
- [ ] Linear, Notion, Datadog connectors on top of base
- [ ] Connector marketplace page

---

## Security Invariants (from vision.md — non-negotiable)

- All `/api/v1/*` inputs validated via Zod
- Partner keys hashed at rest (never store plaintext)
- HMAC-signed webhooks (prevent spoofing)
- SSRF validation (DNS resolution) before fetching any partner-supplied URL
- Rate limiting on every public endpoint (Upstash)
- `SUPABASE_SERVICE_ROLE_KEY` stays server-only
- CodeQL must pass
- No raw PII in KG without consent

---

## Metering & Billing Hooks (future-proofing)

Every gateway call logs to `partner_usage`:
- `key_id`, `endpoint`, `tokens_in`, `tokens_out`, `model_used`, `latency_ms`, `timestamp`

This enables: usage-based pricing, per-seat tiers, free-tier limits, and the anti-addiction reward signal (high-utility calls weighted positively in UCOL).

---

## Success Criteria

- [ ] A company can go from signup → first successful `ask()` in < 30 min, no sales call
- [ ] SDK install → first `remember()` writes to their isolated workspace KG
- [ ] Zero exposure of internal UCOL/model-merge architecture in public surface
- [ ] Every integration call feeds the knowledge graph (moat compounds)
- [ ] Rate limiting + metering live before any external partner gets a key

---

## Open Questions for JJ

1. **Pricing model** — usage-based (per token/call), per-seat, or flat platform fee for pilots?
2. **SDK language priority** — TypeScript first (matches our stack + most devtools), then Python?
3. **Free tier limits** — how many calls/facts before paywall? (affects activation flywheel)
4. **Workspace = company or = project?** — affects multi-tenant data model
5. **Self-serve vs. gated** — open signup, or invite-code for design partners first?

---

*Created: 2026-06-16. Aligns with vision.md North Star (UCOL as shared infrastructure).*
*Next: decide Phase 1 scope, then build partner_keys + /api/v1 gateway.*