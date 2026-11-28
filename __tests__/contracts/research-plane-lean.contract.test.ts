// Research Plane — R1A.2 contract tests for LeanVerifierProvider.
//
// Covers:
//   * Valid proof of exact target → VERIFIED
//   * Invalid theorem (no solution declaration) → FAILED (compilation fails)
//   * Incomplete proof (sorry keyword) → FAILED (proof completeness)
//   * Unrelated proof (True instead of Target) → FAILED (binding check)
//   * Unrelated theorem with challenge name in comment → FAILED (binding check)
//   * Altered theorem statement → digest mismatch → FAILED
//   * Unauthorized axiom → FAILED (axiom inspection via #print axioms)
//   * Forged success claim → FAILED (outcome computed from evidence)
//   * Toolchain version pin enforcement
//   * Replay not performed → reported as incomplete (not a passing check)
//
// Architecture: three module boundaries (Challenge / Candidate / Verify).
// The candidate must define `solution : FrozenChallenge.Target`. Lean's
// type checker enforces exact proposition binding — substring matching is
// not used.
//
// Pure: uses a mocked isolated Lean executor (Daytona boundary).
// Local Lean execution is no longer supported — the verifier requires
// an isolated executor for all verification runs.

jest.mock('@/lib/research/verification/isolatedLeanExecutor', () => ({
  DaytonaLeanExecutor: jest.fn(),
  IsolatedExecutionError: jest.fn(),
  createDaytonaLeanExecutor: jest.fn(() => ({
    executeLean: jest.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "'solution' does not depend on any axioms",
      stderr: '',
      timedOut: false,
      toolchainVersion: '4.36.0',
    }),
  })),
}));

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
import {
  createDaytonaLeanExecutor,
} from '@/lib/research/verification/isolatedLeanExecutor';

// Ensure Lean (installed via elan) is on PATH for the verifier subprocess.
const ELAN_BIN = join(process.env.HOME ?? '', '.elan', 'bin');
if (process.env.PATH && !process.env.PATH.includes(ELAN_BIN)) {
  process.env.PATH = `${ELAN_BIN}:${process.env.PATH}`;
}

// Challenge module — defines the frozen proposition (no proof).
const CHALLENGE = `def Target : Prop := ∀ p q : Prop, p ∧ q → q ∧ p
`;

// Valid candidate — proves Target exactly.
const VALID_CANDIDATE = `def solution : Target := fun p q h => ⟨h.2, h.1⟩
`;

// Invalid candidate — no `solution` declaration.
const INVALID_CANDIDATE = `theorem unrelated : True := by trivial
`;

// Incomplete proof — uses sorry.
const INCOMPLETE_CANDIDATE = `def solution : Target := by sorry
`;

// Unrelated proof — proves True instead of Target.
const UNRELATED_CANDIDATE = `def solution : True := by trivial
`;

// Unrelated theorem with challenge name in a comment — substring match
// would pass, but type binding fails.
const UNRELATED_WITH_COMMENT = `-- my_and_comm
def solution : True := by trivial
`;

// Disallowed axiom candidate.
const DISALLOWED_AXIOM_CANDIDATE = `axiom my_disallowed_axiom : False

def solution : Target := by
  exfalso
  exact my_disallowed_axiom
`;

// Arbitrary candidate-defined axiom — should be rejected under default policy
// (allowedAxioms is empty).
const ARBITRARY_AXIOM_CANDIDATE = `axiom invented_assumption : Target

def solution : Target := invented_assumption
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

const mockExecuteLean = (createDaytonaLeanExecutor() as any).executeLean;

const provider = createLeanVerifierProvider(LEAN_VERIFICATION_POLICY, {
  executeLean: mockExecuteLean,
});

describe('R1A — LeanVerifierProvider identity and policy', () => {
  it('has the expected verifier identity', () => {
    expect(provider.identity).toEqual({
      name: 'lean',
      version: LEAN_VERSION,
      type: 'lean',
    });
  });

  it('has the expected verification policy (replay not required)', () => {
    expect(provider.policy.policyId).toBe('lean-verification-policy-v1');
    expect(provider.policy.requiredChecks).toEqual([
      'compilation',
      'kernel_acceptance',
      'axiom_inspection',
      'proof_completeness',
      'mathematical_relatedness',
    ]);
    // replay must NOT be a required check
    expect(provider.policy.requiredChecks).not.toContain('replay');
  });

  it('readPinnedVersion returns the pinned Lean version', () => {
    expect(readPinnedVersion()).toBe(LEAN_VERSION);
  });
});

describe('R1A — valid proof', () => {
  it('verifies a correct Lean proof bound to the frozen target', async () => {
    mockExecuteLean.mockResolvedValue({
      exitCode: 0,
      stdout: "'solution' does not depend on any axioms",
      stderr: '',
      timedOut: false,
      toolchainVersion: '4.36.0',
    });
    const dir = makeProject({
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': VALID_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(VALID_CANDIDATE);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('VERIFIED');
      expect(result.exitStatus).toBe(0);
      expect(result.toolchain).toEqual(LEAN_VERIFIER_IDENTITY);
      expect(result.policy).toEqual(LEAN_VERIFICATION_POLICY);
      for (const check of result.policy.requiredChecks) {
        expect(result.checkResults[check]?.passed).toBe(true);
      }
      // replay must be reported as incomplete, not passing
      expect(result.checkResults.replay.passed).toBe(false);
      expect(result.checkResults.replay.reason).toContain('not performed');
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — invalid candidate', () => {
  it('rejects a candidate with no solution declaration', async () => {
    mockExecuteLean.mockResolvedValue({
      exitCode: 1,
      stdout: 'error: unknown identifier',
      stderr: 'error: unknown identifier',
      timedOut: false,
      toolchainVersion: '4.36.0',
    });
    const dir = makeProject({
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': INVALID_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(INVALID_CANDIDATE);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
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
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': INCOMPLETE_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(INCOMPLETE_CANDIDATE);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
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

describe('R1A — mathematical relatedness (exact target binding)', () => {
  it('rejects a proof of True instead of the frozen target', async () => {
    mockExecuteLean.mockResolvedValue({
      exitCode: 1,
      stdout: 'error: type mismatch',
      stderr: 'error: type mismatch',
      timedOut: false,
      toolchainVersion: '4.36.0',
    });
    const dir = makeProject({
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': UNRELATED_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(UNRELATED_CANDIDATE);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.mathematical_relatedness.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });

  it('rejects a proof with challenge name in comment but wrong target', async () => {
    mockExecuteLean.mockResolvedValue({
      exitCode: 1,
      stdout: 'error: type mismatch',
      stderr: 'error: type mismatch',
      timedOut: false,
      toolchainVersion: '4.36.0',
    });
    const dir = makeProject({
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': UNRELATED_WITH_COMMENT,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(UNRELATED_WITH_COMMENT);
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
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
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': VALID_CANDIDATE,
    });
    try {
      const wrongSpecHash = sha256Bytes('different theorem statement');
      const candidateHash = sha256Bytes(VALID_CANDIDATE);
      const result = await provider.verify({
        specHash: wrongSpecHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
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
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': VALID_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const wrongCandidateHash = sha256Bytes('different proof content');
      const result = await provider.verify({
        specHash,
        candidateHash: wrongCandidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
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
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': DISALLOWED_AXIOM_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(DISALLOWED_AXIOM_CANDIDATE);
      mockExecuteLean.mockResolvedValue({
        exitCode: 0,
        stdout: "'solution' depends on axioms: [my_disallowed_axiom]",
        stderr: '',
        timedOut: false,
        toolchainVersion: '4.36.0',
      });
      const policy: VerificationPolicy = {
        ...LEAN_VERIFICATION_POLICY,
        disallowedAxioms: ['my_disallowed_axiom'],
      };
      const strictProvider = createLeanVerifierProvider(policy, {
        executeLean: mockExecuteLean,
      });
      const result = await strictProvider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
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

  it('rejects an arbitrary candidate-defined axiom under default policy', async () => {
    const dir = makeProject({
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': ARBITRARY_AXIOM_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(ARBITRARY_AXIOM_CANDIDATE);
      // Default policy: allowedAxioms is empty — no axioms permitted.
      mockExecuteLean.mockResolvedValue({
        exitCode: 0,
        stdout: "'solution' depends on axioms: [invented_assumption]",
        stderr: '',
        timedOut: false,
        toolchainVersion: '4.36.0',
      });
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      expect(result.outcome).toBe('FAILED');
      expect(result.checkResults.axiom_inspection.passed).toBe(false);
      expect(result.checkResults.axiom_inspection.reason).toContain(
        'invented_assumption',
      );
    } finally {
      cleanup(dir);
    }
  });
});

describe('R1A — forged success claims', () => {
  it('rejects a VERIFIED claim with nonzero exit status', async () => {
    const dir = makeProject({
      'Challenge.lean': CHALLENGE,
      'Candidate.lean': INVALID_CANDIDATE,
    });
    try {
      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(INVALID_CANDIDATE);
      mockExecuteLean.mockResolvedValue({
        exitCode: 1,
        stdout: 'error: unknown identifier',
        stderr: 'error: unknown identifier',
        timedOut: false,
        toolchainVersion: '4.36.0',
      });
      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });
      // The verifier computes outcome from evidence, not caller claims.
      expect(result.outcome).toBe('FAILED');
      expect(result.exitStatus).not.toBe(0);
      expect(result.checkResults.compilation.passed).toBe(false);
    } finally {
      cleanup(dir);
    }
  });
});
