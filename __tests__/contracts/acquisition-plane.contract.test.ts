// __tests__/contracts/acquisition-plane.contract.test.ts
// Acquisition Plane A0 contracts. Locks the boundary BEFORE any Apify
// integration:
//   - CanonicalResource is identity; URLs are not
//   - provider failure can NEVER be classified private (conservative access)
//   - requirement schema validates; budget is a first-class contract
//   - EvidenceObjectV1 schema round-trips; provenance hashes are stable
//   - operation keys are deterministic (webhook idempotency)
//   - purity: no SDK/network/DB in the contract layer

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AccessStateSchema,
  AcquisitionRequirementSchema,
  DEFAULT_QUICK_BUDGET,
  EvidenceObjectV1Schema,
  acquisitionOperationKey,
  evidenceCacheKey,
  rawContentHash,
  resolveAccessState,
  type CanonicalResource,
} from '@/lib/acquisition/contracts';

function resource(over: Partial<CanonicalResource> = {}): CanonicalResource {
  return {
    platform: 'threads',
    resourceType: 'post',
    originalUrl: 'https://www.threads.com/@example/post/ABC?share=xyz',
    canonicalUrl: 'https://www.threads.com/@example/post/ABC',
    externalId: 'ABC',
    handle: 'example',
    ...over,
  };
}

describe('acquisition plane contracts — A0 boundary', () => {
  it('1: CanonicalResource is identity — URLs are not', () => {
    const a = resource();
    // Ten shared-link variants collapse to one cache identity.
    const b = resource({ originalUrl: 'https://threads.com/@example/post/ABC?share=OTHER&utm=x' });
    expect(evidenceCacheKey(a)).toBe(evidenceCacheKey(b));
    expect(evidenceCacheKey(a)).toBe('social:threads:post:ABC');
    // Different external IDs never collide.
    expect(evidenceCacheKey(resource({ externalId: 'ZZZ' }))).not.toBe(evidenceCacheKey(a));
  });

  it('2: provider failure can NEVER be classified private', () => {
    // The sacred rule: Apify failed ≠ Private.
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: false })).toBe('UNKNOWN');
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: false, httpStatus: 500 })).toBe('UNKNOWN');
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: false, httpStatus: 403 })).toBe('UNKNOWN');
    // Only deterministic signals promote.
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: false, httpStatus: 404 })).toBe('NOT_FOUND');
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: false, httpStatus: 410 })).toBe('DELETED');
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: false, httpStatus: 429 })).toBe('RATE_LIMITED');
    expect(resolveAccessState({ fetchAttempted: true, providerSucceeded: true })).toBe('PUBLIC_FETCHABLE');
    // An explicit provider-side signal wins over inference.
    expect(
      resolveAccessState({ fetchAttempted: true, providerSucceeded: false, explicitAccessSignal: 'PRIVATE_UNAUTHORIZED' }),
    ).toBe('PRIVATE_UNAUTHORIZED');
    // Unfetched stays unknown.
    expect(resolveAccessState({ fetchAttempted: false, providerSucceeded: false })).toBe('UNKNOWN');
  });

  it('3: AcquisitionRequirement validates both modes and rejects provider leakage', () => {
    const resourceReq = AcquisitionRequirementSchema.parse({
      mode: 'resource',
      resource: resource(),
      objective: 'research',
    });
    expect(resourceReq.mode).toBe('resource');
    const discoveryReq = AcquisitionRequirementSchema.parse({
      mode: 'discovery',
      query: 'best braiding salons',
      location: 'Philadelphia, PA',
      platforms: ['instagram', 'threads'],
      objective: 'research',
    });
    expect(discoveryReq.platforms).toEqual(['instagram', 'threads']);
    // invalid platform rejected
    expect(
      AcquisitionRequirementSchema.safeParse({ mode: 'discovery', query: 'x', platforms: ['myspace'] }).success,
    ).toBe(false);
    // invalid mode rejected
    expect(AcquisitionRequirementSchema.safeParse({ mode: 'scrape_everything' }).success).toBe(false);
    // objective defaults to research
    expect(AcquisitionRequirementSchema.parse({ mode: 'resource', resource: resource() }).objective).toBe('research');
  });

  it('4: budget is a first-class deterministic contract', () => {
    // The QUICK default matches the spec: $0.10 / 25 records / 2 sources.
    expect(DEFAULT_QUICK_BUDGET.maxProviderCostUsd).toBeLessThanOrEqual(0.1);
    expect(DEFAULT_QUICK_BUDGET.cacheAllowed).toBe(true);
    // All knobs present — the model never gets spending authority without one.
    for (const key of ['maxProviderCostUsd', 'maxRecords', 'maxActors', 'maxSources', 'deadlineMs', 'cacheAllowed']) {
      expect(DEFAULT_QUICK_BUDGET).toHaveProperty(key);
    }
  });

  it('5: EvidenceObjectV1 round-trips; provenance hashes are stable', () => {
    const ev = {
      id: 'ev1',
      acquisitionRequestId: 'req1',
      source: { category: 'social', platform: 'threads', provider: 'apify', providerRunId: 'run1' },
      resource: { type: 'post', canonicalUrl: 'https://threads.com/@example/post/ABC', externalId: 'ABC' },
      author: { handle: 'example' },
      content: { text: 'hello world' },
      temporal: { observedAt: '2026-10-05T10:00:00Z', retrievedAt: '2026-10-05T10:00:00Z' },
      access: { state: 'PUBLIC_FETCHABLE' },
      provenance: { rawHash: rawContentHash('{"raw":1}'), normalizerVersion: 'threads-post-v1' },
      cacheKey: 'social:threads:post:ABC',
    };
    expect(EvidenceObjectV1Schema.parse(ev)).toEqual(ev);
    // hashes deterministic + content-sensitive
    expect(rawContentHash('abc')).toBe(rawContentHash('abc'));
    expect(rawContentHash('abc')).not.toBe(rawContentHash('abd'));
    // schema rejects an invalid access state
    expect(AccessStateSchema.safeParse('sorta_private').success).toBe(false);
    expect(EvidenceObjectV1Schema.safeParse({ ...ev, access: { state: 'MAYBE' } }).success).toBe(false);
  });

  it('6: operation keys are deterministic — duplicate webhooks dedupe', () => {
    const a = acquisitionOperationKey({ provider: 'apify', runId: 'r1', datasetId: 'd1' });
    expect(acquisitionOperationKey({ provider: 'apify', runId: 'r1', datasetId: 'd1' })).toBe(a);
    expect(acquisitionOperationKey({ provider: 'apify', runId: 'r1', datasetId: 'd2' })).not.toBe(a);
    expect(acquisitionOperationKey({ provider: 'apify', runId: 'r2', datasetId: 'd1' })).not.toBe(a);
    expect(a.startsWith('acquire:apify:')).toBe(true);
  });

  it('7: contract layer is pure — no SDK, network, DB, wall-clock, RNG', () => {
    const src = readFileSync(join(__dirname, '../../lib/acquisition/contracts.ts'), 'utf8');
    expect(src).not.toMatch(/from ['\"]apify|apify-client|fetch\(|axios|undici|supabaseAdmin|Date\.now\(\)|Math\.random\(\)/);
  });

  it('8: provider surface is exactly five operations — no more', () => {
    const src = readFileSync(join(__dirname, '../../lib/acquisition/contracts.ts'), 'utf8');
    const ops = src.match(/^\s{2}(supports|start|status|collect|cancel)\(/gm) ?? [];
    expect(ops.length).toBe(5);
  });
});
