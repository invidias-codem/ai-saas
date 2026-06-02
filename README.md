# Lattice OS

> **Own the context. Route the intelligence.**

Lattice OS is a workspace-native AI platform for **conversations, code, documents, and persistent context**. It combines memory-aware chat, server-side model/runtime routing, workspace-scoped context assembly, and an evolving local-capability layer so users can build, understand, and operate projects with more continuity over time.

Unlike AI wrappers that treat every chat as an isolated prompt, Lattice is moving toward a system where:
- workspace context matters
- prepared context is assembled deliberately
- model/runtime behavior is resolved server-side
- memory compounds over time
- document and code understanding become first-class
- local capabilities can grow inside trusted boundaries

At the product surface, users interact with an authenticated AI workspace. Under the hood, Lattice is built around the **Unified Context Orchestration Layer (UCOL)**, workspace-aware behavior, persistent memory, and structured trust boundaries.

---

## What Lattice Gives You

### Workspace-aware AI conversations
Lattice is not just a generic chat box. The platform is increasingly structured around workspace-scoped behavior so conversations can evolve alongside projects rather than feeling disconnected from them.

### Persistent memory and prepared context
Lattice is designed around prepared context rather than naive raw message history alone. Memory, retrieval, and structured context assembly are foundational parts of the product direction.

### Multi-model routing through UCOL
Different tasks can route to different model/provider paths depending on mode and system logic. The goal is to make runtime behavior more explicit, inspectable, and adaptable than a single-model wrapper.

### Document-backed reasoning
Lattice is actively evolving toward a stronger document ingestion and retrieval model so uploaded project and knowledge materials can be previewed, queried, and used during reasoning.

### Code and project understanding
The platform includes codebase-aware and architecture-aware direction across retrieval, workspace context, and emerging Code Map / interactive artifact work.

### Trusted local capability direction
The repo already includes an Electron/Desktop path and an evolving Go harness for secure local capability expansion. This layer is being developed in bounded phases with explicit trust and observability goals.

---

## Why Lattice

Most AI products stop at the prompt window.

Lattice is being built around:
- **workspace truth** instead of isolated chats
- **prepared context** instead of raw history alone
- **routing and operating profiles** instead of one flat model path
- **persistent memory** instead of stateless resets
- **trusted capability growth** instead of unconstrained local tool execution

The goal is not just to answer questions.
The goal is to help users **build, understand, and operate evolving systems** with continuity.

---

## Core Architectural Themes

### 1. Workspace-first behavior
Workspaces are becoming the primary runtime container for context, organization, retrieval, and future personalization.

### 2. Prepared context over raw transcript sprawl
Lattice is moving toward explicit context assembly so memory, retrieval, and prompt structure become more inspectable and controllable.

### 3. Server-resolved runtime behavior
Runtime selection is increasingly resolved on the server side rather than inferred loosely from the client.

### 4. Multi-model orchestration through UCOL
The Unified Context Orchestration Layer allows different model/provider paths to serve different types of work while sharing system context.

### 5. Trust boundaries matter
Public pages, authenticated surfaces, integrations, background jobs, and local capability layers are not treated as the same trust zone.

---

## Current Product Areas

The repo currently spans several major product and platform surfaces:

- **Public web surface** — landing, docs, support, informational pages
- **Authenticated workspace surface** — dashboard, conversations, workspaces, onboarding, settings
- **Conversation engine** — model/provider handling, mode selection, prepared context, agentic behavior
- **Memory and retrieval systems** — persistent context, graph/vector direction, retrieval assembly
- **Document workflows** — upload, preview, retrieval-backed reasoning direction
- **Integrations** — Slack, Telegram, Zapier, and related automation surfaces
- **Automation / cron behavior** — scheduled jobs and background workflows
- **Desktop / local capability expansion** — Electron packaging and Go harness work in progress

---

## Quick Start

Lattice is designed to be explored in bounded stages. The fastest way to experience the core value is this 8-step golden path.

### 1. Clone repo
```bash
git clone https://github.com/invidias-codem/ai-saas.git
cd ai-saas
```

### 2. Install deps
```bash
pnpm install
```

### 3. Set minimum env vars
```bash
cp .env.local.example .env.local
```
*(Provide the minimum keys for Auth, Database, and one AI provider in `.env.local`)*

### 4. Run app
```bash
pnpm dev
```

### 5. Open workspace
Open `http://localhost:3000` in your browser. Create an account and enter a new workspace.

### 6. Start a workspace-aware conversation
Don't just say "hello". Try prompting Lattice to understand a concept within the workspace context. Notice how memory is persistent and context is assembled deliberately.

### 7. Explore modes
Switch between different runtime modes (fast, agentic, reasoning) to observe how Lattice routes requests server-side based on the operating profile.

### 8. Optionally go deeper
Once the core loop makes sense, check the docs to explore integrations, local background intelligence (Electron/Go harness), or self-hosted deployments.

---

## Development Scripts

Key commands from the current repo include:

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:security
```

Additional scripts exist for evaluation, RAG/indexing, import verification, rate-limit checks, and desktop packaging.

---

## Desktop / Local Capability Direction

Lattice already includes an Electron/Desktop packaging path and a growing Go-based local harness.

This part of the product is still an evolving capability layer rather than a fully simplified mass-user install story. The direction includes:
- trusted local execution boundaries
- scoped local file/repo capability growth
- telemetry and health visibility
- future local document/repo intelligence
- future architecture/code-map artifact generation

Treat this as an advanced product lane until the install and runtime story is more consolidated.

---

## Deployment Direction

Lattice is being shaped toward explicit deployment modes rather than a vague “deploy anywhere” promise.

The clearest current self-hosted direction is:

### Mode A — Standard Internal Deployment
Designed for internal teams using workspace-scoped reasoning over documents, projects, and persistent context.

More advanced deployment modes for customer-facing assistants, deeper private/memory-rich deployments, and infrastructure/platform use are planned as more mature operational profiles.

---

## Security and Trust Boundaries

Lattice spans multiple trust zones:
- public visitor surfaces
- authenticated user surfaces
- backend application logic
- automation/cron surfaces
- integration/webhook surfaces
- data/persistence boundaries
- emerging local capability boundaries

This is important because the platform is not a single-surface app. Product correctness depends heavily on separating:
- what is public
- what is authenticated
- what is backend-only
- what is automation-only
- what is locally privileged

For more detail, see the trust-boundary and deployment documentation already present in the repo.

---

## Tech Stack

Current repo truth includes:
- **Framework:** Next.js
- **Language:** TypeScript
- **Auth:** Clerk
- **Persistence:** Supabase and related product state layers
- **Background / integrations:** multiple route and automation surfaces
- **Desktop path:** Electron
- **Local capability path:** Go harness (in progress)

See `package.json` and `docs/` for the most current operational details.

---

## Product Direction

Lattice is moving toward a system that can:
- reason with persistent workspace context
- route work intelligently across model/runtime paths
- understand documents and projects more deeply
- grow trusted local capabilities carefully
- generate richer system-understanding artifacts over time

That includes future-facing directions such as:
- local document/repo intelligence
- interactive Code Map / architecture understanding artifacts
- Playground-style exploratory outputs

These directions matter, but they should be read as **active product evolution**, not as claims that every future surface is already fully mature today.

---

## Contributing

If you are contributing to the repo:

1. work in bounded slices
2. prefer runtime truth over assumption
3. keep security and trust boundaries explicit
4. run relevant tests before proposing merges
5. treat the real product/runtime path as source of truth when validating behavior

---

## License

See the repository’s current license and ownership terms.
