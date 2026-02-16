
import { z } from "zod";

export interface Attachment {
    name?: string;
    mimeType: string;
    base64Data: string;
}

export const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant", "system", "model", "bot"]),
    text: z.string(),
    attachments: z.array(z.object({
        name: z.string().optional(),
        mimeType: z.string(),
        base64Data: z.string()
    })).optional()
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export type AgentMode = 'standard' | 'quality' | 'agentic-preview' | 'reasoning';

export type CodeAgentMode = 'fast' | 'quality' | 'agentic';

export interface CodeModelConfig {
    id: string;
    name: string;
    provider: 'gemini' | 'claude';
    modelId: string;
    description: string;
    maxTokens: number;
    supportsCodeExecution?: boolean;
}

export interface CompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    stream?: boolean;
}

export interface StreamResult {
    stream: ReadableStream;
    debug?: any;
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
