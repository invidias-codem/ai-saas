import {
    GenieUniversalImport,
    ImportedConversation,
    ImportedMessage,
    PlatformParser,
    SupportedPlatform,
    Role
} from '@/lib/types/imports';

// --- Anthropic Internal Types (Reverse Engineered) ---
// Note: Anthropic exports are less standardized publicly, but typically follow a structure like this:

interface AnthropicExport {
    // Sometimes it's a list of conversations directly, sometimes wrapped
    conversations?: AnthropicConversation[];
    // Or just an array
    [key: number]: AnthropicConversation;
}

interface AnthropicConversation {
    uuid: string;
    name: string;
    created_at: string;
    updated_at: string;
    chat_messages: AnthropicMessage[];
}

interface AnthropicMessage {
    uuid: string;
    sender: 'human' | 'assistant';
    text: string;
    created_at: string;
    updated_at: string;
    attachments?: any[]; // Usually empty in JSON exports, but we can check
}

// --- Parser Implementation ---

export class AnthropicParser implements PlatformParser {
    platform: SupportedPlatform = 'anthropic';

    validateFormat(data: unknown): boolean {
        // Anthropic exports are usually an array of conversations.
        // Let's check for standard fields: uuid, chat_messages, name
        if (Array.isArray(data)) {
            const firstItem = data[0];
            if (!firstItem || typeof firstItem !== 'object') return false;
            return 'uuid' in firstItem && 'chat_messages' in firstItem;
        }
        return false;
    }

    parse(data: unknown): GenieUniversalImport {
        const rawConvs = data as AnthropicConversation[];
        const conversations: ImportedConversation[] = [];

        for (const raw of rawConvs) {
            try {
                conversations.push(this.parseConversation(raw));
            } catch (e) {
                console.warn(`Failed to parse Anthropic conversation ${raw.uuid}:`, e);
            }
        }

        return {
            version: "1.0",
            source: 'anthropic',
            exportedAt: new Date().toISOString(),
            conversations
        };
    }

    private parseConversation(raw: AnthropicConversation): ImportedConversation {
        return {
            externalId: raw.uuid,
            title: raw.name || 'Untitled Chat',
            createdAt: raw.created_at, // usually ISO string already
            updatedAt: raw.updated_at,
            messages: raw.chat_messages.map(msg => this.parseMessage(msg))
        };
    }

    private parseMessage(msg: AnthropicMessage): ImportedMessage {
        const role = msg.sender === 'human' ? 'user' : 'assistant';

        // Anthropic text usually plain string in 'text' field
        let content = msg.text || '';

        return {
            role,
            content,
            timestamp: msg.created_at
        };
    }
}
