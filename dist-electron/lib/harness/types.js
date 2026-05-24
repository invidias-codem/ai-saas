"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunCommandArgsSchema = exports.PatchFileArgsSchema = exports.WriteFileArgsSchema = exports.ReadFileArgsSchema = void 0;
const zod_1 = require("zod");
// ----------------------------------------------------------------------
// Tool Schemas (Zod validation for runtime bounds)
// ----------------------------------------------------------------------
exports.ReadFileArgsSchema = zod_1.z.object({
    filePath: zod_1.z.string().min(1, "File path is required"),
});
exports.WriteFileArgsSchema = zod_1.z.object({
    filePath: zod_1.z.string().min(1, "File path is required"),
    content: zod_1.z.string(),
});
exports.PatchFileArgsSchema = zod_1.z.object({
    filePath: zod_1.z.string().min(1, "File path is required"),
    search_block: zod_1.z.string().min(1, "Search block is required"),
    replace_block: zod_1.z.string(),
});
exports.RunCommandArgsSchema = zod_1.z.object({
    command: zod_1.z.string().min(1, "Command is required"),
    timeoutMs: zod_1.z.number().optional().default(30000), // Default 30s timeout
});
