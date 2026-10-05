// __tests__/contracts/attestation.contract.test.ts
// 6A.3 contracts: absence of failure is NOT evidence of execution.
//   1. skip attestations are explicit and visible (executed:false + reason)
//   2. zero-tests-discovered is executed:false, never a green pass
//   3. verify rejects: not executed, commit mismatch, suite mismatch,
//      failures present, wrong schema
//   4. verify accepts genuine executed+green+commit-matched attestations
//   5. determinism / purity

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  attestationFromJestJson,
  buildAttestation,
  verifyAttestation,
} from '@/lib/intelligence/attestation';

const COMMIT = 'abc123';

function greenJest() {
  return { numTotalTests: 131, numPassedTests: 131, numFailedTests: 0, success: true, startTime: 1_700_000_000_000 };
}

describe('execution attestation — 6A.3 contracts', () => {
  it('1: skips are recorded explicitly, never silent', () => {
    const att = buildAttestation({ suite: 'decision-plane-eval', commit: COMMIT, executed: false, skipReason: 'path_filter_no_relevant_changes' });
    expect(att.executed).toBe(false);
    expect(att.skipReason).toBe('path_filter_no_relevant_changes');
    const v = verifyAttestation(att, { requiredSuite: 'decision-plane-eval', candidateCommit: COMMIT });
    expect(v.ok).toBe(false); // a skip can never satisfy a required gate
    expect(v.reasons.join(' ')).toContain('not executed');
  });

  it('2: zero tests discovered is executed:false — an empty suite is a red flag', () => {
    const att = attestationFromJestJson({ suite: 'decision-plane-contracts', commit: COMMIT, jestJson: { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, success: true } });
    expect(att.executed).toBe(false);
    expect(att.skipReason).toBe('no_tests_discovered');
    const v = verifyAttestation(att, { requiredSuite: 'decision-plane-contracts', candidateCommit: COMMIT });
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toContain('no_tests_discovered');
  });

  it('3: verify rejects every dishonest or mismatched shape', () => {
    const good = attestationFromJestJson({ suite: 's', commit: COMMIT, jestJson: greenJest() });
    // commit mismatch — the June incident shape: green run against the WRONG code.
    expect(verifyAttestation(good, { requiredSuite: 's', candidateCommit: 'other' }).ok).toBe(false);
    expect(verifyAttestation(good, { requiredSuite: 's', candidateCommit: 'other' }).reasons.join(' ')).toContain('commit mismatch');
    // suite mismatch
    expect(verifyAttestation(good, { requiredSuite: 'different', candidateCommit: COMMIT }).ok).toBe(false);
    // failures present
    const failing = attestationFromJestJson({ suite: 's', commit: COMMIT, jestJson: { numTotalTests: 5, numPassedTests: 3, numFailedTests: 2, success: false } });
    expect(verifyAttestation(failing, { requiredSuite: 's', candidateCommit: COMMIT }).reasons.join(' ')).toContain('failures present');
    // wrong schema version
    expect(verifyAttestation({ ...good, schemaVersion: 99 as unknown as 1 }, { requiredSuite: 's', candidateCommit: COMMIT }).ok).toBe(false);
  });

  it('4: a genuine executed green attestation against the candidate verifies', () => {
    const att = attestationFromJestJson({ suite: 'decision-plane-contracts', commit: COMMIT, jestJson: greenJest() });
    expect(att.executed).toBe(true);
    expect(att.testCount).toBe(131);
    expect(att.passed).toBe(131);
    const v = verifyAttestation(att, { requiredSuite: 'decision-plane-contracts', candidateCommit: COMMIT });
    expect(v.ok).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('5: attestation module is pure and deterministic', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/attestation.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\(\)|Math\.random\(\)|fetch\(|axios|supabaseAdmin|require\('fs'\)|from ['\"]fs/);
    const a = attestationFromJestJson({ suite: 's', commit: COMMIT, jestJson: greenJest() });
    const b = attestationFromJestJson({ suite: 's', commit: COMMIT, jestJson: greenJest() });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
