# Lattice Intelligence — Model Plane v0.1 (Architecture RFC)

Status: PROPOSED / DOCUMENTATION ONLY. No model trained, weights released, endpoint deployed, feature flag enabled, or production routing changed by this RFC.
Date: 2026-11-22.
Owner: Lattice OS.
Related RFC: [Neural Memory Plane](./lattice-neural-memory-plane.md).

## Objective and scope

Own a reproducible model lifecycle for a Lattice-adapted language model, with a possible later from-scratch model research lane. The first product goal is not an unverified claim of superintelligence or 550B-scale parity. It is a measurable improvement in workspace-grounded reasoning, tool use, code-building, memory recall, latency, privacy and cost over the existing multi-provider baseline.

An adapter fine-tune produces Lattice-trained parameters on a third-party base model. It is not independent pretraining. An independently initialized foundation model requires its own tokenizer, corpus, architecture, optimizer, distributed compute and safety/evaluation pipeline and is a separately funded research project.

## Reference systems

- NVIDIA Nemotron 3 Ultra: 550B total/55B active parameters, hybrid Mamba/attention LatentMoE and multi-token prediction. The published model card lists multiple high-memory datacenter GPUs as its inference minimum, not a laptop training target. https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-NVFP4
- Nemotron training recipes: pretraining, supervised fine-tuning (SFT), reinforcement learning (RL) and evaluation; Nano is a more reasonable model-family reference than Ultra for early specialization. https://docs.nvidia.com/nemotron/latest/
- Small local baseline: Apache-2.0 Qwen3-1.7B, using its MLX-compatible weights on compatible Apple Silicon. Verify exact upstream license and model card before derivative distribution. https://huggingface.co/Qwen/Qwen3-1.7B-MLX-4bit
- Apple MLX LM: supports LoRA on quantized models on Apple Silicon. https://developer.apple.com/videos/play/wwdc2025/298/
- Hugging Face TRL/PEFT for CUDA LoRA/QLoRA: https://huggingface.co/docs/trl/peft_integration

Licenses are per checkpoint/dataset, not inherited from a product-family name. Record immutable license snapshots, attribution and training-data rights before any public release or teacher-model distillation.

## Existing Lattice OS attachment points (main branch audit)

- The UCOL decision/provider layer at lib/ucol/routing/providerResolver.ts already selects model/provider semantics.
- The stream-aware fallback at lib/llm/routing/fallbackRouter.ts and its circuit breaker already isolates recoverable provider outages.
- lib/context/sieve.ts implements protected context and a non-destructive shadow relevance projection.
- lib/memory/vectorStore.ts, lib/memory/embedding.ts and lib/ragMemory.ts handle existing scoped memory retrieval.
- research/world-model/ML_ARCHITECTURE.md documents an interpretable decision-tree inference layer. Preserve that independent auditable decision role; this RFC introduces a language-model training lane, not a silent replacement for evidence classifiers.
- docs/architecture/conversation-continuity-and-generation-coordinator.md defines the governed runtime bridge and specialist dispatch. Model ownership must not bypass tool grants, durable work queues or workspace authorization.

Code paths identify integration candidates, not proof that the target system is deployed.

## Plane topology

    User / Weaver session
      -> authenticated workspace and policy admission
      -> UCOL decision + budget + capability planner
      -> evidence/recall context packet from Neural Memory Plane
      -> model gateway and registry (per-user, per-workspace policy)
           -> Lattice primary candidate (shadow -> canary -> production)
           -> authorized specialist model/sub-agent
           -> preexisting fallback providers, respecting privacy constraints
      -> artifact/claim verification + user-approved mutations
      -> event journal, source citations and memory writeback

The model is a reasoning executor, not a source of authorization. An LLM cannot expand its own permissions, change workspace ownership, mint secrets, approve mutations, or bypass runtime fencing.

## Learning archetypes

An archetype is a versioned task specialization; initially implement with prompts, datasets, tools and evaluation profiles, then optionally separate LoRA adapters. No speculative brain/personality claims.

| Archetype | Training objectives | Measured outcomes |
| --- | --- | --- |
| Weaver-General | instruction fidelity, calibrated uncertainty, continuity | task completion, refusals/abstentions when warranted |
| Lattice-Code | repository navigation, patch/test loops | tests passed, patch success, regression rate |
| Lattice-Research | grounded synthesis and uncertainty | citation coverage, factual support, source errors |
| Lattice-Planning | bounded tool sequences and recovery | task success, unnecessary actions, cost/latency |
| Lattice-Memory-Curator | evidence-aligned extraction/compression | fact retention, correct attribution, temporal correctness |
| Lattice-Verifier | contradiction detection and evidence checks | precision/recall, false approvals, security regressions |

Use one base-model lineage with optional archetype adapters or separately routed specialists. Explicitly pin adapter version and tool policy in each run receipt. Per-user factual memory belongs in an access-controlled store, not in shared weight updates.

## Training lifecycle

1. Dataset governance: accept opt-in, legally usable samples; classify sensitive/private source data; deduplicate and scrub secrets; attach license, authorizations, source hashes and retention rules. Never default to training on all user conversations.
2. Evaluation-first: construct held-out tasks covering code, retrieval, long-range temporal recall, safety, tool correctness and citations. Prevent train/eval leakage by grouping at project/document/session level.
3. Baseline: run the same frozen tasks on the current UCOL route and the unmodified chosen base model, with matched context/budget.
4. SFT: train a LoRA/QLoRA adapter on licensed task demonstrations. On laptop, start with 0.5B–3B dense models, short sequences and small batches. Nemotron Ultra does not belong on this device lane.
5. Optional preference optimization and verifiable-reward RL only when outcome verifiers and reliable preference data exist. Do not deploy a live self-modifying gradient loop.
6. Evaluate and red-team: hallucinated memory, prompt injection, private-data exfiltration, tool misuse, cross-tenant retrieval, multilingual and regression suites; measure GPU-hours, per-request cost, p95 latency and failure modes.
7. Register immutable model artifacts: base commit/revision, adapter hash, tokenizer, data manifest, training recipe, seed, eval suite/version, hardware, license and signed promotion receipt.
8. Promote through shadow, limited canary and rollback-ready primary routing. Keep fallback and sub-agent semantics explicit and capability-compatible.

## Hardware and execution routes

- Apple Silicon MacBook Air: MLX LM for small quantized-base LoRA experiments and local inference; unified RAM, sequence length, fanless thermal limits and model support determine feasibility. Intel Mac lacks this Apple Silicon MLX path.
- CUDA workstation/cloud: TRL + PEFT/Axolotl or compatible NeMo training recipe on NVIDIA GPU(s), preferably beginning with a GPU sized for the chosen base model rather than renting an Ultra-scale cluster.
- Training jobs must run as authenticated budgeted jobs with immutable inputs and resumable checkpoints in restricted isolated compute. Production API routes must never perform training.
- GPU inference serving: vLLM or SGLang (subject to architecture compatibility), optionally NVIDIA NIM, behind a private authenticated OpenAI-compatible gateway. Validate tool calls, structured output, context limits, token counting and streaming; protocol similarity is not behavioral equivalence.
- Hosting: isolate model server from Vercel request handlers; private networking or authenticated gateway, request-level accounting, cold-start/health and rate limits. Existing Daytona/account VM runtimes are not automatically qualified as GPU-training clusters.

## Provider-routing policy

Model registry fields: model_id, base_revision, adapter_revision, architecture, model_type, modality, context_limit, supported_features, license_id, region, endpoint, authentication_mode, data_egress_class, health, cost, limits, evaluation_receipt and lifecycle_state.

Proposed model order when permitted: eligible Lattice primary -> compatible authorized specialists/fallback -> user-visible degraded response if all fail. Never send a local-only, customer-private or region-restricted task to an unapproved cloud fallback. Preserve streaming switch provenance, circuit breaker behavior and accounting for each hop.

No automatic replacement of currently serving models. A capability mismatch (vision, tool calls, required context, structured outputs) should select an eligible model rather than silently discard required features.

## Version-zero milestones and gates

M0: baseline benchmark + license/data inventory + training registry schema. Documentation and test data only; no production flags.
M1: laptop MLX LoRA proof for a 1B–3B model; save model manifest, adapter, reproducible metrics and failure cases.
M2: cloud CUDA reproduction and model serving gateway; isolate credentials and collect cost/performance evidence.
M3: train/evaluate archetype adapters against held-out tasks and the existing external providers. Promote only where there is demonstrable benefit.
M4: shadow route Lattice model without exposing output to customers; record eligibility/capability failures and regressions.
M5: opt-in canary with rollback, fixed token/cost budgets, specialist dispatch and operational on-call.
M6: separately scope independent architecture/pretraining research after funding, data and compute validation.

Proposed acceptance: 100% of model outputs are attributable to a model+adapter+prompt+context manifest; no cross-tenant data in seeded adversarial tests; zero unauthorized tool executions in the qualification suite; no statistically significant degradation in baseline critical workflows; cost and p95 latency remain within explicitly approved budgets. Task-quality thresholds should be frozen after baseline measurement rather than invented here.

## Current state / nonclaims

No local model has been trained as part of this RFC. No production serving endpoint, new model weights, self-learning mechanism, LoRA adapter, CUDA run or hardware qualification was created by this document. The branch is documentation-only.