// lib/research/provenance.ts
// Research Plane — R0 provenance log validation.
// Pure, no I/O, no Supabase, no network.

import {
  ResearchPlaneError,
  sha256Json,
} from './contracts';
import { type ProvenanceEvent, verifyProvenanceChain } from './evidence';

export interface ProvenanceLogResult {
  valid: boolean;
  lastEventHash: string;
}

export function appendProvenanceEvent(input: {
  existingLog: ProvenanceEvent[];
  eventId: string;
  runId: string;
  eventType: string;
  actor: string;
  actorRole: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}): ProvenanceEvent[] {
  const { existingLog } = input;
  // Validate existing chain first
  const chainCheck = verifyProvenanceLog(existingLog);
  if (!chainCheck.valid) {
    throw new ResearchPlaneError('Invalid existing provenance chain', 'INVALID_CHAIN');
  }

  const last = existingLog[existingLog.length - 1];
  const previousHash = last ? last.contentHash : null;
  const seq = last ? last.seq + 1 : 0;

  // New event must belong to the same run as the existing log
  if (existingLog.length > 0 && input.runId !== existingLog[0].runId) {
    throw new ResearchPlaneError('Run ID mismatch', 'RUN_ID_MISMATCH');
  }

  const newEvent: ProvenanceEvent = {
    eventId: input.eventId,
    runId: input.runId,
    seq,
    eventType: input.eventType,
    actor: input.actor,
    actorRole: input.actorRole,
    timestamp: input.timestamp,
    previousHash,
    contentHash: sha256Json({
      eventId: input.eventId,
      runId: input.runId,
      seq,
      eventType: input.eventType,
      actor: input.actor,
      actorRole: input.actorRole,
      timestamp: input.timestamp,
      previousHash,
      metadata: input.metadata,
    }),
    metadata: input.metadata,
  };

  return [...existingLog, newEvent];
}

export function verifyProvenanceLog(events: ProvenanceEvent[]): ProvenanceLogResult {
  if (events.length === 0) {
    return { valid: true, lastEventHash: '' };
  }
  const result = verifyProvenanceChain(events);
  if (!result.valid) {
    return { valid: false, lastEventHash: '' };
  }
  return { valid: true, lastEventHash: events[events.length - 1].contentHash };
}
