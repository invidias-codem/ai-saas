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
 */

import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { getToolRegistry } from './toolRegistry';

const execFile = promisify(_execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

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
  /** Clerk userId for audit logging */
  userId?: string;
  /** Session id for audit logging */
  sessionId?: string;
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
 * Execute a CLI-Anything harness command.
 * Always uses --json output mode. Never throws.
 */
export async function executeTool(cmd: ToolCommand): Promise<ToolResult> {
  const startMs = Date.now();
  const executedAt = new Date().toISOString();
  const commandStr = [cmd.harness, ...cmd.command].join(' ');

  const base: ToolResult = {
    ok: false,
    harness: cmd.harness,
    command: commandStr,
    data: null,
    raw: '',
    durationMs: 0,
    executedAt,
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

    return {
      ok: true,
      harness: cmd.harness,
      command: commandStr,
      data,
      raw,
      durationMs,
      executedAt,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr ?? '';

    console.error(`[ToolExecutor] ✗ ${commandStr} failed in ${durationMs}ms: ${message}`);

    return {
      ...base,
      error: `${message}${stderr ? `\nstderr: ${stderr.substring(0, 500)}` : ''}`,
      durationMs,
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
