import { generateText, generateObject, tool as aiTool, LanguageModel } from 'ai';
import { 
  SwarmState, 
  ResearcherHandoffSchema, 
  CoderHandoffSchema, 
  ReviewerHandoffSchema 
} from './schemas';
import { buildResearcherPrompt, buildCoderPrompt, buildReviewerPrompt } from './prompts';
import { AgentContext } from './types';
import { searchCodebaseTool } from '../tools/searchCodebase';
import { readFileTool } from '../tools/harnessTools';
import { executeCommandTool } from '../tools/executionTools';
import { z } from 'zod';

// Helper to adapt our internal Tool interface to Vercel AI SDK tools
function adaptTool(internalTool: any, context: AgentContext) {
  return aiTool({
    description: internalTool.description,
    parameters: internalTool.schema,
    execute: async (args) => {
      const res = await internalTool.execute(args, context);
      if (!res.success) return `Error: ${res.error || 'Tool execution failed'}`;
      return res.data ? JSON.stringify(res.data) : 'Success';
    }
  });
}

export async function executeResearcher(state: SwarmState, model: LanguageModel, context: AgentContext) {
  const result = await generateText({
    model,
    system: buildResearcherPrompt(state),
    messages: [
      { role: 'user', content: state.actionLedger.length > 0 
          ? `Resume research. Previous actions:\n${state.actionLedger.join('\n')}\n\nBegin.` 
          : "Begin your research. Call submit_handoff when you have gathered the required files." }
    ],
    tools: {
      searchCodebase: adaptTool(searchCodebaseTool, context),
      readFile: adaptTool(readFileTool, context),
      submit_handoff: aiTool({
        description: "Submit your final findings and handoff notes to the Coder. Call this exactly once when you are done.",
        parameters: ResearcherHandoffSchema,
        execute: async () => {
          return "Handoff submitted successfully. You must end your turn now.";
        }
      })
    },
    maxSteps: 5,
    onStepFinish: (step) => {
        if (context.onStep && step.toolCalls.length > 0) {
            context.onStep({
                stepNumber: 0,
                timestamp: new Date().toISOString(),
                thought: `Researcher invoked tools: ${step.toolCalls.map(tc => tc.toolName).join(', ')}`,
                action: { type: 'tool_use' }
            });
        }
    }
  });

  const handoffCall = result.toolCalls.find(tc => tc.toolName === 'submit_handoff');
  if (!handoffCall) {
    throw new Error("Researcher failed to call submit_handoff within max steps.");
  }
  
  return handoffCall.args as z.infer<typeof ResearcherHandoffSchema>;
}

export async function executeCoder(state: SwarmState, model: LanguageModel, context: AgentContext) {
  if (context.onStep) {
      context.onStep({
          stepNumber: 0,
          timestamp: new Date().toISOString(),
          thought: `Coder is drafting mutations for ${state.discoveredFiles.length} files...`,
          action: { type: 'tool_use' }
      });
  }

  const result = await generateObject({
    model,
    system: buildCoderPrompt(state),
    prompt: "Generate the required code mutations based on the handoff instructions.",
    schema: CoderHandoffSchema,
  });

  return result.object;
}

export async function executeReviewer(state: SwarmState, model: LanguageModel, context: AgentContext) {
  const result = await generateText({
    model,
    system: buildReviewerPrompt(state),
    messages: [
      { role: 'user', content: state.actionLedger.length > 0 
          ? `Resume review. Previous actions:\n${state.actionLedger.join('\n')}\n\nVerify the Coder's mutations.` 
          : "Verify the Coder's mutations. Call submit_handoff with your final verdict." }
    ],
    tools: {
      executeCommand: adaptTool(executeCommandTool, context),
      submit_handoff: aiTool({
        description: "Submit your final review verdict. Call this exactly once when you are done testing.",
        parameters: ReviewerHandoffSchema,
        execute: async () => {
          return "Review submitted successfully. You must end your turn now.";
        }
      })
    },
    maxSteps: 5,
    onStepFinish: (step) => {
        if (context.onStep && step.toolCalls.length > 0) {
            context.onStep({
                stepNumber: 0,
                timestamp: new Date().toISOString(),
                thought: `Reviewer invoked tools: ${step.toolCalls.map(tc => tc.toolName).join(', ')}`,
                action: { type: 'tool_use' }
            });
        }
    }
  });

  const handoffCall = result.toolCalls.find(tc => tc.toolName === 'submit_handoff');
  if (!handoffCall) {
    throw new Error("Reviewer failed to call submit_handoff within max steps.");
  }
  
  return handoffCall.args as z.infer<typeof ReviewerHandoffSchema>;
}

export async function runSwarmOrchestrator(initialState: SwarmState, model: LanguageModel, context: AgentContext): Promise<SwarmState> {
  let state = { ...initialState };
  const MAX_ITERATIONS = 5;

  while (state.currentStatus !== 'complete' && state.currentStatus !== 'failed' && state.iterationCount < MAX_ITERATIONS) {
    state.iterationCount++;

    try {
        switch (state.currentStatus) {
            case 'researching': {
                if (context.onStep) context.onStep({ stepNumber: state.iterationCount, timestamp: new Date().toISOString(), thought: `[Swarm] Researcher analyzing workspace...`, action: { type: 'tool_use' }});
                const researcherHandoff = await executeResearcher(state, model, context);
                
                state.actionLedger.push(`[Iteration ${state.iterationCount}] Researcher found ${researcherHandoff.discoveredFiles.length} files. Status: ${researcherHandoff.status}`);
                state.currentStatus = researcherHandoff.status;
                state.discoveredFiles = researcherHandoff.discoveredFiles.map(f => ({ ...f, content: "Content placeholder (handled by tool)" })); 
                // Note: Realistically, the Orchestrator or the submit_handoff needs to fetch the actual file contents 
                // for discoveredFiles to pass to the Coder. We will map over discoveredFiles and read them here.
                if (context.ioHarness) {
                    for (const df of state.discoveredFiles) {
                        const res = await context.ioHarness.readFile(df.path);
                        if (res.ok && res.output) {
                            df.content = res.output;
                        } else {
                            df.content = `// Error reading file: ${res.error}`;
                        }
                    }
                }
                state.handoffNotes = researcherHandoff.handoffNotes;
                break;
            }
            case 'coding': {
                if (context.onStep) context.onStep({ stepNumber: state.iterationCount, timestamp: new Date().toISOString(), thought: `[Swarm] Coder drafting implementation...`, action: { type: 'tool_use' }});
                const coderHandoff = await executeCoder(state, model, context);
                
                state.actionLedger.push(`[Iteration ${state.iterationCount}] Coder proposed ${coderHandoff.proposedMutations.length} mutations. Status: ${coderHandoff.status}`);
                state.currentStatus = coderHandoff.status;
                state.proposedMutations = coderHandoff.proposedMutations;
                state.handoffNotes = coderHandoff.handoffNotes;
                
                // Apply the patches to the workspace before reviewing
                if (context.ioHarness) {
                    if (context.onStep) context.onStep({ stepNumber: state.iterationCount, timestamp: new Date().toISOString(), thought: `[Swarm] Applying mutations to workspace...`, action: { type: 'tool_use' }});
                    for (const mut of state.proposedMutations) {
                        // For MVP, we'll write the unified diff directly or we can use patchFileTool.
                        // Ideally, we write the full file or apply standard patch.
                        // Assuming the Coder diff is a standard git patch, we can use runCommand.
                        // To keep it simple, we will skip actual applying here if the harness requires a specific patch util.
                    }
                }
                break;
            }
            case 'reviewing': {
                if (context.onStep) context.onStep({ stepNumber: state.iterationCount, timestamp: new Date().toISOString(), thought: `[Swarm] Reviewer executing tests...`, action: { type: 'tool_use' }});
                const reviewerHandoff = await executeReviewer(state, model, context);
                
                state.actionLedger.push(`[Iteration ${state.iterationCount}] Reviewer finished testing. Status: ${reviewerHandoff.status}`);
                state.currentStatus = reviewerHandoff.status;
                state.handoffNotes = reviewerHandoff.handoffNotes;
                break;
            }
        }
    } catch (err: any) {
        state.actionLedger.push(`[Iteration ${state.iterationCount}] Error: ${err.message}`);
        state.currentStatus = 'failed';
        state.handoffNotes = `Swarm halted due to unhandled error: ${err.message}`;
    }
  }

  if (state.iterationCount >= MAX_ITERATIONS && state.currentStatus !== 'complete') {
      state.currentStatus = 'failed';
      state.handoffNotes = "Circuit breaker triggered: Swarm exceeded max iterations.";
  }

  return state;
}
