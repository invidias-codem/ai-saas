# B2B Integration Architecture — Implementation Log

**Date:** 2026-06-16  
**Status:** Phase 4 complete, ready for deployment  
**Commits:** `9ec14514`, `258228e2`, `590ffe22`, `dc204732`

## Executive Summary

We scaffolded a complete B2B integration platform for Lattice OS, enabling companies to integrate memory-native AI context retrieval into their workflows. The architecture pivots to a **Docker appliance model** (license-keyed, feature-gated) rather than a SaaS multi-tenant model.

**Key strategic decisions:**
- **Pricing:** Flat pilot fee ($5k-$10k) → annual license per deployed node
- **SDK:** Python-first (agentic core), TypeScript later (front-end hooks)
- **Free tier:** Feature-gated community container (no SSO, no multi-node, no RBAC)
- **Workspace model:** Workspace = Project (data isolation, no contamination)
- **Onboarding:** Invite-only, high-touch design partners (3-5 initially)

## Architecture Overview

### Deployment Model
```
Client's Kubernetes Cluster
├── Lattice OS Container (Docker)
│   ├── Postgres + pgvector (memories)
│   ├── Redis (optional, for caching)
│   ├── Lattice-1 LLM (self-hosted, vLLM)
│   └── UCOL Embedding Service
├── License Activation (LATOS-ENT-XXXX → unlocks features)
└── Partner API Endpoints (/api/v1/*)
```

### Database Schema (4 new tables)
1. **`partner_keys`** — API tokens with scopes, rate limits, workspace binding
2. **`partner_usage`** — Per-call metering (endpoint, latency, tokens, model)
3. **`enterprise_licenses`** — License keys, feature gates, max_nodes/max_seats
4. **`partner_webhooks`** + **`partner_webhook_log`** — Event delivery with HMAC signing

### API Gateway (6 endpoints)

| Endpoint | Scope | Purpose |
|----------|-------|---------|
| `GET /api/v1/health` | Any | Verify key, check gateway status |
| `POST /api/v1/memory` | `memory:write` | Write episodic memory to UCOL |
| `GET /api/v1/memory` | `memory:read` | List workspace memories |
| `POST /api/v1/query` | `query:read` | Semantic search (vector similarity) |
| `POST /api/v1/stream` | `stream:read` | SSE streaming (agentic loops) |
| `POST/GET/DELETE /api/v1/webhooks` | `webhooks:manage` | Register/list/revoke webhooks |
| `GET /api/v1/docs` | Public | OpenAPI 3.0 spec |

### Security Layers
- **Bearer token auth** — SHA-256 hashed keys (prefix + 64 hex chars), stored never plaintext
- **Workspace isolation** — Each key bound to one workspace; memories scoped via `partner_ws_{id}`
- **Rate limiting** — Upstash Redis sliding window (configurable per-key)
- **Webhook signing** — HMAC-SHA256 with timestamp (X-Lattice-Signature header)
- **Feature gates** — License-key-based (community vs enterprise tier)

## Phase Breakdown

### Phase 1: Key Generation + Auth Middleware
**Commit:** `dc204732`

Built the foundational partner key system:
- `lib/api/partnerKeys.ts` — Key generation (`lat_{env}_{random}`), SHA-256 hashing, scope definitions
- `lib/api/partnerAuth.ts` — Middleware: bearer extraction → DB lookup → revocation/expiry check → scope check → rate limit
- `lib/api/partnerUsage.ts` — Fire-and-forget usage metering
- `app/api/settings/partner-keys/route.ts` — Clerk-authed dashboard endpoint (create/list/revoke)
- `supabase/migrations/20260616000000_partner_keys.sql` — Tables + RLS (service-role only)

**Design decisions:**
- Keys shown once at creation (never retrievable again)
- 5 scopes: `memory:write`, `memory:read`, `query:read`, `stream:read`, `webhooks:manage`
- Default rate limits: 100 req/min (test), 1000 req/min (live)
- `last_used_at` updated fire-and-forget (doesn't block requests)

### Phase 2: Enterprise License System
**Commit:** `590ffe22`

Implemented the Docker appliance licensing model:
- `lib/api/license.ts` — `checkLicense(instanceId)` with 60s cache, `activateLicense()`, `heartbeat()`
- `lib/api/featureGate.ts` — `withFeatureGate('sso:saml', handler)` middleware (returns 402 if not entitled)
- `app/api/onboarding/activate-license/route.ts` — Wizard endpoint (binds LATOS-ENT-XXXX to instance)
- `supabase/migrations/20260616100000_enterprise_licenses.sql` — License table + RLS

**Feature gates:**
- `sso:saml` — SAML/SSO identity provider
- `rbac` — Role-based access control
- `multi_node` — Kubernetes clustering
- `priority_support` — Priority support tier

**Activation flow:**
1. Admin receives license key (e.g., `LATOS-ENT-ACME-2026-XXXX`)
2. Container boots, prompts admin to paste key
3. Admin POSTs to `/api/onboarding/activate-license`
4. License bound to `instance_id`, feature gates unlock

### Phase 3: Gateway Endpoints + Python SDK
**Commit:** `258228e2`

Built the partner-facing API surface:
- `app/api/v1/memory/route.ts` — POST (write) + GET (list), workspace-scoped
- `app/api/v1/query/route.ts` — Semantic search with UCOL vector similarity
- `app/api/v1/stream/route.ts` — SSE streaming for agentic loops
- `sdk/python/` — Full Python SDK (`lattice-sdk` on PyPI)

**SDK usage:**
```python
from lattice import LatticeClient

client = LatticeClient(api_key="lat_live_...")
client.memory.write("User prefers Python", type="preference")
results = client.memory.query("What language does the user prefer?")
for event in client.memory.stream("recent code context"):
    print(event.content, event.similarity)
```

**Fallback strategy:** If `match_memories_768` RPC doesn't exist, endpoints fall back to `listMemories()` (graceful degradation).

### Phase 4: Webhooks + OpenAPI Docs + UI
**Commit:** `9ec14514`

Completed the integration story:
- `lib/api/webhooks.ts` — HMAC-SHA256 signing, 3x retry with exponential backoff, delivery log
- `app/api/v1/webhooks/route.ts` — POST/GET/DELETE (webhooks:manage scope)
- `app/api/v1/docs/route.ts` — OpenAPI 3.0 spec (load into Swagger UI)
- `app/[locale]/(dashboard)/(routes)/settings/partner-keys/page.tsx` — Dashboard UI
- `supabase/migrations/20260616200000_partner_webhooks.sql` — Webhook tables

**Webhook events:**
- `memory.created`, `memory.deleted`
- `key.revoked`, `quota.warning`
- `query.executed`, `stream.started`

**UI features:**
- Create key (select workspace, environment, scopes)
- List keys (prefix shown, full key masked)
- Revoke key (soft delete, immediately invalid)
- Key shown once at creation (green alert box)

## Deployment Checklist

### 1. Supabase Migrations
Run these SQL scripts in Supabase SQL Editor:
- ✅ `20260616000000_partner_keys.sql` (done)
- ✅ `20260616100000_enterprise_licenses.sql` (done)
- ⏳ `20260616200000_partner_webhooks.sql` (pending)

### 2. Environment Variables
Add to `.env.local` and Vercel:
- `LATTICE_INSTANCE_ID` (UUID for this instance)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (rate limiting)

### 3. Vercel Deployment
- Redeploy to pick up new routes
- Verify `/api/v1/health` responds
- Verify `/settings/partner-keys` page loads

### 4. Python SDK Publishing
```bash
cd sdk/python
pip install build
python -m build
twine upload dist/*
```

## Next Steps (Phase 5+)

### Docker Packaging
- `Dockerfile` — Multi-stage build (Node + Python + vLLM)
- `docker-compose.yml` — Lattice + Postgres + Redis + Lattice-1
- Helm chart for Kubernetes
- License activation script (runs on first boot)

### TypeScript SDK
- `sdk/typescript/` — Front-end integration SDK
- React hooks (`useLatticeQuery`, `useLatticeMemory`)
- Drop-in widgets (context retrieval panel)

### Sidebar Navigation
- Add link to `/settings/partner-keys` in sidebar
- Add "Partner Docs" link pointing to `/api/v1/docs`

### Webhook Event Wiring
- Call `deliverWebhook()` in gateway endpoints:
  ```typescript
  // In /api/v1/memory POST
  void deliverWebhook(auth.context.keyId, 'memory.created', { memoryId: id });
  ```

### Monitoring + Alerting
- Grafana dashboards (usage, latency, error rates)
- Alert on webhook delivery failures
- Alert on rate limit spikes

### Partner Onboarding Flow
- `/onboarding/docker-setup` — Step-by-step container deployment
- `/onboarding/license-activation` — Paste LATOS-ENT-XXXX
- `/onboarding/first-query` — Test query with sample data

## Business Case Scenario

See `business-case-scenario.md` for a detailed walkthrough of how a design partner integrates with Lattice OS.

## Files Created/Modified

**Total:** 18 new files, 4 migrations, 1 SDK package

**Core libraries:**
- `lib/api/partnerKeys.ts`, `partnerAuth.ts`, `partnerUsage.ts`, `license.ts`, `featureGate.ts`, `webhooks.ts`

**API routes:**
- `app/api/v1/health/route.ts`
- `app/api/v1/memory/route.ts`
- `app/api/v1/query/route.ts`
- `app/api/v1/stream/route.ts`
- `app/api/v1/webhooks/route.ts`
- `app/api/v1/docs/route.ts`
- `app/api/settings/partner-keys/route.ts`
- `app/api/onboarding/activate-license/route.ts`

**UI:**
- `app/[locale]/(dashboard)/(routes)/settings/partner-keys/page.tsx`

**SDK:**
- `sdk/python/pyproject.toml`, `src/lattice/__init__.py`, `client.py`, `README.md`

**Migrations:**
- `supabase/migrations/20260616000000_partner_keys.sql`
- `supabase/migrations/20260616100000_enterprise_licenses.sql`
- `supabase/migrations/20260616200000_partner_webhooks.sql`
