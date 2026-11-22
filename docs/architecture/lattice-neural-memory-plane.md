# Lattice Intelligence — Neural Memory Plane v0.1 (Architecture RFC)

Status: PROPOSED / DOCUMENTATION ONLY. This is not a claim that the neural memory plane, new embedding model, schema, safety gates, or training loop is implemented or enabled.
Date: 2026-11-22.
Owner: Lattice OS.
Related RFC: [Model Plane](./lattice-intelligence-model-plane.md).

## Purpose

Provide evidence-grounded, time-aware, permission-scoped memory retrieval and reversible context compression for Weaver, Code Builder, Research and specialized sub-agents. Persistent facts are not stored solely in the LLM's weights. Memory ownership is separate from the model serving provider so Lattice can swap a primary model without erasing context.

Definitions:
- Lossless storage compression: compact original bytes (e.g. existing lib/compression); decompression must reproduce identical input.
- Semantic condensation: a lossy, provenance-bound summary that is economical for an inference context window. It is never an authoritative replacement for original evidence.
- Neural retrieval: learned embeddings/rerankers score relevance; temporal/ACL/source rules remain deterministic.
- Learning: training a versioned retriever, reranker, compressor or adapter against labeled evaluation data; does not mean automatic production weight changes after every conversation.

## Baseline already present in the repository

- lib/memory/vectorStore.ts: Supabase memory_bank, user/workspace/conversation scopes, compressed content, dimension-aware vector writes, lexical content_search.
- lib/memory/embedding.ts: Gemini embedding provider with 3072-dimensional vectors, model/dimension cache keys and degraded lexical fallback when embeddings are unavailable.
- lib/ragMemory.ts: query-side memory retrieval, ranking and prompt context assembly.
- lib/context/sieve.ts: shadow relevance projection; protected documents/strategy always retained, and failed relevance judgments keep all context.
- packages/ucol-node/src/engram/index.ts: Engram distillation of session history into semantic knowledge, currently using Gemini extraction and text bigram similarity as fallback/proxy in parts of the pipeline.
- research/world-model/ML_ARCHITECTURE.md: interpretable tree-based claim/routing layer on a temporal knowledge graph.
- docs/architecture/conversation-continuity-and-generation-coordinator.md: authenticated, governed runtime bridge and specialist dispatch.

This RFC builds on these components. Existing behavior is not proof of globally correct recall or that the new neural components are deployed.

## Memory taxonomy and retention

| Tier | Content | Durability and retrieval |
| --- | --- | --- |
| W0 working context | active request, short conversational state, approved tool state | bounded by session and context budget; ephemeral |
| E1 episodic | original messages, tool receipts, artifact revisions, source spans | immutable/auditable source records with retention policy |
| S2 semantic | extracted claims, definitions, user-stated preferences, project decisions | versioned records with evidence links and temporal validity |
| P3 procedural | tested workflows, approved runbooks, tool lessons | policy-reviewed workspace or account scope, never self-granted permission |
| T4 temporal graph | events, state transitions, contradictions, supersession | append-only changes with valid-time and observation-time fields |
| C5 compressed views | query-specific or longitudinal summaries and embeddings | derived, regenerable, linked to E1/S2/T4 revisions |

A memory row must declare identity, owner, scope, source permissions, confidence, provenance and retention. Shared workspace memories require explicit membership and approved promotion; a user's private memory must not leak to collaborators or model-training corpora.

## Data contracts (conceptual)

MemoryEvidence:
- evidence_id; owner_user_id; workspace_id nullable; conversation_id nullable
- source_kind, source_locator, source_revision, sha256, recorded_at
- content_ref (protected original), source_span, auth_scope, retention_policy
- optional author assertion and observed timestamps

MemoryAssertion:
- assertion_id; evidence_ids; subject/predicate/object or structured content
- kind (fact/preference/decision/claim/procedure), confidence, extractor_version
- valid_from, valid_to nullable, observed_at, supersedes_assertion_id nullable
- owner_user_id, workspace_id nullable, visibility, consent_state
- embedding_model_id, embedding_dimension, embedding_ref, schema_version

MemoryDigest:
- digest_id; input evidence/assertion revision hashes; compression_version
- summary, key facts, decisions, open questions, conflicts, omissions
- author_model_revision, source citations, token_count, checksum, generated_at
- may be invalidated and regenerated; must never overwrite evidence

RecallReceipt:
- request_id; caller identity, workspace and policy revision
- retrieved evidence IDs; assertion/digest revisions; retrieval model IDs
- ranking scores, truncation/defer reasons, token budget and context hash
- filter policy results, generated_at, latency, model adapter version

Exact database schemas, RLS policies and migrations require separate review. This document authorizes no migration.

## Write/learn pipeline

    Authorized message/file/tool event
       -> verify actor + ACL + consent + source classification
       -> persist append-only original / evidence pointer
       -> segment and extract candidate assertions, decisions, time references
       -> source-span verification, secret/PII filters, contradiction detection
       -> update temporal graph (never silently rewrite history)
       -> generate embeddings + lexical index + typed relationships
       -> create optional versioned digest/summary
       -> memory access event + audit receipt

Do not let untrusted retrieved text become instructions, a workspace access grant, tool approval, or a cross-tenant embedding/summary. Store original source hashes and handle retraction, deletion, retention expiry, consent withdrawal, key rotation, and model/provider migration throughout the derived artifact graph.

Training dataset export is a separate opt-in and licensing-controlled workflow. Raw workspace content never becomes shared model weights by default.

## Read/recall pipeline

1. Request admission: derive identity and workspace membership on the server; pick an explicit memory-scope allowlist.
2. Query understanding: resolve temporal anchors, entities, intent, and admissible source categories.
3. Candidate generation: lexical/BM25 + existing 3072-dimensional vector index + graph edges + temporal filtering. On degraded embeddings, use authorized lexical recall, never random zero-vector neighbors.
4. Fusion and reranking: reciprocal-rank fusion or calibrated score fusion followed by a small cross-encoder/learned reranker. Reranking must operate only on authorized candidates.
5. Contradiction resolution: preserve multiple conflicting facts with source dates; prefer newer evidence only when valid-time and authority justify it. Return uncertainty rather than overwriting old assertions.
6. Evidence expansion: retrieve original spans when important claims hinge on a compressed summary.
7. Token shaping: build versioned context packets; Context Sieve may defer low-priority unprotected blocks only after measured promotion. Protected attachments, user direction, required constraints and error evidence remain.
8. Answer assembly: output evidence IDs/citations, context version and recall receipt to the runtime bridge. Memory never obtains tool approval authority.
9. Feedback: collect explicit correction and verified outcomes as labeled examples; no silent online gradient update.

## Compression contract

Compression is multi-stage:
A. Exact archival compression (existing byte compression; round-trip test).
B. Canonicalization, chunking and semantic deduplication, retaining all provenance pointers.
C. Extractive evidence index with exact source spans.
D. Abstractive digest (episode, project, entity, timeline) with fact check and conflicts.
E. Task-specific context packet selected by memory ranker and token budget.
F. Rehydration: dereference original evidence for high-stakes, low-confidence or source-sensitive claims.

Guardrails:
- No summary is authoritative without linked source revisions.
- Every compression record contains source hashes, summarizer version, omissions and an expiry/invalidation strategy.
- Failures preserve raw evidence; unsuccessful compression does not mark source history irreversibly consumed.
- Compression ratio alone is not a quality metric; measure decision-critical fact retention, citation correctness, contradiction preservation, and ability to reconstruct the necessary context.
- Never treat a simple LZ-based content reduction as learned long-term memory.

## Neural components and archetypes

Stage N0: retain existing Gemini embeddings, lexical fallback, ranking and Engram; measure baseline.
Stage N1: introduce an embedding-provider abstraction and dual-index migration policy. Never compare 768- and 3072-dimensional vectors as if they share a space; version and backfill or parallel-search each indexed space.
Stage N2: train a task-aware reranker using verified (query, permitted evidence, relevance grade) triples.
Stage N3: train a small evidence-conditioned summarization adapter for temporal state, decisions, preferences and engineering handoffs. Evaluate against source-labeled factual retention and non-hallucination.
Stage N4: add a temporal recall evaluator and contradiction resolver; use existing tree/graph models for auditable policy decisions where appropriate.
Stage N5: optionally distill successful retrieval/compression policies into specialized adapters for local/offline devices, without copying private workspace data into generalized weights.

Suggested trainable archetypes: Episodic Encoder, Temporal Resolver, Evidence Reranker, Memory Curator, Contradiction Judge, Procedural Retrieval Specialist. These are functions with separate validation suites, not separate self-directed intelligences.

## Evaluation and promotion

Maintain immutable frozen test splits:
- long conversation where a decision is revised months later
- conflicting evidence with source/valid timestamps
- workspace ACL + revoked member + shared/private scope mix
- exact source quote vs semantically similar false evidence
- compression followed by original-evidence rehydration
- embedding provider outage and version migration
- deletion/export/retention event propagation
- prompt-injection attempts in retrieved content
- owner change/reconnect without replaying mutations

Metrics:
- Recall@5 / nDCG@10 for authorized retrieval
- permission leakage (must be zero in seeded ACL tests)
- source citation precision, unsupported-assertion rate
- decision-critical fact retention after compression
- temporal contradiction detection and supersession correctness
- compression ratio + rehydration success, p95 latency, GPU/token cost
- freshness and invalidation time, privacy/retention compliance

Proposed initial gate targets (to calibrate after a real baseline): zero cross-tenant retrieval in adversarial suite, at least 95% decision-critical fact retention on a labeled set, at least 95% grounded-source coverage for summarizer-emitted factual claims, and an improvement in retrieval nDCG over baseline without policy regression. Do not represent these as measured performance.

## Implementation roadmap and non-goals

N0 — Document baseline interfaces, fixtures, evaluation policy and source lineage. No new production dependencies.
N1 — Read-only recall tracing and golden query set; avoid user content in debug logs.
N2 — Schema proposal for evidence/assertions/digests and exact owner-scoped RLS tests, on disposable database first.
N3 — Shadow hybrid retriever with temporal filtering and optional reranker, behind a default-off flag.
N4 — Engram compression fidelity and recovery hardening; comparison against existing protocol.
N5 — Train reranker/compression adapter on licensed/consented examples; no shared user-data training without permission.
N6 — Staging rollout with rehydration, invalidation, scope isolation, reconnect and failure injection.
N7 — Canary and reversible promotion only after human-reviewed evaluation receipts.

Not in scope: pretraining a Nemotron Ultra-scale model; deleting old source content merely to save tokens; modifying production RLS or migrations; switching off current providers; training directly on private conversations by default; unchecked perpetual self-modification.

## Required boundary

Intelligence belongs to the ensemble and the governed memory state. Authorization, source evidence, temporal consistency, deletion rights and deterministic security checks belong to Lattice OS infrastructure, never to a model's free-form judgment.