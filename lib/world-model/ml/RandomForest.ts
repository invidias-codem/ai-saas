/**
 * RandomForest — Ensemble of CART Decision Trees
 * Tech Genie / World Model ML Layer
 *
 * Implements the Random Forest algorithm:
 *   - Bootstrap sampling: each tree trains on a random sample (with replacement)
 *   - Random feature subsets: at each split, only a subset of features is considered
 *   - Aggregation: majority vote (classification) or mean (regression)
 *   - OOB error: free validation using samples excluded from each tree's bootstrap
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import { DecisionTreeEngine } from './DecisionTreeEngine'
import type {
  EnsembleModel,
  TrainingExample,
  RandomForestOptions,
  FeatureVector,
  InferenceResult,
  DecisionTree,
  DecisionPathStep,
} from './types'

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/** Simple seedable PRNG (same as DecisionTreeEngine but standalone) */
class RNG {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  next(): number {
    this.s = Math.imul(this.s ^ (this.s >>> 16), 0x45d9f3b)
    this.s = Math.imul(this.s ^ (this.s >>> 16), 0x45d9f3b)
    this.s = (this.s ^ (this.s >>> 16)) >>> 0
    return this.s / 0x100000000
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max)
  }
}

/**
 * Draw a bootstrap sample (with replacement) from examples.
 * Returns { bootstrapIndices, oobIndices }.
 */
function bootstrapSample(
  n: number,
  rng: RNG
): { bootstrapIndices: number[]; oobIndices: number[] } {
  const sampled = new Set<number>()
  const bootstrapIndices: number[] = []

  for (let i = 0; i < n; i++) {
    const idx = rng.nextInt(n)
    bootstrapIndices.push(idx)
    sampled.add(idx)
  }

  const oobIndices: number[] = []
  for (let i = 0; i < n; i++) {
    if (!sampled.has(i)) oobIndices.push(i)
  }

  return { bootstrapIndices, oobIndices }
}

/**
 * Aggregate classification predictions via majority vote.
 * Returns predicted class and full probability distribution.
 */
function majorityVote(
  predictions: Array<{ label: string; probabilities: Record<string, number> }>,
  classNames: string[]
): { label: string; probabilities: Record<string, number> } {
  // Average probabilities across trees
  const sumProbs: Record<string, number> = {}
  for (const cls of classNames) sumProbs[cls] = 0

  for (const pred of predictions) {
    for (const cls of classNames) {
      sumProbs[cls] += pred.probabilities[cls] ?? 0
    }
  }

  const avgProbs: Record<string, number> = {}
  let bestLabel = classNames[0]
  let bestProb = -1

  for (const cls of classNames) {
    const avg = sumProbs[cls] / predictions.length
    avgProbs[cls] = avg
    if (avg > bestProb) {
      bestProb = avg
      bestLabel = cls
    }
  }

  return { label: bestLabel, probabilities: avgProbs }
}

/**
 * Aggregate regression predictions via mean.
 */
function meanPrediction(
  predictions: Array<{ label: string }>,
): { label: string; probabilities: Record<string, number> } {
  const values = predictions.map(p => Number(p.label))
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  return { label: String(avg), probabilities: { value: avg } }
}

/**
 * Compute normalized feature importances across an ensemble.
 * Each tree's importances are averaged.
 */
function ensembleFeatureImportances(
  trees: DecisionTree[],
): Record<string, number> {
  const sums: Record<string, number> = {}

  for (const tree of trees) {
    const imp = DecisionTreeEngine.featureImportances(tree)
    for (const [feature, value] of Object.entries(imp)) {
      sums[feature] = (sums[feature] ?? 0) + value
    }
  }

  const total = Object.values(sums).reduce((s, v) => s + v, 0)
  if (total === 0) return sums

  const result: Record<string, number> = {}
  for (const [k, v] of Object.entries(sums)) {
    result[k] = v / trees.length  // average (not normalized sum)
  }

  // Normalize to sum to 1
  const resultTotal = Object.values(result).reduce((s, v) => s + v, 0)
  if (resultTotal > 0) {
    for (const k of Object.keys(result)) result[k] /= resultTotal
  }

  return result
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Random Forest ensemble.
 * Trains nEstimators decision trees with bootstrap sampling and random feature subsets.
 * Aggregates predictions via majority vote (classification) or mean (regression).
 */
export class RandomForest {
  /**
   * Train a Random Forest ensemble.
   *
   * @param examples - Labeled training examples
   * @param options  - Ensemble hyperparameters
   * @returns A fully trained, serializable EnsembleModel
   */
  static train(examples: TrainingExample[], options: RandomForestOptions = {}): EnsembleModel {
    if (examples.length === 0) {
      throw new Error('RandomForest.train: no training examples provided')
    }

    const nEstimators = options.nEstimators ?? 100
    const bootstrap = options.bootstrap ?? true
    const seed = options.seed ?? Date.now()
    const rng = new RNG(seed)

    const featureNames = options.featureNames ?? Object.keys(examples[0].features)
    const allLabels = examples.map(e => e.label)
    const classNames = options.classNames ?? Array.from(new Set(allLabels)).sort()
    const criterion = options.criterion ?? 'gini'
    const taskType = criterion === 'mse' ? 'regression' : 'classification'

    const trees: DecisionTree[] = []
    // Map treeIndex → oobIndices for OOB error computation
    const treeOobIndices: number[][] = []

    for (let t = 0; t < nEstimators; t++) {
      let trainingExamples: TrainingExample[]
      let oobIndices: number[] = []
      let bootstrapIndices: number[] = []

      if (bootstrap) {
        const sample = bootstrapSample(examples.length, rng)
        bootstrapIndices = sample.bootstrapIndices
        oobIndices = sample.oobIndices
        trainingExamples = bootstrapIndices.map(i => examples[i])
      } else {
        trainingExamples = examples
        bootstrapIndices = Array.from({ length: examples.length }, (_, i) => i)
      }

      const tree = DecisionTreeEngine.train(trainingExamples, {
        maxDepth: options.maxDepth,
        minSamplesSplit: options.minSamplesSplit,
        minSamplesLeaf: options.minSamplesLeaf,
        maxFeatures: options.maxFeatures,
        criterion,
        seed: rng.nextInt(0x7fffffff),
        featureNames,
        classNames,
      })

      // Store bootstrap indices in tree for OOB lookup
      tree.bootstrapIndices = bootstrapIndices
      trees.push(tree)
      treeOobIndices.push(oobIndices)
    }

    const ensemble: EnsembleModel = {
      id: `rf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ensembleType: 'random_forest',
      trees,
      featureNames,
      classNames,
      taskType,
      trainingOptions: options,
      trainedAt: new Date().toISOString(),
      trainingSamples: examples.length,
    }

    // Compute OOB error
    if (bootstrap) {
      ensemble.oobError = RandomForest.oobError(ensemble, examples, treeOobIndices)
    }

    return ensemble
  }

  /**
   * Predict the class (or regression value) for a single feature vector.
   * Uses majority vote across all trees.
   *
   * @param model    - Trained ensemble model
   * @param features - Feature vector for a single sample
   * @returns Inference result with aggregated probabilities and decision path
   */
  static predict(model: EnsembleModel, features: FeatureVector): InferenceResult {
    const treePredictions: Array<{
      label: string
      probabilities: Record<string, number>
      path: DecisionPathStep[]
    }> = []

    for (const tree of model.trees) {
      const result = DecisionTreeEngine.predict(tree, features)
      treePredictions.push({
        label: result.predictedClass,
        probabilities: result.probabilities,
        path: result.decisionPath,
      })
    }

    const aggregate =
      model.taskType === 'classification'
        ? majorityVote(treePredictions, model.classNames)
        : meanPrediction(treePredictions)

    const confidence = model.taskType === 'classification'
      ? aggregate.probabilities[aggregate.label] ?? 0
      : 1 - (model.oobError ?? 0)

    // Use the decision path from the most "representative" tree
    // (the one whose prediction matches the ensemble's final prediction)
    const representativePath = treePredictions.find(p => p.label === aggregate.label)?.path ?? []

    const importances = RandomForest.featureImportances(model)

    // Count tree consensus
    const consensusCount = treePredictions.filter(p => p.label === aggregate.label).length

    return {
      predictedClass: aggregate.label,
      confidence,
      probabilities: aggregate.probabilities,
      decisionPath: representativePath,
      featureImportances: importances,
      treeConsensus: consensusCount,
      totalTrees: model.trees.length,
    }
  }

  /**
   * Compute the Out-of-Bag (OOB) error rate.
   * For each training example, predict using only trees that did NOT train on it.
   * OOB error is a free, unbiased generalization estimate.
   *
   * @param model           - Trained ensemble
   * @param examples        - Original training examples (in original order)
   * @param treeOobIndices  - Per-tree OOB indices (produced during training)
   * @returns OOB error rate [0, 1] (lower is better)
   */
  static oobError(
    model: EnsembleModel,
    examples?: TrainingExample[],
    treeOobIndices?: number[][]
  ): number {
    // If called post-hoc without examples, return cached value
    if (!examples || !treeOobIndices) {
      return model.oobError ?? 0
    }

    const n = examples.length
    // For each sample: accumulate predictions from trees that didn't see it
    const samplePredictions: Array<Array<{ label: string; probabilities: Record<string, number> }>> =
      Array.from({ length: n }, () => [])

    for (let t = 0; t < model.trees.length; t++) {
      const oobIdx = treeOobIndices[t]
      for (const idx of oobIdx) {
        const result = DecisionTreeEngine.predict(model.trees[t], examples[idx].features)
        samplePredictions[idx].push({
          label: result.predictedClass,
          probabilities: result.probabilities,
        })
      }
    }

    // Compute error on samples that have OOB predictions
    let errors = 0
    let evaluated = 0

    for (let i = 0; i < n; i++) {
      if (samplePredictions[i].length === 0) continue
      evaluated++

      if (model.taskType === 'classification') {
        const agg = majorityVote(samplePredictions[i], model.classNames)
        if (agg.label !== examples[i].label) errors++
      } else {
        const vals = samplePredictions[i].map(p => Number(p.label))
        const pred = vals.reduce((s, v) => s + v, 0) / vals.length
        const actual = Number(examples[i].label)
        errors += Math.abs(pred - actual)  // MAE for regression
      }
    }

    return evaluated > 0 ? errors / evaluated : 0
  }

  /**
   * Compute aggregated, normalized feature importances across the entire forest.
   *
   * @param model - Trained ensemble model
   * @returns Record mapping feature name to importance [0, 1]
   */
  static featureImportances(model: EnsembleModel): Record<string, number> {
    return ensembleFeatureImportances(model.trees)
  }

  /**
   * Serialize an ensemble model to a JSON string.
   *
   * @param model - Ensemble model to serialize
   * @returns JSON string
   */
  static serialize(model: EnsembleModel): string {
    return JSON.stringify(model)
  }

  /**
   * Deserialize an ensemble model from a JSON string.
   *
   * @param json - JSON string produced by serialize()
   * @returns Reconstructed EnsembleModel
   */
  static deserialize(json: string): EnsembleModel {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null || !('trees' in parsed)) {
      throw new Error('RandomForest.deserialize: invalid ensemble JSON')
    }
    return parsed as EnsembleModel
  }
}
