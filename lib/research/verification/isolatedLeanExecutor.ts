// lib/research/verification/isolatedLeanExecutor.ts
// Research Plane — R1B.1.1 secure Lean execution boundary.
// Fail-closed: requires DAYTONA_API_KEY. Uses Daytona sandbox for isolated
// Lean execution with network blocking and resource limits.

import { env } from '@/lib/env';

export class IsolatedExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsolatedExecutionError';
  }
}

export interface DaytonaLeanExecutorResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  toolchainVersion: string;
}

export interface DaytonaLeanExecutor {
  executeLean(content: string, timeoutSec: number): Promise<DaytonaLeanExecutorResult>;
}

const PINNED_LEAN_VERSION = '4.36.0';
const LEAN_IMAGE = `leanprover/lean4:v${PINNED_LEAN_VERSION}`;

export function createDaytonaLeanExecutor(): DaytonaLeanExecutor {
  if (!env.DAYTONA_API_KEY) {
    throw new Error('DAYTONA_API_KEY not configured');
  }

  return {
    async executeLean(content: string, timeoutSec: number): Promise<DaytonaLeanExecutorResult> {
      const { Daytona } = await import('@daytona/sdk');
      const daytona = new Daytona({
        apiKey: env.DAYTONA_API_KEY,
        apiUrl: env.DAYTONA_API_URL,
        target: env.DAYTONA_TARGET,
      });

      let sandbox: any;
      try {
        sandbox = await daytona.create({
          image: LEAN_IMAGE,
          networkBlockAll: true,
          ephemeral: true,
          resources: { cpu: 2, memory: 4, disk: 20 },
          labels: { 'lattice-purpose': 'lean-verification' },
        });

        // Upload Verify.lean into the container
        await sandbox.fs.uploadFile(content, '/Verify.lean');

        // Toolchain check — Daytona executeCommand signature:
        // (command, env?, metadata?, timeoutSec?)
        const versionResult = await sandbox.process.executeCommand(
          'lean --version',
          undefined,
          undefined,
          timeoutSec,
        );
        const versionMatch = versionResult.result.match(/Lean \(version ([\d.]+)\)/);
        if (!versionMatch || versionMatch[1] !== PINNED_LEAN_VERSION) {
          throw new Error(`Lean version mismatch in container: expected ${PINNED_LEAN_VERSION}`);
        }

        // Execute Lean verification
        let execResult: any;
        try {
          execResult = await sandbox.process.executeCommand(
            'lean /Verify.lean',
            undefined,
            undefined,
            timeoutSec,
          );
        } catch (err: any) {
          // SDK-level timeout or execution error
          if (err.message?.includes('timed out')) {
            throw new IsolatedExecutionError(err.message);
          }
          throw err;
        }

        return {
          exitCode: execResult.exitCode ?? -1,
          stdout: execResult.result ?? '',
          stderr: execResult.stderr ?? execResult.result ?? '',
          timedOut: execResult.timedOut ?? false,
          toolchainVersion: PINNED_LEAN_VERSION,
        };
      } finally {
        if (sandbox) {
          try {
            await sandbox.delete();
          } catch {
            // best-effort teardown
          }
        }
      }
    },
  };
}
