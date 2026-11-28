// lib/acquisition/durable/ingestion.ts
// A3 worker state machine. Deterministic; the Trigger task is a thin shell.
//
// Locked order:
//   load provider row (fail closed on unknown) → verify operationKey →
//   atomic claim (duplicates lose) → RE-READ authoritative provider state →
//   failed? map provider_failed (never access states) →
//   succeeded? collect → persist (idempotent) → reconcile counts →
//   complete at `normalizing` (A4 owns completed).
//
// Empty dataset = successful zero-record ingestion, NOT failure.

import type { AcquisitionProvider } from '../contracts';

export type IngestionOutcome =
  | { kind: 'completed'; recordCount: number }
  | { kind: 'already_done' }
  | { kind: 'not_claimed' } // another worker owns the ingestion
  | { kind: 'row_missing' } // unsolicited webhook — retryable, never minted
  | { kind: 'operation_key_mismatch' }
  | { kind: 'provider_failed'; failureCode: 'provider_failed' }
  | { kind: 'provider_not_terminal' } // authoritative state still RUNNING etc.
  | { kind: 'budget_violation'; finalCostUsd: number; authorizedUsd: number };

export interface IngestionDeps {
  provider: Pick<AcquisitionProvider, 'status' | 'collect'>;
  store: {
    getProviderRun(provider: string, providerRunId: string): Promise<{
      operation_key: string | null;
      acquisition_request_id: string;
      authorized_max_cost_usd: number | null;
      status: string;
    } | null>;
    claimIngestion(operationKey: string): Promise<unknown | null>;
    markProviderTerminal(args: Record<string, unknown>): Promise<void>;
    persistRawEvidence(args: { acquisitionRequestId: string; evidence: unknown[]; now: string }): Promise<number>;
    countRawEvidence(providerRunId: string): Promise<number>;
    completeIngestion(args: Record<string, unknown>): Promise<void>;
    failAcquisition(args: Record<string, unknown>): Promise<void>;
    reconcileFinalCost(args: Record<string, unknown>): Promise<void>;
  };
  clock: { now(): string };
  onBudgetViolation?: (args: { providerRunId: string; finalCostUsd: number; authorizedUsd: number }) => void;
}

export async function runIngestion(args: {
  deps: IngestionDeps;
  providerName: string;
  providerRunId: string;
  operationKey: string;
}): Promise<IngestionOutcome> {
  const { deps, providerName, providerRunId, operationKey } = args;

  // Step 1: load the persisted row. Unknown run ⇒ fail closed (retryable).
  // The worker NEVER mints provider state from webhook contents.
  const row = await deps.store.getProviderRun(providerName, providerRunId);
  if (!row) return { kind: 'row_missing' };

  // Step 2: stored operation_key must match the dispatch key.
  if (row.operation_key !== operationKey) return { kind: 'operation_key_mismatch' };

  // Step 3: atomic claim. Already ingesting/terminal ⇒ not claimed.
  const claimed = await deps.store.claimIngestion(operationKey);
  if (!claimed) {
    // Already-claimed paths: could be genuinely mid-ingestion or terminal.
    return { kind: 'not_claimed' };
  }

  // Step 4: re-read AUTHORITATIVE provider state — the webhook is only a
  // wake-up. RUNNING/READY here is legitimate (webhook timing ≠ truth).
  const current = await deps.provider.status(providerRunId);
  if (current.status === 'provider_pending' || current.status === 'provider_running') {
    return { kind: 'provider_not_terminal' };
  }

  // Step 5: authoritative provider failure → provider_failed. NEVER an
  // access-state inference (A0: provider failed ≠ private).
  if (current.status === 'failed') {
    await deps.store.markProviderTerminal({
      provider: providerName,
      providerRunId,
      status: 'failed',
      failureCode: current.failure ?? 'provider_failed',
      failureMessage: null,
      estimatedCostUsd: current.estimatedCostUsd ?? null,
    });
    await deps.store.failAcquisition({
      provider: providerName,
      providerRunId,
      failureCode: current.failure ?? 'provider_failed',
      failureMessage: null,
    });
    return { kind: 'provider_failed', failureCode: 'provider_failed' };
  }

  // Step 6: SUCCEEDED ⇒ collect. Empty dataset is a VALID zero-record
  // acquisition, not failure.
  const evidence = await deps.provider.collect(providerRunId);

  // Step 7: persist idempotently; reconcile persisted == collected.
  const now = deps.clock.now();
  await deps.store.persistRawEvidence({
    acquisitionRequestId: row.acquisition_request_id,
    evidence,
    now,
  });
  const persisted = await deps.store.countRawEvidence(providerRunId);
  if (persisted !== evidence.length) {
    throw new Error(`ingestion reconcile failed: collected ${evidence.length}, persisted ${persisted}`);
  }

  // Step 8: complete at `normalizing` — A4 owns the transition to completed.
  await deps.store.completeIngestion({
    provider: providerName,
    providerRunId,
    recordCount: evidence.length,
  });

  // Step 9: cost reconciliation. Post-settlement value populates
  // final_cost_usd; a value above authority is a governance violation —
  // telemetry only, evidence is NEVER deleted retroactively.
  const estimated = current.estimatedCostUsd ?? null;
  if (estimated !== null) {
    await deps.store.reconcileFinalCost({ provider: providerName, providerRunId, finalCostUsd: estimated });
    const authorized = row.authorized_max_cost_usd;
    if (authorized !== null && estimated > authorized) {
      deps.onBudgetViolation?.({ providerRunId, finalCostUsd: estimated, authorizedUsd: authorized });
      return { kind: 'budget_violation', finalCostUsd: estimated, authorizedUsd: authorized };
    }
  }

  return { kind: 'completed', recordCount: evidence.length };
}
