# Lattice OS × Slack Modernization — Architecture & Baseline Contracts (S0)

**Branch:** `docs/slack-v2-architecture` | **Base:** `main` @ `04c28cea` | **Date:** 2026-11-04

---

## 1. Current State: Dual Execution Paths

The repository contains **two independent Slack event ingestion routes** that process `app_mention` and `message` events differently. Both are deployed and handle production traffic.

### Path A — `app/api/integrations/slack/events/route.ts` (Genie AI v3.2)
- **Purpose:** Primary Genie assistant — conversational AI with code detection, file/link processing, streaming, thread memory, App Home.
- **LLM:** Direct `GoogleGenerativeAI` (Gemini 2.5 Flash) initialized at module scope.
- **Routing:** Internal `intentRouter` classifies `IMAGE | SLIDES | CALENDAR | CHAT` → specialized handlers or code/CHAT fallback.
- **Memory:** Firestore `slackThreadHistories` (per `teamId-threadTs`).
- **Auth:** Multi-tenant via `getSlackConfig(teamId)` → Supabase RPC `get_slack_integration` (decrypts bot token).
- **Signature Verification:** `verifySlackSignature()` using `SLACK_SIGNING_SECRET` (enforced in prod, optional in dev).
- **Streaming:** Custom `createStreamer` → `chat.postMessage` + `chat.update` loop.
- **Observability:** Console logs only; no structured telemetry.

### Path B — `app/api/slack/events/route.ts` (Harness + UCOL)
- **Purpose:** Agentic workspace operations via Harness (GoIOHarness/LocalIOHarness) + `conversationEngine`.
- **LLM:** UCOL `providerResolver` → NVIDIA NIM (Kimi K3 / DeepSeek V4 Pro) or Gemini fallback via `fallbackRouter`.
- **Routing:** `AgentRouter.classify()` → two-axis (taskType + contextConfidence) → `context-router` | `deepseek` | `jklaw` | tool nodes.
- **Memory:** UCOL prepared-context bundle (conversation + user + graph + research), episodic memory via Harness.
- **Auth:** Same `getSlackConfig(teamId)` but requires `workspacePath` for Harness; rejects if missing.
- **Signature Verification:** Duplicate `verifySlackSignature()` implementation.
- **Streaming:** `SlackTraceFormatter` blocks → throttled `chat.update` (1.5s cadence) + `OpikTracePayload` export.
- **Observability:** Opik trace export, `recordThreadTerminated`, harness telemetry.

---

## 2. Shared Infrastructure (Reusable)

| Component | Location | Status |
|-----------|----------|--------|
| Multi-tenant token resolution | `lib/slack/tokenManager.ts` | ✅ Used by both paths |
| Thread history (Firestore) | `lib/slack/threadManager.ts` | ✅ Path A only |
| Channel indexer (auto-embed) | `lib/slack/channelIndexer.ts` | ✅ Cron-driven, independent |
| Intent classification | `lib/slack/intentRouter.ts` | ✅ Path A only |
| Code detection/prompts | `lib/slack/codeAssistant.ts` | ✅ Path A only |
| Assistant helpers (streaming, status) | `lib/slack/assistantHelpers.ts` | ✅ Path A only |
| UCOL provider resolution | `lib/ucol/routing/providerResolver.ts` | ✅ Path B + conversationEngine |
| UCOL agent routing | `lib/ucol/agentRouter.ts` | ✅ Path B + conversationEngine |
| Fallback router (circuit breaker) | `lib/llm/routing/fallbackRouter.ts` | ✅ conversationEngine |
| Harness factory | `lib/harness/IOHarness.ts` | ✅ Path B only |
| Conversation engine | `lib/llm/conversationEngine.ts` | ✅ Path B + web API |

---

## 3. Security Baseline (Current)

| Control | Path A | Path B | Gap |
|---------|--------|--------|-----|
| Slack signature verification | ✅ (dev optional) | ✅ (dev optional) | Dev bypass in both |
| Request timestamp check (5min) | ✅ | ✅ | — |
| Multi-tenant token isolation | ✅ (Supabase RPC) | ✅ (Supabase RPC) | — |
| SSRF protection on `response_url` | ✅ (`validateWebhookUrl`) | ❌ | Path B missing |
| Bot self-message filtering | ✅ | ✅ | — |
| Retry storm protection (`x-slack-retry-num`) | ❌ | ✅ | Path A missing |
| Idempotency keys | ❌ | ❌ | Both missing |
| Encrypted token storage | ✅ (RPC decrypt) | ✅ (RPC decrypt) | — |
| Workspace path validation | ❌ | ✅ (rejects if missing) | Path A allows missing |

---

## 4. S0 Contracts — Unified Gateway Requirements

The unified gateway (S2) **must** satisfy these contracts. S1 hardening applies to both paths independently first.

### 4.1 Ingestion Contract
```typescript
interface SlackEventIngestion {
  // Single entry point for all Slack event_callback types
  POST(req: Request): Promise<NextResponse>

  // Mandatory guards (execute in order):
  1. Verify Slack signature (timing-safe HMAC, 5min window); 401 on failure — always first, before any retry or callback processing
  2. Parse JSON body; 400 on failure
  3. Handle url_verification challenge immediately (200 + challenge)
  4. Extract team_id; 400 if missing
  5. Resolve SlackConfig via getSlackConfig(teamId); 404 if not installed
  6. Log x-slack-retry-num if present; do NOT short-circuit (S1) — durable dedup is S2
  7. Filter bot messages (event.user === botUserId || event.bot_id)
  8. Dispatch to handler registry by event.type
  9. Return 200 OK immediately; processing via waitUntil()
}
```

### 4.2 Handler Registry Contract
```typescript
type SlackEventHandler = (config: SlackConfig, event: SlackEvent) => Promise<void>

interface HandlerRegistry {
  register(type: string, handler: SlackEventHandler): void
  get(type: string): SlackEventHandler | undefined
  // Built-in types (must be supported):
  // 'app_mention', 'message', 'assistant_thread_started',
  // 'assistant_thread_context_changed', 'workflow_step_execute',
  // 'file_shared', 'app_home_opened', 'shortcut', 'block_actions', 'view_submission'
}
```

### 4.3 Authorization Contract (S1)
```typescript
interface SlackAuthorization {
  // Per-request authorization context
  resolveAuthContext(config: SlackConfig, event: SlackEvent): Promise<AuthContext>

  interface AuthContext {
    teamId: string
    botToken: string
    botUserId: string
    userId: string           // Slack user ID
    internalUserId?: string  // Linked Clerk/Supabase user ID
    workspaceId?: string     // For Harness/UCOL
    workspacePath?: string   // For GoIOHarness
    permissions: string[]    // Derived from org membership (admin, developer, etc.)
    isAdmin: boolean         // sensitive_tools:use permission
    channelId: string
    threadTs: string
    channelType: 'im' | 'mpim' | 'channel'
  }
}
```

### 4.4 Routing Contract (S2)
```typescript
interface SlackRoutingDecision {
  // Unified routing for both conversational and agentic paths
  route: 'conversational' | 'agentic' | 'specialized'
  // Conversational: Genie (Gemini) — chat, code help, file analysis
  // Agentic: UCOL AgentRouter → Harness — workspace ops, code gen, research
  // Specialized: IMAGE/SLIDES/CALENDAR handlers (existing intentRouter)

  // Selection criteria (deterministic, no LLM call in hot path):
  // - requireOrchestration / preferSpeed flags from slash command or context
  // - explicit /genie engineer, /genie code subcommands → agentic
  // - app_mention with code intent → agentic if workspaceId present
  // - DM / general chat → conversational
  // - IMAGE/SLIDES/CALENDAR classification → specialized
}
```

### 4.5 Streaming Contract
```typescript
interface SlackStreaming {
  // Single streaming abstraction for both paths
  createStreamer(params: {
    botToken: string
    channel: string
    threadTs: string
    onChunk?: (text: string) => void
  }): Promise<Streamer>

  interface Streamer {
    start(): Promise<boolean>           // Posts initial "thinking" message
    append(chunk: string): Promise<void> // chat.update with accumulated text
    stop(): Promise<void>               // Finalizes, adds feedback blocks
    getBuffer(): string                 // Full response for history
  }
}
```

### 4.6 Telemetry Contract
```typescript
interface SlackTelemetry {
  // Structured, redacted events (no PII in message text)
  emit(event: {
    type: 'slack_event_received' | 'slack_event_dispatched' | 'slack_stream_started' |
          'slack_stream_completed' | 'slack_stream_failed' | 'slack_auth_failed' |
          'slack_signature_invalid' | 'slack_retry_ignored'
    teamId: string
    eventType: string
    channelId: string
    threadTs: string
    userId: string
    routingDecision?: SlackRoutingDecision
    durationMs?: number
    error?: string
  }): void
}
```

---

## 5. Extension Points for S3–S7 (Preserved)

| Slice | Extension Point | Location |
|-------|----------------|----------|
| S3: NIM/Gemini swap | `providerResolver` input `mode` + `personaSession.minimumModelTier` | `lib/ucol/routing/providerResolver.ts` |
| S4: Modern Slack agent sessions | `assistant_thread_started` handler → session registry | `app/api/integrations/slack/events/route.ts` |
| S5: Weaver + Relay | `AgentRouter` taskType `orchestration` → `jklaw` webhook | `lib/ucol/agentRouter.ts` |
| S6: Channel moderation / RAG | `channelIndexer` + `memory_bank` query in routing context | `lib/slack/channelIndexer.ts` |
| S7: Production qualification | `SlackTelemetry` events + budget kill switch integration | `lib/budget/redisKillSwitch.ts` |

---

## 6. Baseline Test Matrix (Must Pass Pre-S1)

| Test | Path A | Path B | Command |
|------|--------|--------|---------|
| TypeScript strict | ✅ | ✅ | `tsc --noEmit --skipLibCheck` |
| Unit: signature verification | ✅ | ❌ | `pnpm test __tests__/slack/` |
| Unit: tokenManager | ✅ | ✅ | `pnpm test __tests__/slack/tokenManager.test.ts` |
| Unit: intentRouter | ✅ | N/A | `pnpm test __tests__/slack/intentRouter.stress.test.ts` |
| Unit: channelIndexer | ✅ | ✅ | `pnpm test __tests__/slack/` |
| Integration: events route | ⚠️ | ⚠️ | Manual (requires Slack ngrok) |
| Build (Next.js) | ✅ | ✅ | `pnpm build` |

**Known pre-existing failures:** None blocking. Path B requires `workspacePath` in SlackConfig or it rejects — this is intentional tenant isolation.

---

## 7. Migration Strategy (S1 → S2)

1. **S1 (Security Hardening)** — Apply to both paths independently:
   - Enforce signature verification in all environments (remove dev bypass)
   - Add `x-slack-retry-num` guard to Path A
   - Add SSRF protection to Path B
   - Add idempotency keys (Slack `event_id` + `event_time`) to both
   - Structured telemetry (replace console.log)

2. **S2 (Unified Gateway)** — Create new route `app/api/slack/gateway/route.ts`:
   - Implements ingestion contract (4.1)
   - Uses handler registry (4.2) with Path A handlers migrated in
   - Adds routing decision (4.4) before handler dispatch
   - Single streaming abstraction (4.5)
   - Deprecate Path A route (keep for rollback, 30-day TTL)
   - Path B route (`app/api/slack/events/route.ts`) remains for Harness-specific traffic

3. **S3+** — Extend routing decision with UCOL mode selection, persona sessions, etc.

---

## 8. Acceptance Criteria for S0

- [x] Architecture document created at `docs/slack-v2-architecture/SLACK_V2_ARCHITECTURE.md`
- [x] Both execution paths documented with file references
- [x] Shared infrastructure cataloged
- [x] Security baseline assessed
- [x] Contracts defined for ingestion, auth, routing, streaming, telemetry
- [x] Extension points for S3–S7 identified and preserved
- [x] Baseline test matrix recorded
- [x] Migration strategy documented

**Next:** S1 branch `fix/slack-v2-security` — implement security hardening on both paths per Section 4.3 gaps.