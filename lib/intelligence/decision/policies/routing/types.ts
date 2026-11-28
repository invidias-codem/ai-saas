// lib/intelligence/decision/policies/routing/types.ts
// Slice 3: re-export the routing policy contract so `policies/routing/` is a
// self-contained surface. New policy families (cost-aware, lease-aware, etc)
// implement the SAME RoutingReplayPolicy — the kernel never branches on
// policy id.
export type {
  RoutingProposal,
  RoutingReplayPolicy,
  RoutingReplayRecord,
  Tier,
  Effort,
} from '../../replay/types';
