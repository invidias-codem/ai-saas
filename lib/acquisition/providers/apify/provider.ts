// lib/acquisition/providers/apify/provider.ts
// ApifyAcquisitionProvider — the A0 five-op surface, one implementation.
//
// Purity split:
//   PURE  — actor selection, pricing preflight, status mapping, budget math
//   I/O   — ApifyClient operations, INJECTED as ApifyBoundary (tests run
//           deterministic fixtures; production wires apify-client).
//
// Locked invariants:
//   - Actors see canonicalUrl, NEVER the user's raw originalUrl.
//   - One start() = at most one paid Actor run. No hidden fallback actor.
//   - Provider-plane failures NEVER become resource access states
//     (Apify 401/403/404/429 ≠ private/not-found of the social resource).
//   - SUCCEEDED maps to `ingesting`, never `completed` — only a later
//     validation layer may declare completion.
//   - Missing APIFY_API_TOKEN ⇒ supports=false, start refuses: inert.

import {
  ACTOR_REGISTRY,
  selectActor,
  type ApifyActorDefinition,
  type ApifyActorInputContext,
} from './actorRegistry';
import { preflightPricing, type ActorPricingInfo } from './pricing';
import { stableSerialize } from './stableJson';
import { env } from '@/lib/env';
import {
  acquisitionOperationKey,
  rawContentHash,
  type AcquisitionBudget,
  type AcquisitionProvider,
  type AcquisitionRequirement,
  type CanonicalResource,
  type ProviderRun,
  type ProviderRunStatus,
  type RawEvidence,
} from '../../contracts';

// ── Injected Apify surface (fixtures in tests; apify-client in prod) ─────

export interface ApifyRunView {
  id: string;
  actId?: string;
  status: string; // Apify lifecycle: READY..SUCCEEDED/FAILED/TIMED-OUT/ABORTED
  defaultDatasetId?: string;
  options?: { maxItems?: number } & Record<string, unknown>;
  usageTotalUsd?: number;
}

export interface ApifyBoundary {
  /** Fetch current actor pricing metadata. */
  actorPricing(actorId: string): Promise<ActorPricingInfo>;
  /** Start an actor run asynchronously (actor(...).start()). */
  startRun(actorId: string, build: string, input: Record<string, unknown>, runOptions: { maxTotalChargeUsd?: number; maxItems: number }): Promise<ApifyRunView>;
  getRun(runId: string): Promise<ApifyRunView>;
  /** Bounded dataset listing — limit enforced by the caller from the run's recorded options. */
  listDatasetItems(datasetId: string, limit: number): Promise<unknown[]>;
  abortRun(runId: string): Promise<void>;
}

/** Clock injected — no wall-clock reads inside the decision core. */
export interface ProviderClock {
  now(): string;
}

// ── Provider-plane status mapping (locked) ──────────────────────────────

export function mapApifyStatus(apifyStatus: string): ProviderRunStatus {
  switch (apifyStatus) {
    case 'READY':
    case 'INITIALIZING':
      return { status: 'provider_pending' };
    case 'RUNNING':
    case 'ABORTING':
    case 'TIMING-OUT':
      return { status: 'provider_running' };
    case 'SUCCEEDED':
      // Provider acquisition succeeded ≠ Lattice validated evidence.
      return { status: 'ingesting' };
    case 'FAILED':
    case 'TIMED-OUT':
      return { status: 'failed', failure: 'provider_failed' };
    case 'ABORTED':
      return { status: 'failed', failure: 'provider_failed' };
    default:
      return { status: 'failed', failure: 'provider_failed' };
  }
}

// ── Provider error mapping — provider plane, never resource plane ───────

export function mapProviderHttpError(status: number): ProviderRunStatus {
  if (status === 429) return { status: 'failed', failure: 'provider_rate_limited' };
  if (status === 404) return { status: 'failed', failure: 'actor_unavailable' };
  if (status === 401 || status === 403) return { status: 'failed', failure: 'provider_failed' };
  return { status: 'failed', failure: 'provider_failed' };
}

// ── The provider ─────────────────────────────────────────────────────────

export class ApifyAcquisitionProvider implements AcquisitionProvider {
  readonly id = 'apify';
  readonly platforms: readonly ('instagram' | 'threads' | 'reddit' | 'linkedin' | 'tiktok' | 'bluesky' | 'web')[] = [
    'instagram',
    'threads',
    'reddit',
    'linkedin',
    'tiktok',
    'bluesky',
  ];

  constructor(
    private readonly boundary: ApifyBoundary,
    private readonly clock: ProviderClock,
    private readonly registry: readonly ApifyActorDefinition[] = ACTOR_REGISTRY,
    /** Injectable token source; defaults to the centralized env boundary. */
    private readonly token: string | undefined = env.APIFY_API_TOKEN,
  ) {}

  private get tokenConfigured(): boolean {
    return Boolean(this.token);
  }

  async supports(
    resource: CanonicalResource | null,
    requirement: AcquisitionRequirement,
  ): Promise<boolean> {
    if (!this.tokenConfigured) return false;
    if (requirement.mode === 'discovery') return false; // A7 scope
    if (!resource) return false;
    return selectActor({
      registry: this.registry,
      platform: resource.platform,
      resourceType: resource.resourceType,
      mode: 'resource',
    }) !== null;
  }

  async start(
    requirement: AcquisitionRequirement,
    budget: AcquisitionBudget,
  ): Promise<ProviderRun> {
    if (!this.tokenConfigured) {
      throw new Error('apify provider start refused: APIFY_API_TOKEN not configured');
    }
    if (requirement.mode !== 'resource' || !requirement.resource) {
      throw new Error('apify provider start refused: only resource-mode requirements are supported (A2)');
    }
    const resource = requirement.resource;

    const actor = selectActor({
      registry: this.registry,
      platform: resource.platform,
      resourceType: resource.resourceType,
      mode: 'resource',
    });
    if (!actor) {
      throw new Error('apify provider start refused: no enabled actor for this platform/resource');
    }

    // Pricing preflight: Lattice authority computed BEFORE any paid run.
    const pricing = await this.boundary.actorPricing(actor.actorId);
    const decision = preflightPricing({ budget, pricing });
    if (!decision.allowed) {
      throw new Error(`apify provider start refused: ${decision.reason}`);
    }

    // Actor input: canonical identity ONLY. originalUrl never crosses here.
    const inputCtx: ApifyActorInputContext = {
      platform: resource.platform,
      resourceType: resource.resourceType,
      canonicalUrl: resource.canonicalUrl,
      externalId: resource.externalId,
      handle: resource.handle,
      objective: requirement.objective,
      maxRecords: decision.effectiveMaxRecords,
    };
    const input = actor.mapInput(inputCtx);

    // ONE paid run per start(). No fallback actor, no retry chain.
    const run = await this.boundary.startRun(actor.actorId, actor.build, input, decision.runOptions);

    return {
      providerRunId: run.id,
      operationKey: acquisitionOperationKey({ provider: 'apify', runId: run.id, datasetId: run.defaultDatasetId }),
      status: 'provider_running',
    };
  }

  async status(providerRunId: string): Promise<ProviderRunStatus> {
    let run: ApifyRunView;
    try {
      run = await this.boundary.getRun(providerRunId);
    } catch (e: unknown) {
      const status = (e as { statusCode?: number }).statusCode;
      if (typeof status === 'number') return mapProviderHttpError(status);
      throw e;
    }
    const mapped = mapApifyStatus(run.status);
    // Cost: usageTotalUsd is eventually consistent for several seconds
    // after completion — report as ESTIMATE only; A3 reconciles finals.
    return {
      ...mapped,
      datasetId: run.defaultDatasetId,
      estimatedCostUsd: run.usageTotalUsd,
    };
  }

  async collect(providerRunId: string): Promise<RawEvidence[]> {
    const run = await this.boundary.getRun(providerRunId);
    if (run.status !== 'SUCCEEDED') {
      throw new Error(`apify collect refused: run ${providerRunId} not SUCCEEDED (got ${run.status})`);
    }
    if (!run.defaultDatasetId) {
      return []; // actor produced nothing — empty dataset is a valid outcome
    }
    // The budget limit travels WITH the run (recorded maxItems), because
    // the frozen A0 collect() signature has no budget parameter.
    const limit = typeof run.options?.maxItems === 'number' ? run.options.maxItems : 0;
    if (limit <= 0) return [];
    const items = await this.boundary.listDatasetItems(run.defaultDatasetId, limit);

    const retrievedAt = this.clock.now();
    return items.map((item) => ({
      raw: item,
      contentHash: rawContentHash(stableSerialize(item)),
      retrievalMetadata: {
        provider: 'apify',
        providerActorId: run.actId,
        providerRunId: run.id,
        datasetId: run.defaultDatasetId,
        retrievedAt,
      },
    }));
  }

  async cancel(providerRunId: string): Promise<void> {
    // Abort the EXISTING run only — no cascading anything.
    await this.boundary.abortRun(providerRunId);
  }
}
