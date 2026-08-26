# Integration Specification for a Joint Embedding Predictive Architecture (JEPA) in Lattice OS

**Project:** Lattice OS — Intelligence as a SaaS  
**Subsystem:** World Model / Code Generation Runtime  
**Phase:** Research & Feasibility  
**Constraint:** No external paid infrastructure; fit existing Vercel + Supabase + Upstash stack unless unavoidable.

**Status:** Revised to match codebase as of 2026-08-24. All gaps in the original spec are explicitly addressed below.

---

## 1. Context

Lattice OS is a multi-surface AI platform with a production code-generation runtime (UCOL). The current world-model layer includes:

- **DeltaEngine** (`lib/world-model/delta/DeltaEngine.ts`) — claim-level auditing against the temporal knowledge graph, producing `delta_score` and `ClaimVerdict` values.
- **DistributionShiftDetector** (`lib/world-model/distribution-shift/DistributionShiftDetector.ts`) — Jensen-Shannon divergence on query-domain proportions stored in `wm_query_fingerprints`. Operates on text-domain statistics, not code latents.
- **OutputCritic** (`lib/ucol/critics/OutputCritic.ts`) — single Gemini call evaluating 4 quality checks on LLM output text.
- **sandboxManager / quarantinePromotionManager** (`lib/execution/`) — filesystem artifact staging with SHA1 digests and atomic renames. Operates on file artifacts, not LLM outputs.
- **astChunker** (`lib/rag/astChunker.ts`) — RAG-oriented chunking using the TypeScript compiler API (not tree-sitter) for TS/JS, and a Go binary for Go files. No general AST serialization for code-state representation exists.
- **MctsResolverNode** (`lib/ucol/agents/MctsResolverNode.ts`) — MCTS exists solely for error resolution (used by `errorResolutionAgent.ts`), not for code-generation candidate search. `runtimeBridge.ts` contains no MCTS loop.

The system currently reacts after concrete syntax is materialized. This spec evaluates adding a **Joint Embedding Predictive Architecture (JEPA)** layer so the runtime can reason about code semantics and state transitions *before* emitting tokens. The technical JEPA approach (Sub-JEPA + SIGReg, UniXcoder encoder, AdaLN-Zero predictor, WASM deployment) is preserved exactly as specified; the document is corrected for what the codebase actually contains and what must be built first.

---

## 2. Research Goal

Produce a **deterministic, implementable architecture spec** for integrating JEPA into the Lattice OS code-generation path. The spec must answer:

- How do JEPA encoders and the predictor fit into the existing UCOL runtime bridge?
- What is the minimal viable training signal given our current execution infrastructure?
- How do we supervise latent transitions without breaking determinism or introducing non-reproducible ML artifacts into the critical path?
- What infrastructure does not exist yet and must be built before any Stage 2+ work can proceed?

---

## 3. Hard Constraints

1. **Budget:** No paid external services. Use existing infrastructure or self-hosted OSS only.
2. **Determinism:** All user-facing generation paths must remain deterministic or fail-closed. JEPA is an *advisory* layer, not an authorization gate, unless explicitly gated by policy.
3. **Stack fit:** Primary runtime is Vercel serverless functions + Supabase Postgres + Upstash Redis. Any new compute must justify its placement.
4. **Data availability:** We have workspace code corpora, sandbox execution traces, quarantine promotion logs, and partial AST/CFG utilities. No structured `(s_x, action, s_y)` execution trace format exists yet.
5. **Timeline:** This is Phase 4 research. Do not assume immediate implementation. Output a staged roadmap.
6. **No WASM artifacts yet:** `public/` contains no `.wasm` files. `onnxruntime-web` and `web-tree-sitter` are not installed. All WASM deployment claims are unvalidated hypotheses.

---

## 4. Technical Approach

### 4.1 Regularization: Sub-JEPA + SIGReg

Lattice OS explicitly discards both contrastive loss and EMA mechanisms to satisfy compute and complexity constraints. Instead, it relies on **Sketched Isotropic Gaussian Regularization (SIGReg)**, a statistical technique popularized by the LeWorldModel (LeWM) architecture. SIGReg forces latent embeddings toward an isotropic Gaussian distribution, which mathematical proofs demonstrate is the optimal distribution to minimize downstream linear prediction risk. By projecting high-dimensional embeddings onto random one-dimensional vectors and evaluating them via the Epps-Pulley characteristic-function test, SIGReg guarantees distribution health without requiring negative samples or a shadow network.

However, imposing a global isotropic Gaussian prior across the entire ambient space is excessively rigid for software environments, as programmatic dynamics naturally reside on a low-dimensional manifold. To prevent this structural bias, the encoder will utilize the **Sub-JEPA adaptation**. The Sub-JEPA regularization penalty acts entirely within K frozen, row-orthonormal random projected subspaces. This modification relaxes the global constraint, allowing embeddings the geometric flexibility to model complex code structures while preserving absolute anti-collapse guarantees.

### 4.2 Encoder Pretraining

**Base model:** UniXcoder (microsoft/unixcoder-base), heavily distilled and quantized (INT8 ONNX) to fit serverless payload constraints. Raw checkpoints exceed viable deployment size.

**Dataset:** 50,000–100,000 snippet transitions extracted from workspace code corpora. **Prerequisite:** a structured `(s_x, action, s_y)` execution trace format must be instrumented in `sandboxManager.ts` and populated from quarantine promotion logs before any training data exists.

**Compute venue:** Self-hosted CI job or local GPU pod (e.g., single NVIDIA L40S or RTX 4090). Benchmarks of LeWorldModel demonstrate stable representations for complex environments with ~15M trainable parameters on a single GPU in a few hours.

**Objective:** Minimize combined subspace SIGReg penalty + latent reconstruction error. Training is entirely disconnected from the real-time Vercel execution path.

### 4.3 Action Conditioning and Predictor Dynamics

Once the encoder generates robust, non-collapsed semantic vectors, the temporal predictor must be trained to forecast state changes.

**Transition tuples:** Extract `(s_x, action, s_y)` from instrumented sandbox execution traces. Actions range from granular syntax modifications to large-scale refactors.

**Action embedding:** Tokenize actions and pass through a lightweight text-embedding projection to produce a dense vector characterizing the semantic intent of the transformation.

**Predictor architecture:** Autoregressive causal Transformer with **AdaLN-Zero modulation**. The action vector computes custom scale/shift parameters for LayerNorm blocks. The final linear layer generating modulation parameters is initialized to zero, so the predictor starts as an identity transformation with respect to the action. This ensures training stability without early destabilization or gradient explosion.

### 4.4 Combined Objective Function

Joint training of encoder and predictor uses two terms:

1. **MSE prediction loss:** Minimize Euclidean distance between predicted latent state `ŷ` and target latent state encoded from post-action code.
2. **Sub-JEPA SIGReg penalty:** Applied to encoder outputs to maintain structured, non-degenerate latent geometry.

---

## 5. Component Data Flow and Subsystem Integration

| System Stage | Module / Component Boundary | Input Payload | Computational Process | Output / Result |
|---|---|---|---|---|
| **AST Encoding** | `lib/rag/astChunker.ts` (modified) + new `lib/jepa/astEncoderInput.ts` | Source code snippet | Serialize AST via web-tree-sitter or TS compiler API → tokenize → feed to UniXcoder ONNX encoder | `z_x` (latent state embedding) |
| **Action Embedding** | `lib/jepa/actionEmbedder.ts` (new) | Action description text | Text-embedding projection | `a` (action embedding vector) |
| **Latent Prediction** | `lib/ucol/runtimeBridge.ts` (extended) | `(z_x, a)` tuple | JEPA WASM predictor via onnxruntime-web | `ŷ` (predicted future latent) |
| **Candidate Scoring** | `lib/ucol/runtimeBridge.ts` (advisory, non-blocking) | `ŷ` + LLM-generated candidate AST | Encode candidate AST → compute cosine distance to `ŷ` | Scalar divergence score |
| **Post-Generation Critic** | `lib/ucol/critics/OutputCritic.ts` | Generated text output | Single Gemini call, 4 checks (hallucination, vision alignment, safety, constraints) | `CriticVerdict` |
| **Drift Detection** | `lib/world-model/distribution-shift/DistributionShiftDetector.ts` | JEPA latent fingerprints (new table) | Jensen-Shannon divergence on latent-domain proportions (parallel to existing query-fingerprint path) | Distribution-shift alert |
| **Sandbox Execution** | `lib/execution/sandboxManager.ts` + `quarantinePromotionManager.ts` | Execution command + session binding | Execute in isolated scratch dir; stage artifacts to quarantine; promote or reject based on exit code + quarantine integrity | `SandboxExecutionResult` + promoted/rejected artifacts |

### 5.1 Separation from OutputCritic and Quarantine Systems

The spec's original version conflated `OutputCritic.ts` with quarantine promotion. These are separate subsystems:

- **OutputCritic** is a text-quality gate: a single Gemini call that evaluates 4 checks (hallucination, vision alignment, safety, constraints) on LLM-generated text. It never throws; it fails open. It does not interact with the quarantine system and does not produce training data for JEPA.

- **QuarantinePromotionManager** manages filesystem artifacts. It stages files written by `sandboxManager.ts` into a quarantine directory keyed by `sessionId`, computes SHA1 digests, and promotes files to the live root via atomic rename after integrity verification. Its `QuarantineArtifact` shape is `{ sessionId, relativePath, digest, absPath }`. It does not contain LLM outputs, latent vectors, or `(s_x, action, s_y)` tuples.

- **ExecutionTraceEmitter** (new) must be added to `sandboxManager.ts` to emit structured `(s_x, action, s_y)` tuples. See §5.3.

### 5.2 Advisory Role in runtimeBridge.ts

`runtimeBridge.ts` is an execution orchestration layer: it handles billing, auth, span lifecycle, stream draining, and post-generation pipeline dispatch. It does not currently contain any MCTS loop or JEPA inference path.

The JEPA predictor acts as a **deterministic advisory filter** within the generation pipeline. After the LLM produces candidate ASTs but before sandbox execution:

1. The candidate AST is serialized (via web-tree-sitter or the modified `astChunker.ts`).
2. The JEPA encoder produces `z_candidate`.
3. The JEPA predictor's pre-computed `ŷ` is compared to `z_candidate` via cosine distance.
4. If the distance exceeds a threshold, the candidate is flagged (not hard-pruned — the LLM provider routing remains intact and sandbox testing still occurs).

This advisory path is wrapped in a `Promise.race` with a 250ms timeout. On timeout or WASM failure, `runtimeBridge.ts` catches the exception and bypasses the semantic evaluation block entirely, falling back to the existing syntactic + sandbox path.

### 5.3 Execution Trace Schema

The current `SandboxExecutionResult` and `QuarantineArtifact` types do not contain structured `(s_x, action, s_y)` transition tuples. A new schema and emission path is required before JEPA training data can be collected.

**Proposed `ExecutionTrace` schema:**

```typescript
interface ExecutionTrace {
  traceId: string;            // Correlates with UcolSpan.traceId
  sessionId: string;          // Quarantine session id
  workspaceId: string;
  userId: string;

  // s_x: pre-execution code state
  s_x: {
    sourceFiles: Record<string, string>;  // filePath → content snapshot before execution
    astFingerprint: string;               // SHA256 of serialized AST (for dedup)
    embedding?: number[];                 // Optional: JEPA encoder output for pre-state
  };

  // action: what was executed
  action: {
    type: 'execute' | 'write' | 'patch';
    command?: string;         // For execute: the script body
    filePath?: string;        // For write/patch: target path
    patchSearch?: string;     // For patch: search block
    language?: string;        // sh | python | node
    metadata?: Record<string, string>;
  };

  // s_y: post-execution code state
  s_y: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
    artifacts: Array<{
      relativePath: string;
      digest: string;         // SHA1 from quarantinePromotionManager
      sizeBytes: number;
    }>;
    embedding?: number[];     // Optional: JEPA encoder output for post-state
  };

  timestamp: string;
}
```

**Instrumentation point:** `sandboxManager.ts` `LocalSandboxRunner.execute()` must emit an `ExecutionTrace` after each execution completes (success or failure). On the success path, after `promotionManager.promote()` returns, the runner reads the staged artifact list and populates `s_y.artifacts`. On failure/timeout, `s_y` reflects the actual exit code and any artifacts that were staged before rejection.

Emission target: Upstash Redis (append-only stream) with a TTL, or a new `jepa_execution_traces` Supabase table. The former is preferred for write volume; the latter for query flexibility.

### 5.4 Enhancing the Post-Generation Critic

The existing `OutputCritic.ts` is a text-quality gate that does not produce structured latent divergence data. When JEPA is active, a new signal is added:

When generated code is functionally sound but exhibits high latent divergence from the predictor's expectation, it indicates the code solved the problem using an unexpected or non-standard semantic pathway. These instances are automatically flagged by the advisory scoring path in `runtimeBridge.ts`. The resulting divergence score and execution trace are written to the execution trace store. Over time, analyzing these high-divergence successes allows the team to identify novel algorithmic strategies generated by the LLM, or detect subtle structural anomalies that unit tests failed to catch.

The `OutputCritic` remains independent of this flow. It continues to run its single Gemini call for text quality. JEPA divergence is a separate signal recorded alongside the critic's verdict in the execution trace.

---

## 6. Vercel Infrastructure Adaptations

### 6.1 WASM-Based Inference

Vercel imposes a rigid 250 MB maximum uncompressed size limit on deployed serverless functions. Traditional ML inference in Node.js relies on `@huggingface/transformers` and `onnxruntime-node`, but `onnxruntime-node` includes massive platform-specific shared object files, frequently resulting in uncompressed bundle sizes exceeding 700 MB.

To execute the JEPA model deterministically within Vercel, the system must eschew native node bindings entirely. The architecture relies on cross-compiling PyTorch JEPA models to ONNX and utilizing `onnxruntime-web` running via WebAssembly (WASM). By forcing Webpack/Turbopack to exclude `onnxruntime-node` through alias configuration, and instead executing the WASM SIMD threaded backend, the entire inference engine collapses to a footprint smaller than 25 MB. The required `.wasm` artifacts must be placed in the Next.js `public/` directory, with a custom `locateFile` override during ONNX runtime initialization.

### 6.2 AST Extraction via Web-Tree-Sitter

Standard Node.js Tree-sitter bindings rely on native C++ compilation and filesystem access, both incompatible with Vercel's edge network and size limits. The solution is `web-tree-sitter`. The `tree-sitter.wasm` core module and language parsers are compiled and housed within `public/`. The initialization sequence in `runtimeBridge.ts` loads these WASM files asynchronously, creating a purely memory-bound, deterministic AST extraction pipeline.

**Current state:** `public/` contains no `.wasm` files. The existing `astChunker.ts` uses the TypeScript compiler API (not tree-sitter) for TS/JS chunking and an external Go binary for Go files. A general-purpose AST serialization module for the JEPA encoder does not exist.

---

## 7. Safety, Observability, and Determinism

### 7.1 Execution Determinism

By design, the JEPA predictor does not emit concrete code tokens. It operates exclusively in latent space, generating scalar distance values used for conditional branching. WASM execution of ONNX models is mathematically deterministic: identical embeddings and action vectors produce identical outputs.

Probabilistic variance is isolated entirely to the LLM generating candidate ASTs. The JEPA layer acts as a deterministic filter. All probabilistic outputs are shielded behind a dynamic feature-flag structure configured via Upstash Redis, allowing instantaneous runtime toggling without deployment cycles.

### 7.2 Telemetry for Latent-Space Debugging

The `runtimeBridge.ts` emits asynchronous telemetry payloads containing calculated Epps-Pulley test statistics, quantifying deviation of real-time embeddings from the target isotropic Gaussian distribution. A sudden spike indicates dimensional collapse or severe out-of-distribution code structure.

The system also tracks **Predictive Error Margin**: L2 norm between JEPA-predicted latent state and the eventual accepted code state. An expanding margin triggers scheduled fine-tuning on the CI cluster.

### 7.3 Fail-Closed Rollback

If the JEPA layer degrades system correctness — through excessive memory consumption, extreme WASM cold-start latency, or aggressive pruning of valid branches — the system executes an automated fail-closed maneuver.

All ONNX inference invocations are wrapped in a strict latency bounding box (e.g., 250ms `Promise.race`). If WASM inference exceeds this threshold or telemetry circuit breakers trip due to high Epps-Pulley variance, `runtimeBridge.ts` catches the exception and bypasses the semantic evaluation block entirely. The generation path gracefully falls back to pure syntactic planning and exhaustive sandbox execution.

---

## 8. Feasibility Matrix and Staged Roadmap

### Stage 0: Prerequisite Infrastructure (no JEPA training yet)

These items must exist before Stage 1 can begin. They are engineering tasks, not research tasks.

| Item | Module | What to Build | Acceptance Criteria |
|---|---|---|---|
| **Execution trace schema** | `lib/execution/sandboxManager.ts` | Instrument `LocalSandboxRunner.execute()` to emit `ExecutionTrace` objects after each run. Wire to `QuarantinePromotionManager` for artifact digest collection. | Every sandbox execution produces a structured trace with pre-state snapshot, action description, and post-state result. |
| **AST encoder input pipeline** | New `lib/jepa/astEncoderInput.ts` + modify `lib/rag/astChunker.ts` | Add a JEPA-oriented AST serialization path. `astChunker.ts` currently uses TS compiler API for TS/JS and a Go binary for Go. Extend to produce a deterministic linearized AST token sequence suitable for UniXcoder input. | A `serializeAstForJepa(sourceCode, language)` function that produces a stable token sequence for all supported languages. |
| **web-tree-sitter WASM staging** | `public/` + new `lib/jepa/treeSitterLoader.ts` | Add `web-tree-sitter` npm package. Compile `tree-sitter.wasm` and language parsers to `public/tree-sitter/`. Build async loader that works in both Node.js (SSR) and browser contexts. | WASM files load successfully in a Vercel serverless function; AST can be parsed from a string in <50ms cold. |
| **MCTS for code search** | New `lib/ucol/mcts/codeSearchMcts.ts` | Build an MCTS tree-search loop for candidate code evaluation. The existing `MctsResolverNode.ts` is scoped to error resolution only and uses file-diff actions. A separate code-search MCTS must use AST-level actions and JEPA divergence as the rollout value function. | MCTS loop can expand and evaluate at least 3 candidate ASTs per selection cycle, using JEMA divergence or a stub scorer as the value function. |

### Stage 1: Pretrain & Validation

| Resource Requirements | Infra / Codebase Modifications | Primary Risk | Kill Criteria |
|---|---|---|---|
| Local GPU pod (RTX 4090); 50k+ execution traces from Stage 0. | Implement Sub-JEPA PyTorch training scripts. No production changes. | Encoder fails to map nested structures into Sub-JEPA subspace, causing representation collapse. | Epps-Pulley distance fails to converge below 0.05, or linear probing on latents fails to classify basic AST depths with >85% accuracy. |

### Stage 2: Warm-Start & WASM Deployment

| Resource Requirements | Infra / Codebase Modifications | Primary Risk | Kill Criteria |
|---|---|---|---|
| CI/CD pipeline for INT8 ONNX cross-compilation. | Migrate `runtimeBridge.ts` advisory path to `onnxruntime-web` + `web-tree-sitter`. Move `.wasm` artifacts to `public/`. | Combined WASM models exceed Vercel 250MB limit, or edge latency spikes from JIT compilation. | **WASM bundle unvalidated — this risk is unproven.** Concrete verification step: deploy a Next.js serverless function to Vercel staging that loads `onnxruntime-web` WASM and runs a forward pass on a 1MB dummy model. Measure uncompressed bundle size with `next build` and P95 cold-start latency with a load test. If uncompressed bundle exceeds 150MB or P95 WASM cold-start exceeds 600ms, the approach must be re-evaluated (e.g., external inference API, smaller model, or edge compute). |

### Stage 3: Online Refinement

| Resource Requirements | Infra / Codebase Modifications | Primary Risk | Kill Criteria |
|---|---|---|---|
| Vercel production compute; Upstash Redis for feature flags. | Activate MCTS code-search pruning logic. Install Epps-Pulley telemetry hooks. Link JEPA divergence scores to execution trace store. | JEPA predictor over-prunes valid LLM solutions, harming UX. | Sandbox pass-rate drops >2% vs syntactic baseline over 48-hour shadow period, or Vercel OOM errors triggered. |

**Important:** Stage 3 assumes the MCTS code-search substrate built in Stage 0. The current UCOL runtime does not implement MCTS for candidate code search — this is a prerequisite research item, not a future enhancement.

---

## 9. Distribution-Shift Mapping

### 9.1 Current State

The `DistributionShiftDetector` operates on `wm_query_fingerprints` rows in Supabase, each containing `{ session_id, domain, subdomain, keywords, timestamp, model_used }`. It computes per-domain JS divergence against a 30-day baseline and fires `KnowledgeStalenessEvent` records. This is a query-traffic monitoring system — it has no knowledge of code latents.

The `DeltaEngine` (`lib/world-model/delta/`) operates on claim-level auditing: it extracts claims from AI output text, looks them up in the knowledge graph, and produces `ClaimVerdict` / `delta_score` values. It is a truth-scoring layer for factual claims, not a code-semantic drift detector.

Neither module can be directly repurposed for JEPA latent drift.

### 9.2 Required Extension

A new `JEPALatentFingerprint` record type must be defined:

```typescript
interface JEPALatentFingerprint {
  traceId: string;
  sessionId: string;
  workspaceId: string;
  userId: string;
  latentHash: string;        // SHA256 of the JEPA encoder output vector
  latentNorm: number;        // L2 norm for distributional statistics
  subspaceProjections: number[]; // SIGReg subspace projection values (K dims)
  eppsPulleyStatistic: number;   // Distribution health metric
  domain: string;            // 'code' | 'test' | 'refactor' | etc.
  timestamp: string;
  modelId: string;           // UniXcoder variant used
}
```

These fingerprints are stored in a new `jepa_latent_fingerprints` Supabase table. A new `JEPADistributionShiftDetector` class (or extension of the existing `DistributionShiftDetector`) computes JS divergence on the per-domain distributions of `subspaceProjections` values, analogous to how the existing detector operates on query-domain proportions. The existing `DistributionShiftDetector` must not be modified to handle JEPA data — it should remain focused on query-traffic drift.

A latent fingerprint is emitted each time the JEPA encoder runs in the advisory path (i.e., on every candidate AST evaluation in `runtimeBridge.ts`), gated by the ENABLE_JEPA feature flag.

---

## 10. Open Questions and System Assumptions

1. **Optimal subspace count (K):** Sub-JEPA SIGReg requires determining the number of random orthogonal subspaces. If code dynamics occupy a higher-dimensional manifold than anticipated, projecting down may destroy critical structure. An offline PCA of the workspace codebase is required to calibrate this hyperparameter.

2. **Action manifold smoothness:** Mapping textual actions into the AdaLN-Zero conditioning space assumes a relatively smooth continuous manifold of operations. Highly discrete or disjointed user actions may fail to produce stable gradients.

3. **WASM memory fragmentation:** Running concurrent MCTS rollouts inside a single Vercel serverless function could exhaust the V8 heap. Load-testing WebAssembly memory allocation under Vercel is mandatory.

4. **AST extraction gap:** No general-purpose AST serialization module exists in `lib/`. `web-tree-sitter` must be integrated from scratch. The current `astChunker.ts` uses the TypeScript compiler API (not tree-sitter) and a Go binary for Go — neither is a general-purpose solution.

5. **Execution trace schema:** Quarantine promotion logs are filesystem artifacts (`{ sessionId, relativePath, digest, absPath }`), not structured `(s_x, action, s_y)` tuples. A new trace format and emission path from `sandboxManager.ts` is required before training data exists.

6. **MCTS for code search does not exist:** The current MCTS implementation (`MctsResolverNode.ts`) is scoped to error resolution using file-diff actions. A separate code-search MCTS with AST-level actions and JEPA-based value function must be designed and built from scratch.

7. **WASM deployment is unvalidated:** No `.wasm` files exist in `public/`. `onnxruntime-web` and `web-tree-sitter` are not installed. The 250MB Vercel limit and cold-start latency claims in the original spec are untested hypotheses that require the Stage 2 verification step before any further WASM-dependent work proceeds.

---

## 11. Non-Goals

- Training foundation models from scratch
- Pixel/image generation JEPA variants
- Replacing the current LLM provider routing layer
- Any paid external API or managed service
- Modifying `DistributionShiftDetector` or `DeltaEngine` to handle code latents (new modules instead)
- Conflating `OutputCritic` with quarantine promotion or JEPA training data emission

---

## 12. References

1. https://medium.com/@frinktyler1445/the-anatomy-of-jepa-the-architecture-behind-embedded-predictive-representation-learning-994bfa0bffe0
2. https://www.emergentmind.com/topics/code-world-models-cwms
3. https://huggingface.co/microsoft/unixcoder-base
4. https://www.researchgate.net/publication/361068902_UniXcoder_Unified_Cross-Modal_Pre-training_for_Code_Representation
5. https://arxiv.org/html/2603.19312v1
6. https://medium.com/@mohamed-aymen.bouyahia/lejepa-the-simple-new-ssl-framework-that-works-without-the-tricks-e25616c721cb
