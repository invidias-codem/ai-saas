# Lattice OS — Architecture Reference

## Current Software Model

This diagram reflects the implemented runtime as of the current branch. If it diverges from the shipping code, update this file.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERACTION FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

                              LATTICE OS USER
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │      Frontend Surface        │
                    │  Next.js App Router + RSC    │
                    │  • Landing / docs            │
                    │  • Dashboard workspace UI    │
                    │  • Chat / Code surfaces      │
                    └──────────────┬───────────────┘
                                   │
                        Authenticated API Calls
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API TRANSPORT LAYER                                │
│  app/api/{chat,code,conversations,...}/route.ts                             │
│                                                                              │
│  Each route is now thin:                                                     │
│   • auth + rate-limit                                                       │
│   • request validation                                                      │
│   • runtime context resolution                                              │
│   • delegate to Runtime Bridge                                               │
│                                                                              │
│  Streaming chat returns text/event-stream.                                   │
│  Code execution returns JSON with artifact links.                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED CONTEXT ORCHESTRATION LAYER                   │
│  lib/ucol/                                                                   │
│                                                                              │
│  RuntimeBridge owns shared orchestration now:                               │
│   1. billing + credit enforcement / graceful degradation                     │
│   2. routing intent + execution plan                                         │
│   3. model dispatch                                                          │
│   4. post-generation pipeline:                                               │
│       • memory promotion                                                     │
│       • world-model delta write                                               │
│       • observability / langfuse trace                                       │
│       • downstream webhooks                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴───────────────┐
                    │                              │
                    ▼                              ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│        MODEL / PROVIDER       │   │       TOOL / INTEGRATION      │
│                               │   │                               │
│  Providers implement a common  │   │  MCP stdio + remote HTTP      │
│  provider/runtime contract:    │   │  @lattice-os/mcp-* adapters   │
│  • multi-model via provider    │   │  • local stdio session        │
│    files in lib/llm/           │   │  • remote Vercel routes       │
│  • routing resolved server-    │   │                               │
│    side by intent/exec plan    │   │  Other external integrations  │
│  • Gateway/bandit behavior is  │   │  • GitHub App / webhooks      │
│    async/non-blocking          │   │  • Slack bridge               │
│                               │   │  • Telegram bridge            │
└──────────────────────────────┘   └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         STATE + STORAGE LAYER                                │
└─────────────────────────────────────────────────────────────────────────────┘

                         Supabase Postgres + pgvector
                              Clerk Auth + Metadata
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
  ┌───────────────┬      ┌───────────────────┬      ┌─────────────────────┐
  │ conversations │      │ messages          │      │ memories            │
  │ • id          │      │ • id              │      │ • id                │
  │ • user_id     │      │ • conversation_id │      │ • user_id           │
  │ • title       │      │ • role/content    │      │ • content           │
  │ • is_deleted  │      │ • created_at      │      │ • embedding vector  │
  │ • created_at  │      └───────────────────┘      │   (pgvector 768d)   │
  └───────────────┘                                    │ • type / confidence │
                                                       │ • scope             │
                                                       │ • metadata JSONB    │
                                                       └─────────────────────┘

Additional substrate:
  • Clerk privateMetadata: compute credits, operating profile metadata
  • Vercel Blob / external storage: file attachments, import artifacts
  • Inngest / Vercel Cron: background jobs, scheduled intelligence tasks
```

## Active Surfaces

| Surface | Path / Package | Purpose |
|---|---|---|
| Web app | `app/` | Next.js authenticated workspace + landing |
| Local adapter | `packages/lattice-mcp-local` | Local MCP stdio |
| Remote adapter | `packages/lattice-mcp-remote` | Authenticated HTTP MCP |
| AI skills | `packages/lattice-ai-skills` | SKILL.md/runtime wrapper adapter |
| Core contracts | `packages/lattice-core` | Env, constants, schemas, MCP license/preflight types |
| CLI appliance | `scripts/lattice-cli` | Standalone Docker appliance management |

## Auth and Entitlement

- Identity: Clerk
- Authorization: workspace-scoped access checks
- Credits: Clerk `privateMetadata.computeCredits`
- Rate limit: userId + endpoint keying, Upstash Redis in prod, in-memory in dev
- Billing gating: enforced in RuntimeBridge; degraded modes run before model dispatch

## Deployment Topology

| Environment | Runtime | Notes |
|---|---|---|
| Production | Vercel Serverless | `app/api/**` routes, Edge not required for model calls |
| Background jobs | Vercel Cron + Inngest | Slack indexing, memory maintenance, scheduled briefing jobs |
| Local / appliance | Docker Compose | requires external Supabase project; health endpoint at `/api/preflight` |
| Electron optional | Tauri / Electron layer | separate binary packaging; still uses same Next.js app instance |

## Observability and Safety

- Non-blocking post-generation pipeline: user response latency is never gated on memory/world-model/telemetry work
- Append-only memory semantics: structured writes use validity/metadata instead of destructive updates
- Human gate invariant: generated PRs/code artifacts are proposed, not auto-merged
- Security invariants: CodeQL on PRs, no raw `process.env` outside `lib/env.ts`, no `SUPABASE_SERVICE_ROLE_KEY` to client

---

**This architecture targets the UCOL substrate, not a standalone chat wrapper.**
**If a proposed change fights this topology, stop and update this doc first.**
