/**
 * Slide Deck Creation Handler for Slack
 * Uses PptxGenJS to create PowerPoint presentations
 */

import PptxGenJS from "pptxgenjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SlackConfig } from '@/lib/slack';

const SLACK_API_BASE = 'https://slack.com/api';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

interface SlideContent {
    title: string;
    bullets?: string[];
    content?: string;
    layout?: 'title' | 'content' | 'section';
}

interface PresentationStructure {
    title: string;
    subtitle?: string;
    slides: SlideContent[];
}

/**
 * Generate presentation structure using Gemini
 */
async function generatePresentationStructure(topic: string): Promise<PresentationStructure> {
    console.log('[SLIDE_HANDLER] Generating presentation structure for:', topic);

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `Create a professional presentation outline about "${topic}".
  
Return ONLY valid JSON in this exact format:
{
  "title": "Main Title",
  "subtitle": "Optional Subtitle",
  "slides": [
    {
      "title": "Slide Title",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "layout": "content"
    }
  ]
}

Create 5-8 slides with clear, concise content. Use "title" layout for the first slide, "content" for main slides, and "section" for section breaks.`;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in AI response');
        }

        const structure = JSON.parse(jsonMatch[0]) as PresentationStructure;
        console.log('[SLIDE_HANDLER] Generated', structure.slides.length, 'slides');

        return structure;

    } catch (error) {
        console.error('[SLIDE_HANDLER] Error generating structure:', error);
        throw error;
    }
}

/**
 * Create PowerPoint presentation using PptxGenJS
 */
async function createPresentation(structure: PresentationStructure): Promise<Buffer> {
    console.log('[SLIDE_HANDLER] Creating PowerPoint presentation');

    const pptx = new PptxGenJS();

    // Set presentation properties
    pptx.author = 'Genie AI';
    pptx.title = structure.title;
    pptx.subject = structure.subtitle || structure.title;

    // Define color scheme
    const colors = {
        primary: '4A90E2',
        secondary: '7B68EE',
        text: '333333',
        lightText: '666666',
        background: 'FFFFFF',
    };

    // Title Slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: colors.primary };

    titleSlide.addText(structure.title, {
        x: 0.5,
        y: 2.0,
        w: 9.0,
        h: 1.5,
        fontSize: 44,
        bold: true,
        color: colors.background,
        align: 'center',
    });

    if (structure.subtitle) {
        titleSlide.addText(structure.subtitle, {
            x: 0.5,
            y: 3.5,
            w: 9.0,
            h: 0.8,
            fontSize: 24,
            color: colors.background,
            align: 'center',
        });
    }

    titleSlide.addText('Created by Genie AI', {
        x: 0.5,
        y: 5.0,
        w: 9.0,
        h: 0.5,
        fontSize: 14,
        color: colors.background,
        align: 'center',
        italic: true,
    });

    // Content Slides
    for (const slideContent of structure.slides) {
        const slide = pptx.addSlide();

        if (slideContent.layout === 'section') {
            // Section slide (similar to title slide but different color)
            slide.background = { color: colors.secondary };
            slide.addText(slideContent.title, {
                x: 0.5,
                y: 2.5,
                w: 9.0,
                h: 1.5,
                fontSize: 40,
                bold: true,
                color: colors.background,
                align: 'center',
            });
        } else {
            // Regular content slide
            slide.background = { color: colors.background };

            // Title
            slide.addText(slideContent.title, {
                x: 0.5,
                y: 0.5,
                w: 9.0,
                h: 0.8,
                fontSize: 32,
                bold: true,
                color: colors.primary,
            });

            // Content
            if (slideContent.bullets && slideContent.bullets.length > 0) {
                slide.addText(slideContent.bullets.map(b => ({ text: b, options: { bullet: true } })), {
                    x: 0.8,
                    y: 1.5,
                    w: 8.4,
                    h: 4.0,
                    fontSize: 18,
                    color: colors.text,
                    lineSpacing: 24,
                });
            } else if (slideContent.content) {
                slide.addText(slideContent.content, {
                    x: 0.8,
                    y: 1.5,
                    w: 8.4,
                    h: 4.0,
                    fontSize: 18,
                    color: colors.text,
                });
            }
        }
    }

    // Generate buffer
    const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    console.log('[SLIDE_HANDLER] Presentation created, size:', buffer.length, 'bytes');

    return buffer;
}

/**
 * Upload file to Slack using files.uploadV2 API
 * The old files.upload method is deprecated
 */
async function uploadFileToSlack(
    botToken: string,
    channel: string,
    filename: string,
    fileBuffer: Buffer,
    title: string,
    threadTs?: string
): Promise<void> {
    console.log('[SLIDE_HANDLER] Uploading file to Slack using files.uploadV2');

    try {
        // Step 1: Get upload URL
        const getUploadUrlResponse = await fetch(`${SLACK_API_BASE}/files.getUploadURLExternal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: filename,
                length: fileBuffer.length,
            }),
        });

        const uploadUrlData = await getUploadUrlResponse.json();

        if (!uploadUrlData.ok) {
            console.error('[SLIDE_HANDLER] Failed to get upload URL:', uploadUrlData.error);
            throw new Error(uploadUrlData.error);
        }

        const { upload_url, file_id } = uploadUrlData;

        // Step 2: Upload file to the URL
        const uploadResponse = await fetch(upload_url, {
            method: 'POST',
            body: new Uint8Array(fileBuffer),
        });

        if (!uploadResponse.ok) {
            console.error('[SLIDE_HANDLER] Failed to upload file to URL');
            throw new Error('File upload to URL failed');
        }

        // Step 3: Complete the upload
        const completePayload: any = {
            files: [
                {
                    id: file_id,
                    title: title,
                },
            ],
            channel_id: channel,
        };

        if (threadTs) {
            completePayload.thread_ts = threadTs;
        }

        const completeResponse = await fetch(`${SLACK_API_BASE}/files.completeUploadExternal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(completePayload),
        });

        const completeData = await completeResponse.json();

        if (!completeData.ok) {
            console.error('[SLIDE_HANDLER] Failed to complete upload:', completeData.error);
            throw new Error(completeData.error);
        }

        console.log('[SLIDE_HANDLER] File uploaded successfully using files.uploadV2');

    } catch (error) {
        console.error('[SLIDE_HANDLER] Error uploading file:', error);
        throw error;
    }
}

/**
 * Set loading status
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
        console.error('[SLIDE_HANDLER] Error setting status:', error);
    }
}

/**
 * Main handler for slide deck creation
 */
export async function handleSlideCreation(
    config: SlackConfig,
    event: any,
    userMessage: string
): Promise<void> {
    const { channel, ts, thread_ts } = event;
    const threadTs = thread_ts || ts;

    console.log('[SLIDE_HANDLER] Handling slide creation request');

    try {
        // Set loading status
        await setLoadingStatus(
            config.botToken,
            channel,
            threadTs,
            '📊 Creating your slide deck...'
        );

        // Extract topic from user message
        const topic = userMessage
            .replace(/(create|make|generate|build)\s+(a\s+)?(slide\s+deck|presentation|powerpoint|pptx)\s+(about|on|for)?\s*/gi, '')
            .trim();

        if (!topic) {
            throw new Error('No presentation topic provided');
        }

        console.log('[SLIDE_HANDLER] Topic:', topic);

        // Generate presentation structure
        const structure = await generatePresentationStructure(topic);

        // Create PowerPoint file
        const pptxBuffer = await createPresentation(structure);

        // Upload to Slack
        const filename = `${structure.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pptx`;
        await uploadFileToSlack(
            config.botToken,
            channel,
            filename,
            pptxBuffer,
            `📊 ${structure.title}`,
            threadTs
        );

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');

        console.log('[SLIDE_HANDLER] Slide creation complete');

    } catch (error) {
        console.error('[SLIDE_HANDLER] Error in handleSlideCreation:', error);

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
                text: `❌ Sorry, I encountered an error creating the slide deck: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }),
        });

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');
    }
}
