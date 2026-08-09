/**
 * Unified Image Generation Service
 * Supports multiple providers with automatic fallback
 */

import Replicate from "replicate";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN || '',
});

export type ImageModel = 'flux-schnell' | 'sdxl' | 'playground-v2.5';

export interface ImageGenerationOptions {
    prompt: string;
    model?: ImageModel;
    aspectRatio?: string;
    numOutputs?: number;
}

export interface ImageGenerationResult {
    urls: string[];
    model: ImageModel;
    success: boolean;
    error?: string;
}

// Model configurations
const MODEL_CONFIGS = {
    'flux-schnell': {
        name: 'Flux Schnell',
        replicateModel: 'black-forest-labs/flux-schnell',
        speed: 'Fast (5-10s)',
        quality: 'Excellent',
        description: 'High-quality general purpose model',
    },
    'sdxl': {
        name: 'Stable Diffusion XL',
        replicateModel: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
        speed: 'Medium (10-20s)',
        quality: 'Very Good',
        description: 'Reliable and detailed images',
    },
    'playground-v2.5': {
        name: 'Playground v2.5',
        replicateModel: 'playgroundai/playground-v2.5-1024px-aesthetic:a45f82a1382bed5c7aeb861dac7c7d191b0fdf74d8d57c4a0e6ed7d4d0bf7d24',
        speed: 'Very Fast (3-5s)',
        quality: 'Good',
        description: 'Quick iterations and testing',
    },
} as const;

/**
 * Generate image with specified model
 */
async function generateWithModel(
    model: ImageModel,
    options: ImageGenerationOptions
): Promise<string[]> {
    const config = MODEL_CONFIGS[model];
    const { prompt, aspectRatio = "1:1", numOutputs = 1 } = options;

    console.log(`[IMAGE_GEN] Generating with ${config.name}:`, { prompt, aspectRatio });

    const output = await replicate.run(config.replicateModel, {
        input: {
            prompt,
            aspect_ratio: aspectRatio,
            num_outputs: numOutputs,
            output_format: "jpg",
            output_quality: 90,
        },
    });

    console.log('[IMAGE_GEN] Raw Replicate output type:', typeof output, Array.isArray(output) ? 'array' : typeof output === 'object' ? 'object' : 'other');
    if (typeof output === 'object' && output !== null) {
        console.log('[IMAGE_GEN] Raw Replicate output keys:', Object.keys(output));
        console.log('[IMAGE_GEN] Raw Replicate output preview:', JSON.stringify(output).slice(0, 500));
    }

    const outputArray = Array.isArray(output) ? output : [output];
    const urls: string[] = [];

    for (const item of outputArray) {
        let resolved: string | undefined;

        if (typeof item === 'string') {
            resolved = item;
        } else if (item && typeof item === 'object') {
            const candidate = item as any;

            if (typeof candidate.url === 'function') {
                resolved = candidate.url().toString();
            } else {
                resolved = candidate.url ?? candidate.href ?? candidate.uri ?? candidate.src ?? candidate.file;
            }
        }

        if (!resolved || !/^https?:\/\//.test(resolved)) {
            const preview = typeof item === 'object' ? JSON.stringify(item).slice(0, 200) : String(item).slice(0, 200);
            throw new Error(`Replicate returned an unsupported image output and Slack requires an HTTPS image URL. Output: ${preview}`);
        }

        urls.push(resolved);
    }

    return urls;
}

/**
 * Generate image with automatic fallback
 */
export async function generateImage(
    options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
    const primaryModel = options.model || (process.env.IMAGE_MODEL_PRIMARY as ImageModel) || 'flux-schnell';
    const allModels: ImageModel[] = ['sdxl', 'playground-v2.5'];
    const fallbackModels = allModels.filter(m => m !== primaryModel);

    // Try primary model
    try {
        const urls = await generateWithModel(primaryModel, options);
        console.log(`[IMAGE_GEN] Success with ${primaryModel}`);
        return {
            urls,
            model: primaryModel,
            success: true,
        };
    } catch (error: any) {
        console.error(`[IMAGE_GEN] ${primaryModel} failed:`, error.message);

        // Check if it's a 502/503 error
        const is502Error = error.message?.includes('502') || error.message?.includes('503');

        if (!is502Error) {
            // If not a gateway error, don't try fallback
            throw error;
        }

        // Try fallback models
        for (const fallbackModel of fallbackModels) {
            try {
                console.log(`[IMAGE_GEN] Trying fallback: ${fallbackModel}`);
                const urls = await generateWithModel(fallbackModel, options);
                console.log(`[IMAGE_GEN] Success with fallback ${fallbackModel}`);
                return {
                    urls,
                    model: fallbackModel,
                    success: true,
                };
            } catch (fallbackError: any) {
                console.error(`[IMAGE_GEN] ${fallbackModel} also failed:`, fallbackError.message);
                continue;
            }
        }

        // All models failed
        throw new Error(`All image generation models are currently unavailable. Please try again later.`);
    }
}

/**
 * Get available models and their status
 */
export function getAvailableModels() {
    return Object.entries(MODEL_CONFIGS).map(([key, config]) => ({
        id: key as ImageModel,
        name: config.name,
        speed: config.speed,
        quality: config.quality,
        description: config.description,
    }));
}

/**
 * Get model configuration
 */
export function getModelConfig(model: ImageModel) {
    return MODEL_CONFIGS[model];
}
