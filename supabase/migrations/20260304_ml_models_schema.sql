-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260304_ml_models_schema
-- World Model — ML Layer Persistence
-- Tech Genie / UCOL Architecture
--
-- Creates:
--   ml_models          — versioned storage for trained decision trees + ensembles
--   ml_training_examples — labeled training data accumulator for continuous learning
--
-- See: research/world-model/ML_ARCHITECTURE.md
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- ml_models
-- Stores serialized trained models with versioning.
-- Supports rollback via (name, version) lookup.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ml_models (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  -- Model identity
  name             TEXT        NOT NULL,        -- e.g. 'claim_classifier', 'routing_model'
  version          TEXT        NOT NULL,        -- semver: '1.0.0', '1.247.0', etc.
  model_type       TEXT        NOT NULL
    CHECK (model_type IN ('decision_tree','random_forest','gradient_boosted')),

  -- Serialized model (full tree/forest structure as JSON)
  -- Stored as JSONB for efficient querying and partial index support
  serialized_model JSONB       NOT NULL,

  -- Training metrics
  accuracy         FLOAT,                       -- classification accuracy or 1-OOB_error
  trained_at       TIMESTAMPTZ,                 -- when training completed
  feature_names    TEXT[]      NOT NULL,        -- ordered list of feature names
  class_names      TEXT[],                      -- class labels (classification only)
  sample_count     INTEGER,                     -- number of training examples used
  notes            TEXT,                        -- freetext notes for audit trail

  -- Enforce one model per (name, version) — use upsert to update
  UNIQUE (name, version)
);

COMMENT ON TABLE ml_models IS
  'Versioned storage for trained ML models (decision trees + random forests). '
  'Supports semver rollback and A/B testing via split routing.';

COMMENT ON COLUMN ml_models.name IS
  'Logical model identifier, e.g. claim_classifier, routing_model, causal_inference, simulation_predictor';
COMMENT ON COLUMN ml_models.version IS
  'Semver string. Format: MAJOR.TRAINING_SAMPLE_COUNT.PATCH, e.g. 1.247.0';
COMMENT ON COLUMN ml_models.serialized_model IS
  'Full serialized DecisionTree or EnsembleModel as JSONB. '
  'Deserialized by DecisionTreeEngine.deserialize() or RandomForest.deserialize().';
COMMENT ON COLUMN ml_models.accuracy IS
  'For classification: held-out accuracy [0,1]. For regression: R². '
  'For Random Forest: 1 - OOB_error_rate.';

-- ─────────────────────────────────────────────
-- ml_training_examples
-- Accumulates labeled training data for continuous model improvement.
-- Online learning loop: every ClaimAuditResult, RoutingDecision, etc.
-- appends here → nightly retraining → new version in ml_models.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ml_training_examples (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  -- Which model this example belongs to
  model_name       TEXT        NOT NULL,

  -- Feature vector (JSONB for flexible schema across model types)
  features         JSONB       NOT NULL,

  -- Ground truth label
  label            TEXT        NOT NULL,

  -- How the label was obtained
  label_source     TEXT        NOT NULL
    CHECK (label_source IN ('human_verified','auto_confirmed','graph_lookup')),
    -- human_verified: a human explicitly confirmed this verdict
    -- auto_confirmed: auto-confirmed via cross-model agreement or rule
    -- graph_lookup:   ground truth derived directly from graph edges

  -- Confidence in the label (used to weight examples during training)
  confidence       FLOAT       DEFAULT 1.0
    CHECK (confidence >= 0.0 AND confidence <= 1.0),

  -- Whether this example has been used in a training run
  used_in_training BOOLEAN     DEFAULT false
);

COMMENT ON TABLE ml_training_examples IS
  'Labeled training data accumulator for the online learning pipeline. '
  'Each model appends examples here; the nightly retrainer reads unused examples, '
  'trains a new model version, and marks examples as used_in_training=true.';

COMMENT ON COLUMN ml_training_examples.label_source IS
  'human_verified > auto_confirmed > graph_lookup in terms of label trustworthiness. '
  'Consider weighting by confidence column during training.';

COMMENT ON COLUMN ml_training_examples.features IS
  'Named feature map matching the model''s featureNames array. '
  'All values must be numeric and finite. '
  'Schema: { "feature_name": number, ... }';

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────

-- Fast lookup of latest model version (used by ModelStore.load)
CREATE INDEX IF NOT EXISTS idx_ml_models_name
  ON ml_models (name, created_at DESC);

-- Fast lookup of models by type (used for model management / admin)
CREATE INDEX IF NOT EXISTS idx_ml_models_type
  ON ml_models (model_type, trained_at DESC);

-- Fast retrieval of unused training examples per model (used by nightly retrainer)
CREATE INDEX IF NOT EXISTS idx_ml_training_examples_model
  ON ml_training_examples (model_name, used_in_training);

-- Secondary index: retrieve examples by creation time for auditing
CREATE INDEX IF NOT EXISTS idx_ml_training_examples_created
  ON ml_training_examples (model_name, created_at DESC);

-- ─────────────────────────────────────────────
-- Row Level Security
-- Restricts direct access to service role only.
-- Application reads/writes via SUPABASE_SERVICE_ROLE_KEY.
-- ─────────────────────────────────────────────

ALTER TABLE ml_models            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_training_examples ENABLE ROW LEVEL SECURITY;

-- Service role policy: full access for backend operations
CREATE POLICY "service_role_full_access_ml_models"
  ON ml_models
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_ml_training_examples"
  ON ml_training_examples
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read-only access to model metadata (not serialized_model)
-- This allows the frontend to display model version info without exposing model weights.
CREATE POLICY "authenticated_read_ml_model_metadata"
  ON ml_models
  FOR SELECT
  TO authenticated
  USING (true);
