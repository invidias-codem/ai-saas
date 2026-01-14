/**
 * Slide Deck Creation Handler for Slack
 * Uses PptxGenJS to create PowerPoint presentations
 */

import PptxGenJS from "pptxgenjs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SlackConfig } from '@/lib/slack';
import { downloadSlackFile, extractFileContent, isSupportedFileType } from '@/lib/slack/fileHelpers';

const SLACK_API_BASE = 'https://slack.com/api';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// --- Theme Engine ---

interface SlideTheme {
    name: string;
    colors: {
        background: string;
        text: string;
        primary: string;
        secondary: string;
        accent: string;
    };
    fonts: {
        header: string;
        body: string;
    };
    layout: 'modern' | 'clean' | 'creative';
}

const THEMES: Record<string, SlideTheme> = {
    modernDark: {
        name: 'Modern Dark',
        colors: {
            background: '1A1A1A', // Dark Grey
            text: 'FFFFFF',       // White
            primary: '00D2FF',    // Cyan Neon
            secondary: '3A7BD5',  // Blue
            accent: 'FF0099',     // Pink Neon
        },
        fonts: { header: 'Arial', body: 'Arial' },
        layout: 'modern'
    },
    corporateClean: {
        name: 'Corporate Clean',
        colors: {
            background: 'FFFFFF', // White
            text: '333333',       // Dark Grey
            primary: '0056B3',    // Corporate Blue
            secondary: '6C757D',  // Grey
            accent: 'F8F9FA',     // Light Grey for sections
        },
        fonts: { header: 'Arial', body: 'Calibri' },
        layout: 'clean'
    },
    creativeVibrant: {
        name: 'Creative Vibrant',
        colors: {
            background: '2D0036', // Deep Purple
            text: 'FFFFFF',
            primary: 'FF4D4D',    // Red/Orange
            secondary: 'C70039',  // Deep Red
            accent: 'FFC300',     // Yellow
        },
        fonts: { header: 'Verdana', body: 'Verdana' },
        layout: 'creative'
    }
};

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
async function generatePresentationStructure(topic: string, fileContent?: string): Promise<PresentationStructure> {
    console.log('[SLIDE_HANDLER] Generating presentation structure for:', topic);
    if (fileContent) {
        console.log('[SLIDE_HANDLER] Using file content length:', fileContent.length);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    let prompt = `Create a professional presentation outline about "${topic}".`;

    if (fileContent) {
        prompt += `\n\nBase the presentation SPECIFICALLY on the following content:\n\n${fileContent.substring(0, 30000)}\n\n(Content truncated if too long)`;
    }

    prompt += `\n\nReturn ONLY valid JSON in this exact format:
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

    // Select a random theme
    const themeKeys = Object.keys(THEMES);
    const randomThemeKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
    const theme = THEMES[randomThemeKey];
    console.log('[SLIDE_HANDLER] Using theme:', theme.name);

    // Set presentation properties
    pptx.author = 'Genie AI';
    pptx.title = structure.title;
    pptx.subject = structure.subtitle || structure.title;
    pptx.layout = 'LAYOUT_16x9';

    // Title Slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: theme.colors.background };

    // Add decorative element for title slide
    if (theme.layout === 'modern' || theme.layout === 'creative') {
        titleSlide.addShape(pptx.ShapeType.rect, {
            x: 0, y: 0, w: '100%', h: 1.5,
            fill: { color: theme.colors.primary, transparency: 80 }
        });
    }

    titleSlide.addText(structure.title, {
        x: 0.5,
        y: 2.0,
        w: 9.0,
        h: 1.5,
        fontSize: 44,
        bold: true,
        color: theme.colors.primary,
        align: 'center',
        fontFace: theme.fonts.header
    });

    if (structure.subtitle) {
        titleSlide.addText(structure.subtitle, {
            x: 1.0,
            y: 3.5,
            w: 8.0,
            h: 0.8,
            fontSize: 24,
            color: theme.colors.text,
            align: 'center',
            fontFace: theme.fonts.body
        });
    }

    titleSlide.addText('Created by Genie AI', {
        x: 0.5,
        y: 6.5,
        w: 9.0,
        h: 0.5,
        fontSize: 14,
        color: theme.colors.secondary,
        align: 'center',
        italic: true,
        fontFace: theme.fonts.body
    });

    // Content Slides
    for (const slideContent of structure.slides) {
        const slide = pptx.addSlide();
        slide.background = { color: theme.colors.background };

        // Footer
        slide.addText(`Genie AI • ${structure.title}`, {
            x: 0.5, y: 7.0, w: '90%', h: 0.3,
            fontSize: 10, color: theme.colors.secondary,
            align: 'right', fontFace: theme.fonts.body
        });

        if (slideContent.layout === 'section') {
            // Section slide
            slide.background = { color: theme.colors.primary };

            // Decorative circle
            slide.addShape(pptx.ShapeType.ellipse, {
                x: 7.5, y: -1.5, w: 4.0, h: 4.0,
                fill: { color: theme.colors.accent, transparency: 70 }
            });

            slide.addText(slideContent.title, {
                x: 0.5,
                y: 2.5,
                w: 9.0,
                h: 1.5,
                fontSize: 48,
                bold: true,
                color: theme.colors.background, // Contrast
                align: 'center',
                fontFace: theme.fonts.header
            });
        } else {
            // Regular content slide

            // Header bar (accent)
            slide.addShape(pptx.ShapeType.rect, {
                x: 0.5, y: 0.5, w: 0.15, h: 0.8,
                fill: { color: theme.colors.accent }
            });

            // Title
            slide.addText(slideContent.title, {
                x: 0.8,
                y: 0.5,
                w: 8.5,
                h: 0.8,
                fontSize: 32,
                bold: true,
                color: theme.colors.primary,
                fontFace: theme.fonts.header
            });

            // Content
            if (slideContent.bullets && slideContent.bullets.length > 0) {
                slide.addText(slideContent.bullets.map(b => ({ text: b, options: { bullet: { type: 'bullet', color: theme.colors.accent } } })), {
                    x: 0.8,
                    y: 1.8,
                    w: 8.4,
                    h: 4.5,
                    fontSize: 20,
                    color: theme.colors.text,
                    lineSpacing: 28,
                    fontFace: theme.fonts.body,
                    paraSpaceBefore: 10
                });
            } else if (slideContent.content) {
                slide.addText(slideContent.content, {
                    x: 0.8,
                    y: 1.8,
                    w: 8.4,
                    h: 4.5,
                    fontSize: 20,
                    color: theme.colors.text,
                    fontFace: theme.fonts.body
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
        const formData = new URLSearchParams();
        formData.append('filename', filename);
        formData.append('length', fileBuffer.length.toString());

        const getUploadUrlResponse = await fetch(`${SLACK_API_BASE}/files.getUploadURLExternal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
        });

        const uploadUrlData = await getUploadUrlResponse.json();

        if (!uploadUrlData.ok) {
            console.error('[SLIDE_HANDLER] Failed to get upload URL:', uploadUrlData.error);
            console.error('[SLIDE_HANDLER] Full response:', JSON.stringify(uploadUrlData));
            console.error('[SLIDE_HANDLER] Request params:', { filename, length: fileBuffer.length });
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
            '📊 Creating your presentation...'
        );

        // --- Handle File Attachments ---
        let fileContext = '';
        if (event.files && event.files.length > 0) {
            console.log('[SLIDE_HANDLER] Found', event.files.length, 'attachments');
            await setLoadingStatus(
                config.botToken,
                channel,
                threadTs,
                '📄 Reading attached files...'
            );

            for (const file of event.files) {
                if (isSupportedFileType(file.filetype)) {
                    console.log('[SLIDE_HANDLER] Processing file:', file.name);
                    try {
                        const buffer = await downloadSlackFile(file.url_private_download, config.botToken);
                        const content = await extractFileContent(buffer, file.filetype, file.name);
                        fileContext += `\n--- File: ${file.name} ---\n${content}\n`;
                    } catch (err) {
                        console.error('[SLIDE_HANDLER] Failed to read file:', file.name, err);
                    }
                }
            }
        }

        // --- Extract Topic ---
        let topic = userMessage
            .replace(/(create|make|generate|build)\s+(a\s+)?(slide\s+deck|presentation|powerpoint|pptx)\s+(about|on|for)?\s*/gi, '')
            .trim();

        if (!topic && fileContext) {
            topic = "the provided documents";
            console.log('[SLIDE_HANDLER] Inferring topic from file content');
        }

        if (!topic && !fileContext) {
            throw new Error('No presentation topic or file provided');
        }

        console.log('[SLIDE_HANDLER] Topic:', topic);

        // Update status
        await setLoadingStatus(
            config.botToken,
            channel,
            threadTs,
            '🎨 Designing slides...'
        );

        // Generate presentation structure
        const structure = await generatePresentationStructure(topic, fileContext);

        // Create PowerPoint file
        const pptxBuffer = await createPresentation(structure);

        // Upload to Slack
        await setLoadingStatus(
            config.botToken,
            channel,
            threadTs,
            '📤 Uploading presentation...'
        );

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
