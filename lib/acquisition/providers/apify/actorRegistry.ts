// lib/acquisition/providers/apify/actorRegistry.ts
// PURE, deterministic actor registry. The Actor ID lives in registry state,
// never scattered as client.actor("random-id") calls. Production registry
// ships EMPTY + disabled in A2; A4 registers the first real Threads actor.
//
// Selection: eligibility filter → highest priority → key lexical
// tie-break. Registration ORDER can never decide which paid Actor runs.

import type { ResourceType, SocialPlatform } from '../../contracts';
import type { AcquisitionBudget } from '../../contracts';

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

// ── A4: Threads vertical — exactly one registration ───────────────────────

/** automation-lab/threads-scraper pinned build (update deliberately). */
export const THREADS_ACTOR_BUILD = '1.0.23' as const;

/** Threads actor input — authority dominates actor capability. */
export function mapThreadsInput(args: {
  canonicalUrl: string;
  resourceType: ResourceType;
  handle?: string;
  externalId?: string;
  maxRecords: number;
  budget: AcquisitionBudget;
}): Record<string, unknown> {
  // automation-lab/threads-scraper input schema:
  // mode: "profile" | "posts" | "search"
  // usernames?: string[]
  // searchQueries?: string[]
  // searchSort?: "top" | "recent"
  // maxPosts?: number (actor allows 1-200)
  // postedAfter?: string
  // postedBefore?: string
  // includeProfile?: boolean

  const mode = args.resourceType === 'profile' ? 'profile' : 'posts';

  // Authority clamps actor capability — NEVER expands.
  const actorMaxPosts = 200; // actor hard limit
  const maxPosts = Math.min(args.maxRecords, actorMaxPosts);
  if (maxPosts < 1) throw new Error('Threads mapInput: authority maxRecords < 1');

  const input: Record<string, unknown> = {
    mode,
    maxPosts,
    includeProfile: true,
  };

  if (args.handle) {
    input.usernames = [args.handle];
  }

  // Date range from budget freshness if present (future: budget.freshness)
  // postedAfter/postedBefore intentionally omitted for A4 — adds complexity
  // without a concrete requirement. Can be added when budget.freshness is used.

  // Search mode not yet supported in A4 (requires query parsing, A7 scope)
  // if (args.resourceType === 'search') { ... }

  return input;
}

/** The single Threads actor registration — A4 adds exactly this. */
export const THREADS_ACTOR_REGISTRATION: ApifyActorDefinition = {
  key: 'automation-lab-threads-scraper',
  actorId: 'automation-lab/threads-scraper',
  build: THREADS_ACTOR_BUILD,
  enabled: true,
  modes: ['resource'],
  platforms: ['threads'],
  resourceTypes: ['post', 'profile'],
  priority: 100, // highest priority for the only enabled actor
  mapInput: (ctx) => mapThreadsInput({
    canonicalUrl: ctx.canonicalUrl,
    resourceType: ctx.resourceType,
    handle: ctx.handle,
    externalId: ctx.externalId,
    maxRecords: ctx.maxRecords,
    budget: {
      maxProviderCostUsd: 0.1,
      maxRecords: ctx.maxRecords,
      maxActors: 1,
      maxSources: 1,
      deadlineMs: 120_000,
      cacheAllowed: true,
    },
  }),
};

/**
 * Get the production registry with the Threads actor enabled.
 * A4 is the only slice that should call this; A2/A3 tests use empty fixtures.
 */
export function getProductionRegistry(): readonly ApifyActorDefinition[] {
  return [THREADS_ACTOR_REGISTRATION] as const;
}

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
