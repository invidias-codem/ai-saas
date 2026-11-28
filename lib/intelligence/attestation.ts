// lib/intelligence/attestation.ts
// 6A.3: execution attestation. Closes the "gate existed but never executed,
// yet CI was green" class. Principle: ABSENCE OF FAILURE IS NOT EVIDENCE OF
// EXECUTION.
//
// Pure — no I/O. CI writes attestation files via scripts/attestation-cli.ts;
// release/activation policy verifies them with verifyAttestation().

export interface GateAttestation {
  /** e.g. 'decision-plane-contracts', 'decision-plane-eval'. */
  suite: string;
  /** Candidate commit the attestation was produced against. */
  commit: string;
  /** True only if the suite genuinely executed. Skips are recorded, visible, and NOT green. */
  executed: boolean;
  /** Skip/short-circuit reason when executed === false. */
  skipReason?: string;
  startedAt?: string;
  completedAt?: string;
  testCount?: number;
  passed?: number;
  failed?: number;
  /** Version of the attestation schema. */
  schemaVersion: 1;
}

export interface VerificationPolicy {
  requiredSuite: string;
  candidateCommit: string;
  requireExecuted?: boolean;
  requireZeroFailures?: boolean;
}

export interface VerificationResult {
  ok: boolean;
  reasons: string[];
}

export function buildAttestation(args: {
  suite: string;
  commit: string;
  executed: boolean;
  skipReason?: string;
  startedAt?: string;
  completedAt?: string;
  testCount?: number;
  passed?: number;
  failed?: number;
}): GateAttestation {
  return {
    schemaVersion: 1,
    suite: args.suite,
    commit: args.commit,
    executed: args.executed,
    ...(args.skipReason !== undefined ? { skipReason: args.skipReason } : {}),
    ...(args.startedAt !== undefined ? { startedAt: args.startedAt } : {}),
    ...(args.completedAt !== undefined ? { completedAt: args.completedAt } : {}),
    ...(args.testCount !== undefined ? { testCount: args.testCount } : {}),
    ...(args.passed !== undefined ? { passed: args.passed } : {}),
    ...(args.failed !== undefined ? { failed: args.failed } : {}),
  };
}

/** From jest's --json summary. */
export function attestationFromJestJson(args: {
  suite: string;
  commit: string;
  jestJson: {
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    success?: boolean;
    startTime?: number;
  };
}): GateAttestation {
  const j = args.jestJson;
  const total = j.numTotalTests ?? 0;
  const passed = j.numPassedTests ?? 0;
  const failed = j.numFailedTests ?? 0;
  return buildAttestation({
    suite: args.suite,
    commit: args.commit,
    // Zero tests discovered IS a red flag, not a pass: an empty suite means
    // the test definition drifted away from the runner.
    executed: total > 0 && (j.success ?? false),
    skipReason: total === 0 ? 'no_tests_discovered' : undefined,
    startedAt: j.startTime ? new Date(j.startTime).toISOString() : undefined,
    testCount: total,
    passed,
    failed,
  });
}

export function verifyAttestation(
  attestation: GateAttestation,
  policy: VerificationPolicy,
): VerificationResult {
  const reasons: string[] = [];
  if (attestation.suite !== policy.requiredSuite) {
    reasons.push(`suite mismatch: expected ${policy.requiredSuite}, got ${attestation.suite}`);
  }
  if (attestation.commit !== policy.candidateCommit) {
    reasons.push(`commit mismatch: attestation is for ${attestation.commit}, candidate is ${policy.candidateCommit}`);
  }
  if (policy.requireExecuted !== false && !attestation.executed) {
    reasons.push(`suite not executed${attestation.skipReason ? ` (${attestation.skipReason})` : ''}`);
  }
  if (policy.requireZeroFailures !== false && (attestation.failed ?? 0) > 0) {
    reasons.push(`failures present: ${attestation.failed}`);
  }
  if (policy.requireZeroFailures !== false && attestation.testCount !== undefined && attestation.testCount === 0) {
    reasons.push('zero tests discovered');
  }
  if (attestation.schemaVersion !== 1) {
    reasons.push(`unsupported schemaVersion ${attestation.schemaVersion}`);
  }
  return { ok: reasons.length === 0, reasons };
}
