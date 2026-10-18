// __tests__/contracts/acquisition-normalization.contract.test.ts
// A4 wiring contracts (issue #417): the `normalizing` → `completed` transition.
// The orchestrator is exercised with a fixture store and the REAL Threads
// normalizer — deterministic, no DB, no network, no paid runs.
// Locked:
//   - a completed Threads run normalizes raw rows into deterministic EvidenceObjectV1
//   - provenance survives: provider run id, actor id, retrieved-at from raw metadata
//   - idempotent: re-normalization persists zero duplicates (upsert-by-evidence-id)
//   - malformed rows are explicit typed failures; valid rows still normalize (no silent partials)
//   - empty raw dataset → zero evidence, run still completes (A3 empty-dataset=success)
//   - unregistered actor → typed abstention; no evidence fabricated; raw untouched
//   - unknown run → row_missing (fail closed)
//   - terminal write carries normalized count + failures and completes the request

import { runNormalization, type NormalizationStore } from '@/lib/acquisition/durable/normalization';
import { THREADS_ACTOR_REGISTRATION } from '@/lib/acquisition/providers/apify/actorRegistry';
import type { EvidenceObjectV1, RawEvidence } from '@/lib/acquisition/contracts';

const ACTOR = THREADS_ACTOR_REGISTRATION.actorId;
const NOW = '2026-10-18T12:00:00Z';

function postRow(n: number): RawEvidence {
  return {
    raw: {
      type: 'post',
      postId: `P${n}`,
      code: `ABC${n}`,
      username: 'alice',
      text: `post ${n}`,
      likeCount: n,
      url: `https://threads.com/@alice/post/ABC${n}`,
    },
    contentHash: `raw-hash-${n}`,
    retrievalMetadata: {
      provider: 'apify',
      providerActorId: ACTOR,
      providerRunId: 'run-1',
      datasetId: 'ds-1',
      retrievedAt: '2026-10-18T11:00:00Z',
    },
  };
}

const PROFILE_ROW: RawEvidence = {
  raw: { type: 'profile', userId: 'U9', username: 'bob', fullName: 'Bob', url: 'https://threads.com/@bob' },
  contentHash: 'raw-hash-profile',
  retrievalMetadata: {
    provider: 'apify',
    providerActorId: ACTOR,
    providerRunId: 'run-1',
    datasetId: 'ds-1',
    retrievedAt: '2026-10-18T11:00:00Z',
  },
};

interface FixtureState {
  runs: Map<string, {
    acquisition_request_id: string;
    provider_actor_id: string | null;
    dataset_id: string | null;
    status: string;
    failure_code: string | null;
    normalized_count: number | null;
    normalization_failures: unknown | null;
  } | undefined>;
  raw: RawEvidence[];
  normalized: Map<string, EvidenceObjectV1>;
  completed: { providerRunId: string; acquisitionRequestId: string; normalizedCount: number; failures: unknown[] }[];
  unsupported: { providerRunId: string; failureCode: string }[];
  requestStatuses: Map<string, string>;
}

function fixtureStore(state: FixtureState): NormalizationStore {
  return {
    getProviderRun: async (_provider, runId) => state.runs.get(runId) ?? null,
    getRawEvidence: async () => state.raw,
    persistNormalizedEvidence: async (args) => {
      for (const e of args.evidence) state.normalized.set(e.id, e);
      return args.evidence.length;
    },
    completeNormalization: async (args) => {
      const run = state.runs.get(args.providerRunId);
      if (run) {
        run.status = 'completed';
        run.normalized_count = args.normalizedCount;
        run.normalization_failures = args.failures;
        run.failure_code = null;
      }
      state.requestStatuses.set(args.acquisitionRequestId, 'completed');
      state.completed.push(args);
    },
    markNormalizationUnsupported: async (args) => {
      const run = state.runs.get(args.providerRunId);
      if (run) {
        run.status = 'normalization_unsupported';
        run.failure_code = args.failureCode;
      }
      state.unsupported.push(args);
    },
  };
}

function seededState(rows: RawEvidence[]): FixtureState {
  return {
    runs: new Map([
      ['run-1', {
        acquisition_request_id: 'req-uuid-1',
        provider_actor_id: ACTOR,
        dataset_id: 'ds-1',
        status: 'normalizing',
        failure_code: null,
        normalized_count: null,
        normalization_failures: null,
      }],
    ]),
    raw: rows,
    normalized: new Map(),
    completed: [],
    unsupported: [],
    requestStatuses: new Map([['req-uuid-1', 'ingesting']]),
  };
}

describe('A4 normalization wiring', () => {
  test('a completed Threads run normalizes raw rows into deterministic EvidenceObjectV1', async () => {
    const state = seededState([postRow(1), postRow(2), PROFILE_ROW]);
    const outcome = await runNormalization({ store: fixtureStore(state), provider: 'apify', providerRunId: 'run-1', now: NOW });

    expect(outcome).toEqual({ kind: 'completed', normalizedCount: 3, failureCount: 0 });
    expect(state.normalized.size).toBe(3);
    const run = state.runs.get('run-1');
    expect(run?.status).toBe('completed');
    expect(run?.normalized_count).toBe(3);
    expect(state.requestStatuses.get('req-uuid-1')).toBe('completed');
  });

  test('provenance survives: run id, actor id, retrieved-at come from raw evidence metadata', async () => {
    const state = seededState([postRow(1)]);
    await runNormalization({ store: fixtureStore(state), provider: 'apify', providerRunId: 'run-1', now: NOW });

    const evidence = [...state.normalized.values()][0];
    expect(evidence.source.providerRunId).toBe('run-1');
    expect(evidence.source.providerActorId).toBe(ACTOR);
    expect(evidence.source.platform).toBe('threads');
    expect(evidence.temporal.retrievedAt).toBe('2026-10-18T11:00:00Z');
    expect(evidence.provenance.rawHash).toBeTruthy();
    expect(evidence.acquisitionRequestId).toBe('req-uuid-1');
  });

  test('re-normalization persists zero duplicates (idempotent by evidence id)', async () => {
    const state = seededState([postRow(1), postRow(2)]);
    const store = fixtureStore(state);
    await runNormalization({ store, provider: 'apify', providerRunId: 'run-1', now: NOW });
    await runNormalization({ store, provider: 'apify', providerRunId: 'run-1', now: NOW });

    expect(state.normalized.size).toBe(2); // no duplicates — same deterministic ids
  });

  test('malformed rows are explicit typed failures; valid rows still normalize', async () => {
    const malformed: RawEvidence = {
      raw: { fullName: 'no identity fields' },
      contentHash: 'raw-hash-bad',
      retrievalMetadata: {
        provider: 'apify',
        providerActorId: ACTOR,
        providerRunId: 'run-1',
        datasetId: 'ds-1',
        retrievedAt: '2026-10-18T11:00:00Z',
      },
    };
    const state = seededState([postRow(1), malformed, postRow(2)]);
    const outcome = await runNormalization({ store: fixtureStore(state), provider: 'apify', providerRunId: 'run-1', now: NOW });

    expect(outcome).toEqual({ kind: 'completed', normalizedCount: 2, failureCount: 1 });
    expect(state.normalized.size).toBe(2);
    const run = state.runs.get('run-1');
    const failures = run?.normalization_failures as { rowIndex: number; error: string }[];
    expect(failures).toHaveLength(1);
    expect(failures[0].rowIndex).toBe(1);
    expect(failures[0].error.toLowerCase()).toContain('identity');
  });

  test('empty raw dataset completes with zero evidence (A3 invariant preserved)', async () => {
    const state = seededState([]);
    const outcome = await runNormalization({ store: fixtureStore(state), provider: 'apify', providerRunId: 'run-1', now: NOW });

    expect(outcome).toEqual({ kind: 'completed', normalizedCount: 0, failureCount: 0 });
    expect(state.normalized.size).toBe(0);
    expect(state.runs.get('run-1')?.status).toBe('completed');
    expect(state.requestStatuses.get('req-uuid-1')).toBe('completed');
  });

  test('unregistered actor abstains typed; no evidence fabricated; raw untouched', async () => {
    const state = seededState([postRow(1)]);
    state.runs.get('run-1')!.provider_actor_id = 'someone/other-actor';

    const outcome = await runNormalization({ store: fixtureStore(state), provider: 'apify', providerRunId: 'run-1', now: NOW });

    expect(outcome).toEqual({ kind: 'normalizer_unregistered', actorId: 'someone/other-actor' });
    expect(state.normalized.size).toBe(0);
    const run = state.runs.get('run-1');
    expect(run?.status).toBe('normalization_unsupported');
    expect(run?.failure_code).toBe('normalizer_unregistered');
    expect(state.raw).toHaveLength(1); // raw evidence never mutated or deleted
  });

  test('unknown run fails closed', async () => {
    const state = seededState([postRow(1)]);
    const outcome = await runNormalization({ store: fixtureStore(state), provider: 'apify', providerRunId: 'nope', now: NOW });

    expect(outcome).toEqual({ kind: 'row_missing' });
    expect(state.normalized.size).toBe(0);
    expect(state.completed).toHaveLength(0);
    expect(state.unsupported).toHaveLength(0);
  });
});
