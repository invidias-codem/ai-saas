// Research Plane — R0: Verifiable Research Run Contracts.
//
// Pure contracts only: no provider SDKs, no network, no I/O, no DB reads.
// All modules are deterministic and side-effect free unless explicitly noted.
//
// Trust boundaries (enforced by lifecycle, not by convention):
//   * Research agents cannot issue authoritative verification receipts.
//   * Verified status binds to the exact frozen specification hash.
//   * Verification receipts bind to immutable candidate content hashes.
//   * The verifier executable, policy, and authority cannot be modified by
//     the candidate-producing agent.
//   * Research workspaces, artifacts, memory, and compute remain tenant-scoped.
//
// Feature flag: ENABLE_RESEARCH_PLANE (default: false).

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import type { WorkspaceRole } from '@/lib/security/workspaceAccess';

// ── Research specification ─────────────────────────────────────────────────

export const ResearchRunStatusSchema = z.enum([
  'CREATED',
  'SPEC_FROZEN',
  'RESEARCHING',
  'CANDIDATE_READY',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'FAILED',
  'INCONCLUSIVE',
  'REJECTED',
]);
export type ResearchRunStatus = z.infer<typeof ResearchRunStatusSchema>;

export const VerificationOutcomeSchema = z.enum([
  'VERIFIED',
  'FAILED',
  'INCONCLUSIVE',
  'REJECTED',
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;

export const ResearchSpecificationSchema = z.object({
  problemStatement: z.string().min(1),
  researchObjective: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).min(1),
  allowedTools: z.array(z.string()).default([]),
  executionBudget: z
    .object({
      maxSteps: z.number().int().positive().default(100),
      maxWallClockMs: z.number().int().positive().default(3600_000),
      maxExternalSpendCents: z.number().int().nonnegative().default(0),
    })
    .default({ maxSteps: 100, maxWallClockMs: 3600_000, maxExternalSpendCents: 0 }),
  privacyAndPublication: z
    .object({
      private: z.boolean().default(true),
      allowPublication: z.boolean().default(false),
      requireHumanApproval: z.boolean().default(true),
    })
    .default({ private: true, allowPublication: false, requireHumanApproval: true }),
  requiredVerificationMethods: z.array(z.string()).default([]),
});
export type ResearchSpecification = z.infer<typeof ResearchSpecificationSchema>;

export interface FrozenSpecification {
  readonly version: number; // monotonically incremented on revision
  readonly hash: string; // sha256 of canonical JSON
  readonly spec: ResearchSpecification;
  readonly frozenAt: string;
  readonly frozenBy: string; // userId who froze it
}

// ── Research run ───────────────────────────────────────────────────────────

export interface ResearchRun {
  readonly runId: string;
  readonly ownerUserId: string;
  readonly workspaceId: string | null;
  readonly tenantScope: TenantScope | null;
  readonly status: ResearchRunStatus;
  readonly specVersion: number;
  readonly specHash: string | null;
  readonly candidateHash: string | null;
  readonly verificationReceiptId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ── Candidate artifact ─────────────────────────────────────────────────────

export const ArtifactTypeSchema = z.enum([
  'proof', // Lean proof or similar formal artifact
  'code', // generated source code
  'experiment', // scientific experiment specification
  'investigation', // technical investigation report
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export interface CandidateArtifact {
  readonly artifactId: string;
  readonly runId: string;
  readonly type: ArtifactType;
  readonly contentHash: string; // sha256 of canonical content bytes
  readonly contentSize: number;
  readonly references: string[]; // source URLs / dependency identifiers
  readonly dependencyHashes: Record<string, string>; // dependency -> sha256
  readonly createdAt: string;
  readonly createdBy: string; // agent role + model/provider
  readonly sealed: boolean; // immutable once sealed
}

// ── Verification receipt ───────────────────────────────────────────────────

export interface VerifierIdentity {
  readonly name: string;
  readonly version: string;
  readonly type: 'lean' | 'build' | 'test' | 'security' | 'custom';
}

export interface VerificationPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly requiredChecks: string[]; // check names that must pass
  readonly allowedAxioms: string[]; // only these axioms may be used (strict allowlist)
  readonly disallowedAxioms: string[]; // never permitted (subset check on top)
  readonly maxProofSteps?: number;
  readonly timeoutMs: number;
}

export interface VerificationReceipt {
  readonly receiptId: string;
  readonly runId: string;
  readonly specHash: string; // binds to exact frozen spec
  readonly candidateHash: string; // binds to immutable candidate content
  readonly toolchainIdentity: VerifierIdentity;
  readonly policy: VerificationPolicy;
  readonly outcome: VerificationOutcome;
  readonly checkResults: Record<string, { passed: boolean; reason?: string }>;
  readonly command: string;
  readonly exitStatus: number;
  readonly executedAt: string;
  readonly executedBy: string; // verifier identity, not agent
  readonly sealed: boolean; // immutable once sealed
}

// ── Evidence manifest / provenance ─────────────────────────────────────────

export interface ProvenanceEvent {
  readonly eventId: string;
  readonly runId: string;
  readonly seq: number; // monotonically increasing per run
  readonly eventType:
    | 'run_created'
    | 'spec_frozen'
    | 'spec_revised'
    | 'candidate_proposed'
    | 'candidate_sealed'
    | 'verification_started'
    | 'verification_completed'
    | 'verification_failed'
    | 'human_review'
    | 'artifact_tampered'
    | 'unauthorized_promotion_attempt';
  readonly actor: string; // who caused the event
  readonly actorRole: 'human' | 'explorer' | 'formalizer' | 'critic' | 'verifier' | 'coordinator';
  readonly timestamp: string;
  readonly contentHash: string; // sha256 of event payload
  readonly previousHash: string | null; // chain link
  readonly metadata: Record<string, unknown>;
}

export interface EvidenceManifest {
  readonly runId: string;
  readonly specVersion: number;
  readonly specHash: string;
  readonly candidateHash: string | null;
  readonly receiptId: string | null;
  readonly artifactIds: string[];
  readonly eventCount: number;
  readonly lastEventHash: string | null;
  readonly sealedAt: string | null;
  readonly sha256sums: Record<string, string>; // artifact path -> sha256
}

// ── Errors ─────────────────────────────────────────────────────────────────

export class ResearchPlaneError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'FEATURE_DISABLED'
      | 'INVALID_TRANSITION'
      | 'OWNERSHIP_MISMATCH'
      | 'SPEC_NOT_FROZEN'
      | 'CANDIDATE_NOT_SEALED'
      | 'VERIFICATION_BIND_MISMATCH'
      | 'UNAUTHORIZED_PROMOTION'
      | 'TENANT_ISOLATION_VIOLATION'
      | 'INVALID_ARTIFACT'
      | 'VERIFIER_CONFLICT'
      | 'PROVENANCE_TAMPER',
  ) {
    super(message);
    this.name = 'ResearchPlaneError';
  }
}

// ── Feature flag ───────────────────────────────────────────────────────────

export const ENABLE_RESEARCH_PLANE = process.env.ENABLE_RESEARCH_PLANE === 'true';

export function requireResearchPlaneEnabled() {
  if (!ENABLE_RESEARCH_PLANE) {
    throw new ResearchPlaneError(
      'Research plane is disabled (ENABLE_RESEARCH_PLANE)',
      'FEATURE_DISABLED',
    );
  }
}

// ── Deterministic hashing ─────────────────────────────────────────────────

/**
 * Recursively canonicalize a JSON-serializable value with sorted keys at
 * every level. Unlike JSON.stringify with a top-level key whitelist, this
 * sorts keys in nested objects too, so structurally identical values always
 * produce identical canonical strings regardless of insertion order.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (key) => JSON.stringify(key) + ':' + canonicalizeJson(obj[key]),
  );
  return '{' + pairs.join(',') + '}';
}

/** Canonical SHA-256 of any JSON-serializable value. Deterministic key order at every nesting level. */
export function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}

/** SHA-256 of raw bytes (string or Buffer). */
export function sha256Bytes(input: string | Buffer): string {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Verify that supplied content bytes match an expected SHA-256 digest.
 * Rejects when the digest does not match the actual bytes — prevents
 * forged hashes from substituting for content verification.
 */
export function verifyContentDigest(
  expectedHash: string,
  contentBytes: string | Buffer,
): { readonly valid: boolean; readonly actualHash?: string; readonly reason?: string } {
  const actualHash = sha256Bytes(contentBytes);
  if (actualHash !== expectedHash) {
    return { valid: false, actualHash, reason: 'content digest mismatch' };
  }
  return { valid: true, actualHash };
}

/**
 * Verify that a frozen specification's bytes match its declared hash.
 * Used by freezeSpec to independently recompute the specification digest
 * rather than trusting a caller-supplied hash.
 */
export function verifySpecDigest(
  expectedHash: string,
  spec: ResearchSpecification,
): { readonly valid: boolean; readonly actualHash?: string; readonly reason?: string } {
  return verifyContentDigest(expectedHash, canonicalizeJson(spec));
}

/** Compute the content hash of a candidate artifact from its fields. */
export function artifactContentHash(artifact: Omit<CandidateArtifact, 'artifactId' | 'createdAt' | 'createdBy' | 'sealed'>): string {
  return sha256Json({
    type: artifact.type,
    contentHash: artifact.contentHash,
    contentSize: artifact.contentSize,
    references: artifact.references,
    dependencyHashes: artifact.dependencyHashes,
  });
}

// ── Transition validation ──────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<ResearchRunStatus, ResearchRunStatus[]> = {
  CREATED: ['SPEC_FROZEN'],
  SPEC_FROZEN: ['RESEARCHING'],
  RESEARCHING: ['CANDIDATE_READY', 'FAILED', 'REJECTED'],
  CANDIDATE_READY: ['VERIFICATION_PENDING', 'REJECTED'],
  VERIFICATION_PENDING: ['VERIFIED', 'FAILED', 'INCONCLUSIVE', 'REJECTED'],
  VERIFIED: [], // terminal
  FAILED: [], // terminal
  INCONCLUSIVE: [], // terminal
  REJECTED: [], // terminal
};

export function isValidTransition(from: ResearchRunStatus, to: ResearchRunStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function requireValidTransition(from: ResearchRunStatus, to: ResearchRunStatus): void {
  if (!isValidTransition(from, to)) {
    throw new ResearchPlaneError(
      `Invalid research run transition: ${from} -> ${to}`,
      'INVALID_TRANSITION',
    );
  }
}

// ── Tenant isolation ───────────────────────────────────────────────────────

export function sameTenantScope(
  a: TenantScope | null,
  b: TenantScope | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

export function requireTenantAccess(
  callerScope: TenantScope | null,
  resourceScope: TenantScope | null,
): void {
  if (!sameTenantScope(callerScope, resourceScope)) {
    throw new ResearchPlaneError(
      'Research run tenant isolation violation',
      'TENANT_ISOLATION_VIOLATION',
    );
  }
}

// ── Workspace role check ───────────────────────────────────────────────────

export const RESEARCH_WRITE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member'];

export function canWriteResearch(role: WorkspaceRole | null): boolean {
  return role !== null && RESEARCH_WRITE_ROLES.includes(role);
}
