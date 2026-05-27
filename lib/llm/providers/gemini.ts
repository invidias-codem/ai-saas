import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatMessage, CompletionOptions, LLMProvider, StreamResult } from "../types";
import { sanitizeHistory } from "@/lib/gemini";
import { logger } from "@/lib/logger";
import { getStorageClient, getStorageProjectId } from '@/lib/gcp/storage';

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

const DEFAULT_MODEL = "gemini-2.5-flash";
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
        const history = [];
        for (const msg of messages) {
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
                for (const att of msg.attachments) {
                    if (att.fileUri && att.fileUri.startsWith('gs://')) {
                        // AI Studio doesn't accept gs:// URIs natively, so we fetch and inline it
                        const storage = getStorageClient();
                        const projectId = getStorageProjectId();
                        const bucketName = `genie-uploads-${projectId}`;
                        const filePath = att.fileUri.replace(`gs://${bucketName}/`, '');
                        const unsupportedMimeTypes = [
                            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                            'application/vnd.apple.pages', 'application/vnd.apple.numbers', 'application/vnd.apple.keynote',
                            'application/rtf', 'text/rtf', 'text/vcard'
                        ];

                        if (unsupportedMimeTypes.includes(att.mimeType)) {
                            parts.push({
                                text: `\n[Attached Document: ${att.name || 'file'}] (Binary format not natively supported by this model. To analyze, convert to PDF or extract text first.)\n`
                            });
                        } else {
                            try {
                                const [fileContents] = await storage.bucket(bucketName).file(filePath).download();
                                parts.push({
                                    inlineData: {
                                        mimeType: att.mimeType,
                                        data: fileContents.toString('base64')
                                    }
                                });
                            } catch (e) {
                                logger.error(`[Gemini] Failed to download GCS attachment: ${att.fileUri}`, e);
                            }
                        }
                    } else if (att.base64Data) {
                        parts.push({
                            inlineData: {
                                mimeType: att.mimeType,
                                data: att.base64Data
                            }
                        });
                    }
                }
            }
            history.push({
                role: (msg.role === 'assistant' || msg.role === 'model' || msg.role === 'bot') ? 'model' : 'user',
                parts
            });
        }

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

        let capturedSignature: string | null = null;
        let resolveSignature!: (v: string | null) => void;
        const thoughtSignaturePromise = new Promise<string | null>(r => { resolveSignature = r; });

        const stream = new ReadableStream({
            async start(controller) {
                for await (const chunk of result.stream) {
                    if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            if ((part as any).thoughtSignature) {
                                // Capture silently — do not enqueue to the text stream
                                capturedSignature = (part as any).thoughtSignature;
                            } else if ((part as any).thought) {
                                controller.enqueue(textEncoder.encode(`<thought>${(part as any).thought}</thought>`));
                            } else if (part.text) {
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
                resolveSignature(capturedSignature); // Resolve only after stream fully drains
            }
        });

        return {
            stream,
            debug: { model: modelId },
            thoughtSignaturePromise,
        };
    }
}
