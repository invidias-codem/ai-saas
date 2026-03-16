# Tech Genie — World Model ML Architecture
**Status:** Implemented  
**Author:** JKlaw (AI co-founder)  
**Date:** 2026-03-04  
**Layer:** ML Inference (sits on top of the Temporal Knowledge Graph)

---

## Overview

The World Model ML layer augments the knowledge graph with **trainable, interpretable inference**. Where the graph stores *what we know*, the ML layer learns *how to reason about it* — classifying claims, inferring causality, routing queries, and predicting future world states.

The key design decision: **decision trees over neural nets**. This isn't a compromise — it's deliberate.

---

## Why Decision Trees, Not Neural Networks?

| Criterion | Decision Trees | Neural Networks |
|---|---|---|
| **Interpretability** | ✅ Every decision is a traceable path | ❌ Black box |
| **Auditability** | ✅ Print the decision path | ❌ Attention weights ≠ explanations |
| **Inference speed** | ✅ ~microseconds (pure logic, no matrix ops) | ❌ Milliseconds to seconds |
| **GPU requirement** | ✅ None — runs anywhere | ❌ Expensive at scale |
| **Training data** | ✅ Works with 100s of examples | ❌ Typically needs 10k+ |
| **Online learning** | ✅ Retrain nightly on incremental data | ❌ Fine-tuning is expensive |
| **Overfitting risk** | ✅ Managed by pruning + ensembles | ❌ Complex regularization needed |
| **Deployment** | ✅ Serialize to JSON, load anywhere | ❌ Model weights are GBs |

**The core reason:** Tech Genie needs to explain *why* a claim is CONTRADICTED or *why* a query was routed to Claude. Decision trees give us that for free. A neural net cannot say "this claim was classified CONTRADICTED because `contradiction_count=0.7` and `source_confidence=0.3`." A decision tree always can.

**The strategic reason:** We are not trying to build a better LLM. We are building the *ground truth layer* that holds LLMs accountable. The ML layer here is for inference and routing, not for language understanding. The LLMs handle language. Our trees handle world-model reasoning.

---

## The CART Algorithm

All trees are built using **CART** (Classification and Regression Trees, Breiman et al. 1984).

### How a Tree Is Built

1. **Start with all training examples** at the root node.
2. **Find the best split**: iterate every feature, every candidate threshold (midpoints between adjacent values). Pick the split that minimizes weighted child impurity.
3. **Recurse** on the left and right subsets until a stopping criterion is met.
4. **Create a leaf node** with the majority class (or mean value for regression).

### Impurity Measures

**Gini impurity** (default for classification):
```
Gini(node) = 1 - Σ(p_i²)
```
Where `p_i` is the proportion of class `i` in the node.

A pure node (all one class) has Gini = 0. Perfectly mixed (equal proportions) approaches 0.5 for binary.

**Shannon entropy** (alternative for classification):
```
Entropy(node) = -Σ(p_i × log₂(p_i))
```
Entropy tends to produce more balanced trees. Use when class boundaries are less crisp.

**Mean Squared Error** (for regression):
```
MSE(node) = (1/n) × Σ(y_i - ȳ)²
```
Used for predicting continuous outputs (causal strength, cost score).

### Splitting Criterion

At each node, the algorithm selects the split `(feature, threshold)` that maximizes **information gain**:
```
Gain = Impurity(parent) - [|L|/|N| × Impurity(L) + |R|/|N| × Impurity(R)]
```

### Stopping Criteria

A node becomes a leaf when:
- All examples have the same label (pure node)
- `depth >= maxDepth` (prevents runaway depth)
- `|examples| < minSamplesSplit` (too few to split)
- Either child would have `< minSamplesLeaf` examples
- Best achievable gain < `minImpurityDecrease` (no useful split exists)

---

## How Random Forest Reduces Overfitting

A single decision tree memorizes training data (high variance). Random Forest fixes this with two randomization techniques:

### 1. Bootstrap Aggregation (Bagging)

Each tree is trained on a **bootstrap sample** — sampling `n` examples *with replacement* from the original dataset. On average, ~63% of examples appear in each bootstrap; the rest (37%) form the **out-of-bag (OOB)** set.

**Effect:** Each tree sees a slightly different dataset, so the trees disagree on noisy samples. Averaging their predictions cancels the noise.

### 2. Random Feature Subsets

At each split, only `sqrt(n_features)` randomly selected features are considered (not all features). This prevents highly predictive features from dominating every tree, forcing the forest to find diverse decision boundaries.

**Effect:** Decorrelates the trees. If trees are uncorrelated, their ensemble error approaches the Bayes error rate (irreducible noise floor).

### 3. Majority Voting (Classification)

Each tree casts one vote. The class with the most votes wins. Confidence = fraction of trees that voted for the winner.

### 4. OOB Error

Because each tree has an OOB set (training examples it never saw), we can evaluate the ensemble's error for free — no held-out validation set needed. OOB error ≈ cross-validation error for large forests.

### When to Use Random Forest vs Single Tree

| Use Case | Recommendation |
|---|---|
| Production inference | Random Forest (lower variance) |
| Interpretability audit | Single tree (easier to explain) |
| Cold start / bootstrapping | Single tree (trains faster on few examples) |
| High-stakes decisions | Random Forest + print path from most confident tree |

---

## Cold Start Strategy

**Problem:** The ML models start with zero training data. We can't classify claims or route queries with an untrained model.

**Solution: Rule-Based Fallback**

Every classifier has a `ruleBasedFallback()` method implementing hand-coded heuristics that mirror what the ML model will learn:

```
ClaimClassifier (cold start rules):
  contradiction_count > 0.3     → CONTRADICTED
  embedding_similarity > 0.7 AND temporal_validity = 0  → OUTDATED
  embedding_similarity > 0.7 AND speaker_match < 0.3    → MISATTRIBUTED
  similarity > 0.8 AND confidence > 0.7 AND supported   → CONFIRMED
  similarity > 0.5 AND confidence > 0.5                 → SUPPORTED
  else                                                   → UNVERIFIED
```

```
RoutingModel (cold start rules):
  requires_code > 0.7           → deepseek-chat
  requires_recency > 0.7        → gemini-flash
  requires_reasoning + pro tier → claude-sonnet
  else                          → highest historical truth score
```

**Threshold for switching to ML model: 100 labeled training examples.**

Below 100 examples, the tree is likely to overfit badly. Above 100, the tree starts to outperform the hand-coded rules on edge cases.

This is tracked via the `ml_training_stats` view:
```sql
SELECT model_name, pending_examples, ready_for_retrain
FROM ml_training_stats;
```

---

## Online Learning Loop

```
  AI Output
      ↓
  Claim Extraction
      ↓
  Claim Classifier (ML or rule-based)
      ↓
  Verdict + Confidence
      ↓
  Audit Log (ai_output_audit)
      ↓
  Training Example saved to ml_training_examples
  (label_source: 'auto_confirmed' or 'human_verified')
      ↓
  Nightly Retrain Job (cron: 02:00 UTC)
      ↓
  New model version saved to ml_models
      ↓
  ModelStore.load() picks up new version on next request
```

The system gets smarter with every audit. High-confidence auto-confirmed verdicts (`confidence > 0.9`) are automatically added as training examples. Human reviewers can also flag verdicts for review, creating `human_verified` examples with higher weight.

### Nightly Retrain Logic

```typescript
// Pseudocode for nightly retrain
const examples = await ModelStore.fetchTrainingExamples('claim_classifier', 1000)
if (examples.length >= 100) {
  const trainingSet = examples.map(e => ({ features: e.features, label: e.label, weight: e.confidence }))
  const model = RandomForest.train(trainingSet, {
    nEstimators: 100,
    maxDepth: 8,
    criterion: 'gini',
    oobEvaluate: true,
  })
  await ModelStore.save('claim_classifier', model, {
    name: 'claim_classifier',
    version: new Date().toISOString(),
    modelType: 'random_forest',
    trainedAt: new Date().toISOString(),
    accuracy: 1 - RandomForest.oobError(model),
    featureNames: model.metadata.featureNames,
    classNames: model.metadata.classNames,
    sampleCount: examples.length,
  })
  await ModelStore.markExamplesUsed('claim_classifier')
}
```

---

## Feature Engineering Pipeline

### ClaimClassifier Features

| Feature | Source | Normalization |
|---|---|---|
| `embedding_similarity` | cosine(claim_embedding, best_node_embedding) | 0–1 |
| `source_confidence` | knowledge_node.confidence | 0–1 |
| `source_age_days` | (now - valid_from) / 365 | 0–1 (1yr+) |
| `source_type_score` | verified=1.0, user=0.7, inferred=0.5, external=0.6 | 0–1 |
| `speaker_match` | presence of ASSERTED_BY edge | 0 or 0.5 or 1.0 |
| `temporal_validity` | valid_until=null → 1.0, expired → 0.0 | 0 or 1 |
| `contradiction_count` | log1p(CONTRADICTS edges) / log1p(10) | 0–1 |
| `support_count` | log1p(SUPPORTS edges) / log1p(10) | 0–1 |
| `causal_distance` | BFS to nearest verified node / 10 | 0–1 |
| `domain_hallucination_rate` | model_truth_scores[model][domain] | 0–1 |

**Why log normalization for counts?** Edge counts are extremely right-skewed — most claims have 0–2 edges, but some heavily-referenced nodes have hundreds. Log normalization compresses the scale without losing signal.

### RoutingModel Features

| Feature | Source | Notes |
|---|---|---|
| `query_domain` | Domain classifier (keyword rules → 0.0–1.0) | Ordinal encoding |
| `query_complexity` | Token count + clause depth + technical term density | Weighted sum |
| `requires_recency` | Regex for temporal keywords | Binary |
| `requires_reasoning` | Regex for logical operators | Binary |
| `requires_code` | Regex for programming terms | Binary |
| `historical_truth_score_*` | model_truth_scores view | Per model per domain |
| `context_size` | total characters / 8000 | 0–1 |
| `user_tier` | free=0, pro=1 | Binary |

### CausalInference Features

| Feature | Source | Notes |
|---|---|---|
| `temporal_gap_hours` | target.valid_from - source.valid_from | Normalized to 0–1 (1yr) |
| `co_occurrence_count` | Edge count between nodes / 5 | Normalized |
| `domain_match` | source.type == target.type | 1.0 or 0.3 |
| `prior_causal_strength` | Existing CAUSES edge strength | 0–1 |
| `intervention_present` | User-source node in causal path | Binary |
| `contradiction_count` | CONTRADICTS edges near pair | Normalized |
| `base_rate` | Mean confidence of CAUSES edges in graph | 0–1 |

### SimulationPredictor Features

| Feature | Source | Notes |
|---|---|---|
| `current_metric_values[10]` | world_state.attributes (flattened) | Normalized 0–1 per metric |
| `action_type_encoded[9]` | One-hot action category | Sparse binary vector |
| `historical_similar_actions` | Avg outcome of similar past actions | 0–1 |
| `causal_chain_strength` | Mean confidence of active_edges | 0–1 |
| `time_horizon_days` | HORIZON_DAYS[horizon] / 365 | 0–1 |
| `market_conditions` | External grounding feed composite | 0–1 |
| `domain_volatility` | Historical attribute variance | 0–1 |

**Note:** The simulation predictor uses a flat feature vector by flattening the metric array and one-hot vector. This allows the CART algorithm to treat each dimension as a separate feature.

---

## Model Versioning Strategy

### Version Format

```
{ISO_TIMESTAMP}   →   2026-03-04T09:00:00.000Z   (default: timestamp of training run)
{SEMVER}          →   v1.0.0                      (explicit human-assigned version)
```

Timestamp versioning is automatic — every nightly retrain produces a new version. Semver versions are manually assigned for milestone releases.

### Version Lifecycle

```
pending → staging → production → deprecated → archived
```

The `ModelStore.load(name)` call (without version) always returns the **latest trained_at** version. To pin a specific version, pass it explicitly: `ModelStore.load('claim_classifier', 'v1.0.0')`.

### Rollback

If a new model version degrades performance (OOB error increases by > 5%), the nightly job should rollback:

```typescript
const versions = await ModelStore.listVersions('claim_classifier')
const previousVersion = versions[1]  // Index 0 is newest, 1 is previous
const stable = await ModelStore.load('claim_classifier', previousVersion.version)
```

### Model Registry

The `ml_model_registry` view in Supabase provides a lightweight dashboard of all stored models, their versions, and performance metrics — without fetching the heavy `serialized_model` JSON.

---

## File Map

```
lib/world-model/ml/
├── types.ts                  # ML-specific types (trees, features, inference)
├── DecisionTreeEngine.ts     # CART implementation — train/predict/prune/serialize
├── RandomForest.ts           # Bootstrap aggregation ensemble
├── ClaimClassifier.ts        # Claim verdict classification against graph
├── CausalInference.ts        # Causal edge strength and type inference
├── RoutingModel.ts           # UCOL query routing with online learning
├── SimulationPredictor.ts    # World state prediction for simulation layer
└── ModelStore.ts             # Supabase persistence for serialized models

supabase/migrations/
└── 20260304_ml_models_schema.sql   # ml_models + ml_training_examples tables

research/world-model/
├── ARCHITECTURE.md            # High-level world model vision (LeCun-inspired)
└── ML_ARCHITECTURE.md         # This document — ML layer design decisions
```

---

## Performance Characteristics

| Operation | Typical Time | Notes |
|---|---|---|
| Single tree inference | ~0.1ms | Pure JS, no I/O |
| Random Forest (100 trees) | ~5–15ms | Parallelizable in future |
| Feature extraction | ~5–50ms | Depends on graph query I/O |
| Model load from Supabase | ~50–200ms | One-time at server start |
| Nightly retrain (100 examples) | ~1–5 seconds | Acceptable for background job |
| Nightly retrain (10k examples) | ~30–120 seconds | Still acceptable |

All inference is synchronous and CPU-only. No GPU needed. Models load once at server startup and are held in memory — subsequent requests pay only the ~5–15ms tree traversal cost.

---

## Future Directions

1. **Gradient Boosted Trees (GBT):** Sequential ensemble where each tree corrects the errors of the previous. Higher accuracy than Random Forest but slower to train. The `EnsembleModel` type already supports `gradient_boosted` — implement the sequential training loop when data is plentiful.

2. **Online learning without nightly batch:** Update leaf statistics incrementally (Hoeffding Trees / Very Fast Decision Trees) for sub-second learning from every audit result.

3. **Feature importance → graph annotation:** Feed feature importances back into the graph as edge weights. If `embedding_similarity` is consistently the most important feature for CONFIRMED verdicts, increase the weight of embedding-based matching in graph queries.

4. **Multi-output trees:** Predict both `verdict` and `delta_score` from the same tree (classification + regression simultaneously), sharing the decision path for both outputs.

5. **Uncertainty quantification:** Use OOB variance across trees as a calibrated confidence estimate (currently using raw probability — may be overconfident).

---

## References

- Breiman, L., Friedman, J., Olshen, R., Stone, C. (1984). *Classification and Regression Trees.* Wadsworth.
- Breiman, L. (2001). *Random Forests.* Machine Learning, 45(1), 5–32.
- LeCun, Y. (2022). *A Path Towards Autonomous Machine Intelligence.* OpenReview.
- Domingos, P., Hulten, G. (2000). *Mining High-Speed Data Streams.* KDD. (Hoeffding Trees)
- Tech Genie World Model Architecture: `research/world-model/ARCHITECTURE.md`
