import { z } from 'zod';

// ----------------------------------------------------------------------
// Tool Schemas (Zod validation for runtime bounds)
// ----------------------------------------------------------------------
export const ReadFileArgsSchema = z.object({
  filePath: z.string().min(1, "File path is required"),
});

export const WriteFileArgsSchema = z.object({
  filePath: z.string().min(1, "File path is required"),
  content: z.string(),
});

export const PatchFileArgsSchema = z.object({
  filePath: z.string().min(1, "File path is required"),
  search_block: z.string().min(1, "Search block is required"),
  replace_block: z.string(),
});

export const RunCommandArgsSchema = z.object({
  command: z.string().min(1, "Command is required"),
  timeoutMs: z.number().optional().default(30000), // Default 30s timeout
});
