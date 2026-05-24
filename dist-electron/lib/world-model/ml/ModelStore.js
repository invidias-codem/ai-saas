"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelStore = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const DecisionTreeEngine_1 = require("./DecisionTreeEngine");
const RandomForest_1 = require("./RandomForest");
// ─────────────────────────────────────────────
// Supabase client (lazy-initialized)
// ─────────────────────────────────────────────
function getSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        throw new Error('ModelStore: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    }
    return (0, supabase_js_1.createClient)(url, key);
}
// ─────────────────────────────────────────────
// Helper: row → ModelMetadata
// ─────────────────────────────────────────────
function rowToMetadata(row) {
    return {
        version: row.version,
        trainedAt: row.trained_at ?? row.created_at,
        accuracy: row.accuracy ?? undefined,
        featureNames: row.feature_names,
        classNames: row.class_names ?? undefined,
        modelType: row.model_type,
        sampleCount: row.sample_count ?? undefined,
        notes: row.notes ?? undefined,
    };
}
// ─────────────────────────────────────────────
// Helper: row → model object
// ─────────────────────────────────────────────
function rowToModel(row) {
    // The Supabase JS client returns JSONB as a parsed JS object
    const raw = row.serialized_model;
    if (row.model_type === 'decision_tree') {
        // Validate it has a root
        if (typeof raw === 'object' && raw !== null && 'root' in raw) {
            return raw;
        }
        // Fallback: parse as string if stored differently
        return DecisionTreeEngine_1.DecisionTreeEngine.deserialize(JSON.stringify(raw));
    }
    else {
        if (typeof raw === 'object' && raw !== null && 'trees' in raw) {
            return raw;
        }
        return RandomForest_1.RandomForest.deserialize(JSON.stringify(raw));
    }
}
// ─────────────────────────────────────────────
// ModelStore
// ─────────────────────────────────────────────
/**
 * Supabase-backed model store for persisting and loading trained ML models.
 * All methods gracefully handle Supabase unavailability.
 */
class ModelStore {
    /**
     * Persist a trained model with its metadata.
     * Uses an upsert on (name, version) — same version will be overwritten.
     *
     * @param name     - Model name (e.g. 'claim_classifier', 'routing_model')
     * @param model    - Trained DecisionTree or EnsembleModel
     * @param metadata - Model metadata including version and accuracy
     */
    static async save(name, model, metadata) {
        const supabase = getSupabaseClient();
        const modelType = metadata.modelType;
        // Serialize to JSON object (Supabase stores JSONB natively)
        const serialized = modelType === 'decision_tree'
            ? JSON.parse(DecisionTreeEngine_1.DecisionTreeEngine.serialize(model))
            : JSON.parse(RandomForest_1.RandomForest.serialize(model));
        const { error } = await supabase.from('ml_models').upsert({
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
        }, { onConflict: 'name,version' });
        if (error) {
            throw new Error(`ModelStore.save: ${error.message}`);
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
    static async load(name, version) {
        try {
            const supabase = getSupabaseClient();
            let query = supabase
                .from('ml_models')
                .select('*')
                .eq('name', name);
            if (version) {
                query = query.eq('version', version);
            }
            else {
                query = query.order('trained_at', { ascending: false }).limit(1);
            }
            const { data, error } = await query;
            if (error || !data || data.length === 0) {
                return null;
            }
            const row = data[0];
            return {
                model: rowToModel(row),
                metadata: rowToMetadata(row),
            };
        }
        catch {
            // Graceful fallback: return null if Supabase is unavailable
            return null;
        }
    }
    /**
     * List all available versions of a named model, sorted by training date descending.
     *
     * @param name - Model name
     * @returns Array of ModelMetadata objects, newest first
     */
    static async listVersions(name) {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('ml_models')
                .select('*')
                .eq('name', name)
                .order('trained_at', { ascending: false });
            if (error || !data)
                return [];
            return data.map(rowToMetadata);
        }
        catch {
            return [];
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
    static async saveTrainingExample(modelName, features, label, labelSource, confidence = 1.0) {
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.from('ml_training_examples').insert({
                model_name: modelName,
                features,
                label,
                label_source: labelSource,
                confidence,
                used_in_training: false,
            });
            if (error) {
                console.error(`ModelStore.saveTrainingExample: ${error.message}`);
            }
        }
        catch (err) {
            console.error(`ModelStore.saveTrainingExample: Supabase unavailable`, err);
        }
    }
    /**
     * Retrieve training examples for a given model.
     *
     * @param modelName  - Model name filter
     * @param unusedOnly - If true, only return examples not yet used in training
     * @returns Array of TrainingExample objects
     */
    static async getTrainingExamples(modelName, unusedOnly = false) {
        try {
            const supabase = getSupabaseClient();
            let query = supabase
                .from('ml_training_examples')
                .select('*')
                .eq('model_name', modelName)
                .order('created_at', { ascending: true });
            if (unusedOnly) {
                query = query.eq('used_in_training', false);
            }
            const { data, error } = await query;
            if (error || !data)
                return [];
            return data.map(row => ({
                id: row.id,
                features: row.features,
                label: row.label,
                labelSource: row.label_source,
                confidence: row.confidence,
                createdAt: row.created_at,
            }));
        }
        catch {
            return [];
        }
    }
    /**
     * Mark a batch of training examples as used in training.
     * Called after a successful model retraining pass.
     *
     * @param ids - Array of ml_training_examples.id values
     */
    static async markExamplesUsed(ids) {
        if (ids.length === 0)
            return;
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('ml_training_examples')
                .update({ used_in_training: true })
                .in('id', ids);
            if (error) {
                console.error(`ModelStore.markExamplesUsed: ${error.message}`);
            }
        }
        catch (err) {
            console.error(`ModelStore.markExamplesUsed: Supabase unavailable`, err);
        }
    }
    /**
     * Count unused training examples for a model.
     * Used to check whether enough data has accumulated for a first/next training run.
     *
     * @param modelName - Model name
     * @returns Count of unused examples
     */
    static async countUnusedExamples(modelName) {
        try {
            const supabase = getSupabaseClient();
            const { count, error } = await supabase
                .from('ml_training_examples')
                .select('*', { count: 'exact', head: true })
                .eq('model_name', modelName)
                .eq('used_in_training', false);
            if (error)
                return 0;
            return count ?? 0;
        }
        catch {
            return 0;
        }
    }
}
exports.ModelStore = ModelStore;
