/**
 * lib/jepa/index.ts
 *
 * Barrel export for the JEPA/MBRL extension layer.
 *
 * Import from here to avoid coupling to individual module paths.
 */

export { JepaDivergenceScorer } from '@/lib/ucol/mcts/codeSearchMcts';
export { CodeSearchMcts, CodeSearchState, AstLanguage, AstNode, AstAction, buildAstFromSource, applyAstAction, generateAstActions, ucb1Score, createMctsNode, type CodeSearchResult, type CodeSearchMctsOptions } from '@/lib/ucol/mcts/codeSearchMcts';

export { recordDivergenceEvent, recordDivergenceEventSync, type DivergenceEvent, type DivergenceEventType } from '@/lib/jepa/divergenceTelemetry';
export { jepaCircuitBreaker, type CircuitState } from '@/lib/jepa/circuitBreaker';
export { serializeAstForJepa, detectLanguage, type SupportedLanguage, type SerializeAstOptions, type JepaAstToken } from '@/lib/jepa/astEncoderInput';
export { ExecutionTraceEmitter, NoopTraceEmitter, type ExecutionTrace, type ExecutionTraceAction, type ExecutionTraceArtifact, type ITraceEmitter } from '@/lib/jepa/executionTrace';

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
