// lib/acquisition/durable/normalization.ts
// A4 wiring (issue #417): the `normalizing` → `completed` transition.
// A3's runIngestion parks a successful run at `normalizing` and hands the
// transition to A4. This orchestrator reads the staged raw evidence for a
// run, dispatches by ACTOR to the platform normalizer, persists canonical
// EvidenceObjectV1 idempotently (upsert by deterministic evidence id), and
// completes the run + request. Raw evidence is never mutated or deleted.
//
// Locked invariants (see __tests__/contracts/acquisition-normalization.contract.test.ts):
//   - deterministic evidence identity → duplicate normalization is a no-op
//   - malformed rows are explicit typed failures; valid rows still normalize
//   - empty dataset = successful zero-evidence completion (A3 invariant)
//   - unregistered actor → typed abstention, never a guessed interpretation
//   - unknown run fails closed

import { THREADS_ACTOR_REGISTRATION } from '@/lib/acquisition/providers/apify/actorRegistry';
import { normalizeThreadsDataset } from '@/lib/acquisition/providers/apify/threadsNormalizer';
import type { EvidenceObjectV1, RawEvidence } from '@/lib/acquisition/contracts';

export interface NormalizationRunRow {
  acquisition_request_id: string;
  provider_actor_id: string | null;
  dataset_id: string | null;
  status: string;
}

export interface NormalizationStore {
  getProviderRun(provider: string, providerRunId: string): Promise<NormalizationRunRow | null>;
  getRawEvidence(providerRunId: string): Promise<RawEvidence[]>;
  persistNormalizedEvidence(args: { evidence: EvidenceObjectV1[]; rawContentHashes: string[] }): Promise<number>;
  completeNormalization(args: {
    provider: string;
    providerRunId: string;
    acquisitionRequestId: string;
    normalizedCount: number;
    failures: { rowIndex: number; error: string }[];
    now: string;
  }): Promise<void>;
  markNormalizationUnsupported(args: { provider: string; providerRunId: string; failureCode: string; now: string }): Promise<void>;
}

export type NormalizationOutcome =
  | { kind: 'row_missing' }
  | { kind: 'normalizer_unregistered'; actorId: string }
  | { kind: 'completed'; normalizedCount: number; failureCount: number };

export async function runNormalization(args: {
  store: NormalizationStore;
  provider: string;
  providerRunId: string;
  now: string;
}): Promise<NormalizationOutcome> {
  const row = await args.store.getProviderRun(args.provider, args.providerRunId);
  if (!row) return { kind: 'row_missing' };

  const actorId = row.provider_actor_id;
  // Dispatch by actor. Exactly one vertical exists today; anything else
  // abstains typed rather than guessing an interpretation.
  if (actorId !== THREADS_ACTOR_REGISTRATION.actorId) {
    await args.store.markNormalizationUnsupported({
      provider: args.provider,
      providerRunId: args.providerRunId,
      failureCode: 'normalizer_unregistered',
      now: args.now,
    });
    return { kind: 'normalizer_unregistered', actorId: actorId ?? 'unknown' };
  }

  const raw = await args.store.getRawEvidence(args.providerRunId);
  const { evidence, failures } = normalizeThreadsDataset(raw, {
    providerRunId: args.providerRunId,
    datasetId: row.dataset_id ?? undefined,
    providerActorId: actorId,
    acquisitionRequestId: row.acquisition_request_id,
    retrievedAt: raw[0]?.retrievalMetadata.retrievedAt ?? args.now,
    providerRunSucceeded: true,
  });

  // Pair each normalized evidence with its source raw row hash (failed rows
  // are skipped in ordinal order) so provenance joins survive storage.
  const failedIndexes = new Set(failures.map((f) => f.rowIndex));
  const rawContentHashes = raw
    .map((r, i) => (failedIndexes.has(i) ? null : r.contentHash))
    .filter((h): h is string => h !== null);

  await args.store.persistNormalizedEvidence({ evidence, rawContentHashes });
  await args.store.completeNormalization({
    provider: args.provider,
    providerRunId: args.providerRunId,
    acquisitionRequestId: row.acquisition_request_id,
    normalizedCount: evidence.length,
    failures,
    now: args.now,
  });

  return { kind: 'completed', normalizedCount: evidence.length, failureCount: failures.length };
}
