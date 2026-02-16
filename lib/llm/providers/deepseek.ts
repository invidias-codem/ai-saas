
import axios from 'axios';
import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

const DEEPSEEK_MODEL_ID = "deepseek-r1"; // Or specific version if needed

export class DeepSeekProvider implements LLMProvider {
    id = "deepseek";
    name = "DeepSeek R1 (Vertex AI)";

    private getAuthToken(): string {
        // TODO: Implement proper auth token retrieval for Vertex AI
        // For now, we'll try to use the simple API Key if supported or fallback to GCLOUD auth
        // In a real implementation, we should use GoogleAuth library to get an access token
        return process.env.GCP_ACCESS_TOKEN || "";
    }

    private getEndpoint(project: string, location: string): string {
        // Vertex AI Model Garden endpoint for DeepSeek (MaaS)
        // Usually OpenAI-compatible endpoint
        return `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;
    }

    async generateStream(
        messages: ChatMessage[],
        systemInstruction?: string,
        options: CompletionOptions = {}
    ): Promise<StreamResult> {
        const project = process.env.GCP_PROJECT || 'genie-ai-1ca85';
        const location = process.env.GCP_LOCATION || 'us-central1';

        // Prepare messages
        const formattedMessages = messages.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.text
        }));

        if (systemInstruction) {
            formattedMessages.unshift({ role: 'system', content: systemInstruction } as any);
        }

        const payload = {
            model: DEEPSEEK_MODEL_ID,
            messages: formattedMessages,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature || 0.6,
            stream: true
        };

        try {
            // We need a way to get a valid access token. 
            // Since we don't have the GoogleAuth lib imported here yet, we'll assume an env var or implement a simple fetch if possible.
            // For this implementation plan, we'll wrap the axios call.

            // NOTE: In production, use GoogleAuth to fetch the token dynamically.
            const accessToken = this.getAuthToken();

            const response = await axios.post(
                this.getEndpoint(project, location),
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    responseType: 'stream'
                }
            );

            const stream = new ReadableStream({
                async start(controller) {
                    const textEncoder = new TextEncoder();

                    response.data.on('data', (chunk: Buffer) => {
                        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                        for (const line of lines) {
                            if (line.includes('[DONE]')) return;
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));
                                    const content = data.choices[0]?.delta?.content || '';
                                    const reasoning = data.choices[0]?.delta?.reasoning_content || ''; // DeepSeek specific field?

                                    // DeepSeek R1 often puts reasoning in the content wrapped in tags, or separate field.
                                    // If it's separate, we append it. If it's in content, we just pass typical content.
                                    // We'll pass both if present.

                                    if (reasoning) {
                                        controller.enqueue(textEncoder.encode(`<thought>${reasoning}</thought>`));
                                    }
                                    if (content) {
                                        controller.enqueue(textEncoder.encode(content));
                                    }
                                } catch (e) {
                                    // Ignore parse errors for partial chunks
                                }
                            }
                        }
                    });

                    response.data.on('end', () => {
                        controller.close();
                    });

                    response.data.on('error', (err: any) => {
                        controller.error(err);
                    });
                }
            });

            return {
                stream,
                debug: { model: DEEPSEEK_MODEL_ID }
            };

        } catch (error: any) {
            logger.error('[DeepSeek] Error generating stream', error);
            throw new Error(`DeepSeek generation failed: ${error.message}`);
        }
    }
}
