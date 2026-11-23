// lib/pilots/clientOps/demoServer.ts
// Shared demo data provider for C1 route handlers.
// Always evaluates synthetic fixtures — never real customer data.

import {
  SYNTHETIC_TENANT_ID,
  SYNTHETIC_WORKSPACE_ID,
  SYNTHETIC_ENGAGEMENT_ID,
  SYNTHETIC_USER_ID,
  SYNTHETIC_CHECKLIST,
  SYNTHETIC_CLIENT_MESSAGE,
  SYNTHETIC_ATTACHMENTS,
} from './fixtures';
import { evaluateAndPropose, evaluateEngagement, createReviewProposal } from './evaluate';

export interface DemoData {
  result: ReturnType<typeof evaluateEngagement>;
  proposal: ReturnType<typeof createReviewProposal>;
}

/**
 * Run the synthetic evaluation once and return the full result + proposal.
 * Deterministic; same output every call. Used by all demo screens.
 */
export function getDemoData(): DemoData {
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
  return { result, proposal };
}
