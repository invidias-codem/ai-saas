// Research Plane — R0: Provenance event recording.
//
// Append-only event log with stable sequencing and content hashing.
// Pure: no I/O. Callers persist events and pass the existing log back for
// each new event.

import type { ProvenanceEvent } from '@/lib/research/contracts';
import { makeProvenanceEvent, verifyProvenanceChain } from '@/lib/research/evidence';

/**
 * Append a provenance event to an existing log. Returns the new event and
 * the updated log.
 *
 * Fail-closed: if the existing log's chain is invalid, throws rather than
 * appending to a tampered log.
 */
export function appendProvenanceEvent(input: {
  existingLog: readonly ProvenanceEvent[];
  eventId: string;
  runId: string;
  eventType: ProvenanceEvent['eventType'];
  actor: string;
  actorRole: ProvenanceEvent['actorRole'];
  timestamp: string;
  metadata: Record<string, unknown>;
}): { readonly event: ProvenanceEvent; readonly log: ProvenanceEvent[] } {
  const chainCheck = verifyProvenanceChain(input.existingLog);
  if (!chainCheck.valid) {
    throw new Error(
      `Provenance chain invalid at seq ${chainCheck.failure?.seq}: ${chainCheck.failure?.reason}`,
    );
  }

  const seq = input.existingLog.length;
  const previousHash =
    input.existingLog.length === 0 ? null : input.existingLog[input.existingLog.length - 1].contentHash;

  const event = makeProvenanceEvent({
    eventId: input.eventId,
    runId: input.runId,
    seq,
    eventType: input.eventType,
    actor: input.actor,
    actorRole: input.actorRole,
    timestamp: input.timestamp,
    previousHash,
    metadata: input.metadata,
  });

  return { event, log: [...input.existingLog, event] };
}

/**
 * Verify the full provenance log for a run. Returns the last event hash
 * (for manifest binding) if valid.
 */
export function verifyProvenanceLog(log: readonly ProvenanceEvent[]): {
  readonly valid: boolean;
  readonly lastEventHash: string | null;
  readonly failure?: { seq: number; reason: string };
} {
  const check = verifyProvenanceChain(log);
  if (!check.valid) return { valid: false, lastEventHash: null, failure: check.failure };
  const lastEventHash =
    log.length === 0 ? null : log[log.length - 1].contentHash;
  return { valid: true, lastEventHash };
}
