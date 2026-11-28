// lib/acquisition/contracts.ts
// Lattice Acquisition Plane — neutral contracts (Slice A0).
//
// ARCHITECTURAL RULE (mirrors Decision Plane #376 and ExecutionRuntime #407):
//   UCOL does NOT know what an Apify Actor is.
//   UCOL expresses an AcquisitionRequirement.
//   Deterministic policy resolves it against REGISTERED providers.
//   Providers acquire; normalization produces EvidenceObjectV1; the ledger
//   records what actually happened.
//
// Boundary rules (locked):
//   - URL ≠ identity. CanonicalResource = identity (caching/dedupe key).
//   - Provider failure ≠ private. Uncertain access is UNKNOWN, never
//     PRIVATE_UNAUTHORIZED; promotion requires deterministic evidence.
//     PRIVATE_UNAUTHORIZED ends the attempt — no circumventing privacy
//     boundaries with scraper infrastructure.
//   - Evidence is immutable + provenance-hashed; raw provider output is
//     staging, never the canonical store.
//
// This slice is CONTRACTS ONLY: no provider SDK, no network, no DB.

import { z } from 'zod';

// ── Platforms & resources ───────────────────────────────────────────────

export const SocialPlatformSchema = z.enum([
  'instagram',
  'threads',
  'reddit',
  'linkedin',
  'tiktok',
  'bluesky',
  'web',
]);
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;

export const ResourceTypeSchema = z.enum([
  'post',
  'profile',
  'video',
  'reel',
  'story',
  'thread',
  'comment',
  'hashtag',
  'search',
  'unknown',
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

// ── CanonicalResource: the identity of a thing on a platform ────────────

export interface CanonicalResource {
  platform: SocialPlatform;
  resourceType: ResourceType;
  originalUrl: string;
  canonicalUrl: string;
  externalId?: string;
  handle?: string;
}

/** Stable dedupe/cache key: platform:resourceType:externalId (URLs never). */
export function evidenceCacheKey(r: CanonicalResource): string {
  const id = r.externalId ?? r.canonicalUrl;
  return `social:${r.platform}:${r.resourceType}:${id}`;
}

/** URL → platform/resource/identity. One implementation per platform. */
export interface SourceRoute {
  platform: SocialPlatform;
  match(url: URL): boolean;
  parse(url: URL): CanonicalResource | null;
}

// ── Access: determined BEFORE reasoning, conservatively ─────────────────

export const AccessStateSchema = z.enum([
  'PUBLIC_FETCHABLE',
  'AUTHENTICATION_REQUIRED',
  'AUTHORIZED_PRIVATE',
  'PRIVATE_UNAUTHORIZED',
  'NOT_FOUND',
  'DELETED',
  'RATE_LIMITED',
  'PROVIDER_BLOCKED',
  'UNKNOWN',
]);
export type AccessState = z.infer<typeof AccessStateSchema>;

// ── Acquisition lifecycle ───────────────────────────────────────────────

export const AcquisitionModeSchema = z.enum(['resource', 'discovery']);
export type AcquisitionMode = z.infer<typeof AcquisitionModeSchema>;

/** What UCOL asks for. Never names a provider. */
export const AcquisitionRequirementSchema = z.object({
  mode: AcquisitionModeSchema,
  /** resource mode: the parsed canonical identity. */
  resource: z.custom<CanonicalResource | null>().optional(),
  /** discovery mode: free research intent. */
  query: z.string().optional(),
  location: z.string().optional(),
  platforms: z.array(SocialPlatformSchema).optional(),
  objective: z.enum(['research', 'monitoring', 'analysis']).default('research'),
  /** Freshness: cached evidence older than this is stale (ISO duration). */
  freshness: z.string().optional(),
});
export type AcquisitionRequirement = z.infer<typeof AcquisitionRequirementSchema>;

/** Deterministic cost governance — the model never gets spending authority. */
export interface AcquisitionBudget {
  maxProviderCostUsd: number;
  maxRecords: number;
  maxActors: number;
  maxSources: number;
  deadlineMs: number;
  cacheAllowed: boolean;
}

export const DEFAULT_QUICK_BUDGET: AcquisitionBudget = {
  maxProviderCostUsd: 0.1,
  maxRecords: 25,
  maxActors: 1,
  maxSources: 2,
  deadlineMs: 120_000,
  cacheAllowed: true,
};

export const AcquisitionStatusSchema = z.enum([
  'queued',
  'classifying',
  'access_check',
  'cached',
  'provider_pending',
  'provider_running',
  'ingesting',
  'normalizing',
  'completed',
  'partial',
  'blocked',
  'failed',
]);
export type AcquisitionStatus = z.infer<typeof AcquisitionStatusSchema>;

/** Machine-readable failures. No generic "scrape failed" — ever. */
export const AcquisitionFailureSchema = z.enum([
  'unsupported_source',
  'unsupported_resource',
  'invalid_url',
  'unsafe_url',
  'redirect_to_private_network',
  'redirect_limit_exceeded',
  'dns_resolution_failed',
  'private_resource',
  'authentication_required',
  'actor_unavailable',
  'provider_rate_limited',
  'provider_budget_exceeded',
  'provider_failed',
  'dataset_unavailable',
  'schema_invalid',
  'normalization_failed',
]);
export type AcquisitionFailure = z.infer<typeof AcquisitionFailureSchema>;

// ── Provider contract ───────────────────────────────────────────────────

export interface ProviderRun {
  providerRunId: string;
  /** operation_key = apify_ingest:<runId>:<datasetId>:v1-style idempotency. */
  operationKey: string;
  status: AcquisitionStatus;
}

export interface ProviderRunStatus {
  status: AcquisitionStatus;
  failure?: AcquisitionFailure;
  datasetId?: string;
  estimatedCostUsd?: number;
  finalCostUsd?: number;
  recordCount?: number;
}

export interface RawEvidence {
  /** Provider output, verbatim — staging only, never canonical. */
  raw: unknown;
  /** Deterministic content hash for provenance/dedupe. */
  contentHash: string;
  retrievalMetadata: {
    provider: string;
    providerActorId?: string;
    providerRunId: string;
    datasetId?: string;
    retrievedAt: string;
  };
}

/**
 * The ONLY provider surface. Five operations. ApifyAcquisitionProvider is
 * one future implementation; native APIs / Lattice Crawler slot in later
 * without changing anything upstream.
 */
export interface AcquisitionProvider {
  readonly id: string;
  readonly platforms: readonly SocialPlatform[];
  supports(resource: CanonicalResource | null, requirement: AcquisitionRequirement): Promise<boolean>;
  start(requirement: AcquisitionRequirement, budget: AcquisitionBudget): Promise<ProviderRun>;
  status(providerRunId: string): Promise<ProviderRunStatus>;
  collect(providerRunId: string): Promise<RawEvidence[]>;
  cancel(providerRunId: string): Promise<void>;
}

// ── Evidence: the universal object after normalization ──────────────────

export const EvidenceObjectV1Schema = z.object({
  id: z.string(),
  acquisitionRequestId: z.string(),
  source: z.object({
    category: z.literal('social'),
    platform: SocialPlatformSchema,
    provider: z.string(),
    providerActorId: z.string().optional(),
    providerRunId: z.string().optional(),
  }),
  resource: z.object({
    type: ResourceTypeSchema,
    originalUrl: z.string().optional(),
    canonicalUrl: z.string().optional(),
    externalId: z.string().optional(),
  }),
  author: z
    .object({
      externalId: z.string().optional(),
      handle: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  content: z.object({
    text: z.string().optional(),
    title: z.string().optional(),
    media: z
      .array(
        z.object({
          type: z.enum(['image', 'video', 'audio']),
          sourceUrl: z.string().optional(),
        }),
      )
      .optional(),
    links: z.array(z.string()).optional(),
  }),
  engagement: z
    .object({
      likes: z.number().optional(),
      replies: z.number().optional(),
      shares: z.number().optional(),
      views: z.number().optional(),
    })
    .optional(),
  temporal: z.object({
    publishedAt: z.string().optional(),
    observedAt: z.string(),
    retrievedAt: z.string(),
  }),
  access: z.object({ state: AccessStateSchema }),
  provenance: z.object({
    rawHash: z.string(),
    normalizerVersion: z.string(),
    actorVersion: z.string().optional(),
  }),
  /** Cache identity — evidenceCacheKey(resource). */
  cacheKey: z.string(),
});
export type EvidenceObjectV1 = z.infer<typeof EvidenceObjectV1Schema>;

// ── Pure helpers ────────────────────────────────────────────────────────

/** djb2 — provenance/dedupe hash. Stable, deterministic, not crypto. */
export function rawContentHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/**
 * Conservative access promotion: a provider run failure can NEVER be
 * classified as private/not-found. Only deterministic signals promote.
 * This is the "Apify failed ≠ Private" rule as code.
 */
export function resolveAccessState(args: {
  fetchAttempted: boolean;
  providerSucceeded: boolean;
  /** Deterministic provider-side signals only — never guesses. */
  httpStatus?: number | null;
  explicitAccessSignal?: AccessState | null;
}): AccessState {
  if (args.explicitAccessSignal) return args.explicitAccessSignal;
  if (!args.fetchAttempted) return 'UNKNOWN';
  if (args.providerSucceeded) return 'PUBLIC_FETCHABLE';
  // Any provider failure without an explicit signal stays UNKNOWN —
  // rate limits, proxy failures, actor bugs, geo blocks, and removed
  // content are indistinguishable from here.
  if (args.httpStatus === 404) return 'NOT_FOUND';
  if (args.httpStatus === 410) return 'DELETED';
  if (args.httpStatus === 429) return 'RATE_LIMITED';
  return 'UNKNOWN';
}

/** Operation-key idempotency for provider runs and webhook dispatch. */
export function acquisitionOperationKey(parts: {
  provider: string;
  runId: string;
  datasetId?: string;
  version?: number;
}): string {
  return `acquire:${parts.provider}:${parts.runId}:${parts.datasetId ?? 'none'}:v${parts.version ?? 1}`;
}
