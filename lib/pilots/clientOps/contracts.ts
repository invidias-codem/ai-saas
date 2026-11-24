/**
 * Client Operations C0 — Typed Contracts
 *
 * Pure, serializable types for the synthetic-only client operations pilot.
 * No I/O, no network, no external dependencies.
 *
 * Invariants:
 * - All identifiers are synthetic and carry tenant/workspace scope.
 * - Evidence IDs are opaque strings produced by the evaluator; they never
 *   reference real documents or customer data.
 * - Confidence is a deterministic function of evidence match, never an LLM score.
 * - Output states are exhaustive: received | missing | uncertain.
 * - Review proposals are human-readable drafts with NO send/mutate capability.
 */

// ── Tenant / Workspace Identity ────────────────────────────────────────────

export type TenantId = string & { readonly __brand: unique symbol };
export type WorkspaceId = string & { readonly __brand: unique symbol };
export type EngagementId = string & { readonly __brand: unique symbol };
export type EvidenceId = string & { readonly __brand: unique symbol };
export type ChecklistItemId = string & { readonly __brand: unique symbol };

export function tenantId(id: string): TenantId { return id as TenantId; }
export function workspaceId(id: string): WorkspaceId { return id as WorkspaceId; }
export function engagementId(id: string): EngagementId { return id as EngagementId; }
export function evidenceId(id: string): EvidenceId { return id as EvidenceId; }
export function checklistItemId(id: string): ChecklistItemId { return id as ChecklistItemId; }

// ── Source Evidence ────────────────────────────────────────────────────────

export type SourceKind = 'message' | 'attachment' | 'checklist' | 'policy';

export interface SourceSpan {
  /** Opaque evidence identifier, stable within a single evaluation run. */
  evidenceId: EvidenceId;
  /** Human-readable description of what this span covers. */
  description: string;
  /** Character offsets within the source document (0-indexed, inclusive start, exclusive end). */
  charStart: number;
  charEnd: number;
  /** SHA-256 of the source text this span references — for tamper detection. */
  contentHash: string;
}

export interface SourceDocument {
  /** Stable synthetic document identifier. */
  docId: string;
  /** Tenant/workspace this document belongs to. */
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  /** Kind of source material. */
  kind: SourceKind;
  /** Full text content (synthetic/fictional only). */
  content: string;
  /** SHA-256 of content. */
  contentHash: string;
  /** Optional metadata (e.g., attachment filename, message timestamp). */
  metadata?: Record<string, unknown>;
}

// ── Engagement & Checklist ─────────────────────────────────────────────────

export type ChecklistItemStatus = 'received' | 'missing' | 'uncertain';

export interface ChecklistItem {
  id: ChecklistItemId;
  /** Human-readable requirement description. */
  description: string;
  /** Keywords/phrases that indicate this item is satisfied. */
  matchKeywords: string[];
  /** Keywords/phrases that indicate this item is explicitly NOT satisfied. */
  excludeKeywords?: string[];
  /** Minimum number of keyword matches required for 'received'. */
  minMatches?: number;
  /** Whether this item is required for engagement completion. */
  required: boolean;
  /** Category for grouping (e.g., 'tax', 'legal', 'identity', 'financial'). */
  category: string;
}

export interface EngagementChecklist {
  engagementId: EngagementId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  /** Version of the checklist template. */
  version: string;
  items: ChecklistItem[];
  /** ISO timestamp when this checklist was created. */
  createdAt: string;
}

// ── Evaluation Results ─────────────────────────────────────────────────────

export interface ChecklistDetermination {
  itemId: ChecklistItemId;
  status: ChecklistItemStatus;
  /** Evidence IDs that support this determination. */
  evidenceIds: EvidenceId[];
  /** For 'uncertain': explanation of why evidence is insufficient. */
  uncertaintyReason?: string;
  /** For 'received': count of positive keyword matches. */
  matchCount?: number;
  /** Confidence in [0, 1] — deterministic, based on evidence match. */
  confidence: number;
}

export interface EvaluationResult {
  engagementId: EngagementId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  /** Per-item determinations. */
  determinations: ChecklistDetermination[];
  /** All evidence spans cited across all determinations. */
  citedEvidence: SourceSpan[];
  /** Aggregate metrics. */
  metrics: EvaluationMetrics;
  /** ISO timestamp of evaluation. */
  evaluatedAt: string;
  /** Evaluator version for reproducibility. */
  evaluatorVersion: string;
}

export interface EvaluationMetrics {
  totalItems: number;
  receivedCount: number;
  missingCount: number;
  uncertainCount: number;
  requiredReceived: number;
  requiredMissing: number;
  requiredUncertain: number;
  /** Ratio of required items with 'received' status. */
  requiredCompleteness: number;
  /** Overall confidence (mean of per-item confidences). */
  meanConfidence: number;
  /** Count of evidence spans cited. */
  evidenceSpanCount: number;
}

// ── Review Proposal (Human-Readable, No External Effects) ──────────────────

export type FollowUpTone = 'professional' | 'concise' | 'detailed';

export interface FollowUpDraft {
  /** Subject line for the follow-up communication. */
  subject: string;
  /** Plain-text body. */
  body: string;
  /** Items that need client response. */
  actionItems: string[];
  /** Tone used. */
  tone: FollowUpTone;
  /** ISO timestamp when draft was generated. */
  generatedAt: string;
}

export interface ReviewProposal {
  engagementId: EngagementId;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  /** Summary of evaluation for human reviewer. */
  summary: string;
  /** Draft follow-up message (review-only, never sent automatically). */
  followUpDraft: FollowUpDraft;
  /** Items requiring human verification before any external action. */
  requiresHumanVerification: ChecklistItemId[];
  /** Items where evidence was uncertain — flag for reviewer attention. */
  flaggedForReview: ChecklistItemId[];
  /** ISO timestamp. */
  proposedAt: string;
  /** Proposal version. */
  version: string;
}

// ── Input Payload for Evaluation ───────────────────────────────────────────

export interface EvaluationInput {
  /** Synthetic client message (fictional). */
  clientMessage: string;
  /** Synthetic attachment metadata (fictional). */
  attachments: Array<{
    docId: string;
    filename: string;
    mimeType: string;
    content: string; // synthetic content only
  }>;
  /** Engagement checklist to evaluate against. */
  checklist: EngagementChecklist;
  /** Tenant/workspace context for authorization. */
  context: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    userId: string; // synthetic user identifier
  };
  /** Optional: override evaluator version for testing. */
  evaluatorVersion?: string;
}

// ── Error Types ────────────────────────────────────────────────────────────

export type ClientOpsErrorCode =
  | 'TENANT_MISMATCH'
  | 'WORKSPACE_MISMATCH'
  | 'ENGAGEMENT_NOT_FOUND'
  | 'MALFORMED_INPUT'
  | 'OVERSIZED_INPUT'
  | 'UNTRUSTED_INSTRUCTION_DETECTED'
  | 'CONTRADICTORY_EVIDENCE'
  | 'EVALUATION_FAILED';

export class ClientOpsError extends Error {
  readonly code: ClientOpsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ClientOpsErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ClientOpsError';
    this.code = code;
    this.details = details;
  }
}

// ── Constants ──────────────────────────────────────────────────────────────

export const EVALUATOR_VERSION = 'client-ops-c0-1.0.0';
export const MAX_INPUT_CHARS = 50_000;
export const MAX_ATTACHMENT_CHARS = 100_000;
export const MAX_TOTAL_CHARS = 200_000;

// ── Utility: Content Hash ──────────────────────────────────────────────────
//
// Real SHA-256 digest of source text. Used for evidence tamper detection.
// Not cryptographic signing — just provenance integrity for synthetic data.
import { createHash } from 'crypto';

export function computeContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}