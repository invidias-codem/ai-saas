/**
 * lib/telemetry/evaluationJudge.ts
 *
 * Lightweight LLM-as-a-judge metrics for UCOL execution traces.
 *
 * These judges operate on normalized Opik trace metadata and are intentionally
 * decoupled from live webhook handling. They are designed to be invoked from
 * background evaluator jobs after a thread has been marked terminated and
 * passed the cooldown window.
 *
 * Design rules:
 * - Use the Vercel AI SDK for structured judgment outputs.
 * - Keep prompts focused on trajectory-level reasoning, not turn-by-turn QA.
 * - Never throw on judge failure; return a degraded score so the worker can
 *   continue processing the batch without blocking.
 */

import { generateObject, generateText, type LanguageModel } from 'ai';
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Result types                                                      */
/* ------------------------------------------------------------------ */

export interface ToolCorrectnessResult {
  score: number;
  reasoning: string;
  hallucinatedArgs: boolean;
  unsupportedTool: boolean;
  environmentMismatch: boolean;
}

export interface TaskCompletionResult {
  score: number;
  goalAchieved: boolean;
  missingSteps: string[];
  unnecessarySteps: string[];
  notes: string;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function resolveJudgeModel(): LanguageModel {
  // Lazy import so telemetry never forces provider initialization at import time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createOpenAI } = require('@ai-sdk/openai');
  const apiKey = process.env.OPENAI_API_KEY || process.env.EVAL_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('EVAL_OPENAI_API_KEY or OPENAI_API_KEY is required for evaluation judges');
  }
  return createOpenAI({ apiKey })('gpt-4o-mini');
}

/* ------------------------------------------------------------------ */
/*  AgentToolCorrectnessJudge                                          */
/* ------------------------------------------------------------------ */

const TOOL_CORRECTNESS_PROMPT = `You are an execution-quality auditor for an AI agent that operates inside a restricted tool environment.

Given a user request and a sequence of tool calls the agent actually made, evaluate whether each tool selection and argument was appropriate.

Rules:
- Only judge tools that were available in the provided available_tools list.
- Penalize hallucinated tool names or arguments that do not match the tool schema.
- Penalize selecting a tool when a simpler or more direct available tool would have sufficed.
- Account for harness_selection: if the agent used LocalIOHarness, it should not have attempted Go-only tools.

Return a concise judgment with a numeric score from 0.0 to 1.0.`;

export async function AgentToolCorrectnessJudge(params: {
  userQuery: string;
  availableTools: string[];
  toolCalls: Array<{ tool: string; arguments: Record<string, any>; success: boolean }>;
  selectedHarness?: string;
}): Promise<ToolCorrectnessResult> {
  const { userQuery, availableTools, toolCalls, selectedHarness } = params;
  const model = resolveJudgeModel();

  const toolCallsSummary = toolCalls
    .map((tc) => `- ${tc.tool}(${JSON.stringify(tc.arguments)}) -> ${tc.success ? 'ok' : 'failed'}`)
    .join('\n') || '(none)';

  const prompt = `${TOOL_CORRECTNESS_PROMPT}

User request:
${userQuery}

Available tools:
${availableTools.map((t) => `- ${t}`).join('\n') || '(none)'}

Executed tool calls:
${toolCallsSummary}

${selectedHarness ? `Execution harness: ${selectedHarness}` : ''}`;

  try {
    const result = await generateObject({
      model,
      schema: z.object({
        score: z.number().min(0).max(1),
        reasoning: z.string(),
        hallucinatedArgs: z.boolean(),
        unsupportedTool: z.boolean(),
        environmentMismatch: z.boolean(),
      }),
      prompt,
    });

    return {
      score: Number(result.object.score),
      reasoning: String(result.object.reasoning),
      hallucinatedArgs: Boolean(result.object.hallucinatedArgs),
      unsupportedTool: Boolean(result.object.unsupportedTool),
      environmentMismatch: Boolean(result.object.environmentMismatch),
    };
  } catch (error) {
    return {
      score: 0,
      reasoning: `Judge failed: ${(error as Error).message}`,
      hallucinatedArgs: false,
      unsupportedTool: false,
      environmentMismatch: false,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  AgentTaskCompletionJudge                                           */
/* ------------------------------------------------------------------ */

const TASK_COMPLETION_PROMPT = `You are a trajectory-level judge for an AI agent operating inside a UCOL orchestration layer.

Your job is not to grade individual turns. Judge whether the overall interaction achieved the user's stated goal, given the full trajectory and final response.

Rules:
- Focus on goal completion, not style or verbosity.
- A successful trajectory may include failed intermediate tool calls if the agent recovered.
- A failed trajectory may still contain useful partial progress; record that in missing_steps.
- Do not invent requirements that were not in the original request.

Return a concise judgment with a numeric score from 0.0 to 1.0.`;

export async function AgentTaskCompletionJudge(params: {
  userQuery: string;
  finalAnswer: string;
  trajectorySteps: number;
  executionErrors: number;
  harnessSelectionReason?: string;
}): Promise<TaskCompletionResult> {
  const { userQuery, finalAnswer, trajectorySteps, executionErrors, harnessSelectionReason } = params;
  const model = resolveJudgeModel();

  const prompt = `${TASK_COMPLETION_PROMPT}

User request:
${userQuery}

Final answer:
${finalAnswer || '(none)'}

Trajectory summary:
- Steps: ${trajectorySteps}
- Execution errors: ${executionErrors}
${harnessSelectionReason ? `- Harness selection reason: ${harnessSelectionReason}` : ''}`;

  try {
    const result = await generateObject({
      model,
      schema: z.object({
        score: z.number().min(0).max(1),
        goalAchieved: z.boolean(),
        missingSteps: z.array(z.string()),
        unnecessarySteps: z.array(z.string()),
        notes: z.string(),
      }),
      prompt,
    });

    return {
      score: Number(result.object.score),
      goalAchieved: Boolean(result.object.goalAchieved),
      missingSteps: Array.isArray(result.object.missingSteps) ? result.object.missingSteps.map(String) : [],
      unnecessarySteps: Array.isArray(result.object.unnecessarySteps) ? result.object.unnecessarySteps.map(String) : [],
      notes: String(result.object.notes),
    };
  } catch (error) {
    return {
      score: 0,
      goalAchieved: false,
      missingSteps: [`Judge failure: ${(error as Error).message}`],
      unnecessarySteps: [],
      notes: 'Evaluation failed due to judge execution error.',
    };
  }
}
