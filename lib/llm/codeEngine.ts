import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';
import {
  getRAGMemoryContext,
  gatherUserContext,
  formatUserContextForPrompt,
  getHighConfidenceFacts,
  formatFactsForPrompt,
  getGitHubContext,
  getWorkspaceMemoryContext,
  estimateTokenCount
} from '@/lib/ragMemory';
import { rankMemoriesIntelligently } from '@/lib/intelligentMemory';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { ChatMessage } from '@/lib/llm/types';
import { logger } from "@/lib/logger";
import { LocalIOHarness } from '@/lib/harness/LocalIOHarness';
import { ToolRouter } from '@/lib/harness/ToolRouter';

// Initialize lazily
function getGeminiModel(modelId: string) {
  const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
  return genAI.getGenerativeModel({
    model: modelId,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  });
}

const CODE_SYSTEM_INSTRUCTION_TEXT = "You are 'Genie Code', an expert coding assistant. Analyze provided code snippets or file content, explain concepts, generate code, and answer questions related to programming. **If file content data is provided along with a text prompt, focus your analysis on the file data based on the instructions in the text prompt.** Use markdown code blocks with language identifiers. For non-coding questions, politely decline.";

const CODE_SYSTEM_INSTRUCTION = {
  role: "user",
  parts: [{
    text: CODE_SYSTEM_INSTRUCTION_TEXT
  }],
};

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

const CODE_GREETING = {
  role: "model",
  parts: [{
    text: "Ready to code! Ask a question or attach a file."
  }]
};

export interface CodeEngineParams {
  userId: string;
  clerkUser: any;
  userQuery: string;
  history: any[]; // Already adapted history
  fileData?: { name?: string; type?: string; base64Data: string; mimeType?: string };
  activeRepo?: string;
  initialModelConfig: typeof CODE_MODELS[keyof typeof CODE_MODELS];
  resolvedContext: any;
  requestId: string;
  messagesLength: number;
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
  let modelConfig = { ...initialModelConfig };
  
  const effectiveProfile = resolvedContext.profile;
  const operatingProfileResolvedMode = resolvedContext.mode;
  const operatingProfileName = resolvedContext.operatingProfileName ?? resolvedContext.operatingProfileId ?? 'resolved';
  const effectiveWorkspaceId = resolvedContext.workspaceId;

  // 1. Gather comprehensive user context
  const userContext = await gatherUserContext(userId, clerkUser);
  const userContextPrompt = formatUserContextForPrompt(userContext);

  // 2. Parallel Context Gathering (Tiered Memory for Code)
  const [
    allFacts,
    researchResult,
    graphData,
    userProfileMemories,
    workspaceMemoryContext,
  ] = await Promise.all([
    getHighConfidenceFacts(userId),
    performResearch(userQuery, userContextPrompt, { hasFileAttachment: !!(fileData && fileData.base64Data) }),
    findRelatedEntities(userId, userQuery),
    getUserProfile(userId),
    effectiveWorkspaceId ? getWorkspaceMemoryContext(userId, effectiveWorkspaceId, userQuery) : Promise.resolve({ contextString: '', sources: [] })
  ]);

  const searchContext = formatSearchResults(researchResult.results);
  const graphContext = formatGraphContext(graphData);

  const similarities = new Map<string, number>();
  const queryWords = userQuery.toLowerCase().split(/\s+/);
  for (const fact of allFacts) {
    const factWords = fact.content.toLowerCase().split(/\s+/);
    const overlap = factWords.filter((w: string) => queryWords.includes(w)).length;
    const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
    similarities.set(fact.id || '', Math.min(1, similarity * 1.5));
  }

  const intelligentFacts = rankMemoriesIntelligently(
    allFacts,
    similarities,
    userQuery
  );

  console.log(`[Code Memory Intelligence] Retrieved ${intelligentFacts.length} intelligently ranked facts for user ${userId}`);
  const factContext = formatFactsForPrompt(intelligentFacts);

  const memoryContext = (await getRAGMemoryContext(userId, userQuery, 'code')).contextString;
  const workspaceMemoryPrompt = workspaceMemoryContext.contextString || '';

  let githubContext = '';
  if (activeRepo) {
    try {
      logger.debug(`[Code API] Fetching GitHub context for ${activeRepo}`);
      githubContext = await getGitHubContext(userId, userQuery, activeRepo);
    } catch (err) {
      logger.error("[Code API] Failed to fetch GitHub context:", err);
    }
  }

  const userProfileContext = formatUserProfileForPrompt(userProfileMemories);

  if (effectiveProfile) {
    if (operatingProfileResolvedMode === 'agentic' && CODE_MODELS.agentic) {
      modelConfig = CODE_MODELS.agentic;
    } else if (operatingProfileResolvedMode === 'fast' && CODE_MODELS.fast) {
      modelConfig = CODE_MODELS.fast;
    }
  }

  // 3. Inject UCOL Bandit Router
  const routingDecision = buildInitialRoutingDecision({
    request: {
      requestId,
      rawInput: userQuery,
      userId,
      surface: 'api' as const,
      createdAt: new Date().toISOString(),
      attachments: fileData && fileData.base64Data ? [{
        id: fileData.name || 'attachment-0',
        type: (fileData.type?.startsWith('image/') ? 'image'
          : fileData.type?.startsWith('audio/') ? 'audio'
          : fileData.type?.startsWith('video/') ? 'video'
          : 'document') as import('@/lib/ucol/routing/types').UcolAttachmentType,
        mimeType: fileData.type,
        metadata: { filename: fileData.name, sizeBytes: fileData.base64Data.length },
      }] : [],
    },
    context: resolvedContext.ucolContext,
    agentMode: operatingProfileResolvedMode as any,
    signals: {
      hasAttachments: !!(fileData && fileData.base64Data),
      messageHistoryCount: messagesLength,
      profile: effectiveProfile,
    }
  });

  console.log(`[UCOL Gateway] Code API Routing Intent: ${routingDecision.intent.category} (Confidence: ${routingDecision.intent.confidence}, Urgency: ${routingDecision.intent.urgency})`);

  const preferredModelRef = routingDecision.providerPlan?.preferredModelRefs?.[0];
  if (preferredModelRef && CODE_MODELS[preferredModelRef as keyof typeof CODE_MODELS]) {
      if (routingDecision.intent.confidence > 0.8) {
           modelConfig = CODE_MODELS[preferredModelRef as keyof typeof CODE_MODELS];
      }
  }

  const operatingProfileContext = effectiveProfile
    ? `\n## Coding Runtime Context\nWorkspace: ${effectiveWorkspaceId || 'none'}\nOperating Profile: ${operatingProfileName}\nMode: ${operatingProfileResolvedMode}\nUse this as the active execution context for coding assistance.\n\n---\n`
    : '';

  const baseInstruction = userQuery || `Please analyze the attached file: ${fileData?.name || 'attached file'}`;
  const enhancedPromptText =
    userContextPrompt +
    userProfileContext +
    factContext +
    graphContext +
    searchContext +
    memoryContext +
    workspaceMemoryPrompt +
    githubContext +
    operatingProfileContext +
    baseInstruction;

  const currentUserParts: Part[] = [];
  currentUserParts.push({ text: enhancedPromptText });

  if (fileData && fileData.base64Data && fileData.type) {
    currentUserParts.push({
      inlineData: {
        mimeType: fileData.type,
        data: fileData.base64Data
      }
    });
  }

  // 4. Autonomous Agent Loop
  let responseText = "";

  const harness = new LocalIOHarness(process.cwd());
  await harness.initialize();
  const router = new ToolRouter(harness);

  const MAX_STEPS = 15;
  let stepCount = 0;
  let isComplete = false;

  let currentText = enhancedPromptText;
  let dynamicHistory = [...history];

  const systemInstruction = CODE_SYSTEM_INSTRUCTION_TEXT + "\n\n" + HARNESS_INSTRUCTIONS;

  while (stepCount < MAX_STEPS && !isComplete) {
    stepCount++;

    // Token-aware context management
    let historyTokenCount = dynamicHistory.reduce((acc, msg) => acc + estimateTokenCount(msg.text || msg.parts?.[0]?.text || ''), 0) + estimateTokenCount(currentText);
    const MAX_HISTORY_TOKENS = 8000; // Target token limit for context window
    while (historyTokenCount > MAX_HISTORY_TOKENS && dynamicHistory.length > 2) {
      dynamicHistory.shift();
      historyTokenCount = dynamicHistory.reduce((acc, msg) => acc + estimateTokenCount(msg.text || msg.parts?.[0]?.text || ''), 0) + estimateTokenCount(currentText);
    }

    let stepResponse = "";

    if (modelConfig.provider === 'claude' || modelConfig.provider === 'deepseek') {
      const ProviderClass = modelConfig.provider === 'claude' ? ClaudeProvider : DeepSeekProvider;
      const provider = new ProviderClass();
      
      const chatHistory: ChatMessage[] = dynamicHistory.map((msg: any) => ({
        role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
        text: msg.parts?.[0]?.text || msg.text || ''
      }));

      let msgText = currentText;
      if (fileData && fileData.base64Data && stepCount === 1) {
        try {
          const decoded = Buffer.from(fileData.base64Data, 'base64').toString('utf-8');
          if (!/[\x00-\x08\x0E-\x1F]/.test(decoded.substring(0, 100))) {
            msgText += `\n\n[Attached File: ${fileData.name}]\n\`\`\`${fileData.type || ''}\n${decoded}\n\`\`\``;
          } else {
            msgText += `\n\n[Attached File: ${fileData.name}] (Binary file attached, content omitted for text model)`;
          }
        } catch (e) {
          console.error("Failed to decode file:", e);
        }
      }

      chatHistory.push({ role: 'user', text: msgText });

      const streamResult = await provider.generateStream(chatHistory, systemInstruction, {
        model: modelConfig.modelId,
        maxTokens: modelConfig.maxTokens,
        temperature: modelConfig.provider === 'claude' ? 0.7 : 0.6
      });

      const textDecoder = new TextDecoder();
      const reader = streamResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          stepResponse += textDecoder.decode(value, { stream: true });
        }
        stepResponse += textDecoder.decode();
      } catch (streamError) {
        console.error('[Code API] Stream read error:', streamError);
        if (!stepResponse) throw new Error(`Failed to read response from ${modelConfig.provider}`);
      } finally {
        reader.releaseLock();
      }
    } else {
      // Gemini
      const currentUserParts: Part[] = [];
      currentUserParts.push({ text: currentText });

      if (fileData && fileData.base64Data && fileData.type && stepCount === 1) {
        currentUserParts.push({
          inlineData: {
            mimeType: fileData.type,
            data: fileData.base64Data
          }
        });
      }

      const historyParts = dynamicHistory.map((msg: any) => ({
          role: msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user',
          parts: msg.parts || [{ text: msg.text || '' }]
      }));

      const chat = getGeminiModel(modelConfig.modelId).startChat({
        history: [
          { role: "user", parts: [{ text: systemInstruction }] },
          CODE_GREETING,
          ...historyParts
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.7,
          maxOutputTokens: modelConfig.maxTokens,
        },
      });

      const result = await chat.sendMessage(currentUserParts);
      if (!result.response) {
        throw new Error("No response received from the model.");
      }
      stepResponse = result.response.text();
    }

    responseText += stepResponse + "\n";

    const toolCallMatch = stepResponse.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
    if (toolCallMatch) {
      try {
        const toolCallJson = JSON.parse(toolCallMatch[1]);
        if (toolCallJson.tool === 'mark_task_complete') {
          isComplete = true;
          responseText += `\nTask marked complete: ${toolCallJson.args?.reason || ''}`;
          break;
        }

        const result = await router.dispatch(toolCallJson.tool, toolCallJson.args);
        const resultStr = JSON.stringify(result);
        
        dynamicHistory.push({ role: 'user', text: currentText });
        dynamicHistory.push({ role: 'assistant', text: stepResponse });
        
        currentText = `Tool execution result for ${toolCallJson.tool}:\n<tool_result>\n${resultStr}\n</tool_result>\nWhat is your next step?`;
      } catch (err: any) {
        dynamicHistory.push({ role: 'user', text: currentText });
        dynamicHistory.push({ role: 'assistant', text: stepResponse });
        currentText = `Failed to parse tool call or execute tool: ${err.message}\nPlease ensure you output valid JSON inside <tool_call> tags.`;
      }
    } else {
      isComplete = true;
    }
  }

  return {
    responseText,
    modelConfig,
    routingDecision,
    intelligentFacts,
    userContext,
  };
}
