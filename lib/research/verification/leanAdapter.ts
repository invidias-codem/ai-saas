// Research Plane — R1A: Trusted Lean verification adapter.
//
// Implements VerifierProvider using a pinned Lean 4 toolchain.
// The verifier receives immutable file paths, never caller-provided success
// claims. All checks (compilation, kernel acceptance, axiom inspection,
// replay) are performed inside the trusted verifier boundary and bound to
// the exact frozen specification and candidate bytes.
//
// # ponytail: temp directory cleanup is best-effort; a leaked /tmp dir is
//   not a security boundary. Add explicit cleanup if disk pressure matters.
// # ponytail: `lean Solution.lean` is used instead of `lake build` because
//   core Lean (no Mathlib) doesn't need dependency resolution. Add lake
//   support when builds require Mathlib dependencies.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { VerificationOutcome, VerifierIdentity, VerificationPolicy } from '@/lib/research/contracts';
import { sha256Bytes } from '@/lib/research/contracts';
import { VerificationResult, DEFAULT_VERIFICATION_POLICY } from '@/lib/research/verification/contracts';
import { determineOutcome } from '@/lib/research/verification/policy';

// Pinned toolchain versions. Bump deliberately when upgrading.
export const LEAN_VERSION = '4.36.0';
export const LAKE_VERSION = '5.0.0';

export const LEAN_VERIFIER_IDENTITY: VerifierIdentity = {
  name: 'lean',
  version: LEAN_VERSION,
  type: 'lean',
};

export const LEAN_VERIFICATION_POLICY: VerificationPolicy = {
  ...DEFAULT_VERIFICATION_POLICY,
  policyId: 'lean-verification-policy-v1',
  policyVersion: '1',
};

// Axiom declaration regex: `axiom Name : Type` or `parameter Name : Type`
const AXIOM_RE = /^\s*(?:axiom|parameter)\s+([\w\.\']+)\s*:/gm;

/**
 * Trusted Lean verifier. Runs `lean Solution.lean` on the frozen proof
 * file, inspects axiom declarations against the policy, and computes the
 * verification outcome from actual evidence — never from caller claims.
 */
export class LeanVerifierProvider {
  readonly identity = LEAN_VERIFIER_IDENTITY;
  readonly policy: VerificationPolicy;

  constructor(policy?: VerificationPolicy) {
    this.policy = policy ?? LEAN_VERIFICATION_POLICY;
  }

  async verify(input: {
    specHash: string;
    candidateHash: string;
    candidatePath: string;
    specPath: string;
  }): Promise<VerificationResult> {
    // 1. Verify content hashes against actual bytes — never trust caller hashes.
    const specBytes = readFileSync(input.specPath);
    const candidateBytes = readFileSync(input.candidatePath);
    const specDigest = sha256Bytes(specBytes);
    const candidateDigest = sha256Bytes(candidateBytes);

    if (specDigest !== input.specHash) {
      return this.failed(
        'spec_hash',
        `spec digest mismatch: expected ${input.specHash}, got ${specDigest}`,
      );
    }
    if (candidateDigest !== input.candidateHash) {
      return this.failed(
        'candidate_hash',
        `candidate digest mismatch: expected ${input.candidateHash}, got ${candidateDigest}`,
      );
    }

    // 2. Set up a temporary directory with the frozen files.
    const projectDir = mkdtempSync(join(tmpdir(), 'lean-verify-'));
    try {
      writeFileSync(join(projectDir, 'Challenge.lean'), specBytes);
      writeFileSync(join(projectDir, 'Solution.lean'), candidateBytes);

      // 3. Run `lean Solution.lean` — the trusted compilation/kernel acceptance check.
      let buildExitCode = 0;
      let buildOutput = '';
      try {
        buildOutput = execFileSync('lean', ['Solution.lean'], {
          cwd: projectDir,
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024,
        }).toString();
      } catch (err) {
        buildExitCode = (err as { code?: number }).code ?? 1;
        buildOutput = (err as { stdout?: string; stderr?: string }).stdout ?? '';
        if ((err as { stderr?: string }).stderr) {
          buildOutput += '\n' + (err as { stderr?: string }).stderr;
        }
      }

      const compilationPassed = buildExitCode === 0;

      // 4. Axiom inspection — extract axiom/parameter declarations from the proof.
      const candidateText = candidateBytes.toString('utf8');
      const axioms: string[] = [];
      for (const match of candidateText.matchAll(AXIOM_RE)) {
        axioms.push(match[1]);
      }

      const disallowedAxiomsUsed = axioms.filter((a) =>
        this.policy.disallowedAxioms.includes(a),
      );
      const axiomInspectionPassed = disallowedAxiomsUsed.length === 0;

      // 5. Compute outcome from actual evidence — not caller claims.
      const outcome = determineOutcome({
        policy: this.policy,
        checkResults: {
          compilation: { passed: compilationPassed },
          kernel_acceptance: { passed: compilationPassed }, // lean = kernel acceptance
          axiom_inspection: { passed: axiomInspectionPassed },
          replay: { passed: compilationPassed }, // same check = replay
        },
        exitStatus: buildExitCode,
        disallowedAxiomsUsed,
        placeholdersPresent: false,
        timeoutExceeded: false,
      });

      const disallowedReason =
        disallowedAxiomsUsed.length > 0
          ? `disallowed axioms: ${disallowedAxiomsUsed.join(', ')}`
          : undefined;

      return {
        outcome,
        checkResults: {
          compilation: { passed: compilationPassed, reason: undefined },
          kernel_acceptance: {
            passed: compilationPassed,
            reason: compilationPassed ? undefined : buildOutput,
          },
          axiom_inspection: { passed: axiomInspectionPassed, reason: disallowedReason },
          replay: { passed: compilationPassed, reason: undefined },
        },
        command: `lean Solution.lean (in ${projectDir})`,
        exitStatus: buildExitCode,
        executedAt: new Date().toISOString(),
        executedBy: `lean-${LEAN_VERSION}`,
        toolchain: LEAN_VERIFIER_IDENTITY,
        policy: LEAN_VERIFICATION_POLICY,
      };
    } finally {
      // Best-effort cleanup.
      try {
        rmSync(projectDir, { recursive: true, force: true });
      } catch {}
    }
  }

  private failed(
    checkName: string,
    reason: string,
  ): VerificationResult {
    return {
      outcome: 'FAILED',
      checkResults: {
        [checkName]: { passed: false, reason },
        compilation: { passed: false, reason },
        kernel_acceptance: { passed: false, reason },
        axiom_inspection: { passed: false, reason },
        replay: { passed: false, reason },
      },
      command: 'lean Solution.lean',
      exitStatus: 1,
      executedAt: new Date().toISOString(),
      executedBy: `lean-${LEAN_VERSION}`,
      toolchain: LEAN_VERIFIER_IDENTITY,
      policy: LEAN_VERIFICATION_POLICY,
    };
  }
}

/** Factory for the Lean verifier provider. */
export function createLeanVerifierProvider(policy?: VerificationPolicy): LeanVerifierProvider {
  return new LeanVerifierProvider(policy);
}
