#!/usr/bin/env -p node --experimental-strip-types
/**
 * Client Operations C0 — Runnable Synthetic Demo
 *
 * Runs the deterministic evaluation engine against fictional fixtures and
 * prints a human-readable report. No external effects, no network, no real
 * customer data.
 *
 * Usage:
 *   pnpm tsx lib/pilots/clientOps/demo.ts
 */

import {
  evaluateAndPropose,
} from './evaluate';
import {
  SYNTHETIC_TENANT_ID,
  SYNTHETIC_WORKSPACE_ID,
  SYNTHETIC_ENGAGEMENT_ID,
  SYNTHETIC_USER_ID,
  SYNTHETIC_CHECKLIST,
  SYNTHETIC_CLIENT_MESSAGE,
  SYNTHETIC_ATTACHMENTS,
} from './fixtures';

const { result, proposal } = evaluateAndPropose(
  {
    clientMessage: SYNTHETIC_CLIENT_MESSAGE,
    attachments: SYNTHETIC_ATTACHMENTS,
    checklist: SYNTHETIC_CHECKLIST,
    context: {
      tenantId: SYNTHETIC_TENANT_ID,
      workspaceId: SYNTHETIC_WORKSPACE_ID,
      userId: SYNTHETIC_USER_ID,
    },
  },
  'professional'
);

console.log('═══════════════════════════════════════════════════════════════');
console.log('CLIENT OPERATIONS C0 — SYNTHETIC DEMO');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Tenant:      ', SYNTHETIC_TENANT_ID);
console.log('Workspace:   ', SYNTHETIC_WORKSPACE_ID);
console.log('Engagement:  ', SYNTHETIC_ENGAGEMENT_ID);
console.log('Checklist v: ', SYNTHETIC_CHECKLIST.version);
console.log('Items:       ', SYNTHETIC_CHECKLIST.items.length);
console.log('Attachments: ', SYNTHETIC_ATTACHMENTS.length);
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('EVALUATION RESULT');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Evaluated at:   ', result.evaluatedAt);
console.log('Evaluator:      ', result.evaluatorVersion);
console.log('');
console.log('METRICS:');
console.log('  Total items:          ', result.metrics.totalItems);
console.log('  Received:             ', result.metrics.receivedCount);
console.log('  Missing:              ', result.metrics.missingCount);
console.log('  Uncertain:            ', result.metrics.uncertainCount);
console.log('  Required completeness:', (result.metrics.requiredCompleteness * 100).toFixed(1) + '%');
console.log('  Mean confidence:      ', (result.metrics.meanConfidence * 100).toFixed(1) + '%');
console.log('  Evidence spans cited: ', result.metrics.evidenceSpanCount);
console.log('');

console.log('DETERMINATIONS:');
for (const d of result.determinations) {
  const item = SYNTHETIC_CHECKLIST.items.find(i => i.id === d.itemId);
  const req = item?.required ? ' [REQUIRED]' : '';
  console.log(`  ${d.status.toUpperCase().padEnd(10)} ${d.itemId}${req}`);
  console.log(`    Confidence: ${(d.confidence * 100).toFixed(0)}% | Evidence: ${d.evidenceIds.length} | Matches: ${d.matchCount ?? 0}`);
  if (d.uncertaintyReason) console.log(`    Note: ${d.uncertaintyReason}`);
}
console.log('');

console.log('CITED EVIDENCE SPANS:');
for (const span of result.citedEvidence) {
  console.log(`  ${span.evidenceId}: ${span.description} (${span.charEnd - span.charStart} chars, ${span.contentHash})`);
}
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('REVIEW PROPOSAL (HUMAN-ONLY, NEVER SENT AUTOMATICALLY)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('SUMMARY:');
console.log(proposal.summary);
console.log('');
console.log('FOLLOW-UP DRAFT:');
console.log('  Subject:', proposal.followUpDraft.subject);
console.log('  Tone:', proposal.followUpDraft.tone);
console.log('  Action items:', proposal.followUpDraft.actionItems.length);
console.log('');
console.log('  BODY PREVIEW:');
console.log(proposal.followUpDraft.body.substring(0, 500) + '...');
console.log('');
console.log('Requires human verification:', proposal.requiresHumanVerification.length, 'items');
console.log('Flagged for review:', proposal.flaggedForReview.length, 'items');
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('DEMO COMPLETE — NO EXTERNAL EFFECTS');
console.log('═══════════════════════════════════════════════════════════════');
