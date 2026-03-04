/**
 * ModelStore — Supabase Persistence for Trained ML Models
 * Tech Genie / World Model ML Layer
 *
 * Handles:
 *   - Saving / loading serialized decision trees and ensembles
 *   - Versioned model storage with semver
 *   - Training example accumulation for continuous improvement
 *   - Rollback via specific version lookup
 *
 * Table schemas: supabase/migrations/20260304_ml_models_schema.sql
 */

import { createClient } from '@supabase/supabase-js'
import { DecisionTreeEngine } from './DecisionTreeEngine'
import { RandomForest } from './RandomForest'
import type {
  DecisionTree,
  EnsembleModel,
  ModelMetadata,
  FeatureVector,
  TrainingExample,
} from './types'

// ─────────────────────────────────────────────
// Supabase client (lazy-initialized)
// ─────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'ModelStore: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
    )
  }

  return createClient(url, key)
}

// ─────────────────────────────────────────────
// Row types matching Supabase schema
// ─────────────────────────────────────────────

interface MlModelRow {
  id: string
  created_at: string
  name: string
  version: string
  model_type: 'decision_tree' | 'random_forest' | 'gradient_boosted'
  serialized_model: DecisionTree | EnsembleModel  // JSONB — already parsed by Supabase client
  accuracy: number | null
  trained_at: string | null
  feature_names: string[]
  class_names: string[] | null
  sample_count: number | null
  notes: string | null
}

interface MlTrainingExampleRow {
  id: string
  created_at: string
  model_name: string
  features: FeatureVector  // JSONB
  label: string
  label_source: 'human_verified' | 'auto_confirmed' | 'graph_lookup'
  confidence: number
  used_in_training: boolean
}

// ─────────────────────────────────────────────
// Helper: row → ModelMetadata
// ─────────────────────────────────────────────

function rowToMetadata(row: MlModelRow): ModelMetadata {
  return {
    version: row.version,
    trainedAt: row.trained_at ?? row.created_at,
    accuracy: row.accuracy ?? undefined,
    featureNames: row.feature_names,
    classNames: row.class_names ?? undefined,
    modelType: row.model_type,
    sampleCount: row.sample_count ?? undefined,
    notes: row.notes ?? undefined,
  }
}

// ─────────────────────────────────────────────
// Helper: row → model object
// ─────────────────────────────────────────────

function rowToModel(row: MlModelRow): DecisionTree | EnsembleModel {
  // The Supabase JS client returns JSONB as a parsed JS object
  const raw = row.serialized_model
  if (row.model_type === 'decision_tree') {
    // Validate it has a root
    if (typeof raw === 'object' && raw !== null && 'root' in raw) {
      return raw as DecisionTree
    }
    // Fallback: parse as string if stored differently
    return DecisionTreeEngine.deserialize(JSON.stringify(raw))
  } else {
    if (typeof raw === 'object' && raw !== null && 'trees' in raw) {
      return raw as EnsembleModel
    }
    return RandomForest.deserialize(JSON.stringify(raw))
  }
}

// ─────────────────────────────────────────────
// ModelStore
// ─────────────────────────────────────────────

/**
 * Supabase-backed model store for persisting and loading trained ML models.
 * All methods gracefully handle Supabase unavailability.
 */
export class ModelStore {
  /**
   * Persist a trained model with its metadata.
   * Uses an upsert on (name, version) — same version will be overwritten.
   *
   * @param name     - Model name (e.g. 'claim_classifier', 'routing_model')
   * @param model    - Trained DecisionTree or EnsembleModel
   * @param metadata - Model metadata including version and accuracy
   */
  static async save(
    name: string,
    model: DecisionTree | EnsembleModel,
    metadata: ModelMetadata
  ): Promise<void> {
    const supabase = getSupabaseClient()

    const modelType: 'decision_tree' | 'random_forest' | 'gradient_boosted' =
      metadata.modelType

    // Serialize to JSON object (Supabase stores JSONB natively)
    const serialized =
      modelType === 'decision_tree'
        ? JSON.parse(DecisionTreeEngine.serialize(model as DecisionTree))
        : JSON.parse(RandomForest.serialize(model as EnsembleModel))

    const { error } = await supabase.from('ml_models').upsert(
      {
        name,
        version: metadata.version,
        model_type: modelType,
        serialized_model: serialized,
        accuracy: metadata.accuracy ?? null,
        trained_at: metadata.trainedAt,
        feature_names: metadata.featureNames,
        class_names: metadata.classNames ?? null,
        sample_count: metadata.sampleCount ?? null,
        notes: metadata.notes ?? null,
      },
      { onConflict: 'name,version' }
    )

    if (error) {
      throw new Error(`ModelStore.save: ${error.message}`)
    }
  }

  /**
   * Load a model by name, optionally at a specific version.
   * If version is omitted, returns the most recently trained version.
   *
   * @param name    - Model name
   * @param version - Specific semver version (optional; latest if omitted)
   * @returns Model + metadata, or null if not found
   */
  static async load(
    name: string,
    version?: string
  ): Promise<{ model: DecisionTree | EnsembleModel; metadata: ModelMetadata } | null> {
    try {
      const supabase = getSupabaseClient()

      let query = supabase
        .from('ml_models')
        .select('*')
        .eq('name', name)

      if (version) {
        query = query.eq('version', version)
      } else {
        query = query.order('trained_at', { ascending: false }).limit(1)
      }

      const { data, error } = await query

      if (error || !data || data.length === 0) {
        return null
      }

      const row = data[0] as MlModelRow
      return {
        model: rowToModel(row),
        metadata: rowToMetadata(row),
      }
    } catch {
      // Graceful fallback: return null if Supabase is unavailable
      return null
    }
  }

  /**
   * List all available versions of a named model, sorted by training date descending.
   *
   * @param name - Model name
   * @returns Array of ModelMetadata objects, newest first
   */
  static async listVersions(name: string): Promise<ModelMetadata[]> {
    try {
      const supabase = getSupabaseClient()

      const { data, error } = await supabase
        .from('ml_models')
        .select('*')
        .eq('name', name)
        .order('trained_at', { ascending: false })

      if (error || !data) return []

      return (data as MlModelRow[]).map(rowToMetadata)
    } catch {
      return []
    }
  }

  /**
   * Save a training example to the ml_training_examples table for future retraining.
   *
   * @param modelName   - Which model this example belongs to
   * @param features    - Feature vector
   * @param label       - Ground truth label
   * @param labelSource - How the label was obtained
   * @param confidence  - Confidence in the label (default 1.0)
   */
  static async saveTrainingExample(
    modelName: string,
    features: FeatureVector,
    label: string,
    labelSource: 'human_verified' | 'auto_confirmed' | 'graph_lookup',
    confidence = 1.0
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient()

      const { error } = await supabase.from('ml_training_examples').insert({
        model_name: modelName,
        features,
        label,
        label_source: labelSource,
        confidence,
        used_in_training: false,
      })

      if (error) {
        console.error(`ModelStore.saveTrainingExample: ${error.message}`)
      }
    } catch (err) {
      console.error(`ModelStore.saveTrainingExample: Supabase unavailable`, err)
    }
  }

  /**
   * Retrieve training examples for a given model.
   *
   * @param modelName  - Model name filter
   * @param unusedOnly - If true, only return examples not yet used in training
   * @returns Array of TrainingExample objects
   */
  static async getTrainingExamples(
    modelName: string,
    unusedOnly = false
  ): Promise<TrainingExample[]> {
    try {
      const supabase = getSupabaseClient()

      let query = supabase
        .from('ml_training_examples')
        .select('*')
        .eq('model_name', modelName)
        .order('created_at', { ascending: true })

      if (unusedOnly) {
        query = query.eq('used_in_training', false)
      }

      const { data, error } = await query

      if (error || !data) return []

      return (data as MlTrainingExampleRow[]).map(row => ({
        id: row.id,
        features: row.features,
        label: row.label,
        labelSource: row.label_source,
        confidence: row.confidence,
        createdAt: row.created_at,
      }))
    } catch {
      return []
    }
  }

  /**
   * Mark a batch of training examples as used in training.
   * Called after a successful model retraining pass.
   *
   * @param ids - Array of ml_training_examples.id values
   */
  static async markExamplesUsed(ids: string[]): Promise<void> {
    if (ids.length === 0) return

    try {
      const supabase = getSupabaseClient()

      const { error } = await supabase
        .from('ml_training_examples')
        .update({ used_in_training: true })
        .in('id', ids)

      if (error) {
        console.error(`ModelStore.markExamplesUsed: ${error.message}`)
      }
    } catch (err) {
      console.error(`ModelStore.markExamplesUsed: Supabase unavailable`, err)
    }
  }

  /**
   * Count unused training examples for a model.
   * Used to check whether enough data has accumulated for a first/next training run.
   *
   * @param modelName - Model name
   * @returns Count of unused examples
   */
  static async countUnusedExamples(modelName: string): Promise<number> {
    try {
      const supabase = getSupabaseClient()

      const { count, error } = await supabase
        .from('ml_training_examples')
        .select('*', { count: 'exact', head: true })
        .eq('model_name', modelName)
        .eq('used_in_training', false)

      if (error) return 0
      return count ?? 0
    } catch {
      return 0
    }
  }
}
