// lib/emSh/types.ts
// Canonical State + EMSH Genotype domain types.
//
// Canonical State: a provider-agnostic message layer with universal abstract
// roles so state can be translated across primary / fallback / 1M-token models
// without leaking any single provider's wire format.
//
// EMSH Genotype: a generalized execution DAG (nodes = abstract roles + tool
// steps, edges = control flow) plus an intent embedding and fitness score —
// the unit of cross-session, cross-workspace "meta-skill" evolution.

export type CanonicalRole =
  | 'SYSTEM'
  | 'USER'
  | 'AGENT'
  | 'TOOL_INVOCATION'
  | 'TOOL_RESULT';

export interface CanonicalStateNode {
  role: CanonicalRole;
  content: string;
  /** Optional display/speaker name (e.g. tool name for TOOL_RESULT). */
  name?: string;
  /** Deterministic tool-call id for zero-loss idempotency. */
  toolCallId?: string;
  /** Source provider id when the node was produced by a specific model. */
  provider?: string;
  /** Source model id. */
  modelId?: string;
  metadata?: Record<string, unknown>;
}

export interface GenotypeNode {
  id: string;
  /** Provider-agnostic step type — the abstract role or a tool step. */
  stepType: CanonicalRole | 'TOOL';
  toolName?: string;
}

export interface GenotypeEdge {
  fromStep: string;
  toStep: string;
  condition?: string;
}

export interface GenotypeDAG {
  nodes: GenotypeNode[];
  edges: GenotypeEdge[];
}

export interface GenotypeRecord {
  id: string;
  workspaceId?: string | null;
  /** Stable semantic cluster id for prompt intent. */
  intentSignature: string;
  /** 768-dim intent embedding (matches the existing vector lane). */
  intentEmbedding?: number[] | null;
  abstractDag: GenotypeDAG;
  fitnessScore: number;
  executionCount: number;
  successRate: number;
  parentGenotypeIds: string[];
  generation: number;
  meta?: Record<string, unknown>;
}

export type FitnessSignal = 'explicit' | 'semantic' | 'delta' | 'critic';

export interface GenotypeFitnessEvent {
  id?: string;
  genotypeId: string;
  score: number;
  signal: FitnessSignal;
  sourceSessionId?: string | null;
}