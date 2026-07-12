import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { logger } from "@/lib/logger";
import { gatherCodeContext } from '@/lib/llm/contextAggregator';
import { executeAgentLoop } from '@/lib/harness/AgentExecutor';
import type { FileAttachmentInput, ResolvedAttachment } from '@/lib/types/attachments';
import { resolveAttachmentForAnalysis } from '@/lib/gcp/fileResolver';
import { getUserProviderApiKeys } from '@/lib/userProviderApiKeys';
import { emitInteractionAudit } from '@/lib/telemetry/emit';
import { deriveContextRole } from '@/lib/telemetry/governance';

const CODE_SYSTEM_INSTRUCTION_TEXT = "You are 'Genie Code', an expert coding assistant. Analyze provided code snippets or file content, explain concepts, generate code, and answer questions related to programming. **If file content data is provided along with a text prompt, focus your analysis on the file data based on the instructions in the text prompt.** Use markdown code blocks with language identifiers. For non-coding questions, politely decline.";

const HARNESS_INSTRUCTIONS = `
You are an autonomous AI coding agent operating within Lattice OS.
You have access to a secure I/O harness that allows you to interact with the file system and execute terminal commands.

You can use the following tools:
1. read_file: Read the contents of a file. Args: { "filePath": "path/to/file" }
2. write_file: Write contents to a file. Args: { "filePath": "path/to/file", "content": "file contents" }
3. run_command: Run a shell command. Args: { "command": "npm run test", "timeoutMs": 30000 }
4. mark_task_complete: Mark the current task as complete. Args: { "reason": "summary of what was done" }

To invoke a tool, output a JSON block inside <tool_call> tags. Do NOT output anything after the tool call.
Example:
<tool_call>
{
  "tool": "read_file",
  "args": {
    "filePath": "src/index.ts"
  }
}
</tool_call>

You must wait for the tool result before taking further actions. The result will be provided in a <tool_result> tag.
`;

export interface CodeEngineParams {
  userId: string;
  clerkUser: any;
  userQuery: string;
  history: any[];
  fileData?: FileAttachmentInput;
  activeRepo?: string;
  initialModelConfig: typeof CODE_MODELS[keyof typeof CODE_MODELS];
  resolvedContext: any;
  requestId: string;
  messagesLength: number;
}

function buildAttachmentPromptBlock(resolvedAttachment: ResolvedAttachment | null): string {
  if (!resolvedAttachment) return '';

  if (resolvedAttachment.textContent) {
    return `\n\n[Attached File: ${resolvedAttachment.name || 'uploaded file'}]\n\n\`\`\`${resolvedAttachment.mimeType || ''}\n${resolvedAttachment.textContent}\n\`\`\``;
  }

  if (resolvedAttachment.fileUri) {
    return `\n\n[Attached File: ${resolvedAttachment.name || 'uploaded file'}]\nStored at ${resolvedAttachment.fileUri}. Deep binary/media analysis is not yet enabled in this code path.`;
  }

  return '';
}

export async function runCodeEngine({
  userId,
  clerkUser,
  userQuery,
  history,
  fileData,
  activeRepo,
  initialModelConfig,
  resolvedContext,
  requestId,
  messagesLength
}: CodeEngineParams) {
  const resolvedAttachment = fileData ? await resolveAttachmentForAnalysis(fileData) : null;

  const routingDecision = buildInitialRoutingDecision({
    request: {
      requestId,
      rawInput: userQuery,
      userId,
      surface: 'api' as const,
      createdAt: new Date().toISOString(),
      attachments: fileData ? [{
        id: fileData.name || 'attachment-0',
        type: ((fileData.type || fileData.mimeType || '').startsWith('image/') ? 'image'
          : (fileData.type || fileData.mimeType || '').startsWith('audio/') ? 'audio'
          : (fileData.type || fileData.mimeType || '').startsWith('video/') ? 'video'
          : 'document') as import('@/lib/ucol/routing/types').UcolAttachmentType,
        mimeType: fileData.mimeType || fileData.type,
        metadata: {
          filename: fileData.name,
          sizeBytes: fileData.sizeBytes,
          fileUri: fileData.fileUri,
          storageProvider: fileData.storageProvider,
        },
      }] : [],
    },
    context: resolvedContext.ucolContext,
    agentMode: resolvedContext.mode as any,
    signals: {
      hasAttachments: Boolean(fileData),
      messageHistoryCount: messagesLength,
      profile: resolvedContext.profile,
    }
  });

  const {
    enhancedPromptText: gatheredPromptText,
    modelConfig,
    intelligentFacts,
    userContext,
  } = await gatherCodeContext({
    userId,
    clerkUser,
    userQuery,
    fileData,
    activeRepo,
    resolvedContext,
    routingDecision,
    initialModelConfig,
  });

  const enhancedPromptText = gatheredPromptText + buildAttachmentPromptBlock(resolvedAttachment);
  const systemInstruction = CODE_SYSTEM_INSTRUCTION_TEXT + "\n\n" + HARNESS_INSTRUCTIONS;
  const providerKeys = await getUserProviderApiKeys(userId);

  const responseText = await executeAgentLoop({
    enhancedPromptText,
    dynamicHistory: [...history],
    modelConfig,
    fileData: resolvedAttachment?.base64Data ? {
      name: resolvedAttachment.name,
      type: resolvedAttachment.mimeType,
      mimeType: resolvedAttachment.mimeType,
      base64Data: resolvedAttachment.base64Data,
    } : undefined,
    systemInstruction,
    providerKeys,
  });

  // ── Sovereign telemetry: emit UDIF 2.0 interaction-audit (non-blocking) ──
  // Code path has a single resolved model (no confidence override / 429 fallback
  // today), so requested === actual. Client IndexedDB + Supabase flush later.
  try {
    const { calculateInteractionCost } = await import("@/lib/subscription/credits");
    const creditCost = calculateInteractionCost({
      hasAttachments: Boolean(resolvedAttachment?.base64Data),
      mode: resolvedContext.mode as any,
    });
    emitInteractionAudit({
      requestedModelId: modelConfig.modelId,
      actualModelId: modelConfig.modelId,
      systemProvider: modelConfig.provider,
      agentName: resolvedContext.mode,
      agentRole: "code",
      creditCost,
      contextRole: deriveContextRole({ workspaceId: resolvedContext.workspaceId, agentMode: resolvedContext.mode }),
      macroWorkflowId: resolvedContext.conversationId ?? undefined,
    });
  } catch (telemetryErr) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] codeEngine emit failed (non-blocking):", telemetryErr);
    }
  }

  return {
    responseText,
    modelConfig,
    modelId: modelConfig.modelId,
    requestedModelId: modelConfig.modelId,
    actualModelId: modelConfig.modelId,
    systemProvider: modelConfig.provider,
    routingDecision,
    intelligentFacts,
    userContext,
  };
}
