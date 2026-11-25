// lib/research/contracts.ts
// Research Plane — R0 contracts. Pure, no I/O, no Supabase, no network.
// Deterministic types and helpers for the research verification pipeline.

import { createHash } from 'crypto';

// ── Error ───────────────────────────────────────────────────────────────

export class ResearchPlaneError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ResearchPlaneError';
  }
}

// ── Feature flag ────────────────────────────────────────────────────────

export const ENABLE_RESEARCH_PLANE = process.env.ENABLE_RESEARCH_PLANE === 'true';

// ── Types ───────────────────────────────────────────────────────────────

export const ResearchStatusSchema = [
  'CREATED',
  'SPEC_FROZEN',
  'RESEARCHING',
  'CANDIDATE_READY',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'FAILED',
  'INCONCLUSIVE',
  'REJECTED',
] as const;
export type ResearchStatus = (typeof ResearchStatusSchema)[number];

export interface ExecutionBudget {
  maxSteps: number;
  maxWallClockMs: number;
  maxExternalSpendCents: number;
}

export interface PrivacyAndPublication {
  private: boolean;
  allowPublication: boolean;
  requireHumanApproval: boolean;
}

export interface ResearchSpecification {
  problemStatement: string;
  researchObjective: string;
  acceptanceCriteria: string[];
  allowedTools: string[];
  executionBudget: ExecutionBudget;
  privacyAndPublication: PrivacyAndPublication;
  requiredVerificationMethods: string[];
}

export interface TenantScope {
  tenantId: string;
  workspaceId: string;
}

export interface ResearchRun {
  runId: string;
  ownerUserId: string;
  workspaceId: string;
  tenantScope: TenantScope;
  status: ResearchStatus;
  specVersion: number;
  specHash: string | null;
  candidateHash: string | null;
  verificationReceiptId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateArtifact {
  runId: string;
  type: 'proof';
  contentHash: string;
  contentSize: number;
  references: string[];
  dependencyHashes: Record<string, string>;
}

export interface VerifierIdentity {
  name: string;
  version: string;
  type: 'lean';
}

export interface VerificationPolicy {
  policyId: string;
  requiredChecks: string[];
  allowedAxioms: string[];
  disallowedAxioms: string[];
}

export interface VerificationReceipt {
  receiptId: string;
  runId: string;
  specHash: string;
  candidateHash: string;
  toolchainIdentity: VerifierIdentity;
  policy: VerificationPolicy;
  outcome: 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE';
  checkResults: Record<string, { passed: boolean; reason?: string }>;
  command: string;
  exitStatus: number;
  executedAt: string;
  executedBy: string;
  sealed: boolean;
}

export interface FrozenSpecInput {
  version: number;
  hash: string;
  spec: ResearchSpecification;
  frozenAt: string;
  frozenBy: string;
}

// ── Hashing ─────────────────────────────────────────────────────────────

export function sha256Bytes(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return createHash('sha256').update(buf).digest('hex');
}

export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalizeJson(obj[k]))
      .join(',') +
    '}'
  );
}

export function sha256Json(value: unknown): string {
  return sha256Bytes(canonicalizeJson(value));
}

export function artifactContentHash(artifact: CandidateArtifact): string {
  return sha256Json({
    type: artifact.type,
    contentHash: artifact.contentHash,
    contentSize: artifact.contentSize,
    references: artifact.references,
    dependencyHashes: artifact.dependencyHashes,
  });
}

// ── Content digest validation ──────────────────────────────────────────

export interface DigestResult {
  valid: boolean;
  actualHash: string;
  reason?: string;
}

export function verifyContentDigest(expectedHash: string, content: string): DigestResult {
  const actualHash = sha256Bytes(content);
  if (actualHash === expectedHash) {
    return { valid: true, actualHash };
  }
  return { valid: false, actualHash, reason: 'content digest mismatch' };
}

export function verifySpecDigest(expectedHash: string, spec: ResearchSpecification): DigestResult {
  const actualHash = sha256Json(spec);
  if (actualHash === expectedHash) {
    return { valid: true, actualHash };
  }
  return { valid: false, actualHash, reason: 'content digest mismatch' };
}

// ── State machine transitions ──────────────────────────────────────────

const validTransitions: Record<ResearchStatus, ResearchStatus[]> = {
  CREATED: ['SPEC_FROZEN'],
  SPEC_FROZEN: ['RESEARCHING'],
  RESEARCHING: ['CANDIDATE_READY', 'FAILED'],
  CANDIDATE_READY: ['VERIFICATION_PENDING', 'FAILED'],
  VERIFICATION_PENDING: ['VERIFIED', 'FAILED'],
  VERIFIED: [], // terminal
  FAILED: [], // terminal
  INCONCLUSIVE: [], // terminal
  REJECTED: [], // terminal
};

export function isValidTransition(from: ResearchStatus, to: ResearchStatus): boolean {
  return validTransitions[from]?.includes(to) ?? false;
}

export function requireValidTransition(from: ResearchStatus, to: ResearchStatus): void {
  if (!isValidTransition(from, to)) {
    throw new ResearchPlaneError(
      `Invalid transition from ${from} to ${to}`,
      'INVALID_TRANSITION',
    );
  }
}

// ── Tenant isolation ────────────────────────────────────────────────────

export function sameTenantScope(
  a: TenantScope | null,
  b: TenantScope | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId;
}

export function requireTenantAccess(
  caller: TenantScope,
  target: TenantScope,
): void {
  if (!sameTenantScope(caller, target)) {
    throw new ResearchPlaneError(
      'Tenant scope mismatch',
      'TENANT_MISMATCH',
    );
  }
}

export function canWriteResearch(role: string | null): boolean {
  return ['owner', 'admin', 'member'].includes(role ?? '');
}
