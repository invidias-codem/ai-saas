// lib/acquisition/providers/apify/actorRegistry.ts
// PURE, deterministic actor registry. The Actor ID lives in registry state,
// never scattered as client.actor("random-id") calls. Production registry
// ships EMPTY + disabled in A2; A4 registers the first real Threads actor.
//
// Selection: eligibility filter → highest priority → key lexical
// tie-break. Registration ORDER can never decide which paid Actor runs.

import type { ResourceType, SocialPlatform } from '../../contracts';

/** Actor mappers see ONLY canonical identity — never the user's raw URL. */
export interface ApifyActorInputContext {
  platform: SocialPlatform;
  resourceType: ResourceType;
  canonicalUrl: string;
  externalId?: string;
  handle?: string;
  objective: 'research' | 'monitoring' | 'analysis';
  maxRecords: number;
}

export interface ApifyActorDefinition {
  key: string;
  actorId: string;
  /** Pinned build/tag — NEVER 'latest' implicitly; updates must be deliberate. */
  build: string;
  enabled: boolean;
  modes: readonly ('resource' | 'discovery')[];
  platforms: readonly SocialPlatform[];
  resourceTypes: readonly ResourceType[];
  priority: number;
  mapInput(input: ApifyActorInputContext): Record<string, unknown>;
}

/**
 * A2 ships with an empty registry: the provider is fully implemented and
 * fixture-tested, but no paid Actor is launchable until A4 registers one.
 * This keeps A2 from quietly becoming A2+A4.
 */
export const ACTOR_REGISTRY: readonly ApifyActorDefinition[] = [];

export function selectActor(args: {
  registry: readonly ApifyActorDefinition[];
  platform: SocialPlatform;
  resourceType: ResourceType;
  mode: 'resource' | 'discovery';
}): ApifyActorDefinition | null {
  const eligible = args.registry.filter(
    (a) =>
      a.enabled &&
      a.modes.includes(args.mode) &&
      a.platforms.includes(args.platform) &&
      a.resourceTypes.includes(args.resourceType),
  );
  if (eligible.length === 0) return null;
  // Deterministic: priority desc, then key lexical — registration order is
  // irrelevant by construction.
  const sorted = [...eligible].sort((a, b) => b.priority - a.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return sorted[0] ?? null;
}
