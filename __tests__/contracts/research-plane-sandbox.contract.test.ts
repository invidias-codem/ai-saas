// Research Plane — R1B.1: Sandboxed Lean execution contract tests.
//
// Validates that untrusted Lean verification runs inside an isolated
// sandbox with no host credentials, restricted filesystem, enforced
// timeout, and fail-closed behavior on sandbox failure or timeout.
//
// These tests mock @/lib/execution/sandboxManager to verify the Lean
// adapter routes execution through the sandbox (not execFileSync directly)
// and handles sandbox outcomes correctly (timeout → INCONCLUSIVE, failure → FAILED).
//
// The underlying sandbox security properties (secret scrubbing, path
// traversal protection, output buffer caps) are covered by
// __tests__/execution/sandboxManager.test.ts.

jest.mock('@/lib/execution/sandboxManager', () => ({
  sandboxManager: {
    execute: jest.fn(),
  },
}));

import { sandboxManager } from '@/lib/execution/sandboxManager';
import { createLeanVerifierProvider } from '@/lib/research/verification/leanAdapter';
import { sha256Bytes } from '@/lib/research/contracts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHALLENGE = `def Target : Prop := ∀ p q : Prop, p ∧ q → q ∧ p`;
const VALID_CANDIDATE = `def solution : Target := fun p q h => ⟨h.2, h.1⟩`;

// `#print axioms` output for a proof with no dependencies.
const NO_AXIOM_OUTPUT = "'solution' does not depend on any axioms";

function makeVerifyResult(exitCode: number, stdout: string, timedOut = false) {
  return { exitCode, stdout, stderr: '', timedOut };
}

describe('R1B.1 — sandboxed Lean execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sandboxManager.execute as jest.Mock).mockResolvedValue(
      makeVerifyResult(0, NO_AXIOM_OUTPUT),
    );
  });

  it('routes Lean execution through sandbox with isolated workdir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lean-sandbox-test-'));
    try {
      writeFileSync(join(dir, 'Challenge.lean'), CHALLENGE);
      writeFileSync(join(dir, 'Candidate.lean'), VALID_CANDIDATE);

      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(VALID_CANDIDATE);
      const provider = createLeanVerifierProvider();

      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });

      expect(sandboxManager.execute).toHaveBeenCalledTimes(1);
      const callArgs = (sandboxManager.execute as jest.Mock).mock.calls[0][0];
      expect(callArgs.command).toBe('lean Verify.lean');
      expect(callArgs.language).toBe('sh');
      expect(callArgs.workdir).toBeDefined();
      expect(callArgs.workdir).toContain('lean-verify-');
      expect(callArgs.timeoutMs).toBe(300_000);
      expect(result.outcome).toBe('VERIFIED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports INCONCLUSIVE when sandbox times out (never VERIFIED)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lean-sandbox-test-'));
    try {
      writeFileSync(join(dir, 'Challenge.lean'), CHALLENGE);
      writeFileSync(join(dir, 'Candidate.lean'), VALID_CANDIDATE);

      (sandboxManager.execute as jest.Mock).mockResolvedValue(
        makeVerifyResult(124, '', true),
      );

      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(VALID_CANDIDATE);
      const provider = createLeanVerifierProvider();

      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });

      expect(result.outcome).toBe('INCONCLUSIVE');
      expect(result.checkResults.replay.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports FAILED when sandbox execution returns non-zero exit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lean-sandbox-test-'));
    try {
      writeFileSync(join(dir, 'Challenge.lean'), CHALLENGE);
      writeFileSync(join(dir, 'Candidate.lean'), VALID_CANDIDATE);

      (sandboxManager.execute as jest.Mock).mockResolvedValue(
        makeVerifyResult(1, 'lean error'),
      );

      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(VALID_CANDIDATE);
      const provider = createLeanVerifierProvider();

      const result = await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });

      expect(result.outcome).toBe('FAILED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses SandboxManager instance (not execFileSync directly)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lean-sandbox-test-'));
    try {
      writeFileSync(join(dir, 'Challenge.lean'), CHALLENGE);
      writeFileSync(join(dir, 'Candidate.lean'), VALID_CANDIDATE);

      const specHash = sha256Bytes(CHALLENGE);
      const candidateHash = sha256Bytes(VALID_CANDIDATE);
      const provider = createLeanVerifierProvider();

      await provider.verify({
        specHash,
        candidateHash,
        candidatePath: join(dir, 'Candidate.lean'),
        specPath: join(dir, 'Challenge.lean'),
      });

      // SandboxManager.execute is called — execution is sandboxed.
      expect(sandboxManager.execute).toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
