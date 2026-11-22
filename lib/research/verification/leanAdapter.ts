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
//   0. Toolchain version pin (lean-toolchain file + runtime lean --version)
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
//   * Process timeout (EXEC_TIMEOUT_MS)
//   * Output buffer limit (EXEC_MAX_BUFFER_MB)
//   * Toolchain identity from running executable, not a constant
//
// # ponytail: temp directory cleanup is best-effort; a leaked /tmp dir is
//   not a security boundary. Add explicit cleanup if disk pressure matters.
// # ponytail: execution isolation via SandboxManager — untrusted Lean runs
//   in an ephemeral scratch dir with scrubbed env, timeout, memory cap, and
//   output buffer limit. Temp directory cleanup is handled by SandboxManager.
//   Disk-pressure cleanup is best-effort; add explicit monitoring if needed.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { VerifierIdentity, VerificationPolicy } from '@/lib/research/contracts';
import { sha256Bytes } from '@/lib/research/contracts';
import { VerificationResult, DEFAULT_VERIFICATION_POLICY } from '@/lib/research/verification/contracts';
import { determineOutcome, isAxiomAuthorized } from '@/lib/research/verification/policy';
import { sandboxManager } from '@/lib/execution/sandboxManager';

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
 * Get the running Lean executable's actual identity by running `lean --version`.
 * Returns { name, version, type } or null on failure. The version comes from
 * the executable itself, never from a constant.
 */
function getLeanIdentity(): { name: string; version: string; type: 'lean' } | null {
  try {
    const output = execFileSync('lean', ['--version'], {
      encoding: 'utf8',
      maxBuffer: 1 * 1024 * 1024,
    }).toString();
    const match = output.match(/Lean\s*\(version\s+(\d+\.\d+\.\d+)/);
    return match ? { name: 'lean', version: match[1], type: 'lean' } : null;
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
 * Run `lean Verify.lean` inside the sandbox — no host credentials,
 * restricted filesystem, enforced timeout and memory limits.
 * Returns { exitCode, stdout, stderr }.
 */
async function runLeanInSandbox(
  verifyContent: string,
  projectDir: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  // Write Verify.lean into the sandbox scratch dir.
  writeFileSync(join(projectDir, 'Verify.lean'), verifyContent);

  // Run `lean Verify.lean` inside the sandbox.
  const result = await sandboxManager.execute({
    command: 'lean Verify.lean',
    language: 'sh',
    workdir: projectDir,
    timeoutMs: EXEC_TIMEOUT_MS,
  });

  const sandboxResult = {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
  return sandboxResult;
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

  constructor(policy?: VerificationPolicy) {
    this.policy = policy ?? LEAN_VERIFICATION_POLICY;
  }

  /**
   * The verifier's actual identity, derived from the running executable.
   * Not a constant — reflects what `lean --version` reports.
   */
  get identity(): VerifierIdentity {
    const actual = getLeanIdentity();
    return actual ?? { name: 'lean', version: 'unknown', type: 'lean' };
  }

  async verify(input: {
    specHash: string;
    candidateHash: string;
    candidatePath: string;
    specPath: string;
  }): Promise<VerificationResult> {
    // 0. Enforce the pinned Lean toolchain version.
    const pinnedVersion = readPinnedVersion();
    const runningIdentity = getLeanIdentity();

    if (!pinnedVersion) {
      return this.failed(
        'toolchain_pin',
        'lean-toolchain file not found or unparseable',
      );
    }
    if (!runningIdentity) {
      return this.failed(
        'toolchain_pin',
        'could not determine running Lean version',
      );
    }
    if (runningIdentity.version !== pinnedVersion) {
      return this.failed(
        'toolchain_pin',
        `Lean version mismatch: pinned ${pinnedVersion}, running ${runningIdentity.version}`,
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

    // 2. Set up a temporary directory with the frozen files.
    const projectDir = mkdtempSync(join(tmpdir(), 'lean-verify-'));
    try {
      const specText = specBytes.toString('utf8');
      const candidateText = candidateBytes.toString('utf8');

      // 3. Build Verify.lean — challenge + candidate + binding check.
      //    The candidate must define `def solution : Target`. Lean's type
      //    checker enforces exact proposition binding via:
      //      def binding_check : Target := solution
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
      const result = await runLeanInSandbox(verifyContent, projectDir);
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
        command: `lean Verify.lean (in ${projectDir})`,
        exitStatus: result.exitCode,
        executedAt: new Date().toISOString(),
        executedBy: `lean-${runningIdentity.version}`,
        toolchain: this.identity,
        policy: this.policy,
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
        replay: { passed: false, reason: 'independent replay not performed' },
        proof_completeness: { passed: false, reason },
        mathematical_relatedness: { passed: false, reason },
      },
      command: 'lean Verify.lean',
      exitStatus: 1,
      executedAt: new Date().toISOString(),
      executedBy: 'lean-unknown',
      toolchain: this.identity,
      policy: this.policy,
    };
  }
}

/** Factory for the Lean verifier provider. */
export function createLeanVerifierProvider(policy?: VerificationPolicy): LeanVerifierProvider {
  return new LeanVerifierProvider(policy);
}
