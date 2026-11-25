// lib/research/evidence.ts
// Research Plane — R0 evidence manifests and provenance.
// Pure, no I/O, no Supabase, no network.

import {
  ResearchPlaneError,
  type ResearchRun,
  type VerificationReceipt,
  canonicalizeJson,
  sha256Bytes,
  sha256Json,
} from './contracts';

export interface ProvenanceEvent {
  eventId: string;
  runId: string;
  seq: number;
  eventType: string;
  actor: string;
  actorRole: string;
  timestamp: string;
  previousHash: string | null;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface EvidenceManifest {
  specHash: string;
  candidateHash: string;
  artifactIds: string[];
  receiptId: string | null;
  eventCount: number;
  lastEventHash: string | null;
  sha256sums: Record<string, string>;
  sealedAt: string | null;
}

export interface ProvenanceChainResult {
  valid: boolean;
  failure?: { reason: string };
}

export function makeProvenanceEvent(input: {
  eventId: string;
  runId: string;
  seq: number;
  eventType: string;
  actor: string;
  actorRole: string;
  timestamp: string;
  previousHash: string | null;
  metadata: Record<string, unknown>;
}): ProvenanceEvent {
  const content = canonicalizeJson({
    eventId: input.eventId,
    runId: input.runId,
    seq: input.seq,
    eventType: input.eventType,
    actor: input.actor,
    actorRole: input.actorRole,
    timestamp: input.timestamp,
    previousHash: input.previousHash,
    metadata: input.metadata,
  });
  return {
    ...input,
    contentHash: sha256Bytes(content),
  };
}

export function buildEvidenceManifest(input: {
  run: ResearchRun;
  artifactIds: string[];
  receiptId: string | null;
  eventCount: number;
  lastEventHash: string | null;
  sha256sums: Record<string, string>;
}): EvidenceManifest {
  return {
    specHash: input.run.specHash ?? '',
    candidateHash: input.run.candidateHash ?? '',
    artifactIds: input.artifactIds,
    receiptId: input.receiptId,
    eventCount: input.eventCount,
    lastEventHash: input.lastEventHash,
    sha256sums: input.sha256sums,
    sealedAt: null,
  };
}

export function sealEvidenceManifest(
  manifest: EvidenceManifest,
  sealedAt: string,
): EvidenceManifest {
  return {
    ...manifest,
    sealedAt,
  };
}

export interface ManifestBindingResult {
  valid: boolean;
  reason?: string;
}

export function validateManifestBinding(
  manifest: EvidenceManifest,
  receipt: VerificationReceipt,
): ManifestBindingResult {
  if (manifest.specHash !== receipt.specHash) {
    return { valid: false, reason: 'specHash mismatch' };
  }
  if (manifest.candidateHash !== receipt.candidateHash) {
    return { valid: false, reason: 'candidateHash mismatch' };
  }
  return { valid: true };
}

export function verifyProvenanceChain(events: ProvenanceEvent[]): ProvenanceChainResult {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (i > 0) {
      const prev = events[i - 1];
      if (event.previousHash !== prev.contentHash) {
        return { valid: false, failure: { reason: 'chain link broken' } };
      }
      if (event.runId !== prev.runId) {
        return { valid: false, failure: { reason: 'run ID mismatch' } };
      }
      if (event.seq !== prev.seq + 1) {
        return { valid: false, failure: { reason: 'sequence gap or duplicate' } };
      }
    } else {
      if (event.seq !== 0) {
        return { valid: false, failure: { reason: 'sequence gap or duplicate' } };
      }
    }
    // Verify content hash integrity
    const expected = sha256Json({
      eventId: event.eventId,
      runId: event.runId,
      seq: event.seq,
      eventType: event.eventType,
      actor: event.actor,
      actorRole: event.actorRole,
      timestamp: event.timestamp,
      previousHash: event.previousHash,
      metadata: event.metadata,
    });
    if (event.contentHash !== expected) {
      return { valid: false, failure: { reason: 'content hash mismatch' } };
    }
  }
  return { valid: true };
}

export function fileDigest(path: string): string {
  // Pure placeholder — file digest computed by caller from content
  return sha256Json({ path });
}
