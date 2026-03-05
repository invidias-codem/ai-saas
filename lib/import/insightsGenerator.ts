
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getHighConfidenceFacts } from "@/lib/ragMemory";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export interface InsightsReport {
    topTopics: string[];
    userPreferences: string[];
    actionItems: string[];
    suggestedAutomations: {
        title: string;
        description: string;
        trigger: string;
    }[];
    generatedAt: string;
}

const INSIGHTS_PROMPT = `
You are an expert personal analyst "Genie". You have just imported a user's chat history and extracted valid facts/memories.
Your goal is to generate a "Day 1 Insights Report" to show the user you understand them and provide immediate value.

Analyze the provided facts and generate a JSON report with:
1. **topTopics**: 3-5 recurring themes or projects the user cares about.
2. **userPreferences**: 3-5 specific preferences (coding style, tone, format, tools) you found.
3. **actionItems**: 3-5 open loops, unfinished tasks, or decisions that seem pending (based on the context).
4. **suggestedAutomations**: 2-3 workflow automations that could help them (e.g., "Daily standup summary", "PR review check").

Output ONLY valid JSON in this format:
{
  "topTopics": ["Topic 1", "Topic 2"],
  "userPreferences": ["Pref 1", "Pref 2"],
  "actionItems": ["Task 1", "Task 2"],
  "suggestedAutomations": [
    { "title": "Auto-Summary", "description": "Summarize my PRs", "trigger": "When I open a PR" }
  ]
}
`;

export async function generateImportInsights(userId: string): Promise<InsightsReport> {
    try {
        // 1. Fetch recent facts/memories (limit to last 100 or so to fit context)
        // We could filter by "imported" metadata if we had it, but mostly we just want what we know about them now.
        const facts = await getHighConfidenceFacts(userId);

        // If no specific "imported" flag, we just take the most relevant/recent.
        // For a fresh import, these ARE the facts.
        const recentFacts = facts.slice(0, 50).map(f => f.content).join("\n- ");

        if (!recentFacts) {
            return {
                topTopics: [],
                userPreferences: [],
                actionItems: [],
                suggestedAutomations: [],
                generatedAt: new Date().toISOString()
            };
        }

        // 2. Call LLM
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
        const result = await model.generateContent([
            { text: INSIGHTS_PROMPT },
            { text: `\n\nUSER FACTS:\n${recentFacts}\n\nJSON REPORT:` }
        ]);

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error("Failed to parse insights JSON");
        }

        const report = JSON.parse(jsonMatch[0]) as InsightsReport;
        report.generatedAt = new Date().toISOString();

        return report;

    } catch (error) {
        console.error("Error generating insights:", error);
        // Return empty report on failure rather than crashing
        return {
            topTopics: [],
            userPreferences: [],
            actionItems: [],
            suggestedAutomations: [],
            generatedAt: new Date().toISOString()
        };
    }
}
