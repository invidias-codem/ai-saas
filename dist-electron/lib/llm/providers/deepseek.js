"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("@/lib/logger");
const DEEPSEEK_MODEL_ID = "deepseek-r1"; // Or specific version if needed
class DeepSeekProvider {
    id = "deepseek";
    name = "DeepSeek R1 (Vertex AI)";
    getAuthToken() {
        // TODO: Implement proper auth token retrieval for Vertex AI
        // For now, we'll try to use the simple API Key if supported or fallback to GCLOUD auth
        // In a real implementation, we should use GoogleAuth library to get an access token
        return process.env.GCP_ACCESS_TOKEN || "";
    }
    getEndpoint(project, location) {
        // Vertex AI Model Garden endpoint for DeepSeek (MaaS)
        // Usually OpenAI-compatible endpoint
        return `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;
    }
    async generateStream(messages, systemInstruction, options = {}) {
        const project = process.env.GCP_PROJECT || 'genie-ai-1ca85';
        const location = process.env.GCP_LOCATION || 'us-central1';
        // Prepare messages
        const formattedMessages = messages.map(msg => ({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.text
        }));
        if (systemInstruction) {
            formattedMessages.unshift({ role: 'system', content: systemInstruction });
        }
        const payload = {
            model: DEEPSEEK_MODEL_ID,
            messages: formattedMessages,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature || 0.6,
            stream: true
        };
        try {
            const { GoogleAuth } = await Promise.resolve().then(() => __importStar(require('google-auth-library')));
            const auth = new GoogleAuth({
                scopes: 'https://www.googleapis.com/auth/cloud-platform'
            });
            const client = await auth.getClient();
            const accessToken = (await client.getAccessToken()).token;
            if (!accessToken) {
                throw new Error("Failed to obtain GCP access token.");
            }
            const response = await axios_1.default.post(this.getEndpoint(project, location), payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                responseType: 'stream'
            });
            return {
                stream: new ReadableStream({
                    start(controller) {
                        const encoder = new TextEncoder(); // Define encoder here
                        response.data.on('data', (chunk) => {
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
                                    }
                                    catch (e) {
                                        // Ignore parse errors for partial chunks
                                    }
                                }
                            }
                        });
                        response.data.on('end', () => {
                            try {
                                controller.close();
                            }
                            catch (e) {
                                // Controller might already be closed
                            }
                        });
                        response.data.on('error', (err) => {
                            controller.error(err);
                        });
                    }
                }),
                debug: { model: DEEPSEEK_MODEL_ID }
            };
        }
        catch (error) {
            logger_1.logger.error('[DeepSeek] Error generating stream', error);
            throw new Error(`DeepSeek generation failed: ${error.message}`);
        }
    }
}
exports.DeepSeekProvider = DeepSeekProvider;
