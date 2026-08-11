import { VertexAI, GenerativeModel, GenerateContentRequest, Part } from '@google-cloud/vertexai';
import { AgentContext, ToolResult, TrajectoryStep, AgentActionType } from './types';
import { ToolRegistry } from './registry';

const MAX_LOOPS = 7;
const CIRCUIT_BREAKER_THRESHOLD = 3;

function stripThinkingBlocks(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

export interface ReActResult {
    answer: string;
    trajectory: TrajectoryStep[];
    status: 'success' | 'max_loops' | 'error' | 'halted_for_approval';
}

export async function runReActLoop(
    userQuery: string | Array<Part>,
    context: AgentContext,
    registry: ToolRegistry,
    modelName: string = 'gemini-2.5-flash'
): Promise<ReActResult> {
  const providerMode = process.env.MODEL_PROVIDER || process.env.NEXT_PUBLIC_MODEL_PROVIDER || '';

  if (providerMode === 'mock') {
    const mockToolName = 'auto_db_select_workspace_memories';
    const workspaceId = (context as any)?.workspaceId ?? '00000000-0000-0000-0000-000000000001';
    const mockInput = { limit: 5 };
    const execResult = await registry.executeTool(mockToolName, mockInput, context);
    const answer = execResult.success
      ? JSON.stringify(execResult.data)
      : `Tool execution failed: ${execResult.error}`;
    return {
      answer,
      trajectory: [
        {
          stepNumber: 1,
          timestamp: new Date().toISOString(),
          thought: `[MOCK] Executing ${mockToolName}`,
          action: { type: 'tool_use', toolName: mockToolName, toolInput: mockInput },
          observation: {
            status: execResult.success ? 'success' : 'error',
            ...(execResult.success ? { data: execResult.data } : { error: execResult.error }),
          },
        },
      ],
      status: execResult.success ? 'success' : 'error',
    };
  }

  const project = process.env.GCP_PROJECT || 'genie-ai-1ca85';
  const location = process.env.GCP_LOCATION || 'us-central1';

  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
  let googleAuthOptions;
  if (keyJson) {
      try {
          const credentials = JSON.parse(keyJson);
          googleAuthOptions = { credentials };
      } catch (e) {
          console.error("Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON for Vertex AI auth", e);
      }
  }

  const vertexAI = new VertexAI({ project, location, googleAuthOptions });
  const model = vertexAI.getGenerativeModel({ model: modelName });

  const trajectory: TrajectoryStep[] = [];
  let loopCount = 0;
  let consecutiveFailures = 0;

  const chat = model.startChat({
    history: context.history || [],
    tools: registry.getToolsForGemini()
  });

  let promptToSend: string | Array<Part> = userQuery;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      console.warn(`[ReActLoop] Circuit breaker triggered after ${consecutiveFailures} failures.`);
      const metaPrompt = `CRITICAL: The previous approach failed ${consecutiveFailures} times. Pivot your strategy. Do NOT repeat the same tool/arguments. Verify your assumptions.`;

      if (typeof promptToSend === 'string') {
        promptToSend += `\n\n${metaPrompt}`;
      }
    }

    try {
      const result = await chat.sendMessage(promptToSend);
      const response = await result.response;
      const candidates = response.candidates || [];
      const firstCandidate = candidates[0];

      if (!firstCandidate || !firstCandidate.content || !firstCandidate.content.parts) {
        throw new Error("No content generated");
      }

      const parts = firstCandidate.content.parts;
      const functionCallPart = parts.find(p => p.functionCall);
      const textPart = parts.find(p => p.text);

      const thoughtRaw = textPart?.text || "Processing...";
      const thought = stripThinkingBlocks(thoughtRaw);

      trajectory.push({
        stepNumber: loopCount,
        timestamp: new Date().toISOString(),
        thought,
        action: { type: functionCallPart ? 'tool_use' : 'final_answer' }
      });

      if (context.onStep) {
        context.onStep(trajectory[trajectory.length - 1]);
      }
      if (thought && context.onReasoning) {
        context.onReasoning(thought);
      }

      if (!functionCallPart) {
        return {
          answer: stripThinkingBlocks(thought),
          trajectory,
          status: 'success'
        };
      }

      const func = functionCallPart.functionCall!;
      const toolName = func.name;
      const toolArgs = func.args;

      let childSpan = context.rootSpan ? context.rootSpan.startChild({ name: `tool:${toolName}` }) : undefined;
      const toolStart = Date.now();
      let execResult: ToolResult;

      try {
        execResult = await registry.executeTool(toolName, toolArgs, context);
      } catch (error: any) {
        childSpan?.fail(error.message ?? String(error), { toolName, inputSize: JSON.stringify(toolArgs ?? {}).length });
        childSpan?.end({ metadata: { status: 'error', latencyMs: Date.now() - toolStart } });
        console.warn(`[ReActLoop] Tool Error: ${error.message}`);
        consecutiveFailures++;
        trajectory[trajectory.length - 1].observation = { status: 'error', error: error.message };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);
        promptToSend = [{
          functionResponse: {
            name: toolName,
            response: { name: toolName, content: { error: error.message } },
          },
        }];
        continue;
      } finally {
        // noop: child span closed in success/failure branches above
      }

      trajectory[trajectory.length - 1].action.toolName = toolName;
      trajectory[trajectory.length - 1].action.toolInput = toolArgs;

      if (execResult.userApprovalNeeded) {
        trajectory[trajectory.length - 1].observation = {
          status: 'pending_approval',
          summary: 'Halted for user approval'
        };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);
        return {
          answer: "I need your approval to proceed with this action.",
          trajectory,
          status: 'halted_for_approval'
        };
      }

      if (execResult.success) {
        consecutiveFailures = 0;
        let outputString = JSON.stringify(execResult.data);

        if (outputString.length > 20000) {
          outputString = outputString.substring(0, 5000) + `... [Truncated ${outputString.length - 5000} chars]`;
        }

        trajectory[trajectory.length - 1].observation = {
          status: 'success',
          data: execResult.data
        };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);

        promptToSend = [{
          functionResponse: {
            name: toolName,
            response: {
              name: toolName,
              content: { result: outputString }
            }
          }
        }];
      } else {
        console.warn(`[ReActLoop] Tool Error: ${execResult.error}`);
        consecutiveFailures++;
        trajectory[trajectory.length - 1].observation = {
          status: 'error',
          error: execResult.error
        };
        if (context.onStep) context.onStep(trajectory[trajectory.length - 1]);

        promptToSend = [{
          functionResponse: {
            name: toolName,
            response: {
              name: toolName,
              content: { error: execResult.error }
            }
          }
        }];
      }
    } catch (error: any) {
      console.error("[ReActLoop] Implementation Error:", error);
      return {
          answer: "An internal error occurred during the agent loop.",
          trajectory,
          status: 'error'
      };
    }
  }

  return {
      answer: "Agent reached maximum loop limit without a final answer.",
      trajectory,
      status: 'max_loops'
  };
}
