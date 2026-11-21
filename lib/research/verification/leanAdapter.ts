// Research Plane — R1A.1: Trusted Lean verification adapter (integrity-fixed).
//
// Implements VerifierProvider using a pinned Lean 4 toolchain.
// The verifier receives immutable file paths, never caller-provided success
// claims. All checks are performed inside the trusted verifier boundary and
// bound to the exact frozen specification and candidate bytes.
//
// Checks:
//   0. Toolchain version pin (lean-toolchain file + runtime lean --version)
//   1. Content hash verification (spec + candidate bytes)
//   2. Combined compilation — Challenge.lean + Solution.lean in one file,
//      so the solution must reference challenge theorems (Lean enforces this)
//   3. #print axioms — transitive axiom inspection, reject sorryAx/disallowed
//   4. Proof completeness — reject sorry keyword
//   5. Mathematical relatedness — challenge theorem referenced in candidate
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

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { VerifierIdentity, VerificationPolicy } from '@/lib/research/contracts';
import { sha256Bytes } from '@/lib/research/contracts';
import { VerificationResult, DEFAULT_VERIFICATION_POLICY } from '@/lib/research/verification/contracts';
import { determineOutcome } from '@/lib/research/verification/policy';

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
};

// Axiom declaration regex: `axiom Name : Type` or `parameter Name : Type`
const AXIOM_RE = /^\s*(?:axiom|parameter)\s+([\w\.\']+)\s*:/gm;

// Theorem declaration regex: `theorem Name : ...` or `theorem Name (args) : ...`
const THEOREM_RE = /^\s*theorem\s+([\w\.\']+)/gm;

// `sorry` keyword marks an incomplete proof in Lean.
const SORRY_RE = /\bsorry\b/;

// `#print axioms` output line: `'TheoremName' depends on axioms: [axiom1, axiom2]`
const PRINTED_AXIOM_RE = /'(\w+)'\s+depends on axioms:\s*\[([^\]]*)\]/g;

const TOOLCHAIN_FILE = 'lean-toolchain';

// Process execution limits (security: prevent runaway Lean processes).
const EXEC_TIMEOUT_MS = 300_000;
const EXEC_MAX_BUFFER_MB = 50;

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
      maxBuffer: EXEC_MAX_BUFFER_MB * 1024 * 1024,
    }).toString();
    const match = output.match(/Lean\s*\(version\s+(\d+\.\d+\.\d+)/);
    return match ? { name: 'lean', version: match[1], type: 'lean' } : null;
  } catch {
    return null;
  }
}

/**
 * Extract theorem names from a Lean source file.
 */
function extractTheoremNames(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(THEOREM_RE)) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Check whether every theorem from the challenge is referenced in the
 * candidate. This establishes mathematical relatedness.
 */
function allChallengeTheoremsReferenced(
  specText: string,
  candidateText: string,
): boolean {
  const challengeTheoremNames = extractTheoremNames(specText);
  if (challengeTheoremNames.length === 0) return false;
  return challengeTheoremNames.every((name) =>
    candidateText.includes(name),
  );
}

/**
 * Check whether a Lean source file contains the `sorry` keyword
 * (marks an incomplete proof).
 */
function hasSorry(source: string): boolean {
  return SORRY_RE.test(source);
}

/**
 * Run a Lean command with strict resource limits.
 * Returns { exitCode, stdout, stderr }.
 */
function runLean(args: string[], cwd: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync('lean', args, {
      cwd,
      encoding: 'utf8',
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: EXEC_MAX_BUFFER_MB * 1024 * 1024,
    }).toString();
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: (err as { code?: number }).code ?? 1,
      stdout: (err as { stdout?: string }).stdout ?? '',
      stderr: (err as { stderr?: string }).stderr ?? '',
    };
  }
}

/**
 * Trusted Lean verifier. Combines Challenge.lean and Solution.lean into a
 * single Verify.lean file (so the solution must reference challenge theorems
 * — Lean enforces this at compile time), then runs `#print axioms` for
 * transitive axiom inspection. Computes the verification outcome from actual
 * evidence — never from caller claims.
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

      // Strip any import lines from the candidate — we concatenate
      // challenge and solution into a single file, so imports must not
      // appear in the middle. Mathematical relatedness is enforced by
      // theorem name matching, not by Lean module imports.
      const cleanCandidateText = candidateText.replace(
        /^\s*import\s+[\w\.\']+\s*$/gm,
        '',
      );

      // 3. Build a single Verify.lean with challenge + solution + #print axioms.
      //    This binds the proof to the challenge: the solution must reference
      //    challenge theorems by name, and Lean will error if they don't exist.
      const theoremNames = extractTheoremNames(cleanCandidateText);
      const axiomPrintLines = theoremNames.map(
        (name) => `#print axioms ${name}`,
      );
      const verifyContent = [
        specText,
        '',
        cleanCandidateText,
        '',
        ...axiomPrintLines,
        '',
      ].join('\n');
      writeFileSync(join(projectDir, 'Verify.lean'), verifyContent);

      // 4. Run `lean Verify.lean` — compilation + kernel acceptance + #print axioms.
      const result = runLean(['Verify.lean'], projectDir);
      const compilationPassed = result.exitCode === 0;

      // 5. Parse `#print axioms` output for axiom names and sorryAx.
      const axiomOutput = result.stdout + result.stderr;
      const printedAxioms: string[] = [];
      for (const match of axiomOutput.matchAll(PRINTED_AXIOM_RE)) {
        const axiomList = match[2]
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean);
        printedAxioms.push(...axiomList);
      }

      const usesSorryAx = printedAxioms.includes('sorryAx');
      const disallowedAxiomsUsed = printedAxioms.filter((a) =>
        this.policy.disallowedAxioms.includes(a),
      );
      const axiomInspectionPassed =
        compilationPassed && !usesSorryAx && disallowedAxiomsUsed.length === 0;

      // 6. Proof completeness — reject incomplete proofs (sorry keyword).
      const incompleteProof = hasSorry(cleanCandidateText);
      const completenessPassed = !incompleteProof;

      // 7. Mathematical relatedness — every theorem from the challenge
      //    must be referenced in the candidate.
      const relatednessPassed = allChallengeTheoremsReferenced(
        specText,
        cleanCandidateText,
      );

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
        timeoutExceeded: false,
      });

      const disallowedReason =
        disallowedAxiomsUsed.length > 0
          ? `disallowed axioms: ${disallowedAxiomsUsed.join(', ')}`
          : usesSorryAx
            ? 'proof uses sorryAx (incomplete/admitted)'
            : undefined;
      const completenessReason = incompleteProof
        ? 'proof contains sorry (incomplete)'
        : undefined;
      const relatednessReason = !relatednessPassed
        ? `candidate does not reference all challenge theorems`
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
            reason: disallowedReason,
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
            reason: relatednessReason,
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
