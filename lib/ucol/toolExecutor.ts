/**
 * lib/ucol/toolExecutor.ts
 *
 * UCOL Tool Executor — runs CLI-Anything harness commands and returns
 * structured JSON results for downstream LLM synthesis.
 *
 * Security invariants:
 *   - Uses execFile (never exec or shell:true) — no shell injection possible
 *   - Always appends --json to every command
 *   - Never throws — always returns ToolResult with ok:false on error
 *   - Timeout enforced on every execution (default 30s)
 *
 * Extended with StateDiff (Foundation Agent Phase 1+3):
 *   - Before/after state snapshots for every execution
 *   - Auto-derives human-readable delta list
 *   - Fire-and-forget recordExecution() — never blocks
 */

import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { getToolRegistry } from './toolRegistry';
import { recordExecution } from './proceduralMemory';
import type { ToolStep } from './proceduralMemory';

const execFile = promisify(_execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Before/after state snapshot for a single tool execution.
 * Always present on ToolExecutionResult — uses empty objects when
 * no meaningful state could be captured.
 */
export interface StateDiff {
  before: Record<string, unknown>;
  action: { tool: string; command: string; args: string[] };
  after: Record<string, unknown>;
  /** Human-readable change list, e.g. ["created PR #42", "CI status: pending"] */
  delta: string[];
}

/**
 * Full execution result including state diff.
 * Extends ToolResult with a guaranteed `stateDiff` field.
 */
export interface ToolExecutionResult extends ToolResult {
  stateDiff: StateDiff;
}

export interface ToolCommand {
  /** Harness name: "supabase" | "gh" | "firebase" */
  harness: string;
  /** Command path, e.g. ["migration", "list"] or ["pr", "view", "72"] */
  command: string[];
  /** Additional flags/args (do NOT include --json — it's auto-appended) */
  args?: string[];
  /** Working directory for the command (defaults to process.cwd()) */
  workDir?: string;
  /** Timeout in ms — defaults to 30000 */
  timeoutMs?: number;
  /** Clerk userId for audit logging and procedural memory */
  userId?: string;
  /** Session id for audit logging */
  sessionId?: string;
  /** Task type hint for procedural memory recording */
  taskType?: string;
  /** Human-readable task description for procedural memory embedding */
  taskDescription?: string;
}

export interface ToolResult {
  ok: boolean;
  harness: string;
  command: string;
  /** Parsed JSON data from the harness response */
  data: unknown;
  /** Raw stdout (useful if JSON parse fails) */
  raw: string;
  /** stderr content if the command failed */
  error?: string;
  durationMs: number;
  executedAt: string;
}

// ─── Core Executor ────────────────────────────────────────────────────────────

/**
 * Capture a lightweight pre/post-execution state snapshot.
 * Intentionally non-blocking — only uses data already available.
 */
function captureStateSnapshot(
  harness: string,
  command: string[],
  output?: unknown
): Record<string, unknown> {
  const base: Record<string, unknown> = { capturedAt: new Date().toISOString() };

  if (output !== undefined) {
    // post-execution snapshot: include output summary
    base.outputType = typeof output;
    if (Array.isArray(output)) {
      base.outputLength = output.length;
    } else if (output !== null && typeof output === 'object') {
      base.outputKeys = Object.keys(output as Record<string, unknown>).slice(0, 10);
    } else if (typeof output === 'string') {
      base.outputPreview = (output as string).substring(0, 120);
    }
  }

  // Tool-specific lightweight context
  switch (harness) {
    case 'gh':
      base.tool = 'github';
      base.subcommand = command[0] ?? '';
      break;
    case 'supabase':
      base.tool = 'supabase';
      base.subcommand = command[0] ?? '';
      break;
    case 'firebase':
      base.tool = 'firebase';
      base.subcommand = command[0] ?? '';
      break;
    default:
      base.tool = harness;
  }

  return base;
}

/**
 * Derive a human-readable delta list from before/after snapshots.
 * Compares shared keys and flags new/removed/changed values.
 */
function deriveDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  harness: string,
  commandStr: string,
  success: boolean
): string[] {
  const delta: string[] = [];

  // Always record the action outcome
  delta.push(`${success ? '✓' : '✗'} ${harness} ${commandStr}`);

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of Array.from(allKeys)) {
    // Skip bookkeeping fields
    if (key === 'capturedAt' || key === 'tool' || key === 'subcommand') continue;

    const hadKey = key in before;
    const hasKey = key in after;

    if (!hadKey && hasKey) {
      delta.push(`added: ${key}=${JSON.stringify(after[key]).substring(0, 80)}`);
    } else if (hadKey && !hasKey) {
      delta.push(`removed: ${key}`);
    } else if (hadKey && hasKey) {
      const bv = JSON.stringify(before[key]);
      const av = JSON.stringify(after[key]);
      if (bv !== av) {
        delta.push(`changed: ${key} ${bv.substring(0, 40)} → ${av.substring(0, 40)}`);
      }
    }
  }

  return delta;
}

/**
 * Execute a CLI-Anything harness command.
 * Always uses --json output mode. Never throws.
 * Returns ToolExecutionResult with always-populated stateDiff.
 */
export async function executeTool(cmd: ToolCommand): Promise<ToolExecutionResult> {
  const startMs = Date.now();
  const executedAt = new Date().toISOString();
  const commandStr = [cmd.harness, ...cmd.command].join(' ');

  // ── Capture pre-execution state snapshot ──────────────────────────────
  const stateBefore = captureStateSnapshot(cmd.harness, cmd.command);

  const emptyStateDiff: StateDiff = {
    before: stateBefore,
    action: { tool: cmd.harness, command: commandStr, args: cmd.args ?? [] },
    after: {},
    delta: [],
  };

  const base: ToolExecutionResult = {
    ok: false,
    harness: cmd.harness,
    command: commandStr,
    data: null,
    raw: '',
    durationMs: 0,
    executedAt,
    stateDiff: emptyStateDiff,
  };

  try {
    // ── Resolve binary via registry ──────────────────────────────────────
    const registry = await getToolRegistry();
    const tool = registry.get(cmd.harness);

    if (!tool) {
      return {
        ...base,
        error: `Tool harness "${cmd.harness}" is not installed or not registered. Run tool-registry-sync to refresh.`,
        durationMs: Date.now() - startMs,
      };
    }

    if (!registry.isInstalled(cmd.harness)) {
      return {
        ...base,
        error: `Binary "${tool.binary}" not found in PATH.`,
        durationMs: Date.now() - startMs,
      };
    }

    // ── Build arg array — NO shell:true, NO string interpolation ────────
    const fullArgs = [
      '--json',           // always first so harnesses honour it globally
      ...cmd.command,
      ...(cmd.args ?? []),
    ];

    console.log(`[ToolExecutor] ${tool.binary} ${fullArgs.join(' ')}`);

    // ── Execute with timeout ─────────────────────────────────────────────
    const { stdout, stderr } = await execFile(tool.binary, fullArgs, {
      cwd: cmd.workDir ?? process.cwd(),
      timeout: cmd.timeoutMs ?? 30_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: process.env,
    });

    const raw = stdout.trim();
    const durationMs = Date.now() - startMs;

    // ── Parse JSON response ──────────────────────────────────────────────
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Harness didn't return valid JSON — keep raw string as data
      console.warn(`[ToolExecutor] ${commandStr} returned non-JSON output`);
    }

    if (stderr) {
      console.warn(`[ToolExecutor] stderr from ${commandStr}: ${stderr.substring(0, 200)}`);
    }

    console.log(`[ToolExecutor] ✓ ${commandStr} completed in ${durationMs}ms`);

    // ── Build state diff ─────────────────────────────────────────────────
    const stateAfter = captureStateSnapshot(cmd.harness, cmd.command, data);
    const delta = deriveDelta(stateBefore, stateAfter, cmd.harness, commandStr, true);

    const stateDiff: StateDiff = {
      before: stateBefore,
      action: { tool: cmd.harness, command: commandStr, args: cmd.args ?? [] },
      after: stateAfter,
      delta,
    };

    // ── Fire-and-forget procedural memory recording ──────────────────────
    if (cmd.userId && cmd.taskDescription) {
      const step: ToolStep = {
        tool: cmd.harness,
        command: cmd.command.join(' '),
        args: cmd.args ?? [],
      };
      recordExecution(
        cmd.userId,
        cmd.taskType ?? cmd.harness,
        cmd.taskDescription,
        [step],
        true,
        durationMs
      );
    }

    return {
      ok: true,
      harness: cmd.harness,
      command: commandStr,
      data,
      raw,
      durationMs,
      executedAt,
      stateDiff,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr ?? '';

    console.error(`[ToolExecutor] ✗ ${commandStr} failed in ${durationMs}ms: ${message}`);

    // ── Capture failure state diff ───────────────────────────────────────
    const stateAfterFailure = captureStateSnapshot(cmd.harness, cmd.command, { error: message });
    const failureDelta = deriveDelta(
      stateBefore,
      stateAfterFailure,
      cmd.harness,
      commandStr,
      false
    );

    // ── Fire-and-forget failure recording ────────────────────────────────
    if (cmd.userId && cmd.taskDescription) {
      const step: ToolStep = {
        tool: cmd.harness,
        command: cmd.command.join(' '),
        args: cmd.args ?? [],
      };
      recordExecution(
        cmd.userId,
        cmd.taskType ?? cmd.harness,
        cmd.taskDescription,
        [step],
        false,
        durationMs
      );
    }

    return {
      ...base,
      error: `${message}${stderr ? `\nstderr: ${stderr.substring(0, 500)}` : ''}`,
      durationMs,
      stateDiff: {
        before: stateBefore,
        action: { tool: cmd.harness, command: commandStr, args: cmd.args ?? [] },
        after: stateAfterFailure,
        delta: failureDelta,
      },
    };
  }
}

// ─── Convenience Wrappers ─────────────────────────────────────────────────────

/** Run a Supabase harness command */
export const supabaseTool = (command: string[], args?: string[], opts?: Partial<ToolCommand>) =>
  executeTool({ harness: 'supabase', command, args, ...opts });

/** Run a GitHub harness command */
export const ghTool = (command: string[], args?: string[], opts?: Partial<ToolCommand>) =>
  executeTool({ harness: 'gh', command, args, ...opts });

/** Run a Firebase harness command */
export const firebaseTool = (command: string[], args?: string[], opts?: Partial<ToolCommand>) =>
  executeTool({ harness: 'firebase', command, args, ...opts });
