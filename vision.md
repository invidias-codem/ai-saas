# Lattice OS — Project Vision

## Overview

Lattice OS is a memory-native AI platform evolving from a multi-model chat interface
into the **Unified Context Orchestration Layer (UCOL)** — a protocol that enables AI models
to collaborate, share knowledge, and compound intelligence across interactions.

Built by JJEM Global Technology, Inc. This is the R&D and innovation arm of the
FluxTrust LLC holding company.

**Current state:** Multi-model chat (Gemini, Claude, DeepSeek) with conversation memory,
knowledge graph, RAG integration, fact extraction, and Code Builder (AI debate loop).
Sandbox quarantine promotion gate with operator approval flow is active in production.

**Destination:** The operating layer for AI work — a shared intelligence substrate that
preserves context, routes models, and compounds with use while model quality is commoditized.
Primary consumer product: **Chameleon Consultant** — Weaver packaged as a rentable domain expert.

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
- Grow the Lattice OS user base to PMF signal
- **Develop the Data Refinery Engine**: Systematize the scraping of fragmented, high-value sites to convert unstructured web information into clean, actionable fuel for our agents [00:10:34].
- **Ship the Chameleon Consultant**: package Weaver as a rentable domain expert, starting with the first two verticals [00:23:46].
- **Harden the sandbox promotion gate**: offline test vectors, dependency inversion, production non-interactive approval flow, and stream serialization for operator review.

### Business Goals
- $47.5M ARR by Year 5 (2030)
- Series A: $10M ($5M TradeFlow + $5M Journey Financial)
- Non-dilutive: NSF SBIR ($275k), Delaware EDGE Grant ($100k), R&D Tax Credits
- UCOL becomes shared AI infrastructure for all JJEM subsidiaries
- Merchandise supports brand growth and helps fund future product development
- **Consumer Subscription Revenue**: Launch the chameleon-like consultant feature, monetizing packaged domain expertise via a monthly rental model [00:23:46].

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
- All LLM calls must be traceable (Opik integration — current backend)
- Brand architecture should stay coherent: **Lattice OS** is the product, **Weaver** is the customer-facing agent, **Relay** is the internal workspace/orchestration agent, and **Chameleon Consultant** is the rentable packaged expert [00:23:46]

### Business
- GDPR/privacy compliance required (user data export, deletion)
- QSBS eligibility must be preserved (Delaware C-Corp structure)
- UCOL IP stays within the JJEM entity structure unless explicitly licensed

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

### The Niche Data Refinery
The intelligence layer actively ingests messy, fragmented internet data from targeted sources and refines it into structured agent tools [00:10:34]. This proprietary clean data feeds the knowledge graph and powers specific expert workflows.

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

### Anti-Addiction & High-Utility Routing
The platform actively penalizes addictive loops and optimizes for high-utility outcomes, inverting the traditional "Meaningful Social Interactions" (MSI) model.

1. **Algorithmic Paradigm Shift (The Facebook MSI Inversion)**
   - Inverts traditional engagement metrics (Time x Interactions).
   - Optimizes for task utility and positive user connotation, actively penalizing frustrating workflows or repeated error corrections.

2. **The Reward Function ($R$)**
   - Composite utility score evaluated asynchronously.
   - **Positive Signals:** Direct user confirmation ($F_{explicit}$) and high-utility semantic sentiment ($S_{semantic}$).
   - **Negative Signals:** Heavy penalty for genuine negative connotation ($C_{negative}$).

3. **Two-Tiered Orchestration Layer**
   - **Real-Time Router (Gateway):** Uses a Contextual Bandit algorithm before LLM inference. Evaluates user state (prompt + workspace) and routes to the action with the highest predicted reward.
   - **Background Optimizer (Asynchronous):** Processes the full interaction post-response, calculates the definitive $R$, and upserts to the vector database to update historical weights via RLS.

4. **Persistent Memory & State Management**
   - **The "Next Session" Heuristic:** Pre-write gatekeeper. Only writes meaningful state changes that alter what the agent should do in the next session.
   - **Semantic Deduplication:** Drops duplicates and instead reinforces existing vectors (updating reward score and timestamp).
   - **Dynamic Thresholding:** Similarity threshold tightens automatically as the workspace's memory bank grows to keep the vector space concentrated.
   - **Memory Decay:** Vectors without recent access or reinforcement undergo exponential decay on their reward score, pruning "useful-once" context.

---

## User Experience Principles

- **The Chameleon Consultant (Weaver)**: The customer-facing agent acts as an adaptive expert. Powered by the data refinery, Weaver packages deep, specific domains of knowledge into functional tools, allowing users to rent a tailored consultant on demand [00:23:46]. 
- **Speed first**: Streaming responses, non-blocking memory — users feel AI that thinks fast
- **Transparency**: Users can see what the system knows about them (knowledge graph export)
- **Multi-model without friction**: Model switching is seamless, not a settings menu
- **Progressive complexity**: Simple chat UI on the surface, UCOL depth underneath
- **Trust through accuracy**: World model layer means fewer hallucinations over time
- **Brand coherence**: Users should experience Lattice OS as the product, Weaver as the helpful face, and Relay as the invisible orchestration layer

---

## Success Criteria

### Technical
- [ ] UCOL routes 100% of classified queries without increasing P95 response latency
- [ ] Knowledge graph grows monotonically — every session adds structured facts
- [ ] World model delta engine catches >80% of verifiable claims (Phase 3)
- [ ] Code Builder produces production-ready components with <2 review rounds average
- [ ] Zero critical/high CodeQL findings on main

### Business
- [ ] 1,000 active users on the new Lattice OS domain (PMF signal)
- [ ] 100 active monthly subscribers renting the consumer-facing chameleon consultant
- [ ] Bluesky agent driving measurable traffic to the new Lattice OS domain
- [ ] Series A deck ready with UCOL demo
- [ ] At least one JJEM subsidiary using UCOL infrastructure
- [ ] Initial merch line (tees, long sleeves, hoodies) established as a viable support channel

### Quality
- [ ] Test coverage >70% on core UCOL paths
- [ ] Error resolution agent handling >50% of Vercel errors autonomously
- [ ] All agent interactions logged and traceable in Langfuse

---

## Agent Notes (for AI agents reading this)

1. **Read this file before starting any task.** If your task conflicts with the goals
   or constraints above, stop and ask before proceeding.

2. **UCOL is the moat.** Features that feed the knowledge graph, construct expert tools, or improve routing are higher priority than features that don't.

3. **Never auto-merge.** All AI-generated changes go through PR review. No exceptions.

4. **Security constraints are invariants.** CodeQL failures block deployment. Fix them.

5. **The knowledge graph is append-only.** Don't write migrations that delete or
   overwrite existing graph nodes/edges without explicit approval.

6. **Check `lib/env.ts` before adding env vars.** All new vars need Zod validation.

7. **Weaver is the customer-facing intelligence layer, Relay is the internal orchestration layer, and Lattice OS is the product surface. Keep those roles distinct in copy and implementation.**