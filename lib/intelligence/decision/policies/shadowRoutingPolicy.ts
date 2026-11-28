// lib/intelligence/decision/policies/shadowRoutingPolicy.ts
// RoutingDecisionPolicy (shadow mode) — the AUTHORITY boundary of the
// decision plane. Pure function: (dossier, judgment, deterministic state)
// → PolicyOutcome. No network, no DB, no execution — replayable by design.
//
// Current mode is SHADOW: policy never applies engine judgments to routing;
// production keeps its B2 decision. The outcome recorded here is the
// policy's statement about what it WOULD do — the input to replay (slice 3)
// and canary (slice 4).

import type {
  DecisionDossier, DecisionPolicy, DecisionOutcome, PolicyOutcome,
} from '../contracts';

export class ShadowRoutingPolicy implements DecisionPolicy {
  readonly id = 'routing-shadow';
  readonly version = '1';

  evaluate(
    _dossier: DecisionDossier,
    judgment: DecisionOutcome,
    deterministicState: Record<string, unknown>,
  ): PolicyOutcome {
    // Shadow mode: never apply. The reasonCode names the mode so replay can
    // distinguish "policy abstained" from "policy would have applied".
    if (!judgment.ok) {
      return { action: 'abstain', reasonCode: 'shadow_no_evidence' };
    }
    // ponytail: deterministic-only proposal for replay design — slice 3
    // replaces this with a real threshold table calibrated from the
    // jev_shadow_decision baseline. Never a root-level confidence check;
    // probabilities stay per-judgment.
    return { action: 'passthrough', reasonCode: 'shadow_mode_production_decision_retained' };
  }
}
