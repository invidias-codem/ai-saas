/**
 * Image Generation Handler for Slack
 * Uses Replicate (Flux) to generate images from text prompts
 */

import Replicate from "replicate";
import { SlackConfig } from '@/lib/slack';

const SLACK_API_BASE = 'https://slack.com/api';

// Initialize Replicate
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN || '',
});

// Use Flux for high-quality image generation
const IMAGE_MODEL = "black-forest-labs/flux-schnell";

interface ImageGenerationOptions {
    prompt: string;
    aspectRatio?: string;
    numOutputs?: number;
}

/**
 * Generate image using Replicate Flux model
 */
async function generateImage(options: ImageGenerationOptions): Promise<string[]> {
    const { prompt, aspectRatio = "1:1", numOutputs = 1 } = options;

    console.log('[IMAGE_HANDLER] Generating image with Flux:', { prompt, aspectRatio });

    try {
        const output = await replicate.run(IMAGE_MODEL, {
            input: {
                prompt,
                aspect_ratio: aspectRatio,
                num_outputs: numOutputs,
                output_format: "jpg",
                output_quality: 90,
            },
        }) as string[];

        console.log('[IMAGE_HANDLER] Generated', output.length, 'images');
        return Array.isArray(output) ? output : [output as any];

    } catch (error) {
        console.error('[IMAGE_HANDLER] Error generating image:', error);
        throw error;
    }
}

/**
 * Send image to Slack channel
 */
async function sendImageToSlack(
    botToken: string,
    channel: string,
    imageUrl: string,
    caption: string,
    threadTs?: string
): Promise<void> {
    try {
        // Post message with image
        const payload: any = {
            channel,
            text: caption,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: caption,
                    },
                },
                {
                    type: "image",
                    image_url: imageUrl,
                    alt_text: caption,
                },
            ],
        };

        if (threadTs) {
            payload.thread_ts = threadTs;
        }

        const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('[IMAGE_HANDLER] Failed to send image to Slack:', data.error);
            throw new Error(data.error);
        }

        console.log('[IMAGE_HANDLER] Image sent to Slack successfully');

    } catch (error) {
        console.error('[IMAGE_HANDLER] Error sending image to Slack:', error);
        throw error;
    }
}

/**
 * Set loading status in Slack
 */
async function setLoadingStatus(
    botToken: string,
    channel: string,
    threadTs: string,
    message: string
): Promise<void> {
    try {
        await fetch(`${SLACK_API_BASE}/assistant.threads.setStatus`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_id: channel,
                thread_ts: threadTs,
                status: message,
            }),
        });
    } catch (error) {
        console.error('[IMAGE_HANDLER] Error setting status:', error);
    }
}

/**
 * Main handler for image generation requests
 */
export async function handleImageGeneration(
    config: SlackConfig,
    event: any,
    userMessage: string
): Promise<void> {
    const { channel, ts, thread_ts } = event;
    const threadTs = thread_ts || ts;

    console.log('[IMAGE_HANDLER] Handling image generation request');

    try {
        // Set loading status
        await setLoadingStatus(
            config.botToken,
            channel,
            threadTs,
            '🎨 Generating your image...'
        );

        // Extract prompt from user message (remove common trigger words)
        const prompt = userMessage
            .replace(/(generate|create|make|draw|design)\s+(an?\s+)?(image|picture|photo|drawing|logo|icon|gif)\s+(of|for|about|showing)?\s*/gi, '')
            .trim();

        if (!prompt) {
            throw new Error('No image prompt provided');
        }

        console.log('[IMAGE_HANDLER] Extracted prompt:', prompt);

        // Generate image
        const imageUrls = await generateImage({ prompt });

        // Send image to Slack
        for (const imageUrl of imageUrls) {
            await sendImageToSlack(
                config.botToken,
                channel,
                imageUrl,
                `🎨 *Generated Image:* "${prompt}"`,
                threadTs
            );
        }

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');

        console.log('[IMAGE_HANDLER] Image generation complete');

    } catch (error) {
        console.error('[IMAGE_HANDLER] Error in handleImageGeneration:', error);

        // Send error message
        await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel,
                thread_ts: threadTs,
                text: `❌ Sorry, I encountered an error generating the image: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }),
        });

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');
    }
}
