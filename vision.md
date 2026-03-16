# Tech Genie — Project Vision

## Overview

Tech Genie (gen1e.xyz) is an AI SaaS platform evolving from a multi-model chat interface
into the **Unified Context Orchestration Layer (UCOL)** — a protocol that enables AI models
to collaborate, share knowledge, and compound intelligence across interactions.

Built by JJEM Global Technology, Inc. (Genie, Inc. subsidiary). This is the R&D and
innovation arm of the FluxTrust LLC holding company.

**Current state:** Multi-model chat (Gemini, Claude, DeepSeek) with conversation memory,
knowledge graph, RAG integration, fact extraction, and Code Builder (AI debate loop).

**Destination:** The truth layer and context protocol for AI — a strategic moat that
compounds with use while model quality is commoditized.

---

## Goals

### North Star
Build the **Unified Context Orchestration Layer** — a shared intelligence substrate that
routes queries to the best model, captures structured knowledge from every interaction,
and enables cross-model learning at scale.

### Current Sprint Goals
- Ship Bluesky engagement agent (social → knowledge flywheel)
- Stabilize Code Builder (UCOL debate loop: Gemini plans → Claude codes → Gemini reviews)
- World model Phase 1-3: temporal graph + causal edges + delta engine
- Grow gen1e.xyz user base to PMF signal

### Business Goals
- $47.5M ARR by Year 5 (2030)
- Series A: $10M ($5M TradeFlow + $5M Journey Financial)
- Non-dilutive: NSF SBIR ($275k), Delaware EDGE Grant ($100k), R&D Tax Credits
- UCOL becomes shared AI infrastructure for all JJEM subsidiaries

---

## Non-Goals (Out of Scope)

- Building yet another LLM wrapper or chat UI (that's the starting point, not the destination)
- Competing directly with OpenAI, Anthropic, or Google on model quality
- Becoming a general-purpose dev tool (UCOL is the moat, not a feature factory)
- Auto-merging AI-generated PRs without human review (safety invariant — never bypass)
- Storing raw PII in the knowledge graph without explicit user consent

---

## Key Constraints

### Technical
- Stack: TypeScript, Next.js App Router, Firebase, Clerk auth, Supabase (vector + graph), Gemini AI
- All env vars must be validated via Zod (`lib/env.ts`) — no raw `process.env` access
- Secrets must go through Vercel env vars or Secret Manager — never committed to git
- Before using any key found in the codebase: run `git log --all -S "<key>"` first
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never exposed to client
- Turbopack is active — avoid `process.cwd()` in static analysis paths (encode in base64)

### Security (non-negotiable)
- No command injection: use `execFileSync` not `execSync` with user input
- No stored XSS: sanitize all user-provided content before rendering
- No SSRF: validate external URLs with DNS resolution before fetching
- Rate limiting on all public endpoints
- CodeQL must pass on every PR

### Architecture
- UCOL routing is async and non-blocking — user response latency must never increase
- Human gate on all AI-generated code — agents propose, humans approve
- Knowledge graph writes are append-only with temporal validity (valid_from / valid_until)
- All LLM calls must be traceable (Langfuse integration — planned)

### Business
- GDPR/privacy compliance required (user data export, deletion)
- QSBS eligibility must be preserved (Delaware C-Corp structure)
- UCOL IP stays in Genie, Inc. — not shared across subsidiaries without licensing

---

## Architectural Decisions

### Multi-model via provider interface
All LLMs implement `LLMProvider` interface (`lib/llm/providers/`). Adding a new model
= adding a new file. The conversation engine (`lib/llm/conversationEngine.ts`) is
model-agnostic.

### Supabase as the knowledge substrate
Knowledge graph (nodes + edges + embeddings), vector store, world model state, and
agent interaction logs all live in Supabase. This is the shared memory layer — the
strategic asset that compounds with use.

### UCOL as async side-effect
Every conversation fires UCOL routing as a non-blocking side-effect. Users never
wait for knowledge extraction or agent dispatch. The intelligence layer operates
in the background and surfaces in future interactions.

### World Model on top of LLMs
LLMs hallucinate because they have no object permanence. The world model layer
(Phase 1-6) adds temporal state, causal edges, delta scoring, and simulation —
building ground truth that persists across model generations.

### SudoLang for agent prompts
All UCOL agent system prompts are written in SudoLang (`.sudo.md`) — 20-30% fewer
tokens, typed interfaces, continuous constraints, composable. Stored in
`lib/ucol/agents/prompts/`.

---

## User Experience Principles

- **Speed first**: Streaming responses, non-blocking memory — users feel AI that thinks fast
- **Transparency**: Users can see what the system knows about them (knowledge graph export)
- **Multi-model without friction**: Model switching is seamless, not a settings menu
- **Progressive complexity**: Simple chat UI on the surface, UCOL depth underneath
- **Trust through accuracy**: World model layer means fewer hallucinations over time

---

## Success Criteria

### Technical
- [ ] UCOL routes 100% of classified queries without increasing P95 response latency
- [ ] Knowledge graph grows monotonically — every session adds structured facts
- [ ] World model delta engine catches >80% of verifiable claims (Phase 3)
- [ ] Code Builder produces production-ready components with <2 review rounds average
- [ ] Zero critical/high CodeQL findings on main

### Business
- [ ] 1,000 active users on gen1e.xyz (PMF signal)
- [ ] Bluesky agent driving measurable traffic to gen1e.xyz
- [ ] Series A deck ready with UCOL demo
- [ ] At least one JJEM subsidiary using UCOL infrastructure

### Quality
- [ ] Test coverage >70% on core UCOL paths
- [ ] Error resolution agent handling >50% of Vercel errors autonomously
- [ ] All agent interactions logged and traceable in Langfuse

---

## Agent Notes (for AI agents reading this)

1. **Read this file before starting any task.** If your task conflicts with the goals
   or constraints above, stop and ask before proceeding.

2. **UCOL is the moat.** Features that feed the knowledge graph or improve routing
   are higher priority than features that don't.

3. **Never auto-merge.** All AI-generated changes go through PR review. No exceptions.

4. **Security constraints are invariants.** CodeQL failures block deployment. Fix them.

5. **The knowledge graph is append-only.** Don't write migrations that delete or
   overwrite existing graph nodes/edges without explicit approval.

6. **Check `lib/env.ts` before adding env vars.** All new vars need Zod validation.

7. **JKlaw is the orchestrator.** For research, strategy, or architecture questions,
   the UCOL router will dispatch to JKlaw (gen1e.xyz internal API). Trust that routing.
