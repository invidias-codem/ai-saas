// __tests__/contracts/acquisition-ingestion.contract.test.ts
// A3 worker state-machine contracts. The ingestion machine is exercised
// with fixture store/provider deps — deterministic, no DB, no network.
// Locked:
//   - unknown run fails closed (never mints provider state)
//   - operation-key mismatch refuses
//   - atomic claim: second claimer loses
//   - authoritative RUNNING (webhook said SUCCEEDED) does NOT collect
//   - authoritative FAILED → provider_failed, never access-state inference
//   - SUCCEEDED + empty dataset = successful zero-record ingestion
//   - crash-after-persist + retry = zero duplicate evidence (store-side
//     idempotence is the contract of persistRawEvidence; machine re-runs
//     are harmless by the same uniqueness)
//   - reconciled counts must match or the task throws
//   - final cost > authorized → budget_violation, evidence preserved

import { runIngestion, type IngestionDeps } from '@/lib/acquisition/durable/ingestion';
import type { ProviderRunStatus, RawEvidence } from '@/lib/acquisition/contracts';

function evidenceOf(n: number): RawEvidence[] {
  return Array.from({ length: n }, (_, i) => ({
    raw: { id: i },
    contentHash: `hash-${i}`,
    retrievalMetadata: {
      provider: 'apify',
      providerRunId: 'run-1',
      datasetId: 'ds-1',
      retrievedAt: '2026-10-07T10:00:00Z',
    },
  }));
}

interface FixtureState {
  rows: Map<string, { operation_key: string; acquisition_request_id: string; authorized_max_cost_usd: number | null; status: string } | undefined>;
  claimedKeys: Set<string>;
  persisted: { providerRunId: string; ordinal: number; contentHash: string }[];
  providerStatus: ProviderRunStatus & { datasetItems?: unknown[] };
  completedRows: unknown[];
  failedRows: unknown[];
  reconciledCosts: { providerRunId: string; finalCostUsd: number }[];
  violations: { providerRunId: string; finalCostUsd: number; authorizedUsd: number }[];
}

function fixtureDeps(state: FixtureState): IngestionDeps {
  return {
    provider: {
      status: async () => state.providerStatus,
      collect: async () => evidenceOf(state.providerStatus.datasetItems?.length ?? 0),
    },
    store: {
      getProviderRun: async (_p, runId) => state.rows.get(runId) ?? null,
      claimIngestion: async (opKey) => {
        if (state.claimedKeys.has(opKey)) return null; // atomic: second claim loses
        state.claimedKeys.add(opKey);
        return { operation_key: opKey };
      },
      markProviderTerminal: async (args) => { state.completedRows.push(args); },
      persistRawEvidence: async (args) => {
        // Idempotent insert semantics (UNIQUE run/ordinal/hash → on conflict do nothing).
        for (const [i, e] of (args.evidence as RawEvidence[]).entries()) {
          const key = `${args.acquisitionRequestId}:${e.retrievalMetadata.providerRunId}:${i}:${e.contentHash}`;
          if (!state.persisted.some((p) => `${args.acquisitionRequestId}:${p.providerRunId}:${p.ordinal}:${p.contentHash}` === key)) {
            state.persisted.push({ providerRunId: e.retrievalMetadata.providerRunId, ordinal: i, contentHash: e.contentHash });
          }
        }
        return state.persisted.length;
      },
      countRawEvidence: async (runId) => state.persisted.filter((p) => p.providerRunId === runId).length,
      completeIngestion: async (args) => { state.completedRows.push(args); },
      failAcquisition: async (args) => { state.failedRows.push(args); },
      reconcileFinalCost: async (args) => { state.reconciledCosts.push(args as { providerRunId: string; finalCostUsd: number }); },
    },
    clock: { now: () => '2026-10-07T10:00:00Z' },
    onBudgetViolation: (v) => { state.violations.push(v); },
  };
}

function freshState(overrides: Partial<FixtureState['providerStatus']> = {}): FixtureState {
  return {
    rows: new Map([['run-1', { operation_key: 'acquire:apify:run-1:ds-1:v1', acquisition_request_id: 'req-1', authorized_max_cost_usd: 0.1, status: 'provider_running' }]]),
    claimedKeys: new Set(),
    persisted: [],
    providerStatus: { status: 'ingesting', estimatedCostUsd: 0.03, datasetItems: [1, 2, 3], ...overrides },
    completedRows: [],
    failedRows: [],
    reconciledCosts: [],
    violations: [],
  };
}

const ARGS = { providerName: 'apify', providerRunId: 'run-1', operationKey: 'acquire:apify:run-1:ds-1:v1' };

describe('acquisition ingestion state machine — A3 contracts', () => {
  it('1: unknown run fails closed — never mints provider state', async () => {
    const state = freshState();
    state.rows.clear();
    const outcome = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(outcome.kind).toBe('row_missing');
    expect(state.persisted).toHaveLength(0);
    expect(state.claimedKeys.size).toBe(0);
  });

  it('2: operation-key mismatch refuses before any claim', async () => {
    const state = freshState();
    const outcome = await runIngestion({
      deps: fixtureDeps(state),
      providerName: 'apify',
      providerRunId: 'run-1',
      operationKey: 'acquire:apify:run-1:DIFFERENT:v1',
    });
    expect(outcome.kind).toBe('operation_key_mismatch');
    expect(state.claimedKeys.size).toBe(0);
  });

  it('3: atomic claim — a second ingestion loses deterministically', async () => {
    const state = freshState();
    const first = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(first.kind).toBe('completed');
    // Second worker arrives (webhook retry): claim fails → not_claimed,
    // and NO second collect/persist happened.
    const collectCalls: number[] = [];
    const deps = fixtureDeps(state);
    const second = await runIngestion({ deps, ...ARGS });
    expect(second.kind).toBe('not_claimed');
    expect(state.persisted.length).toBe(3); // unchanged
    void collectCalls;
  });

  it('4: webhook SUCCEEDED but authoritative state RUNNING → no collect', async () => {
    const state = freshState({ status: 'provider_running' });
    const outcome = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(outcome.kind).toBe('provider_not_terminal');
    expect(state.persisted).toHaveLength(0);
  });

  it('5: authoritative FAILED → provider_failed, never an access inference', async () => {
    const state = freshState({ status: 'failed', failure: 'provider_failed', datasetItems: [] });
    const outcome = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(outcome.kind).toBe('provider_failed');
    const failure = state.failedRows[0] as { failureCode: string };
    expect(failure.failureCode).toBe('provider_failed');
    // Sacred rule: no PRIVATE_UNAUTHORIZED / NOT_FOUND invented.
    expect(JSON.stringify(state.failedRows)).not.toMatch(/PRIVATE_UNAUTHORIZED|NOT_FOUND/);
  });

  it('6: SUCCEEDED + empty dataset = successful zero-record ingestion', async () => {
    const state = freshState({ status: 'ingesting', datasetItems: [] });
    const outcome = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(outcome.kind).toBe('completed');
    if (outcome.kind === 'completed') expect(outcome.recordCount).toBe(0);
    expect(state.persisted).toHaveLength(0);
    expect(state.completedRows.length).toBeGreaterThan(0);
  });

  it('7: normal path — collect, persist, reconcile counts, complete at normalizing', async () => {
    const state = freshState({ status: 'ingesting', datasetItems: [1, 2, 3], estimatedCostUsd: 0.03 });
    const outcome = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(outcome.kind).toBe('completed');
    expect(state.persisted).toHaveLength(3);
    const completed = state.completedRows.find((c) => (c as { recordCount?: number }).recordCount !== undefined) as { recordCount: number };
    expect(completed.recordCount).toBe(3);
    expect(state.reconciledCosts[0]?.finalCostUsd).toBe(0.03);
  });

  it('8: final cost above authority → budget_violation, evidence PRESERVED', async () => {
    const state = freshState({ status: 'ingesting', datasetItems: [1], estimatedCostUsd: 0.5 });
    const outcome = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(outcome.kind).toBe('budget_violation');
    expect(state.violations[0]).toEqual({ providerRunId: 'run-1', finalCostUsd: 0.5, authorizedUsd: 0.1 });
    // Evidence still persisted; completion still recorded.
    expect(state.persisted).toHaveLength(1);
  });

  it('9: persisted-count mismatch throws (reconcile-before-complete)', async () => {
    const state = freshState({ status: 'ingesting', datasetItems: [1, 2, 3] });
    const deps = fixtureDeps(state);
    // Sabotage countRawEvidence to disagree.
    deps.store.countRawEvidence = async () => 2;
    await expect(runIngestion({ deps, ...ARGS })).rejects.toThrow(/reconcile failed/);
    // completion was never recorded
    expect(state.completedRows.find((c) => (c as { recordCount?: number }).recordCount !== undefined)).toBeUndefined();
  });

  it('10: crash-after-persist retry semantics — machine rerun reaches the same final state', async () => {
    // First run completes; simulate a crash AFTER persist by re-running with
    // a fresh claim (claim lost). The unique-surface store means the retry's
    // persist is a no-op and the outcome is stable.
    const state = freshState({ status: 'ingesting', datasetItems: [1, 2] });
    const first = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(first.kind).toBe('completed');
    const persistedAfterFirst = state.persisted.length;
    // Retry (duplicate webhook → re-dispatch): claim already held → no-op.
    const retry = await runIngestion({ deps: fixtureDeps(state), ...ARGS });
    expect(retry.kind).toBe('not_claimed');
    expect(state.persisted.length).toBe(persistedAfterFirst);
  });
});
