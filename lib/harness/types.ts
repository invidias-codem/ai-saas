import { z } from 'zod';

// ----------------------------------------------------------------------
// Tool Execution Result
// ----------------------------------------------------------------------
export type ToolExecutionResult =
  | {
      ok: true;
      output: string;
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      meta?: Record<string, unknown>;
    };

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

export type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>;
export type WriteFileArgs = z.infer<typeof WriteFileArgsSchema>;
export type PatchFileArgs = z.infer<typeof PatchFileArgsSchema>;
export type RunCommandArgs = z.infer<typeof RunCommandArgsSchema>;

// ----------------------------------------------------------------------
// Policy & Risk Classification
// ----------------------------------------------------------------------
export type ToolRiskLevel = 'READ_ONLY' | 'SAFE_MODIFY' | 'HIGH_RISK';

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  schema: z.ZodType<TArgs>;
  // Can be extended with approval gates, telemetry hooks, etc.
}
