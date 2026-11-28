// __tests__/contracts/acquisition-apify-provider.contract.test.ts
// A2 provider contracts:
//   - missing token ⇒ supports=false, start refuses (inert integration)
//   - budget/pricing preflight: PPE gets authorized maxTotalChargeUsd; PPR
//     computes price-aware maxItems; actor minimum > budget ⇒ refuse;
//     maxActors=0 ⇒ refuse
//   - one start() = at most one paid run (no hidden actor fallback)
//   - provider 404/401/403/429 never promotes resource access states
//   - SUCCEEDED → ingesting, never completed
//   - collect bounded by the run's recorded maxItems; hashes deterministic
//   - cancel aborts the existing run only
//   - status cost reported as estimate only

import {
  ApifyAcquisitionProvider,
  type ApifyBoundary,
  type ApifyRunView,
} from '@/lib/acquisition/providers/apify/provider';
import { preflightPricing, type ActorPricingInfo } from '@/lib/acquisition/providers/apify/pricing';
import { stableSerialize } from '@/lib/acquisition/providers/apify/stableJson';
import { rawContentHash, type AcquisitionBudget, type CanonicalResource } from '@/lib/acquisition/contracts';
import type { ApifyActorDefinition } from '@/lib/acquisition/providers/apify/actorRegistry';

// ── fixtures ────────────────────────────────────────────────────────────

function fixtureRegistry(): ApifyActorDefinition[] {
  return [
    {
      key: 'threads-post',
      actorId: 'apify/threads-scraper',
      build: '1.2.345',
      enabled: true,
      modes: ['resource'],
      platforms: ['threads'],
      resourceTypes: ['post'],
      priority: 10,
      mapInput: (i) => ({ startUrls: [i.canonicalUrl], resultsLimit: i.maxRecords }),
    },
  ];
}

function boundaryFixture(over: Partial<ApifyBoundary> = {}): ApifyBoundary {
  return {
    actorPricing: async () => ({ pricingModel: 'FREE' }) as ActorPricingInfo,
    startRun: async (_actorId, _build, input, runOptions) => ({
      id: 'run-1',
      actId: 'apify/threads-scraper',
      status: 'SUCCEEDED',
      defaultDatasetId: 'ds-1',
      options: { maxItems: runOptions.maxItems, input },
    }),
    getRun: async (id) => ({
      id,
      actId: 'apify/threads-scraper',
      status: 'SUCCEEDED',
      defaultDatasetId: 'ds-1',
      options: { maxItems: 25 },
      usageTotalUsd: 0.03,
    }),
    listDatasetItems: async (_ds, limit) => Array.from({ length: Math.min(limit, 3) }, (_, i) => ({ id: `item-${i}`, text: `content ${i}` })),
    abortRun: async () => undefined,
    ...over,
  };
}

const resource: CanonicalResource = {
  platform: 'threads',
  resourceType: 'post',
  originalUrl: 'https://threads.com/@alice/post/ABC?xmt=secret-tracking',
  canonicalUrl: 'https://threads.com/@alice/post/ABC',
  externalId: 'ABC',
  handle: 'alice',
};

const budget: AcquisitionBudget = {
  maxProviderCostUsd: 0.1,
  maxRecords: 25,
  maxActors: 1,
  maxSources: 2,
  deadlineMs: 120_000,
  cacheAllowed: true,
};

const clock = { now: () => '2026-10-06T10:00:00Z' };

function makeProvider(over: Partial<ApifyBoundary> = {}, withToken = true) {
  const provider = new ApifyAcquisitionProvider(
    boundaryFixture(over),
    clock,
    fixtureRegistry(),
    withToken ? 'test-token' : undefined,
  );
  return { provider, restore: () => undefined };
}

const requirement = { mode: 'resource' as const, resource, objective: 'research' as const };

describe('apify provider — A2 contracts', () => {
  afterEach(() => {
    // env restored per-test by makeProvider closures
  });

  it('1: missing token ⇒ supports=false and start refuses (inert)', async () => {
    const { provider, restore } = makeProvider({}, false);
    try {
      expect(await provider.supports(resource, requirement)).toBe(false);
      await expect(provider.start(requirement, budget)).rejects.toThrow(/APIFY_API_TOKEN/);
    } finally {
      restore();
    }
  });

  it('2: token + matching actor ⇒ supports=true; actor input gets canonical identity only', async () => {
    const seenInputs: Record<string, unknown>[] = [];
    const { provider, restore } = makeProvider({
      startRun: async (_a, _b, input, ro) => {
        seenInputs.push(input);
        return { id: 'run-9', status: 'SUCCEEDED', defaultDatasetId: 'ds-9', options: { maxItems: ro.maxItems, input } };
      },
    });
    try {
      expect(await provider.supports(resource, requirement)).toBe(true);
      const run = await provider.start(requirement, budget);
      expect(run.providerRunId).toBe('run-9');
      expect(run.status).toBe('provider_running');
      expect(run.operationKey).toContain('acquire:apify:run-9');
      // THE invariant: Apify saw canonicalUrl, never the raw originalUrl.
      const serialized = JSON.stringify(seenInputs[0]);
      expect(serialized).toContain('https://threads.com/@alice/post/ABC');
      expect(serialized).not.toContain('xmt=secret-tracking');
      expect(serialized).not.toContain(resource.originalUrl);
    } finally {
      restore();
    }
  });

  it('3: pricing preflight — PPE gets authorized charge; PPR computes price-aware items; minimums refuse', () => {
    const b: AcquisitionBudget = { ...budget, maxProviderCostUsd: 0.1 };
    // FREE → proceed with maxRecords
    expect(preflightPricing({ budget: b, pricing: { pricingModel: 'FREE' } })).toEqual({
      allowed: true, runOptions: { maxItems: 25 }, effectiveMaxRecords: 25,
    });
    // PAY_PER_EVENT → authorized maxTotalChargeUsd carried
    const ppe = preflightPricing({ budget: b, pricing: { pricingModel: 'PAY_PER_EVENT' } });
    expect(ppe.allowed).toBe(true);
    if (ppe.allowed) expect(ppe.runOptions.maxTotalChargeUsd).toBe(0.1);
    // PAY_PER_EVENT with actor minimum ABOVE authority → refuse
    expect(preflightPricing({ budget: b, pricing: { pricingModel: 'PAY_PER_EVENT', minimalMaxTotalChargeUsd: 0.5 } }).allowed).toBe(false);
    // PRICE_PER_DATASET_ITEM at $0.02/item → floor(0.10/0.02)=5 items
    const ppr = preflightPricing({ budget: b, pricing: { pricingModel: 'PRICE_PER_DATASET_ITEM', pricePerUnitUsd: 0.02 } });
    expect(ppr.allowed).toBe(true);
    if (ppr.allowed) expect(ppr.runOptions.maxItems).toBe(5);
    // unit price makes nothing affordable → refuse
    expect(preflightPricing({ budget: b, pricing: { pricingModel: 'PRICE_PER_DATASET_ITEM', pricePerUnitUsd: 5 } }).allowed).toBe(false);
    // missing unit price → cannot bound → refuse
    expect(preflightPricing({ budget: b, pricing: { pricingModel: 'PRICE_PER_DATASET_ITEM' } }).allowed).toBe(false);
    // maxActors=0 → refuse regardless
    expect(preflightPricing({ budget: { ...b, maxActors: 0 }, pricing: { pricingModel: 'FREE' } }).allowed).toBe(false);
  });

  it('4: one start() = exactly one paid run; budget refusal happens BEFORE any run', async () => {
    let starts = 0;
    const { provider, restore } = makeProvider({
      actorPricing: async () => ({ pricingModel: 'PAY_PER_EVENT', minimalMaxTotalChargeUsd: 5 }),
      startRun: async () => { starts += 1; return { id: 'should-not-happen' } as ApifyRunView; },
    });
    try {
      await expect(provider.start(requirement, budget)).rejects.toThrow(/provider_budget_exceeded/);
      expect(starts).toBe(0); // no paid run was ever created
    } finally {
      restore();
    }
  });

  it('5: provider-plane failures never become resource access states', async () => {
    const { provider, restore } = makeProvider({
      getRun: async () => { const e: Error & { statusCode?: number } = new Error('apify api 429'); e.statusCode = 429; throw e; },
    });
    try {
      const s = await provider.status('run-1');
      expect(s.status).toBe('failed');
      expect(s.failure).toBe('provider_rate_limited');
      // The locked rule: no PRIVATE_UNAUTHORIZED / NOT_FOUND inference here.
      expect(s.failure).not.toMatch(/private|not.?found/i);
    } finally {
      restore();
    }
  });

  it('6: SUCCEEDED maps to ingesting — never completed; cost is an estimate', async () => {
    const { provider, restore } = makeProvider();
    try {
      const s = await provider.status('run-1');
      expect(s.status).toBe('ingesting');
      expect(s.estimatedCostUsd).toBe(0.03);
    } finally {
      restore();
    }
  });

  it('7: collect bounded by the run\'s recorded maxItems; hashes deterministic', async () => {
    const { provider, restore } = makeProvider();
    try {
      const evidence = await provider.collect('run-1');
      expect(evidence.length).toBe(3); // fixture returns 3, limit 25
      evidence.forEach((e, i) => {
        expect(e.retrievalMetadata.provider).toBe('apify');
        expect(e.retrievalMetadata.providerRunId).toBe('run-1');
        expect(e.retrievalMetadata.datasetId).toBe('ds-1');
        // hash matches THIS item's content, regardless of key insertion order
        expect(e.contentHash).toBe(rawContentHash(stableSerialize({ id: `item-${i}`, text: `content ${i}` })));
        const reordered = { text: `content ${i}`, id: `item-${i}` };
        expect(rawContentHash(stableSerialize(reordered))).toBe(e.contentHash);
      });
      // non-succeeded run refuses collection
      const { provider: p2, restore: r2 } = makeProvider({
        getRun: async (id) => ({ id, status: 'RUNNING', defaultDatasetId: 'ds-x' }),
      });
      try {
        await expect(p2.collect('run-x')).rejects.toThrow(/not SUCCEEDED/);
      } finally { r2(); }
    } finally {
      restore();
    }
  });

  it('8: cancel aborts the existing run only — no cascade', async () => {
    const aborted: string[] = [];
    const { provider, restore } = makeProvider({
      abortRun: async (id) => { aborted.push(id); },
    });
    try {
      await provider.cancel('run-42');
      expect(aborted).toEqual(['run-42']);
    } finally {
      restore();
    }
  });
});
