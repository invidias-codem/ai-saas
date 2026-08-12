
import axios from 'axios';
import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

const DEEPSEEK_MODEL_ID = "deepseek-r1"; // Or specific version if needed

export class DeepSeekProvider implements LLMProvider {
    id = "deepseek";
    name = "DeepSeek R1";
    private readonly apiKey?: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
    }

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
            const { GoogleAuth } = await import('google-auth-library');
            const auth = new GoogleAuth({
                scopes: 'https://www.googleapis.com/auth/cloud-platform'
            });
            const client = await auth.getClient();
            const accessToken = (await client.getAccessToken()).token;

            if (!accessToken) {
                throw new Error("Failed to obtain GCP access token.");
            }

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

            return {
                stream: new ReadableStream({
                    start(controller) {
                        const encoder = new TextEncoder(); // Define encoder here
                        response.data.on('data', (chunk: Buffer) => {
                            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                            for (const line of lines) {
                                if (line.includes('[DONE]')) {
                                    controller.close();
                                    return;
                                }
                                if (line.startsWith('data: ')) {
                                    const jsonStr = line.replace('data: ', '');
                                    try {
                                        const data = JSON.parse(jsonStr);
                                        const delta = data.choices[0].delta;

                                        // Handle reasoning content
                                        if (delta.reasoning_content) {
                                            controller.enqueue(encoder.encode(`<thought>${delta.reasoning_content}</thought>`));
                                        }

                                        // Handle regular content
                                        if (delta.content) {
                                            controller.enqueue(encoder.encode(delta.content));
                                        }
                                    } catch (e) {
                                        // Ignore parse errors for partial chunks
                                    }
                                }
                            }
                        });

                        response.data.on('end', () => {
                            try {
                                controller.close();
                            } catch (e) {
                                // Controller might already be closed
                            }
                        });

                        response.data.on('error', (err: any) => {
                            controller.error(err);
                        });
                    }
                }),
                debug: { model: DEEPSEEK_MODEL_ID }
            };

        } catch (error: any) {
            logger.error('[DeepSeek] Error generating stream', error);
            throw new Error(`DeepSeek generation failed: ${error.message}`);
        }
    }
}
