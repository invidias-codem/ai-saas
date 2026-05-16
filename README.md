# Lattice OS

> **Own the context. Route the model.**

Lattice OS is a memory-native AI platform built on a **Unified Context Orchestration Layer (UCOL)**. Unlike traditional AI wrappers that treat each conversation in isolation, Lattice OS maintains a shared knowledge and memory layer across interactions — so your AI work gains continuity over time, regardless of which model is responding.

At the product surface, users work with **Weaver**, the customer-facing intelligence layer of Lattice OS. Behind the scenes, **Relay** handles internal workspace orchestration, routing, and coordination.

---

## What Makes Lattice OS Different

Most AI platforms give you a chat box connected to a single model. Lattice OS gives you a **shared context layer** that every model reads from and writes to.

- **Gemini** handles fast responses, research, and fact extraction
- **Claude** handles high-quality reasoning and nuanced output
- **DeepSeek** handles deeper analytical synthesis
- **Your knowledge graph** persists across all of them — context learned in one conversation enriches every future one
- **Relay** routes work internally across models, memory, and tools
- **Weaver** gives users a coherent, memory-aware intelligence surface

---

## Core Features

### 🧠 Persistent Memory
- Long-term knowledge graph stored in Supabase with semantic embeddings
- LLM-powered fact extraction from every conversation (skills, preferences, goals, projects)
- Semantic ranking — the most relevant memories surface automatically
- Co-occurrence edges strengthen the more concepts appear together

### 🔀 Multi-Model Routing (UCOL)
- Intelligent query classification routes each request to the best-fit model
- Non-blocking async dispatch — users never wait for routing decisions
- Models learn from each other through shared context — Gemini context flows to Claude and vice versa
- UCOL Code Builder: Gemini plans → Claude codes → Gemini reviews (debate loop with scoring)

### 📚 RAG Integration
- Codebase indexing for deep technical context
- Semantic chunking with embedding-based retrieval
- Budget-aware retrieval to keep latency low

### 🔗 Integrations
- **Slack** — Full bot with commands, interactivity, events, and home tab
- **Telegram** — Webhook-based bot with engineering task dispatch (`/engineer`, `/blog`)
- **Zapier** — Webhook endpoints for workflow automation
- **Firebase** — Cloud Functions for async heavy lifting (Python + Node)

### 🔐 Security
- Clerk authentication with multi-tenant support
- SSRF protection on all external URL fetches (async DNS validation)
- Rate limiting (Upstash Redis) on all public endpoints
- CodeQL-clean: command injection, XSS, ReDoS, and crypto issues all resolved
- Input sanitization and PII detection built into the request pipeline

### ⚙️ Error Resolution Agent
- Autonomous pipeline: Vercel log drain → error classifier → fix generator → GitHub PR
- Gemini classifies errors, Claude generates fixes, all PRs require human approval
- Runs every 30 minutes via cron — never auto-merges

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Auth | Clerk |
| Database | Firestore + Supabase (PostgreSQL + pgvector) |
| AI Models | Google Gemini, Anthropic Claude, DeepSeek |
| Embeddings | Gemini embedding-001 |
| Caching / Rate Limiting | Upstash Redis |
| Background Jobs | Firebase Cloud Functions (Python + Node) |
| Deployment | Vercel (primary) + Firebase Hosting |
| CI/CD | GitHub Actions |

---

## Project Structure

```
app/                    # Next.js App Router
  api/                  # API routes
    integrations/       # Slack, Telegram, Zapier
    internal/           # UCOL routing, JKlaw bridge
    cron/               # Scheduled jobs (error resolution, RAG sync)
lib/
  llm/                  # Conversation engine + model providers
    providers/          # Gemini, Claude, DeepSeek
  memory/               # Knowledge graph, embeddings, vector store
  security/             # Auth, rate limiting, SSRF/input validation
  ucol/                 # UCOL Code Builder + Agent Router
  integrations/         # AnyCrawl, external data
functions/              # Firebase Cloud Functions
  genie-worker-python/  # Python async worker
  vector-agent-python/  # Embedding + vector operations
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A Clerk account (auth)
- A Supabase project (knowledge graph + vector store)
- Firebase project (hosting + functions)
- At minimum one AI provider key (Gemini recommended)

### Installation

```bash
git clone https://github.com/invidias-codem/ai-saas.git
cd ai-saas
npm install
```

### Environment Variables

Create a `.env.local` file at the project root. Required variables:

```env
# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# AI Providers (at least one required)
GOOGLE_API_KEY=              # Gemini
ANTHROPIC_API_KEY=           # Claude
DEEPSEEK_API_KEY=            # DeepSeek

# Rate Limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Integrations (optional)
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
TELEGRAM_BOT_TOKEN=

# Engineer feature (local dev only)
ENGINEER_SCRIPT_PATH=        # Absolute path to .agent/skills/genie-context/scripts/engineer.mjs
GENIE_LOCAL=true             # Enable local-only features
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Tests

```bash
npm test                    # Unit tests
npm run test:security       # Full security test suite
npm run test:security:unit  # Security unit tests only
```

---

## Architecture: UCOL

The **Unified Context Orchestration Layer** is the core architectural concept behind Lattice OS. Traditional AI platforms treat each model as a separate product. UCOL treats them as **nodes in a shared reasoning network**.

```
User Query
    │
    ▼
Query Classifier
    │
    ├── Code/Implementation ──► Claude (quality-first)
    ├── Research/Strategy ────► JKlaw orchestrator
    ├── Analysis/Synthesis ──► DeepSeek
    └── Fast/General ────────► Gemini
                │
                ▼
        Shared Knowledge Graph
        (Supabase + pgvector)
                │
                ▼
        Context enriches ALL future queries
        across ALL models
```

Every conversation writes facts back into the graph. Every future conversation reads from it. The model changes; the memory doesn't.

---

## Contributing

1. Fork the repo and create a feature branch
2. Run `npm run test:security` before opening a PR — all security tests must pass
3. Run `npx tsc --noEmit --skipLibCheck` to verify TypeScript compiles clean
4. PRs to `main` trigger CI (security tests + build verification + Firebase deploy)

---

## License

Proprietary — © JJEM Global Technology, Inc. All rights reserved.

---

## Built by

**Invidious** · Founder, Lattice OS · Part of the JJEM Global Technology enterprise
