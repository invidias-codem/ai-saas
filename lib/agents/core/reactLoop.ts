
import { VertexAI, GenerativeModel, GenerateContentRequest, Part } from '@google-cloud/vertexai';
import { AgentContext, ToolResult, TrajectoryStep, AgentActionType } from './types';
import { ToolRegistry } from './registry';

const MAX_LOOPS = 7;
const CIRCUIT_BREAKER_THRESHOLD = 3;

/**
 * Result of the ReAct loop execution.
 */
export interface ReActResult {
    answer: string;
    trajectory: TrajectoryStep[];
    status: 'success' | 'max_loops' | 'error' | 'halted_for_approval';
}

/**
 * Core ReAct Loop Implementation
 */
export async function runReActLoop(
    userQuery: string | Array<Part>,
    context: AgentContext,
    registry: ToolRegistry,
    modelName: string = 'gemini-2.0-flash'
): Promise<ReActResult> {

    const project = process.env.GCP_PROJECT || 'genie-ai-1ca85';
    const location = process.env.GCP_LOCATION || 'us-central1';

    // Parse credentials from env if available
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

    // Note: System instruction is set at chat initialization, or can be prepended.
    // For simpler ReAct, we rely on the prompt or systemInstruction if supported in startChat opts.

    // Initialize chat with history
    const chat = model.startChat({
        history: context.history || [],
        tools: registry.getToolsForGemini()
    });

    // The prompt to send in the current turn. can be string (user query) or Parts[] (multimodal / function response)
    let promptToSend: string | Array<Part> = userQuery;

    while (loopCount < MAX_LOOPS) {
        loopCount++;

        // 1. Meta-Critic / Circuit Breaker Validation
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            console.warn(`[ReActLoop] Circuit breaker triggered after ${consecutiveFailures} failures.`);
            const metaPrompt = `CRITICAL: The previous approach failed ${consecutiveFailures} times. Pivot your strategy. Do NOT repeat the same tool/arguments. Verify your assumptions.`;

            // Append to prompt if it's a string, or add as a text part if it's complex
            if (typeof promptToSend === 'string') {
                promptToSend += `\n\n${metaPrompt}`;
            } else if (Array.isArray(promptToSend)) {
                // It's a function response usually. We can't easily append text to a function response in the same turn 
                // without violating API structure (FunctionResponse should be standalone).
                // However, we can try to send a separate text message? No, that messes up turns.
                // We'll trust the model to see the error in the observation itself.
                // Or we could inject it into the 'response' content JSON.
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

            // 3. Parse Response (Action or Final Answer)
            const parts = firstCandidate.content.parts;
            const functionCallPart = parts.find(p => p.functionCall);
            const textPart = parts.find(p => p.text);

            const thought = textPart?.text || "Processing...";

            // Log Thinking
            trajectory.push({
                stepNumber: loopCount,
                timestamp: new Date().toISOString(),
                thought,
                action: { type: functionCallPart ? 'tool_use' : 'final_answer' }
            });

            // Case A: Final Answer
            if (!functionCallPart) {
                return {
                    answer: thought,
                    trajectory,
                    status: 'success'
                };
            }

            // Case B: Tool Use
            const func = functionCallPart.functionCall!;
            const toolName = func.name;
            const toolArgs = func.args;

            console.log(`[ReActLoop] Tool Call: ${toolName}`, JSON.stringify(toolArgs).substring(0, 100));

            const execResult = await registry.executeTool(toolName, toolArgs, context);

            // Update Log
            trajectory[trajectory.length - 1].action.toolName = toolName;
            trajectory[trajectory.length - 1].action.toolInput = toolArgs;

            if (execResult.userApprovalNeeded) {
                trajectory[trajectory.length - 1].observation = {
                    status: 'pending_approval',
                    summary: 'Halted for user approval'
                };
                return {
                    answer: "I need your approval to proceed with this action.",
                    trajectory,
                    status: 'halted_for_approval'
                };
            }

            if (execResult.success) {
                consecutiveFailures = 0; // Reset
                let outputString = JSON.stringify(execResult.data);

                // Summarization / Truncation
                if (outputString.length > 20000) {
                    outputString = outputString.substring(0, 5000) + `... [Truncated ${outputString.length - 5000} chars]`;
                }

                trajectory[trajectory.length - 1].observation = {
                    status: 'success',
                    data: execResult.data
                };

                // Construct FunctionResponse for Vertex AI
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

                // Send error back as function response so model knows it failed
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
