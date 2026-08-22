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

// Model configurations — version-pinned for reproducibility
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
 * Attempt to extract an HTTPS URL from a Replicate output item.
 * Handles: string URLs, objects with .url() method, objects with .url/.href/.uri/.src/.file,
 * and arrays containing any of the above.
 */
function extractUrlFromItem(item: any): string | undefined {
    if (!item) return undefined;

    // Direct string URL
    if (typeof item === 'string') {
        return /^https?:\/\//.test(item) ? item : undefined;
    }

    // ReadableStream / Blob — not directly usable as URL
    if (typeof item !== 'object') return undefined;

    // Replicate File object with .url() method
    if (typeof item.url === 'function') {
        try {
            const u = item.url().toString();
            return /^https?:\/\//.test(u) ? u : undefined;
        } catch { /* fall through */ }
    }

    // Object with URL-like properties
    const candidate = item.url ?? item.href ?? item.uri ?? item.src ?? item.file;
    if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) {
        return candidate;
    }

    // Nested output property (some models wrap result)
    if (item.output) {
        const nested = extractUrlFromItem(item.output);
        if (nested) return nested;
    }

    // Array of URLs mixed with metadata
    if (Array.isArray(item)) {
        for (const sub of item) {
            const u = extractUrlFromItem(sub);
            if (u) return u;
        }
    }

    return undefined;
}

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
    if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
        console.log('[IMAGE_GEN] Raw Replicate output keys:', Object.keys(output));
        console.log('[IMAGE_GEN] Raw Replicate output preview:', JSON.stringify(output).slice(0, 500));
    }

    // Normalize output to array
    let outputArray: any[];
    if (Array.isArray(output)) {
        outputArray = output;
    } else if (output && typeof output === 'object') {
        // Some models wrap output in an object — cast to any for property access
        const out = output as any;
        outputArray = out.output ? (Array.isArray(out.output) ? out.output : [out.output]) : [output];
    } else {
        outputArray = [output];
    }

    const urls: string[] = [];

    for (const item of outputArray) {
        const resolved = extractUrlFromItem(item);

        if (!resolved) {
            const preview = typeof item === 'object' ? JSON.stringify(item).slice(0, 200) : String(item).slice(0, 200);
            throw new Error(`Replicate returned unsupported image output (expected HTTPS URL). Output: ${preview}`);
        }

        urls.push(resolved);
    }

    if (urls.length === 0) {
        throw new Error(`Replicate returned no image URLs. Raw output: ${JSON.stringify(output).slice(0, 200)}`);
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
    const allModels: ImageModel[] = ['flux-schnell', 'sdxl', 'playground-v2.5'];
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

        // Try fallback models on ANY error (null output, wrong format, rate limit, etc.)
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
