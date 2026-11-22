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
  ): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
}

// Container resource ceiling for Lean verification.
// 2 CPU / 4 GiB / 20 GiB disk is sufficient for Lean 4 type-checking
// single files while bounding blast radius of malicious input.
const ISOLATED_CONTAINER_RESOURCES = {
  cpu: 2,
  memory: 4, // GiB
  disk: 20, // GiB
};

const ISOLATED_IMAGE = 'ubuntu:22.04';
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
  ): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
    let sandbox: Awaited<ReturnType<Daytona['create']>> | null = null;

    try {
      // 1. Provision isolated container with strict boundaries
      sandbox = await this.client.create({
        image: ISOLATED_IMAGE,
        resources: ISOLATED_CONTAINER_RESOURCES,
        labels: ISOLATED_LABELS,
        autoPauseInterval: 60,
        autoStopInterval: 0,
        autoDeleteInterval: -1,
        autoArchiveInterval: 0,
        networkBlockAll: true, // no outbound network from container
        ephemeral: true, // destroyed on completion
      });

      // 2. Upload Verify.lean into container (no host filesystem access)
      await sandbox.fs.uploadFile(Buffer.from(verifyContent, 'utf8'), '/Verify.lean');

      // 3. Execute `lean Verify.lean` inside container with SDK timeout
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
      };
    } finally {
      // 4. Teardown guaranteed — destroy container even on failure
      if (sandbox) {
        try {
          await sandbox.delete(60, true);
        } catch {
          // Best-effort teardown; container is ephemeral anyway
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
