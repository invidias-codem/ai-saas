// lib/intelligence/decision/policies/routing/capabilityPolicyV1.ts
// Baseline replay policy. Deliberately boring: capability → tier, nothing
// else. No effort floor, no risk override, no lease adjustment, no
// confidence threshold. Those rules only get added after slice 3 proves
// they move outcomes against real evidence.

import type { RoutingProposal, RoutingReplayPolicy, RoutingReplayRecord } from '../../replay/types';

export const ROUTING_CAPABILITY_V1_ID = 'routing-capability-v1';

export class CapabilityRoutingPolicyV1 implements RoutingReplayPolicy {
  readonly id = ROUTING_CAPABILITY_V1_ID;
  readonly version = '1';

  evaluate(record: RoutingReplayRecord): RoutingProposal {
    // Missing / failed judgment → abstain to production tier, clearly labeled.
    // Rows stay in the denominator for availability analysis.
    if (record.judgment === null || !record.judgment.capability) {
      return {
        tier: record.production.tier,
        reasonCodes: ['abstain_missing_judgment'],
      };
    }
    return {
      tier: record.judgment.capability,
      effort: record.judgment.effort,
      lease: record.judgment.lease,
      reasonCodes: ['capability_passthrough'],
    };
  }
}
