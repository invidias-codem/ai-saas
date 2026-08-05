import { ToolRegistry } from '@/lib/agents/core/registry';
import { AgentContext } from '@/lib/agents/core/types';

const registry = new ToolRegistry();
registry.register({
  name: 'gh',
  description: 'GitHub CLI wrapper',
  schema: { parse: () => ({ success: true }) } as any,
  execute: async () => 'ok',
  risk: 'sensitive',
  timeoutMs: 1000,
});

const zeroTrust: AgentContext = {
  userId: 'test-user',
  sessionId: 'sanity-test',
  workspaceId: '00000000-0000-0000-0000-000000000001',
  orgContext: { orgId: '00000000-0000-0000-0000-000000000002', userId: 'test-user', permissions: [] },
};

(async function main() {
  const result = await registry.executeTool('gh', { args: ['issue', 'list'] }, zeroTrust);
  console.log('RESULT', JSON.stringify(result, null, 2));
  console.log('DENIED', result.success === false && /tool_intercepted|intercepted/.test(result.error));
})();
