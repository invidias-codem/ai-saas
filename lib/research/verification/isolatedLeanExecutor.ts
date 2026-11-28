// Research Plane — R1B.1.1: Secure Execution Boundary
//
// Executes `lean Verify.lean` inside a Daytona container, providing a
// verified container boundary between untrusted Lean code and the
// application host. Fails closed if Daytona is not configured — never
// falls back to host process execution.
//
// Security invariants:
//   - Container created with networkBlockAll: true (no outbound network)
//   - Container is ephemeral (auto-deleted on completion)
//   - No host filesystem access — Verify.lean uploaded into container only
//   - CPU/memory limits via Daytona resources
//   - Timeout enforced at SDK level (executeCommand timeoutSec)
//   - Container destroyed in finally block (teardown guaranteed)
//   - Fail closed: no Daytona API key → throw, never run locally

import { Daytona } from '@daytona/sdk';
import { env } from '@/lib/env';

export interface IsolatedLeanExecutor {
  executeLean(
    verifyContent: string,
    timeoutSec: number,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    toolchainVersion: string | null;
  }>;
}

/** Error thrown when isolated execution cannot produce a conclusive result. */
export class IsolatedExecutionError extends Error {
  readonly outcome: 'INCONCLUSIVE' | 'FAILED';

  constructor(message: string, outcome: 'INCONCLUSIVE' | 'FAILED') {
    super(message);
    this.outcome = outcome;
    this.name = 'IsolatedExecutionError';
  }
}

// Container resource ceiling for Lean verification.
// 2 CPU / 4 GiB / 20 GiB disk is sufficient for Lean 4 type-checking
// single files while bounding blast radius of malicious input.
const ISOLATED_CONTAINER_RESOURCES = {
  cpu: 2,
  memory: 4, // GiB
  disk: 20, // GiB
};

// Pinned Lean image — Lean 4.36.0 pre-installed, matching lean-toolchain.
const ISOLATED_IMAGE = 'leanprover/lean4:v4.36.0';
const ISOLATED_LABELS = {
  'lattice-purpose': 'lean-verification',
  'lattice-isolation': 'container',
};

/**
 * Daytona-backed isolated Lean executor.
 *
 * Requires DAYTONA_API_KEY to be configured. Throws if not — callers must
 * not fall back to local execution when isolation is required.
 */
export class DaytonaLeanExecutor implements IsolatedLeanExecutor {
  private readonly client: Daytona;

  constructor() {
    if (!env.DAYTONA_API_KEY) {
      throw new Error(
        'DAYTONA_API_KEY not configured — isolated Lean execution requires a Daytona container boundary',
      );
    }

    this.client = new Daytona({
      apiKey: env.DAYTONA_API_KEY,
      apiUrl: env.DAYTONA_API_URL ?? 'https://app.daytona.io/api',
      target: env.DAYTONA_TARGET ?? 'us',
    });
  }

  async executeLean(
    verifyContent: string,
    timeoutSec: number,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    toolchainVersion: string | null;
  }> {
    let sandbox: Awaited<ReturnType<Daytona['create']>> | null = null;

    try {
      // 1. Provision isolated container with strict boundaries.
      // ephemeral: true means Daytona deletes the sandbox on stop — do NOT
      // combine with autoPauseInterval (unsupported for ephemeral sandboxes)
      // or autoDeleteInterval (conflicting lifecycle semantics).
      sandbox = await this.client.create({
        image: ISOLATED_IMAGE,
        resources: ISOLATED_CONTAINER_RESOURCES,
        labels: ISOLATED_LABELS,
        autoStopInterval: 0,
        autoArchiveInterval: 0,
        networkBlockAll: true, // no outbound network from container
        ephemeral: true, // destroyed on completion
      });

      // 2. Verify toolchain identity inside the container.
      // Bind verification receipt to the executable actually used in Daytona,
      // not the host's Lean version.
      const versionResult = await sandbox.process.executeCommand(
        'lean --version',
        undefined,
        undefined,
        30,
      );
      const versionOutput = versionResult.result ?? '';
      const versionMatch = versionOutput.match(
        /Lean\s*\(version\s+(\d+\.\d+\.\d+)/,
      );
      const toolchainVersion = versionMatch ? versionMatch[1] : null;
      if (!toolchainVersion || toolchainVersion !== '4.36.0') {
        throw new IsolatedExecutionError(
          `Lean version mismatch in container: expected 4.36.0, got ${
            toolchainVersion ?? 'unknown'
          }`,
          'FAILED',
        );
      }

      // 3. Upload Verify.lean into container (no host filesystem access).
      await sandbox.fs.uploadFile(Buffer.from(verifyContent, 'utf8'), '/Verify.lean');

      // 4. Execute `lean Verify.lean` inside container with SDK timeout.
      const execResult = await sandbox.process.executeCommand(
        'lean /Verify.lean',
        undefined,
        undefined,
        timeoutSec,
      );

      const exitCode = execResult.exitCode ?? 1;
      const stdout = execResult.result ?? '';

      return {
        exitCode,
        stdout,
        stderr: exitCode === 0 ? '' : stdout,
        timedOut: exitCode === 124 || exitCode === -1,
        toolchainVersion,
      };
    } catch (error: unknown) {
      // SDK timeout / infrastructure errors → INCONCLUSIVE, never VERIFIED.
      if (error instanceof IsolatedExecutionError) throw error;
      const err = error as { name?: string; message?: string };
      if (
        err.name === 'DaytonaProcessExecutionTimeoutError' ||
        (typeof err.message === 'string' &&
          (err.message.includes('timeout') ||
            err.message.includes('timed out')))
      ) {
        throw new IsolatedExecutionError(
          `Lean execution timed out after ${timeoutSec}s`,
          'INCONCLUSIVE',
        );
      }
      throw error;
    } finally {
      // 5. Teardown guaranteed — destroy container even on failure.
      // Teardown failures are recorded, not silently ignored.
      if (sandbox) {
        try {
          await sandbox.delete(60, true);
        } catch (err) {
          console.error(
            '[R1B.1.1] Daytona container teardown failed',
            JSON.stringify({
              sandboxId: sandbox.id,
              error: String(err),
            }),
          );
          throw new Error(`Container teardown failed: ${String(err)}`);
        }
      }
    }
  }
}

/**
 * Factory that throws if Daytona is not configured.
 * Callers must handle the absence of DAYTONA_API_KEY explicitly.
 */
export function createDaytonaLeanExecutor(): DaytonaLeanExecutor {
  return new DaytonaLeanExecutor();
}
