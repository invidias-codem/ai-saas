"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommandTool = exports.patchFileTool = exports.writeFileTool = exports.readFileTool = void 0;
const zod_1 = require("zod");
exports.readFileTool = {
    name: "read_file",
    description: "Read the contents of a file in the workspace.",
    schema: zod_1.z.object({
        filePath: zod_1.z.string().describe("Path to the file relative to the workspace root, or absolute path.")
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
exports.writeFileTool = {
    name: "write_file",
    description: "Write content to a file in the workspace.",
    schema: zod_1.z.object({
        filePath: zod_1.z.string(),
        content: zod_1.z.string()
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
exports.patchFileTool = {
    name: "patch_file",
    description: "Patch a file by replacing a search block with a replace block.",
    schema: zod_1.z.object({
        filePath: zod_1.z.string(),
        searchBlock: zod_1.z.string(),
        replaceBlock: zod_1.z.string()
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
exports.runCommandTool = {
    name: "run_command",
    description: "Run a shell command in the workspace.",
    schema: zod_1.z.object({
        command: zod_1.z.string(),
        timeoutMs: zod_1.z.number().optional()
    }),
    risk: "mutative",
    requiresApproval: true,
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        const res = await context.ioHarness.runCommand(input.command, input.timeoutMs);
        return { success: res.ok, data: res.ok ? res : undefined, error: res.ok ? undefined : res.error };
    }
};
