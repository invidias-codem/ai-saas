import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Generate content using the available LLM provider.
 * Prioritizes Anthropic if ANTHROPIC_API_KEY is present, otherwise falls back to Gemini.
 * 
 * @param {string} systemPrompt - The system instructions
 * @param {string} userPrompt - The user's input
 * @param {object} options - Options like temperature, maxTokens, jsonMode
 * @returns {Promise<string>} - The model's response
 */
export async function generateContent(systemPrompt, userPrompt, options = {}) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GOOGLE_API_KEY;

    // Use Anthropic if available (and preferred by user request)
    if (anthropicKey) {
        try {
            console.log('🤖 Using Provider: Anthropic Claude 3.5 Sonnet');
            const anthropic = new Anthropic({ apiKey: anthropicKey });

            const message = await anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature || 0.7,
                system: systemPrompt,
                messages: [
                    { role: "user", content: userPrompt }
                ]
            });

            return message.content[0].text;
        } catch (e) {
            console.error('❌ Anthropic Error:', e.message);
            if (!geminiKey) throw e;
            console.log('⚠️ Falling back to Gemini...');
        }
    }

    // Fallback to Gemini
    if (geminiKey) {
        console.log('✨ Using Provider: Google Gemini 2.0 Flash');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite-preview",
            generationConfig: {
                responseMimeType: options.jsonMode ? "application/json" : "text/plain"
            }
        });

        // Gemini doesn't strictly separate system prompt in the same way for all models, 
        // but 1.5+ supports systemInstruction.
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: systemPrompt }] },
                { role: "model", parts: [{ text: "Understood." }] }
            ]
        });

        const result = await chat.sendMessage(userPrompt);
        return result.response.text();
    }

    throw new Error('No valid API keys found (ANTHROPIC_API_KEY or GOOGLE_API_KEY)');
}
