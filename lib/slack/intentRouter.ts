/**
 * Intent Router for Slack Messages
 * Classifies user intent and routes to appropriate handler
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export type UserIntent = 'IMAGE' | 'SLIDES' | 'CALENDAR' | 'MEMORY' | 'CHAT';

export interface IntentClassification {
    intent: UserIntent;
    confidence: number;
    extractedInfo?: {
        imagePrompt?: string;
        slideTopic?: string;
        meetingDetails?: {
            title?: string;
            attendees?: string[];
            datetime?: string;
            duration?: string;
        };
        memoryAction?: 'SAVE' | 'FORGET' | 'QUERY';
        memoryContent?: string;
    };
}


const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

const INTENT_CLASSIFIER_PROMPT = `You are an intent classifier for a Slack bot. Analyze the user's message and classify it into ONE of these intents:

1. IMAGE - User wants to generate, create, or edit an image/picture/photo/drawing/logo/icon/GIF
2. SLIDES - User wants to create a slide deck, presentation, PowerPoint, or PPTX
3. CALENDAR - User wants to schedule a meeting, create an event, or set up a calendar invite
4. MEMORY - User explicitly asks to remember, forget, or recall information about themselves or the project (e.g., "remember my ID", "forget that", "what do you know about X")
5. CHAT - General conversation, questions, or requests that don't fit the above

Respond ONLY with valid JSON in this exact format:
{
"intent": "IMAGE" | "SLIDES" | "CALENDAR" | "MEMORY" | "CHAT",
  "confidence": 0.0-1.0,
  "extractedInfo": {
    // For IMAGE: include "imagePrompt"
    // For SLIDES: include "slideTopic"
    // For CALENDAR: include "meetingDetails" with title, attendees, datetime, duration
    // For MEMORY: include "memoryAction" ("SAVE", "FORGET", "QUERY") and "memoryContent" (the key info)
  }
}

Examples:
- "generate an image of a cat" -> {"intent": "IMAGE", "confidence": 0.95, "extractedInfo": {"imagePrompt": "a cat"}}
- "make a slide deck about AI" -> {"intent": "SLIDES", "confidence": 0.9, "extractedInfo": {"slideTopic": "AI"}}
- "schedule a meeting with john@example.com tomorrow at 2pm" -> {"intent": "CALENDAR", "confidence": 0.85, "extractedInfo": {"meetingDetails": {"attendees": ["john@example.com"], "datetime": "tomorrow at 2pm"}}}
- "remember that I prefer dark mode" -> {"intent": "MEMORY", "confidence": 0.95, "extractedInfo": {"memoryAction": "SAVE", "memoryContent": "User prefers dark mode"}}
- "forget about the secret project" -> {"intent": "MEMORY", "confidence": 0.9, "extractedInfo": {"memoryAction": "FORGET", "memoryContent": "the secret project"}}
- "what do you recall about my team?" -> {"intent": "MEMORY", "confidence": 0.9, "extractedInfo": {"memoryAction": "QUERY", "memoryContent": "my team"}}
- "what is the weather?" -> {"intent": "CHAT", "confidence": 0.8}`;

/**
 * Classify user intent using Gemini
 */
export async function classifyIntent(userMessage: string): Promise<IntentClassification> {
    try {
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview" });

        const result = await model.generateContent([
            { text: INTENT_CLASSIFIER_PROMPT },
            { text: `\n\nUser message: "${userMessage}"\n\nClassification:` }
        ]);

        const responseText = result.response.text().trim();

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[INTENT_ROUTER] No JSON found in response:', responseText);
            return { intent: 'CHAT', confidence: 0.5 };
        }

        const classification = JSON.parse(jsonMatch[0]) as IntentClassification;

        console.log('[INTENT_ROUTER] Classification:', classification);
        return classification;

    } catch (error) {
        console.error('[INTENT_ROUTER] Error classifying intent:', error);
        // Default to CHAT on error
        return { intent: 'CHAT', confidence: 0.5 };
    }
}

/**
 * Route message to appropriate handler based on intent
 */
export async function routeMessage(
    intent: UserIntent,
    userMessage: string,
    config: any,
    event: any,
    extractedInfo?: IntentClassification['extractedInfo']
): Promise<void> {
    console.log(`[INTENT_ROUTER] Routing to ${intent} handler`);

    switch (intent) {
        case 'IMAGE':
            const { handleImageGeneration } = await import('@/lib/slack/handlers/imageHandler');
            await handleImageGeneration(config, event, userMessage, extractedInfo);
            break;

        case 'SLIDES':
            const { handleSlideCreation } = await import('@/lib/slack/handlers/slideHandler');
            await handleSlideCreation(config, event, userMessage);
            break;

        case 'CALENDAR':
            const { handleCalendarEvent } = await import('@/lib/slack/handlers/calendarHandler');
            await handleCalendarEvent(config, event, userMessage);
            break;

        case 'MEMORY':
            const { handleMemoryOperation } = await import('@/lib/slack/handlers/memoryHandler');
            await handleMemoryOperation(config, event, userMessage, extractedInfo);
            break;

        case 'CHAT':
        default:
            // Fallback to existing chat logic (handled by caller)
            console.log('[INTENT_ROUTER] Using default CHAT handler');
            break;
    }
}
