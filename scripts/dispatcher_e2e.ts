import { ToolRegistry } from '@/lib/agents/core/registry';
import { AgentContext } from '@/lib/agents/core/types';
import { interceptTool } from '@/lib/ucol/contextFirewall';
import { auditEnterprise } from '@/lib/security/auditLog';

const registry = new ToolRegistry();
registry.register({
  name: 'gh',
  description: 'GitHub CLI wrapper',
  schema: { parse: () => ({ success: true }) } as any,
  execute: async () => 'ok',
  risk: 'sensitive',
  timeoutMs: 1000,
});

const orgContext = { orgId: '00000000-0000-0000-0000-000000000002', userId: 'test-user', role: 'developer', permissions: ['org:read', 'external_actions:use'] };
const agentContext: AgentContext = {
  userId: 'test-user',
  sessionId: 'e2e-dispatcher-' + Date.now(),
  workspaceId: '00000000-0000-0000-0000-000000000001',
  orgContext,
  history: [],
  enableTelemetry: true,
};

(async () => {
  const result = await registry.executeTool('gh', { args: ['issue', 'list'] }, agentContext);
  console.log('TOOL_RESULT', JSON.stringify(result, null, 2));
  console.log('DENIED', result.success === false && /tool_intercepted|intercepted/.test(result.error));
})();
