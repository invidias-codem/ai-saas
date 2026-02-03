---
name: genie-context
description: Query the Genie AI SaaS codebase and Supabase RAG memory for project context
---

# Genie Context Skill

This skill allows OpenClaw to query the **Genie AI SaaS** codebase and its Supabase-backed RAG memory system.

## Capabilities

| Command | Description |
|---------|-------------|
| `query_rag` | Search the Supabase vector store for relevant context |
| `list_architecture` | Describe the current project architecture |
| `find_code` | Locate specific functions, components, or patterns |
| `check_deps` | List project dependencies and their versions |

## Configuration

### Environment Variables (Lite Mode for MacBook Air)

The skill uses **API-based inference only** to preserve local resources:

```bash
# Primary model for complex reasoning (via API)
GENIE_REASONING_MODEL="gemini-1.5-pro"

# Fast model for background tasks (embeddings, indexing)
GENIE_FAST_MODEL="gemini-1.5-flash"

# Disable local vector processing (use Supabase)
GENIE_LOCAL_VECTORS="false"

# Supabase connection (from ai-saas/.env.local)
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
```

## Usage Examples

### Query RAG Memory

```
You: What's the current logic for our vector-agent worker?

OpenClaw: I'll query your Supabase memory...

[Executes: node ~/.openclaw/workspace/skills/genie-context/scripts/query_rag.mjs "vector-agent worker logic"]

Based on your codebase context:
- The vector-agent is in `functions/vector-agent-python/`
- It handles async embedding generation via Cloud Tasks
- Uses Vertex AI text-embedding-004 (768 dimensions)
```

### Find Code Patterns

```
You: Where do we handle Slack slash commands?

OpenClaw: Let me search the codebase...

[Executes: grep -r "handleSlackCommand\|/genie" --include="*.ts" /Users/jroot/Desktop/ai-nexus/ai-saas]

Found in:
- app/api/integrations/slack/commands/route.ts
- functions/src/slack.ts
```

## Scripts

### `scripts/query_rag.mjs`

Queries the Supabase `graph_nodes` and `memory_bank` tables for semantically relevant context.

### `scripts/index_codebase.mjs`

Indexes the ai-saas repository structure into the RAG system (run once, then on significant changes).

### `scripts/lite_config.mjs`

Returns the current lite-mode configuration status.

### `scripts/review_handler.mjs`

Handles PR review requests from GitHub Actions webhook:
- Fetches diff via `gh pr diff`
- Queries RAG for architectural context
- Analyzes with Gemini 1.5 Pro
- Posts review comment via `gh pr comment`
- Includes 5-minute debounce for rapid commits

### `scripts/project_commands.mjs`

Project management commands for Slack/Telegram:
- `status` - Infrastructure health, Supabase metrics, GitHub Actions
- `deploy` - Trigger production deployment via `gh workflow run`
- `usage` - Token consumption vs budget limits
- `audit` - NPM audit, ESLint, secrets scan

## Project Context

### Tech Stack
- **Frontend**: Next.js 14, React 18, TailwindCSS
- **Backend**: Firebase Cloud Functions (Node.js + Python)
- **Database**: Supabase (PostgreSQL + pgvector), Firestore
- **AI**: Google Gemini (generative-ai), Vertex AI (embeddings)
- **Auth**: Clerk
- **Integrations**: Slack, Zapier

### Key Directories
- `app/` - Next.js app router pages and API routes
- `components/` - React UI components
- `lib/` - Core utilities (RAG, memory, AI clients)
- `functions/` - Cloud Functions (genie-worker, vector-agent)
- `supabase/` - Database migrations and config

### Live URLs
- **Production**: https://gen1e.xyz
- **Supabase**: https://ozevwhiipwbcvyzkbhib.supabase.co

## Budget Guardrails

This skill enforces the following limits via Upstash rate limiting:

| Action | Limit |
|--------|-------|
| RAG queries | 100/hour |
| Codebase indexing | 5/day |
| Shell command execution | 50/hour |

If a limit is exceeded, the skill will notify you via Telegram/Slack rather than silently fail.

## Heartbeat Behavior

When OpenClaw's heartbeat fires:
1. Check for new TODOs in recently modified files
2. If found, create a GitHub Issue via `gh issue create`
3. Message you with a summary (max 1 notification per 30 minutes)
