import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { IPromotionManager, QuarantineArtifact } from '@/lib/execution/sandboxManager';

const ANSI_RESET = '\u001b[0m';
const ANSI_RED = '\u001b[31m';
const ANSI_GREEN = '\u001b[32m';
const ANSI_YELLOW = '\u001b[33m';
const ANSI_BOLD = '\u001b[1m';
const ANSI_CYAN = '\u001b[36m';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderTable(artifacts: QuarantineArtifact[]): string {
  const maxPathWidth = Math.max(
    artifacts.reduce((max, a) => Math.max(max, a.relativePath.length), 8),
    4,
  );
  const header = `┌─${'─'.repeat(maxPathWidth + 2)}─┬─${'─'.repeat(12)}─┬─${'─'.repeat(64)}─┐`;
  const sep = `├─${'─'.repeat(maxPathWidth + 2)}─┼─${'─'.repeat(12)}─┼─${'─'.repeat(64)}─┤`;
  const footer = `└─${'─'.repeat(maxPathWidth + 2)}─┴─${'─'.repeat(12)}─┴─${'─'.repeat(64)}─┘`;

  const rows = artifacts.map((artifact) => {
    const paddedPath = artifact.relativePath.padEnd(maxPathWidth);
    const size = formatBytes(Buffer.byteLength(artifact.digest, 'utf8'));
    const digest = artifact.digest.length > 62 ? `${artifact.digest.slice(0, 59)}...` : artifact.digest;
    return `│ ${paddedPath} │ ${size.padEnd(12)} │ ${digest.padEnd(64)} │`;
  });

  return [
    `${ANSI_CYAN}${ANSI_BOLD}${header}${ANSI_RESET}`,
    `${ANSI_CYAN}│ ${ANSI_BOLD}${'PATH'.padEnd(maxPathWidth)}${ANSI_RESET}${ANSI_CYAN} │ ${ANSI_BOLD}${'SIZE'.padEnd(12)}${ANSI_RESET}${ANSI_CYAN} │ ${ANSI_BOLD}${'SHA-1 DIGEST'.padEnd(64)}${ANSI_RESET}${ANSI_CYAN} │${ANSI_RESET}`,
    `${ANSI_CYAN}${sep}${ANSI_RESET}`,
    ...rows,
    `${ANSI_CYAN}${footer}${ANSI_RESET}`,
  ].join('\n');
}

export class NeedsApprovalError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly artifacts: QuarantineArtifact[],
    public readonly rejectionCount: number,
    public readonly circuitBreakerTripped: boolean,
  ) {
    super(`NeedsApproval: ${artifacts.length} artifact(s) pending for session ${sessionId}`);
    this.name = 'NeedsApprovalError';
  }
}

export async function promptForPromotion(
  artifacts: QuarantineArtifact[],
  sessionId: string,
  promotionManager: IPromotionManager,
  rejectionCount: number,
  circuitBreakerTripped: boolean,
): Promise<'promote' | 'reject' | 'reset'> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (answer) => {
        resolve(answer.trim().toLowerCase());
      });
    });
  };

  try {
    if (circuitBreakerTripped) {
      console.error([
        `${ANSI_RED}${ANSI_BOLD}⚠ CIRCUIT BREAKER TRIPPED${ANSI_RESET}`,
        `${ANSI_RED}Quarantine directory has been wiped to prevent runaway agent behavior.${ANSI_RESET}`,
        `${ANSI_RED}Rejection count: ${rejectionCount}${ANSI_RESET}`,
        '',
        `${ANSI_YELLOW}Type 'reset' to clear the circuit breaker and allow the agent to proceed.${ANSI_RESET}`,
      ].join('\n'));

      while (true) {
        const answer = await question('> ');
        if (answer === 'reset') {
          return 'reset';
        }
        console.error(`${ANSI_RED}Invalid command. Type 'reset' to continue.${ANSI_RESET}`);
      }
    }

    console.error([
      `${ANSI_YELLOW}${ANSI_BOLD}⏸ Pending artifacts require operator approval${ANSI_RESET}`,
      `Session: ${sessionId}`,
      `Rejection count: ${rejectionCount}/3`,
      '',
      renderTable(artifacts),
      '',
      `${ANSI_BOLD}Options:${ANSI_RESET}`,
      `  ${ANSI_GREEN}y${ANSI_RESET} - Promote all artifacts to live workspace`,
      `  ${ANSI_RED}n${ANSI_RESET} - Reject all artifacts and feed feedback to agent`,
    ].join('\n'));

    while (true) {
      const answer = await question('Approve promotion? (y/n): ');
      if (answer === 'y' || answer === 'yes') {
        return 'promote';
      }
      if (answer === 'n' || answer === 'no') {
        return 'reject';
      }
      console.error(`${ANSI_RED}Please enter 'y' or 'n'.${ANSI_RESET}`);
    }
  } finally {
    rl.close();
  }
}

export async function withPromotionGate<T>(
  sessionId: string,
  promotionManager: IPromotionManager | null,
  artifacts: QuarantineArtifact[],
  rejectionCounter: { count: number; tripped: boolean },
  onDecision: (decision: 'promote' | 'reject' | 'reset', artifacts: QuarantineArtifact[]) => Promise<T>,
  options: { nonInteractive?: boolean } = {},
): Promise<T> {
  if (!promotionManager || artifacts.length === 0) {
    return onDecision('promote', []);
  }

  if (options.nonInteractive) {
    const err = new NeedsApprovalError(sessionId, artifacts, rejectionCounter.count, rejectionCounter.tripped);
    throw err;
  }

  const decision = await promptForPromotion(
    artifacts,
    sessionId,
    promotionManager,
    rejectionCounter.count,
    rejectionCounter.tripped,
  );

  if (decision === 'reset') {
    rejectionCounter.count = 0;
    rejectionCounter.tripped = false;
    await promotionManager.reject(sessionId).catch(() => {});
    return onDecision('reset', []);
  }

  if (decision === 'promote') {
    await promotionManager.promote(sessionId, artifacts.map((a) => a.relativePath));
    return onDecision('promote', artifacts);
  }

  rejectionCounter.count += 1;
  if (rejectionCounter.count >= 3) {
    rejectionCounter.tripped = true;
    await promotionManager.reject(sessionId);
    return withPromotionGate(sessionId, promotionManager, [], rejectionCounter, onDecision, options);
  }

  await promotionManager.reject(sessionId);
  return onDecision('reject', artifacts);
}
