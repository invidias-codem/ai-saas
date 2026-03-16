/**
 * @file store/schema.ts
 * @description TypeScript types matching UCOL Protocol Appendix A schemas (v0.1).
 *   All binary fields are base64url strings. All timestamps are ISO 8601 UTC.
 *   All UUIDs are RFC 4122 v4 format strings.
 */

// ─── Primitive Types ─────────────────────────────────────────────────────────

/** RFC 4122 UUID v4 string */
export type UUID = string;

/** ISO 8601 UTC timestamp string, e.g. "2026-03-13T14:00:00Z" */
export type Timestamp = string;

/** Semantic version string, e.g. "0.1.0" */
export type Semver = string;

/** W3C DID in UCOL method — did:ucol:[node:]<base58-pubkey> */
export type DID = string;

/** Model identifier: provider/model-name[@version] */
export type ModelID = string;

/** Ed25519 signature, base64url-encoded (64 bytes) */
export type Signature = string;

/** SHA-256 hex digest (64 hex characters) */
export type SHA256 = string;

/** Base64url-encoded bytes */
export type Base64URL = string;

/** Confidence score in range [0.0, 1.0] */
export type Confidence = number;

/** 768-dimensional float vector (Gemini embedding-001) */
export type Embedding = number[];

// ─── Enumerations ────────────────────────────────────────────────────────────

/** Data classification tier per §7.1 */
export type SecurityTier = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

/** Security tier numeric ordering (higher = more restricted) */
export const SECURITY_TIER_ORDER: Record<SecurityTier, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

/** Knowledge item classification */
export type KnowledgeType = 'FACT' | 'CONSTRAINT' | 'PREFERENCE' | 'GOAL' | 'ASSERTION';

/** Artifact classification */
export type ArtifactType =
  | 'CODE'
  | 'SCHEMA'
  | 'SPEC'
  | 'TEST'
  | 'CONFIG'
  | 'MIGRATION'
  | 'REPORT';

/** Directed relationship type */
export type RelationshipType =
  | 'CAUSES'
  | 'CONTRADICTS'
  | 'SUPPORTS'
  | 'DEPENDS_ON'
  | 'ASSERTED_BY'
  | 'SUPERSEDES'
  | 'IMPLEMENTS'
  | 'VIOLATES';

/** Task intent enum — classified by Gemini Flash */
export type TaskIntent =
  | 'QUICK_ANSWER'
  | 'CODE_GENERATION'
  | 'RESEARCH'
  | 'STRATEGY'
  | 'ORCHESTRATION'
  | 'QUALITY_ANALYSIS'
  | 'DB_QUERY'
  | 'DEPLOYMENT'
  | 'REPO_MANAGEMENT'
  | 'MEMORY_EXTRACT'
  | 'UNKNOWN';

/** Node capability flags per §4.1 */
export type NodeCapability =
  | 'ROUTING'
  | 'MEMORY'
  | 'EXECUTION'
  | 'SYNTHESIS'
  | 'GATEWAY'
  | 'FEDERATION';

/** Source of a routing decision */
export type RoutingSource =
  | 'PROCEDURAL_MEMORY'
  | 'STATIC_RULE'
  | 'LLM_CLASSIFIER';

/** How context is shaped for the target model */
export type FormatAdapter =
  | 'XML_TAGGED'
  | 'MARKDOWN_HEADERS'
  | 'JSON_STRUCTURED'
  | 'PLAIN_TEXT';

/** Node operational lifecycle state */
export type NodeLifecycle =
  | 'INITIALIZING'
  | 'READY'
  | 'ACTIVE'
  | 'DRAINING'
  | 'SHUTDOWN';

/** Mission lifecycle state per §6.2 */
export type MissionState =
  | 'PENDING'
  | 'PLANNING'
  | 'READY'
  | 'EXECUTING'
  | 'REVIEWING'
  | 'PAUSED'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

/** Failure policy for missions */
export type FailurePolicy = 'ABORT_ALL' | 'SKIP_AND_CONTINUE' | 'HUMAN_ESCALATE';

/** History item role */
export type HistoryRole = 'USER' | 'AGENT' | 'SYSTEM' | 'TOOL';

// ─── Core Context Items ───────────────────────────────────────────────────────

/**
 * Knowledge Item (K_i) — atomic typed assertion about the world.
 * Spec §3.1 and Appendix A.2.
 */
export interface KnowledgeItem {
  /** UUID v4 — globally unique */
  id: UUID;
  /** The assertion content, UTF-8, max 8192 bytes */
  content: string;
  type: KnowledgeType;
  /** Certainty [0.0, 1.0] */
  confidence: Confidence;
  /** AgentID (DID) who asserted this */
  source: DID;
  /** When this became true */
  valid_from: Timestamp;
  /** null = indefinitely valid */
  valid_until: Timestamp | null;
  /** SHA-256 of originating context fragment */
  provenance: SHA256;
  /** Ed25519 signature: sign(id + content + valid_from, source_private_key) */
  signature: Signature;
  /** 768-dim Gemini embedding; null until indexed */
  embedding: Embedding | null;
  /** Data classification tier */
  security_tier: SecurityTier;
}

/**
 * Artifact (A_i) — versioned typed output produced by an agent.
 * Spec §3.2 and Appendix A.3.
 */
export interface Artifact {
  id: UUID;
  type: ArtifactType;
  /** Base64url-encoded artifact content */
  content: Base64URL;
  mime_type: string;
  version: Semver;
  /** IDs of artifacts this one depends on */
  dependencies: UUID[];
  produced_by: DID;
  produced_at: Timestamp;
  /** SHA-256 of decoded content */
  checksum: SHA256;
  signature: Signature;
  security_tier: SecurityTier;
  description?: string;
}

/**
 * History Item (H_i) — ordered record of a single agent interaction turn.
 * Spec §3.3 and Appendix A.4.
 */
export interface HistoryItem {
  id: UUID;
  session_id: UUID;
  /** Monotonically increasing within session */
  sequence: number;
  role: HistoryRole;
  /** Turn content, UTF-8, max 128KB */
  content: string;
  /** null for USER and SYSTEM roles */
  model_id: ModelID | null;
  tokens_used: number;
  timestamp: Timestamp;
  /** true if content has been captured as K_i items via Engram */
  distilled: boolean;
  delta_k: UUID[];
  delta_a: UUID[];
}

/**
 * Relationship (R_ij) — typed weighted directed edge between K ∪ A items.
 * Spec §3.4 and Appendix A.5.
 */
export interface Relationship {
  id: UUID;
  /** Source item ID (K_i or A_i) */
  source: UUID;
  /** Target item ID (K_j or A_j) */
  target: UUID;
  type: RelationshipType;
  /** Relationship strength [0.0, 1.0] */
  weight: Confidence;
  confidence: Confidence;
  created_by: DID;
  created_at: Timestamp;
  /** Knowledge Item IDs supporting this relationship */
  evidence: UUID[];
}

/**
 * Context Metadata (M) — identity, classification, integrity envelope.
 * Spec §3.5 and Appendix A.6.
 */
export interface ContextMetadata {
  context_id: UUID;
  schema_version: Semver;
  created_by: DID;
  created_at: Timestamp;
  /** Highest tier of any item in this context */
  security_tier: SecurityTier;
  item_count: { k: number; a: number; h: number; r: number };
  /** SHA-256 over canonical serialization of K ∪ A ∪ H ∪ R */
  checksum: SHA256;
  signature: Signature;
  udif_ref: string | null;
}

/**
 * Context Tuple C = (K, A, H, R, M) — Spec §3 and Appendix A.7.
 */
export interface ContextTuple {
  knowledge: KnowledgeItem[];
  artifacts: Artifact[];
  history: HistoryItem[];
  relationships: Relationship[];
  metadata: ContextMetadata;
}

/**
 * Context Fragment — subset of a Context Tuple for progressive disclosure.
 */
export interface ContextFragment {
  knowledge?: KnowledgeItem[];
  artifacts?: Artifact[];
  history?: HistoryItem[];
  relationships?: Relationship[];
}

// ─── Routing Types ────────────────────────────────────────────────────────────

/**
 * Task input to the Context Routing Algorithm — Spec §5.1 and Appendix A.8.
 */
export interface Task {
  /** Natural language task description */
  query: string;
  /** Pre-classified intent. If null/undefined, node will classify. */
  intent?: TaskIntent | null;
  agent_id: DID;
  session_id: UUID;
  /** Max tokens for context slice */
  budget_tokens: number;
  /** Routing SLA in milliseconds */
  max_latency_ms: number;
  security_clearance: SecurityTier;
  /** Whether destructive tool calls are permitted */
  allow_destructive?: boolean;
  /** Pre-fetched memory facts for confidence-aware routing */
  memory_facts?: KnowledgeItem[];
  goal_context?: string;
}

/** A single formatted item in the context slice */
export interface ContextSliceItem {
  item_id: UUID;
  item_type: 'knowledge' | 'artifact' | 'history';
  score: Confidence;
  formatted: string;
}

/** A procedural tool step */
export interface ToolStep {
  harness: string;
  command: string[];
  expected?: string;
}

/**
 * Routing Decision output — Spec §5.2 and Appendix A.9.
 */
export interface RoutingDecision {
  task_id: UUID;
  target_model: ModelID;
  context_slice: ContextSliceItem[];
  format_adapter: FormatAdapter;
  estimated_tokens: number;
  source: RoutingSource;
  confidence: Confidence;
  doubt_score: Confidence;
  security_score?: number;
  review_required?: boolean;
  confidence_override?: boolean;
  procedural_sequence?: ToolStep[] | null;
  created_at: Timestamp;
}

// ─── Session Types ────────────────────────────────────────────────────────────

/** Active session record */
export interface Session {
  session_id: UUID;
  agent_id: DID;
  granted_capabilities: NodeCapability[];
  security_clearance: SecurityTier;
  created_at: Timestamp;
  expires_at: Timestamp;
  h_bytes: number;
  history_count: number;
}

/** Response to ucol.session.open */
export interface SessionOpenResponse {
  session_id: UUID;
  granted_capabilities: NodeCapability[];
  expires_at: Timestamp;
  context_id: UUID | null;
}

/** Response to ucol.session.close */
export interface CloseResult {
  items_committed: number;
  engram_triggered: boolean;
}

// ─── Store Types ──────────────────────────────────────────────────────────────

/** Result of putContext */
export interface PutResult {
  context_id: UUID;
  items_stored: number;
}

/** Query filters for context queries */
export interface QueryFilters {
  types?: ('knowledge' | 'artifact' | 'history')[];
  knowledge_types?: KnowledgeType[];
  security_tier_max?: SecurityTier;
  valid_at?: Timestamp;
  agent_id?: DID;
  min_confidence?: Confidence;
  limit?: number;
  session_id?: UUID;
}

/** Response from context query */
export interface ContextQueryResponse {
  items: (KnowledgeItem | Artifact | HistoryItem)[];
  scores: number[];
  total_matched: number;
}

// ─── Mission Types ────────────────────────────────────────────────────────────

/** A single step in a mission */
export interface MissionStep {
  step_id?: UUID;
  name: string;
  agent_id: DID;
  task: Task;
  depends_on?: UUID[];
  timeout_ms: number;
  retry_limit?: number;
}

/** Human gate condition */
export interface HumanGateCondition {
  condition: string;
  step_id?: UUID;
  timeout_ms?: number;
}

/** Mission specification */
export interface MissionSpec {
  goal: string;
  steps: MissionStep[];
  agents: DID[];
  timeout_ms: number;
  on_failure: FailurePolicy;
  requires_human?: HumanGateCondition[];
}

/** Full mission record with lifecycle state */
export interface Mission {
  mission_id: UUID;
  spec: MissionSpec;
  state: MissionState;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at?: Timestamp;
  failure_reason?: string;
  step_results: Record<string, StepResult>;
}

/** Result of a completed mission step */
export interface StepResult {
  step_id: UUID;
  state: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED' | 'SKIPPED';
  started_at?: Timestamp;
  completed_at?: Timestamp;
  error?: string;
  routing_decision?: RoutingDecision;
}

// ─── Node Config ──────────────────────────────────────────────────────────────

/** Configuration for instantiating a UCOLNode */
export interface UCOLNodeConfig {
  /** Supabase project URL */
  supabaseUrl: string;
  /** Supabase service role key */
  supabaseKey: string;
  /** Gemini API key for embedding + classification */
  geminiApiKey: string;
  /** Node operator name */
  operator: string;
  /** Node capabilities (ROUTING and MEMORY are always added) */
  capabilities?: NodeCapability[];
  /** HTTP port for JSON-RPC server (default: 3001) */
  port?: number;
  /** Session TTL in seconds (default: 3600) */
  sessionTtlSeconds?: number;
  /** Engram distillation threshold in bytes (default: 51200 = 50KB) */
  distillationThresholdBytes?: number;
  /** Decay rate λ per day (default: 0.005) */
  decayRate?: number;
}

// ─── Doubt Engine Types ───────────────────────────────────────────────────────

/** Input to the Doubt Engine */
export interface DoubtInput {
  proposer_outputs: string[];
  context_fragment: (KnowledgeItem | Artifact | HistoryItem)[];
  constraint_set: KnowledgeItem[];
  task: Task;
}

/** Doubt Engine scoring result */
export interface DoubtResult {
  doubt_score: Confidence;
  security_score: number;
  review_required: boolean;
  action: 'AUTO_APPROVE' | 'PROCEED_WITH_LOG' | 'HUMAN_REVIEW';
  confidence_variance: number;
  constraint_violation_flag: number;
  source_reliability: number;
}

// ─── Graph Types ──────────────────────────────────────────────────────────────

/** Graph entity node */
export interface GraphEntity {
  id: UUID;
  label: string;
  type: string;
  embedding: Embedding;
  confidence: Confidence;
  created_at: Timestamp;
  access_count: number;
  decay_weight: number;
  last_reinforced_at: Timestamp;
}

/** Graph community node */
export interface GraphCommunity {
  id: UUID;
  summary: string;
  level: number;
  member_ids: UUID[];
  embedding: Embedding;
}

/** Spreading activation result */
export interface ActivationResult {
  entity_id: UUID;
  activation: number;
}
