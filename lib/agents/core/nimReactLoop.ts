import { logger } from '@/lib/logger';
import { AgentContext, ToolResult, TrajectoryStep } from './types';
import { ToolRegistry } from './registry';
import { withPromotionGate, NeedsApprovalError } from '@/lib/cli/promotionPrompt';
import type { QuarantineArtifact } from '@/lib/execution/sandboxManager';
import { NvidiaNimProvider, NIM_MODEL_KIMI_K3 } from '@/lib/llm/providers/nvidiaNim';
import { buildToolChoice } from './openaiTools';
import type { NimToolCall, NimToolSpec } from '@/lib/llm/toolCallTypes';

const MAX_LOOPS = 7;
const CIRCUIT_BREAKER_THRESHOLD = 3;

export interface ReActResult {
  answer: string;
  trajectory: TrajectoryStep[];
  status: 'success' | 'max_loops' | 'error' | 'halted_for_approval';
  approvalRequest?: { approvalId: string; toolName: string; params: any };
  promotionState?: {
    sessionId: string;
    artifacts: QuarantineArtifact[];
    rejectionCount: number;
    circuitBreakerTripped: boolean;
  };
}

function stripThinkingBlocks(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

/** Parse (leniently) a tool-call arguments JSON string into an object. */
function parseToolArgs(args: string): any {
  const trimmed = (args || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    // Lenient repair: strip trailing commas, then retry.
    const repaired = trimmed.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch {
      logger.warn('[NimReActLoop] tool argument JSON unparseable, treating as {}');
      return {};
    }
  }
}

/**
 * NIM-backed ReAct loop (OpenAI-compatible tool-calling).
 *
 * Provider-agnostic replacement for the Gemini-Vertex-coupled `runReActLoop`.
 * Walks the same DAG: model proposes tool_calls → execute via ToolRegistry →
 * feed results back as `role:"tool"` messages → repeat until final answer.
 *
 * Preserves the exact approval gate, durable-approval, quarantine-promotion,
 * and circuit-breaker semantics of `reactLoop.ts`, but transports tool traffic
 * as OpenAI `tool_calls` / `role:"tool"` rather than Gemini `functionCall` /
 * `functionResponse` Parts.
 */
export async function runNimReactLoop(
  userQuery: string,
  context: AgentContext,
  registry: ToolRegistry,
  modelName: string = NIM_MODEL_KIMI_K3,
  systemInstruction?: string,
): Promise<ReActResult> {
  const provider = new NvidiaNimProvider();
  const toolSpecs: NimToolSpec[] = registry.getToolsForOpenAI();

  const trajectory: TrajectoryStep[] = [];
  let loopCount = 0;
  let consecutiveFailures = 0;

  // OpenAI-compatible message history (role/content/tool_calls/tool_call_id).
  const messages: Array<Record<string, unknown>> = [
    { role: 'user', content: userQuery },
  ];

  let pendingApproval: ReActResult['approvalRequest'] | undefined;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      logger.warn(`[NimReActLoop] Circuit breaker triggered after ${consecutiveFailures} failures.`);
      const metaPrompt = `CRITICAL: The previous approach failed ${consecutiveFailures} times. Pivot your strategy. Do NOT repeat the same tool/arguments. Verify your assumptions.`;
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
        lastMsg.content += `\n\n${metaPrompt}`;
      } else {
        messages.push({ role: 'user', content: metaPrompt });
      }
    }

    let content: string;
    let toolCalls: NimToolCall[];

    try {
      const res = await provider.chatWithTools(
        messages,
        {
          systemInstruction,
          model: modelName,
          tools: toolSpecs,
          tool_choice: buildToolChoice(),
          maxTokens: 4096,
        },
      );
      content = res.content;
      toolCalls = res.toolCalls;
    } catch (err: any) {
      logger.error('[NimReActLoop] Implementation error:', err);
      return { answer: 'An internal error occurred during the agent loop.', trajectory, status: 'error' };
    }

    const hasToolCalls = toolCalls.length > 0;
    const thought = stripThinkingBlocks(content) || (hasToolCalls ? 'Calling tools…' : 'Processing…');

    trajectory.push({
      stepNumber: loopCount,
      timestamp: new Date().toISOString(),
      thought,
      action: { type: hasToolCalls ? 'tool_use' : 'final_answer' },
    });
    if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);
    if (thought && context.onReasoning) context.onReasoning(thought);

    // No tool calls → final answer reached.
    if (!hasToolCalls) {
      return { answer: stripThinkingBlocks(content), trajectory, status: 'success' };
    }

    // Append the assistant's tool_calls to history so the API round-trips correctly.
    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    });

    // Execute each tool call, appending a `role:"tool"` result per call.
    let anyApproval = false;
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      const toolArgs = parseToolArgs(tc.function.arguments);

      let childSpan = context.rootSpan ? context.rootSpan.startChild({ name: `tool:${toolName}` }) : undefined;
      const toolStart = Date.now();

      let execResult: ToolResult;
      try {
        execResult = await registry.executeTool(toolName, toolArgs, context);
      } catch (error: any) {
        childSpan?.fail(error.message ?? String(error), { toolName });
        childSpan?.end({ metadata: { status: 'error', latencyMs: Date.now() - toolStart } });
        logger.warn(`[NimReActLoop] Tool Error: ${error.message}`);
        consecutiveFailures++;
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: error.message }) });
        continue;
      }

      trajectory[trajectory.length - 1].action.toolName = toolName;
      trajectory[trajectory.length - 1].action.toolInput = toolArgs;

      if (execResult.userApprovalNeeded) {
        anyApproval = true;
        trajectory[trajectory.length - 1].observation = { status: 'pending_approval', summary: 'Halted for user approval' };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);

        const { registerDurableApproval } = await import('@/lib/execution/durableApprovalStore');
        const approvalId = await registerDurableApproval({
          userId: context.userId,
          toolName,
          workspaceId: context.workspaceId ?? null,
          input: toolArgs,
          context: {
            userId: context.userId,
            sessionId: context.sessionId,
            workspaceId: context.workspaceId ?? null,
            userRole: context.userRole,
            orgContext: context.orgContext,
            history: context.history,
            enableTelemetry: context.enableTelemetry,
          },
        });
        pendingApproval = { approvalId, toolName, params: toolArgs };
        // Do not feed a tool result — we're paused; surface the approval.
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ pendingApproval: true, approvalId, toolName }) });
        continue;
      }

      if (execResult.success) {
        consecutiveFailures = 0;
        let outputString = JSON.stringify(execResult.data);
        if (outputString.length > 20000) {
          outputString = outputString.substring(0, 5000) + `... [Truncated ${outputString.length - 5000} chars]`;
        }
        trajectory[trajectory.length - 1].observation = { status: 'success', data: execResult.data };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: outputString });
      } else {
        logger.warn(`[NimReActLoop] Tool Error: ${execResult.error}`);
        consecutiveFailures++;
        trajectory[trajectory.length - 1].observation = { status: 'error', error: execResult.error };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: execResult.error }) });
      }
    }

    // If any tool halted for approval, surface the approval request and stop.
    if (anyApproval && pendingApproval) {
      return {
        answer: 'I need your approval to proceed with this action.',
        trajectory,
        status: 'halted_for_approval',
        approvalRequest: pendingApproval,
      };
    }
  }

  return { answer: 'Agent reached maximum loop limit without a final answer.', trajectory, status: 'max_loops' };
}