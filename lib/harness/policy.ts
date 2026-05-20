export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
}

export class PolicyEngine {
  /**
   * Evaluates security policy for shell commands.
   * Blocks destructive and interactive commands.
   */
  public static evaluateCommand(command: string): PolicyEvaluationResult {
    // 1. Block Destructive Commands
    const destructiveRegex = /\b(rm\s+-[rf]+|chmod\s+-R\s+777|mv\s+.*?\s+\/|mkfs|dd\b|sudo\b)/i;
    if (destructiveRegex.test(command)) {
      return { allowed: false, reason: 'Command blocked by security policy: destructive command detected.' };
    }

    // 2. Block Interactive Commands
    const interactiveRegex = /\b(vim\b|nano\b|vi\b|top\b|htop\b|less\b|more\b|man\b|ssh\b|ftp\b)/i;
    if (interactiveRegex.test(command)) {
      return { allowed: false, reason: 'Command blocked by security policy: interactive command detected.' };
    }

    return { allowed: true };
  }
}
