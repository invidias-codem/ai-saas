/**
 * lib/jepa/index.ts
 *
 * Barrel export for the JEPA/MBRL extension layer.
 *
 * Import from here to avoid coupling to individual module paths.
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
  LatentState,
  LatentAction,
  LatentMctsOptions,
  LatentMctsResult,
  computeEnergy,
  perturbEmbedding,
} from '@/lib/jepa/latentMcts';

export {
  VjepaDistribution,
  VjepaPredictor,
  degenerateVjepaDistribution,
  sampleFromVjepa,
  vjepaLogLikelihood,
} from '@/lib/jepa/vjepa';
