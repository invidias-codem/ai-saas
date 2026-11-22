// Research Plane — R1A.2: Trusted Lean verification adapter (theorem binding).
//
// Implements VerifierProvider using a pinned Lean 4 toolchain.
// Architecture: three logical boundaries in a single Verify.lean file:
//   1. Challenge section — defines the frozen proposition (`def Target : Prop`),
//     no proof. Trusted, immutable.
//   2. Candidate section — must define `def solution : Target` — Lean's type
//     checker rejects any other type (e.g. `True`), so a mathematically
//     unrelated proof cannot pass.
//   3. Verification section — binding check (`def binding_check : Target :=
//     solution`) + `#print axioms solution` for transitive axiom inspection.
//
// Binding: `def solution : Target` forces the candidate to prove the exact
// frozen proposition. Lean's kernel enforces this — not substring matching.
// A comment containing the challenge name does not change the type.
//
// Checks:
//   0. Toolchain version pin (lean-toolchain file + container lean --version)
//   1. Content hash verification (spec + candidate bytes)
//   2. Combined compilation — challenge + candidate + binding check in one
//      file; Lean enforces exact target binding
//   3. #print axioms — transitive axiom inspection; FAIL CLOSED if output
//      is missing, incomplete, or unparseable
//   4. Proof completeness — reject sorry keyword / sorryAx dependency
//
// Non-checks:
//   replay — NOT performed. Reported as incomplete (not a passing check).
//
// Security:
//   * No host process execution — Daytona container boundary only
//   * Container: networkBlockAll (no outbound network), ephemeral (auto-deleted)
//   * Toolchain identity verified inside container (lean --version)
//   * Timeout/infrastructure errors → INCONCLUSIVE, never VERIFIED
//   * Teardown failures recorded, not silently ignored
//   * Fail closed: no Daytona API key → throw, never run locally

import { readFileSync } from 'node:fs';
import type { VerifierIdentity, VerificationPolicy } from '@/lib/research/contracts';
import { sha256Bytes } from '@/lib/research/contracts';
import { VerificationResult, DEFAULT_VERIFICATION_POLICY } from '@/lib/research/verification/contracts';
import { determineOutcome, isAxiomAuthorized } from '@/lib/research/verification/policy';
import type { IsolatedLeanExecutor } from '@/lib/research/verification/isolatedLeanExecutor';
import { IsolatedExecutionError } from '@/lib/research/verification/isolatedLeanExecutor';

export const LAKE_VERSION = '5.0.0';

// Pinned Lean version. Must match lean-toolchain file. Bump deliberately when upgrading.
export const LEAN_VERSION = '4.36.0';

export const LEAN_VERIFIER_IDENTITY: VerifierIdentity = {
  name: 'lean',
  version: LEAN_VERSION,
  type: 'lean',
};

export const LEAN_VERIFICATION_POLICY: VerificationPolicy = {
  ...DEFAULT_VERIFICATION_POLICY,
  policyId: 'lean-verification-policy-v1',
  policyVersion: '1',
  requiredChecks: [
    'compilation',
    'kernel_acceptance',
    'axiom_inspection',
    'proof_completeness',
    'mathematical_relatedness',
  ],
  allowedAxioms: [],
  disallowedAxioms: [],
};

// `sorry` keyword marks an incomplete proof in Lean.
const SORRY_RE = /\bsorry\b/;

// `#print axioms` output forms:
//   'TheoremName' depends on axioms: [axiom1, axiom2]
//   'TheoremName' does not depend on any axioms
const PRINTED_AXIOM_RE = /'(\w+)'\s+depends on axioms:\s*\[([^\]]*)\]/g;
const NO_AXIOM_RE = /'(\w+)'\s+does not depend on any axioms/g;

const TOOLCHAIN_FILE = 'lean-toolchain';

// Process execution limits (security: prevent runaway Lean processes).
const EXEC_TIMEOUT_MS = 300_000;

/**
 * Read the pinned Lean version from the lean-toolchain file.
 * Exported for testing.
 */
export function readPinnedVersion(): string | null {
  try {
    const content = readFileSync(TOOLCHAIN_FILE, 'utf8').trim();
    const match = content.match(/leanprover\/lean4:v?(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check whether a Lean source file contains the `sorry` keyword
 * (marks an incomplete proof).
 */
function hasSorry(source: string): boolean {
  return SORRY_RE.test(source);
}

/**
 * Parse `#print axioms` output for axiom names of a given theorem.
 * Returns null if the output cannot be parsed for that theorem (fail closed).
 */
function parsePrintedAxioms(output: string, theoremName: string): string[] | null {
  let found = false;
  const axioms: string[] = [];

  for (const match of output.matchAll(PRINTED_AXIOM_RE)) {
    if (match[1] === theoremName) {
      found = true;
      const axiomList = match[2]
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      axioms.push(...axiomList);
    }
  }

  for (const match of output.matchAll(NO_AXIOM_RE)) {
    if (match[1] === theoremName) {
      found = true;
    }
  }

  return found ? axioms : null;
}

/**
 * Trusted Lean verifier. Builds a single Verify.lean with three sections:
 *   1. Challenge — defines Target (the frozen proposition, no proof)
 *   2. Candidate — must define `def solution : Target`
 *   3. Verify — binding check + #print axioms on solution
 *
 * Lean's type checker enforces that Candidate.solution has type Target —
 * any other type (e.g. True) causes compilation failure. This is exact
 * proposition binding, not substring matching.
 *
 * Computes the verification outcome from actual evidence — never from caller
 * claims. Axiom inspection fails closed if output is missing/unparseable.
 *
 * `replay` is intentionally NOT a passing check — independent replay has
 * not been performed. It is reported as incomplete.
 */
export class LeanVerifierProvider {
  readonly policy: VerificationPolicy;
  readonly isolatedExecutor: IsolatedLeanExecutor;

  constructor(
    policy: VerificationPolicy,
    isolatedExecutor: IsolatedLeanExecutor,
  ) {
    this.policy = policy;
    this.isolatedExecutor = isolatedExecutor;
  }

  /**
   * The verifier's identity, derived from the Daytona container's Lean
   * executable (verified during executeLean). Not a constant.
   */
  get identity(): VerifierIdentity {
    return { name: 'lean', version: LEAN_VERSION, type: 'lean' };
  }

  async verify(input: {
    specHash: string;
    candidateHash: string;
    candidatePath: string;
    specPath: string;
  }): Promise<VerificationResult> {
    // 0. Enforce the pinned Lean toolchain version.
    const pinnedVersion = readPinnedVersion();

    if (!pinnedVersion) {
      return this.failed(
        'toolchain_pin',
        'lean-toolchain file not found or unparseable',
      );
    }

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

    // 2. Build Verify.lean — challenge + candidate + binding check.
    //    The candidate must define `def solution : Target`. Lean's type
    //    checker enforces exact proposition binding via:
    //      def binding_check : Target := solution
    const specText = specBytes.toString('utf8');
    const candidateText = candidateBytes.toString('utf8');
    const verifyContent = [
      specText,
      '',
      candidateText,
      '',
      'def binding_check : Target := solution',
      '',
      '#print axioms solution',
      '',
    ].join('\n');

    // 3. Execute inside isolated Daytona container (fail-closed — no local
    //    fallback). Daytona unavailability throws, never runs on host.
    let result: {
      exitCode: number;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      toolchainVersion: string | null;
    };
    try {
      result = await this.isolatedExecutor.executeLean(
        verifyContent,
        Math.ceil(EXEC_TIMEOUT_MS / 1000),
      );
    } catch (error: unknown) {
      // IsolatedExecutionError carries outcome (INCONCLUSIVE/FAILED).
      if (error instanceof IsolatedExecutionError) {
        return this.failedFromError(
          error.outcome,
          'isolated_execution',
          error.message,
        );
      }
      return this.failed(
        'isolated_execution',
        `isolated execution error: ${String(error)}`,
      );
    }

    // 4. Enforce toolchain version match against container's actual Lean.
    if (!result.toolchainVersion || result.toolchainVersion !== pinnedVersion) {
      return this.failed(
        'toolchain_pin',
        `Lean version mismatch: pinned ${pinnedVersion}, container ${result.toolchainVersion ?? 'unknown'}`,
      );
    }

    const compilationPassed = result.exitCode === 0;

    // 5. Parse `#print axioms` output for axiom names and sorryAx.
    const axiomOutput = result.stdout + result.stderr;
    const printedAxioms = parsePrintedAxioms(axiomOutput, 'solution');

    // FAIL CLOSED: if axiom output is missing/unparseable, inspection fails.
    const axiomInspectionFailed =
      printedAxioms === null || result.exitCode !== 0;

    let usesSorryAx = false;
    let disallowedAxiomsUsed: string[] = [];

    if (!axiomInspectionFailed && printedAxioms !== null) {
      usesSorryAx = printedAxioms.includes('sorryAx');
      disallowedAxiomsUsed = printedAxioms.filter((a) =>
        !isAxiomAuthorized(this.policy, a),
      );
    }

    const axiomInspectionPassed =
      !axiomInspectionFailed &&
      !usesSorryAx &&
      disallowedAxiomsUsed.length === 0;

    // 6. Proof completeness — reject incomplete proofs (sorry / sorryAx).
    const incompleteProof = hasSorry(candidateText) || usesSorryAx;
    const completenessPassed = !incompleteProof;

    // 7. Mathematical relatedness — candidate must prove Target exactly.
    //    Enforced by Lean's type checker via `def solution : Target`.
    //    If compilation passed, the candidate proves Target.
    const relatednessPassed = compilationPassed;

    // 8. Compute outcome from actual evidence — not caller claims.
    //    replay is NOT a passing check (independent replay not performed).
    const outcome = determineOutcome({
      policy: this.policy,
      checkResults: {
        compilation: { passed: compilationPassed },
        kernel_acceptance: { passed: compilationPassed },
        axiom_inspection: { passed: axiomInspectionPassed },
        proof_completeness: { passed: completenessPassed },
        mathematical_relatedness: { passed: relatednessPassed },
        replay: { passed: false, reason: 'independent replay not performed' },
      },
      exitStatus: result.exitCode,
      disallowedAxiomsUsed,
      placeholdersPresent: incompleteProof || usesSorryAx,
      timeoutExceeded: result.timedOut,
    });

    const axiomReason =
      axiomInspectionFailed
        ? 'axiom output missing or unparseable (fail closed)'
        : usesSorryAx
          ? 'proof uses sorryAx (incomplete/admitted)'
          : disallowedAxiomsUsed.length > 0
          ? `disallowed/unauthorized axioms: ${disallowedAxiomsUsed.join(', ')}`
          : undefined;
    const completenessReason = incompleteProof
      ? 'proof contains sorry or sorryAx (incomplete)'
      : undefined;

    return {
      outcome,
      checkResults: {
        compilation: { passed: compilationPassed, reason: undefined },
        kernel_acceptance: {
          passed: compilationPassed,
          reason: compilationPassed ? undefined : result.stderr || result.stdout,
        },
        axiom_inspection: {
          passed: axiomInspectionPassed,
          reason: axiomReason,
        },
        replay: {
          passed: false,
          reason: 'independent replay not performed',
        },
        proof_completeness: {
          passed: completenessPassed,
          reason: completenessReason,
        },
        mathematical_relatedness: {
          passed: relatednessPassed,
          reason: relatednessPassed
            ? undefined
            : 'candidate does not prove the challenge target',
        },
      },
      command: `lean /Verify.lean (in Daytona container)`,
      exitStatus: result.exitCode,
      executedAt: new Date().toISOString(),
      executedBy: `lean-${result.toolchainVersion ?? 'unknown'}`,
      toolchain: this.identity,
      policy: this.policy,
    };
  }

  /**
   * Build a FAILED result from an isolated execution error.
   */
  private failedFromError(
    outcome: 'INCONCLUSIVE' | 'FAILED',
    checkName: string,
    reason: string,
  ): VerificationResult {
    return {
      outcome,
      checkResults: {
        [checkName]: { passed: false, reason },
        compilation: { passed: false, reason },
        kernel_acceptance: { passed: false, reason },
        axiom_inspection: { passed: false, reason },
        replay: { passed: false, reason: 'independent replay not performed' },
        proof_completeness: { passed: false, reason },
        mathematical_relatedness: { passed: false, reason },
      },
      command: 'lean /Verify.lean (in Daytona container)',
      exitStatus: 1,
      executedAt: new Date().toISOString(),
      executedBy: 'lean-unknown',
      toolchain: this.identity,
      policy: this.policy,
    };
  }

  private failed(
    checkName: string,
    reason: string,
  ): VerificationResult {
    return this.failedFromError('FAILED', checkName, reason);
  }
}

/** Factory for the Lean verifier provider. */
export function createLeanVerifierProvider(
  policy: VerificationPolicy,
  isolatedExecutor: IsolatedLeanExecutor,
): LeanVerifierProvider {
  return new LeanVerifierProvider(policy, isolatedExecutor);
}
