import { interceptTool } from '@/lib/ucol/contextFirewall';

describe('contextFirewall', () => {
  const baseInput = (overrides: Partial<Parameters<typeof interceptTool>[0]> = {}) => ({
    harness: 'gql_mutation_checkoutCreate',
    command: ['gql_mutation_checkoutCreate'],
    args: [],
    orgContext: { orgId: 'org-1', userId: 'user-1', permissions: [] },
    trustContext: {},
    ...overrides,
  });

  test('denies gql_ tool when external_actions:use is missing', () => {
    const result = interceptTool(baseInput());
    expect(result.decision).toBe('deny');
    expect(result.policy).toBe('trust_boundary.external_actions_deny');
    expect(result.reason).toContain("classified as an external action");
  });

  test('allows gql_ tool when external_actions:use is present', () => {
    const result = interceptTool(
      baseInput({
        orgContext: { orgId: 'org-1', userId: 'user-1', permissions: ['external_actions:use'] },
      })
    );
    expect(result.decision).toBe('allow');
  });

  test('allows auto_db_ tool without external_actions:use', () => {
    const result = interceptTool(
      baseInput({
        harness: 'auto_db_workspace_memories',
        command: ['auto_db_workspace_memories'],
        orgContext: { orgId: 'org-1', userId: 'user-1', permissions: [] },
      })
    );
    expect(result.decision).toBe('allow');
  });

  test('still blocks sensitive harnesses without sensitive_tools:use', () => {
    const result = interceptTool(
      baseInput({
        harness: 'gh',
        command: ['gh', 'issue', 'close'],
        orgContext: { orgId: 'org-1', userId: 'user-1', permissions: [] },
      })
    );
    expect(result.decision).toBe('deny');
    expect(result.policy).toBe('trust_boundary.sensitive_tool_deny');
  });
});
