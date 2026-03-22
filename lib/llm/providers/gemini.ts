
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatMessage, CompletionOptions, LLMProvider, StreamResult } from "../types";
import { sanitizeHistory } from "@/lib/gemini";
import { logger } from "@/lib/logger";

// Lazy initialisation — validate at first use, not at module load.
// Module-level throws break integration tests that import routes without setting env vars.
// The key is validated inside getGenAI() before any network call is made.
let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('[GeminiProvider] GOOGLE_API_KEY is not set. Set it in your environment before starting.');
    }
    _genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return _genAI;
}

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";
const AGENTIC_MODEL = "gemini-3-flash-preview";

export class GeminiProvider implements LLMProvider {
    id = "gemini";
    name = "Google Gemini";

    async generateStream(
        messages: ChatMessage[],
        systemInstruction?: string,
        options: CompletionOptions = {}
    ): Promise<StreamResult> {
        const modelId = options.model || DEFAULT_MODEL;

        logger.debug(`[Gemini] Generating with model: ${modelId}, messages: ${messages.length}`);

        // Convert internal message format to Gemini format
        // Convert internal message format to Gemini format
                const history = messages.map(msg => {
            const parts: any[] = [];
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
            } else if (parts.length === 0) {
                parts.push({ text: "" });
            }

            if (msg.attachments) {
                msg.attachments.forEach((att: { mimeType: any; base64Data: any; }) => {
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

        const { sanitizedHistory, prependToPrompt } = sanitizeHistory(history);

        let textPartIndex = lastMessage.parts.findIndex((p: any) => p.text !== undefined);
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
                            if ((part as any).thoughtSignature) {
                                controller.enqueue(textEncoder.encode(`\n<thought_signature>${(part as any).thoughtSignature}</thought_signature>\n`));
                            }
                            if ((part as any).thought) {
                                controller.enqueue(textEncoder.encode(`<thought>${(part as any).thought}</thought>`));
                            }
                            if (part.text) {
                                controller.enqueue(textEncoder.encode(part.text));
                            }
                        }
                    } else {
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
