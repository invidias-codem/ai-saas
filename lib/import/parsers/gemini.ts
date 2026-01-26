import {
    GenieUniversalImport,
    ImportedConversation,
    ImportedMessage,
    PlatformParser,
    SupportedPlatform,
    Role
} from '@/lib/types/imports';

// Gemini exports from Takeout can be messy (HTML or JSON). 
// This assumes a JSON structure if available, or a generic conversational structure.
interface GeminiConversation {
    title?: string;
    conversationId?: string;
    createdTime?: string;
    messages?: GeminiMessage[];
    // Takeout specific fields might vary
    [key: string]: any;
}

interface GeminiMessage {
    author?: string; // 'user' | 'model'
    content?: string;
    timestamp?: string;
    [key: string]: any;
}

export class GeminiParser implements PlatformParser {
    platform: SupportedPlatform = 'gemini';

    validateFormat(data: unknown): boolean {
        // Generic check for Gemini/Takeout like structure
        // Often comes as a list of conversations
        if (Array.isArray(data)) {
            const first = data[0];
            // Check for common fields in Gemini headers or messages
            // This is a "best guess" validation since Takeout formats change
            if (first && typeof first === 'object') {
                if ('conversationId' in first || 'conversations' in first) return true;
                // Or if it matches our basic message structure
                if (first.messages && Array.isArray(first.messages)) return true;
            }
        }
        return false;
    }

    parse(data: unknown): GenieUniversalImport {
        const rawConvs = Array.isArray(data) ? data : [data];
        const conversations: ImportedConversation[] = [];

        for (const raw of rawConvs) {
            try {
                conversations.push(this.parseConversation(raw));
            } catch (e) {
                console.warn('Failed to parse Gemini conversation:', e);
            }
        }

        return {
            version: "1.0",
            source: 'gemini',
            exportedAt: new Date().toISOString(),
            conversations
        };
    }

    private parseConversation(raw: GeminiConversation): ImportedConversation {
        const messages = (raw.messages || []).map(m => this.parseMessage(m));

        return {
            externalId: raw.conversationId,
            title: raw.title || 'Gemini Conversation',
            createdAt: raw.createdTime || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages
        };
    }

    private parseMessage(msg: GeminiMessage): ImportedMessage {
        // Map 'model' to 'assistant'
        let role: Role = 'user';
        if (msg.author === 'model' || msg.author === 'assistant') role = 'assistant';

        const hasTimestamp = Boolean(msg.timestamp);
        return {
            role,
            content: msg.content || '',
            timestamp: msg.timestamp || '',
            ...(hasTimestamp ? {} : { metadata: { timestampUnknown: true } })
        };
    }
}
