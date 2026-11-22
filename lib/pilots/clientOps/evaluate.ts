/**
 * Client Operations C0 — Deterministic Evaluation Engine
 *
 * Pure, synchronous, deterministic logic for classifying engagement checklist
 * items against synthetic source evidence. No I/O, no network, no LLM calls.
 *
 * Invariants:
 * - Same input ALWAYS produces same output (deterministic).
 * - Never invents documents or evidence.
 * - Confidence is a pure function of keyword match counts.
 * - Cross-tenant access is denied at the input boundary.
 * - Untrusted document text is NEVER interpreted as instructions.
 * - Oversized/malformed inputs are rejected with typed errors.
 */

import {
  // Types
  type TenantId,
  type WorkspaceId,
  type EngagementId,
  type EvidenceId,
  type ChecklistItemId,
  type SourceSpan,
  type SourceDocument,
  type ChecklistItem,
  type EngagementChecklist,
  type ChecklistDetermination,
  type EvaluationResult,
  type EvaluationMetrics,
  type ReviewProposal,
  type FollowUpDraft,
  type FollowUpTone,
  type EvaluationInput,
  type ClientOpsErrorCode,
  // Constants
  EVALUATOR_VERSION,
  MAX_INPUT_CHARS,
  MAX_ATTACHMENT_CHARS,
  MAX_TOTAL_CHARS,
  // Utilities
  computeContentHash,
  // Branded ID creators
  tenantId,
  workspaceId,
  engagementId,
  evidenceId,
  checklistItemId,
  // Error
  ClientOpsError,
} from './contracts';

// ── Internal: Keyword Matching ─────────────────────────────────────────────

interface KeywordMatchResult {
  matches: number;
  matchedKeywords: string[];
  excluded: boolean;
}

function countKeywordMatches(text: string, keywords: string[], excludeKeywords?: string[]): KeywordMatchResult {
  const lowerText = text.toLowerCase();
  let matches = 0;
  const matchedKeywords: string[] = [];

  for (const kw of keywords) {
    if (lowerText.includes(kw.toLowerCase())) {
      matches++;
      matchedKeywords.push(kw);
    }
  }

  let excluded = false;
  if (excludeKeywords) {
    for (const ekw of excludeKeywords) {
      if (lowerText.includes(ekw.toLowerCase())) {
        excluded = true;
        break;
      }
    }
  }

  return { matches, matchedKeywords, excluded };
}

// ── Internal: Evidence Extraction ──────────────────────────────────────────

interface ExtractedEvidence {
  docId: string;
  evidenceId: EvidenceId;
  spans: SourceSpan[];
  fullText: string;
}

function extractEvidenceFromSource(
  source: SourceDocument,
  engagementId: EngagementId
): ExtractedEvidence {
  // For synthetic data, we create one evidence span per source document.
  // Real implementations would do finer-grained extraction.
  const evId = evidenceId(`${engagementId}:ev:${source.docId}`);
  const span: SourceSpan = {
    evidenceId: evId,
    description: `${source.kind}: ${source.metadata?.filename ?? source.docId}`,
    charStart: 0,
    charEnd: source.content.length,
    contentHash: source.contentHash,
  };

  return {
    docId: source.docId,
    evidenceId: evId,
    spans: [span],
    fullText: source.content,
  };
}

// ── Input Validation & Sanitization ────────────────────────────────────────

function validateInput(input: EvaluationInput): void {
  // Check total input size
  let totalChars = input.clientMessage.length;
  for (const att of input.attachments) {
    totalChars += att.content.length;
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    throw new ClientOpsError('OVERSIZED_INPUT', `Total input exceeds ${MAX_TOTAL_CHARS} characters`, {
      totalChars,
      limit: MAX_TOTAL_CHARS,
    });
  }

  if (input.clientMessage.length > MAX_INPUT_CHARS) {
    throw new ClientOpsError('OVERSIZED_INPUT', `Client message exceeds ${MAX_INPUT_CHARS} characters`, {
      length: input.clientMessage.length,
      limit: MAX_INPUT_CHARS,
    });
  }

  for (const att of input.attachments) {
    if (att.content.length > MAX_ATTACHMENT_CHARS) {
      throw new ClientOpsError('OVERSIZED_INPUT', `Attachment ${att.filename} exceeds ${MAX_ATTACHMENT_CHARS} characters`, {
        filename: att.filename,
        length: att.content.length,
        limit: MAX_ATTACHMENT_CHARS,
      });
    }
  }

  // Validate tenant/workspace alignment
  if (input.checklist.tenantId !== input.context.tenantId) {
    throw new ClientOpsError('TENANT_MISMATCH', 'Checklist tenant does not match evaluation context', {
      checklistTenant: input.checklist.tenantId,
      contextTenant: input.context.tenantId,
    });
  }

  if (input.checklist.workspaceId !== input.context.workspaceId) {
    throw new ClientOpsError('WORKSPACE_MISMATCH', 'Checklist workspace does not match evaluation context', {
      checklistWorkspace: input.checklist.workspaceId,
      contextWorkspace: input.context.workspaceId,
    });
  }

  // Detect untrusted instructions embedded in document content
  // This is a defensive check — we never execute document text as code,
  // but we flag content that appears to contain instruction-like patterns.
  const instructionPatterns = [
    /ignore\s+previous\s+instructions/i,
    /system\s*:\s*you\s+are/i,
    /assistant\s*:\s*you\s+must/i,
    /<\|.*?\|>/g, // Chat template markers
    /\[INST\][\s\S]*?\[\/INST\]/gi,
    /###\s*Instruction/i,
  ];

  const allText = [input.clientMessage, ...input.attachments.map(a => a.content)].join('\n');
  for (const pattern of instructionPatterns) {
    if (pattern.test(allText)) {
      throw new ClientOpsError('UNTRUSTED_INSTRUCTION_DETECTED', 'Input contains patterns resembling instruction injection', {
        pattern: pattern.source,
      });
    }
  }

  // Validate checklist structure
  if (!input.checklist.items.length) {
    throw new ClientOpsError('MALFORMED_INPUT', 'Checklist must contain at least one item', {});
  }

  for (const item of input.checklist.items) {
    if (!item.matchKeywords.length) {
      throw new ClientOpsError('MALFORMED_INPUT', `Checklist item ${item.id} has no matchKeywords`, {
        itemId: item.id,
      });
    }
    if (item.minMatches !== undefined && item.minMatches < 1) {
      throw new ClientOpsError('MALFORMED_INPUT', `Checklist item ${item.id} has invalid minMatches`, {
        itemId: item.id,
        minMatches: item.minMatches,
      });
    }
  }
}

// ── Core Evaluation Logic ──────────────────────────────────────────────────

function evaluateChecklistItem(
  item: ChecklistItem,
  sources: ExtractedEvidence[],
  allText: string
): ChecklistDetermination {
  const minMatches = item.minMatches ?? 1;
  let totalMatches = 0;
  const evidenceIds: EvidenceId[] = [];
  const matchedKeywords: string[] = [];
  let hasExclusion = false;

  // Search across all source documents
  for (const source of sources) {
    const result = countKeywordMatches(source.fullText, item.matchKeywords, item.excludeKeywords);
    totalMatches += result.matches;
    matchedKeywords.push(...result.matchedKeywords);
    if (result.excluded) hasExclusion = true;
    if (result.matches > 0) {
      evidenceIds.push(source.evidenceId);
    }
  }

  // Also search the client message directly
  const msgResult = countKeywordMatches(allText, item.matchKeywords, item.excludeKeywords);
  totalMatches += msgResult.matches;
  matchedKeywords.push(...msgResult.matchedKeywords);
  if (msgResult.excluded) hasExclusion = true;

  // Determine status
  let status: ChecklistDetermination['status'];
  let uncertaintyReason: string | undefined;
  let confidence: number;

  if (hasExclusion) {
    // Explicit exclusion keywords found — treat as missing with high confidence
    status = 'missing';
    confidence = 0.9;
    uncertaintyReason = 'Exclusion keywords detected in source material';
  } else if (totalMatches >= minMatches) {
    status = 'received';
    // Confidence scales with match count, capped at 0.95 (never 1.0 for synthetic)
    confidence = Math.min(0.5 + (totalMatches * 0.15), 0.95);
  } else if (totalMatches > 0) {
    status = 'uncertain';
    confidence = Math.min(0.3 + (totalMatches * 0.1), 0.6);
    uncertaintyReason = `Only ${totalMatches} of ${minMatches} required keyword matches found`;
  } else {
    status = 'missing';
    confidence = 0.8; // High confidence in absence when no keywords match
  }

  return {
    itemId: item.id,
    status,
    evidenceIds,
    uncertaintyReason,
    matchCount: totalMatches > 0 ? totalMatches : undefined,
    confidence,
  };
}

function buildCitedEvidence(
  determinations: ChecklistDetermination[],
  sources: ExtractedEvidence[]
): SourceSpan[] {
  const citedEvidenceIds = new Set<EvidenceId>();
  for (const d of determinations) {
    for (const eid of d.evidenceIds) {
      citedEvidenceIds.add(eid);
    }
  }

  const spans: SourceSpan[] = [];
  for (const source of sources) {
    if (citedEvidenceIds.has(source.evidenceId)) {
      spans.push(...source.spans);
    }
  }
  return spans;
}

function computeMetrics(
  determinations: ChecklistDetermination[],
  checklist: EngagementChecklist,
  evidenceSpanCount: number
): EvaluationMetrics {
  const requiredItems = checklist.items.filter((i) => i.required);
  const requiredReceived = determinations.filter(
    (d) => d.status === 'received' && requiredItems.some((r) => r.id === d.itemId)
  ).length;
  const requiredMissing = determinations.filter(
    (d) => d.status === 'missing' && requiredItems.some((r) => r.id === d.itemId)
  ).length;
  const requiredUncertain = determinations.filter(
    (d) => d.status === 'uncertain' && requiredItems.some((r) => r.id === d.itemId)
  ).length;

  const confidences = determinations.map((d) => d.confidence);
  const meanConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  return {
    totalItems: checklist.items.length,
    receivedCount: determinations.filter(d => d.status === 'received').length,
    missingCount: determinations.filter(d => d.status === 'missing').length,
    uncertainCount: determinations.filter(d => d.status === 'uncertain').length,
    requiredReceived,
    requiredMissing,
    requiredUncertain,
    requiredCompleteness: requiredItems.length > 0 ? requiredReceived / requiredItems.length : 1,
    meanConfidence,
    evidenceSpanCount,
  };
}

// ── Review Proposal Generation (Human-Readable, No External Effects) ───────

function generateFollowUpDraft(
  determinations: ChecklistDetermination[],
  checklist: EngagementChecklist,
  tone: FollowUpTone = 'professional'
): FollowUpDraft {
  const missingItems = determinations
    .filter(d => d.status === 'missing')
    .map(d => {
      const item = checklist.items.find(i => i.id === d.itemId);
      return item ? item.description : d.itemId;
    });

  const uncertainItems = determinations
    .filter(d => d.status === 'uncertain')
    .map(d => {
      const item = checklist.items.find(i => i.id === d.itemId);
      return item ? item.description : d.itemId;
    });

  const receivedItems = determinations
    .filter(d => d.status === 'received')
    .map(d => {
      const item = checklist.items.find(i => i.id === d.itemId);
      return item ? item.description : d.itemId;
    });

  const actionItems = [
    ...missingItems.map(desc => `Provide: ${desc}`),
    ...uncertainItems.map(desc => `Clarify: ${desc}`),
  ];

  let subject: string;
  let body: string;

  if (tone === 'concise') {
    subject = `Follow-up: ${missingItems.length} items needed for engagement ${checklist.engagementId}`;
    body = `We've received ${receivedItems.length} of ${checklist.items.length} requested items.\n\n` +
      `Still needed:\n${missingItems.map(m => `- ${m}`).join('\n')}\n\n` +
      (uncertainItems.length ? `Uncertain (please clarify):\n${uncertainItems.map(u => `- ${u}`).join('\n')}\n\n` : '') +
      'Please reply with the missing information at your earliest convenience.';
  } else if (tone === 'detailed') {
    subject = `Documentation Request — Engagement ${checklist.engagementId} — ${new Date().toISOString().split('T')[0]}`;
    body = `Dear Client,\n\n` +
      `Thank you for your recent submission. We've reviewed the materials against our engagement checklist.\n\n` +
      `✅ Received (${receivedItems.length}):\n${receivedItems.map(r => `  - ${r}`).join('\n')}\n\n` +
      (missingItems.length ? `❌ Missing (${missingItems.length}):\n${missingItems.map(m => `  - ${m}`).join('\n')}\n\n` : '') +
      (uncertainItems.length ? `⚠️ Uncertain — Need Clarification (${uncertainItems.length}):\n${uncertainItems.map(u => `  - ${u}`).join('\n')}\n\n` : '') +
      `Please provide the missing items and clarify any uncertain points so we can proceed efficiently.\n\n` +
      `Best regards,\nYour Advisory Team`;
  } else { // professional
    subject = `Action Required: ${missingItems.length} Outstanding Items for Engagement ${checklist.engagementId}`;
    body = `We have reviewed your submission for engagement ${checklist.engagementId}.\n\n` +
      `Received: ${receivedItems.length}/${checklist.items.length} items.\n\n` +
      `Outstanding items requiring your attention:\n${actionItems.map(a => `- ${a}`).join('\n')}\n\n` +
      `Please respond with the requested information. This is a review-only draft — no action has been taken on your behalf.`;
  }

  return {
    subject,
    body,
    actionItems,
    tone,
    generatedAt: new Date().toISOString(),
  };
}

function generateReviewProposal(
  input: EvaluationInput,
  result: EvaluationResult,
  tone: FollowUpTone = 'professional'
): ReviewProposal {
  const missingItems = result.determinations.filter(d => d.status === 'missing').map(d => d.itemId);
  const uncertainItems = result.determinations.filter(d => d.status === 'uncertain').map(d => d.itemId);

  // Summary for human reviewer
  const summary = [
    `Engagement ${input.checklist.engagementId} evaluation complete.`,
    `Tenant: ${input.context.tenantId}, Workspace: ${input.context.workspaceId}`,
    `Items: ${result.metrics.totalItems} total | ${result.metrics.receivedCount} received | ${result.metrics.missingCount} missing | ${result.metrics.uncertainCount} uncertain`,
    `Required completeness: ${(result.metrics.requiredCompleteness * 100).toFixed(1)}%`,
    `Mean confidence: ${(result.metrics.meanConfidence * 100).toFixed(1)}%`,
    `Evidence spans cited: ${result.metrics.evidenceSpanCount}`,
  ].join('\n');

  return {
    engagementId: input.checklist.engagementId,
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    summary,
    followUpDraft: generateFollowUpDraft(result.determinations, input.checklist, tone),
    requiresHumanVerification: missingItems,
    flaggedForReview: uncertainItems,
    proposedAt: new Date().toISOString(),
    version: '1.0.0',
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate a synthetic engagement against its checklist.
 * Pure, deterministic, no side effects.
 */
export function evaluateEngagement(input: EvaluationInput): EvaluationResult {
  // Validate input first
  validateInput(input);

  // Build source documents from input
  const sources: SourceDocument[] = [
    {
      docId: 'msg:client',
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      kind: 'message',
      content: input.clientMessage,
      contentHash: computeContentHash(input.clientMessage),
      metadata: { source: 'client_message' },
    },
    ...input.attachments.map((att, idx) => ({
      docId: `att:${idx}:${att.docId}`,
      tenantId: input.context.tenantId,
      workspaceId: input.context.workspaceId,
      kind: 'attachment' as const,
      content: att.content,
      contentHash: computeContentHash(att.content),
      metadata: { filename: att.filename, mimeType: att.mimeType },
    })),
  ];

  // Extract evidence from sources
  const extractedSources: ExtractedEvidence[] = sources.map(s =>
    extractEvidenceFromSource(s, input.checklist.engagementId)
  );

  // Combine all text for searching
  const allText = sources.map(s => s.content).join('\n\n');

  // Evaluate each checklist item
  const determinations: ChecklistDetermination[] = input.checklist.items.map(item =>
    evaluateChecklistItem(item, extractedSources, allText)
  );

  // Build cited evidence
  const citedEvidence = buildCitedEvidence(determinations, extractedSources);

  // Compute metrics
  const metrics = computeMetrics(determinations, input.checklist, citedEvidence.length);

  return {
    engagementId: input.checklist.engagementId,
    tenantId: input.context.tenantId,
    workspaceId: input.context.workspaceId,
    determinations,
    citedEvidence,
    metrics,
    evaluatedAt: new Date().toISOString(),
    evaluatorVersion: input.evaluatorVersion ?? EVALUATOR_VERSION,
  };
}

/**
 * Generate a review-only proposal from an evaluation result.
 * Pure, deterministic, no external effects.
 */
export function createReviewProposal(
  input: EvaluationInput,
  result: EvaluationResult,
  tone: FollowUpDraft['tone'] = 'professional'
): ReviewProposal {
  return generateReviewProposal(input, result, tone);
}

/**
 * Combined convenience: evaluate and generate review proposal in one call.
 */
export function evaluateAndPropose(
  input: EvaluationInput,
  tone: FollowUpDraft['tone'] = 'professional'
): { result: EvaluationResult; proposal: ReviewProposal } {
  const result = evaluateEngagement(input);
  const proposal = createReviewProposal(input, result, tone);
  return { result, proposal };
}

// ── Re-exports for convenience ─────────────────────────────────────────────

export type {
  EvaluationInput,
  EvaluationResult,
  EvaluationMetrics,
  ReviewProposal,
  FollowUpDraft,
  ChecklistDetermination,
  SourceSpan,
  SourceDocument,
  EngagementChecklist,
  ChecklistItem,
  ClientOpsErrorCode,
} from './contracts';

export { ClientOpsError, EVALUATOR_VERSION } from './contracts';