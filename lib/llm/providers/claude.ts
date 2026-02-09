import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return new Anthropic({ apiKey });
}

const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";

export class ClaudeProvider implements LLMProvider {
    id = "claude";
    name = "Anthropic Claude";

    async generateStream(
        messages: ChatMessage[],
        systemInstruction?: string,
        options: CompletionOptions = {}
    ): Promise<StreamResult> {
        const modelId = options.model || DEFAULT_MODEL;

        logger.debug(`[Claude] Generating with model: ${modelId}, messages: ${messages.length}`);

        // Convert to Anthropic format
        // Anthropic expects roles: 'user' | 'assistant'
        const anthropicMessages = messages.map(msg => {
            const content: any[] = [{ type: 'text', text: msg.text }];
            if (msg.attachments) {
                msg.attachments.forEach((att: { mimeType: string; base64Data: string; name?: string; }) => {
                    if (att.mimeType.startsWith('image/')) {
                        content.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: att.mimeType as any,
                                data: att.base64Data
                            }
                        });
                    } else {
                        // Text file fallback
                        const text = Buffer.from(att.base64Data, 'base64').toString('utf-8');
                        content.push({
                            type: 'text',
                            text: `\n[Attachment: ${att.name || 'file'}]\n${text}\n`
                        });
                    }
                });
            }
            return {
                role: (msg.role === 'model' || msg.role === 'assistant' || msg.role === 'bot') ? 'assistant' : 'user',
                content
            };
        }) as Anthropic.MessageParam[];

        const anthropic = getAnthropicClient();
        const result = await anthropic.messages.create({
            model: modelId,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature,
            system: systemInstruction,
            messages: anthropicMessages,
            stream: true,
        });

        const textEncoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of result) {
                    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                        controller.enqueue(textEncoder.encode(chunk.delta.text));
                    }
                }
                controller.close();
            }
        });

        return {
            stream,
            debug: { model: modelId }
        };
    }
}
