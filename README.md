# Lattice OS

> **Own your memory. Route the intelligence.**

Lattice OS is a **memory-native AI platform** for conversations, code, documents, and persistent context. Unlike ChatGPT and Claude that forget every session, Lattice combines persistent memory, server-side model/runtime routing, memory-aware context assembly, and an evolving local-capability layer so users can build, understand, and operate projects with real continuity over time.

Unlike AI wrappers that treat every chat as an isolated prompt, Lattice is built around the idea that:
- memory persists across sessions
- prepared context is assembled deliberately
- model/runtime behavior is resolved server-side
- knowledge compounds over time
- document and code understanding become first-class
- local capabilities can grow inside trusted boundaries

At the product surface, users interact with an authenticated AI workspace. Under the hood, Lattice is built around the **Unified Context Orchestration Layer (UCOL)**, memory-native architecture, persistent memory, and structured trust boundaries.

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

### Repository layout

Lattice OS is a **pnpm monorepo** rather than a single bag of scripts. This keeps platform logic, infrastructure adapters, and product surfaces decoupled.

| Path | Package / Purpose |
|------|-------------------|
| `app/` | Next.js 16 + App Router web app |
| `packages/lattice-core` | Core contracts: env, constants, types |
| `packages/lattice-mcp-local` | Local MCP stdio adapter |
| `packages/lattice-mcp-remote` | Remote MCP HTTP adapter (CLerk-authed) |
| `packages/lattice-ai-skills` | AI Skills adapter |

The root app depends on these via `workspace:*` and builds them in `prebuild` so Vercel can resolve `@lattice-os/*` paths.

---

## Quick Start

Lattice is designed to be explored in bounded stages. The fastest way to experience the core value is this 8-step golden path.

### Development Setup

**1. Clone repo**
```bash
git clone https://github.com/invidias-codem/ai-saas.git
cd ai-saas
```

**2. Install deps**
```bash
pnpm install
```

**3. Set minimum env vars**
```bash
cp .env.local.example .env.local
```
*(Provide the minimum keys for Auth, Database, and one AI provider in `.env.local`)*

**4. Run app**
```bash
pnpm dev
```

**5. Open workspace**
Open `http://localhost:3000` in your browser. Create an account and enter a new workspace.

**6. Start a workspace-aware conversation**
Don't just say "hello". Try prompting Lattice to understand a concept within the workspace context. Notice how memory is persistent and context is assembled deliberately.

**7. Explore modes**
Switch between different runtime modes (fast, agentic, reasoning) to observe how Lattice routes requests server-side based on the operating profile.

**8. Optionally go deeper**
Once the core loop makes sense, check the docs to explore integrations, local background intelligence (Electron/Go harness), or self-hosted deployments.

---

## lattice-cli: Docker Appliance Management

Lattice OS includes a production-ready CLI tool for managing Docker appliance deployments with cryptographic licensing and preflight validation.

### Installation

**Option 1: Install from GitHub (recommended)**
```bash
pip install git+https://github.com/invidias-codem/ai-saas.git#subdirectory=scripts/lattice-cli
```

**Option 2: Build from source**
```bash
cd scripts/lattice-cli
pip install -e .
```

**Option 3: Install standalone binary**
```bash
curl -sL https://raw.githubusercontent.com/invidias-codem/ai-saas/main/scripts/lattice-cli/install.sh | bash
```

### Core Commands

```bash
# Check version and help
lattice --version
lattice --help

# Authentication
lattice auth login --username <dockerhub-username> --token <dockerhub-pat>
lattice auth status

# Deploy Lattice OS
lattice deploy init --name prod --tier enterprise
lattice deploy start --name prod

# License management
lattice license activate <v3-license-key>
lattice license show

# Health checks and logs
lattice health check --instance prod
lattice health logs --tail 100

# Upgrades and rollbacks
lattice upgrade upgrade --tag latest
lattice upgrade rollback

# Backups
lattice backup create --instance prod
lattice backup list
lattice backup restore <backup-id>
```

### V3 Cryptographic Licensing (v0.3.0)

Lattice OS v0.3.0 introduces ed25519 cryptographic license verification:

- **Secure by design**: Private signing key stored offline (HSM-backed), public key embedded in binary
- **Tamper-proof**: Licenses are digitally signed and verified before activation
- **Offline-capable**: License verification works in air-gapped environments
- **Feature-based**: Licenses encode tier (community/enterprise) and feature gates

**License types:**
- **Community**: Free forever, up to 3 workspaces, core features
- **Enterprise**: Unlimited workspaces, RBAC, SSO, audit logs, support

**Activation flow:**
```bash
# Generate license (admin only, requires private key)
lattice dev sign --tier enterprise --expires 2027-06-21T00:00:00Z --instance prod

# Activate license (user)
lattice license activate lattice-v3-<signed-payload>
```

### Air-Gapped Deployment

Lattice OS supports fully offline operation:

```bash
# Mark deployment as air-gapped
# Set deployment_mode = "air-gapped" in ~/.lattice/config.toml first
lattice deploy init --name secure --tier enterprise

# Verify no network calls
lattice health check --instance secure
```

**Preflight checks include:**
- Docker daemon accessibility
- Compose v2 availability
- RAM/CPU requirements (4GB/2 cores minimum)
- Port availability (3000, 5432, 6379)
- Disk space (8GB minimum)
- Authentication status
- Licensing status

### Beta Onboarding Guides

We provide guided onboarding tracks for beta testers:

- **Quick Start** (`/en/beta/start`): 15-minute path from install to first conversation
- **Developer** (`/en/beta/dev`): 45-minute deep dive into source builds and CI integration
- **Enterprise** (`/en/beta/enterprise`): 1-hour team setup with licensing, RBAC, and SSO
- **Privacy** (`/en/beta/privacy`): 1-hour compliance-focused setup for regulated environments

Each guide includes prerequisites, step-by-step walkthroughs, and CLI commands.

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

Lattice OS supports multiple deployment modes, from cloud-hosted SaaS to fully air-gapped Docker appliances.

### Docker Appliance Deployment (Recommended for Enterprise)

Deploy Lattice OS as a self-contained Docker appliance with zero cloud dependencies:

```bash
# Install lattice-cli
curl -sL https://raw.githubusercontent.com/invidias-codem/ai-saas/main/scripts/lattice-cli/install.sh | bash

# Authenticate with Docker Hub
lattice auth login

# Initialize and deploy
lattice deploy init --name prod --tier enterprise
lattice deploy start --name prod
```

**What you get:**
- Complete Lattice OS stack in Docker containers
- Automatic preflight validation (Docker, Compose v2, RAM/CPU, ports, disk, Docker auth)
- Cryptographic license verification (tamper-proof)
- Air-gap support for disconnected environments
- Built-in backup and restore capabilities

**Requirements:**
- Docker Engine 20.10+ with Compose v2
- 4GB RAM (8GB recommended for Enterprise)
- 8GB disk space minimum (20GB recommended for Enterprise)
- Docker Hub PAT for private image authentication

### Deployment Modes

**1. Cloud-Hosted (gen1e.xyz)**
- Managed SaaS deployment
- No infrastructure to maintain
- Automatic updates and scaling
- Best for: Teams, individual users

**2. Docker Appliance (Self-Hosted)**
- Single-server deployment
- Full control over data residency
- Air-gap capable
- Best for: Enterprise, regulated environments

**3. Air-Gapped (Fully Offline)**
- Zero network dependencies
- All models and data stay on-premises
- Compliance-ready (HIPAA, GDPR, SOC2)
- Best for: Government, healthcare, finance

**4. Hybrid (Mixed Infrastructure)**
- Core services self-hosted
- Optional cloud integrations (OpenAI, Slack, etc.)
- Flexible data residency
- Best for: Organizations with mixed compliance needs

### Infrastructure Requirements

| Mode | RAM | CPU | Disk | Network | Docker |
|------|-----|-----|------|---------|--------|
| Community | 4GB | 2 cores | 10GB | Optional | Required |
| Enterprise | 8GB | 4 cores | 20GB | Optional | Required |
| Air-Gapped | 8GB | 4 cores | 20GB | **None** | Required |

### Preflight Validation

The `lattice deploy start` flow runs 6 preflight checks before deployment, then verifies licensing during the deploy sequence:

1. **Docker daemon** - Ensures Docker is running and accessible
2. **Compose v2** - Verifies Docker Compose plugin (not legacy docker-compose)
3. **System resources** - Validates RAM/CPU meet minimum requirements
4. **Port availability** - Checks 3000, 5432, 6379 are free
5. **Disk space** - Ensures 8GB+ free for images and volumes
6. **Authentication** - Confirms Docker Hub PAT is configured
7. **Licensing** - Validates the active ed25519 license during deployment

All checks are non-destructive and provide detailed remediation steps on failure.

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
