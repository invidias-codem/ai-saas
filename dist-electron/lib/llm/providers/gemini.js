"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const generative_ai_1 = require("@google/generative-ai");
const gemini_1 = require("@/lib/gemini");
const logger_1 = require("@/lib/logger");
// Lazy initialisation — validate at first use, not at module load.
// Module-level throws break integration tests that import routes without setting env vars.
// The key is validated inside getGenAI() before any network call is made.
let _genAI = null;
function getGenAI() {
    if (!_genAI) {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('[GeminiProvider] GOOGLE_API_KEY is not set. Set it in your environment before starting.');
        }
        _genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    }
    return _genAI;
}
const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const AGENTIC_MODEL = "gemini-3-flash-preview";
class GeminiProvider {
    id = "gemini";
    name = "Google Gemini";
    async generateStream(messages, systemInstruction, options = {}) {
        const modelId = options.model || DEFAULT_MODEL;
        logger_1.logger.debug(`[Gemini] Generating with model: ${modelId}, messages: ${messages.length}`);
        // Convert internal message format to Gemini format
        // Convert internal message format to Gemini format
        const history = messages.map(msg => {
            const parts = [];
            let textToProcess = msg.text;
            // Extract thought signatures
            const signatureRegex = /<thought_signature>([\s\S]*?)<\/thought_signature>/g;
            let match;
            while ((match = signatureRegex.exec(textToProcess)) !== null) {
                parts.push({ thoughtSignature: match[1].trim() });
            }
            let remainingText = textToProcess.replace(signatureRegex, '').trim();
            if (remainingText) {
                parts.push({ text: remainingText });
            }
            else if (parts.length === 0) {
                parts.push({ text: "" });
            }
            if (msg.attachments) {
                msg.attachments.forEach((att) => {
                    parts.push({
                        inlineData: {
                            mimeType: att.mimeType,
                            data: att.base64Data
                        }
                    });
                });
            }
            return {
                role: (msg.role === 'assistant' || msg.role === 'model' || msg.role === 'bot') ? 'model' : 'user',
                parts
            };
        });
        // Handle System Instruction (Gemini supports it natively or via prepend)
        // For agentic, we might need to be explicit
        // But verify sanitizeHistory handles prepending if needed
        // We need to pop the last message as the "prompt"
        const lastMessage = history.pop();
        if (!lastMessage || lastMessage.role !== 'user') {
            throw new Error("Gemini requires the last message to be from the user.");
        }
        const model = getGenAI().getGenerativeModel({
            model: modelId,
            systemInstruction: systemInstruction ? {
                role: 'user',
                parts: [{ text: systemInstruction }]
            } : undefined
        });
        const { sanitizedHistory, prependToPrompt } = (0, gemini_1.sanitizeHistory)(history);
        let textPartIndex = lastMessage.parts.findIndex((p) => p.text !== undefined);
        if (textPartIndex === -1) {
            lastMessage.parts.unshift({ text: "" });
            textPartIndex = 0;
        }
        let promptText = lastMessage.parts[textPartIndex].text;
        if (prependToPrompt) {
            promptText = prependToPrompt + "\n\n" + promptText;
        }
        lastMessage.parts[textPartIndex].text = promptText;
        const chat = model.startChat({
            history: sanitizedHistory,
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens,
                topP: options.topP,
                topK: options.topK,
            }
        });
        const result = await chat.sendMessageStream(lastMessage.parts);
        const textEncoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of result.stream) {
                    if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            if (part.thoughtSignature) {
                                controller.enqueue(textEncoder.encode(`\n<thought_signature>${part.thoughtSignature}</thought_signature>\n`));
                            }
                            if (part.thought) {
                                controller.enqueue(textEncoder.encode(`<thought>${part.thought}</thought>`));
                            }
                            if (part.text) {
                                controller.enqueue(textEncoder.encode(part.text));
                            }
                        }
                    }
                    else {
                        const chunkText = chunk.text();
                        if (chunkText) {
                            controller.enqueue(textEncoder.encode(chunkText));
                        }
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
exports.GeminiProvider = GeminiProvider;
