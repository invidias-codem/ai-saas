/**
 * Image Generation Handler for Slack
 * Uses Replicate (Flux) to generate images from text prompts
 */

import { SlackConfig } from '@/lib/slack';
import { supabase } from '@/lib/supabaseClient';
import { generateImage, ImageModel } from '@/lib/imageGeneration';
import { logger } from '@/lib/logger';

const SLACK_API_BASE = 'https://slack.com/api';


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
                    title: {
                        type: "plain_text",
                        text: caption.length > 100 ? caption.slice(0, 97) + '...' : caption,
                    },
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
            logger.error('[IMAGE_HANDLER] Failed to send image to Slack:', data.error);
            logger.error('[IMAGE_HANDLER] Slack response payload:', JSON.stringify(data).slice(0, 2000));
            logger.error('[IMAGE_HANDLER] Image payload caption:', caption);
            logger.error('[IMAGE_HANDLER] Image payload image_url:', imageUrl);
            throw new Error(data.error);
        }

        logger.info('[IMAGE_HANDLER] Image sent to Slack successfully');

    } catch (error) {
        logger.error('[IMAGE_HANDLER] Error sending image to Slack:', error);
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
        logger.error('[IMAGE_HANDLER] Error setting status:', error);
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

    logger.info('[IMAGE_HANDLER] Handling image generation request');

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

        logger.info('[IMAGE_HANDLER] Raw extracted prompt:', prompt);

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
                logger.info(`[IMAGE_HANDLER] Prompt '${prompt}' (cleaned: '${cleanPrompt}') is too generic or too short. Asking user.`);
                prompt = ''; // Reset to trigger interactive question
            } else {
                // Use the cleaned prompt for generation
                prompt = cleanPrompt;
                logger.info('[IMAGE_HANDLER] Using cleaned prompt:', prompt);
            }
        }

        // 5. Final sanitization: remove stray markdown/special chars from prompt before use
        if (prompt) {
            prompt = prompt.replace(/[*`'"]+$/g, '').trim();
        }

        // Build a Slack-safe caption without markdown emphasis
        const caption = `🎨 Generated Image: "${prompt}"`;

        // 4. If still no valid prompt, ASK the user
        if (!prompt) {
            logger.info('[IMAGE_HANDLER] No valid prompt. Asking user for clarification.');
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

        logger.info('[IMAGE_HANDLER] Final prompt for generation:', prompt);

        // Fetch user's preferred model
        let preferredModel: ImageModel | undefined;
        if (config.userId) {
            try {
                const { data } = await supabase
                    .from('user_settings')
                    .select('preferred_image_model')
                    .eq('user_id', config.userId)
                    .single();

                if (data?.preferred_image_model) {
                    preferredModel = data.preferred_image_model as ImageModel;
                    logger.info(`[IMAGE_HANDLER] Using user preference: ${preferredModel}`);
                }
            } catch (err) {
                logger.warn('[IMAGE_HANDLER] Failed to fetch user preference, using default.');
            }
        }

        // Generate image using unified service (handles fallback automatically)
        const result = await generateImage({
            prompt,
            model: preferredModel
        });

        const imageUrls = result.urls;

        // Send image to Slack
        for (const imageUrl of imageUrls) {
            await sendImageToSlack(
                config.botToken,
                channel,
                imageUrl,
                caption,
                threadTs
            );
        }

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');

        logger.info('[IMAGE_HANDLER] Image generation complete');

    } catch (error: any) {
        logger.error('[IMAGE_HANDLER] Error in handleImageGeneration:', error);

        let errorMessage = "Sorry, I encountered an error generating the image.";

        // Handle 502/503 Bad Gateway (Replicate or Upstream issue)
        if (error.message && (error.message.includes('502') || error.message.includes('503'))) {
            errorMessage = "⚠️ The current image generation model is experiencing issues (502/503).\n\n💡 *Try this:* Visit https://gen1e.xyz/image to switch to a different model until this one is back online.";
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
