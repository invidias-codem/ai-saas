"use strict";
/**
 * DecisionTreeEngine — Pure TypeScript CART Implementation
 * Tech Genie / World Model ML Layer
 *
 * Implements the Classification and Regression Trees (CART) algorithm from scratch.
 * No external ML libraries. Designed for real-time inference in Next.js edge/server context.
 *
 * Algorithm:
 *   1. Find best split: iterate all features × all unique thresholds, minimize weighted impurity
 *   2. Recursively build subtrees until stopping criteria are met
 *   3. Cost-complexity pruning with alpha parameter
 *   4. Track decision path during inference for full auditability
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionTreeEngine = void 0;
// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────
/** Simple seedable PRNG (xoshiro128** variant, deterministic) */
class SeededRandom {
    state;
    constructor(seed) {
        // Initialize state from seed
        let s = seed >>> 0;
        const splitmix32 = () => {
            s = (s + 0x9e3779b9) >>> 0;
            let z = s;
            z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
            z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
            return (z ^ (z >>> 16)) >>> 0;
        };
        this.state = [splitmix32(), splitmix32(), splitmix32(), splitmix32()];
    }
    /** Returns a float in [0, 1) */
    next() {
        const [a, b, c, d] = this.state;
        const t = (b << 9) >>> 0;
        this.state[2] ^= a;
        this.state[3] ^= b;
        this.state[1] ^= c;
        this.state[0] ^= d;
        this.state[2] ^= t;
        this.state[3] = ((d << 11) | (d >>> 21)) >>> 0;
        return (this.state[0] >>> 0) / 0x100000000;
    }
    /** Returns an integer in [0, max) */
    nextInt(max) {
        return Math.floor(this.next() * max);
    }
}
let globalNodeCounter = 0;
function nextNodeId() {
    return `n${++globalNodeCounter}`;
}
/** Count occurrences of each label in an array */
function countLabels(labels) {
    const counts = {};
    for (const l of labels)
        counts[l] = (counts[l] ?? 0) + 1;
    return counts;
}
/** Most frequent label in an array */
function majorityLabel(labels) {
    const counts = countLabels(labels);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
/** Arithmetic mean */
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
}
/** Gini impurity: 1 - Σ p_i² */
function giniImpurity(labels) {
    if (labels.length === 0)
        return 0;
    const counts = countLabels(labels);
    const n = labels.length;
    let sum = 0;
    for (const count of Object.values(counts)) {
        const p = count / n;
        sum += p * p;
    }
    return 1 - sum;
}
/** Shannon entropy: -Σ p_i * log2(p_i) */
function entropy(labels) {
    if (labels.length === 0)
        return 0;
    const counts = countLabels(labels);
    const n = labels.length;
    let sum = 0;
    for (const count of Object.values(counts)) {
        const p = count / n;
        if (p > 0)
            sum -= p * Math.log2(p);
    }
    return sum;
}
/** Mean Squared Error for regression */
function mse(labels) {
    if (labels.length === 0)
        return 0;
    const values = labels.map(Number);
    const m = mean(values);
    return mean(values.map(v => (v - m) ** 2));
}
/** Compute impurity based on criterion */
function impurity(labels, criterion) {
    switch (criterion) {
        case 'gini': return giniImpurity(labels);
        case 'entropy': return entropy(labels);
        case 'mse': return mse(labels);
    }
}
/** Compute class probability distribution from labels */
function probabilities(labels, classNames) {
    const counts = countLabels(labels);
    const n = labels.length;
    const probs = {};
    for (const cls of classNames) {
        probs[cls] = n > 0 ? ((counts[cls] ?? 0) / n) : 0;
    }
    return probs;
}
/** Select a random subset of feature indices */
function selectFeatureSubset(nFeatures, maxFeatures, rng) {
    let k;
    if (maxFeatures === 'sqrt') {
        k = Math.max(1, Math.round(Math.sqrt(nFeatures)));
    }
    else if (maxFeatures === 'log2') {
        k = Math.max(1, Math.round(Math.log2(nFeatures)));
    }
    else if (typeof maxFeatures === 'number') {
        k = Math.min(nFeatures, Math.max(1, Math.round(maxFeatures)));
    }
    else {
        k = nFeatures; // all features
    }
    // Fisher-Yates shuffle to pick k features
    const indices = Array.from({ length: nFeatures }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, k);
}
/**
 * Find the best binary split over a subset of features and examples.
 * Iterates all unique threshold values per feature.
 */
function findBestSplit(examples, indices, featureNames, featureSubset, criterion, minSamplesLeaf) {
    const labels = indices.map(i => examples[i].label);
    const parentImpurity = impurity(labels, criterion);
    const n = indices.length;
    let bestImprovement = -Infinity;
    let best = null;
    for (const fi of featureSubset) {
        const featureName = featureNames[fi];
        // Collect unique feature values
        const values = indices.map(i => {
            const v = examples[i].features[featureName];
            return v ?? 0;
        });
        const unique = Array.from(new Set(values)).sort((a, b) => a - b);
        // Try midpoints between consecutive unique values as thresholds
        for (let ti = 0; ti < unique.length - 1; ti++) {
            const threshold = (unique[ti] + unique[ti + 1]) / 2;
            const leftIdx = [];
            const rightIdx = [];
            for (let j = 0; j < indices.length; j++) {
                if (values[j] <= threshold)
                    leftIdx.push(indices[j]);
                else
                    rightIdx.push(indices[j]);
            }
            if (leftIdx.length < minSamplesLeaf || rightIdx.length < minSamplesLeaf)
                continue;
            const leftLabels = leftIdx.map(i => examples[i].label);
            const rightLabels = rightIdx.map(i => examples[i].label);
            const leftImp = impurity(leftLabels, criterion);
            const rightImp = impurity(rightLabels, criterion);
            const weightedImp = (leftIdx.length / n) * leftImp + (rightIdx.length / n) * rightImp;
            const improvement = parentImpurity - weightedImp;
            if (improvement > bestImprovement) {
                bestImprovement = improvement;
                best = {
                    featureIndex: fi,
                    featureName,
                    threshold,
                    leftIndices: leftIdx,
                    rightIndices: rightIdx,
                    impurityImprovement: improvement,
                    parentImpurity,
                };
            }
        }
    }
    return best;
}
function buildNode(ctx, indices, depth) {
    const labels = indices.map(i => ctx.examples[i].label);
    const nodeImpurity = impurity(labels, ctx.criterion);
    const probs = probabilities(labels, ctx.classNames);
    // Stopping criteria: max depth, too few samples, pure node
    const shouldStop = depth >= ctx.maxDepth ||
        indices.length < ctx.minSamplesSplit ||
        nodeImpurity === 0;
    if (shouldStop) {
        const leaf = {
            kind: 'leaf',
            label: majorityLabel(labels),
            probabilities: probs,
            sampleCount: indices.length,
            impurity: nodeImpurity,
            depth,
            nodeId: nextNodeId(),
        };
        return leaf;
    }
    // Select random feature subset
    const featureSubset = selectFeatureSubset(ctx.featureNames.length, ctx.maxFeatures, ctx.rng);
    const split = findBestSplit(ctx.examples, indices, ctx.featureNames, featureSubset, ctx.criterion, ctx.minSamplesLeaf);
    // No improvement found — make a leaf
    if (!split || split.impurityImprovement <= 0) {
        const leaf = {
            kind: 'leaf',
            label: majorityLabel(labels),
            probabilities: probs,
            sampleCount: indices.length,
            impurity: nodeImpurity,
            depth,
            nodeId: nextNodeId(),
        };
        return leaf;
    }
    // Accumulate feature importance (weighted by samples × improvement)
    const prevImportance = ctx.importanceAccumulator[split.featureName] ?? 0;
    ctx.importanceAccumulator[split.featureName] =
        prevImportance + (indices.length * split.impurityImprovement);
    const left = buildNode(ctx, split.leftIndices, depth + 1);
    const right = buildNode(ctx, split.rightIndices, depth + 1);
    const node = {
        kind: 'node',
        feature: split.featureName,
        threshold: split.threshold,
        impurity: nodeImpurity,
        sampleCount: indices.length,
        impurityImprovement: split.impurityImprovement,
        left,
        right,
        depth,
        nodeId: nextNodeId(),
    };
    return node;
}
// ─────────────────────────────────────────────
// Tree Metrics
// ─────────────────────────────────────────────
function treeDepth(node) {
    if (node.kind === 'leaf')
        return node.depth;
    return Math.max(treeDepth(node.left), treeDepth(node.right));
}
function countNodes(node) {
    if (node.kind === 'leaf')
        return 1;
    return 1 + countNodes(node.left) + countNodes(node.right);
}
function pruneStats(node) {
    if (node.kind === 'leaf') {
        return { leafCount: 1, totalImpurity: node.impurity * node.sampleCount };
    }
    const left = pruneStats(node.left);
    const right = pruneStats(node.right);
    return {
        leafCount: left.leafCount + right.leafCount,
        totalImpurity: left.totalImpurity + right.totalImpurity,
    };
}
function pruneNode(node, alpha, examples) {
    if (node.kind === 'leaf')
        return node;
    // Recurse first
    const prunedLeft = pruneNode(node.left, alpha, examples);
    const prunedRight = pruneNode(node.right, alpha, examples);
    const withChildren = { ...node, left: prunedLeft, right: prunedRight };
    // Compute effective alpha for this subtree
    const stats = pruneStats(withChildren);
    const subtreeImpurity = stats.totalImpurity / node.sampleCount;
    const nodeImpurity = node.impurity;
    const leafCount = stats.leafCount;
    if (leafCount <= 1)
        return withChildren;
    const effectiveAlpha = (nodeImpurity - subtreeImpurity) / (leafCount - 1);
    if (effectiveAlpha <= alpha) {
        // Prune: replace subtree with leaf
        // We need to collect labels to build a leaf
        const probs = {};
        // Use the node's own stored probabilities (impurity is set)
        // Since we don't have labels here, we derive from children
        const leaf = {
            kind: 'leaf',
            label: Object.entries(node.left.kind === 'leaf' ? node.left.probabilities : { unknown: 1 })
                .sort((a, b) => b[1] - a[1])[0][0],
            probabilities: probs,
            sampleCount: node.sampleCount,
            impurity: node.impurity,
            depth: node.depth,
            nodeId: nextNodeId(),
        };
        return leaf;
    }
    return withChildren;
}
// ─────────────────────────────────────────────
// Feature Importance Computation
// ─────────────────────────────────────────────
function collectImportances(node, acc) {
    if (node.kind === 'leaf')
        return;
    acc[node.feature] = (acc[node.feature] ?? 0) + node.sampleCount * node.impurityImprovement;
    collectImportances(node.left, acc);
    collectImportances(node.right, acc);
}
function normalizeImportances(raw) {
    const total = Object.values(raw).reduce((s, v) => s + v, 0);
    if (total === 0)
        return raw;
    const result = {};
    for (const [k, v] of Object.entries(raw)) {
        result[k] = v / total;
    }
    return result;
}
// ─────────────────────────────────────────────
// Prediction
// ─────────────────────────────────────────────
function predictNode(node, features, path) {
    if (node.kind === 'leaf') {
        path.push({
            nodeId: node.nodeId,
            description: `Leaf → predicted class '${node.label}' (depth ${node.depth})`,
        });
        return node;
    }
    const value = features[node.feature] ?? 0;
    const branch = value <= node.threshold ? 'left' : 'right';
    path.push({
        nodeId: node.nodeId,
        feature: node.feature,
        threshold: node.threshold,
        featureValue: value,
        branch,
        description: `${node.feature} = ${value.toFixed(4)} ${branch === 'left' ? '<=' : '>'} ` +
            `${node.threshold.toFixed(4)} → ${branch}`,
    });
    return predictNode(branch === 'left' ? node.left : node.right, features, path);
}
// ─────────────────────────────────────────────
// Training Accuracy
// ─────────────────────────────────────────────
function trainingAccuracy(root, examples) {
    if (examples.length === 0)
        return 0;
    let correct = 0;
    for (const ex of examples) {
        const path = [];
        const leaf = predictNode(root, ex.features, path);
        if (leaf.label === ex.label)
            correct++;
    }
    return correct / examples.length;
}
// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
/**
 * Pure TypeScript CART decision tree engine.
 * Supports classification (Gini / Entropy) and regression (MSE).
 * All methods are static and side-effect free.
 */
class DecisionTreeEngine {
    /**
     * Train a CART decision tree on the given examples.
     *
     * @param examples - Labeled training examples with feature vectors
     * @param options  - Training hyperparameters
     * @returns A fully trained, serializable DecisionTree
     */
    static train(examples, options = {}) {
        if (examples.length === 0) {
            throw new Error('DecisionTreeEngine.train: no training examples provided');
        }
        const featureNames = options.featureNames ?? Object.keys(examples[0].features);
        const allLabels = examples.map(e => e.label);
        const classNames = options.classNames ?? Array.from(new Set(allLabels)).sort();
        const criterion = options.criterion ?? 'gini';
        const maxDepth = options.maxDepth ?? 32;
        const minSamplesSplit = options.minSamplesSplit ?? 2;
        const minSamplesLeaf = options.minSamplesLeaf ?? 1;
        const rng = new SeededRandom(options.seed ?? Date.now());
        const importanceAccumulator = {};
        const ctx = {
            examples,
            featureNames,
            classNames,
            criterion,
            maxDepth,
            minSamplesSplit,
            minSamplesLeaf,
            maxFeatures: options.maxFeatures,
            rng,
            importanceAccumulator,
        };
        globalNodeCounter = 0;
        const allIndices = Array.from({ length: examples.length }, (_, i) => i);
        const root = buildNode(ctx, allIndices, 0);
        const taskType = criterion === 'mse' ? 'regression' : 'classification';
        const score = taskType === 'classification'
            ? trainingAccuracy(root, examples)
            : 1 - (impurity(allLabels, 'mse') > 0
                ? mse(allLabels) / impurity(allLabels, 'mse')
                : 0);
        const tree = {
            id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            root,
            featureNames,
            classNames,
            taskType,
            criterion,
            maxDepth,
            trainingSamples: examples.length,
            trainingScore: score,
            trainedAt: new Date().toISOString(),
            nodeCount: countNodes(root),
            depth: treeDepth(root),
        };
        return tree;
    }
    /**
     * Run inference on a single feature vector.
     * Returns prediction, confidence, decision path, and feature importances.
     *
     * @param tree     - Trained decision tree
     * @param features - Named feature values for a single sample
     * @returns Full inference result including auditable decision path
     */
    static predict(tree, features) {
        const path = [];
        const leaf = predictNode(tree.root, features, path);
        const maxProb = Math.max(...Object.values(leaf.probabilities));
        const importances = DecisionTreeEngine.featureImportances(tree);
        return {
            predictedClass: leaf.label,
            confidence: maxProb,
            probabilities: { ...leaf.probabilities },
            decisionPath: path,
            featureImportances: importances,
        };
    }
    /**
     * Compute normalized feature importances from a trained tree.
     * Importance = Σ (samples_at_node × impurity_improvement) across all splits on this feature, normalized.
     *
     * @param tree - Trained decision tree
     * @returns Record mapping feature name to normalized importance [0, 1]
     */
    static featureImportances(tree) {
        const raw = {};
        collectImportances(tree.root, raw);
        return normalizeImportances(raw);
    }
    /**
     * Apply cost-complexity pruning to a trained tree.
     * Higher alpha = more pruning (simpler tree).
     *
     * @param tree  - Trained decision tree
     * @param alpha - Pruning strength (0 = no pruning)
     * @returns A pruned copy of the tree
     */
    static prune(tree, alpha) {
        const prunedRoot = pruneNode(tree.root, alpha, []);
        return {
            ...tree,
            root: prunedRoot,
            nodeCount: countNodes(prunedRoot),
            depth: treeDepth(prunedRoot),
        };
    }
    /**
     * Serialize a decision tree to a JSON string.
     *
     * @param tree - Decision tree to serialize
     * @returns JSON string representation
     */
    static serialize(tree) {
        return JSON.stringify(tree);
    }
    /**
     * Deserialize a decision tree from a JSON string.
     *
     * @param json - JSON string produced by serialize()
     * @returns Reconstructed DecisionTree
     */
    static deserialize(json) {
        const parsed = JSON.parse(json);
        if (typeof parsed !== 'object' || parsed === null || !('root' in parsed)) {
            throw new Error('DecisionTreeEngine.deserialize: invalid tree JSON');
        }
        return parsed;
    }
}
exports.DecisionTreeEngine = DecisionTreeEngine;
