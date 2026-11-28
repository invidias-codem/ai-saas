import { ExecuteCommandSchema, buildCommandSandbox, type ExecuteCommandInput } from "@/lib/harness/commandShell";
import { Tool } from "../core/types";

export const executeCommandTool: Tool<ExecuteCommandInput, any> = {
    name: "execute_command",
    description: "Execute an approved command locally in the workspace. Select cmd, powershell, or pwsh explicitly for Windows shell scripts; direct execution is the default. CRITICAL: Do not run long-lived servers (like `npm start`). Only run terminating commands (like `npm install`, `go test`, `python script.py`, or `ls`). Long-running commands will be aggressively killed.",
    schema: ExecuteCommandSchema,
    risk: "mutative",
    requiresApproval: true,
    requiresSandbox: true,
    sandbox: {
      language: 'sh',
      buildCommand: buildCommandSandbox,
    },
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        if (!context.workspaceId || !context.userId) {
            return { success: false, error: "Workspace context is missing." };
        }
        
        const args = [input.command, input.timeoutSeconds, context.workspaceId, context.userId] as const;
        const res = input.shell === undefined
          ? await context.ioHarness.executeCommandSecure(...args)
          : await context.ioHarness.executeCommandSecure(...args, input.shell);

        
        return { success: res.ok, data: res, error: res.ok ? undefined : res.error };
    }
};
