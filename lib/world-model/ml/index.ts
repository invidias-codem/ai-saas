/**
 * World Model ML Layer — Barrel Export
 * Tech Genie / UCOL Architecture
 *
 * Import from this file for clean access to the ML layer:
 *   import { ClaimClassifier, RoutingModel, RandomForest } from '@/lib/world-model/ml'
 */

export * from './types'
export { DecisionTreeEngine } from './DecisionTreeEngine'
export { RandomForest } from './RandomForest'
export { ClaimClassifier } from './ClaimClassifier'
export { CausalInference } from './CausalInference'
export { RoutingModel } from './RoutingModel'
export { SimulationPredictor } from './SimulationPredictor'
export { ModelStore } from './ModelStore'
