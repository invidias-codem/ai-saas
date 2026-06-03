import { z } from "zod";
import { Tool } from "../core/types";

export const readFileTool: Tool<{ filePath: string }, any> = {
    name: "read_file",
    description: "Read the contents of a file in the workspace.",
    schema: z.object({
        filePath: z.string().describe("Path to the file relative to the workspace root, or absolute path.")
    }),
    risk: "read-only",
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        const res = await context.ioHarness.readFile(input.filePath);
        return { success: res.ok, data: res.ok ? res : undefined, error: res.ok ? undefined : res.error };
    }
};

export const writeFileTool: Tool<{ filePath: string; content: string }, any> = {
    name: "write_file",
    description: "Write content to a file in the workspace.",
    schema: z.object({
        filePath: z.string(),
        content: z.string()
    }),
    risk: "mutative",
    requiresApproval: true,
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        const res = await context.ioHarness.writeFile(input.filePath, input.content);
        return { success: res.ok, data: res.ok ? res : undefined, error: res.ok ? undefined : res.error };
    }
};

export const patchFileTool: Tool<{ filePath: string; searchBlock: string; replaceBlock: string }, any> = {
    name: "patch_file",
    description: "Patch a file by replacing a search block with a replace block.",
    schema: z.object({
        filePath: z.string(),
        searchBlock: z.string(),
        replaceBlock: z.string()
    }),
    risk: "mutative",
    requiresApproval: true,
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        const res = await context.ioHarness.patchFile(input.filePath, input.searchBlock, input.replaceBlock);
        return { success: res.ok, data: res.ok ? res : undefined, error: res.ok ? undefined : res.error };
    }
};

export const runCommandTool: Tool<{ command: string; timeoutMs?: number }, any> = {
    name: "run_command",
    description: "Run a shell command in the workspace.",
    schema: z.object({
        command: z.string(),
        timeoutMs: z.number().optional()
    }),
    risk: "mutative",
    requiresApproval: true,
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        const timeoutSeconds = input.timeoutMs ? Math.ceil(input.timeoutMs / 1000) : 30;
        const res = await context.ioHarness.executeCommandSecure(input.command, timeoutSeconds, context.workspaceId || "default", context.userId);
        return { success: res.ok, data: res.ok ? res : undefined, error: res.ok ? undefined : res.error };
    }
};
