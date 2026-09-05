# EMSH & Multi-Provider Architecture Reference

## 1. Production Database & Migration Governance
* **Applied Migrations:**
  * `supabase/migrations/20260904000000_canonical_state_and_genotypes.sql`
  * `supabase/migrations/20260904000001_match_genotypes.sql`
* **Status:** Both migrations are live in the production Supabase project (`ozevwhiipwbcvyzkbhib`).
* **Governance Rule:** Do **not** re-run these migrations via `supabase db push` or raw execution to avoid schema collisions with the live state.

## 2. Dual-Rail Embedding & Adapter Design
* **High-Density Domain Search (3072-dim):** Used in `workspace_memories` for deep document RAG (powered by `gemini-embedding-2-preview`).
* **Latent EMSH Rail (768-dim):** Used in `genotypes.intent_embedding` for single-digit millisecond DAG structural matching and intent clustering via `ivfflat` indices.
* **Dimensional Adapter:** `projectTo768Dimensions()` (write path) and `projectQueryTo768()` (read path) slice vectors to `(0, 768)`.
* **MRL Qualification:** Matryoshka Representation Learning (MRL) truncation guarantees near-lossless (>95%) semantic retention **only if** the underlying embedding model was trained with MRL losses. Treat MRL truncation as an architectural hypothesis to validate rather than a settled assumption.

## 3. Durable Execution & Fallback Infrastructure
* **Canonical State:** Decoupled provider-specific wire messages into abstract canonical roles (`SYSTEM`, `USER`, `AGENT`, `TOOL_INVOCATION`, `TOOL_RESULT`).
* **Durable HITL Approvals:** Replaced in-memory approval storage with Supabase-backed `durable_approvals` table. Tools are re-hydrated dynamically by module name via `agenticToolSet.ts` on execution resume.
* **Fallback Chain:** `Primary` → `MiniMax-M1 1M (via OpenRouter)` → `Gemini`. Requires `OPENROUTER_API_KEY` in production Vercel environments.
* **Distributed Circuit Breaker:** Upstash Redis-backed (`circuit:provider:{name}`) with atomic `INCR`/`EXPIRE`. Features a 1.5s fail-open fallback to local memory to ensure telemetry infrastructure never blocks the hot path.

## 4. Post-Merge Action Items
1. **Activate Vector Recall:** Connect `findSimilarGenotypes()` inside `synthesizeStrategy()` to blend vector similarity with exact `intent_signature` clustering.
2. **Embedder Benchmark:** Run empirical similarity evaluations comparing truncated 3072-dim vectors against a dedicated 768-dim model (e.g., `text-embedding-004`) across standard code-generation execution DAGs to verify semantic retention.