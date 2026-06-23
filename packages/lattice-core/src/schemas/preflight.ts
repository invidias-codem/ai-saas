/**
 * Preflight result contract.
 *
 * Each check result is normalized to this shape so CLI, MCP, and
 * remote adapters can render / aggregate uniformly.
 */
import { z } from 'zod';

export const preflightCheckSchema = z.object({
  step: z.number().int().positive(),
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
  fix: z.string(),
});

export type PreflightCheck = z.infer<typeof preflightCheckSchema>;

export const preflightReportSchema = z.object({
  checks: z.array(preflightCheckSchema),
  passed: z.boolean(),
  generatedAt: z.string().datetime().optional(),
});

export type PreflightReport = z.infer<typeof preflightReportSchema>;
