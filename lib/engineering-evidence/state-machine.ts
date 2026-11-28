// lib/engineering-evidence/state-machine.ts
// EI-4D: Engineering acceptance state machine.
//
// States:
//   DOCUMENTED → SOURCE_OBSERVED → IMPLEMENTED → COMPILED → BEHAVIOR_VERIFIED → SECURITY_QUALIFIED
// Terminal outcomes: PARTIAL, BLOCKED, CONTRADICTED
//
// Rules:
//   * Implementation agent may submit evidence but must not authorize its own
//     transition to SECURITY_QUALIFIED.
//   * Source inspection cannot substitute for runtime verification.
//   * A passing helper test cannot substitute for an integration test.
//   * A feature-disabled compilation cannot qualify a feature-enabled execution path.

import { AcceptanceStatus } from './contracts';

export interface TransitionInput {
  currentStatus: AcceptanceStatus;
  requestedStatus: AcceptanceStatus;
  submitterIdentity: string;
  implementerIdentity: string;
  evidenceProvided: boolean;
  runtimeVerified: boolean;
  isIntegrationTest: boolean;
  featureEnabled: boolean;
  compilationFeature: string | null;
  targetFeature: string | null;
}

export interface TransitionResult {
  readonly allowed: boolean;
  readonly nextStatus?: AcceptanceStatus;
  readonly reason?: string;
}

/**
 * Determine whether a state transition is allowed under the evidence rules.
 */
export function canTransition(input: TransitionInput): TransitionResult {
  const {
    currentStatus,
    requestedStatus,
    submitterIdentity,
    implementerIdentity,
    evidenceProvided,
    runtimeVerified,
    isIntegrationTest,
    featureEnabled,
    compilationFeature,
    targetFeature,
  } = input;

  // ── Rule: SECURITY_QUALIFIED cannot be self-approved by the implementer ──
  if (
    requestedStatus === 'SECURITY_QUALIFIED' &&
    submitterIdentity === implementerIdentity
  ) {
    return {
      allowed: false,
      reason: 'self-approved security qualification: implementer cannot authorize its own SECURITY_QUALIFIED transition',
    };
  }

  // ── Rule: Forward-only transitions ──
  const allowedFrom: AcceptanceStatus[] = (() => {
    switch (currentStatus) {
      case 'DOCUMENTED':
        return ['SOURCE_OBSERVED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'];
      case 'SOURCE_OBSERVED':
        return ['IMPLEMENTED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'];
      case 'IMPLEMENTED':
        return ['COMPILED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'];
      case 'COMPILED':
        return ['BEHAVIOR_VERIFIED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'];
      case 'BEHAVIOR_VERIFIED':
        return ['SECURITY_QUALIFIED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'];
      case 'PARTIAL':
        return ['IMPLEMENTED', 'COMPILED', 'BEHAVIOR_VERIFIED', 'SECURITY_QUALIFIED', 'BLOCKED', 'CONTRADICTED'];
      case 'BLOCKED':
        return ['DOCUMENTED', 'SOURCE_OBSERVED', 'IMPLEMENTED', 'COMPILED', 'BEHAVIOR_VERIFIED', 'SECURITY_QUALIFIED', 'CONTRADICTED'];
      case 'CONTRADICTED':
        return ['DOCUMENTED', 'SOURCE_OBSERVED', 'IMPLEMENTED', 'COMPILED', 'BEHAVIOR_VERIFIED', 'SECURITY_QUALIFIED'];
      case 'SECURITY_QUALIFIED':
        return []; // terminal
    }
  })();

  if (!allowedFrom.includes(requestedStatus)) {
    return {
      allowed: false,
      reason: `invalid transition: ${currentStatus} → ${requestedStatus}`,
    };
  }

  // ── Rule: Evidence must be provided for any forward transition ──
  if (requestedStatus !== 'PARTIAL' && requestedStatus !== 'BLOCKED' && requestedStatus !== 'CONTRADICTED') {
    if (!evidenceProvided) {
      return {
        allowed: false,
        reason: `evidence required for transition to ${requestedStatus}`,
      };
    }
  }

  // ── Rule: Source inspection cannot substitute for runtime verification ──
  if (requestedStatus === 'BEHAVIOR_VERIFIED' || requestedStatus === 'SECURITY_QUALIFIED') {
    if (!runtimeVerified) {
      return {
        allowed: false,
        reason: `runtime verification required for ${requestedStatus}; source inspection alone is insufficient`,
      };
    }
  }

  // ── Rule: A passing helper test cannot substitute for an integration test ──
  if (requestedStatus === 'BEHAVIOR_VERIFIED' || requestedStatus === 'SECURITY_QUALIFIED') {
    if (!isIntegrationTest) {
      return {
        allowed: false,
        reason: `integration test required for ${requestedStatus}; helper tests do not qualify`,
      };
    }
  }

  // ── Rule: A feature-disabled compilation cannot qualify a feature-enabled execution path ──
  if (requestedStatus === 'COMPILED' || requestedStatus === 'BEHAVIOR_VERIFIED' || requestedStatus === 'SECURITY_QUALIFIED') {
    if (targetFeature !== null && compilationFeature === null) {
      return {
        allowed: false,
        reason: `feature-disabled compilation cannot qualify feature-enabled path: target=${targetFeature}, compiled=disabled`,
      };
    }
    if (targetFeature !== null && compilationFeature !== targetFeature) {
      return {
        allowed: false,
        reason: `compilation feature mismatch: compiled with ${compilationFeature}, target is ${targetFeature}`,
      };
    }
    if (!featureEnabled && targetFeature !== null) {
      return {
        allowed: false,
        reason: `feature ${targetFeature} is disabled; cannot qualify feature-enabled path`,
      };
    }
  }

  return { allowed: true, nextStatus: requestedStatus };
}

/** Check whether a claim can advance from its current status to SECURITY_QUALIFIED. */
export function canQualifySecurity(input: {
  submitterIdentity: string;
  implementerIdentity: string;
  currentStatus: AcceptanceStatus;
  evidenceProvided: boolean;
  runtimeVerified: boolean;
  isIntegrationTest: boolean;
  featureEnabled: boolean;
  compilationFeature: string | null;
  targetFeature: string | null;
}): TransitionResult {
  return canTransition({
    ...input,
    requestedStatus: 'SECURITY_QUALIFIED' as AcceptanceStatus,
  });
}
