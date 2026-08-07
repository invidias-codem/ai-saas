/**
 * Context Firewall — pre-tool interception for UCOL.
 *
 * Invoked before executeTool runs a harness command.
 * Validates the tool name and parsed arguments against trust-boundary rules.
 *
 * Security invariants:
 *   - Reject before execution
 *   - Return structured ToolInterceptionResult
 *   - On reject, the caller should feed the violation back into the ReAct loop
 */

export type ToolInterceptionDecision = 'allow' | 'deny';

export interface OrgContext {
  orgId: string;
  userId: string;
  permissions: string[];
}

export interface ToolInterceptionInput {
  harness: string;
  command: string[];
  args: string[];
  toolDescription?: string;
  trustContext?: {
    canUseExternalActions?: boolean;
    canUseSensitiveTools?: boolean;
  };
  orgContext?: OrgContext;
}

export interface ToolInterceptionResult {
  decision: ToolInterceptionDecision;
  reason?: string;
  policy?: string;
}

const SENSITIVE_HARNESSES = new Set(['gh', 'firebase']);

const DESTRUCTIVE_COMMANDS: Record<string, Set<string>> = {
  gh: new Set(['delete', 'remove', 'close', 'merge']),
  supabase: new Set(['delete', 'reset', 'drop', 'sql']),
  firebase: new Set(['delete', 'functions:delete', 'firestore:delete']),
};

function hasPermission(orgContext: OrgContext | undefined, permission: string): boolean {
  if (!orgContext) return false;
  return orgContext.permissions.includes(permission);
}

export function interceptTool(input: ToolInterceptionInput): ToolInterceptionResult {
  const { harness, command, args, orgContext, trustContext = {} } = input;
  const top = command[0];

  if (SENSITIVE_HARNESSES.has(harness) && !hasPermission(orgContext, 'sensitive_tools:use')) {
    return {
      decision: 'deny',
      reason: `${harness} is a sensitive harness and this session is not authorized for sensitive tools.`,
      policy: 'trust_boundary.sensitive_tool_deny',
    };
  }

  const isInternalTool = harness.startsWith('auto_db_');
  const isExternalApiTool = !isInternalTool && (harness.startsWith('gql_') || harness.startsWith('api_'));

  if (!isInternalTool && (trustContext.canUseExternalActions || isExternalApiTool)) {
    if (!hasPermission(orgContext, 'external_actions:use')) {
      return {
        decision: 'deny',
        reason: `Execution blocked: '${harness}' is classified as an external action. The active session lacks the required 'external_actions:use' permission.`,
        policy: 'trust_boundary.external_actions_deny',
      };
    }
  } else if (!isInternalTool && !trustContext.canUseExternalActions && !hasPermission(orgContext, 'external_actions:use')) {
    return {
      decision: 'deny',
      reason: 'External actions are disabled for this request.',
      policy: 'trust_boundary.external_actions_deny',
    };
  }

  const destructiveSet = DESTRUCTIVE_COMMANDS[harness];
  if (destructiveSet && top && destructiveSet.has(top)) {
    return {
      decision: 'deny',
      reason: `Destructive command blocked: ${harness} ${top} ${(args ?? []).join(' ')}`.trim(),
      policy: 'trust_boundary.destructive_command_deny',
    };
  }

  return { decision: 'allow' };
}
