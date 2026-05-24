"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeProvider = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const logger_1 = require("@/lib/logger");
function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    return new sdk_1.default({ apiKey });
}
const DEFAULT_MODEL = "claude-sonnet-4-6";
class ClaudeProvider {
    id = "claude";
    name = "Anthropic Claude";
    async generateStream(messages, systemInstruction, options = {}) {
        const modelId = options.model || DEFAULT_MODEL;
        logger_1.logger.debug(`[Claude] Generating with model: ${modelId}, messages: ${messages.length}`);
        // Convert to Anthropic format
        // Anthropic expects roles: 'user' | 'assistant'
        const anthropicMessages = messages.map(msg => {
            const content = [{ type: 'text', text: msg.text }];
            if (msg.attachments) {
                msg.attachments.forEach((att) => {
                    if (att.mimeType.startsWith('image/')) {
                        content.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: att.mimeType,
                                data: att.base64Data
                            }
                        });
                    }
                    else {
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
        });
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
exports.ClaudeProvider = ClaudeProvider;
