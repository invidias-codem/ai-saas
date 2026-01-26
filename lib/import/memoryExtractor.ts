import {
    GenieUniversalImport,
    ImportedConversation,
    ImportedMessage,
    ExtractedFact,
    CommunicationProfile,
    ImportedPreferences
} from "@/lib/types/imports";

interface ExtractionOptions {
    confidenceThreshold?: number; // default 0.7
    maxFacts?: number; // limit per import
}

export type ExtractedKnowledge = {
    facts: ExtractedFact[];
    profile: CommunicationProfile;
    topics: string[];
    preferences: ImportedPreferences;
};

// Regex patterns for fact extraction
const FACT_PATTERNS = {
    personal_info: [
        /my name is\s+([^,.]+)/i,
        /i am\s+(?:a|an)\s+([^,.]+)/i,
        /i work (?:at|for|as)\s+([^,.]+)/i,
        /i live in\s+([^,.]+)/i,
        /i'm\s+(?:a|an)\s+([^,.]+)/i,
    ],
    preference: [
        /i (?:like|love|prefer|enjoy)\s+([^,.]+)/i,
        /my favorite\s+([^,.]+)\s+is\s+([^,.]+)/i,
        /i always\s+([^,.]+)/i,
        /i don't like\s+([^,.]+)/i,
        /i hate\s+([^,.]+)/i,
    ],
    decision: [
        /i(?:'ve)? decided to\s+([^,.]+)/i,
        /we(?:'ve)? agreed to\s+([^,.]+)/i,
        /the plan is to\s+([^,.]+)/i,
    ],
    action_item: [
        /i need to\s+([^,.]+)/i,
        /i should\s+([^,.]+)/i,
        /remind me to\s+([^,.]+)/i,
        /todo:\s*([^,.]+)/i,
    ],
};

// Pre-compile simple patterns if they were strings, but they are already RegExp objects in JS.
// However, compiling this structure into a flat list helps iteration.
const COMPILED_PATTERNS = Object.entries(FACT_PATTERNS).map(([type, patterns]) => ({
    type: type as ExtractedFact['type'],
    patterns
}));

// Main function to orchestrate knowledge extraction
export async function extractKnowledgeFromImport(
    importData: GenieUniversalImport,
    options: ExtractionOptions = {}
): Promise<ExtractedKnowledge> {
    const { conversations } = importData;
    const confidenceThreshold = options.confidenceThreshold || 0.6; // Slightly lower for regex hits

    const allFacts: ExtractedFact[] = [];

    // We process all conversations
    conversations.forEach(conv => {
        // filter for user messages only
        const userMessages = conv.messages.filter(m => m.role === 'user');

        userMessages.forEach((msg, idx) => {
            const processingFacts = extractFactsFromText(msg.content);

            // Enrich with metadata
            const enrichedFacts = processingFacts.map(fact => ({
                ...fact,
                sourceConversationId: conv.externalId,
                sourceMessageIndex: idx,
                extractedAt: new Date().toISOString()
            }));

            allFacts.push(...enrichedFacts);
        });
    });

    // Build profile
    const profile = buildCommunicationProfile(conversations);
    const topics = detectTopics(conversations);

    // Extract explicit preferences (subset of facts)
    const preferences: ImportedPreferences = {
        communicationStyle: profile.style,
        customInstructions: allFacts
            .filter(f => f.type === 'preference')
            .map(f => f.content)
            .join('; ')
    };

    return {
        facts: allFacts.filter(f => f.confidence >= confidenceThreshold),
        profile,
        topics,
        preferences
    };
}

function extractFactsFromText(text: string): Omit<ExtractedFact, 'extractedAt'>[] {
    const facts: Omit<ExtractedFact, 'extractedAt'>[] = [];
    const seenContent = new Set<string>();

    for (const { type, patterns } of COMPILED_PATTERNS) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const content = match[1].trim();
                // Deduplicate within same message
                if (content.length > 3 && content.length < 100 && !seenContent.has(content)) {
                    seenContent.add(content);
                    facts.push({
                        type,
                        content,
                        confidence: 0.75
                    });
                }
            }
        }
    }

    return facts;
}

export function buildCommunicationProfile(conversations: ImportedConversation[]): CommunicationProfile {
    let totalLength = 0;
    let userMsgCount = 0;
    let styleScores = {
        casual: 0,
        professional: 0,
        technical: 0
    };

    conversations.forEach(conv => {
        conv.messages.forEach(msg => {
            if (msg.role === 'user') {
                totalLength += msg.content.length;
                userMsgCount++;

                // Simple keyword analysis for style
                const lower = msg.content.toLowerCase();
                if (lower.match(/\b(lol|haha|thanks|cool|yeah)\b/)) styleScores.casual++;
                if (lower.match(/\b(please|kindly|regards|sincerely)\b/)) styleScores.professional++;
                if (lower.match(/\b(code|function|api|server|database|react|typescript)\b/)) styleScores.technical++;
            }
        });
    });

    const avgMessageLength = userMsgCount > 0 ? totalLength / userMsgCount : 0;

    // Determine primary style
    let style: CommunicationProfile['style'] = 'balanced';
    if (styleScores.technical > styleScores.casual && styleScores.technical > styleScores.professional) style = 'technical';
    else if (styleScores.professional > styleScores.casual) style = 'professional';
    else if (styleScores.casual > styleScores.professional) style = 'casual';

    let preferredDepth: CommunicationProfile['preferredDepth'] = 'balanced';
    if (avgMessageLength < 50) preferredDepth = 'brief';
    if (avgMessageLength > 200) preferredDepth = 'detailed';

    return {
        style,
        preferredDepth,
        avgMessageLength: Math.round(avgMessageLength),
        topTopics: [], // Topic extraction requires more NLP/TF-IDF usually
        sentimentTrend: 0 // Placeholder
    };
}

export function detectTopics(conversations: ImportedConversation[]): string[] {
    // Very naive topic detection based on title keywords or frequency
    // In a real app, this would use TF-IDF or vector clustering
    const commonWords = new Map<string, number>();
    const stopWords = new Set(['the', 'and', 'to', 'of', 'a', 'in', 'is', 'that', 'for', 'it', 'with', 'as', 'was', 'on', 'at', 'by', 'an', 'be', 'this', 'which', 'or', 'from', 'but', 'not', 'are', 'what', 'how', 'why', 'can', 'you', 'my']);

    conversations.forEach(conv => {
        const titleWords = (conv.title || "").toLowerCase().split(/\W+/);
        titleWords.forEach(w => {
            if (w.length > 3 && !stopWords.has(w) && isNaN(Number(w))) {
                commonWords.set(w, (commonWords.get(w) || 0) + 1);
            }
        });
    });

    // Sort by frequency
    return Array.from(commonWords.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => e[0]);
}
