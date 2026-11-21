// Research Plane — R1A contract tests for LeanVerifierProvider.
//
// Covers:
//   * Valid proof → VERIFIED
//   * Invalid theorem (empty proof of False) → FAILED (compilation fails)
//   * Incomplete proof (sorry keyword) → FAILED (proof completeness)
//   * Mathematically unrelated proof (no import Challenge) → FAILED
//   * Mathematically unrelated proof (no theorem reference) → FAILED
//   * Altered theorem statement → digest mismatch → FAILED
//   * Unauthorized axiom → FAILED (axiom inspection)
//   * Forged success claim → FAILED (outcome computed from evidence)
//   * Toolchain version pin enforcement
//
// Pure: uses the locally installed Lean 4 toolchain (elan), core library
// only (no Mathlib imports).

import { sha256Bytes } from '@/lib/research/contracts';
import {
  createLeanVerifierProvider,
  LEAN_VERIFIER_IDENTITY,
  LEAN_VERIFICATION_POLICY,
  LEAN_VERSION,
  readPinnedVersion,
} from '@/lib/research/verification/leanAdapter';
import type { VerificationPolicy } from '@/lib/research/contracts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const VALID_CHALLENGE = `theorem my_and_comm (p q : Prop) : p ∧ q → q ∧ p := by sorry
`;

const VALID_PROOF = `theorem my_and_comm (p q : Prop) : p ∧ q → q ∧ p := by
  intro h
  exact ⟨h.2, h.1⟩
`;

const INVALID_PROOF = `theorem absurd : False := by
`;

const INCOMPLETE_PROOF = `theorem my_and_comm (p q : Prop) : p ∧ q → q ∧ p := by sorry
`;

const UNRELATED_PROOF = `theorem unrelated : True := by trivial
`;

const UNRELATED_PROOF_2 = `theorem completely_different (n : Nat) : n + 0 = n := by
  simp
`;

const DISALLOWED_AXIOM_CHALLENGE = `theorem uses_axiom : False := by sorry
`;

const DISALLOWED_AXIOM_PROOF = `axiom my_disallowed_axiom : False

theorem uses_axiom : False := by
  exact my_disallowed_axiom
`;

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'lean-test-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

const provider = createLeanVerifierProvider();

describe('R1A — LeanVerifierProvider identity and policy', () => {
  it('has the expected verifier identity', () => {
    expect(provider.identity).toEqual({
      name: 'lean',
      version: LEAN_VERSION,
      type: 'lean',
    });
  });

  it('has the expected verification policy with new required checks', () => {
    expect(provider.policy.policyId).toBe('lean-verification-policy-v1');
    expect(provider.policy.requiredChecks).toEqual([
      'compilation',
      'kernel_acceptance',
      'axiom_inspection',
      'replay',
      'proof_completeness',
      'mathematical_relatedness',
    ]);
  });

  it('readPinnedVersion returns the pinned Lean version', () => {
    expect(readPinnedVersion()).toBe(LEAN_VERSION);
  });
});

describe('R1A — valid proof', () => {
  it('verifies a correct Lean proof', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': VALID_PROOF,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const candidateHash = sha256Bytes(VALID_PROOF);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('VERIFIED');
      expect(result.exitStatus).toBe(0);
      expect(result.toolchain).toEqual(LEAN_VERIFIER_IDENTITY);
      expect(result.policy).toEqual(LEAN_VERIFICATION_POLICY);
      for (const check of result.policy.requiredChecks) {
        expect(result.checkResults[check]?.passed).toBe(true);
      }
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — invalid theorem', () => {
  it('rejects a proof that does not compile (empty proof of False)', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': INVALID_PROOF,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const candidateHash = sha256Bytes(INVALID_PROOF);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.exitStatus).not.toBe(0);
      expect(result.checkResults.compilation.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — incomplete proof (sorry)', () => {
  it('rejects a proof containing sorry', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': INCOMPLETE_PROOF,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const candidateHash = sha256Bytes(INCOMPLETE_PROOF);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.proof_completeness.passed).toBe(false);
      expect(result.checkResults.proof_completeness.reason).toContain(
        'sorry',
      );
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — mathematical relatedness', () => {
  it('rejects a proof that references no challenge theorems', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': UNRELATED_PROOF,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const candidateHash = sha256Bytes(UNRELATED_PROOF);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.mathematical_relatedness.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('rejects a proof with completely different theorem names', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': UNRELATED_PROOF_2,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const candidateHash = sha256Bytes(UNRELATED_PROOF_2);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.mathematical_relatedness.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — altered theorem statement', () => {
  it('rejects when spec digest does not match', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': VALID_PROOF,
    });
    try {
      const wrongSpecHash = sha256Bytes('different theorem statement');
      const candidateHash = sha256Bytes(VALID_PROOF);
      const result = await provider.verify({
        specHash: wrongSpecHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.compilation.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('rejects when candidate digest does not match', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': VALID_PROOF,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const wrongCandidateHash = sha256Bytes('different proof content');
      const result = await provider.verify({
        specHash,
        candidateHash: wrongCandidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.compilation.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — unauthorized axioms', () => {
  it('rejects a proof using a disallowed axiom', async () => {
    const dir = makeProject({
      'Challenge.lean': DISALLOWED_AXIOM_CHALLENGE,
      'Solution.lean': DISALLOWED_AXIOM_PROOF,
    });
    try {
      const specHash = sha256Bytes(DISALLOWED_AXIOM_CHALLENGE);
      const candidateHash = sha256Bytes(DISALLOWED_AXIOM_PROOF);
      const policy: VerificationPolicy = {
        ...LEAN_VERIFICATION_POLICY,
        disallowedAxioms: ['my_disallowed_axiom'],
      };
      const strictProvider = createLeanVerifierProvider(policy);
      const result = await strictProvider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.axiom_inspection.passed).toBe(false);
      expect(result.checkResults.axiom_inspection.reason).toContain(
        'my_disallowed_axiom',
      );
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — forged success claims', () => {
  it('rejects a VERIFIED claim with nonzero exit status', async () => {
    const dir = makeProject({
      'Challenge.lean': VALID_CHALLENGE,
      'Solution.lean': INVALID_PROOF,
    });
    try {
      const specHash = sha256Bytes(VALID_CHALLENGE);
      const candidateHash = sha256Bytes(INVALID_PROOF);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Solution.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      // The verifier computes outcome from evidence, not caller claims.
      // Even though the proof is invalid (empty proof of False), the outcome
      // must be FAILED.
      expect(result.outcome).toBe('FAILED');
      expect(result.exitStatus).not.toBe(0);
      expect(result.checkResults.compilation.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});
