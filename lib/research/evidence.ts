// Research Plane — R0: Evidence manifest and provenance.
//
// Deterministic helpers for building evidence manifests and provenance
// events. Pure: no I/O, no wall-clock. Callers supply timestamps and
// persist results.

import type {
  EvidenceManifest,
  ProvenanceEvent,
  ResearchRun,
  VerificationReceipt,
} from '@/lib/research/contracts';
import { sha256Bytes, sha256Json } from '@/lib/research/contracts';

/**
 * Build a provenance event. Caller supplies eventId, seq, timestamp, and
 * previousHash for chain integrity.
 *
 * The content hash binds the full canonical event payload — runId, seq,
 * timestamp, previousHash, eventType, actor, actorRole, and metadata — so
 * that altering any event identity, sequence, or timestamp is detected.
 */
export function makeProvenanceEvent(input: {
  eventId: string;
  runId: string;
  seq: number;
  eventType: ProvenanceEvent['eventType'];
  actor: string;
  actorRole: ProvenanceEvent['actorRole'];
  timestamp: string;
  previousHash: string | null;
  metadata: Record<string, unknown>;
}): ProvenanceEvent {
  const payload = {
    runId: input.runId,
    seq: input.seq,
    timestamp: input.timestamp,
    previousHash: input.previousHash,
    eventType: input.eventType,
    actor: input.actor,
    actorRole: input.actorRole,
    metadata: input.metadata,
  };
  const contentHash = sha256Json(payload);

  return {
    eventId: input.eventId,
    runId: input.runId,
    seq: input.seq,
    eventType: input.eventType,
    actor: input.actor,
    actorRole: input.actorRole,
    timestamp: input.timestamp,
    contentHash,
    previousHash: input.previousHash,
    metadata: input.metadata,
  };
}

/**
 * Verify a provenance event chain. Returns false if any event's contentHash
 * doesn't match its payload, the chain link (previousHash) is broken,
 * sequence numbers are not contiguous from 0, or events span multiple run
 * IDs.
 */
export function verifyProvenanceChain(events: readonly ProvenanceEvent[]): {
  readonly valid: boolean;
  readonly failure?: { seq: number; reason: string };
} {
  let previousHash: string | null = null;
  let expectedSeq = 0;
  let runId: string | null = null;
  for (const event of events) {
    // Single run ID across the entire chain.
    if (runId === null) runId = event.runId;
    if (event.runId !== runId) {
      return {
        valid: false,
        failure: { seq: event.seq, reason: 'run ID mismatch' },
      };
    }
    // Contiguous sequence from 0.
    if (event.seq !== expectedSeq) {
      return {
        valid: false,
        failure: { seq: event.seq, reason: 'sequence gap or duplicate' },
      };
    }
    expectedSeq += 1;
    // Chain link integrity.
    if (event.previousHash !== previousHash) {
      return {
        valid: false,
        failure: { seq: event.seq, reason: 'chain link broken' },
      };
    }
    const expectedHash = sha256Json({
      runId: event.runId,
      seq: event.seq,
      timestamp: event.timestamp,
      previousHash: event.previousHash,
      eventType: event.eventType,
      actor: event.actor,
      actorRole: event.actorRole,
      metadata: event.metadata,
    });
    if (event.contentHash !== expectedHash) {
      return {
        valid: false,
        failure: { seq: event.seq, reason: 'content hash mismatch' },
      };
    }
    previousHash = event.contentHash;
  }
  return { valid: true };
}

/**
 * Build an evidence manifest from a run and its artifacts.
 */
export function buildEvidenceManifest(input: {
  run: ResearchRun;
  artifactIds: string[];
  receiptId: string | null;
  eventCount: number;
  lastEventHash: string | null;
  sha256sums: Record<string, string>;
}): EvidenceManifest {
  return {
    runId: input.run.runId,
    specVersion: input.run.specVersion,
    specHash: input.run.specHash ?? '',
    candidateHash: input.run.candidateHash ?? '',
    artifactIds: input.artifactIds,
    eventCount: input.eventCount,
    lastEventHash: input.lastEventHash,
    receiptId: input.receiptId,
    sealedAt: null,
    sha256sums: input.sha256sums,
  };
}

/**
 * Seal an evidence manifest. Returns a new manifest with sealedAt set.
 */
export function sealEvidenceManifest(
  manifest: EvidenceManifest,
  sealedAt: string,
): EvidenceManifest {
  return { ...manifest, sealedAt };
}

/**
 * Validate that a verification receipt binds to the evidence manifest.
 */
export function validateManifestBinding(
  manifest: EvidenceManifest,
  receipt: VerificationReceipt | null,
): { readonly valid: boolean; readonly reason?: string } {
  if (receipt === null) {
    return { valid: true }; // no receipt to bind yet
  }
  if (receipt.specHash !== manifest.specHash) {
    return {
      valid: false,
      reason: 'receipt specHash does not match manifest specHash',
    };
  }
  if (receipt.candidateHash !== manifest.candidateHash) {
    return {
      valid: false,
      reason: 'receipt candidateHash does not match manifest candidateHash',
    };
  }
  return { valid: true };
}

/**
 * Compute the SHA-256 of a file's bytes for inclusion in sha256sums.
 */
export function fileDigest(bytes: Buffer | string): string {
  return sha256Bytes(bytes);
}
