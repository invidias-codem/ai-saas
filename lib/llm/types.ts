
import { z } from "zod";

export interface Attachment {
    name?: string;
    mimeType: string;
    base64Data?: string;
    fileUri?: string;
}

export const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant", "system", "model", "bot"]),
    text: z.string(),
    attachments: z.array(z.object({
        name: z.string().optional(),
        mimeType: z.string(),
        base64Data: z.string().optional(),
        fileUri: z.string().optional()
    })).optional()
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * UCOL Conversation Engine — Agent Mode Definitions
 *
 * fast     → Hermes3 (Ollama local) / fallback: Gemini Flash-Lite
 *            Low latency, zero API cost, great for quick Q&A and iteration.
 *
 * quality  → Gemini Pro
 *            Best reasoning, analysis, and structured output. Full memory context.
 *
 * agentic  → Claude (Sonnet)
 *            Autonomous multi-step execution. Access to tools: web search,
 *            research paper writing, novel/creative writing, and more.
 *            Powered by ReAct loop with approval gates for destructive actions.
 */
export type AgentMode = 'fast' | 'quality' | 'agentic' | 'reasoning';

export type CodeAgentMode = 'fast' | 'quality' | 'agentic';

export interface CodeModelConfig {
    id: string;
    name: string;
    provider: 'gemini' | 'claude' | 'deepseek' | 'hermes' | 'openrouter';
    modelId: string;
    description: string;
    maxTokens: number;
    supportsCodeExecution?: boolean;
    supportsArtifacts?: boolean;
}

export interface CompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    stream?: boolean;
    signal?: AbortSignal;
    responseMimeType?: string;
}

export interface StreamResult {
    stream: ReadableStream;
    debug?: any;
    thoughtSignaturePromise?: Promise<string | null>;
}

export interface LLMProvider {
    id: string;
    name: string;

    generateStream(
        messages: ChatMessage[],
        systemInstruction?: string,
        options?: CompletionOptions
    ): Promise<StreamResult>;
}
