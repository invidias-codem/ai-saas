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
    userMessage: string,
    extractedInfo?: { imagePrompt?: string }
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

        // 1. Try to use extracted prompt from intent classifier
        let prompt = extractedInfo?.imagePrompt || '';

        // 2. If no extracted prompt, try regex/parsing from the full message
        // Only strip if the pattern is "generate/create/make [article] image OF/FOR/ABOUT something"
        if (!prompt) {
            const match = userMessage.match(/(generate|create|make|draw|design)\s+(an?\s+)?(image|picture|photo|drawing|logo|icon|gif)\s+(of|for|about|showing|with)\s+(.+)/i);
            if (match && match[5]) {
                prompt = match[5].trim();
            } else {
                // If no match, the entire message might be the prompt (e.g., "a sunset over mountains")
                // But we need to be careful not to use incomplete phrases
                prompt = userMessage.trim();
            }
        }

        console.log('[IMAGE_HANDLER] Raw extracted prompt:', prompt);

        // 3. Clean up prompt and check for generic/vague terms
        // Apply cleaning to ALL prompts regardless of source
        if (prompt) {
            let cleanPrompt = prompt.toLowerCase();

            // Strip leading/trailing quotes
            cleanPrompt = cleanPrompt.replace(/^["']|["']$/g, '').trim();

            // Strip verbs often extracted by mistake
            cleanPrompt = cleanPrompt.replace(/^(generate|create|make|draw|design)\s+/, '').trim();

            // Strip articles
            cleanPrompt = cleanPrompt.replace(/^(an?|the)\s+/, '').trim();

            const genericTerms = ['image', 'picture', 'photo', 'drawing', 'painting', 'art', 'logo', 'icon', 'gif', 'illustration'];

            // Exact match check on cleaned prompt
            if (genericTerms.includes(cleanPrompt) || cleanPrompt === '' || cleanPrompt.length < 3) {
                console.log(`[IMAGE_HANDLER] Prompt '${prompt}' (cleaned: '${cleanPrompt}') is too generic or too short. Asking user.`);
                prompt = ''; // Reset to trigger interactive question
            } else {
                // Use the cleaned prompt for generation
                prompt = cleanPrompt;
                console.log('[IMAGE_HANDLER] Using cleaned prompt:', prompt);
            }
        }

        // 4. If still no valid prompt, ASK the user
        if (!prompt) {
            console.log('[IMAGE_HANDLER] No valid prompt. Asking user for clarification.');
            await setLoadingStatus(config.botToken, channel, threadTs, ''); // Clear status

            await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    channel,
                    thread_ts: threadTs,
                    text: "🎨 What should the image look like? Please give me a specific description (e.g., 'A cyberpunk city at sunset' rather than just 'an image').",
                }),
            });
            return;
        }

        console.log('[IMAGE_HANDLER] Final prompt for generation:', prompt);

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

    } catch (error: any) {
        console.error('[IMAGE_HANDLER] Error in handleImageGeneration:', error);

        let errorMessage = "Sorry, I encountered an error generating the image.";

        // Handle 502/503 Bad Gateway (Replicate or Upstream issue)
        if (error.message && (error.message.includes('502') || error.message.includes('503'))) {
            errorMessage = "⚠️ The image generation service is currently experiencing high support or a temporary glitch (502/503). Please try again in a few moments.";
        } else if (error instanceof Error) {
            errorMessage = `❌ Sorry, I encountered an error: ${error.message}`;
        }

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
                text: errorMessage,
            }),
        });

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');
    }
}
