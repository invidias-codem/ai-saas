
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getHighConfidenceFacts } from "@/lib/ragMemory";
// import { Resend } from 'resend'; // Converted to dynamic import
import { DailyBriefingEmail } from "@/components/email-templates/DailyBriefing";
import { supabaseAdmin } from "@/lib/supabaseClient";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
// Resend initialized lazily to avoid build-time errors if key is missing

interface DigestContent {
    highlights: string[];
    actionItems: string[];
    focusSuggestion: string;
    quote: string;
}

const DIGEST_PROMPT = `
You are a helpful personal executive assistant. 
Your goal is to generate a "Daily Morning Briefing" for the user based on their recent memories and facts.

INPUT FACTS:
{FACTS}

INSTRUCTIONS:
1. Analyze the provided facts (which represent recent user activity, decisions, and knowledge).
2. Extract 3-5 "Key Highlights" from yesterday/recent interactions.
3. Identify any "Action Items" or "Open Loops" that need attention.
4. Suggest a "Main Focus" for today based on the context.
5. Select a motivational or relevant quote (can be famous or constructed based on their style).

OUTPUT RESULT (JSON format):
{
  "highlights": ["..."],
  "actionItems": ["..."],
  "focusSuggestion": "...",
  "quote": "..."
}
`;

export async function generateDailyDigest(userId: string, userEmail: string, userName?: string) {
    console.log(`[DigestService] Generating digest for user ${userId}`);

    try {
        // 0. Check User Preferences (Opt-in)
        if (supabaseAdmin) {
            const { data: settings } = await supabaseAdmin
                .from('user_settings')
                .select('daily_digest_enabled')
                .eq('user_id', userId)
                .single();

            if (settings && settings.daily_digest_enabled === false) {
                console.log(`[DigestService] User ${userId} has opted out of daily digests.`);
                return;
            }
            // If no settings found, default to TRUE for now (Growth) or FALSE (Strict Opt-in)
            // Let's assume Default TRUE for this MVP unless explicitly set to false
        }

        // 1. Fetch Context
        const facts = await getHighConfidenceFacts(userId, 50); // Get last 50 facts
        if (facts.length === 0) {
            console.log(`[DigestService] No facts found for user ${userId}, skipping digest.`);
            return;
        }

        const factsText = facts.map(f => `- [${f.type}] ${f.content}`).join('\n');

        // 2. Generate Content
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(
            DIGEST_PROMPT.replace('{FACTS}', factsText)
        );

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error("Failed to parse digest JSON");
        }

        const content = JSON.parse(jsonMatch[0]) as DigestContent;

        // 3. Send Email
        if (!userEmail) {
            console.error(`[DigestService] No email for user ${userId}`);
            return;
        }

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.warn('[DigestService] RESEND_API_KEY is missing. Skipping email send.');
            return;
        }

        const { Resend } = await import('resend');
        const resend = new Resend(apiKey);

        const { data, error } = await resend.emails.send({
            from: 'Genie <digest@gen1e.xyz>', // Update with verified domain
            to: [userEmail],
            subject: `Your Morning Briefing - ${new Date().toLocaleDateString()}`,
            react: DailyBriefingEmail({
                userName: userName || 'User',
                highlights: content.highlights,
                actionItems: content.actionItems,
                focusSuggestion: content.focusSuggestion,
                quote: content.quote,
            }) as React.ReactElement,
        });

        if (error) {
            console.error('[DigestService] Resend Error:', error);
            throw error;
        }

        console.log(`[DigestService] Digest sent to ${userEmail} (ID: ${data?.id})`);
        return data;

    } catch (error) {
        console.error(`[DigestService] Failed to generate/send digest for ${userId}:`, error);
        throw error;
    }
}
