import { estimateTokenCount } from '@/lib/ragMemory';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { HermesProvider } from '@/lib/llm/providers/hermes';
import { ChatMessage } from '@/lib/llm/types';
import { HarnessFactory } from '@/lib/harness/IOHarness';
import { ToolRouter } from '@/lib/harness/ToolRouter';
import { searchCodebaseTool } from '@/lib/agents/tools/searchCodebase';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { pruneHistory } from '@/lib/context/HistoryPruner';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

export interface AgentExecutorParams {
    enhancedPromptText: string;
    dynamicHistory: any[];
    modelConfig: typeof CODE_MODELS[keyof typeof CODE_MODELS];
    fileData?: { name?: string; type?: string; base64Data: string; mimeType?: string };
    systemInstruction: string;
    providerKeys?: ProviderApiKeys;
}

export async function executeAgentLoop(params: AgentExecutorParams) {
    const { enhancedPromptText, dynamicHistory, modelConfig, fileData, systemInstruction, providerKeys = {} } = params;

    let responseText = "";

    const harness = await HarnessFactory.create({ env: 'local', workspaceRoot: process.cwd() });
    const router = new ToolRouter(harness);

    const MAX_STEPS = 15;
    let stepCount = 0;
    let isComplete = false;

    let currentText = enhancedPromptText;

    while (stepCount < MAX_STEPS && !isComplete) {
      stepCount++;

      // HistoryPruner-backed Context Management
      const prunedHistory = pruneHistory(dynamicHistory, currentText, {
        maxHistoryTokens: 8000,
        estimateTokenFn: estimateTokenCount
      });
      // Synchronize dynamicHistory to preserve the pruned state
      dynamicHistory.length = 0;
      dynamicHistory.push(...prunedHistory);

      let stepResponse = "";

      let ProviderClass;
      if (modelConfig.provider === 'claude') ProviderClass = ClaudeProvider;
      else if (modelConfig.provider === 'deepseek') ProviderClass = DeepSeekProvider;
      else ProviderClass = GeminiProvider;

      const provider = modelConfig.provider === 'claude'
        ? new ClaudeProvider(providerKeys.anthropic)
        : modelConfig.provider === 'gemini'
          ? new GeminiProvider(providerKeys.google)
          : modelConfig.provider === 'hermes'
            ? new HermesProvider({})
            : new ProviderClass();

      const chatHistory: ChatMessage[] = dynamicHistory.map((msg: any) => {
        let attachments;
        const inlineDataPart = msg.parts?.find((p: any) => p.inlineData);
        if (inlineDataPart) {
          attachments = [{
            mimeType: inlineDataPart.inlineData.mimeType,
            base64Data: inlineDataPart.inlineData.data,
            name: 'historical_file'
          }];
        }
        return {
          role: msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user',
          text: msg.parts?.[0]?.text || msg.text || '',
          attachments
        };
      });

      const currentMessage: ChatMessage = { role: 'user', text: currentText };
      if (fileData && fileData.base64Data && stepCount === 1) {
        currentMessage.attachments = [{
          name: fileData.name,
          mimeType: fileData.type || 'text/plain',
          base64Data: fileData.base64Data
        }];
      }
      chatHistory.push(currentMessage);

      let temp = 0.7;
      if (modelConfig.provider === 'deepseek') temp = 0.6;

      const onReasoning = (text: string) => {
        console.log(`[AgenticReasoning] ${String(text).slice(0, 400)}`);
      };

      const streamResult = await provider.generateStream(chatHistory, systemInstruction, {
        model: modelConfig.modelId,
        maxTokens: modelConfig.maxTokens,
        temperature: temp,
        topP: modelConfig.provider === 'gemini' ? 0.7 : undefined,
        topK: modelConfig.provider === 'gemini' ? 40 : undefined,
        onReasoning,
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
        console.error(`[Code API] Stream read error from ${modelConfig.provider}:`, streamError);
        if (!stepResponse) throw new Error(`Failed to read response from ${modelConfig.provider}`);
      } finally {
        reader.releaseLock();
      }

      responseText += stepResponse + "\n";

      const stepResponseClean = stepResponse.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
      const toolCallMatch = stepResponseClean.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
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

    return responseText;
}
