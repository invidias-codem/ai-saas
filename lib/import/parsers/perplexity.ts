import {
    GenieUniversalImport,
    ImportedConversation,
    ImportedMessage,
    PlatformParser,
    SupportedPlatform,
    Role
} from '@/lib/types/imports';

interface PerplexityThread {
    link?: string;
    title?: string; // Often implied or extracted
    messages: PerplexityMessage[];
}

interface PerplexityMessage {
    role: string;
    content: string;
    // Perplexity Citations usually appended
}

export class PerplexityParser implements PlatformParser {
    platform: SupportedPlatform = 'perplexity';

    validateFormat(data: unknown): boolean {
        // Perplexity often doesn't have an official export. 
        // This validates against common "community scraper" formats which usually have 'link' and 'messages'
        if (Array.isArray(data)) {
            const first = data[0];
            if (first && typeof first === 'object') {
                return 'messages' in first && ('link' in first || 'query' in first);
            }
        }
        return false;
    }

    parse(data: unknown): GenieUniversalImport {
        const threads = Array.isArray(data) ? data : [data];
        const conversations: ImportedConversation[] = [];

        for (const thread of threads) {
            try {
                conversations.push(this.parseThread(thread));
            } catch (e) {
                console.warn('Failed to parse Perplexity thread:', e);
            }
        }

        return {
            version: "1.0",
            source: 'perplexity',
            exportedAt: new Date().toISOString(),
            conversations
        };
    }

    private parseThread(raw: PerplexityThread): ImportedConversation {
        return {
            title: raw.title || 'Perplexity Search',
            createdAt: new Date().toISOString(), // Timestamps often missing in PPLX scrapers
            updatedAt: new Date().toISOString(),
            messages: (raw.messages || []).map(m => ({
                role: m.role as Role, // usually 'user' | 'assistant'
                content: m.content || '',
                timestamp: new Date().toISOString()
            })),
            metadata: {
                originalLink: raw.link
            }
        };
    }
}
