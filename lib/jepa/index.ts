/**
 * lib/jepa/index.ts
 *
 * Barrel export for the JEPA/MBRL extension layer.
 *
 * Import from here to avoid coupling to individual module paths.
 *
 * NOTE: isolatedModules-safe — each re-export is split into value and type
 * lines to satisfy Next.js/Turbopack type checking.
 */

export { JepaDivergenceScorer } from '@/lib/ucol/mcts/codeSearchMcts';
export {
  CodeSearchMcts,
  buildAstFromSource,
  applyAstAction,
  generateAstActions,
  ucb1Score,
  createMctsNode,
} from '@/lib/ucol/mcts/codeSearchMcts';
export type {
  CodeSearchState,
  AstLanguage,
  AstNode,
  AstAction,
  CodeSearchMctsOptions,
  CodeSearchResult,
} from '@/lib/ucol/mcts/codeSearchMcts';

export {
  recordDivergenceEvent,
  recordDivergenceEventSync,
} from '@/lib/jepa/divergenceTelemetry';
export type { DivergenceEvent, DivergenceEventType } from '@/lib/jepa/divergenceTelemetry';
export { jepaCircuitBreaker } from '@/lib/jepa/circuitBreaker';
export type { CircuitState } from '@/lib/jepa/circuitBreaker';
export {
  serializeAstForJepa,
  detectLanguage,
} from '@/lib/jepa/astEncoderInput';
export type { SupportedLanguage, SerializeAstOptions, JepaAstToken } from '@/lib/jepa/astEncoderInput';
export {
  ExecutionTraceEmitter,
  NoopTraceEmitter,
} from '@/lib/jepa/executionTrace';
export type { ExecutionTrace, ExecutionTraceAction, ExecutionTraceArtifact, ITraceEmitter } from '@/lib/jepa/executionTrace';

export {
  computeEnergy,
  perturbEmbedding,
} from '@/lib/jepa/latentMcts';
export type {
  LatentState,
  LatentAction,
  LatentMctsOptions,
  LatentMctsResult,
} from '@/lib/jepa/latentMcts';

export {
  degenerateVjepaDistribution,
  sampleFromVjepa,
  vjepaLogLikelihood,
} from '@/lib/jepa/vjepa';
export type {
  VjepaDistribution,
  VjepaPredictor,
} from '@/lib/jepa/vjepa';

export type { GossipPayload, GossipMetadata } from '@/lib/jepa/p2p/serialization';
export type { PeerModel, PeerIngestCallback } from '@/lib/jepa/p2p/transport';
export { JepaP2PNode } from '@/lib/jepa/p2p/transport';
export type { P2PNodeConfig } from '@/lib/jepa/p2p/transport';
