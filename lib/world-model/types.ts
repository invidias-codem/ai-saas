/**
 * World Model — Type Definitions
 * Tech Genie / UCOL Architecture
 *
 * See: research/world-model/ARCHITECTURE.md
 * Inspired by: Yann LeCun, "A Path Towards Autonomous Machine Intelligence" (2022)
 */

// ─────────────────────────────────────────────
// RFC-001: World Model Root of Trust (WMRT)
// Trust Tier — assigned at write time, upgraded only by DeltaEngine
// ─────────────────────────────────────────────

/**
 * Trust tier for any content stored in or flowing through the UCOL memory layer.
 *
 * AXIOM      — Cryptographically anchored, KMS-signed. LLM layer is physically
 *              read-only. Math facts, system-ledger entries. Cannot be downgraded.
 * CONFIRMED  — DeltaEngine verified against ≥1 high-confidence graph edge.
 * SUPPORTED  — Consistent with graph context; no direct confirmation.
 * UNVERIFIED — Raw LLM output, user assertion, or external feed not yet scored.
 *              This is the default for ALL new content entering the system.
 *
 * Promotion path: UNVERIFIED → SUPPORTED → CONFIRMED (DeltaEngine only).
 * Demotion path:  Any tier → UNVERIFIED if contradicting evidence arrives.
 * AXIOM is immutable — never demoted, never written by the LLM layer.
 */
export type TrustTier = 'AXIOM' | 'CONFIRMED' | 'SUPPORTED' | 'UNVERIFIED';

/**
 * A conversation message annotated with WMRT provenance.
 * Use this instead of bare { role, content } whenever storing LLM output
 * into memory, audit logs, or context windows that will be replayed.
 */
export interface TrustTaggedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** WMRT trust tier. LLM-generated content must always start as UNVERIFIED. */
  trust_tier: TrustTier;
  /** ISO timestamp of when this message was tagged. */
  tagged_at: string;
  /** The model that produced this content (undefined for user/system messages). */
  source_model?: string;
  /** delta_score from DeltaEngine if this message has been scored (0.0 = perfect, 1.0 = fabricated). */
  delta_score?: number;
}

// ─────────────────────────────────────────────
// Relationship Types (Causal Graph)
// ─────────────────────────────────────────────

export type RelationshipType =
  | 'RELATES_TO'        // generic fallback
  | 'CORRELATES_WITH'   // weak association, no direction
  | 'PRECEDES'          // A happened before B (temporal, not necessarily causal)
  | 'CAUSES'            // A directly causes B (directional, requires evidence)
  | 'INHIBITS'          // A prevents or reduces B
  | 'CONTRADICTS'       // A and B cannot both be true
  | 'SUPPORTS'          // A is evidence for B
  | 'COUNTERFACTUAL_OF' // "if not A, then not B"
  | 'IS_A'              // taxonomy / type hierarchy
  | 'HAS_ATTRIBUTE'     // entity → property
  | 'ASSERTED_BY'       // claim → speaker (solves attribution collapse)
  | 'CONTEXT_OF'        // claim was made in this context
  | 'SUPERSEDES'        // newer fact replaces older
  | 'ENABLES'           // structural dependency: A enables/permits B
  | 'REQUIRES'          // structural prerequisite: A depends on / requires B

// ─────────────────────────────────────────────
// Entity Types
// ─────────────────────────────────────────────

export type EntityType =
  | 'person'
  | 'organization'
  | 'product'
  | 'concept'
  | 'event'
  | 'claim'
  | 'metric'
  | 'document'

export type SourceType =
  | 'user'
  | 'verified'
  | 'inferred'
  | 'external'
  | 'system'

// ─────────────────────────────────────────────
// Temporal Knowledge Node
// ─────────────────────────────────────────────

export interface TemporalKnowledgeNode {
  id: string
  type: EntityType
  content: string
  canonical_name?: string
  aliases?: string[]

  // Temporal metadata
  valid_from: Date
  valid_until?: Date          // undefined = currently valid
  superseded_by?: string      // id of the node that replaced this

  // Provenance
  confidence: number          // 0.0–1.0
  source_type: SourceType
  source_url?: string

  // Embeddings (stored in Supabase vector column)
  embedding?: number[]

  created_at: Date
  updated_at: Date
}

// ─────────────────────────────────────────────
// Causal Edge
// ─────────────────────────────────────────────

export interface CausalEdge {
  id: string
  source_id: string
  target_id: string
  relationship_type: RelationshipType

  // Temporal metadata
  valid_from: Date
  valid_until?: Date

  // Causal metadata
  confidence: number
  causal_strength?: number    // For CAUSES edges: 0.0 (weak) → 1.0 (deterministic)

  // Standardized delta for mutating events (SUPERSEDES/CONTRADICTS/OBSOLETED)
  delta?: DeltaPayload

  created_at: Date
}

// ─────────────────────────────────────────────
// Standardized Delta Payload (serialization-stable contract)
// Carried on SUPERSEDES / CONTRADICTS / OBSOLETED events.
// Mirrors normalize_wm_delta() in the 20260829 migration.
// ─────────────────────────────────────────────

export interface DeltaEvidence {
  edge_id: string
  weight: number            // 0.0 – 1.0
}

export interface DeltaPayload {
  before: unknown           // previous value / payload
  after: unknown | null     // new value / payload (null for OBSOLETED)
  reason: string            // human/machine rationale (non-empty)
  evidence: DeltaEvidence[] // list of { edge_id, weight }
  score: number             // delta_score 0.0 = confirmed → 1.0 = fabricated
}

// ─────────────────────────────────────────────
// World State
// ─────────────────────────────────────────────

export interface AttributeValue {
  value: unknown
  unit?: string
  confidence: number
  source: string
  recorded_at: Date
}

export interface WorldStateSnapshot {
  id: string
  captured_at: Date
  entity_id: string
  attribute: string
  value: unknown
  previous_value?: unknown
  changed_by: string          // clerk user_id | 'system' | 'external_feed:name'
  source?: string
  confidence: number
}

export interface WorldState {
  entity_id: string
  entity_name: string
  captured_at: Date
  attributes: Record<string, AttributeValue>
  active_edges: CausalEdge[]
}

// ─────────────────────────────────────────────
// Delta Engine / Claim Auditing
// ─────────────────────────────────────────────

export type ClaimVerdict =
  | 'CONFIRMED'       // matches a high-confidence graph edge
  | 'SUPPORTED'       // consistent with graph, not directly confirmed
  | 'UNVERIFIED'      // graph has no data (not false — unknown)
  | 'CONTRADICTED'    // directly conflicts with a graph edge
  | 'MISATTRIBUTED'   // true but attributed to wrong entity/speaker
  | 'OUTDATED'        // was true at time T, world state has since changed

export interface ClaimAuditResult {
  claim_text: string
  verdict: ClaimVerdict
  confidence: number
  delta_score: number         // 0.0 = perfect, 1.0 = complete fabrication
  domain: string
  supporting_edge_id?: string
  contradicting_node_id?: string
  explanation: string
}

export interface AIOutputAudit {
  id: string
  created_at: Date
  session_id?: string
  model: string
  claims: ClaimAuditResult[]
  overall_delta_score: number // average across all claims
  hallucination_rate: number  // % of claims CONTRADICTED or MISATTRIBUTED
  domain: string
}

// ─────────────────────────────────────────────
// Model Truth Scores
// ─────────────────────────────────────────────

export interface ModelTruthScore {
  model: string
  domain: string
  total_claims: number
  confirmed_rate: number
  supported_rate: number
  hallucination_rate: number
  misattribution_rate: number
  avg_delta_score: number
  last_evaluated: Date
}

// ─────────────────────────────────────────────
// Speaker Attribution
// ─────────────────────────────────────────────

export interface ClaimAttribution {
  id: string
  created_at: Date
  claim_node_id: string
  speaker_id: string           // clerk user_id | 'system' | 'external:source'
  speaker_display_name?: string
  asserted_at: Date
  context_session_id?: string
  context_description?: string
  confidence_at_assertion: number
  retracted_at?: Date
  retracted_reason?: string
}

// ─────────────────────────────────────────────
// Simulation Engine
// ─────────────────────────────────────────────

export type SimulationHorizon = '7d' | '30d' | '90d' | '180d' | '1y'

export interface SimulationInput {
  currentState: WorldState
  proposedAction: string
  goal: string
  horizons: SimulationHorizon[]
  contextEntityIds?: string[]  // related entities to include in simulation
}

export interface PredictedState {
  horizon: SimulationHorizon
  probability: number
  state: WorldState
  causal_chain: CausalEdge[]
  cost_score: number           // how far from goal: 0.0 = goal achieved, 1.0 = worst case
  explanation: string
}

export interface SimulationResult {
  input: SimulationInput
  predicted_states: PredictedState[]
  recommended_horizon: SimulationHorizon
  recommendation: string
  confidence: number
  simulated_at: Date
}

// ─────────────────────────────────────────────
// Grounding Feeds
// ─────────────────────────────────────────────

export interface GroundingFeed {
  name: string
  description: string
  updateIntervalMs: number
  confidenceScore: number      // 0.0–1.0, how much to trust this source
  enabled: boolean
  lastRunAt?: Date
  lastRunStatus?: 'success' | 'error' | 'partial'
}

export interface FeedIngestionResult {
  feed: string
  nodes_created: number
  nodes_updated: number
  edges_created: number
  conflicts_detected: number
  duration_ms: number
  ingested_at: Date
}

// ─────────────────────────────────────────────
// Permanent Entity (Object Permanence Layer)
// ─────────────────────────────────────────────

export interface PermanentEntity {
  id: string
  type: EntityType

  // Core identity — never changes
  canonical_name: string
  aliases: string[]
  created_at: Date

  // Current state — updates over time
  current_attributes: Record<string, AttributeValue>

  // Full history — append-only
  attribute_history: WorldStateSnapshot[]

  // Relationships
  causal_edges_out: CausalEdge[]
  causal_edges_in: CausalEdge[]

  // Epistemic metadata
  confidence: number
  source: string
  last_verified: Date
  contradicted_by?: string[]   // ids of contradicting nodes
}
