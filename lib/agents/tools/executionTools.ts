import { z } from "zod";
import { Tool } from "../core/types";

export const executeCommandTool: Tool<{ command: string; timeoutSeconds: number }, any> = {
    name: "execute_command",
    description: "Execute a shell command locally in the workspace. CRITICAL: Do not run long-lived servers (like `npm start`). Only run terminating commands (like `npm install`, `go test`, `python script.py`, or `ls`). Long-running commands will be aggressively killed.",
    schema: z.object({
        command: z.string().describe("The shell command to execute. Do not use shell operators like && or ||. If you need to run multiple commands, invoke this tool multiple times."),
        timeoutSeconds: z.number().describe("The expected maximum duration for this command in seconds. The local daemon will cap this to a maximum of 120 seconds. If the command exceeds this, it will be forcefully terminated.")
    }),
    risk: "mutative",
    requiresApproval: true,
    requiresSandbox: true,
    sandbox: {
      language: 'sh',
      buildCommand: (input) => `set -e\n${input.command}`,
    },
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        if (!context.workspaceId || !context.userId) {
            return { success: false, error: "Workspace context is missing." };
        }
        
        const res = await context.ioHarness.executeCommandSecure(
            input.command, 
            input.timeoutSeconds, 
            context.workspaceId, 
            context.userId
        );
        
        return { success: res.ok, data: res.ok ? res : undefined, error: res.ok ? undefined : res.error };
    }
};
