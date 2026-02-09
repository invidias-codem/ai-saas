
import { storeMemory, searchMemories, deleteMemory } from '@/lib/memory/vectorStore';
import { IntentClassification } from '../intentRouter';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const SLACK_API_BASE = 'https://slack.com/api';

interface SlackConfig {
    botToken: string;
    channelId: string;
    userId: string;
}

export async function handleMemoryOperation(
    config: SlackConfig,
    event: any,
    userMessage: string,
    extractedInfo?: IntentClassification['extractedInfo']
) {
    // Helper to send message
    const postMessage = async (text: string) => {
        try {
            await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.botToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    channel: config.channelId,
                    text: text,
                    thread_ts: event.ts
                }),
            });
        } catch (e) {
            console.error("Error sending Slack message:", e);
        }
    };

    // Default to SAVE if action not specific.
    const action = extractedInfo?.memoryAction || 'SAVE';
    const content = extractedInfo?.memoryContent || userMessage;
    const userId = config.userId;

    try {
        await postMessage(`🧠 Processing memory request: *${action}*...`);

        if (action === 'SAVE') {
            await storeMemory(userId, content, 'fact', { source: 'slack' });
            await postMessage(`✅ I've saved that to your memory bank: "${content}"`);
        }
        else if (action === 'FORGET') {
            const memories = await searchMemories(userId, content, 5);
            if (memories.length === 0) {
                await postMessage(`🤔 I couldn't find any memories matching "${content}" to forget.`);
                return;
            }

            const topMatch = memories[0];
            const similarity = topMatch.similarity ?? 0;
            if (similarity > 0.8) {
                await deleteMemory(topMatch.id, userId);
                await postMessage(`🗑️ I've forgotten: "${topMatch.content}" (${Math.round(similarity * 100)}% match)`);
            } else {
                await postMessage(`I found a few similar memories but wasn't sure which one to delete. Please be more specific:\n${memories.map(m => `- ${m.content}`).join('\n')}`);
            }
        }
        else if (action === 'QUERY') {
            const memories = await searchMemories(userId, content, 5);
            if (memories.length === 0) {
                await postMessage(`I don't recall anything about "${content}".`);
            } else {
                const context = memories.map(m => `- ${m.content}`).join('\n');

                try {
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const prompt = `You are a helpful memory assistant. Answer the user's question based strictly on the provided context.
                    
Context:
${context}

User Question: ${userMessage}`;

                    const result = await model.generateContent(prompt);
                    const answer = result.response.text();

                    await postMessage(answer || "Here is what I found:\n" + context);
                } catch (e) {
                    console.error("Gemini generation error:", e);
                    await postMessage("Here is what I found:\n" + context);
                }
            }
        }

    } catch (error) {
        console.error("Error handling memory operation:", error);
        await postMessage("❌ Sorry, I encountered an error while accessing your memory.");
    }
}
