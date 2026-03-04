/**
 * World Model — ML Layer Type Definitions
 * Tech Genie / UCOL Architecture
 *
 * Defines the type system for the CART decision tree engine, Random Forest ensemble,
 * and all domain-specific feature vectors used across the ML inference layer.
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import type { RelationshipType } from '../types'

// ─────────────────────────────────────────────
// Core Decision Tree Structures
// ─────────────────────────────────────────────

/**
 * An internal node in a decision tree.
 * Splits on a named feature using a numeric threshold.
 */
export interface DecisionNode {
  /** Discriminator for node type */
  kind: 'node'
  /** Name of the feature to split on */
  feature: string
  /** Threshold value: left branch if feature <= threshold, right otherwise */
  threshold: number
  /** Impurity at this node (used for feature importance computation) */
  impurity: number
  /** Number of training samples that reached this node */
  sampleCount: number
  /** Weighted impurity improvement from this split */
  impurityImprovement: number
  /** Left subtree (feature <= threshold) */
  left: DecisionNode | DecisionLeaf
  /** Right subtree (feature > threshold) */
  right: DecisionNode | DecisionLeaf
  /** Depth of this node from root */
  depth: number
  /** Unique node id within its tree */
  nodeId: string
}

/**
 * A leaf node in a decision tree.
 * Stores the predicted class and class probability distribution.
 */
export interface DecisionLeaf {
  /** Discriminator for node type */
  kind: 'leaf'
  /** Predicted class label (classification) or numeric value (regression) */
  label: string
  /** Class → probability mapping for classification; single 'value' key for regression */
  probabilities: Record<string, number>
  /** Number of training samples that reached this leaf */
  sampleCount: number
  /** Impurity at this leaf */
  impurity: number
  /** Depth of this leaf from root */
  depth: number
  /** Unique node id within its tree */
  nodeId: string
}

/** Union of internal node and leaf */
export type TreeNode = DecisionNode | DecisionLeaf

/**
 * A serializable decision tree structure.
 * Root may be a node (normal case) or leaf (degenerate/single-class tree).
 */
export interface DecisionTree {
  /** Unique tree identifier */
  id: string
  /** Root node */
  root: TreeNode
  /** List of feature names in the order they appear in FeatureVector */
  featureNames: string[]
  /** Ordered class labels for classification */
  classNames: string[]
  /** 'classification' or 'regression' */
  taskType: 'classification' | 'regression'
  /** Training criterion used */
  criterion: 'gini' | 'entropy' | 'mse'
  /** Max depth allowed during training */
  maxDepth: number
  /** Training sample count */
  trainingSamples: number
  /** Training accuracy or MSE */
  trainingScore: number
  /** ISO timestamp when tree was trained */
  trainedAt: string
  /** Number of nodes in total */
  nodeCount: number
  /** Tree depth */
  depth: number
  /** Bootstrap sample indices used (for OOB computation in RandomForest) */
  bootstrapIndices?: number[]
}

// ─────────────────────────────────────────────
// Training
// ─────────────────────────────────────────────

/**
 * A single labeled training example.
 */
export interface TrainingExample {
  /** Unique identifier (from ml_training_examples.id in Supabase) */
  id?: string
  /** Feature vector for this example */
  features: FeatureVector
  /** Ground truth label */
  label: string
  /** How the label was obtained */
  labelSource?: 'human_verified' | 'auto_confirmed' | 'graph_lookup'
  /** Confidence in the label (0.0–1.0) */
  confidence?: number
  /** ISO timestamp */
  createdAt?: string
}

/**
 * Named feature map for a single inference or training example.
 * All values must be numeric and finite.
 */
export type FeatureVector = Record<string, number>

/**
 * Options for training a single CART decision tree.
 */
export interface TrainingOptions {
  /** Maximum depth of the tree (undefined = unlimited) */
  maxDepth?: number
  /** Minimum number of samples required to split a node */
  minSamplesSplit?: number
  /** Minimum number of samples required at a leaf */
  minSamplesLeaf?: number
  /** Impurity criterion */
  criterion?: 'gini' | 'entropy' | 'mse'
  /**
   * Max features to consider at each split:
   * - 'sqrt': sqrt(n_features)
   * - 'log2': log2(n_features)
   * - number: exact count
   * - undefined: all features
   */
  maxFeatures?: 'sqrt' | 'log2' | number
  /** Random seed for reproducibility */
  seed?: number
  /** Feature names (ordered, must match FeatureVector keys) */
  featureNames?: string[]
  /** Class names for classification */
  classNames?: string[]
}

// ─────────────────────────────────────────────
// Inference
// ─────────────────────────────────────────────

/**
 * A single step in the decision path traced during inference.
 */
export interface DecisionPathStep {
  /** Node id */
  nodeId: string
  /** Feature evaluated at this node (undefined for leaf) */
  feature?: string
  /** Threshold value (undefined for leaf) */
  threshold?: number
  /** Actual feature value from the input */
  featureValue?: number
  /** Which branch was taken */
  branch?: 'left' | 'right'
  /** Human-readable description of this step */
  description: string
}

/**
 * The result of running inference on a single tree or ensemble.
 */
export interface InferenceResult {
  /** Predicted class label (classification) or string-encoded value (regression) */
  predictedClass: string
  /** Confidence of the prediction (max class probability for classification) */
  confidence: number
  /** Full probability distribution over classes */
  probabilities: Record<string, number>
  /** Ordered trace of decision nodes visited during inference */
  decisionPath: DecisionPathStep[]
  /** Relative importance of each feature in this specific prediction */
  featureImportances: Record<string, number>
  /** Number of trees that agreed (for ensemble models) */
  treeConsensus?: number
  /** Total number of trees in ensemble */
  totalTrees?: number
}

// ─────────────────────────────────────────────
// Ensemble
// ─────────────────────────────────────────────

/**
 * An ensemble of decision trees (Random Forest or Gradient Boosted).
 */
export interface EnsembleModel {
  /** Unique model identifier */
  id: string
  /** Ensemble method */
  ensembleType: 'random_forest' | 'gradient_boosted'
  /** All constituent trees */
  trees: DecisionTree[]
  /** Shared feature names */
  featureNames: string[]
  /** Shared class names */
  classNames: string[]
  /** 'classification' or 'regression' */
  taskType: 'classification' | 'regression'
  /** Training options used */
  trainingOptions: RandomForestOptions
  /** Out-of-bag error estimate (0.0–1.0, lower is better) */
  oobError?: number
  /** ISO timestamp when ensemble was trained */
  trainedAt: string
  /** Training sample count */
  trainingSamples: number
}

/**
 * Options for training a Random Forest ensemble.
 */
export interface RandomForestOptions {
  /** Number of trees in the forest */
  nEstimators?: number
  /** Max depth per tree */
  maxDepth?: number
  /** Min samples to split */
  minSamplesSplit?: number
  /** Min samples at leaf */
  minSamplesLeaf?: number
  /** Feature subset strategy per split */
  maxFeatures?: 'sqrt' | 'log2' | number
  /** Whether to use bootstrap sampling (true = Random Forest, false = all samples) */
  bootstrap?: boolean
  /** Impurity criterion */
  criterion?: 'gini' | 'entropy' | 'mse'
  /** Random seed */
  seed?: number
  /** Feature names */
  featureNames?: string[]
  /** Class names */
  classNames?: string[]
}

// ─────────────────────────────────────────────
// Model Metadata & Storage
// ─────────────────────────────────────────────

/**
 * Metadata describing a trained model version.
 */
export interface ModelMetadata {
  /** Semver model version, e.g. '1.0.0' */
  version: string
  /** ISO timestamp of training completion */
  trainedAt: string
  /** Accuracy (classification) or R² (regression) on held-out data */
  accuracy?: number
  /** Feature names used at training time */
  featureNames: string[]
  /** Class names (classification) */
  classNames?: string[]
  /** Model type */
  modelType: 'decision_tree' | 'random_forest' | 'gradient_boosted'
  /** Number of training samples */
  sampleCount?: number
  /** Optional freetext notes */
  notes?: string
}

// ─────────────────────────────────────────────
// Domain-Specific Feature Vectors
// ─────────────────────────────────────────────

/**
 * Features used by the CausalInference engine to predict causal edge strength.
 * All values are normalized to [0.0, 1.0] unless noted.
 */
export interface CausalStrengthFeatures {
  /**
   * Hours between source and target events, normalized 0–1 (capped at 720h).
   * 0 = simultaneous, 1 = 30+ days apart.
   */
  temporal_gap_hours: number
  /**
   * How many times A and B co-occur in same context window, normalized.
   */
  co_occurrence_count: number
  /**
   * Domain overlap: 1.0 = same domain, 0.5 = related, 0.0 = different.
   */
  domain_match: number
  /**
   * Existing edge causal_strength if any; 0.0 if no prior edge.
   */
  prior_causal_strength: number
  /**
   * 1 if an explicit human action was detected between A and B, else 0.
   */
  intervention_present: number
  /**
   * Count of CONTRADICTS edges for this causal relationship, normalized 0–1.
   */
  contradiction_count: number
  /**
   * Historical frequency of this relationship type in the graph (0.0–1.0).
   */
  base_rate: number
}

/**
 * Features used by the ClaimClassifier to predict claim verdict.
 * All values normalized to [0.0, 1.0] unless binary.
 */
export interface ClaimVerdictFeatures {
  /**
   * Cosine similarity between claim embedding and best matching graph node.
   */
  embedding_similarity: number
  /**
   * Confidence of the closest matching graph node.
   */
  source_confidence: number
  /**
   * Age of matching fact: 0=today, 1=1+ year old.
   */
  source_age_days: number
  /**
   * Source type score: verified=1.0, system=0.8, external=0.7, user=0.6, inferred=0.4.
   */
  source_type_score: number
  /**
   * 1 if asserted speaker matches graph attribution, else 0.
   */
  speaker_match: number
  /**
   * 1.0 if matching node's valid_until is null (still valid), 0.0 if expired.
   */
  temporal_validity: number
  /**
   * Count of CONTRADICTS edges, normalized 0–1 (capped at 5).
   */
  contradiction_count: number
  /**
   * Count of SUPPORTS edges, normalized 0–1 (capped at 5).
   */
  support_count: number
  /**
   * Shortest causal path length from graph root to matching node (0=direct), normalized.
   */
  causal_distance: number
  /**
   * Historical hallucination rate for this model+domain from model_truth_scores.
   */
  domain_hallucination_rate: number
}

/**
 * Features used by the RoutingModel to select the best AI model for a query.
 */
export interface RoutingFeatures {
  /**
   * Domain encoding: code=0.1, reasoning=0.2, research=0.3, general=0.4,
   * current_events=0.5, product=0.6.
   */
  domain_code: number
  /**
   * Query complexity score 0.0–1.0 (token count + clause depth + technical term density).
   */
  query_complexity: number
  /**
   * 1 if query references current events, else 0.
   */
  requires_recency: number
  /**
   * 1 if logical deduction is required (detected by keyword patterns), else 0.
   */
  requires_reasoning: number
  /**
   * 1 if code generation/review is required, else 0.
   */
  requires_code: number
  /**
   * Gemini truth score for this domain from model_truth_scores (0.0–1.0).
   */
  truth_score_gemini: number
  /**
   * Claude truth score for this domain (0.0–1.0).
   */
  truth_score_claude: number
  /**
   * DeepSeek truth score for this domain (0.0–1.0).
   */
  truth_score_deepseek: number
  /**
   * Conversation context length normalized 0–1.
   */
  context_size_normalized: number
  /**
   * User tier: free=0.0, pro=1.0.
   */
  user_tier: number
}

/**
 * Features used by the SimulationPredictor for world state forecasting.
 */
export interface SimulationFeatures {
  /**
   * Primary metric value normalized to historical range [0, 1].
   */
  current_metric_normalized: number
  /**
   * Numeric encoding of the action category.
   */
  action_type_code: number
  /**
   * Mean outcome of similar past actions in the graph (0.0–1.0).
   */
  similar_action_outcome_avg: number
  /**
   * Aggregate causal_strength along path from action to predicted metric.
   */
  causal_chain_strength: number
  /**
   * Prediction horizon normalized: 7 days=0.1, 365 days=1.0.
   */
  time_horizon_days: number
  /**
   * Historical volatility (std dev) of this metric, normalized.
   */
  volatility_score: number
  /**
   * Count of SUPPORTS edges for the causal chain (normalized).
   */
  support_edge_count: number
  /**
   * Count of CONTRADICTS edges for the causal chain (normalized).
   */
  contradiction_edge_count: number
}

// Re-export RelationshipType for convenience within this module
export type { RelationshipType }
