import type { IOHarness } from './IOHarness';
import type { ToolExecutionResult } from './types';
import { ReadFileArgsSchema, WriteFileArgsSchema, PatchFileArgsSchema, RunCommandArgsSchema } from './types';
import { z } from 'zod';
import { searchCodebaseTool } from '@/lib/agents/tools/searchCodebase';

/**
 * The ToolRouter bridges the LLM's unstructured intent and the structured IOHarness.
 * 
 * Responsibilities:
 * - Validates incoming JSON tool calls against exact Zod schemas.
 * - Applies risk/policy decisions (e.g. denying high-risk commands).
 * - Dispatches strictly-typed arguments to the underlying IOHarness.
 */
export class ToolRouter {
  private harness: IOHarness;

  constructor(harness: IOHarness) {
    this.harness = harness;
  }

  /**
   * Main dispatch entry point for raw LLM intent.
   * 
   * @param toolName The name of the tool intended by the LLM
   * @param rawArgs The parsed JSON arguments provided by the LLM
   */
  public async dispatch(toolName: string, rawArgs: unknown): Promise<ToolExecutionResult> {
    try {
      switch (toolName) {
        case 'read_file':
          return await this.handleReadFile(rawArgs);
        case 'write_file':
          return await this.handleWriteFile(rawArgs);
        case 'patch_file':
          return await this.handlePatchFile(rawArgs);
        case 'run_command':
          return await this.handleRunCommand(rawArgs);
        case 'search_codebase':
          return await this.handleSearchCodebase(rawArgs);
        default:
          return { ok: false, error: `Unknown tool: ${toolName}`, code: 'UNKNOWN_TOOL' };
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return { 
          ok: false, 
          error: `Schema validation failed: ${err.message}`,
          code: 'VALIDATION_ERROR',
          meta: { issues: err.issues }
        };
      }
      return { ok: false, error: err.message || 'Internal execution error', code: 'INTERNAL_ERROR' };
    }
  }

  private async handleReadFile(rawArgs: unknown): Promise<ToolExecutionResult> {
    const args = ReadFileArgsSchema.parse(rawArgs);
    // Future extension: add policy gating for read files if necessary
    return this.harness.readFile(args.filePath);
  }

  private async handleWriteFile(rawArgs: unknown): Promise<ToolExecutionResult> {
    const args = WriteFileArgsSchema.parse(rawArgs);
    // Future extension: hook for AST checks or file size boundaries
    return this.harness.writeFile(args.filePath, args.content);
  }

  private async handlePatchFile(rawArgs: unknown): Promise<ToolExecutionResult> {
    const args = PatchFileArgsSchema.parse(rawArgs);
    return this.harness.patchFile(args.filePath, args.search_block, args.replace_block);
  }

  private evaluateSecurityPolicy(command: string): { allowed: boolean; reason?: string } {
    // 1. Block Destructive Commands
    const destructiveRegex = /\b(rm\s+-[rf]+|chmod\s+-R\s+777|mv\s+.*?\s+\/|mkfs|dd|sudo)\b/i;
    if (destructiveRegex.test(command)) {
      return { allowed: false, reason: 'Command blocked by security policy: destructive command detected.' };
    }

    // 2. Block Interactive Commands
    const interactiveRegex = /\b(vim|nano|vi|top|htop|less|more|man|ssh|ftp)\b/i;
    if (interactiveRegex.test(command)) {
      return { allowed: false, reason: 'Command blocked by security policy: interactive command detected.' };
    }

    return { allowed: true };
  }

  private async handleRunCommand(rawArgs: unknown): Promise<ToolExecutionResult> {
    const args = RunCommandArgsSchema.parse(rawArgs);
    
    const policyResult = this.evaluateSecurityPolicy(args.command);
    if (!policyResult.allowed) {
      return { 
        ok: false, 
        error: policyResult.reason || 'Command blocked by security policy.', 
        code: 'POLICY_VIOLATION' 
      };
    }

    return this.harness.executeCommandSecure(args.command, Math.ceil(args.timeoutMs / 1000), '', '');
  }

  private async handleSearchCodebase(rawArgs: unknown): Promise<ToolExecutionResult> {
    const inputSchema = searchCodebaseTool.schema as z.ZodSchema<any>;
    const parsed = inputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      return { ok: false, error: `Schema validation failed: ${parsed.error.message}`, code: 'VALIDATION_ERROR', meta: { issues: parsed.error.issues } };
    }
    try {
      const result = await searchCodebaseTool.execute(parsed.data, {} as any);
      return { ok: true, output: JSON.stringify(result) };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'search_codebase failed', code: 'INTERNAL_ERROR' };
    }
  }
}
