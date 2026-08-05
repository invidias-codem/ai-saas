import { z } from "zod";
import { Tool } from "../core/types";

export const ghMockTool: Tool<any, any> = {
  name: 'gh',
  description: 'GitHub CLI wrapper',
  schema: z.object({
    args: z.array(z.string()).describe('CLI arguments for gh').default(['issue','list'])
  }),
  execute: async (_input, _ctx) => ({ success: true, data: { output: 'mock-gh-output' } }),
  risk: 'mutative',
  timeoutMs: 1000,
};

export const dbSelectMockTool: Tool<any, any> = {
  name: 'auto_db_select_workspace_memories',
  description: 'Auto-generated read-only selector for workspace_memories.',
  schema: z.object({
    limit: z.number().int().positive().max(100).default(20).optional(),
  }),
  execute: async (input, ctx) => {
    const limit = input?.limit ?? 20;
    const workspaceId = ctx.workspaceId ?? '00000000-0000-0000-0000-000000000001';
    return { success: true, data: [{ workspace_id: workspaceId, content: 'mock-memory-1' }, { workspace_id: workspaceId, content: 'mock-memory-2' }] };
  },
  risk: 'read-only',
  timeoutMs: 1000,
};
