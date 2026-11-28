import { task } from "@trigger.dev/sdk";
import { z } from "zod";

/**
 * Durable sandboxed code-execution task.
 *
 * Wraps the existing SandboxManager (lib/execution/sandboxManager.ts) so
 * untrusted/agent-generated code runs OUTSIDE the Next.js serverless timeout.
 * Sandbox execution can easily exceed 60s; here it has the full task budget
 * with the quarantine-promotion gate intact.
 */
export const sandboxExecPayloadSchema = z.object({
  userId: z.string(),
  workspaceId: z.string(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  language: z.enum(["sh", "python", "node"]).default("sh"),
  timeoutMs: z.number().int().positive().optional(),
  allowedEnv: z.array(z.string()).optional(),
});

export const sandboxExecTask = task({
  id: "sandbox-exec",
  maxDuration: 600,
  run: async (payload: z.infer<typeof sandboxExecPayloadSchema>) => {
    const { sandboxManager } = await import("@/lib/execution/sandboxManager");

    // Re-enter the existing sandbox/quarantine path — SandboxManager owns the
    // isolation/security boundary, never re-implement it here.
    const result = await sandboxManager.execute({
      command: payload.command,
      args: payload.args,
      language: payload.language,
      timeoutMs: payload.timeoutMs,
      allowedEnv: payload.allowedEnv,
    });

    return {
      executionId: result.executionId,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      truncated: result.truncated ?? false,
    };
  },
});